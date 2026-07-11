"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * The data the payment-method editor sends us to save.
 *
 * Like the accessory/dress editors, the QR IMAGE FILE never passes through this
 * action — the browser uploads it straight to the public `dress-photos` Storage
 * bucket first and sends us only the resulting public URL (see components/admin/
 * payment-method-editor-modal.tsx).
 */
export type PaymentMethodInput = {
  /** Provided by the editor. New channels get a fresh uuid client-side so the
   *  QR can be uploaded under that id before the row exists. */
  id: string;
  /** Channel name shown in the customer picker, e.g. "GCash". */
  name: string;
  /** Public URL of the QR image, or null. */
  qrUrl: string | null;
};

type ActionResult = { error: string | null };

/**
 * Create or update one payment method.
 *
 * A single upsert covers both cases: a new channel (its client-side id isn't in
 * the table yet → insert) and an edit (id exists → update). Runs on the server
 * as the logged-in admin, so the "admin all payment_methods" RLS policy allows
 * the write. `sort_order` is left untouched by the upsert (defaults to 0 for new
 * rows); channels otherwise show in creation order, which is fine for this list.
 */
export async function savePaymentMethod(
  input: PaymentMethodInput,
): Promise<ActionResult> {
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) return { error: "Please give the payment type a name." };

  const { error } = await supabase.from("payment_methods").upsert({
    id: input.id,
    name,
    qr_url: input.qrUrl,
  });
  if (error) return { error: error.message };

  // Refresh the admin page and the public site (the payment step reads this
  // list to build the channel picker + show the right QR).
  revalidatePath("/admin");
  revalidatePath("/");

  return { error: null };
}

/**
 * Delete one payment method. Bookings store the channel NAME as a plain string
 * (bookings.payment_method), not a foreign key, so past bookings keep their
 * record; only the channel row goes. (The QR image stays in Storage — a harmless
 * orphan, same as accessory images.)
 */
export async function deletePaymentMethod(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("payment_methods").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");

  return { error: null };
}
