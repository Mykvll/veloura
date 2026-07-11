"use client";

import { useState } from "react";
import { DressEditorModal } from "./dress-editor-modal";
import type { AdminDress } from "./types";

/**
 * The "Manage Collection" grid (client component).
 *
 * It renders one tile per dress plus an "Add a dress" tile, and owns the editor
 * modal's open/close state. Clicking a dress opens the editor for it; clicking
 * the Add tile opens the editor in "new" mode. The tiles themselves are plain
 * (they intentionally do NOT reuse the customer <DressCard>, which is a link to
 * the public detail page — here a click must open the editor instead).
 *
 * `editing` is: an AdminDress (edit that one) | "new" (create) | null (closed).
 */
export function DressManager({ dresses }: { dresses: AdminDress[] }) {
  const [editing, setEditing] = useState<AdminDress | "new" | null>(null);

  return (
    <div>
      {/* Header — title + catalogue count */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-display-lg uppercase tracking-display text-text-accent">
            Manage Collection
          </h1>
          <p className="mt-1 text-body-sm text-text-secondary">
            Tap a dress to edit its photos, sizes &amp; reviews.
          </p>
        </div>
        <span className="rounded-pill border border-border-strong px-3 py-1 text-label-sm uppercase tracking-label text-text-secondary">
          {dresses.length} {dresses.length === 1 ? "dress" : "dresses"} in the
          catalogue
        </span>
      </div>

      {/* Grid: dress tiles + the Add tile. 2 cols on mobile, more as it widens. */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {dresses.map((d) => {
          const cover = d.photos[0]?.url ?? null;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setEditing(d)}
              className="@container group relative flex flex-col overflow-hidden rounded-lg border border-border-soft bg-background-card text-left shadow-card transition duration-medium ease-soft hover:-translate-y-[3px] hover:shadow-float focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
            >
              {/* Cover */}
              <div className="relative aspect-[3/4] w-full bg-background-panel">
                {cover ? (
                  // Plain <img>: admin-only, avoids next/image layout overhead.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt={`${d.name} — ${d.styleName || "dress"}`}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-label-sm uppercase tracking-label text-text-secondary">
                    No photo
                  </span>
                )}
                {/* Edit affordance (top-right) + rented count (top-left) */}
                <span className="absolute right-2 top-2 rounded-tag bg-brand-primary px-2 py-0.5 text-label-sm uppercase tracking-label text-text-on-primary">
                  Edit
                </span>
                <span className="absolute left-2 top-2 rounded-tag bg-brand-secondary px-2 py-0.5 text-label-sm uppercase tracking-label text-text-on-primary">
                  Rented {d.rentedCount}×
                </span>
              </div>

              {/* Name / style / price */}
              <div className="p-3 text-center">
                <h2 className="font-display font-semibold uppercase leading-[1.2] tracking-wide text-text-accent text-[clamp(1rem,10cqi,1.5rem)] break-words">
                  {d.name}
                </h2>
                {d.styleName ? (
                  <p className="mt-1 text-label-sm uppercase text-text-secondary">
                    {d.styleName}
                  </p>
                ) : null}
                <p className="mt-2 text-price-base text-text-heading">
                  ₱{d.price.toLocaleString("en-PH")}
                </p>
              </div>
            </button>
          );
        })}

        {/* Add a dress tile */}
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-background-card text-text-secondary transition duration-fast ease-soft hover:border-brand-primary hover:text-text-heading focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-brand-primary text-2xl leading-none text-text-on-primary">
            +
          </span>
          <span className="text-label-base uppercase tracking-label">
            Add a dress
          </span>
        </button>
      </div>

      {/* Editor modal — mounted only while open so its state resets each time.
          `key` forces a fresh instance per dress / for "new". */}
      {editing ? (
        <DressEditorModal
          key={editing === "new" ? "new" : editing.id}
          dress={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
