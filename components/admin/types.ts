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
 * unit cost, stock = how many you own).
 */
export type AdminAccessory = {
  id: string;
  name: string;
  /** Rental add-on price shown to customers, in pesos. */
  price: number;
  /** Your unit cost — feeds Analytics. */
  cost: number;
  /** How many you own. Hidden/disabled for customers at 0. */
  stock: number;
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
  contact: string;
  /** Rental dates + preferred delivery time (ISO days / "10:00 AM"). */
  start: string | null;
  end: string | null;
  deliver: string | null;
  amount: number;
  /** 'none' | 'pending' | 'verified' | 'invalid'. */
  status: string;
  /** Signed URL of the payment screenshot, or null if none was uploaded. */
  proofUrl: string | null;
};

/**
 * A pre-system rental as the admin Rental History section works with it. Maps
 * to a `rental_history` row (dress name is the snapshot taken when logged).
 * These exist only for lifetime earnings + wear counts — they skip payment
 * verification and never block calendar dates.
 */
export type AdminPastRental = {
  id: string;
  renter: string;
  dress: string;
  /** Rental dates, ISO "YYYY-MM-DD" (always in the past). */
  start: string;
  end: string;
  /** What they actually paid (rental + any add-ons), whole pesos. */
  amount: number;
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
  /** Accessory catalogue size + how many are out (0) / low (≤2) on stock. */
  accessoriesCount: number;
  outStock: number;
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
