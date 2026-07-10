import Image from "next/image";
import Link from "next/link";

/**
 * The exact shape a DressCard needs. We keep this narrow (not the whole DB row)
 * so the card is easy to reuse and reason about.
 */
export type DressCardData = {
  id: string;
  name: string;
  styleName: string | null;
  price: number;
  /** Cover photo URL, or null when the dress has no photo yet. */
  coverUrl: string | null;
};

/**
 * A single dress in the collection grid.
 *
 * Visual language comes straight from the brand tokens (see design-tokens.md):
 *  - card surface `bg-background-card`, `rounded-lg`, `shadow-card`, soft border
 *  - cover photo cropped from the top (dresses are shot full-length)
 *  - name in the display serif, gold, uppercase (the title-color rule)
 *  - style name in muted body text
 *  - price in the gold price token, formatted "₱500 (2 days)"
 */
export function DressCard({ dress }: { dress: DressCardData }) {
  return (
    // The whole card links through to the dress-detail page (/dress/[id]).
    <Link
      href={`/dress/${dress.id}`}
      className="block overflow-hidden rounded-lg border border-border-soft bg-background-card shadow-card transition-fast hover:shadow-float focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
    >
      {/* Cover photo. Fixed 3:4 portrait frame keeps the grid tidy even when
          source photos vary in size. */}
      <div className="relative aspect-[3/4] w-full bg-background-panel">
        {dress.coverUrl ? (
          <Image
            src={dress.coverUrl}
            alt={`${dress.name} — ${dress.styleName ?? "dress"}`}
            fill
            // Roughly how wide the image renders: ~half the viewport on mobile
            // (2-col grid), a quarter on desktop (up to 4-col).
            sizes="(max-width: 719px) 50vw, 25vw"
            className="object-cover object-top"
          />
        ) : (
          // No photo yet — keep the frame with a quiet placeholder.
          <div className="flex h-full items-center justify-center text-label-sm uppercase tracking-label text-text-secondary">
            Photo coming soon
          </div>
        )}
      </div>

      {/* Text block */}
      <div className="p-4">
        <h3 className="font-display text-display-md uppercase tracking-display text-text-accent">
          {dress.name}
        </h3>
        {dress.styleName ? (
          <p className="mt-1 text-body-sm text-text-secondary">
            {dress.styleName}
          </p>
        ) : null}
        <p className="mt-3 text-price-base text-text-accent">
          {/* "₱500 (2 days)" — Philippine peso, grouped thousands. */}
          ₱{dress.price.toLocaleString("en-PH")}{" "}
          <span className="text-body-sm text-text-secondary">(2 days)</span>
        </p>
      </div>
    </Link>
  );
}
