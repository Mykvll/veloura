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
  /** How many verified rentals this dress has had (for the "Rented N×" badge). */
  rentedCount: number;
};

/** The sizes a dress can be offered in, in display order. */
export const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/** The labels a product photo can carry. */
export const PHOTO_LABELS = ["Front", "Back", "Detail", "Worn"] as const;
