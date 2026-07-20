"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/require-admin";

/**
 * The data the dress editor sends us to save.
 *
 * Note: the photo/review IMAGE FILES are NOT in here — the browser uploads
 * those straight to Supabase Storage first (see components/admin/dress-editor
 * .tsx and the "Upload flow" explanation in the PR/notes) and sends us only the
 * resulting public URLs. This keeps big binary data out of the server action.
 */
export type DressInput = {
  /** Provided by the editor. New dresses get a fresh uuid client-side so the
   *  photos can be uploaded under that id before the row exists. */
  id: string;
  name: string;
  styleName: string;
  price: number;
  cost: number;
  status: string;
  /** In display order. The first one is the cover. */
  photos: { url: string; label: string }[];
  sizes: {
    size: string;
    bust: number | null;
    waist: number | null;
    length: number | null;
  }[];
  reviews: { name: string; body: string; photoUrl: string | null }[];
};

type ActionResult = { error: string | null };

/**
 * Create or update a dress plus all of its photos, sizes and reviews.
 *
 * Strategy: upsert the dress row, then REPLACE its child rows (delete all, then
 * re-insert from the submitted list). Replacing is simpler and less bug-prone
 * than diffing what changed, and the tables are tiny. The photo/review images
 * already live in Storage, so wiping the DB rows doesn't touch the files.
 *
 * Runs on the server as the logged-in admin, so the "admin all" RLS policies
 * allow every write here.
 */
export async function saveDress(input: DressInput): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const name = input.name.trim();
  if (!name) return { error: "Please give the dress a name." };
  if (input.photos.length === 0) {
    return { error: "Add at least one photo." };
  }

  // 1. The dress row itself (insert if new, update if it already exists).
  const { error: dressError } = await supabase.from("dresses").upsert({
    id: input.id,
    name,
    style_name: input.styleName.trim() || null,
    price: input.price,
    cost: input.cost,
    status: input.status,
  });
  if (dressError) return { error: dressError.message };

  // 2. Photos — delete the old set, insert the new one. First photo = cover,
  //    and sort_order preserves the admin's ordering.
  await supabase.from("dress_photos").delete().eq("dress_id", input.id);
  if (input.photos.length > 0) {
    const { error } = await supabase.from("dress_photos").insert(
      input.photos.map((p, i) => ({
        dress_id: input.id,
        url: p.url,
        label: p.label,
        is_cover: i === 0,
        sort_order: i,
      })),
    );
    if (error) return { error: error.message };
  }

  // 3. Sizes — same replace approach. Each size carries its own measurements.
  await supabase.from("dress_sizes").delete().eq("dress_id", input.id);
  if (input.sizes.length > 0) {
    const { error } = await supabase.from("dress_sizes").insert(
      input.sizes.map((s) => ({
        dress_id: input.id,
        size: s.size,
        bust_cm: s.bust,
        waist_cm: s.waist,
        length_cm: s.length,
      })),
    );
    if (error) return { error: error.message };
  }

  // 4. Reviews — replace as well.
  await supabase.from("reviews").delete().eq("dress_id", input.id);
  if (input.reviews.length > 0) {
    const { error } = await supabase.from("reviews").insert(
      input.reviews.map((r) => ({
        dress_id: input.id,
        renter_name: r.name,
        body: r.body,
        photo_url: r.photoUrl,
      })),
    );
    if (error) return { error: error.message };
  }

  // Refresh the pages that show this data so the change appears immediately.
  // (The dress detail now lives in a modal on "/", so there's no /dress/[id]
  // route to revalidate any more.)
  revalidatePath("/");
  revalidatePath("/admin");

  return { error: null };
}

/**
 * Delete a dress. The child tables (photos, sizes, reviews) are removed
 * automatically by the `on delete cascade` foreign keys, so one delete is
 * enough. (The image files stay in Storage — harmless orphans.)
 */
export async function deleteDress(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const denied = await requireAdmin(supabase);
  if (denied) return denied;

  const { error } = await supabase.from("dresses").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/admin");

  return { error: null };
}
