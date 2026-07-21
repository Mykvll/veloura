/**
 * Per-unit accessory inventory math, shared by the customer picker, the admin
 * managers, and the analytics computation so the three can't drift apart.
 *
 * An accessory's units split three ways:
 *  - stock            — total units owned
 *  - rented           — units out with customers RIGHT NOW (derived: active
 *                       bookings whose rental range covers today; not stored)
 *  - unavailableUnits — units pulled from service: damaged, lost, or in repair
 *
 * IMPORTANT — this "flat" view is a TODAY snapshot, used only by the ADMIN
 * (managers, analytics, editor "available now"). Customer availability is
 * DATE-AWARE and must use accStateForBooking() below: an accessory rented out
 * for one set of dates is still free on non-overlapping dates, just like a
 * dress. Only `unavailableUnits` removes a unit on every date.
 */
type AccessoryUnits = {
  stock?: number | null;
  rented?: number | null;
  unavailableUnits?: number | null;
};

/** How many units are rentable RIGHT NOW (today snapshot — admin readout). */
export function accAvail(a: AccessoryUnits): number {
  return Math.max(
    0,
    (a.stock ?? 0) - (a.rented ?? 0) - (a.unavailableUnits ?? 0),
  );
}

/**
 * Availability state, distinguishing the two out-of-stock reasons:
 *  - "available"   — at least one unit is bookable
 *  - "rented"      — none bookable, but some are out on rent (coming back)
 *  - "unavailable" — none bookable and none out on rent (pulled / none owned)
 */
export type AccStateCode = "available" | "rented" | "unavailable";

/** Admin TODAY-snapshot state (uses the derived `rented` count). */
export function accState(a: AccessoryUnits): {
  code: AccStateCode;
  avail: number;
} {
  const avail = accAvail(a);
  if (avail > 0) return { code: "available", avail };
  if ((a.rented ?? 0) > 0) return { code: "rented", avail: 0 };
  return { code: "unavailable", avail: 0 };
}

/** ISO "YYYY-MM-DD" shifted by `n` whole days (UTC-safe, no timezone drift). */
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The days a rental starting on `startISO` keeps an accessory out of service:
 * the two rental days + the hand-wash day. This mirrors the range
 * create_rent_hold reserves (p_date .. p_date+2) and the blocked_dates view, so
 * the picker, the calendar, and the server guard all agree on "occupied".
 */
export function accessoryOccupiedDays(startISO: string): string[] {
  return [startISO, addDaysISO(startISO, 1), addDaysISO(startISO, 2)];
}

/**
 * DATE-AWARE customer availability for a rental that STARTS on `startISO`.
 *
 * `blockedDays` is this accessory's set of at-capacity days (from the
 * `accessory_blocked_dates` view — every day where existing active bookings
 * already use up every rentable unit). Capacity = stock − unavailableUnits.
 *  - capacity 0            → "unavailable" on every date (all pulled / none owned)
 *  - no date chosen yet    → "available" (the server re-checks on submit)
 *  - a chosen date clashes → "rented" (booked on those days; free on others)
 */
export function accStateForBooking(
  a: { stock?: number | null; unavailableUnits?: number | null },
  blockedDays: readonly string[],
  startISO: string | null,
): { code: AccStateCode; avail: number } {
  const capacity = Math.max(0, (a.stock ?? 0) - (a.unavailableUnits ?? 0));
  if (capacity <= 0) return { code: "unavailable", avail: 0 };
  if (!startISO) return { code: "available", avail: capacity };
  const occupied = new Set(accessoryOccupiedDays(startISO));
  const clash = blockedDays.some((d) => occupied.has(d));
  if (clash) return { code: "rented", avail: 0 };
  return { code: "available", avail: capacity };
}
