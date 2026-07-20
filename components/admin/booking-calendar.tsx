"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, ShoppingBag, Droplets } from "lucide-react";
import { SectionTitle } from "@/components/section-title";
import type { CalendarRental, CalendarFitting } from "./types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Build the "YYYY-MM-DD" key for a (year, 0-indexed month, day). */
function dayKey(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Shift an ISO day by n days, staying in local time (no UTC drift). */
function addDays(iso: string, n: number) {
  const dt = new Date(iso + "T00:00:00");
  dt.setDate(dt.getDate() + n);
  return dayKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/** Every ISO day from start to end, inclusive. */
function eachDay(start: string, end: string) {
  const out: string[] = [];
  let x = start;
  // Guard against a bad range (end before start) so we can't loop forever.
  while (x <= end && out.length < 400) {
    out.push(x);
    x = addDays(x, 1);
  }
  return out;
}

/** "Saturday, July 11, 2026" — the long form the agenda panel shows. */
function niceDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "July 12" — short form for the "Return by" line. */
function shortDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

/** What sits on a single calendar day. */
type DayAgenda = {
  rents: CalendarRental[];
  wash: CalendarRental[];
  fittings: CalendarFitting[];
};

/**
 * The Calendar SECTION of the admin page (client component).
 *
 * A month view with coloured dots per day — gold = fitting, red = rented out,
 * taupe = return / hand-wash day (end_date + 1, unavailable to rent AND fit).
 * Tapping a day opens its agenda on the right: fittings (time · customer ·
 * dress), rentals (renter, dates, and on the pick-up day the delivery time +
 * "return by" date), and wash-day notes. Page months with ‹ / › and jump back
 * to the current month.
 *
 * Rentals come in scoped to pending|verified bookings — the set that blocks
 * dates — INCLUDING completed ones whose wash day has passed, so paging back
 * shows past rentals on their dates. Future/active days still match availability.
 */
export function BookingCalendar({
  rentals,
  fittings,
}: {
  rentals: CalendarRental[];
  fittings: CalendarFitting[];
}) {
  const now = new Date();
  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate());

  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState({ m: now.getMonth(), y: now.getFullYear() });
  const { m: month, y: year } = view;
  const isCurrentMonth =
    month === now.getMonth() && year === now.getFullYear();

  // Page forward/back n months, normalising the year rollover through Date.
  const shift = (n: number) =>
    setView((v) => {
      const dt = new Date(v.y, v.m + n, 1);
      return { m: dt.getMonth(), y: dt.getFullYear() };
    });

  // date -> { rents, wash, fittings }. A rental fills its start..end days and
  // adds a wash entry on end + 1; a fitting sits on its one appointment day.
  const agenda = useMemo(() => {
    const map = new Map<string, DayAgenda>();
    const slot = (iso: string) => {
      let a = map.get(iso);
      if (!a) {
        a = { rents: [], wash: [], fittings: [] };
        map.set(iso, a);
      }
      return a;
    };
    for (const r of rentals) {
      if (!r.start || !r.end) continue;
      for (const d of eachDay(r.start, r.end)) slot(d).rents.push(r);
      // Logged historical rentals have no wash day; real bookings block end + 1.
      if (!r.logged) slot(addDays(r.end, 1)).wash.push(r);
    }
    for (const f of fittings) {
      if (f.date) slot(f.date).fittings.push(f);
    }
    return map;
  }, [rentals, fittings]);

  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = first.toLocaleString("en-US", { month: "long" });

  // Leading blanks so day 1 lands under its weekday, then the numbered days.
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const info = selected ? agenda.get(selected) : undefined;
  const nothingOn =
    !info || (!info.rents.length && !info.wash.length && !info.fittings.length);

  return (
    <div>
      {/* Centered gold section title, like every admin section. */}
      <SectionTitle subtitle="Fittings, rentals & return / wash days at a glance">
        Booking Calendar
      </SectionTitle>

      <div className="mt-8 grid grid-cols-1 items-start gap-6 rounded-lg border border-border-soft bg-background-card p-4 shadow-card lg:grid-cols-[1.2fr_1fr] lg:gap-7 lg:p-6">
        {/* Left column — month header + day grid + legend. */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-2.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shift(-1)}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border-soft bg-white text-base leading-none text-text-accent transition-fast hover:border-border-strong focus-visible:shadow-focus"
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
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border-soft bg-white text-base leading-none text-text-accent transition-fast hover:border-border-strong focus-visible:shadow-focus"
            >
              ›
            </button>
          </div>

          {/* Weekday header + day grid, 7 columns. */}
          <div className="grid grid-cols-7 gap-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div
                key={i}
                className="py-1 text-center text-label-sm tracking-wide text-text-secondary"
              >
                {d}
              </div>
            ))}

            {cells.map((d, i) => {
              if (d === null) return <div key={`e${i}`} />;

              const key = dayKey(year, month, d);
              const a = agenda.get(key);
              const booked = !!a && (a.rents.length > 0 || a.wash.length > 0);
              const isSel = selected === key;
              const isToday = key === todayKey;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  className={`flex min-h-[52px] flex-col items-center gap-[3px] rounded-sm border px-0.5 py-1 text-body-sm transition-fast ${
                    isSel
                      ? "border-border-accent shadow-focus"
                      : isToday
                        ? "border-border-strong"
                        : "border-transparent"
                  } ${booked ? "bg-background-panel" : "bg-white"}`}
                >
                  <span
                    className={`${isSel || isToday ? "font-semibold" : ""} ${
                      isToday ? "text-text-accent" : "text-text-primary"
                    }`}
                  >
                    {d}
                  </span>
                  {/* Up to three dots: fitting (gold), rented (red), wash (taupe). */}
                  <span className="flex h-1.5 gap-[3px]">
                    {a && a.fittings.length ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
                    ) : null}
                    {a && a.rents.length ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-state-error" />
                    ) : null}
                    {a && a.wash.length ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Legend. */}
          <div className="mt-3 flex flex-wrap justify-center gap-3.5 text-body-sm text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />{" "}
              Fitting
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-state-error" /> Rented
              out
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary" />{" "}
              Return / hand-wash day (no rent / no fitting)
            </span>
          </div>
        </div>

        {/* Right column — agenda for the selected day. */}
        <div className="flex flex-col gap-2.5">
          {!selected ? (
            <div className="text-body-sm text-text-secondary">
              Pick a date to see its bookings, times and wash-day blocks.
            </div>
          ) : (
            <>
              <div className="text-label-base uppercase tracking-label text-text-heading">
                {niceDate(selected)}
              </div>

              {nothingOn ? (
                <div className="rounded-md bg-background-panel p-3.5 text-body-sm text-state-success">
                  Fully open — all dresses available to rent and fit.
                </div>
              ) : null}

              {info?.fittings.map((f) => (
                <div
                  key={`f${f.id}`}
                  className="flex items-start gap-2.5 rounded-md bg-background-panel p-3.5 text-body-sm"
                >
                  <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-brand-primary text-text-on-primary">
                    <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <b className="text-text-primary">Fitting · {f.time}</b>
                    <div className="text-text-secondary">
                      {f.renter} — {f.dress}
                    </div>
                  </div>
                </div>
              ))}

              {info?.rents.map((r) => {
                const isPickup = selected === r.start;
                return (
                  <div
                    key={`r${r.id}`}
                    className="flex items-start gap-2.5 rounded-md bg-background-panel p-3.5 text-body-sm"
                  >
                    <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-state-error text-text-on-primary">
                      <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <b className="text-text-primary">
                        {r.dress} · rented out
                        {isPickup && r.deliver ? ` · deliver ${r.deliver}` : ""}
                      </b>
                      <div className="text-text-secondary">
                        {r.renter} · {niceDate(r.start)} – {niceDate(r.end)}
                      </div>
                      {isPickup ? (
                        <div className="text-text-secondary">
                          Return by {shortDate(addDays(r.end, 1))}
                          {r.deliver ? `, ${r.deliver}` : ""}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {info?.wash.map((r) => (
                <div
                  key={`w${r.id}`}
                  className="flex items-start gap-2.5 rounded-md bg-background-panel p-3.5 text-body-sm"
                >
                  <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-brand-secondary text-text-on-primary">
                    <Droplets className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <b className="text-text-primary">
                      {r.dress} · hand-wash in progress
                    </b>
                    <div className="text-text-secondary">
                      Returned this day by {r.renter} — unavailable to rent and
                      to fit while it is hand-washed.
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
