import { createClient } from "@/lib/supabase/server";
import { DressCard, type DressCardData } from "@/components/dress-card";

// Always fetch fresh from Supabase on each request (no static caching), so new
// dresses show up as soon as they're added.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();

  // Fetch dresses plus their photos in one query. We pull the photos so we can
  // pick each dress's cover; 'hidden' dresses never appear on the public site.
  const { data: dresses, error } = await supabase
    .from("dresses")
    .select("id, name, style_name, price, status, dress_photos(url, is_cover, sort_order)")
    .neq("status", "hidden")
    .order("created_at", { ascending: true });

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

  // Shape each row into exactly what DressCard needs, choosing the cover photo:
  // the one flagged is_cover, otherwise the lowest sort_order.
  const cards: DressCardData[] = (dresses ?? []).map((d) => {
    const photos = d.dress_photos ?? [];
    const cover =
      photos.find((p) => p.is_cover) ??
      [...photos].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      )[0];

    return {
      id: d.id,
      name: d.name,
      styleName: d.style_name,
      price: d.price,
      coverUrl: cover?.url ?? null,
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
        // Responsive grid: 2 columns on mobile, 3 on tablet, 4 on desktop.
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {cards.map((dress) => (
            <DressCard key={dress.id} dress={dress} />
          ))}
        </div>
      )}
    </main>
  );
}
