"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { addDays } from "@/lib/reserve";

type ActionResult = { error: string | null };

/**
 * The data the "Add manual booking" modal sends us to save.
 *
 * A manual booking is a rental the admin takes herself (FB/IG/TikTok DMs,
 * walk-ins). It's a REAL booking in the bookings table — it blocks its dates
 * plus the wash day for customers via blocked_dates like any app booking —
 * but there's no proof upload (payment status is set directly), no contact,
 * and no date limits beyond "not on top of another customer's rental".
 */
export type ManualBookingInput = {
  dressId: string;
  renterName: string;
  /** Reserved range, ISO "YYYY-MM-DD" — past or future, admin's call. */
  startDate: string;
  endDate: string;
  /** true → 'verified' (counts as earned now); false → 'pending'. */
  paid: boolean;
  /** Set once the admin confirms displacing a clashing customer booking. */
  override?: boolean;
};

export type ManualBookingResult = {
  error: string | null;
  /** Present when the dates clash with a customer booking and `override` wasn't
   *  set. The modal shows a confirm dialog ("Overriding will displace their
   *  booking") and retries with override=true. */
  conflict?: { renter: string; status: string; count: number };
};

/** The server Supabase client type, derived so we don't import the generic. */
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * BOOKINGS & PAYMENTS — admin actions (admin.html → BookingsSection).
 *
 * The admin verifies payment proofs, flags fakes, or deletes a booking. All
 * three run on the server as the logged-in admin (the "admin manage/delete
 * bookings" RLS policies), and all three keep accessory STOCK in sync — the one
 * piece of real logic here.
 *
 * STOCK RULE (business rule 2): an accessory unit is "out" for the whole life of
 * an ACTIVE booking — payment_status in {hold, pending, verified}. The unit is
 * reserved the moment a customer HOLDS (create_rent_hold increments
 * accessories.rented; see supabase/accessory-hold.sql), NOT at verify. So verify
 * changes nothing here, and the admin side only ever needs to FREE units — when
 * a booking leaves the active set (invalid / refunded / deleted, or a hold the
 * manual-override displaces). `stock` now means units OWNED and is never touched
 * by the booking flow.
 */

/** The payment statuses during which an accessory unit is reserved (`rented`). */
const ACTIVE_HOLDING = ["hold", "pending", "verified"] as const;

/**
 * Free the accessory units a booking reserved: subtract 1 from each linked
 * accessory's `rented` (clamped at 0). Call this ONLY when a booking leaves the
 * active-holding set, and — for deletes — BEFORE the row is removed, since
 * booking_accessories cascades away with it. Fetch-then-write per accessory (the
 * same pragmatic, tiny-race approach the reserve flow uses; fine at this volume).
 */
async function freeAccessoriesForBooking(supabase: Supabase, bookingId: string) {
  const { data: links } = await supabase
    .from("booking_accessories")
    .select("accessory_id")
    .eq("booking_id", bookingId);

  for (const link of links ?? []) {
    if (!link.accessory_id) continue; // accessory deleted (link set null) — nothing to free
    const { data: acc } = await supabase
      .from("accessories")
      .select("rented")
      .eq("id", link.accessory_id)
      .single();
    if (!acc) continue;
    await supabase
      .from("accessories")
      .update({ rented: Math.max(0, (acc.rented ?? 0) - 1) })
      .eq("id", link.accessory_id);
  }
}

/** Read a booking's current payment status (or null if it's gone). */
async function currentStatus(
  supabase: Supabase,
  id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("bookings")
    .select("payment_status")
    .eq("id", id)
    .single();
  return data?.payment_status ?? null;
}

/**
 * Create one manual booking.
 *
 * Server-side clash rule (mirroring the modal's calendar): the range may not
 * overlap another active rental's START..END days for this dress — but wash
 * days (end + 1) are fine to book over: the admin hand-washes the dresses
 * herself and knows when they'll be ready. That's why this checks bookings
 * directly instead of blocked_dates, which bakes wash days in. Same
 * check-then-insert race caveat as the reserve flow — fine at this volume.
 */
export async function createManualBooking(
  input: ManualBookingInput,
): Promise<ManualBookingResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const renterName = input.renterName.trim();
  if (!renterName) return { error: "Please enter the renter's name." };
  if (!input.startDate || !input.endDate) {
    return { error: "Please pick the reserved dates." };
  }
  if (input.endDate < input.startDate) {
    return { error: "The end date can't be before the start date." };
  }

  // Snapshot the dress like the customer flow does: the name so the booking
  // survives a rename/delete, the price (not anything client-sent) as amount.
  const { data: dress, error: dressErr } = await supabase
    .from("dresses")
    .select("id, name, price")
    .eq("id", input.dressId)
    .single();
  if (dressErr || !dress) {
    return { error: "Please choose a dress from the catalogue." };
  }

  // Find ACTIVE bookings for this dress that would clash. "Active" now includes
  // live customer holds — the `bookings_no_overlap` exclusion constraint counts
  // them, so a manual booking over a hold must be resolved, not silently fail.
  // Overlap uses each row's occupied range: a manual booking occupies
  // [start, end+1) (no wash day — the admin washes); a customer rental occupies
  // [start, end+2) (through the wash day). Ranges [a1,a2) and [b1,b2) overlap iff
  // a1 < b2 AND b1 < a2.
  const candEnd = addDays(input.endDate, 1); // exclusive upper of the manual range
  const { data: activeRows, error: activeErr } = await supabase
    .from("bookings")
    .select("id, start_date, end_date, payment_status, renter_name, manual")
    .eq("dress_id", input.dressId)
    .eq("type", "rent")
    .in("payment_status", ["hold", "pending", "verified"]);
  if (activeErr) {
    return { error: "Couldn't confirm the dates. Please try again." };
  }

  const clashes = (activeRows ?? []).filter((b) => {
    if (!b.start_date || !b.end_date) return false;
    const bEnd = addDays(b.end_date, b.manual ? 1 : 2); // exclusive upper
    return input.startDate < bEnd && b.start_date < candEnd;
  });

  if (clashes.length > 0 && !input.override) {
    // Ask the admin to confirm the override before displacing anyone.
    const first = clashes[0];
    return {
      error: null,
      conflict: {
        renter: first.renter_name,
        status: first.payment_status,
        count: clashes.length,
      },
    };
  }

  // Override confirmed: displace each clashing customer booking first, so the
  // exclusion constraint permits the manual insert. Holds (unpaid) are dropped;
  // paid/awaiting ones become `refunded` (kept as a record; the admin settles
  // the refund off-app).
  for (const b of clashes) {
    // Every clash is active (hold/pending/verified), so each had accessory units
    // reserved — free them BEFORE the delete (links cascade) or the refund.
    await freeAccessoriesForBooking(supabase, b.id);
    if (b.payment_status === "hold") {
      await supabase.from("bookings").delete().eq("id", b.id);
    } else {
      await supabase
        .from("bookings")
        .update({ payment_status: "refunded" })
        .eq("id", b.id);
    }
  }

  const { error } = await supabase.from("bookings").insert({
    type: "rent",
    manual: true,
    payment_status: input.paid ? "verified" : "pending",
    renter_name: renterName,
    dress_id: dress.id,
    dress_name: dress.name, // snapshot
    start_date: input.startDate,
    end_date: input.endDate,
    amount: dress.price,
  });
  if (error) {
    // 23P01 = exclusion_violation: a booking slipped in between our check and
    // insert. Surface it plainly rather than as a raw DB error.
    if ((error as { code?: string }).code === "23P01") {
      return {
        error: "Those dates were just taken — please refresh and try again.",
      };
    }
    return { error: error.message };
  }

  // The new booking blocks its dates for customers too — refresh both sites.
  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}

