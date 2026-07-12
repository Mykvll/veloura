"use client";

import { useState } from "react";

/** One available size with its measurements (from the dress_sizes table). */
export type DressSize = {
  size: string;
  bust_cm: number | null;
  waist_cm: number | null;
  length_cm: number | null;
};

/** Turn centimetres into the displayed "84 cm (33.07 in)" pair. */
function formatMeasurement(cm: number | null): { cm: string; inches: string } | null {
  if (cm == null) return null;
  return { cm: `${cm} cm`, inches: `${(cm / 2.54).toFixed(2)} in` };
}

/** One "Bust / Waist / Length" row in the measurements table. */
function SpecRow({ label, cm }: { label: string; cm: number | null }) {
  const value = formatMeasurement(cm);
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between border-b border-dashed border-border-soft py-2">
      <span className="text-label-sm uppercase tracking-label text-text-heading">
        {label}
      </span>
      <span className="flex items-baseline gap-3">
        <b className="text-price-base text-text-primary">{value.cm}</b>
        <span className="text-body-sm text-text-secondary">({value.inches})</span>
      </span>
    </div>
  );
}

/**
 * Right column of the dress-detail page: pick a size, read that size's
 * measurements, see the fees, and reserve.
 *
 * Choosing a size swaps the measurements shown, so this holds client state.
 * Accessories are NOT chosen here — they live in the rent form (step 2), so
 * this column is just sizes, fees, and the two actions.
 */
export function DressDetailsPanel({
  sizes,
  price,
  onReserve,
  onFitting,
}: {
  sizes: DressSize[];
  price: number;
  /** Open the date calendar to rent this dress. */
  onReserve: () => void;
  /** Open the date calendar to book a fitting. */
  onFitting: () => void;
}) {
  const [activeSize, setActiveSize] = useState(0);
  const selected = sizes[activeSize];

  return (
    <div className="flex flex-col gap-6">
      <div>
        {sizes.length > 1 ? (
          // Multiple sizes — offer pills to switch between them.
          <div className="mb-3">
            <div className="mb-2 text-label-base uppercase tracking-label text-text-heading">
              Available sizes
            </div>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s, i) => {
                const isActive = i === activeSize;
                return (
                  <button
                    key={s.size}
                    type="button"
                    onClick={() => setActiveSize(i)}
                    aria-pressed={isActive}
                    className={`min-h-tap min-w-tap rounded-pill border px-4 text-label-sm uppercase tracking-wide transition-fast ${
                      isActive
                        ? "border-brand-primary bg-brand-primary text-text-on-primary"
                        : "border-border-soft bg-background-card text-text-primary hover:border-border-strong"
                    }`}
                  >
                    {s.size}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          // Only one size — state it plainly, no picker needed.
          <div className="mb-2 text-label-base uppercase tracking-label text-text-heading">
            Size {selected.size}{" "}
            <span className="text-body-sm normal-case tracking-normal text-text-secondary">
              (only available size)
            </span>
          </div>
        )}

        {/* Measurements for the chosen size. */}
        <SpecRow label="Bust" cm={selected.bust_cm} />
        <SpecRow label="Waist" cm={selected.waist_cm} />
        <SpecRow label="Length" cm={selected.length_cm} />
      </div>

      {/* Fees — two InfoBox-style cream cards (design InfoBox: card fill, soft
          border + shadow, uppercase brown label, gold price). Fixed business
          rules from the design, not per-dress data. */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-md border border-border-soft bg-background-card p-4 shadow-card">
          <div className="mb-1.5 text-label-base uppercase tracking-[0.12em] text-text-heading">
            Rental fee
          </div>
          <div className="text-price-base text-text-accent">
            ₱{price.toLocaleString("en-PH")}{" "}
            <span className="text-body-sm text-text-secondary">(2 days)</span>
          </div>
          <div className="mt-1 text-body-sm text-text-secondary">+ ₱300 per day</div>
        </div>
        <div className="rounded-md border border-border-soft bg-background-card p-4 shadow-card">
          <div className="mb-1.5 text-label-base uppercase tracking-[0.12em] text-text-heading">
            Deposit
          </div>
          <div className="text-price-base text-text-accent">
            ₱{(1500).toLocaleString("en-PH")}{" "}
            <span className="text-body-sm text-text-secondary">refundable</span>
          </div>
        </div>
      </div>

      <p className="text-body-sm text-text-secondary">
        To reserve, the full rental fee is paid up front — only paid reservations
        secure the rental date. Fitting by appointment (₱200 per session). No
        tailoring, cutting, or alterations.
      </p>

      {/* Reserve / fitting actions — both open the availability calendar (in
          rent or fitting mode). */}
      <button
        type="button"
        onClick={onReserve}
        className="flex h-[52px] w-full items-center justify-center rounded-pill bg-brand-primary px-6 text-label-base uppercase tracking-label text-text-on-primary transition-fast hover:bg-brand-primary-hover active:bg-brand-primary-active"
      >
        Reserve this dress
      </button>
      {/* Secondary pill = 1px gold outline on cream with gold text. */}
      <button
        type="button"
        onClick={onFitting}
        className="flex min-h-tap w-full items-center justify-center rounded-pill border border-border-accent bg-background-card px-6 text-label-base uppercase tracking-label text-text-accent transition-fast hover:bg-background-panel"
      >
        Book a fitting
      </button>
    </div>
  );
}
