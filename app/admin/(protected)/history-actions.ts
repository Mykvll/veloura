"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * The data the "Log past rental" modal sends us to save.
 *
 * A logged past rental is a PRE-SYSTEM rental the admin remembers — it exists
 * only for accurate lifetime earnings and per-dress wear counts. It is a
 * separate record type from a booking on purpose: it skips payment
 * verification entirely (counts as earned immediately) and must never block
 * calendar dates, so it lives in `rental_history`, which the blocked_dates
 * view and the verification queue never read.
 */
export type PastRentalInput = {
  dressId: string;
  renterName: string;
  /** Rental dates, ISO "YYYY-MM-DD" — both must be today or earlier. */
  startDate: string;
  endDate: string;
  /** What they actually paid (rental + any add-ons), whole pesos. */
  amountPaid: number;
};

type ActionResult = { error: string | null };

/** Today as an ISO day in the shop's timezone (Manila). Vercel servers run in
 *  UTC, which trails Manila by 8 hours — comparing against UTC "today" would
 *  wrongly reject a rental that ended earlier today, Manila time. */
function todayManila(): string {
  // en-CA formats as YYYY-MM-DD, so it compares directly against ISO days.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/**
 * Log one past rental. The UI enforces all of this too, but never trust the
 * UI: dates must be real, ordered, and not in the future; the amount must be
 * positive. Runs as the logged-in admin, so the "admin all rental_history"
 * RLS policy allows the insert (anon can't touch this table at all).
 */
export async function logPastRental(
  input: PastRentalInput,
): Promise<ActionResult> {
  const supabase = await createClient();

  const renterName = input.renterName.trim();
  if (!renterName) return { error: "Please enter the renter's name." };
  if (!input.startDate || !input.endDate) {
    return { error: "Please pick the rental dates." };
  }
  if (input.endDate < input.startDate) {
    return { error: "The end date can't be before the start date." };
  }
  const today = todayManila();
  if (input.startDate > today || input.endDate > today) {
    return { error: "Past rentals can't have future dates." };
  }
  const amount = Math.round(input.amountPaid);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Please enter the amount they paid." };
  }

  // Snapshot the dress name like bookings do, so the history record survives
  // the dress being renamed or deleted later.
  const { data: dress, error: dressErr } = await supabase
    .from("dresses")
    .select("id, name")
    .eq("id", input.dressId)
    .single();
  if (dressErr || !dress) {
    return { error: "Please choose a dress from the catalogue." };
  }

  const { error } = await supabase.from("rental_history").insert({
    dress_id: dress.id,
    dress_name: dress.name, // snapshot
    renter_name: renterName,
    start_date: input.startDate,
    end_date: input.endDate,
    amount_paid: amount,
  });
  if (error) return { error: error.message };

  // Only the admin page shows history/analytics — availability is untouched,
  // so the public site doesn't need a refresh.
  revalidatePath("/admin");
  return { error: null };
}

/**
 * Remove one logged rental from history. Its amount leaves Total earned and
 * the dress's wear count drops by one — nothing else references these rows.
 */
export async function removePastRental(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("rental_history").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { error: null };
}