/**
 * Mark a booking as refunded. Used both standalone (a refund the admin issues)
 * and by the manual-booking override when it displaces a paid customer. Keeps
 * the row as a record (badged "Refunded"), frees its dates (refunded is an
 * inactive status), and drops it out of revenue (analytics count verified only).
 * Frees the accessory units if the booking was still active.
 */
export async function markBookingRefunded(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const status = await currentStatus(supabase, id);
  if (status === null) return { error: "That booking no longer exists." };
  if (status === "refunded") return { error: null }; // already done

  // Free units before flipping status (a refunded booking no longer holds them).
  if (ACTIVE_HOLDING.includes(status as (typeof ACTIVE_HOLDING)[number])) {
    await freeAccessoriesForBooking(supabase, id);
  }

  const { error } = await supabase
    .from("bookings")
    .update({ payment_status: "refunded" })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}

/**
 * Verify a payment. Sets status to 'verified'. Accessory units are NOT touched
 * here: they were already reserved at hold time (create_rent_hold → rented+1)
 * and pending→verified both count as active, so nothing to adjust.
 */
export async function verifyBooking(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const status = await currentStatus(supabase, id);
  if (status === null) return { error: "That booking no longer exists." };
  if (status === "verified") return { error: null }; // already done

  const { error } = await supabase
    .from("bookings")
    .update({ payment_status: "verified" })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}

/**
 * Flag a booking's proof as invalid/fake. Frees any accessory units it held
 * (invalid is an inactive status). The UI only offers this for a pending
 * booking, but a verified one flagged later is handled the same way.
 */
export async function flagBookingInvalid(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const status = await currentStatus(supabase, id);
  if (status === null) return { error: "That booking no longer exists." };

  // Free units before flipping status (an invalid booking no longer holds them).
  if (ACTIVE_HOLDING.includes(status as (typeof ACTIVE_HOLDING)[number])) {
    await freeAccessoriesForBooking(supabase, id);
  }

  const { error } = await supabase
    .from("bookings")
    .update({ payment_status: "invalid" })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}

/**
 * Delete a booking. This frees its dates automatically — `blocked_dates` only
 * counts rows that still exist, so once the row is gone the calendar reopens
 * those days. If the booking was still active, free its accessory units BEFORE
 * deleting, since the `booking_accessories` links cascade away with the row.
 */
export async function deleteBooking(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  // Read status + the private-bucket file paths in one go, BEFORE the row is
  // gone — once deleted we can no longer learn which files belonged to it.
  const { data: booking } = await supabase
    .from("bookings")
    .select("payment_status, id_photo_url, proof_url")
    .eq("id", id)
    .single();
  if (!booking) return { error: null }; // already gone

  if (
    ACTIVE_HOLDING.includes(
      booking.payment_status as (typeof ACTIVE_HOLDING)[number],
    )
  ) {
    await freeAccessoriesForBooking(supabase, id);
  }

  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) return { error: error.message };

  // PII cleanup (business rule 3 / PH Data Privacy Act): remove the customer's
  // ID photo and payment proof from the private payment-proofs bucket now that
  // the booking is gone. Both columns store storage PATHS, not URLs. This runs
  // as the authenticated admin — see the "admin delete payment-proofs" storage
  // policy. Best-effort: the row is already deleted, so if the storage remove
  // fails we log it rather than failing (and re-orphaning) the whole action.
  const paths = [booking.id_photo_url, booking.proof_url].filter(
    (p): p is string => Boolean(p),
  );
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("payment-proofs")
      .remove(paths);
    if (storageError) {
      console.error(
        `deleteBooking: booking ${id} deleted but its files could not be removed:`,
        storageError.message,
      );
    }
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}
