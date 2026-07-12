"use client";

import { useState } from "react";
import Image from "next/image";

/** One photo in the gallery. `label` is the admin's caption (Front/Back/Detail). */
export type GalleryPhoto = {
  url: string;
  label: string | null;
};

/**
 * Photo slideshow for the dress-detail page.
 *
 * A large "hero" image on the left with a column of thumbnails beside it. Tapping
 * a thumbnail swaps the hero. This needs client state (which slide is showing),
 * so it's a "use client" component; the server page passes the photos in.
 */
export function DressGallery({
  photos,
  dressName,
}: {
  photos: GalleryPhoto[];
  dressName: string;
}) {
  const [active, setActive] = useState(0);

  // No photos yet — keep the frame with a quiet placeholder so the layout holds.
  if (photos.length === 0) {
    return (
      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-md bg-background-panel text-label-sm uppercase tracking-label text-text-secondary">
        Photos coming soon
      </div>
    );
  }

  const current = photos[active];

  return (
    <div className="flex gap-3">
      {/* Hero image */}
      <div className="relative min-w-0 flex-1">
        <Image
          src={current.url}
          alt={`${dressName}${current.label ? ` — ${current.label}` : ""}`}
          width={800}
          height={1067}
          // Left column is roughly half the page on desktop, full width on mobile.
          sizes="(max-width: 719px) 100vw, 45vw"
          className="aspect-[3/4] w-full rounded-md object-cover object-top"
          priority
        />
        {/* Corner badges: reassure it's a real photo + show position in the set. */}
        <span className="absolute left-3 top-3 rounded-tag bg-brand-primary px-2 py-1 text-label-sm uppercase tracking-label text-text-on-primary">
          Actual photo
        </span>
        <span className="absolute right-3 top-3 rounded-tag border border-border-strong bg-background-card px-2 py-1 text-label-sm uppercase tracking-label text-text-secondary">
          {current.label ? `${current.label} · ` : ""}
          {active + 1}/{photos.length}
        </span>
      </div>

      {/* Thumbnail rail. Hidden when there's only one photo — nothing to switch to. */}
      {photos.length > 1 ? (
        <div className="flex w-16 flex-none flex-col gap-2 md:w-20">
          {photos.map((photo, i) => {
            const selected = i === active;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show ${photo.label ?? `photo ${i + 1}`}`}
                aria-pressed={selected}
                className={`overflow-hidden rounded-sm border-2 transition-fast ${
                  selected
                    ? "border-brand-primary"
                    : "border-transparent opacity-80 hover:opacity-100"
                }`}
              >
                <Image
                  src={photo.url}
                  alt={`${dressName} thumbnail${photo.label ? ` — ${photo.label}` : ""}`}
                  width={160}
                  height={213}
                  sizes="80px"
                  className="aspect-[3/4] w-full object-cover object-top"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
