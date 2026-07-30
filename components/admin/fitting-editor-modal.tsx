"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { addDays, fittingSlots, niceDate } from "@/lib/reserve";
import {
  createFitting,
  updateFitting,
  type FittingInput,
} from "@/app/admin/(protected)/fitting-actions";
import type { AdminBooking, AdminFitting } from "./types";

/* Small brand-token field primitives, mirroring the manual-booking modal. */

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

/** A dress the admin can fit — just the picker essentials. */
export type FittingDressOption = { id: string; name: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dayKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Why a dress isn't in-store on a day (drives the calendar tint + warning). */
type Unavailable = { reason: "out" | "wash"; renter: string };

/**
 * Single-day month calendar for the fitting editor. Same look as the
 * manual-booking calendar, but with the fitting's rules:
 *  - selection is ONE day (tapping another day moves the appointment);
 *  - days the chosen dress is unavailable are tinted/dimmed but STAY pickable —
 *    the admin gets an advisory warning, never a hard block.
 */
function FittingCalendar({
  unavailable,
  selected,
  disabled,
  onPick,
}: {
  unavailable: Map<string, Unavailable>;
  selected: string | null;
  disabled: boolean;
  onPick: (day: string) => void;
}) {
  const now = new Date();
  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate());
  const [view, setView] = useState({ m: now.getMonth(), y: now.getFullYear() });
  const { m: month, y: year } = view;
  const isCurrentMonth = month === now.getMonth() && year === now.getFullYear();

  const shift = (n: number) =>
    setView((v) => {
      const dt = new Date(v.y, v.m + n, 1);
      return { m: dt.getMonth(), y: dt.getFullYear() };
    });

  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = first.toLocaleString("en-US", { month: "long" });

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      {/* Month header: ‹  July 2026 (+ Jump to today)  › */}
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shift(-1)}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-border-soft bg-white text-xl leading-none text-text-accent transition-fast hover:border-border-strong focus-visible:shadow-focus"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="font-display text-display-md uppercase tracking-display text-text-accent">
            {monthName} {year}
          </div>
          {!isCurrentMonth ? (
            <button
              type="button"
              onClick={() =>
                setView({ m: now.getMonth(), y: now.getFullYear() })
              }
              className="mt-0.5 text-label-sm uppercase tracking-label text-text-secondary underline hover:text-text-heading"
            >
              Jump to today
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shift(1)}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-border-soft bg-white text-xl leading-none text-text-accent transition-fast hover:border-border-strong focus-visible:shadow-focus"
        >
          ›
        </button>
      </div>

      {/* Weekday header + day grid, 7 columns. */}
      <div className="grid grid-cols-7 gap-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div
            key={i}
            className="py-1 text-center text-label-sm text-text-secondary"
          >
            {d}
          </div>
        ))}

        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;

          const key = dayKey(year, month, d);
          const u = unavailable.get(key);
          const isToday = key === todayKey;
          const isSel = key === selected;

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onPick(key)}
              className={`flex min-h-[46px] flex-col items-center gap-[3px] rounded-sm border px-0.5 py-1 text-body-sm transition-fast disabled:cursor-not-allowed disabled:opacity-40 ${
                isSel
                  ? "border-border-accent shadow-focus"
                  : isToday
                    ? "border-border-strong"
                    : "border-transparent"
              } ${u ? "bg-background-panel opacity-65" : "bg-white"}`}
            >
              <span
                className={`${isSel || isToday ? "font-semibold" : ""} ${
                  isToday ? "text-text-accent" : "text-text-primary"
                }`}
              >
                {d}
              </span>
              {/* Amber-ish heads-up dot: the dress isn't in-store that day, but
                  the admin can still book the fitting over it. */}
              <span className="flex h-1.5 gap-[3px]">
                {u ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-state-error" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend. */}
      <div className="mt-3 flex flex-wrap justify-center gap-3.5 text-body-sm text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-state-error" /> Dress not
          in-store — bookable with a heads-up
        </span>
      </div>
    </div>
  );
}

/**
 * Add or reschedule a fitting appointment, in a split modal (calendar left,
 * form right) — the same shell as the manual-booking modal.
 *
 * A fitting never blocks rental dates. The conflict checks here are ADVISORY:
 *  - if the chosen dress is out (or on its hand-wash day) on the picked day, a
 *    warning shows but saving is still allowed;
 *  - if another fitting already holds the same day + time, a gentle notice
 *    shows — the admin can double-book if they want.
 *
 * `rentals` is the Bookings section's own rental list; the chosen dress's
 * unavailable days are derived from it here so the calendar always agrees with
 * what the admin sees. `fittings` is the existing appointments, for the
 * double-booking notice (the edited fitting excludes itself).
 */
