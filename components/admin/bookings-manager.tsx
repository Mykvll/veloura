"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Clock, ShieldAlert, ImageOff } from "lucide-react";
import { niceDate } from "@/lib/reserve";
import {
  verifyBooking,
  flagBookingInvalid,
  deleteBooking,
} from "@/app/admin/(protected)/booking-actions";
import { SectionTitle } from "@/components/section-title";
import type { AdminBooking } from "./types";

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
};

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
export function BookingsManager({ bookings }: { bookings: AdminBooking[] }) {
  const router = useRouter();
  // The proof shown full-size in the lightbox, the card mid-delete-confirm, and
  // the card with an action in flight (to disable its buttons).
  const [proofView, setProofView] = useState<AdminBooking | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Which card+button has an action in flight — the kind lets each button show
  // its own "…ing" label instead of all of them changing at once.
  const [busy, setBusy] = useState<{ id: string; kind: "verify" | "invalid" | "delete" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(
    id: string,
    kind: "verify" | "invalid" | "delete",
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
      router.refresh();
    });
  }

  return (
    <div>
      {/* Centered gold section title, like every admin section. */}
      <SectionTitle subtitle="Verify payment proofs — remove bookings with fake, wrong or missing payments">
        Bookings &amp; Payments
      </SectionTitle>

      {error ? (
        <p className="mt-4 text-body-sm text-state-error">{error}</p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3.5">
        {bookings.length === 0 ? (
          <div className="rounded-lg border border-border-soft bg-background-card p-6 text-center text-body-sm text-text-secondary">
            No bookings yet.
          </div>
        ) : (
          bookings.map((b) => {
            const meta = STATUS_META[b.status] ?? STATUS_META.pending;
            const cardBusy = busy?.id === b.id;
            return (
              <div
                key={b.id}
                className="flex flex-wrap items-center gap-3.5 rounded-lg border border-border-soft bg-background-card p-4 shadow-card"
              >
                {/* Payment-proof thumbnail (tap to zoom) or an "no proof" tile. */}
                {b.proofUrl ? (
                  <button
                    type="button"
                    onClick={() => setProofView(b)}
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

                {/* Renter / dress / dates / status */}
                <div className="min-w-0 flex-1 basis-56">
                  <div className="text-label-base uppercase tracking-wide text-text-heading">
                    {b.renter} · {b.dress}
                  </div>
                  <div className="mt-0.5 text-body-sm text-text-secondary">
                    {b.start ? niceDate(b.start) : "—"}
                    {b.end ? ` – ${niceDate(b.end)}` : ""}
                    {b.deliver ? ` · deliver ${b.deliver}` : ""} · {b.contact}
                  </div>
                  <div
                    className={`mt-1.5 inline-flex items-center gap-1.5 text-label-sm uppercase tracking-wide ${meta.className}`}
                  >
                    <meta.Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {b.status !== "verified" && b.proofUrl ? (
                    <button
                      type="button"
                      onClick={() => run(b.id, "verify", verifyBooking)}
                      disabled={cardBusy}
                      className="inline-flex min-h-tap items-center justify-center rounded-pill bg-state-success px-3.5 text-label-sm uppercase tracking-wide text-text-on-primary transition-colors disabled:opacity-60"
                    >
                      {cardBusy && busy?.kind === "verify" ? "Verifying…" : "Verify"}
                    </button>
                  ) : null}

                  {b.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => run(b.id, "invalid", flagBookingInvalid)}
                      disabled={cardBusy}
                      className="inline-flex min-h-tap items-center justify-center rounded-pill border border-state-error bg-white px-3.5 text-label-sm uppercase tracking-wide text-state-error transition-colors hover:bg-background-panel disabled:opacity-60"
                    >
                      {cardBusy && busy?.kind === "invalid" ? "Marking…" : "Mark invalid"}
                    </button>
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
      </div>

      {/* Proof lightbox — the full-size signed-URL image. */}
      {proofView?.proofUrl ? (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setProofView(null);
          }}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3.5 bg-overlay-scrim-heavy p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proofView.proofUrl}
            alt={`Payment proof from ${proofView.renter}`}
            className="max-h-[70vh] max-w-[90%] rounded-md shadow-float"
          />
          <div className="text-label-sm uppercase tracking-label text-white">
            Payment proof — {proofView.renter} · tap outside to close
          </div>
        </div>
      ) : null}
    </div>
  );
}
