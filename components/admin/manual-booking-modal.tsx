"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { addDays } from "@/lib/reserve";
import { createManualBooking } from "@/app/admin/(protected)/booking-actions";
import { ManualBookingCalendar } from "./manual-booking-calendar";
import type { AdminBooking } from "./types";

/* Small brand-token field primitives, mirroring the other admin modals. */

function FieldLabel({
  children,
  required,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
      <span className="text-label-sm uppercase tracking-label text-text-heading">
        {children}
        {required ? <span className="text-text-accent"> *</span> : null}
      </span>
    </div>
  );
}

const inputClass =
  "min-h-tap w-full rounded-sm border border-border-soft bg-white px-4 py-2 text-body-base text-text-primary outline-none placeholder:text-text-secondary focus:border-border-accent focus:shadow-focus";

/** How a clashing booking's status reads in the override confirm. */
function conflictStatusLabel(status: string): string {
  if (status === "hold") return "being held (unpaid)";
  if (status === "verified") return "booked & paid";
  return "reserved (awaiting payment)";
}

/** A dress the admin can book manually. */
export type ManualBookingDressOption = {
  id: string;
  name: string;
};

/**
 * Add one manual booking (FB/IG/TikTok DM or walk-in) in a modal.
 *
 * The customer reserve step's split layout: availability calendar on the left,
 * form on the right — but with the admin's rules. Any start/end range, past or
 * future; the only off-limits days are ones the dress is with another
 * customer. Wash days show a taupe heads-up dot yet stay pickable (the admin
 * does the washing and knows when the dress will be ready). Range picking:
 * tap a day to start, tap a later open day to extend, tap anywhere else to
 * restart — a range can never cross another customer's booking.
 *
 * `bookings` is the Bookings section's own row list; the taken/wash days for
 * the chosen dress are derived from it right here, so the calendar always
 * agrees with what the admin sees in the list. The server action re-checks
 * the range against the live table before inserting, like the customer flow.
 */
