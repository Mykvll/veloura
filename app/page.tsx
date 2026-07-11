import { createClient } from "@/lib/supabase/server";
import { CollectionGallery } from "@/components/collection-gallery";
import type { DressDetail } from "@/components/dress-detail-modal";
import type { CustomerAccessory } from "@/components/accessory-picker";

// Always fetch fresh from Supabase on each request (no static caching), so new
// dresses show up as soon as they're added.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();

  // Fetch every non-hidden dress with ALL the detail the modal needs (photos,
  // sizes, reviews) — not just the card cover. The detail now lives in a modal
  // on this page, so loading it up front makes opening a dress instant (no
  // second round-trip). This is the same query the old /dress/[id] page ran,
  // just for the whole collection at once.
  const { data: dresses, error } = await supabase
    .from("dresses")
    .select(
      `id, name, style_name, price, status,
       dress_photos(url, label, is_cover, sort_order),
       dress_sizes(size, bust_cm, waist_cm, length_cm),
       reviews(id, renter_name, body, photo_url, created_at)`,
    )
    .neq("status", "hidden")
    .order("created_at", { ascending: true });

  // Accessories offered as rental add-ons in the reserve flow. The same list is
  // shown for every dress; out-of-stock ones are disabled (not hidden), so we
  // fetch them all. Oldest-first keeps the order stable as new ones are added.
  const { data: accessoryRows } = await supabase
    .from("accessories")
    .select("id, name, price, stock, image_url")
    .order("created_at", { ascending: true });

  const accessories: CustomerAccessory[] = (accessoryRows ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    price: a.price,
    stock: a.stock,
    imageUrl: a.image_url,
  }));

  if (error) {
    // Surface the failure instead of rendering a silently-empty grid.
    return (
      <main className="mx-auto w-full max-w-page-max px-6 py-12">
        <p className="text-body-base text-state-error">
          Sorry — we couldn&apos;t load the collection right now. Please try again.
        </p>
      </main>
    );
  }

  // Shape each raw row into the plain DressDetail the client components use.
  // Photos are ordered cover-first (is_cover, then sort_order) so the card cover
  // and the gallery's first slide agree; reviews are newest-first.
  const cards: DressDetail[] = (dresses ?? []).map((d) => {
    const photos = [...(d.dress_photos ?? [])]
      .sort((a, b) => {
        if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
      .map((p) => ({ url: p.url, label: p.label }));

    const reviews = [...(d.reviews ?? [])]
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .map((r) => ({
        id: r.id,
        name: r.renter_name,
        body: r.body,
        photoUrl: r.photo_url,
      }));

    return {
      id: d.id,
      name: d.name,
      styleName: d.style_name,
      price: d.price,
      photos,
      sizes: d.dress_sizes ?? [],
      reviews,
    };
  });

  return (
    <main className="mx-auto w-full max-w-page-max px-6 py-12">
      <h1 className="font-display text-display-lg uppercase tracking-display text-text-accent">
        Our Collection
      </h1>

      {cards.length === 0 ? (
        // Empty state — no dresses yet.
        <p className="mt-8 text-body-base text-text-secondary">No dresses yet</p>
      ) : (
        <CollectionGallery dresses={cards} accessories={accessories} />
      )}
    </main>
  );
}
