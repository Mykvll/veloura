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

/**
 * Fetch a page of rental history entries (both completed bookings from the
 * bookings table and manually logged rentals from rental_history table).
 * Returns entries sorted by start_date DESC, with server-side pagination
 * using cursor-based keyset pagination to stay fast at any depth.
 */
export async function fetchHistoryPage(
  cursor: string | null,
  limit: number = 20,
  search: string = "",
): Promise<{
  entries: Array<{
    id: string;
    renter: string;
    dress: string;
    start: string;
    end: string;
    amount: number;
    source: "Booking" | "Logged";
  }>;
  total: number;
  totalEarned: number;
  hasMore: boolean;
}> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // Completed bookings (verified + wash day in past).
  let bookingsQuery = supabase
    .from("bookings")
    .select("id, renter_name, dress_name, start_date, end_date, amount, end_date")
    .eq("type", "rent")
    .eq("payment_status", "verified");

  // Manually logged past rentals.
  let historyQuery = supabase
    .from("rental_history")
    .select("id, renter_name, dress_name, start_date, end_date, amount_paid");

  // Apply search filter if provided.
  if (search.trim()) {
    const pattern = `%${search.trim()}%`;
    bookingsQuery = bookingsQuery.or(
      `renter_name.ilike.${pattern},dress_name.ilike.${pattern}`,
    );
    historyQuery = historyQuery.or(
      `renter_name.ilike.${pattern},dress_name.ilike.${pattern}`,
    );
  }

  const { data: bookingsData, error: bookingsErr } = await bookingsQuery;
  const { data: historyData, error: historyErr } = await historyQuery;

  if (bookingsErr || historyErr) {
    throw new Error(bookingsErr?.message || historyErr?.message);
  }

  // Filter bookings to only completed ones (wash day in past).
  const completedBookings = (bookingsData ?? [])
    .filter((b) => {
      if (!b.end_date) return false;
      const washDay = new Date(b.end_date);
      washDay.setDate(washDay.getDate() + 1);
      const washDayIso = washDay.toISOString().split("T")[0];
      return washDayIso < today;
    })
    .map((b) => ({
      id: b.id,
      renter: b.renter_name,
      dress: b.dress_name ?? "Dress",
      start: b.start_date as string,
      end: b.end_date as string,
      amount: b.amount ?? 0,
      source: "Booking" as const,
    }));

  const loggedRentals = (historyData ?? []).map((h) => ({
    id: h.id,
    renter: h.renter_name,
    dress: h.dress_name,
    start: h.start_date,
    end: h.end_date,
    amount: h.amount_paid,
    source: "Logged" as const,
  }));

  // Merge and sort by start_date DESC.
  const all = [...completedBookings, ...loggedRentals].sort(
    (a, b) => b.start.localeCompare(a.start) || b.id.localeCompare(a.id),
  );

  // Compute totals before pagination.
  const total = all.length;
  const totalEarned = all.reduce((sum, e) => sum + e.amount, 0);

  // Cursor-based pagination: find the cursor index, then slice from there.
  let startIdx = 0;
  if (cursor) {
    startIdx = all.findIndex((e) => e.id === cursor);
    if (startIdx >= 0) {
      startIdx += 1; // start after the cursor
    } else {
      startIdx = 0; // invalid cursor, start from top
    }
  }

  const page = all.slice(startIdx, startIdx + limit + 1); // fetch limit+1 to know if there's more
  const hasMore = page.length > limit;
  const entries = page.slice(0, limit);

  return {
    entries,
    total,
    totalEarned,
    hasMore,
  };
}
