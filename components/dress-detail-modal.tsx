"use client";

import Image from "next/image";
import { Dialog } from "radix-ui";
import { DressGallery, type GalleryPhoto } from "./dress-gallery";
import { DressDetailsPanel, type DressSize } from "./dress-details-panel";
import type { CustomerAccessory } from "./accessory-picker";

/** One renter review, already shaped for display. */
export type DressReview = {
  id: string;
  name: string;
  body: string;
  photoUrl: string | null;
};

/**
 * Everything the detail modal needs for one dress. The home page fetches this
 * for every non-hidden dress up front and hands it to <CollectionGallery>, so
 * opening the modal is instant (no extra round-trip) — the same in-memory
 * approach the design prototype uses.
 */
export type DressDetail = {
  id: string;
  name: string;
  styleName: string | null;
  price: number;
  photos: GalleryPhoto[];
  sizes: DressSize[];
  reviews: DressReview[];
};

/**
 * The dress-detail modal — the first step of the reservation wizard.
 *
 * This replaces the old /dress/[id] page: same content (photo gallery, sizes &
 * fees, reviews) but rendered as an overlay on the collection page ("/") instead
 * of a separate route. It reuses the existing <DressGallery> and
 * <DressDetailsPanel> untouched.
 *
 * LAYOUT: a centered two-column dialog on desktop (gallery left, details right)
 * and a bottom-sheet on mobile — matching the prototype's split/bottom-sheet
 * treatment. Radix Dialog gives us focus-trapping, Esc-to-close, click-outside,
 * and body scroll-lock for free (it's the same primitive the admin editors use).
 */
export function DressDetailModal({
  dress,
  accessories,
  onClose,
}: {
  dress: DressDetail;
  /** The add-on accessories offered in the reserve flow (same list for every
   *  dress). */
  accessories: CustomerAccessory[];
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay-scrim" />
        <Dialog.Content
          aria-describedby={undefined}
          // Mobile: a bottom sheet pinned to the bottom edge with rounded top
          // corners. Desktop (md+): a centered card, up to 920px wide.
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg border border-border-soft bg-background-card shadow-float md:inset-auto md:left-1/2 md:top-1/2 md:bottom-auto md:w-[min(920px,94vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg"
        >
          {/* Header — dress name (gold display serif) + style name */}
          <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-4">
            <div>
              <Dialog.Title className="font-display text-display-md uppercase tracking-display text-text-accent">
                {dress.name}
              </Dialog.Title>
              {dress.styleName ? (
                <p className="text-body-sm text-text-secondary">
                  {dress.styleName}
                </p>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="min-h-tap min-w-tap rounded-sm text-2xl leading-none text-text-secondary hover:text-text-heading focus-visible:shadow-focus"
            >
              ✕
            </Dialog.Close>
          </div>

          {/* Body — scrolls within the modal */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Two columns on desktop, stacked on mobile. */}
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              {/* Left: photo slideshow */}
              <DressGallery photos={dress.photos} dressName={dress.name} />

              {/* Right: sizes, measurements, fees, reserve */}
              {dress.sizes.length > 0 ? (
                <DressDetailsPanel
                  sizes={dress.sizes}
                  price={dress.price}
                  accessories={accessories}
                />
              ) : (
                <p className="text-body-base text-text-secondary">
                  Sizing details coming soon.
                </p>
              )}
            </div>

            {/* Reviews, full width below the two columns. */}
            {dress.reviews.length > 0 ? (
              <section className="mt-14">
                <h2 className="font-display text-display-md uppercase tracking-display text-text-accent">
                  Renter reviews
                </h2>
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {dress.reviews.map((r) => (
                    <article
                      key={r.id}
                      className="flex items-start gap-3 rounded-md bg-background-panel p-4"
                    >
                      {r.photoUrl ? (
                        <Image
                          src={r.photoUrl}
                          alt={`Photo from ${r.name}`}
                          width={48}
                          height={48}
                          className="h-12 w-12 flex-none rounded-sm border border-border-accent object-cover object-top"
                        />
                      ) : null}
                      <div>
                        <div className="mb-1.5 text-label-sm uppercase tracking-label text-text-accent">
                          {r.name}
                        </div>
                        <p className="text-body-sm text-text-primary">
                          {r.body}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
