"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fittingSlots } from "@/lib/reserve";
import { notifyOwner } from "@/lib/notify/telegram";

type ActionResult = { error: string | null };

/**
 * The booking details the RPCs hand back on success, used to compose the owner's
 * Telegram notification. Fields are whichever apply to the booking type (rent
 * carries dates + payment method; fitting carries a date + time slot).
 */
type BookingSummary = {
  renter_name?: string;
  contact?: string;
  dress_name?: string;
  start_date?: string;
  end_date?: string;
  payment_method?: string;
  fitting_date?: string;
  fitting_time?: string;
  parking?: boolean;
};

/** "2026-07-25" → "Jul 25, 2026" for a compact, readable notification line. */
function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

/** Compose the plain-text Telegram message for a completed rent booking. */
function rentNotification(s: BookingSummary): string {
  const dates =
    s.start_date && s.end_date && s.end_date !== s.start_date
      ? `${fmtDate(s.start_date)} – ${fmtDate(s.end_date)}`
      : fmtDate(s.start_date);
  return [
    "🛍️ New RENT booking — payment submitted",
    `Dress: ${s.dress_name ?? "—"}`,
    `Customer: ${s.renter_name ?? "—"}`,
    `Contact: ${s.contact ?? "—"}`,
    `Dates: ${dates || "—"}`,
    `Paid via: ${s.payment_method ?? "—"}`,
    "",
    "Verify it in the admin › Bookings.",
  ].join("\n");
}

/** Compose the plain-text Telegram message for a new fitting booking. */
function fittingNotification(s: BookingSummary): string {
  return [
    "📏 New FITTING booking",
    `Dress: ${s.dress_name ?? "—"}`,
    `Customer: ${s.renter_name ?? "—"}`,
    `Contact: ${s.contact ?? "—"}`,
    `When: ${fmtDate(s.fitting_date)}${s.fitting_time ? ` · ${s.fitting_time}` : ""}`,
    s.parking ? "Parking: yes" : "Parking: no",
    "",
    "See it in the admin › Bookings.",
  ].join("\n");
}

/**
 * WHY WE VALIDATE THE UPLOAD PATH SHAPE
 * -------------------------------------
 * The browser uploads the customer's ID and payment proof to the private
 * `payment-proofs` bucket under a fixed shape — "ids/<uuid>.<ext>" and
 * "proofs/<uuid>.<ext>" (see rent-form.tsx / payment-step.tsx) — and hands the
 * resulting storage PATH to these actions to store on the booking. But that
 * path is just a client-supplied string, and the anon key is public, so a
 * direct caller could pass any value (e.g. another customer's file, or a path
 * outside the upload folders). We reject anything that isn't the expected
 * prefix + a randomUUID + a short image extension, so a booking can't be made
 * to point at an arbitrary storage object.
 */
function isValidUploadPath(prefix: "ids" | "proofs", path: string): boolean {
  // crypto.randomUUID() → 8-4-4-4-12 lowercase hex; the client lowercases the ext.
  const re = new RegExp(
    `^${prefix}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[a-z0-9]{1,5}$`,
  );
  return re.test(path);
}

/**
 * WHY THE HOLD IS TWO-PHASE (and why these are RPCs)
 * --------------------------------------------------
 * A rent reservation now HOLDS its dates the moment the customer commits to
 * paying ("Continue to payment"), then has a 10-minute window to submit proof.
 * That needs two writes — create the hold, then attach the payment — but anon
 * has no UPDATE grant on bookings. So both go through SECURITY DEFINER RPCs
 * (`create_rent_hold` / `attach_rent_payment`), which also let the Postgres
 * exclusion constraint `bookings_no_overlap` be the single source of truth for
 * "no two active rentals on the same dress+dates": the RPC just translates a
 * constraint violation into a friendly message. This replaces the old
 * check-then-insert (which had a race the comments flagged) with an atomic,
 * DB-guaranteed reservation.
 *
 * Fittings are unchanged — they still insert directly (no hold, no overlap
 * constraint; they have their own slot logic).
 */

