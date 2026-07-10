"use client";

import { useState } from "react";

/** One available size with its measurements (from the dress_sizes table). */
export type DressSize = {
  size: string;
  bust_cm: number | null;
  waist_cm: number | null;
  length_cm: number | null;
};

/** Turn centimetres into the "84 cm (33.07 in)" pair the prototype shows. */
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
 * Right column of the dress-detail page (see design/index.html → DetailsRight):
 * pick a size, read that size's measurements, see the fees, and reserve.
 *
 * Choosing a size swaps the measurements shown, so this holds client state.
 * Fees below (deposit, per-extra-day) are fixed business rules from the design.
 */
export function DressDetailsPanel({
  sizes,
  price,
}: {
  sizes: DressSize[];
  price: number;
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

      {/* Fees. These are fixed business rules from the design, not per-dress data. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-background-panel p-4">
          <div className="mb-1 text-label-sm uppercase tracking-label text-text-secondary">
            Rental fee
          </div>
          <div className="text-price-base text-text-accent">
            ₱{price.toLocaleString("en-PH")}{" "}
            <span className="text-body-sm text-text-secondary">(2 days)</span>
          </div>
          <div className="mt-1 text-body-sm text-text-secondary">+ ₱300 per day</div>
        </div>
        <div className="rounded-md bg-background-panel p-4">
          <div className="mb-1 text-label-sm uppercase tracking-label text-text-secondary">
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

      {/* Reserve action. The reservation wizard is a later phase, so for now this
          is a styled button that doesn't open anything yet. */}
      <button
        type="button"
        className="flex min-h-tap w-full items-center justify-center rounded-lg bg-brand-primary px-6 text-label-base uppercase tracking-label text-text-on-primary transition-fast hover:bg-brand-primary-hover"
      >
        Reserve this dress
      </button>
    </div>
  );
}
