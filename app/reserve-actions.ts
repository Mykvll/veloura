"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDays, fittingSlots, FITTING_FEE, PARKING_FEE } from "@/lib/reserve";

type ActionResult = { error: string | null };

/**
 * WHY WE RE-CHECK ON THE SERVER
 * ------------------------------
 * The customer's calendar was drawn from `blocked_dates` fetched when the page
 * loaded. That snapshot can go stale: while they were filling in the form,
 * someone else may have reserved the same dress+date (or grabbed the same
 * fitting slot). So we never trust the date the browser sends — right before
 * inserting, we query the CURRENT state again and bail out if it's no longer
 * free. `blocked_dates` already encodes the business rule (rental days + the
 * end_date+1 wash day, for pending/verified rentals), so re-reading it is the
 * authoritative check.
 *
 * This is check-then-insert, not a single atomic operation, so a tiny race
 * window remains (two submits landing in the same instant). For this shop's
 * volume that's acceptable; if it ever matters, the fully safe version is a
 * Postgres exclusion constraint / a SECURITY DEFINER function that checks and
 * inserts inside one transaction.
 */

/* ------------------------------- RENT ------------------------------- */

export type RentBookingInput = {
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
  /** Chosen payment channel label, e.g. "GCash" (from the payment step). */
  paymentMethod: string;
  /** Storage path of the uploaded payment screenshot in payment-proofs. */
  proofPath: string;
};

export async function createRentBooking(
  input: RentBookingInput,
): Promise<ActionResult> {
  const supabase = await createClient();

  // Basic presence checks (the UI enforces these too, but never trust the UI).
  const name = input.name.trim();
  const contact = input.contact.trim();
  const address = input.address.trim();
  if (!name || !contact || !address) {
    return { error: "Please fill in your name, contact number, and address." };
  }
  if (!input.date) return { error: "Please pick a rental date." };
  if (!input.deliverTime) return { error: "Please choose a delivery time." };
  if (!input.idPath) return { error: "Please upload a valid ID." };
  if (!input.paymentMethod) return { error: "Please choose a payment option." };
  if (!input.proofPath) return { error: "Please upload your payment proof." };

  // Snapshot the dress from the DB — we store its name on the booking so the
  // record survives even if the dress is later renamed or deleted, and we take
  // the price from here (not the browser) to compute the amount.
  const { data: dress, error: dressErr } = await supabase
    .from("dresses")
    .select("id, name, price")
    .eq("id", input.dressId)
    .single();
  if (dressErr || !dress) {
    return { error: "That dress is no longer available." };
  }

  // A 2-day base rental (design rule): start = picked day, end = the next day.
  // The wash day (end + 1) is blocked automatically by the blocked_dates view.
  const start = input.date;
  const end = addDays(start, 1);
  const washDay = addDays(start, 2);

  // Re-check: is any day this booking would occupy (start, end, wash) already
  // blocked for THIS dress? If so, the calendar the customer saw was stale.
  const { data: clash, error: clashErr } = await supabase
    .from("blocked_dates")
    .select("blocked_day")
    .eq("dress_id", input.dressId)
    .gte("blocked_day", start)
    .lte("blocked_day", washDay)
    .limit(1);
  if (clashErr) return { error: "Couldn't confirm the date. Please try again." };
  if (clash && clash.length > 0) {
    return {
      error: "Sorry — those dates were just taken. Please pick another date.",
    };
  }

  // Snapshot each chosen accessory's CURRENT price (price_at_booking) from the
  // DB, so the record is immune to later price edits and to a tampered client.
  let accessoryRows: { id: string; price: number }[] = [];
  if (input.accessoryIds.length > 0) {
    const { data: accs, error: accErr } = await supabase
      .from("accessories")
      .select("id, price")
      .in("id", input.accessoryIds);
    if (accErr) return { error: "Couldn't load your accessories. Try again." };
    accessoryRows = accs ?? [];
  }
  const accessoriesTotal = accessoryRows.reduce((s, a) => s + a.price, 0);

  // Generate the booking id here rather than reading it back with a RETURNING
  // clause: anon can INSERT bookings but has NO SELECT policy on them (they're
  // admin-only, since they hold PII), so a `.select()` after insert would come
  // back empty. Owning the id up front lets us link accessories without a read.
  const bookingId = crypto.randomUUID();

  // Insert the booking as 'pending' (holds the date while admin verifies).
  const { error: insErr } = await supabase.from("bookings").insert({
    id: bookingId,
    type: "rent",
    payment_status: "pending",
    renter_name: name,
    contact,
    address,
    id_photo_url: input.idPath,
    dress_id: dress.id,
    dress_name: dress.name, // snapshot
    start_date: start,
    end_date: end,
    deliver_time: input.deliverTime,
    amount: dress.price + accessoriesTotal,
    payment_method: input.paymentMethod,
    proof_url: input.proofPath, // path in the private payment-proofs bucket
  });
  if (insErr) {
    return { error: "Couldn't save your reservation. Please try again." };
  }

  // Link the picked accessories, snapshotting the price at booking time.
  if (accessoryRows.length > 0) {
    const links = accessoryRows.map((a) => ({
      booking_id: bookingId,
      accessory_id: a.id,
      price_at_booking: a.price,
    }));
    const { error: linkErr } = await supabase
      .from("booking_accessories")
      .insert(links);
    if (linkErr) {
      // The booking is saved; only the add-ons failed to attach. Surface it so
      // the customer/admin can follow up rather than silently losing them.
      return {
        error:
          "Your date is reserved, but we couldn't attach the accessories. Please message us.",
      };
    }
  }

  // The new pending rental now blocks its dates — refresh the collection page.
  revalidatePath("/");
  return { error: null };
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
