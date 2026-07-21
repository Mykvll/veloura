/**
 * The plain, serializable shape of a dress as the admin UI works with it.
 * The server page maps raw Supabase rows into this before handing it to the
 * client components.
 */
export type AdminDress = {
  id: string;
  name: string;
  styleName: string;
  price: number;
  cost: number;
  status: string;
  photos: { url: string; label: string }[];
  sizes: {
    size: string;
    bust: number | null;
    waist: number | null;
    length: number | null;
  }[];
  reviews: { name: string; body: string; photoUrl: string | null }[];
  /** How many rentals this dress has had — verified bookings + manually
   *  logged past rentals (for the "Rented N×" badge). */
  rentedCount: number;
};

/**
 * The plain, serializable shape of an accessory as the admin UI works with it.
 * Maps 1:1 to the `accessories` table (price = rental add-on price, cost = your
 * unit cost, stock = how many you own). `stock`/`rented`/`unavailableUnits`
 * split the units into total owned / out on rent / pulled from service; what's
 * actually rentable is `accAvail()` (see lib/accessories.ts).
 */
export type AdminAccessory = {
  id: string;
  name: string;
  /** Rental add-on price shown to customers, in pesos. */
  price: number;
  /** Your unit cost — feeds Analytics. */
  cost: number;
  /** Total units you own. */
  stock: number;
  /** Units out with customers right now (temporary; they return). */
  rented: number;
  /** Units pulled from service — damaged, lost, or in repair (not rentable). */
  unavailableUnits: number;
  /** Public URL of the image in the dress-photos bucket, or null. */
  imageUrl: string | null;
};

/**
 * The plain, serializable shape of a payment channel as the admin UI works with
 * it. Maps 1:1 to the `payment_methods` table (name = e.g. "GCash", qrUrl = the
 * public URL of its QR image, or null until one is uploaded).
 */
export type AdminPaymentMethod = {
  id: string;
  name: string;
  /** Public URL of the QR image in the dress-photos bucket, or null. */
  qrUrl: string | null;
};

/**
 * A rental booking as the admin Bookings & Payments section works with it. The
 * server page shapes the raw row and swaps the private `proof_url` storage path
 * for a short-lived SIGNED URL the browser can actually load.
 */
export type AdminBooking = {
  id: string;
  renter: string;
  dress: string;
  /** Which dress the booking holds — the manual-booking calendar uses this to
   *  work out the chosen dress's taken days. Null if the dress was deleted. */
  dressId: string | null;
  /** Contact number; manual bookings don't carry one (the DM has it). */
  contact: string | null;
  /** Rental dates + preferred delivery time (ISO days / "10:00 AM"). */
  start: string | null;
  end: string | null;
  deliver: string | null;
  amount: number;
  /** 'none' | 'pending' | 'verified' | 'invalid' | 'refunded'. */
  status: string;
  /** Admin-entered (FB/IG/TikTok/walk-in) — no proof; payment set directly. */
  manual: boolean;
  /** When the booking was made (ISO timestamp) — shown as "Booked …". */
  bookedAt: string | null;
  /** Signed URL of the payment screenshot, or null if none was uploaded. */
  proofUrl: string | null;
};

/**
 * A rental history entry as the admin Rental History section works with it.
 * Can be either a completed booking (verified + wash day in past) or a
 * manually logged pre-system rental. The `source` field distinguishes them:
 * "Booking" = completed booking; "Logged" = manually logged rental_history row.
 * Completed bookings have contact and delivery info; logged rentals don't.
 */
export type AdminPastRental = {
  id: string;
  renter: string;
  dress: string;
  /** Rental dates, ISO "YYYY-MM-DD". */
  start: string;
  end: string;
  /** What they actually paid (rental + any add-ons), whole pesos. */
  amount: number;
  /** "Booking" = completed booking; "Logged" = manually logged pre-system rental. */
  source: "Booking" | "Logged";
  /** Only present for "Booking" source — the customer's contact number. */
  contact?: string | null;
  /** Only present for "Booking" source — the dress ID. */
  dressId?: string | null;
};

/**
 * The numbers the Analytics section shows, all computed on the server from
 * VERIFIED bookings (business rule 3) plus manually LOGGED pre-system rentals
 * (rental_history). Money is in whole pesos.
 *
 * Revenue is broken out: `totalEarned` = what verified renters actually paid
 * (the booking `amount`) + `loggedRevenue`, split into `rentalRevenue` (the
 * dress fee), `accessoryRevenue` (add-ons, summed from booking_accessories),
 * and `loggedRevenue` (Σ amount_paid from rental_history). Spend is what
 * the shop paid to own the inventory: `dressSpend` (Σ dress cost) +
 * `accessorySpend` (Σ unit cost × stock on hand). `net` = earned − spend.
 */
export type AnalyticsData = {
  totalEarned: number;
  rentalRevenue: number;
  accessoryRevenue: number;
  /** Earnings from manually logged pre-system rentals. */
  loggedRevenue: number;
  totalSpend: number;
  dressSpend: number;
  accessorySpend: number;
  net: number;
  /** How many verified rentals, and how many rentals still awaiting review. */
  verifiedCount: number;
  pending: number;
  /** How many pre-system rentals were logged manually. */
  loggedCount: number;
  /** Most-rented dress by name (verified + logged), and its rental count. */
  topDress: string;
  topDressCount: number;
  /** Live dresses in the catalogue. */
  dressesLive: number;
  /** Accessory catalogue size + a breakdown of the un-rentable ones: none
   *  available but some out on rent / none available and none on rent (pulled
   *  or none owned) / still available but low (≤2). */
  accessoriesCount: number;
  rentedOut: number;
  unavailable: number;
  lowStock: number;
  /** Average earned per rental (verified + logged), or null when none yet. */
  avgPerRental: number | null;
};

/**
 * A rental as the Booking Calendar works with it. Only active rentals
 * (payment_status pending|verified) reach the calendar — the same set that
 * blocks dates — so each one occupies its start..end days plus a hand-wash day
 * on end+1. Dates are ISO "YYYY-MM-DD".
 */
export type CalendarRental = {
  id: string;
  dress: string;
  renter: string;
  start: string;
  end: string;
  /** Preferred delivery time, e.g. "10:00 AM" (shown on the pick-up day). */
  deliver: string | null;
  /** Logged pre-system rental (rental_history): render rented days but no wash day. */
  logged?: boolean;
};

/**
 * A fitting appointment as the Booking Calendar works with it. Only active
 * fittings (pending|verified) appear, matching booked_fitting_slots.
 */
export type CalendarFitting = {
  id: string;
  dress: string;
  renter: string;
  /** ISO day of the appointment. */
  date: string;
  /** Slot time, e.g. "3:00 PM". */
  time: string | null;
};

/** The sizes a dress can be offered in, in display order. */
export const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/** The labels a product photo can carry. */
export const PHOTO_LABELS = ["Front", "Back", "Detail", "Worn"] as const;
