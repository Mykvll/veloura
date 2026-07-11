"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error: string | null };

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
 * STOCK RULE (business rule 2): a booking's accessories are "out" only while the
 * booking is VERIFIED. So we decrement stock when a booking BECOMES verified,
 * and (defensively) restore it if a verified booking later leaves that state.
 * Tracking the TRANSITION — not just the target status — is what stops a
 * double-decrement on verify-twice and phantom stock loss on delete.
 */

/**
 * Add `delta` (+1 or -1) to the stock of every accessory attached to a booking,
 * clamped at 0. Fetch-then-write per accessory — the same pragmatic, tiny-race
 * approach the reserve flow uses; fine for this shop's volume.
 */
async function adjustStockForBooking(
  supabase: Supabase,
  bookingId: string,
  delta: number,
) {
  const { data: links } = await supabase
    .from("booking_accessories")
    .select("accessory_id")
    .eq("booking_id", bookingId);

  for (const link of links ?? []) {
    const { data: acc } = await supabase
      .from("accessories")
      .select("stock")
      .eq("id", link.accessory_id)
      .single();
    if (!acc) continue; // accessory was deleted (link set null) — nothing to adjust
    const next = Math.max(0, acc.stock + delta);
    await supabase
      .from("accessories")
      .update({ stock: next })
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
 * Verify a payment. Sets status to 'verified' and, if the booking wasn't already
 * verified, decrements its accessories' stock once (business rule 2).
 */
export async function verifyBooking(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const status = await currentStatus(supabase, id);
  if (status === null) return { error: "That booking no longer exists." };
  if (status === "verified") return { error: null }; // already done — no double-decrement

  const { error } = await supabase
    .from("bookings")
    .update({ payment_status: "verified" })
    .eq("id", id);
  if (error) return { error: error.message };

  await adjustStockForBooking(supabase, id, -1);

  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}

/**
 * Flag a booking's proof as invalid/fake. (The UI only offers this for a pending
 * booking, so normally no stock was ever taken; the restore is a safety net in
 * case a verified one is flagged.)
 */
export async function flagBookingInvalid(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const status = await currentStatus(supabase, id);
  if (status === null) return { error: "That booking no longer exists." };

  const { error } = await supabase
    .from("bookings")
    .update({ payment_status: "invalid" })
    .eq("id", id);
  if (error) return { error: error.message };

  if (status === "verified") await adjustStockForBooking(supabase, id, 1);

  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}

/**
 * Delete a booking. This frees its dates automatically — `blocked_dates` only
 * counts rows that still exist, so once the row is gone the calendar reopens
 * those days. If the booking was verified, restore its accessory stock BEFORE
 * deleting, since the `booking_accessories` links cascade away with the row.
 */
export async function deleteBooking(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const status = await currentStatus(supabase, id);
  if (status === null) return { error: null }; // already gone

  if (status === "verified") await adjustStockForBooking(supabase, id, 1);

  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}
