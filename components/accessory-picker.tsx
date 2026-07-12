"use client";

import { useState } from "react";

/**
 * One accessory as the customer reserve flow needs it. Maps from the
 * `accessories` table: `price` is the rental add-on price, `stock` is how many
 * are left, `imageUrl` is the photo in the dress-photos bucket (or null).
 */
export type CustomerAccessory = {
  id: string;
  name: string;
  price: number;
  stock: number;
  imageUrl: string | null;
};

/**
 * The accessories add-on picker for the reserve flow. One tappable row per
 * accessory: a checkbox, a thumbnail (tap to preview the full image), the
 * name + "N available", and the "+₱price" add-on. Tapping a row toggles it;
 * out-of-stock rows are disabled.
 *
 * This is a CONTROLLED list — the selected ids and the running total live in the
 * parent (which also knows the dress price). It only owns the local preview
 * lightbox. Nothing here is saved yet; this is UI + selection only.
 */
export function AccessoryPicker({
  accessories,
  picked,
  onToggle,
}: {
  accessories: CustomerAccessory[];
  picked: string[];
  onToggle: (id: string) => void;
}) {
  // Which accessory's full image is open in the lightbox (null = closed).
  const [preview, setPreview] = useState<CustomerAccessory | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {accessories.map((a) => {
        const out = a.stock <= 0;
        const sel = picked.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => !out && onToggle(a.id)}
            disabled={out}
            aria-pressed={sel}
            className={`flex min-h-tap items-center gap-3 rounded-sm border px-3.5 py-2 text-left transition-fast disabled:cursor-not-allowed disabled:opacity-55 ${
              sel
                ? "border-border-accent bg-background-panel"
                : "border-border-soft bg-white hover:border-border-strong"
            }`}
          >
            {/* Checkbox — gold with a check when selected. */}
            <span
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-[5px] border text-xs leading-none text-text-on-primary ${
                sel
                  ? "border-brand-primary bg-brand-primary"
                  : "border-border-strong bg-white"
              }`}
            >
              {sel ? "✓" : ""}
            </span>

            {/* Thumbnail — tap to preview the full image (only if there is one).
                It's a nested clickable span so the tap can open the lightbox
                without also toggling the row (stopPropagation). */}
            <span
              onClick={(e) => {
                if (a.imageUrl) {
                  e.stopPropagation();
                  setPreview(a);
                }
              }}
              onKeyDown={(e) => {
                if (a.imageUrl && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  e.stopPropagation();
                  setPreview(a);
                }
              }}
              role={a.imageUrl ? "button" : undefined}
              tabIndex={a.imageUrl ? 0 : undefined}
              aria-label={a.imageUrl ? `Preview ${a.name}` : undefined}
              className={`flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-md border border-border-soft bg-background-panel ${
                a.imageUrl ? "cursor-zoom-in" : ""
              }`}
            >
              {a.imageUrl ? (
                // Plain <img>: these are small, customer-uploaded-by-admin thumbs.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.imageUrl}
                  alt={a.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-label-sm text-text-secondary">—</span>
              )}
            </span>

            {/* Name + availability. Out-of-stock note is red. */}
            <span className="min-w-0 flex-1">
              <span className="block text-body-base text-text-primary">
                {a.name}
              </span>
              <span
                className={`text-body-sm ${
                  out ? "text-state-error" : "text-text-secondary"
                }`}
              >
                {out ? "Out of stock" : `${a.stock} available`}
              </span>
            </span>

            <span className="flex-none text-price-base text-text-accent">
              +₱{a.price}
            </span>
          </button>
        );
      })}

      {/* Full-image preview lightbox — tap outside (or the image caption area)
          to close. Sits above the detail modal it lives inside. */}
      {preview ? (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreview(null);
          }}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-overlay-scrim-heavy p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.imageUrl ?? ""}
            alt={preview.name}
            className="max-h-[70vh] max-w-[90%] rounded-md shadow-float"
          />
          <div className="text-label-sm uppercase tracking-label text-text-on-primary">
            {preview.name} · +₱{preview.price} · tap outside to close
          </div>
        </div>
      ) : null}
    </div>
  );
}
