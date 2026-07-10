import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { DressGallery, type GalleryPhoto } from "@/components/dress-gallery";
import {
  DressDetailsPanel,
  type DressSize,
} from "@/components/dress-details-panel";

// Fetch fresh on every request so edits (new photos, sizes, price) show up right
// away, matching the home page's behaviour.
export const dynamic = "force-dynamic";

export default async function DressDetailPage({
  params,
}: {
  // In Next.js 15 route params are async — await before reading.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Pull the dress with everything the page needs in one query: its photos,
  // its sizes + measurements, and its reviews.
  const { data: dress, error } = await supabase
    .from("dresses")
    .select(
      `id, name, style_name, price, status,
       dress_photos(url, label, is_cover, sort_order),
       dress_sizes(size, bust_cm, waist_cm, length_cm),
       reviews(id, renter_name, body, photo_url, created_at)`,
    )
    .eq("id", id)
    .neq("status", "hidden") // hidden dresses aren't part of the public site
    .maybeSingle(); // returns null (not an error) when nothing matches

  // Missing, hidden, or a bad id → show the standard 404 page.
  if (error || !dress) {
    notFound();
  }

  // Order photos: the cover first, then by the admin's sort_order.
  const photos: GalleryPhoto[] = [...(dress.dress_photos ?? [])]
    .sort((a, b) => {
      if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    })
    .map((p) => ({ url: p.url, label: p.label }));

  // Sizes as-is; the panel handles the empty case implicitly (no rows → nothing
  // to pick). We keep only rows that actually exist for this dress.
  const sizes: DressSize[] = dress.dress_sizes ?? [];

  // Newest reviews first.
  const reviews = [...(dress.reviews ?? [])].sort(
    (a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );

  return (
    <main className="mx-auto w-full max-w-page-max px-6 py-12">
      {/* Back link to the collection. */}
      <Link
        href="/"
        className="text-label-sm uppercase tracking-label text-text-secondary transition-fast hover:text-text-accent"
      >
        ← Back to collection
      </Link>

      {/* Title block */}
      <div className="mt-6">
        <h1 className="font-display text-display-lg uppercase tracking-display text-text-accent">
          {dress.name}
        </h1>
        {dress.style_name ? (
          <p className="mt-1 text-body-base text-text-secondary">
            {dress.style_name}
          </p>
        ) : null}
      </div>

      {/* Two columns on desktop, stacked on mobile. */}
      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-2">
        {/* Left: photo slideshow */}
        <DressGallery photos={photos} dressName={dress.name} />

        {/* Right: sizes, measurements, fees, reserve */}
        {sizes.length > 0 ? (
          <DressDetailsPanel sizes={sizes} price={dress.price} />
        ) : (
          // No sizes recorded yet — still show fees via an empty panel would be
          // odd, so give a quiet note instead.
          <p className="text-body-base text-text-secondary">
            Sizing details coming soon.
          </p>
        )}
      </div>

      {/* Reviews, full width below the two columns. */}
      {reviews.length > 0 ? (
        <section className="mt-14">
          <h2 className="font-display text-display-md uppercase tracking-display text-text-accent">
            Renter reviews
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {reviews.map((r) => (
              <article
                key={r.id}
                className="flex items-start gap-3 rounded-md bg-background-panel p-4"
              >
                {r.photo_url ? (
                  <Image
                    src={r.photo_url}
                    alt={`Photo from ${r.renter_name}`}
                    width={48}
                    height={48}
                    className="h-12 w-12 flex-none rounded-sm border border-border-accent object-cover object-top"
                  />
                ) : null}
                <div>
                  <div className="mb-1.5 text-label-sm uppercase tracking-label text-text-accent">
                    {r.renter_name}
                  </div>
                  <p className="text-body-sm text-text-primary">{r.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