/* ------------------------------- RENT ------------------------------- */

export type RentHoldInput = {
  /** Browser-generated UUID — makes create_rent_hold idempotent on retry. */
  bookingId: string;
  dressId: string;
  name: string;
  contact: string;
  address: string;
  /** Storage path of the uploaded ID in the private payment-proofs bucket. */
  idPath: string;
  /** Rental start date, ISO "YYYY-MM-DD", chosen on the calendar. */
  date: string;
  deliverTime: string;
  /** Accessory ids the customer ticked. */
  accessoryIds: string[];
};

export type CreateHoldResult = {
  error: string | null;
  /** Set when a clash blocked the hold, so the UI can tailor the message.
   *  "accessory" = a chosen add-on's last unit was just taken. */
  conflict?: "hold" | "reserved" | "gone" | "accessory";
  bookingId?: string;
  /** ISO timestamp the hold lapses (server clock). */
  holdExpiresAt?: string;
  /** Server "now" at creation — the countdown is (holdExpiresAt − serverNow). */
  serverNow?: string;
};

/**
 * Phase 1 — reserve the dates as a `hold` (11-min server expiry, 10-min UI
 * countdown). The RPC snapshots prices, re-checks availability, and inserts the
 * booking + accessory links atomically, or reports a clash.
 */
export async function createRentHold(
  input: RentHoldInput,
): Promise<CreateHoldResult> {
  const supabase = await createClient();

  const name = input.name.trim();
  const contact = input.contact.trim();
  const address = input.address.trim();
  if (!name || !contact || !address) {
    return { error: "Please fill in your name, contact number, and address." };
  }
  if (!input.date) return { error: "Please pick a rental date." };
  if (!input.deliverTime) return { error: "Please choose a delivery time." };
  if (!input.idPath || !isValidUploadPath("ids", input.idPath)) {
    return { error: "Please upload a valid ID." };
  }

  const { data, error } = await supabase.rpc("create_rent_hold", {
    p_booking_id: input.bookingId,
    p_dress_id: input.dressId,
    p_name: name,
    p_contact: contact,
    p_address: address,
    p_id_path: input.idPath,
    p_date: input.date,
    p_deliver_time: input.deliverTime,
    p_accessory_ids: input.accessoryIds,
  });
  if (error) {
    return { error: "Couldn't reserve the date. Please try again." };
  }

  const res = data as {
    ok: boolean;
    conflict?: "hold" | "reserved" | "gone" | "accessory";
    error?: string;
    booking_id?: string;
    hold_expires_at?: string;
    server_now?: string;
  };

  if (!res.ok) {
    if (res.conflict === "accessory") {
      return {
        error:
          "One of the add-ons you picked was just taken. Please go back, review your accessories, and try again.",
        conflict: "accessory",
      };
    }
    if (res.conflict === "reserved") {
      return {
        error:
          "Some of your selected dates were just reserved by another customer. Message us on social media and we'll double-check the dates for you.",
        conflict: "reserved",
      };
    }
    if (res.conflict === "hold") {
      return {
        error:
          "Someone is checking out on those dates right now. They have a few minutes to pay — please try again shortly, or pick another date.",
        conflict: "hold",
      };
    }
    if (res.conflict === "gone") {
      return {
        error: "That reservation is no longer active. Please start again.",
        conflict: "gone",
      };
    }
    // Field/validation problems (the UI enforces these too).
    return { error: "Please check your details and try again." };
  }

  // The new hold now blocks its dates — refresh the collection page.
  revalidatePath("/");
  return {
    error: null,
    bookingId: res.booking_id,
    holdExpiresAt: res.hold_expires_at,
    serverNow: res.server_now,
  };
}

/**
 * Phase 2 — attach the payment channel + proof, turning the hold into a
 * `pending` booking for the admin to verify. Rejects if the hold already lapsed.
 */
