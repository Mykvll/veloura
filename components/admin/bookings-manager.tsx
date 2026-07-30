"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Clock,
  ShieldAlert,
  ImageOff,
  PenLine,
  RotateCcw,
  Ruler,
  X,
} from "lucide-react";
import { niceDate } from "@/lib/reserve";
import {
  verifyBooking,
  flagBookingInvalid,
  deleteBooking,
  markBookingRefunded,
} from "@/app/admin/(protected)/booking-actions";
import { cancelFitting } from "@/app/admin/(protected)/fitting-actions";
import { SectionTitle } from "@/components/section-title";
import {
  ManualBookingModal,
  type ManualBookingDressOption,
  type ManualBookingAccessoryOption,
} from "./manual-booking-modal";
import { FittingEditorModal } from "./fitting-editor-modal";
import type { AdminBooking, AdminFitting } from "./types";

/**
 * Status → label + colour + icon. Gold for "awaiting", olive for verified,
 * clay/red for the two bad states.
 */
const STATUS_META: Record<
  string,
  { label: string; className: string; Icon: typeof BadgeCheck }
> = {
  verified: {
    label: "Payment verified",
    className: "text-state-success",
    Icon: BadgeCheck,
  },
  pending: {
    label: "Awaiting verification",
    className: "text-text-accent",
    Icon: Clock,
  },
  invalid: {
    label: "Invalid / fake proof",
    className: "text-state-error",
    Icon: ShieldAlert,
  },
  none: {
    label: "No payment uploaded",
    className: "text-state-error",
    Icon: ImageOff,
  },
  refunded: {
    label: "Refunded",
    className: "text-text-secondary",
    Icon: RotateCcw,
  },
};

/** "Jul 13, 2026 · 3:42 PM" — when the booking was made. */
function bookedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Whole-peso amount, matching the rest of the admin UI. */
function peso(n: number): string {
  return `₱${n.toLocaleString("en-PH")}`;
}

/** One label/value row inside the details modal. Hidden when there's no value,
 *  so a manual booking (no address/contact/etc.) simply shows fewer rows. */
function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-border-soft py-2.5 last:border-b-0 sm:flex-row sm:gap-4">
      <span className="text-label-sm uppercase tracking-label text-text-secondary sm:w-40 sm:flex-none">
        {label}
      </span>
      <span className="text-body-base text-text-primary">{value}</span>
    </div>
  );
}

/**
 * Full booking details in a modal — everything the customer filled on the
 * reserve form, plus the payment proof + valid ID. Opened by clicking a booking
 * card. Read-only: the verify/refund/delete actions stay on the card.
 */
