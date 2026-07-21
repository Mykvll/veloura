"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { addDays } from "@/lib/reserve";
import { accStateForRange } from "@/lib/accessories";
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
  /** Rental price — the booking's amount is this plus any add-ons. */
  price: number;
};

/**
 * An accessory the admin can send out with a manual booking. `blockedDays` is
 * this accessory's at-capacity days from the `accessory_blocked_dates` view —
 * the same source the customer picker uses — so the admin sees exactly the same
 * date-aware availability a customer would.
 */
export type ManualBookingAccessoryOption = {
  id: string;
  name: string;
  price: number;
  stock: number;
  unavailableUnits: number;
  blockedDays: string[];
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
  accessories,
  bookings,
  onClose,
}: {
  dresses: ManualBookingDressOption[];
  accessories: ManualBookingAccessoryOption[];
  bookings: AdminBooking[];
  onClose: () => void;
}) {
  const router = useRouter();

  const [dressId, setDressId] = useState("");
  const [renterName, setRenterName] = useState("");
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [paid, setPaid] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);

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
  /** Clear the whole date selection (also reachable via "Clear dates"). */
  function clearDates() {
    setError(null);
    setSelStart(null);
    setSelEnd(null);
  }

  function pick(day: string) {
    setError(null);
    if (!selStart || day < selStart) {
      setSelStart(day);
      setSelEnd(null);
      return;
    }
    // Tapping the start day again UNSELECTS: first tap drops the end (back to a
    // single day), second tap clears the date entirely. Without this the admin
    // could only ever move the start — never get back to "no dates picked".
    if (day === selStart) {
      if (selEnd) setSelEnd(null);
      else clearDates();
      return;
    }
    for (let d = selStart; d <= day; d = addDays(d, 1)) {
      if (taken.has(d)) {
        setSelStart(day);
        setSelEnd(null);
        return;
      }
    }
    setSelEnd(day);
  }

  function pickDress(id: string) {
    setDressId(id);
    // A range picked for one dress means nothing for another — clear it.
    setSelStart(null);
    setSelEnd(null);
  }

  // Date-aware add-on availability for the CHOSEN range (rental days + wash
  // day), read from the same accessory_blocked_dates data the customer picker
  // uses. Before a range is picked everything reads as available.
  const accessoryState = useMemo(() => {
    const m = new Map<string, ReturnType<typeof accStateForRange>>();
    for (const a of accessories) {
      m.set(
        a.id,
        accStateForRange(a, a.blockedDays, selStart, selEnd ?? selStart),
      );
    }
    return m;
  }, [accessories, selStart, selEnd]);

  // Add-ons the admin picked that the CURRENT range has since made unavailable
  // (e.g. they changed the dates after ticking). We never silently drop one —
  // saving is blocked until the admin removes it.
  const pickedUnavailable = picked.filter(
    (id) => accessoryState.get(id)?.code !== "available",
  );

  const dressPrice = dresses.find((d) => d.id === dressId)?.price ?? 0;
  const addOnTotal = picked.reduce(
    (sum, id) => sum + (accessories.find((a) => a.id === id)?.price ?? 0),
    0,
  );

  function toggleAccessory(id: string) {
    setError(null);
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );
  }

  const canSave =
    dressId !== "" &&
    renterName.trim().length > 0 &&
    selStart !== null &&
    pickedUnavailable.length === 0;

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
        accessoryIds: picked,
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
            <div className="flex flex-col gap-3">
              <ManualBookingCalendar
                taken={taken}
                wash={wash}
                selStart={selStart}
                selEnd={selEnd}
                disabled={dressId === ""}
                onPick={pick}
              />
              {/* Explicit escape hatch — tapping the start day toggles it off
                  too, but that isn't discoverable on its own. */}
              {selStart ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body-sm text-text-secondary">
                    {selEnd ? `${selStart} → ${selEnd}` : selStart}
                  </span>
                  <button
                    type="button"
                    onClick={clearDates}
                    className="min-h-tap rounded-pill border border-border-soft bg-white px-4 text-label-sm uppercase tracking-label text-text-secondary transition-fast hover:border-border-strong hover:text-text-heading focus-visible:shadow-focus"
                  >
                    Clear dates
                  </button>
                </div>
              ) : null}
            </div>

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

              {/* Add-ons — date-aware, exactly like the customer picker. Ticking
                  one records a booking_accessories row, which is what makes the
                  accessory unavailable to customers on these dates. */}
              {accessories.length > 0 ? (
                <div>
                  <FieldLabel>Accessories going out</FieldLabel>
                  <div className="flex flex-col gap-1.5">
                    {accessories.map((a) => {
                      const st = accessoryState.get(a.id);
                      const out = st?.code !== "available";
                      const sel = picked.includes(a.id);
                      // Availability is meaningless until there are dates to
                      // check it against, so the rows stay locked until the
                      // admin has picked a range (which needs a dress first).
                      const locked = !selStart;
                      // A picked add-on is ALWAYS tappable so it can be removed
                      // — otherwise changing the dress/dates could strand a tick
                      // that blocks saving with no way to undo it.
                      const mustRemove = sel && out;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() =>
                            (sel || (!locked && !out)) && toggleAccessory(a.id)
                          }
                          disabled={(locked || out) && !sel}
                          className={`flex min-h-tap items-center gap-3 rounded-sm border px-3 py-2 text-left transition-fast disabled:cursor-not-allowed disabled:opacity-55 ${
                            mustRemove
                              ? "border-state-error bg-background-panel"
                              : sel
                                ? "border-border-accent bg-background-panel"
                                : "border-border-soft bg-white hover:border-border-strong"
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 flex-none items-center justify-center rounded-[5px] border text-xs leading-none text-text-on-primary ${
                              sel
                                ? "border-brand-primary bg-brand-primary"
                                : "border-border-strong bg-white"
                            }`}
                          >
                            {sel ? "✓" : ""}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-body-sm text-text-primary">
                              {a.name}
                            </span>
                            <span
                              className={`text-body-sm ${
                                out ? "text-state-error" : "text-text-secondary"
                              }`}
                            >
                              {locked
                                ? "Pick a dress and dates first"
                                : st?.code === "available"
                                  ? `${st.avail} available`
                                  : st?.code === "rented"
                                    ? "Out on these dates"
                                    : "Currently unavailable"}
                            </span>
                          </span>
                          <span className="flex-none text-price-base text-text-accent">
                            +₱{a.price}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {pickedUnavailable.length > 0 ? (
                    <p className="mt-1.5 text-body-sm text-state-error">
                      Remove the add-ons marked in red — they&apos;re already out
                      on these dates.
                    </p>
                  ) : null}
                  {picked.length > 0 && pickedUnavailable.length === 0 ? (
                    <p className="mt-1.5 text-body-sm text-text-secondary">
                      Booking total: ₱{dressPrice + addOnTotal} (₱{dressPrice}{" "}
                      dress + ₱{addOnTotal} add-ons)
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* What a manual booking does. */}
              <p className="rounded-md bg-background-panel px-4 py-3 text-body-sm text-text-secondary">
                Manual bookings block calendar dates and add a wash day, just
                like app bookings. Any accessories you tick are held for these
                dates too.
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