export async function attachRentPayment(
  bookingId: string,
  paymentMethod: string,
  proofPath: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  if (!paymentMethod) return { error: "Please choose a payment option." };
  if (!proofPath || !isValidUploadPath("proofs", proofPath)) {
    return { error: "Please upload your payment proof." };
  }

  const { data, error } = await supabase.rpc("attach_rent_payment", {
    p_booking_id: bookingId,
    p_payment_method: paymentMethod,
    p_proof_path: proofPath,
  });
  if (error) return { error: "Couldn't submit your payment. Please try again." };

  const res = data as { ok: boolean; error?: string; summary?: BookingSummary };
  if (!res.ok) {
    if (res.error === "expired") {
      return {
        error:
          "Your hold expired before payment came through — please pick your date again.",
      };
    }
    return { error: "Couldn't submit your payment. Please try again." };
  }

  // Ping the owner on Telegram — best-effort, never awaited (see notifyOwner).
  // `summary` is present only on the fresh hold→pending transition, so a client
  // retry (already-pending) won't re-notify.
  if (res.summary) {
    void notifyOwner(rentNotification(res.summary));
  }

  revalidatePath("/");
  return { error: null };
}

/** Cancel a hold (explicit "Cancel reservation"), freeing the date now. */
export async function releaseRentHold(bookingId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("release_rent_hold", { p_booking_id: bookingId });
  revalidatePath("/");
}

/* ------------------------------ FITTING ----------------------------- */

export type FittingBookingInput = {
  dressId: string;
  name: string;
  contact: string;
  /** Fitting date, ISO "YYYY-MM-DD". */
  date: string;
  /** Chosen time slot, e.g. "4:00 PM". */
  time: string;
  parking: boolean;
  vehicle?: string;
  plate?: string;
};

export async function createFittingBooking(
  input: FittingBookingInput,
): Promise<ActionResult> {
  const supabase = await createClient();

  const name = input.name.trim();
  const contact = input.contact.trim();
  if (!name || !contact) {
    return { error: "Please fill in your name and contact number." };
  }
  if (!input.date) return { error: "Please pick a fitting date." };
  if (!input.time) return { error: "Please choose a time slot." };

  // The time must actually be one of the slots offered on that weekday/weekend.
  if (!fittingSlots(input.date).includes(input.time)) {
    return { error: "Please choose a valid time for that date." };
  }

  // Parking needs a plate number (vehicle defaults sensibly if omitted).
  const plate = input.plate?.trim() ?? "";
  if (input.parking && !plate) {
    return { error: "Please enter your plate number for parking." };
  }

  // The availability re-checks (blocked_dates day + booked_fitting_slots) and
  // the insert happen atomically inside create_fitting_booking, a SECURITY
  // DEFINER RPC — same reasoning as the rent RPCs above: it closes the old
  // check-then-insert race, snapshots the amount server-side, and lets us drop
  // the anon INSERT policy on bookings (audit §2). Anon has no direct write.
  const { data, error } = await supabase.rpc("create_fitting_booking", {
    p_dress_id: input.dressId,
    p_name: name,
    p_contact: contact,
    p_date: input.date,
    p_time: input.time,
    p_parking: input.parking,
    p_vehicle: input.vehicle ?? "", // RPC treats "" as the default ("Car")
    p_plate: plate,
  });
  if (error) return { error: "Couldn't book your fitting. Please try again." };

  const res = data as {
    ok: boolean;
    conflict?: "day" | "slot";
    error?: string;
    summary?: BookingSummary;
  };
  if (!res.ok) {
    if (res.conflict === "day") {
      return { error: "Sorry — that day is no longer open for fittings." };
    }
    if (res.conflict === "slot") {
      return {
        error: "Sorry — that time was just booked. Please pick another slot.",
      };
    }
    if (res.error === "dress_gone") {
      return { error: "That dress is no longer available." };
    }
    // Field problems (the UI enforces these too).
    return { error: "Please check your details and try again." };
  }

  // Ping the owner on Telegram — best-effort, never awaited (see notifyOwner).
  if (res.summary) {
    void notifyOwner(fittingNotification(res.summary));
  }

  // A new pending fitting occupies its slot — refresh so the page reflects it.
  revalidatePath("/");
  return { error: null };
}
