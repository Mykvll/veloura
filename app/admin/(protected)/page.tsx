import { createClient } from "@/lib/supabase/server";
import { DressManager } from "@/components/admin/dress-manager";
import type { AdminDress } from "@/components/admin/types";

// Session-based + always-fresh: the list must reflect writes immediately.
export const dynamic = "force-dynamic";

/**
 * Admin dashboard (/admin) — the "Manage Collection" screen.
 *
 * This is a server component: it fetches every dress with all of its child
 * data (photos, sizes, reviews) and the verified-rental counts, shapes those
 * raw Supabase rows into the plain `AdminDress` objects the UI works with, then
 * hands them to <DressManager> (a client component that renders the grid and
 * owns the editor modal).
 */
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  // Pull dresses + everything the editor needs, newest first so a freshly
  // added dress lands at the top of the grid.
  const { data: dresses, error } = await supabase
    .from("dresses")
    .select(
      `id, name, style_name, price, cost, status,
       dress_photos(url, label, is_cover, sort_order),
       dress_sizes(size, bust_cm, waist_cm, length_cm),
       reviews(renter_name, body, photo_url)`,
    )
    .order("created_at", { ascending: false });

  // Verified rentals per dress. Business rule: analytics count 'verified' only.
  const { data: verified } = await supabase
    .from("bookings")
    .select("dress_id")
    .eq("payment_status", "verified");

  const rentedByDress = new Map<string, number>();
  for (const b of verified ?? []) {
    if (b.dress_id) {
      rentedByDress.set(b.dress_id, (rentedByDress.get(b.dress_id) ?? 0) + 1);
    }
  }

  if (error) {
    return (
      <div>
        <h1 className="font-display text-display-lg uppercase tracking-display text-text-accent">
          Manage Collection
        </h1>
        <p className="mt-4 text-body-base text-state-error">
          Couldn&apos;t load dresses right now: {error.message}
        </p>
      </div>
    );
  }

  // Shape each raw row into a plain, serializable AdminDress. Photos are sorted
  // so the cover (is_cover, else lowest sort_order) comes first — the editor
  // treats index 0 as the cover.
  const rows: AdminDress[] = (dresses ?? []).map((d) => {
    const photos = [...(d.dress_photos ?? [])].sort((a, b) => {
      if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return {
      id: d.id,
      name: d.name,
      styleName: d.style_name ?? "",
      price: d.price,
      cost: d.cost ?? 0,
      status: d.status,
      photos: photos.map((p) => ({ url: p.url, label: p.label ?? "Front" })),
      sizes: (d.dress_sizes ?? []).map((s) => ({
        size: s.size,
        bust: s.bust_cm,
        waist: s.waist_cm,
        length: s.length_cm,
      })),
      reviews: (d.reviews ?? []).map((r) => ({
        name: r.renter_name,
        body: r.body,
        photoUrl: r.photo_url,
      })),
      rentedCount: rentedByDress.get(d.id) ?? 0,
    };
  });

  return <DressManager dresses={rows} />;
}
