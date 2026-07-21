/**
 * Per-unit accessory inventory math, shared by the customer picker, the admin
 * managers, and the analytics computation so the three can't drift apart.
 *
 * An accessory's units split three ways:
 *  - stock            — total units owned
 *  - rented           — units out with customers now (temporary; they return)
 *  - unavailableUnits — units pulled from service: damaged, lost, or in repair
 *
 * Available to rent = stock − rented − unavailableUnits (never below 0). Rows
 * created before these two columns existed read them as 0, so they behave
 * exactly as a plain `stock` number always did (backward-compatible).
 */
type AccessoryUnits = {
  stock?: number | null;
  rented?: number | null;
  unavailableUnits?: number | null;
};

/** How many units are actually rentable right now. */
export function accAvail(a: AccessoryUnits): number {
  return Math.max(
    0,
    (a.stock ?? 0) - (a.rented ?? 0) - (a.unavailableUnits ?? 0),
  );
}

/**
 * Customer-facing availability, distinguishing the two out-of-stock reasons:
 *  - "available"   — at least one unit is bookable
 *  - "rented"      — none bookable, but some are out on rent (coming back)
 *  - "unavailable" — none bookable and none out on rent (pulled / none owned)
 */
export type AccStateCode = "available" | "rented" | "unavailable";

export function accState(a: AccessoryUnits): {
  code: AccStateCode;
  avail: number;
} {
  const avail = accAvail(a);
  if (avail > 0) return { code: "available", avail };
  if ((a.rented ?? 0) > 0) return { code: "rented", avail: 0 };
  return { code: "unavailable", avail: 0 };
}