export function ManualBookingModal({
  dresses,
  bookings,
  onClose,
}: {
  dresses: ManualBookingDressOption[];
  bookings: AdminBooking[];
  onClose: () => void;
}) {
  const router = useRouter();

  const [dressId, setDressId] = useState("");
  const [renterName, setRenterName] = useState("");
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [paid, setPaid] = useState(true);

  const [error, setError] = useState<string | null>(null);
  // Set when the chosen dates clash with a customer booking — prompts the
  // admin to confirm the override before we displace anyone.
  const [conflict, setConflict] = useState<{
    renter: string;
    status: string;
    count: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // The chosen dress's days-with-a-customer (start..end of every active
  // rental) and its wash days (end + 1). A wash day that's also another
  // rental's day counts as taken — the harder rule wins.
  const { taken, wash } = useMemo(() => {
    const taken = new Set<string>();
    const washAll = new Set<string>();
    if (dressId) {
      for (const b of bookings) {
        if (b.dressId !== dressId) continue;
        if (b.status !== "pending" && b.status !== "verified") continue;
        if (!b.start || !b.end) continue;
        for (let d = b.start; d <= b.end; d = addDays(d, 1)) taken.add(d);
        washAll.add(addDays(b.end, 1));
      }
    }
    const wash = new Set([...washAll].filter((w) => !taken.has(w)));
    return { taken, wash };
  }, [bookings, dressId]);

  /** Range picking: start on any open day; extend forward while no taken day
   *  sits inside the range; any other tap restarts at the tapped day. */
  function pick(day: string) {
    setError(null);
    if (!selStart || day < selStart) {
      setSelStart(day);
      setSelEnd(null);
      return;
    }
    for (let d = selStart; d <= day; d = addDays(d, 1)) {
      if (taken.has(d)) {
        setSelStart(day);
        setSelEnd(null);
        return;
      }
    }
    setSelEnd(day === selStart ? null : day);
  }

  function pickDress(id: string) {
    setDressId(id);
    // A range picked for one dress means nothing for another — clear it.
    setSelStart(null);
    setSelEnd(null);
  }

  const canSave =
    dressId !== "" && renterName.trim().length > 0 && selStart !== null;

  function submit(override: boolean) {
    if (!selStart) return;
    setError(null);
    startTransition(async () => {
      const res = await createManualBooking({
        dressId,
        renterName,
        startDate: selStart,
        endDate: selEnd ?? selStart,
        paid,
        override,
      });
      // A clash the admin hasn't confirmed yet — ask before displacing.
      if (res.conflict && !override) {
        setConflict(res.conflict);
        return;
      }
      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function handleSave() {
    setConflict(null);
    submit(false);
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay-scrim" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(920px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border-soft bg-background-card shadow-float"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-4">
            <div>
              <Dialog.Title className="font-display text-display-lg uppercase tracking-display text-text-accent md:text-display-xl">
                Add manual booking
              </Dialog.Title>
              <p className="text-body-sm text-text-secondary">
                A booking you took over FB / IG / TikTok or in person
              </p>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="min-h-tap min-w-tap rounded-sm text-2xl leading-none text-text-secondary hover:text-text-heading focus-visible:shadow-focus"
            >
              ✕
            </Dialog.Close>
          </div>

          {/* Body — calendar left, form right (stacked on mobile). */}
          <div className="grid grid-cols-1 gap-10 overflow-y-auto px-6 py-6 md:grid-cols-2">
            <ManualBookingCalendar
              taken={taken}
              wash={wash}
              selStart={selStart}
              selEnd={selEnd}
              disabled={dressId === ""}
              onPick={pick}
            />

            <div className="flex flex-col gap-4">
              {/* Dress */}
              <div>
                <FieldLabel required>Dress</FieldLabel>
                <select
                  className={inputClass}
                  value={dressId}
                  onChange={(e) => pickDress(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a dress…
                  </option>
                  {dresses.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Renter */}
              <div>
                <FieldLabel required>Renter&apos;s name</FieldLabel>
                <input
                  className={inputClass}
                  placeholder="e.g. Maria Santos"
                  value={renterName}
                  onChange={(e) => setRenterName(e.target.value)}
                />
              </div>

              {/* Payment — set directly; there is no proof to upload. */}
              <div>
                <FieldLabel required>Payment status</FieldLabel>
                <select
                  className={inputClass}
                  value={paid ? "paid" : "unpaid"}
                  onChange={(e) => setPaid(e.target.value === "paid")}
                >
                  <option value="paid">Paid — count in earnings</option>
                  <option value="unpaid">Not yet paid</option>
                </select>
              </div>

              {/* What a manual booking does. */}
              <p className="rounded-md bg-background-panel px-4 py-3 text-body-sm text-text-secondary">
                Manual bookings block calendar dates and add a wash day, just
                like app bookings.
              </p>

              {error ? (
                <p className="text-body-sm text-state-error">{error}</p>
              ) : null}

              {/* Override confirm — admins outrank customers, but we make the
                  displacement explicit (a paid customer becomes a Refunded
                  record; settle the refund with them off-app). */}
              {conflict ? (
                <div className="flex flex-col gap-2.5 rounded-md border border-state-error bg-background-panel p-3.5">
                  <p className="text-body-sm text-text-primary">
                    These dates are {conflictStatusLabel(conflict.status)} by{" "}
                    <b>{conflict.renter}</b>
                    {conflict.count > 1
                      ? ` and ${conflict.count - 1} other booking${
                          conflict.count - 1 > 1 ? "s" : ""
                        }`
                      : ""}
                    . Overriding will displace{" "}
                    {conflict.count > 1 ? "them" : "their booking"} — a paid one
                    is kept as a <b>Refunded</b> record.
                  </p>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setConflict(null);
                        submit(true);
                      }}
                      disabled={isPending}
                      className="min-h-tap rounded-pill bg-state-error px-4 text-label-sm uppercase tracking-wide text-text-on-primary transition-colors disabled:opacity-60"
                    >
                      {isPending ? "Overriding…" : "Override & book"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConflict(null)}
                      disabled={isPending}
                      className="min-h-tap rounded-pill border border-border-soft bg-white px-4 text-label-sm uppercase tracking-wide text-text-primary transition-colors hover:bg-background-card disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Save */}
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || isPending || conflict !== null}
                className="min-h-tap rounded-pill bg-brand-primary px-5 text-label-base uppercase tracking-label text-text-on-primary transition-colors hover:bg-brand-primary-hover disabled:opacity-50 focus-visible:shadow-focus"
              >
                {isPending ? "Booking…" : "Add booking"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
