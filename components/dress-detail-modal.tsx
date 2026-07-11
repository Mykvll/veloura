"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { DressGallery, type GalleryPhoto } from "./dress-gallery";
import { DressDetailsPanel, type DressSize } from "./dress-details-panel";
import type { CustomerAccessory } from "./accessory-picker";
import {
  AvailabilityCalendar,
  type BlockedDate,
} from "./availability-calendar";
import { RentForm, type RentContinueData } from "./reserve/rent-form";
import { FittingForm } from "./reserve/fitting-form";
import { PaymentStep, type PaymentOption } from "./reserve/payment-step";
import { niceDate } from "@/lib/reserve";

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
  paymentMethods,
  blockedDates,
  fittingsBooked,
  onClose,
}: {
  dress: DressDetail;
  /** The add-on accessories offered in the reserve flow (same list for every
   *  dress). */
  accessories: CustomerAccessory[];
  /** The payment channels (with QR images) offered in the payment step. */
  paymentMethods: PaymentOption[];
  /** Blocked (rental + wash) days across all dresses, for the date calendar. */
  blockedDates: BlockedDate[];
  /** Already-taken fitting times, keyed by date, for the fitting form. */
  fittingsBooked: Record<string, string[]>;
  onClose: () => void;
}) {
  // The wizard step. "details" is the dress page; "date" is the calendar +
  // reserve/fitting form (reached by Reserve / Book-a-fitting); "payment" is the
  // rent-only payment step; "done" is the confirmation after the booking is
  // saved. `mode` picks rent vs fitting.
  const [step, setStep] = useState<"details" | "date" | "payment" | "done">(
    "details",
  );
  const [mode, setMode] = useState<"rent" | "fitting">("rent");
  const [date, setDate] = useState<string | null>(null);

  // The rent details carried from the form into the payment step (the booking
  // isn't saved until payment proof is submitted). Null until "Continue to
  // payment" is pressed.
  const [payment, setPayment] = useState<RentContinueData | null>(null);

  // Open the calendar in the requested mode, clearing any earlier pick.
  const goToDate = (m: "rent" | "fitting") => {
    setMode(m);
    setDate(null);
    setStep("date");
  };

  // The payment step must not be dismissable by Esc or clicking outside — only
  // the explicit Cancel button (with a warning) exits it.
  const locked = step === "payment";

  // The header subtitle tracks the step (prototype's subtitleMap).
  const subtitle =
    step === "done"
      ? "Reservation received"
      : step === "payment"
        ? "Payment"
        : step === "date"
          ? mode === "fitting"
            ? "Reserve a date — fitting"
            : "Reserve a date"
          : dress.styleName;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay-scrim" />
        <Dialog.Content
          aria-describedby={undefined}
          // During the payment step, block the built-in dismissals (Esc,
          // click/focus outside) so the only way out is the explicit Cancel.
          onEscapeKeyDown={(e) => locked && e.preventDefault()}
          onInteractOutside={(e) => locked && e.preventDefault()}
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
              {subtitle ? (
                <p className="text-body-sm text-text-secondary">{subtitle}</p>
              ) : null}
            </div>
            {/* No close ✕ on the payment step — Cancel (with a warning) is the
                only way out. */}
            {locked ? null : (
              <Dialog.Close
                aria-label="Close"
                className="min-h-tap min-w-tap rounded-sm text-2xl leading-none text-text-secondary hover:text-text-heading focus-visible:shadow-focus"
              >
                ✕
              </Dialog.Close>
            )}
          </div>

          {/* Body — scrolls within the modal */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {step === "done" ? (
              // Final step: confirmation after the booking is saved (pending).
              <div className="mx-auto flex max-w-md flex-col items-center gap-3.5 py-4 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary text-3xl leading-none text-text-on-primary">
                  ✓
                </span>
                <div className="font-display text-display-md uppercase tracking-display text-text-accent">
                  {mode === "fitting" ? "Fitting booked" : "You're all set"}
                </div>
                <p className="text-body-base text-text-primary">
                  {mode === "fitting" ? (
                    <>
                      <b>{dress.name}</b> fitting on <b>{date && niceDate(date)}</b>.
                    </>
                  ) : (
                    <>
                      <b>{dress.name}</b> is reserved for{" "}
                      <b>{date && niceDate(date)}</b> while we verify your payment.
                    </>
                  )}
                </p>
                <p className="text-body-sm text-text-secondary">
                  Our team will confirm and send you a text once verified. Your
                  date is held in the meantime.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 flex min-h-tap items-center justify-center rounded-lg bg-brand-primary px-6 text-label-base uppercase tracking-label text-text-on-primary transition-fast hover:bg-brand-primary-hover"
                >
                  Back to the collection
                </button>
              </div>
            ) : step === "payment" && payment ? (
              // Step 3 (rent only): pay the amount due and submit proof. This is
              // where the booking row is actually written.
              <PaymentStep
                dressName={dress.name}
                date={payment.input.date}
                total={payment.total}
                methods={paymentMethods}
                input={payment.input}
                onPaid={() => setStep("done")}
                onCancel={onClose}
              />
            ) : step === "date" ? (
              // Step 2: pick a date (left) and fill the reserve/fitting form
              // (right) — the prototype's split "Reserve a date" step.
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("details");
                    setDate(null);
                  }}
                  className="mb-4 min-h-tap text-body-sm text-text-secondary hover:text-text-heading"
                >
                  ← Back to details
                </button>
                <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
                  <AvailabilityCalendar
                    blocked={blockedDates}
                    dressId={dress.id}
                    mode={mode}
                    selected={date}
                    onSelect={setDate}
                  />
                  {mode === "rent" ? (
                    <RentForm
                      dress={{
                        id: dress.id,
                        name: dress.name,
                        price: dress.price,
                      }}
                      accessories={accessories}
                      date={date}
                      onContinue={(data) => {
                        setPayment(data);
                        setStep("payment");
                      }}
                    />
                  ) : (
                    <FittingForm
                      dress={{ id: dress.id, name: dress.name }}
                      date={date}
                      bookedTimes={date ? (fittingsBooked[date] ?? []) : []}
                      onDone={() => setStep("done")}
                    />
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Two columns on desktop, stacked on mobile. */}
                <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
                  {/* Left: photo slideshow */}
                  <DressGallery photos={dress.photos} dressName={dress.name} />

                  {/* Right: sizes, measurements, fees, reserve */}
                  {dress.sizes.length > 0 ? (
                    <DressDetailsPanel
                      sizes={dress.sizes}
                      price={dress.price}
                      onReserve={() => goToDate("rent")}
                      onFitting={() => goToDate("fitting")}
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
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
