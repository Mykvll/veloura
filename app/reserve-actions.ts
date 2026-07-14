"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fittingSlots, FITTING_FEE, PARKING_FEE } from "@/lib/reserve";

type ActionResult = { error: string | null };

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
  /** Set when a date clash blocked the hold, so the UI can tailor the message. */
  conflict?: "hold" | "reserved" | "gone";
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
  if (!input.idPath) return { error: "Please upload a valid ID." };

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
    conflict?: "hold" | "reserved" | "gone";
    error?: string;
    booking_id?: string;
    hold_expires_at?: string;
    server_now?: string;
  };

  if (!res.ok) {
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
  if (!proofPath) return { error: "Please upload your payment proof." };

  const { data, error } = await supabase.rpc("attach_rent_payment", {
    p_booking_id: bookingId,
    p_payment_method: paymentMethod,
    p_proof_path: proofPath,
  });
  if (error) return { error: "Couldn't submit your payment. Please try again." };

  const res = data as { ok: boolean; error?: string };
  if (!res.ok) {
    if (res.error === "expired") {
      return {
        error:
          "Your hold expired before payment came through — please pick your date again.",
      };
    }
    return { error: "Couldn't submit your payment. Please try again." };
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

  const { data: dress, error: dressErr } = await supabase
    .from("dresses")
    .select("id, name")
    .eq("id", input.dressId)
    .single();
  if (dressErr || !dress) {
    return { error: "That dress is no longer available." };
  }

  // Re-check 1: a fitting can't share a day with any rental hand-off, so the
  // date must not be blocked for ANY dress (business rule / FITTING calendar).
  const { data: dayClash, error: dayErr } = await supabase
    .from("blocked_dates")
    .select("blocked_day")
    .eq("blocked_day", input.date)
    .limit(1);
  if (dayErr) return { error: "Couldn't confirm the date. Please try again." };
  if (dayClash && dayClash.length > 0) {
    return { error: "Sorry — that day is no longer open for fittings." };
  }

  // Re-check 2: the specific time slot must still be free.
  const { data: slotClash, error: slotErr } = await supabase
    .from("booked_fitting_slots")
    .select("fitting_time")
    .eq("fitting_date", input.date)
    .eq("fitting_time", input.time)
    .limit(1);
  if (slotErr) return { error: "Couldn't confirm the time. Please try again." };
  if (slotClash && slotClash.length > 0) {
    return {
      error: "Sorry — that time was just booked. Please pick another slot.",
    };
  }

  const { error: insErr } = await supabase.from("bookings").insert({
    type: "fitting",
    payment_status: "pending",
    renter_name: name,
    contact,
    dress_id: dress.id,
    dress_name: dress.name, // snapshot
    fitting_date: input.date,
    fitting_time: input.time,
    parking: input.parking,
    vehicle: input.parking ? (input.vehicle ?? "Car") : null,
    plate: input.parking ? plate : null,
    amount: FITTING_FEE + (input.parking ? PARKING_FEE : 0),
  });
  if (insErr) {
    return { error: "Couldn't book your fitting. Please try again." };
  }

  // A new pending fitting occupies its slot — refresh so the page reflects it.
  revalidatePath("/");
  return { error: null };
}
