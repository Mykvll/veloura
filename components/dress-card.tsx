import Image from "next/image";

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

// Diagonal ivory stripes used as the "no photo yet" placeholder.
// Tokens: background-panel (#F1E8D8 / ivory-200) over background-card (#FDFAF4).
const STRIPED_PLACEHOLDER =
  "repeating-linear-gradient(45deg, #F1E8D8, #F1E8D8 10px, #FDFAF4 10px, #FDFAF4 20px)";

/**
 * A single dress in the collection grid.
 *
 * The name sizes itself against the card's own width via a container query
 * (bigger on desktop, smaller in the 2-col mobile grid).
 *
 * Tapping the card opens the dress-detail modal (the first step of the
 * reservation wizard) via `onClick` — it no longer navigates to a separate
 * page. That's why this is a <button>, not a link.
 */
export function DressCard({
  dress,
  onClick,
}: {
  dress: DressCardData;
  onClick: () => void;
}) {
  return (
    // `@container` makes this card a container-query context so the name below
    // can size itself against the card's own width.
    <button
      type="button"
      onClick={onClick}
      className="@container block w-full overflow-hidden rounded-lg border border-border-soft bg-background-card text-left shadow-card transition duration-medium ease-soft hover:-translate-y-[3px] hover:shadow-float focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
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
            className="object-cover"
          />
        ) : (
          // No photo yet — keep the frame with a striped placeholder.
          <div
            className="flex h-full items-center justify-center text-label-sm uppercase text-text-secondary"
            style={{ background: STRIPED_PLACEHOLDER }}
          >
            Photo coming soon
          </div>
        )}
      </div>

      <div className="p-4 text-center">
        <h3 className="font-display font-semibold uppercase leading-[1.2] tracking-wide text-text-accent text-[clamp(1rem,11cqi,1.5rem)] break-words">
          {dress.name}
        </h3>
        {dress.styleName ? (
          <p className="mt-1 text-label-sm uppercase text-text-secondary">
            {dress.styleName}
          </p>
        ) : null}
        <p className="mt-2 text-price-base text-text-heading">
          {/* "₱500 (2 days)" — Philippine peso, grouped thousands. */}
          ₱{dress.price.toLocaleString("en-PH")}{" "}
          <span className="text-body-sm text-text-secondary">(2 days)</span>
        </p>
      </div>
    </button>
  );
}
