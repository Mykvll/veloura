"use client";

import { useEffect, useState } from "react";
import { DressCard } from "./dress-card";
import {
  DressDetailModal,
  type DressDetail,
  type ResumeHold,
} from "./dress-detail-modal";
import type { CustomerAccessory } from "./accessory-picker";
import type { PaymentOption } from "./reserve/payment-step";
import type { BlockedDate } from "./availability-calendar";
import { createClient } from "@/lib/supabase/client";
import { loadHold, clearHold } from "@/lib/hold-storage";

/**
 * The collection grid + dress-detail modal, on one page ("/").
 *
 * This is the client half of the collection page. The server page fetches every
 * non-hidden dress (with all the detail the modal needs) and passes them here;
 * this component renders the card grid and owns which dress's modal is open.
 *
 * MODAL STATE: we keep a single `openId` (the dress being viewed) rather than a
 * boolean + a copy of the dress. Tapping a card sets `openId`; the modal reads
 * the matching dress straight out of the `dresses` array we already have.
 *
 * REFRESH RESUME: on mount we check sessionStorage for an in-progress payment
 * hold (see payment-window-refresh.md). If one is still live server-side, we
 * reopen its dress straight on the payment step with the countdown resumed.
 */
export function CollectionGallery({
  dresses,
  accessories,
  paymentMethods,
  blockedDates,
  fittingsBooked,
}: {
  dresses: DressDetail[];
  /** Add-on accessories for the reserve flow — the same list for every dress. */
  accessories: CustomerAccessory[];
  /** Payment channels (with QR images) for the payment step. */
  paymentMethods: PaymentOption[];
  /** Every blocked (rental + wash) day across all dresses, for the calendar. */
  blockedDates: BlockedDate[];
  /** Already-taken fitting times keyed by date, for the fitting form. */
  fittingsBooked: Record<string, string[]>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // A hold recovered after a refresh, plus the dress it belongs to.
  const [resume, setResume] = useState<ResumeHold | null>(null);
  const [resumeDressId, setResumeDressId] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadHold();
    if (!stored) return;
    // Only resume a dress we actually have on the page.
    if (!dresses.some((d) => d.id === stored.dressId)) {
      clearHold();
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_hold_status", {
        p_booking_id: stored.bookingId,
      });
      if (cancelled) return;
      const s = data as {
        status?: string;
        hold_expires_at?: string;
        server_now?: string;
      } | null;
      const live =
        !error &&
        s &&
        s.status === "hold" &&
        s.hold_expires_at &&
        s.server_now &&
        new Date(s.hold_expires_at).getTime() > new Date(s.server_now).getTime();
      if (!live) {
        clearHold();
        return;
      }
      setResume({
        bookingId: stored.bookingId,
        date: stored.date,
        total: stored.total,
        holdExpiresAt: s!.hold_expires_at!,
        serverNow: s!.server_now!,
        methodId: stored.methodId,
        proofPath: stored.proofPath,
      });
      setResumeDressId(stored.dressId);
      setOpenId(stored.dressId);
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDress = dresses.find((d) => d.id === openId) ?? null;

  const closeModal = () => {
    setOpenId(null);
    // A resumed session is one-shot: after it closes, reopening the dress starts
    // a fresh reservation rather than re-entering the old hold.
    setResume(null);
    setResumeDressId(null);
  };

  return (
    <>
      {/* Responsive grid: 2 columns on mobile, 3 on tablet, 4 on desktop. */}
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
        {dresses.map((dress) => (
          <DressCard
            key={dress.id}
            dress={{
              id: dress.id,
              name: dress.name,
              styleName: dress.styleName,
              price: dress.price,
              // The gallery photos are pre-sorted (cover first), so photo 0 is
              // the cover to show on the card.
              coverUrl: dress.photos[0]?.url ?? null,
            }}
            onClick={() => setOpenId(dress.id)}
          />
        ))}
      </div>

      {/* Detail modal — rendered only while a dress is open. */}
      {openDress ? (
        <DressDetailModal
          key={openDress.id}
          dress={openDress}
          accessories={accessories}
          paymentMethods={paymentMethods}
          blockedDates={blockedDates}
          fittingsBooked={fittingsBooked}
          resume={resumeDressId === openDress.id ? (resume ?? undefined) : undefined}
          onClose={closeModal}
        />
      ) : null}
    </>
  );
}
