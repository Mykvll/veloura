"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { addDays } from "@/lib/reserve";
import { accessoryOccupiedRange } from "@/lib/accessories";

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
  /** Accessory ids going out with this rental. Recorded as booking_accessories
   *  so a walk-in's add-ons block those accessories for customers on these
   *  dates, exactly like an app booking does. */
  accessoryIds?: string[];
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
 * The admin verifies payment proofs, flags fakes, or deletes a booking. All run
 * on the server as the logged-in admin (the "admin manage/delete bookings" RLS
 * policies).
 *
 * ACCESSORY STOCK (business rule 2): there is NOTHING to keep in sync here.
 * Accessory availability is DATE-AWARE and DERIVED from the bookings themselves
 * (the `accessory_blocked_dates` view — an accessory is only "out" on the days
 * its active bookings cover). So creating, verifying, refunding, flagging, or
 * deleting a booking changes availability automatically via the booking rows;
 * no counter to increment or free. `stock` = units owned; `unavailable_units` =
 * units pulled from service (both admin-set); "out on rent today" is derived.
 */

/**
 * DATE-AWARE accessory guard for a manual booking over `start`..`end`.
 *
 * The admin side needs the same rule the customer side gets from
 * create_rent_hold: an accessory can go out on these dates only if a unit is
 * still free ON THOSE DAYS. For each chosen accessory we count how many ACTIVE
 * bookings already hold it on each day the new booking would occupy (rental
 * days + the wash day, via accessoryOccupiedRange); if any single day is
 * already at capacity (stock − unavailable_units) the accessory can't go out.
 *
 * `excludeBookingIds` are the bookings an override is about to displace — they
 * release their accessories, so they must not count against the new booking.
 *
 * Computed here in TS rather than in SQL: this mirrors the existing dress clash
 * check in createManualBooking and carries the same check-then-insert caveat,
 * which is fine for a single admin at this volume.
 *
 * Returns the NAME of the first accessory that can't go out, or null if all are
 * free.
 */
async function accessoryClashForRange(
  supabase: Supabase,
  accessoryIds: string[],
  start: string,
  end: string,
  excludeBookingIds: string[],
): Promise<string | null> {
  if (accessoryIds.length === 0) return null;

  const { data: accRows } = await supabase
    .from("accessories")
    .select("id, name, stock, unavailable_units")
    .in("id", accessoryIds);
  if (!accRows || accRows.length === 0) return null;

  // Every active booking that holds one of these accessories, with its dates.
  const { data: links } = await supabase
    .from("booking_accessories")
    .select(
      "accessory_id, bookings!inner(id, start_date, end_date, type, payment_status, hold_expires_at)",
    )
    .in("accessory_id", accessoryIds);

  const now = Date.now();
  const excluded = new Set(excludeBookingIds);
  // Flatten to (accessoryId → the set of days each active holder occupies).
  const holdersByAccessory = new Map<string, string[][]>();
  for (const l of links ?? []) {
    const b = l.bookings as unknown as {
      id: string;
      start_date: string | null;
      end_date: string | null;
      type: string;
      payment_status: string;
      hold_expires_at: string | null;
    } | null;
    if (!b || !l.accessory_id) continue;
    if (b.type !== "rent" || !b.start_date || !b.end_date) continue;
    if (excluded.has(b.id)) continue;
    const active =
      b.payment_status === "pending" ||
      b.payment_status === "verified" ||
      (b.payment_status === "hold" &&
        b.hold_expires_at !== null &&
        new Date(b.hold_expires_at).getTime() > now);
    if (!active) continue;
    const list = holdersByAccessory.get(l.accessory_id) ?? [];
    list.push(accessoryOccupiedRange(b.start_date, b.end_date));
    holdersByAccessory.set(l.accessory_id, list);
  }

  const wantedDays = accessoryOccupiedRange(start, end);
  for (const a of accRows) {
    const capacity = Math.max(0, a.stock - (a.unavailable_units ?? 0));
    if (capacity <= 0) return a.name; // every unit pulled from service
    const holders = holdersByAccessory.get(a.id) ?? [];
    for (const day of wantedDays) {
      const used = holders.reduce((n, days) => n + (days.includes(day) ? 1 : 0), 0);
      if (used >= capacity) return a.name;
    }
  }
  return null;
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
    // Displacing a booking frees its dates (and thus its accessories, which are
    // date-derived) automatically — nothing extra to adjust.
    if (b.payment_status === "hold") {
      await supabase.from("bookings").delete().eq("id", b.id);
    } else {
      await supabase
        .from("bookings")
        .update({ payment_status: "refunded" })
        .eq("id", b.id);
    }
  }

  // Accessories: check AFTER the displacement above, so add-ons freed by an
  // override are available to this booking. Uses the same date-aware rule the
  // customer flow gets from create_rent_hold.
  const accessoryIds = input.accessoryIds ?? [];
  if (accessoryIds.length > 0) {
    const clashing = await accessoryClashForRange(
      supabase,
      accessoryIds,
      input.startDate,
      input.endDate,
      clashes.map((b) => b.id),
    );
    if (clashing) {
      return {
        error: `${clashing} isn't available on those dates — it's already out on another booking. Remove it or pick other dates.`,
      };
    }
  }

  // Snapshot the add-on prices like the customer flow: amount = dress + add-ons.
  const { data: pickedAccessories } =
    accessoryIds.length > 0
      ? await supabase
          .from("accessories")
          .select("id, price")
          .in("id", accessoryIds)
      : { data: [] as { id: string; price: number }[] };
  const addOnTotal = (pickedAccessories ?? []).reduce(
    (sum, a) => sum + (a.price ?? 0),
    0,
  );

  const { data: created, error } = await supabase
    .from("bookings")
    .insert({
      type: "rent",
      manual: true,
      payment_status: input.paid ? "verified" : "pending",
      renter_name: renterName,
      dress_id: dress.id,
      dress_name: dress.name, // snapshot
      start_date: input.startDate,
      end_date: input.endDate,
      amount: dress.price + addOnTotal,
    })
    .select("id")
    .single();
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

  // Link the add-ons, snapshotting today's price (booking_accessories.
  // price_at_booking) so analytics stay right if the price changes later. These
  // rows are what make the accessory unavailable to customers on these dates.
  if (created && (pickedAccessories ?? []).length > 0) {
    const { error: linkError } = await supabase
      .from("booking_accessories")
      .insert(
        (pickedAccessories ?? []).map((a) => ({
          booking_id: created.id,
          accessory_id: a.id,
          price_at_booking: a.price,
        })),
      );
    if (linkError) {
      // The booking exists but its add-ons didn't attach — say so plainly rather
      // than reporting success, since availability would be wrong.
      return {
        error:
          "The booking was saved, but its accessories couldn't be attached. Please edit the booking and re-add them.",
      };
    }
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
 * Delete a booking. This frees its dates automatically — `blocked_dates` (and
 * the accessory equivalent, `accessory_blocked_dates`) only count rows that
 * still exist, so once the row is gone the calendar and any accessories it held
 * reopen on those days. No accessory bookkeeping needed.
 */
export async function deleteBooking(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  // Read the private-bucket file paths BEFORE the row is gone — once deleted we
  // can no longer learn which files belonged to it.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id_photo_url, proof_url")
    .eq("id", id)
    .single();
  if (!booking) return { error: null }; // already gone

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
