"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/require-admin";

/**
 * The data the accessory editor sends us to save.
 *
 * Like the dress editor, the IMAGE FILE never passes through this action — the
 * browser uploads it straight to the public `dress-photos` Storage bucket first
 * and sends us only the resulting public URL (see components/admin/accessory-
 * editor-modal.tsx).
 */
export type AccessoryInput = {
  /** Provided by the editor. New accessories get a fresh uuid client-side so
   *  the image can be uploaded under that id before the row exists. */
  id: string;
  name: string;
  /** Rental add-on price (pesos). */
  price: number;
  /** Your unit cost (pesos). */
  cost: number;
  /** Total units you own. */
  stock: number;
  /** Units out with customers now (temporary; they return). */
  rented: number;
  /** Units pulled from service — damaged, lost, or in repair (not rentable). */
  unavailableUnits: number;
  imageUrl: string | null;
};

type ActionResult = { error: string | null };

/**
 * Create or update one accessory.
 *
 * A single upsert covers both cases: a new accessory (its client-side id isn't
 * in the table yet → insert) and an edit (id exists → update). Runs on the
 * server as the logged-in admin, so the "admin all accessories" RLS policy
 * allows the write. Stock is clamped to ≥ 0 as a safety net.
 */
export async function saveAccessory(
  input: AccessoryInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const name = input.name.trim();
  if (!name) return { error: "Please give the accessory a name." };

  // Clamp the unit counts as a server-side backstop (the editor already keeps
  // them in range): each ≥ 0, and out-on-rent + unavailable never exceed owned.
  const stock = Math.max(0, Math.round(input.stock));
  const unavailableUnits = Math.min(
    Math.max(0, Math.round(input.unavailableUnits)),
    stock,
  );
  const rented = Math.min(
    Math.max(0, Math.round(input.rented)),
    stock - unavailableUnits,
  );

  const { error } = await supabase.from("accessories").upsert({
    id: input.id,
    name,
    price: input.price,
    cost: input.cost,
    stock,
    rented,
    unavailable_units: unavailableUnits,
    image_url: input.imageUrl,
  });
  if (error) return { error: error.message };

  // Refresh the admin page (accessories are now a section on "/admin") and the
  // public site (which shows accessories in the rental picker).
  revalidatePath("/admin");
  revalidatePath("/");

  return { error: null };
}

/**
 * Delete one accessory. Its booking_accessories links use `on delete set null`
 * (see the data model), so past bookings keep their record; only the accessory
 * row goes. (The image file stays in Storage — a harmless orphan.)
 */
export async function deleteAccessory(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const { error } = await supabase.from("accessories").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");

  return { error: null };
}
