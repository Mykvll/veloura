// Shared reserve-flow helpers — imported by both the client forms and the
// server action so the two always agree on delivery/fitting options and date
// maths.

/** Zero-pad to two digits ("7" → "07"). */
export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Add n days to an ISO "YYYY-MM-DD" date, returning another ISO day. */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True for Saturday/Sunday — fittings offer more slots on weekends. */
export function isWeekend(iso: string): boolean {
  const g = new Date(iso + "T00:00:00").getDay();
  return g === 0 || g === 6;
}

/** The fitting time slots offered on a given date (weekday vs weekend). */
export function fittingSlots(iso: string): string[] {
  return isWeekend(iso)
    ? ["1:00 PM", "3:00 PM", "5:00 PM", "7:00 PM", "9:00 PM"]
    : ["4:00 PM", "7:00 PM"];
}

/** "Saturday, July 11, 2026" — the long form the forms echo back. */
export function niceDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Delivery windows offered in the rent form. */
export const DELIVERY_TIMES = [
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
];

/** The fitting fee and the optional parking add-on (pesos), from the design. */
export const FITTING_FEE = 200;
export const PARKING_FEE = 50;

/** Where fittings happen (design copy). */
export const FITTING_LOCATION =
  "Tower 2, Harbour Park Residences, Mandaluyong";