function BookingDetailsModal({
  booking: b,
  onClose,
  onViewImage,
}: {
  booking: AdminBooking;
  onClose: () => void;
  onViewImage: (src: string, caption: string) => void;
}) {
  const meta = STATUS_META[b.status] ?? STATUS_META.pending;
  const dates =
    b.start || b.end
      ? `${b.start ? niceDate(b.start) : "—"}${b.end ? ` – ${niceDate(b.end)}` : ""}`
      : null;
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim-heavy p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-float">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft p-6">
          <h2 className="font-display text-display-md uppercase tracking-display text-text-accent">
            Booking Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-background-panel"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* All the fields, scrollable when tall. */}
        <div className="overflow-y-auto px-6 py-4">
          <DetailRow label="Renter" value={b.renter} />
          <DetailRow label="Dress" value={b.dress} />
          <DetailRow
            label="Status"
            value={
              <span
                className={`inline-flex items-center gap-1.5 text-label-sm uppercase tracking-wide ${meta.className}`}
              >
                <meta.Icon className="h-3.5 w-3.5" />
                {meta.label}
              </span>
            }
          />
          <DetailRow label="Rental dates" value={dates} />
          <DetailRow label="Delivery time" value={b.deliver} />
          <DetailRow label="Contact" value={b.contact} />
          <DetailRow label="Address" value={b.address} />
          <DetailRow label="Payment method" value={b.paymentMethod} />
          <DetailRow label="Amount" value={peso(b.amount)} />
          <DetailRow
            label="Add-ons"
            value={b.accessories.length > 0 ? b.accessories.join(", ") : null}
          />
          <DetailRow
            label="Booked"
            value={b.manual ? "Manual booking" : bookedLabel(b.bookedAt)}
          />

          {/* Payment proof + valid ID — tap to view full-size. */}
          {b.proofUrl || b.idPhotoUrl ? (
            <div className="mt-4 flex flex-wrap gap-4">
              {b.proofUrl ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-label-sm uppercase tracking-label text-text-secondary">
                    Payment proof
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onViewImage(b.proofUrl!, `Payment proof — ${b.renter}`)
                    }
                    className="rounded-sm border border-border-soft focus-visible:shadow-focus"
                    aria-label={`View payment proof from ${b.renter}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.proofUrl}
                      alt={`Payment proof from ${b.renter}`}
                      className="h-32 w-32 cursor-zoom-in rounded-sm object-cover"
                    />
                  </button>
                </div>
              ) : null}
              {b.idPhotoUrl ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-label-sm uppercase tracking-label text-text-secondary">
                    Valid ID
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onViewImage(b.idPhotoUrl!, `Valid ID — ${b.renter}`)
                    }
                    className="rounded-sm border border-border-soft focus-visible:shadow-focus"
                    aria-label={`View valid ID from ${b.renter}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.idPhotoUrl}
                      alt={`Valid ID from ${b.renter}`}
                      className="h-32 w-32 cursor-zoom-in rounded-sm object-cover"
                    />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The "Bookings & Payments" section (admin.html → BookingsSection).
 *
 * One card per rental: the payment-proof thumbnail, the renter/dress/dates/
 * delivery/contact, the payment status, and the actions — Verify, Mark invalid,
 * Delete (with an inline confirm; deleting frees the dates). Tapping the proof
 * opens it full-size in a lightbox.
 *
 * The proof lives in the PRIVATE `payment-proofs` bucket, so `b.proofUrl` is a
 * short-lived SIGNED URL the server minted (see the admin page) — there is no
 * public URL for it. Verifying/flagging/deleting all run on the server, where
 * accessory stock is kept in sync (see booking-actions.ts).
 */
export function BookingsManager({
  bookings,
  fittings,
  dresses,
  accessories,
}: {
  bookings: AdminBooking[];
  /** Upcoming fitting appointments — shown as gold cards interleaved with the
   *  rental cards, and editable/cancellable from here. */
  fittings: AdminFitting[];
  /** The catalogue, for the Add-manual-booking + Add-fitting dress pickers. */
  dresses: ManualBookingDressOption[];
  /** Add-ons (with their at-capacity days) for the manual-booking picker. */
  accessories: ManualBookingAccessoryOption[];
}) {
  const router = useRouter();
  // The image shown full-size in the lightbox — either a payment proof or a
  // renter's valid ID, so one viewer serves both.
  const [lightbox, setLightbox] = useState<{
    src: string;
    caption: string;
  } | null>(null);
  // The booking whose full details are open in the details modal.
  const [detailView, setDetailView] = useState<AdminBooking | null>(null);
  const [adding, setAdding] = useState(false);
  // The fitting editor: "new" to add one, an AdminFitting to reschedule it, or
  // null when closed.
  const [fittingEdit, setFittingEdit] = useState<AdminFitting | "new" | null>(
    null,
  );
  // Which fitting card is showing its inline "Cancel …?" confirm, and which is
  // mid-cancel (its own busy flag, separate from the rental actions').
  const [cancelFitId, setCancelFitId] = useState<string | null>(null);
  const [fitBusy, setFitBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmRefundId, setConfirmRefundId] = useState<string | null>(null);
  // Which card+button has an action in flight — the kind lets each button show
  // its own "…ing" label instead of all of them changing at once.
  const [busy, setBusy] = useState<{
    id: string;
    kind: "verify" | "invalid" | "delete" | "refund";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(
    id: string,
    kind: "verify" | "invalid" | "delete" | "refund",
    action: (id: string) => Promise<{ error: string | null }>,
  ) {
    setError(null);
    setBusy({ id, kind });
    startTransition(async () => {
      const res = await action(id);
      setBusy(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      setConfirmId(null);
      setConfirmRefundId(null);
      router.refresh();
    });
  }

  /** Cancel (delete) a fitting after its inline confirm. */
  function runCancelFit(id: string) {
    setError(null);
    setFitBusy(id);
    startTransition(async () => {
      const res = await cancelFitting(id);
      setFitBusy(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      setCancelFitId(null);
      router.refresh();
    });
  }

  // Rentals and fittings share one list, newest booked first (their created_at).
  // Each renders its own card kind; a fitting has no payment to verify, so it's
  // never in the same visual family as a rental card.
  type Item =
    | { kind: "rental"; sort: string; b: AdminBooking }
    | { kind: "fitting"; sort: string; f: AdminFitting };
  const items: Item[] = [
    ...bookings.map(
      (b): Item => ({ kind: "rental", sort: b.bookedAt ?? "", b }),
    ),
    ...fittings.map(
      (f): Item => ({ kind: "fitting", sort: f.createdAt ?? "", f }),
    ),
  ].sort((a, b) => b.sort.localeCompare(a.sort));

  return (
    <div>
      {/* Centered gold section title, like every admin section. */}
      <SectionTitle subtitle="Rentals & fittings — completed rentals move to Rental History automatically">
        Bookings
      </SectionTitle>

      {error ? (
        <p className="mt-4 text-body-sm text-state-error">{error}</p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3.5">
        {items.length === 0 ? (
          <div className="rounded-lg border border-border-soft bg-background-card p-6 text-center text-body-sm text-text-secondary">
            No active bookings — completed rentals live in Rental History.
          </div>
        ) : (
          items.map((item) => {
            // Fitting appointment — a gold card, no payment to verify. Reschedule
            // opens the editor pre-filled; Cancel deletes it (inline confirm).
            if (item.kind === "fitting") {
              const f = item.f;
              return (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center gap-3.5 rounded-lg border border-border-accent bg-background-card p-4 shadow-card"
                >
                  {/* Gold icon tile stands in for the missing proof thumbnail. */}
                  <span className="flex h-16 w-16 flex-none items-center justify-center rounded-sm bg-brand-primary text-text-on-primary">
                    <Ruler className="h-5 w-5" />
                  </span>

                  <div className="min-w-0 flex-1 basis-56">
                    <div className="text-label-base uppercase tracking-wide text-text-heading">
                      {f.name} · {f.dress}
                    </div>
                    <div className="mt-0.5 text-body-sm text-text-secondary">
                      {niceDate(f.date)}
                      {f.time ? ` · ${f.time}` : ""}
                      {f.contact ? ` · ${f.contact}` : ""}
                    </div>
                    <div className="mt-1.5 inline-flex items-center gap-1.5 text-label-sm uppercase tracking-wide text-text-accent">
                      <Ruler className="h-3.5 w-3.5" />
                      Fitting appointment — no dates blocked
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setFittingEdit(f);
                      }}
                      className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-accent bg-white px-3.5 text-label-sm uppercase tracking-wide text-text-accent transition-colors hover:bg-background-panel"
                    >
                      Reschedule
                    </button>

                    {cancelFitId === f.id ? (
                      <span className="inline-flex flex-wrap items-center gap-2 rounded-md bg-background-panel px-3 py-2 text-body-sm text-text-primary">
                        Cancel {f.name}&apos;s fitting?
                        <button
                          type="button"
                          onClick={() => runCancelFit(f.id)}
                          disabled={fitBusy === f.id}
                          className="inline-flex min-h-tap items-center justify-center rounded-pill bg-state-error px-3.5 text-label-sm uppercase tracking-wide text-text-on-primary transition-colors disabled:opacity-60"
                        >
                          {fitBusy === f.id ? "Cancelling…" : "Yes, cancel"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCancelFitId(null)}
                          disabled={fitBusy === f.id}
                          className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-3.5 text-label-sm uppercase tracking-wide text-text-primary transition-colors hover:bg-background-panel disabled:opacity-60"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setCancelFitId(f.id);
                        }}
                        className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-3.5 text-label-sm uppercase tracking-wide text-state-error transition-colors hover:bg-background-panel"
                      >
                        Cancel fitting
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            const b = item.b;
            let meta = STATUS_META[b.status] ?? STATUS_META.pending;
            // A manual booking has no proof to inspect, so its states read as
            // plain money facts, not verification steps.
            if (b.manual) {
              if (b.status === "verified")
                meta = { ...meta, label: "Paid" };
              else if (b.status === "pending")
                meta = { ...meta, label: "Not yet paid" };
            }
            const cardBusy = busy?.id === b.id;
            return (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailView(b)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailView(b);
                  }
                }}
                aria-label={`View full details for ${b.renter}'s booking`}
                className="flex cursor-pointer flex-wrap items-center gap-3.5 rounded-lg border border-border-soft bg-background-card p-4 shadow-card transition-colors hover:border-brand-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
              >
                {/* Payment-proof thumbnail (tap to zoom) or an "no proof" tile. */}
                {b.proofUrl ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation(); // don't also open the details modal
                      setLightbox({
                        src: b.proofUrl!,
                        caption: `Payment proof — ${b.renter}`,
                      });
                    }}
                    aria-label={`View payment proof from ${b.renter}`}
                    className="flex-none rounded-sm border border-border-soft focus-visible:shadow-focus"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.proofUrl}
                      alt={`Payment proof from ${b.renter}`}
                      className="h-16 w-16 cursor-zoom-in rounded-sm object-cover"
                    />
                  </button>
                ) : (
                  <span className="flex h-16 w-16 flex-none items-center justify-center rounded-sm bg-background-panel text-text-secondary">
                    <ImageOff className="h-5 w-5" />
                  </span>
                )}

                {/* Renter's valid ID thumbnail — sits beside the proof so the
                    admin can match the ID against the payer while verifying.
                    Manual bookings never carry an ID upload, so no tile shows. */}
                {b.idPhotoUrl ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation(); // don't also open the details modal
                      setLightbox({
                        src: b.idPhotoUrl!,
                        caption: `Valid ID — ${b.renter}`,
                      });
                    }}
                    aria-label={`View valid ID from ${b.renter}`}
                    className="relative flex-none rounded-sm border border-border-soft focus-visible:shadow-focus"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.idPhotoUrl}
                      alt={`Valid ID from ${b.renter}`}
                      className="h-16 w-16 cursor-zoom-in rounded-sm object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-overlay-scrim-heavy py-0.5 text-center text-[10px] uppercase tracking-wide text-white">
                      ID
                    </span>
                  </button>
                ) : null}

                {/* Renter / dress / dates / status */}
                <div className="min-w-0 flex-1 basis-56">
                  <div className="text-label-base uppercase tracking-wide text-text-heading">
                    {b.renter} · {b.dress}
                  </div>
                  <div className="mt-0.5 text-body-sm text-text-secondary">
                    {b.start ? niceDate(b.start) : "—"}
                    {b.end ? ` – ${niceDate(b.end)}` : ""}
                    {b.deliver ? ` · deliver ${b.deliver}` : ""}
                    {b.contact ? ` · ${b.contact}` : ""}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 text-label-sm uppercase tracking-wide ${meta.className}`}
                    >
                      <meta.Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                    {/* Badge: admin-entered, so it can't pass for an app booking. */}
                    {b.manual ? (
                      <span className="inline-flex items-center gap-1.5 rounded-pill border border-border-strong px-2.5 py-0.5 text-label-sm uppercase tracking-label text-text-secondary">
                        <PenLine className="h-3.5 w-3.5" />
                        Manual booking
                      </span>
                    ) : null}
                  </div>
                  {/* Add-ons going out with this rental — the hand-over
                      checklist. These also hold the accessory for these dates. */}
                  {b.accessories.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-label-sm uppercase tracking-label text-text-secondary">
                        Add-ons:
                      </span>
                      {b.accessories.map((name) => (
                        <span
                          key={name}
                          className="rounded-pill bg-background-panel px-2.5 py-0.5 text-body-sm text-text-primary"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {b.bookedAt ? (
                    <div className="mt-1 text-body-sm text-text-secondary">
                      Booked {bookedLabel(b.bookedAt)}
                    </div>
                  ) : null}
                </div>

                {/* Actions. A manual booking has no proof — its "verify" is a
                    plain Mark-paid (same action; there are no add-ons whose
                    stock could shift), and "Mark invalid" makes no sense.
                    stopPropagation so acting on a card never opens its details. */}
                <div
                  className="flex flex-wrap items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {b.status !== "verified" && (b.proofUrl || b.manual) ? (
                    <button
                      type="button"
                      onClick={() => run(b.id, "verify", verifyBooking)}
                      disabled={cardBusy}
                      className="inline-flex min-h-tap items-center justify-center rounded-pill bg-state-success px-3.5 text-label-sm uppercase tracking-wide text-text-on-primary transition-colors disabled:opacity-60"
                    >
                      {cardBusy && busy?.kind === "verify"
                        ? b.manual
                          ? "Marking…"
                          : "Verifying…"
                        : b.manual
                          ? "Mark paid"
                          : "Verify"}
                    </button>
                  ) : null}

                  {b.status === "pending" && !b.manual ? (
                    <button
                      type="button"
                      onClick={() => run(b.id, "invalid", flagBookingInvalid)}
                      disabled={cardBusy}
                      className="inline-flex min-h-tap items-center justify-center rounded-pill border border-state-error bg-white px-3.5 text-label-sm uppercase tracking-wide text-state-error transition-colors hover:bg-background-panel disabled:opacity-60"
                    >
                      {cardBusy && busy?.kind === "invalid" ? "Marking…" : "Mark invalid"}
                    </button>
                  ) : null}

                  {/* Refund — records a refund (kept as a "Refunded" record) and
                      frees the dates. Offered for paid / awaiting bookings. */}
                  {b.status === "pending" || b.status === "verified" ? (
                    confirmRefundId === b.id ? (
                      <span className="inline-flex flex-wrap items-center gap-2 rounded-md bg-background-panel px-3 py-2 text-body-sm text-text-primary">
                        Mark refunded &amp; free the dates?
                        <button
                          type="button"
                          onClick={() => run(b.id, "refund", markBookingRefunded)}
                          disabled={cardBusy}
                          className="inline-flex min-h-tap items-center justify-center rounded-pill bg-text-secondary px-3.5 text-label-sm uppercase tracking-wide text-text-on-primary transition-colors disabled:opacity-60"
                        >
                          {cardBusy && busy?.kind === "refund"
                            ? "Refunding…"
                            : "Yes, refunded"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRefundId(null)}
                          disabled={cardBusy}
                          className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-3.5 text-label-sm uppercase tracking-wide text-text-primary transition-colors hover:bg-background-panel disabled:opacity-60"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setConfirmRefundId(b.id);
                        }}
                        className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-3.5 text-label-sm uppercase tracking-wide text-text-secondary transition-colors hover:bg-background-panel"
                      >
                        Mark refunded
                      </button>
                    )
                  ) : null}

                  {confirmId === b.id ? (
                    <span className="inline-flex flex-wrap items-center gap-2 rounded-md bg-background-panel px-3 py-2 text-body-sm text-text-primary">
                      Delete &amp; free the dates?
                      <button
                        type="button"
                        onClick={() => run(b.id, "delete", deleteBooking)}
                        disabled={cardBusy}
                        className="inline-flex min-h-tap items-center justify-center rounded-pill bg-state-error px-3.5 text-label-sm uppercase tracking-wide text-text-on-primary transition-colors disabled:opacity-60"
                      >
                        {cardBusy && busy?.kind === "delete" ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        disabled={cardBusy}
                        className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-3.5 text-label-sm uppercase tracking-wide text-text-primary transition-colors hover:bg-background-panel disabled:opacity-60"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setConfirmId(b.id);
                      }}
                      className="inline-flex min-h-tap items-center justify-center rounded-pill border border-border-soft bg-white px-3.5 text-label-sm uppercase tracking-wide text-state-error transition-colors hover:bg-background-panel"
                    >
                      Delete booking
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Two dashed add-tiles side by side (stacked on narrow screens): a
            manual rental, and a fitting appointment. */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-[110px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-background-card text-text-secondary transition duration-fast ease-soft hover:border-brand-primary hover:text-text-heading focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-brand-primary text-2xl leading-none text-text-on-primary">
              +
            </span>
            <span className="text-label-base uppercase tracking-label">
              Add manual booking
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setFittingEdit("new");
            }}
            className="flex min-h-[110px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-accent bg-background-card text-text-secondary transition duration-fast ease-soft hover:border-brand-primary hover:text-text-heading focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-primary/35"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-brand-primary text-text-on-primary">
              <Ruler className="h-[18px] w-[18px]" />
            </span>
            <span className="text-label-base uppercase tracking-label">
              Add fitting
            </span>
          </button>
        </div>
      </div>

      {/* Add-manual-booking modal — fresh instance each time it opens. */}
      {adding ? (
        <ManualBookingModal
          dresses={dresses}
          accessories={accessories}
          bookings={bookings}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {/* Fitting editor — "new" to add, or an AdminFitting to reschedule/edit.
          It reads the same rentals (for the dress's out-days) and fittings (for
          the double-booking notice) the list shows. */}
      {fittingEdit ? (
        <FittingEditorModal
          dresses={dresses}
          rentals={bookings}
          fittings={fittings}
          editing={fittingEdit === "new" ? null : fittingEdit}
          onClose={() => setFittingEdit(null)}
        />
      ) : null}

      {/* Full booking details — opened by clicking a card. The lightbox below
          sits at a higher z-index so images can still open over it. */}
      {detailView ? (
        <BookingDetailsModal
          booking={detailView}
          onClose={() => setDetailView(null)}
          onViewImage={(src, caption) => setLightbox({ src, caption })}
        />
      ) : null}

      {/* Lightbox — the full-size signed-URL image (payment proof or valid ID). */}
      {lightbox ? (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightbox(null);
          }}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3.5 bg-overlay-scrim-heavy p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.src}
            alt={lightbox.caption}
            className="max-h-[70vh] max-w-[90%] rounded-md shadow-float"
          />
          <div className="text-label-sm uppercase tracking-label text-white">
            {lightbox.caption} · tap outside to close
          </div>
        </div>
      ) : null}
    </div>
  );
}