export function FittingEditorModal({
  dresses,
  rentals,
  fittings,
  editing,
  onClose,
}: {
  dresses: FittingDressOption[];
  rentals: AdminBooking[];
  fittings: AdminFitting[];
  /** The fitting being rescheduled, or null to create a new one. */
  editing: AdminFitting | null;
  onClose: () => void;
}) {
  const router = useRouter();

  const [dressId, setDressId] = useState(
    editing?.dressId ?? dresses[0]?.id ?? "",
  );
  const [name, setName] = useState(editing?.name ?? "");
  const [contact, setContact] = useState(editing?.contact ?? "");
  const [date, setDate] = useState<string | null>(editing?.date ?? null);
  const [time, setTime] = useState(editing?.time ?? "4:00 PM");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The slots offered depend on whether the chosen day is a weekend; before a
  // day is picked we show the weekday set as a sensible default.
  const slots = useMemo(
    () => (date ? fittingSlots(date) : ["4:00 PM", "7:00 PM"]),
    [date],
  );
  // The stored `time` may not exist on the chosen day (weekend/weekday slot
  // lists differ) — e.g. picking a weekend after "4:00 PM" was set. Rather than
  // sync state in an effect, we derive the effective slot each render: the
  // stored one if still offered, else the day's first slot. This is what the
  // select shows and what we save.
  const effectiveTime = slots.includes(time) ? time : slots[0];

  // The chosen dress's unavailable days: every day it's out with a customer
  // (reason "out"), plus the hand-wash day after each rental (reason "wash").
  // A day that is both counts as "out" (the harder fact wins).
  const unavailable = useMemo(() => {
    const map = new Map<string, Unavailable>();
    if (dressId) {
      for (const b of rentals) {
        if (b.dressId !== dressId) continue;
        if (b.status !== "pending" && b.status !== "verified") continue;
        if (!b.start || !b.end) continue;
        for (let d = b.start; d <= b.end; d = addDays(d, 1)) {
          map.set(d, { reason: "out", renter: b.renter });
        }
        const washDay = addDays(b.end, 1);
        if (!map.has(washDay)) {
          map.set(washDay, { reason: "wash", renter: b.renter });
        }
      }
    }
    return map;
  }, [rentals, dressId]);

  const dressName = dresses.find((d) => d.id === dressId)?.name ?? "The dress";
  const conflict = date ? unavailable.get(date) : undefined;

  // Another fitting already at this exact day + time (excluding the one we're
  // editing) — advisory only.
  const doubleBooked = useMemo(() => {
    if (!date || !effectiveTime) return undefined;
    return fittings.find(
      (f) => f.id !== editing?.id && f.date === date && f.time === effectiveTime,
    );
  }, [fittings, date, effectiveTime, editing]);

  const canSave = dressId !== "" && name.trim().length > 0 && date !== null;

  function submit() {
    if (!date) return;
    setError(null);
    const payload: FittingInput = {
      dressId,
      name,
      contact,
      date,
      time: effectiveTime,
    };
    startTransition(async () => {
      const res = editing
        ? await updateFitting(editing.id, payload)
        : await createFitting(payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
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
                {editing ? "Reschedule fitting" : "Add fitting"}
              </Dialog.Title>
              <p className="text-body-sm text-text-secondary">
                In-store try-on — doesn&apos;t block rental dates
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
              <FittingCalendar
                unavailable={unavailable}
                selected={date}
                disabled={dressId === ""}
                onPick={(day) => {
                  setError(null);
                  setDate(day);
                }}
              />
              {/* Chosen-day summary. */}
              <div className="rounded-md bg-background-panel p-3 text-body-sm">
                <b className="text-label-sm uppercase tracking-label text-text-heading">
                  {date
                    ? `${niceDate(date)} · ${effectiveTime}`
                    : "No date picked yet"}
                </b>
                <div className="mt-1 text-text-secondary">
                  {date
                    ? "Tap another day to move the appointment."
                    : "Tap a day to set the fitting date."}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {/* Dress */}
              <div>
                <FieldLabel required>Dress to fit</FieldLabel>
                <select
                  className={inputClass}
                  value={dressId}
                  onChange={(e) => setDressId(e.target.value)}
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

              {/* Client's name */}
              <div>
                <FieldLabel required>Client&apos;s name</FieldLabel>
                <input
                  className={inputClass}
                  placeholder="e.g. Mara S."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Contact — optional */}
              <div>
                <FieldLabel>Contact number</FieldLabel>
                <input
                  type="tel"
                  className={inputClass}
                  placeholder="09xx xxx xxxx"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>

              {/* Time */}
              <div>
                <FieldLabel required>Time</FieldLabel>
                <select
                  className={inputClass}
                  value={effectiveTime}
                  onChange={(e) => setTime(e.target.value)}
                >
                  {slots.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Advisory conflict — the dress isn't in-store that day. */}
              {conflict ? (
                <div className="rounded-md border border-state-error bg-background-panel p-3.5 text-body-sm text-text-primary">
                  {conflict.reason === "out"
                    ? `${dressName} isn't in-store that day — it's out with ${conflict.renter}.`
                    : `${dressName} isn't in-store that day — it's the hand-wash day after ${conflict.renter}'s rental.`}{" "}
                  Pick another day, or fit a different dress.
                </div>
              ) : null}

              {/* Advisory double-booking notice. */}
              {doubleBooked ? (
                <p className="text-body-sm text-text-accent">
                  {doubleBooked.name} already has a fitting at {effectiveTime}{" "}
                  that day.
                </p>
              ) : null}

              {/* What a fitting does. */}
              <p className="rounded-md bg-background-panel px-4 py-3 text-body-sm text-text-secondary">
                Fittings show as a gold dot on the calendar and sit with rentals
                in Bookings. They never block rental dates.
              </p>

              {error ? (
                <p className="text-body-sm text-state-error">{error}</p>
              ) : null}

              {/* Save */}
              <button
                type="button"
                onClick={submit}
                disabled={!canSave || isPending}
                className="min-h-tap rounded-pill bg-brand-primary px-5 text-label-base uppercase tracking-label text-text-on-primary transition-colors hover:bg-brand-primary-hover disabled:opacity-50 focus-visible:shadow-focus"
              >
                {isPending
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Add fitting"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
