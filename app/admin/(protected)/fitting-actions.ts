"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { fittingSlots, FITTING_FEE } from "@/lib/reserve";

type ActionResult = { error: string | null };

/** The server Supabase client type, derived so we don't import the generic. */
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * FITTINGS — admin actions.
 *
 * A fitting is an in-store try-on. Unlike the customer reserve flow (which goes
 * through the SECURITY DEFINER `create_fitting_booking` RPC because anon has no
 * direct write on bookings), the admin is authenticated and can write bookings
 * rows directly under the "admin create/manage/delete bookings" RLS policies —
 * exactly like createManualBooking does for rentals.
 *
 * A fitting is a `bookings` row with `type='fitting'`, a `fitting_date` +
 * `fitting_time`, and NO rental dates. It therefore never appears in
 * `blocked_dates` and never blocks a dress's rental availability — only its own
 * slot (via `booked_fitting_slots`, which the customer picker reads). We
 * revalidate `/` as well as `/admin` so the customer fitting calendar reflects
 * an admin-added / -moved / -cancelled appointment.
 *
 * Unlike a customer fitting, the admin flow's conflict checks (dress out on
 * that day, slot already taken) are ADVISORY warnings shown in the editor — the
 * admin can override them — so nothing is enforced server-side here beyond the
 * field/slot validation below.
 */

export type FittingInput = {
  dressId: string;
  /** Client's name — required. */
  name: string;
  /** Contact number — optional for admin-entered fittings. */
  contact: string;
  /** Appointment day, ISO "YYYY-MM-DD" — required. */
  date: string;
  /** Chosen slot, e.g. "4:00 PM" — must be one of fittingSlots(date). */
  time: string;
};

/**
 * Validate the shared fields and snapshot the dress (name kept on the row so it
 * survives a rename/delete, like every other booking). Returns the trimmed
 * values + dress on success, or `{ error }` to hand straight back to the caller.
 */
async function prepareFitting(
  supabase: Supabase,
  input: FittingInput,
): Promise<
  | { error: string }
  | { name: string; contact: string | null; dress: { id: string; name: string } }
> {
  const name = input.name.trim();
  if (!name) return { error: "Please enter the client's name." };
  if (!input.date) return { error: "Please pick a fitting date." };
  if (!input.time || !fittingSlots(input.date).includes(input.time)) {
    return { error: "Please choose a valid time for that date." };
  }

  const { data: dress, error: dressErr } = await supabase
    .from("dresses")
    .select("id, name")
    .eq("id", input.dressId)
    .single();
  if (dressErr || !dress) {
    return { error: "Please choose a dress from the catalogue." };
  }

  return { name, contact: input.contact.trim() || null, dress };
}

/**
 * Create one fitting appointment. `manual: true` marks it admin-entered (a
 * customer fitting is false); the amount is snapshotted as the standard fitting
 * fee. Fittings never reach 'verified' (there's no payment proof), so they stay
 * 'pending' and are excluded from revenue analytics.
 */
export async function createFitting(input: FittingInput): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const prepared = await prepareFitting(supabase, input);
  if ("error" in prepared) return prepared;
  const { name, contact, dress } = prepared;

  const { error } = await supabase.from("bookings").insert({
    type: "fitting",
    manual: true,
    payment_status: "pending",
    renter_name: name,
    contact,
    dress_id: dress.id,
    dress_name: dress.name, // snapshot
    fitting_date: input.date,
    fitting_time: input.time,
    parking: false, // admin fittings don't take the parking add-on
    amount: FITTING_FEE,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}

/**
 * Reschedule / edit a fitting: replace its dress, name, contact, date, and time
 * by id. Scoped to `type='fitting'` so this can never touch a rental row even if
 * given a rental's id.
 */
export async function updateFitting(
  id: string,
  input: FittingInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const prepared = await prepareFitting(supabase, input);
  if ("error" in prepared) return prepared;
  const { name, contact, dress } = prepared;

  const { error } = await supabase
    .from("bookings")
    .update({
      renter_name: name,
      contact,
      dress_id: dress.id,
      dress_name: dress.name, // re-snapshot in case the dress changed
      fitting_date: input.date,
      fitting_time: input.time,
    })
    .eq("id", id)
    .eq("type", "fitting");
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}

/**
 * Cancel a fitting — a hard delete (business rule 4 confirm happens in the UI).
 * Fittings carry no uploaded files (no payment proof / valid ID), so there's
 * nothing to clean out of storage. Deleting frees its slot for customers.
 */
export async function cancelFitting(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", id)
    .eq("type", "fitting");
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { error: null };
}
