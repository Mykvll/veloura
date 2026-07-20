"use client";

import { useMemo, useState } from "react";
import { lastWearDay, returnDay, RETURN_BY } from "@/lib/reserve";

/**
 * One blocked day for one dress, sourced from the `blocked_dates` view.
 * That view already bakes in the business rule: it lists every day from a
 * rental's start_date through end_date PLUS one wash day (end_date + 1), for
 * bookings that are type='rent' and pending/verified. So each row here is a
 * single day when a specific dress is unavailable — the wash day is already
 * included; we don't recompute it.
 */
export type BlockedDate = {
  dressId: string;
  dressName: string;
  /** ISO day, "YYYY-MM-DD". */
  day: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Build the "YYYY-MM-DD" key for a (year, 0-indexed month, day). */
function dayKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** "Saturday, July 11, 2026" — the long form the info panel shows. */
function niceDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The reserve-flow availability calendar: a month grid you can page through
 * with ‹ / › and a "Jump to today" shortcut. Which days are pickable depends
 * on the mode:
 *
 *  - RENT: only days when THIS dress is blocked (its 2 wear days + return day) are
 *    disabled. Shows only THIS dress's availability, not other dresses.
 *    Wear days are highlighted solid gold; the return day is lighter/dashed.
 *  - FITTING: any day when ANY dress is blocked is disabled — a fitting can't
 *    share a day with a rental hand-off.
 *
 * Past days are always disabled. Selection is controlled by the parent.
 */
export function AvailabilityCalendar({
  blocked,
  dressId,
  dressName,
  mode,
  selected,
  onSelect,
}: {
  blocked: BlockedDate[];
  /** The dress being reserved — used to pick out its own blocked days in RENT mode. */
  dressId: string;
  /** The name of the dress, used in the legend and detail text. */
  dressName: string;
  mode: "rent" | "fitting";
  selected: string | null;
  onSelect: (day: string) => void;
}) {
  const now = new Date();
  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate());

  // The month on screen. Start on the selected date's month (if any), else the
  // current month. { m: 0-indexed month, y: full year }.
  const [view, setView] = useState(() =>
    selected
      ? { m: Number(selected.slice(5, 7)) - 1, y: Number(selected.slice(0, 4)) }
      : { m: now.getMonth(), y: now.getFullYear() },
  );
  const { m: month, y: year } = view;
  const isCurrentMonth =
    month === now.getMonth() && year === now.getFullYear();

  // Page forward/back n months, normalising the year rollover through Date.
  const shift = (n: number) =>
    setView((v) => {
      const dt = new Date(v.y, v.m + n, 1);
      return { m: dt.getMonth(), y: dt.getFullYear() };
    });

  // Pre-compute the three lookups we need from the flat blocked list:
  //  - anyBlocked: days SOME dress is out (drives the red dot + shaded cell)
  //  - thisBlocked: days THIS dress is out (drives RENT-mode disabling)
  //  - namesByDay: which dresses are out on a day (for the info panel)
  const { anyBlocked, thisBlocked, namesByDay } = useMemo(() => {
    const anyBlocked = new Set<string>();
    const thisBlocked = new Set<string>();
    const namesByDay = new Map<string, string[]>();
    for (const b of blocked) {
      anyBlocked.add(b.day);
      if (b.dressId === dressId) thisBlocked.add(b.day);
      const names = namesByDay.get(b.day) ?? [];
      if (!names.includes(b.dressName)) names.push(b.dressName);
      namesByDay.set(b.day, names);
    }
    return { anyBlocked, thisBlocked, namesByDay };
  }, [blocked, dressId]);

  // Wear days are `selected` and `selected + 1`; `selected + 2` is the return day.
  const secondWearDayKey =
    mode === "rent" && selected ? lastWearDay(selected) : null;
  const returnDayKey =
    mode === "rent" && selected ? returnDay(selected) : null;

  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = first.toLocaleString("en-US", { month: "long" });

  // Leading blanks so day 1 lands under its weekday, then the numbered days.
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedNames = selected ? namesByDay.get(selected) ?? [] : [];

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
          const rentedOut = anyBlocked.has(key); // something is booked this day
          const isSel = selected === key;
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          // RENT: only THIS dress's days block; FITTING: any booked day blocks.
          const blockedDay =
            mode === "fitting" ? rentedOut : thisBlocked.has(key);
          // A rental occupies 3 days (start, start+1, return), so a start date is
          // only offerable if start+1 and start+2 are also free — mirrors the DB
          // exclusion constraint. (FITTING picks a single day.)
          const spanTaken =
            mode === "rent" && !blockedDay
              ? [1, 2].some((n) => {
                  const d = new Date(key + "T00:00:00");
                  d.setDate(d.getDate() + n);
                  return thisBlocked.has(
                    dayKey(d.getFullYear(), d.getMonth(), d.getDate()),
                  );
                })
              : false;
          const disabled = blockedDay || isPast || spanTaken;

          const isSecondWearDay = key === secondWearDayKey;
          const isReturnDay = key === returnDayKey;
          const onPanel = isSel || isSecondWearDay || isReturnDay || rentedOut;

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onSelect(key)}
              className={`flex min-h-[46px] flex-col items-center gap-[3px] rounded-sm border px-0.5 py-1 text-body-sm transition-fast disabled:cursor-not-allowed ${
                isSel
                  ? "border-border-accent shadow-focus"
                  : isSecondWearDay
                    ? "border-border-accent"
                    : isReturnDay
                      ? "border-dashed border-border-accent"
                      : isToday
                        ? "border-border-strong"
                        : "border-transparent"
              } ${onPanel ? "bg-background-panel" : "bg-white"} ${
                disabled ? "opacity-40" : ""
              }`}
            >
              <span
                className={`${
                  isSel || isSecondWearDay || isToday ? "font-semibold" : ""
                } ${isToday ? "text-text-accent" : "text-text-primary"} ${
                  blockedDay ? "line-through" : ""
                }`}
              >
                {d}
              </span>
              {/* Booked day → red dot; return day → a "return" tag instead. */}
              <span className="flex h-1.5 items-center gap-[3px]">
                {isReturnDay ? (
                  <span className="text-[9px] uppercase leading-none tracking-[0.06em] text-text-secondary">
                    return
                  </span>
                ) : rentedOut ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-state-error" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend — shows only this dress's availability. */}
      <div className="mt-3 flex flex-wrap justify-center gap-4 text-body-sm text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-state-error" /> {dressName}{" "}
          not available
        </span>
      </div>

      {/* Selected-day detail. In RENT mode this spells out the 2-day span and
          the 11 AM return; in FITTING mode it reports the day's availability. */}
      {selected ? (
        <div className="mt-2.5 rounded-md bg-background-panel p-3 text-body-sm">
          <b className="text-label-sm uppercase tracking-label text-text-heading">
            {niceDate(selected)}
          </b>
          <div className="mt-1 text-text-secondary">
            {mode === "rent" && secondWearDayKey && returnDayKey ? (
              <div>
                {dressName} is yours {niceDate(selected)} –{" "}
                {niceDate(secondWearDayKey)} (2-day rental) · return before{" "}
                {RETURN_BY} on {niceDate(returnDayKey)}.
              </div>
            ) : selectedNames.includes(dressName) ? (
              <div>
                {dressName} is being rented out or being cleaned on this date.
              </div>
            ) : (
              <div>{dressName} is available on this date.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
