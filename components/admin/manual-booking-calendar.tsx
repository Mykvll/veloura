"use client";

import { useState } from "react";
import { niceDate } from "@/lib/reserve";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Build the "YYYY-MM-DD" key for a (year, 0-indexed month, day). */
function dayKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/**
 * The manual-booking month calendar — the customer AvailabilityCalendar's
 * look, with the admin's rules:
 *
 *  - NO date floor: past days stay pickable (the admin logs what really
 *    happened, whenever it happened).
 *  - `taken` days (another booking's start..end for this dress) are disabled:
 *    line-through + red dot — the dress is physically with a customer.
 *  - `wash` days (the day after a return) show a taupe dot as a heads-up but
 *    STAY clickable: they only block customers; the admin washes the dresses
 *    herself and knows when they'll be ready.
 *
 * Selection is a RANGE owned by the parent modal: this component just paints
 * selStart..selEnd and reports taps via onPick.
 */
export function ManualBookingCalendar({
  taken,
  wash,
  selStart,
  selEnd,
  disabled,
  onPick,
}: {
  /** Days the dress is with another customer (ISO "YYYY-MM-DD"). */
  taken: Set<string>;
  /** Wash days for this dress — marked, but pickable. */
  wash: Set<string>;
  selStart: string | null;
  selEnd: string | null;
  /** True until a dress is chosen — the grid renders but ignores taps. */
  disabled: boolean;
  onPick: (day: string) => void;
}) {
  const now = new Date();
  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate());

  // The month on screen ({ m: 0-indexed month, y: full year }).
  const [view, setView] = useState({ m: now.getMonth(), y: now.getFullYear() });
  const { m: month, y: year } = view;
  const isCurrentMonth = month === now.getMonth() && year === now.getFullYear();

  const shift = (n: number) =>
    setView((v) => {
      const dt = new Date(v.y, v.m + n, 1);
      return { m: dt.getMonth(), y: dt.getFullYear() };
    });

  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0 = Sunday
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
          const isTaken = taken.has(key);
          const isWash = !isTaken && wash.has(key);
          const isToday = key === todayKey;
          const inRange =
            selStart !== null &&
            key >= selStart &&
            key <= (selEnd ?? selStart);
          const dead = disabled || isTaken;

          return (
            <button
              key={key}
              type="button"
              disabled={dead}
              onClick={() => !dead && onPick(key)}
              className={`flex min-h-[46px] flex-col items-center gap-[3px] rounded-sm border px-0.5 py-1 text-body-sm transition-fast disabled:cursor-not-allowed ${
                inRange
                  ? "border-border-accent shadow-focus"
                  : isToday
                    ? "border-border-strong"
                    : "border-transparent"
              } ${isTaken ? "bg-background-panel" : "bg-white"} ${
                isTaken ? "opacity-40" : ""
              }`}
            >
              <span
                className={`${inRange || isToday ? "font-semibold" : ""} ${
                  isToday ? "text-text-accent" : "text-text-primary"
                } ${isTaken ? "line-through" : ""}`}
              >
                {d}
              </span>
              {/* Red dot: with a customer. Taupe dot: wash day (still yours). */}
              <span className="flex h-1.5 gap-[3px]">
                {isTaken ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-state-error" />
                ) : null}
                {isWash ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend — mirrors the Booking Calendar's dot colours. */}
      <div className="mt-3 flex flex-wrap justify-center gap-3.5 text-body-sm text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-state-error" /> With a
          customer
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary" /> Wash
          day — bookable by you
        </span>
      </div>

      {/* Reserved-range readout. */}
      <div className="mt-2.5 rounded-md bg-background-panel p-3 text-body-sm">
        <b className="text-label-sm uppercase tracking-label text-text-heading">
          Reserved
        </b>
        <div className="mt-1 text-text-secondary">
          {disabled
            ? "Choose a dress to pick its dates."
            : selStart
              ? selEnd && selEnd !== selStart
                ? `${niceDate(selStart)} – ${niceDate(selEnd)}`
                : niceDate(selStart)
              : "No reserved dates yet."}
        </div>
      </div>
    </div>
  );
}
