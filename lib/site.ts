/**
 * Central site / SEO / business configuration.
 *
 * This is the ONE place to edit Veloura's public identity: the values here feed
 * the page <title>/description, Open Graph + Twitter link previews (app/layout),
 * the sitemap + robots files, and the LocalBusiness structured data that tells
 * Google who/where we are (components/structured-data.tsx).
 *
 * Anything marked `TODO(seo)` is a placeholder — replace it with the real value.
 * Nothing here is secret; it all ships to the browser and to search engines.
 */

/** Canonical production origin (no trailing slash). */
export const SITE_URL = "https://velourabycm.com";

/** Brand name, used in titles and structured data. */
export const SITE_NAME = "Veloura by CM";

/** Short brand tagline (from the hero lockup). */
export const SITE_TAGLINE = "Every entrance deserves elegance";

/**
 * Meta description — the sentence Google shows under the title in results, and
 * the subtitle in link previews. Aim for ~150–160 characters, lead with what
 * we do + where, and read naturally (keyword-stuffing hurts).
 */
export const SITE_DESCRIPTION =
  "Veloura by CM rents elegant designer dresses in Metro Manila for graduations, weddings, formal events, and date nights. Reserve your gown online.";

/** Search keywords/themes (lightweight signal; Google ignores the old meta but
 * these still document our target terms and feed some other engines). */
export const SITE_KEYWORDS = [
  "dress rental Metro Manila",
  "dress rental Philippines",
  "gown rental Manila",
  "formal dress rental",
  "graduation dress rental",
  "wedding guest dress rental",
  "designer dress rental Manila",
  "Veloura by CM",
];

/**
 * Public contact + social handles. Leave a field as an empty string to omit it
 * everywhere it's used. These appear in the LocalBusiness structured data.
 */
export const CONTACT = {
  // Public contact number in E.164 format.
  phone: "+639765226455",
  // Public contact email.
  email: "teanochyren3@gmail.com",
  // Full Instagram profile URL.
  instagram: "https://www.instagram.com/velourabycm",
  // Full Facebook page URL.
  facebook: "https://www.facebook.com/61590712269920/",
};

/**
 * Physical business/pickup address for LocalBusiness structured data.
 * Fill every field you're comfortable publishing — a complete address is what
 * earns the strongest local-search treatment. Leave streetAddress empty to fall
 * back to area-only ("areaServed") without a mailing address.
 */
export const ADDRESS = {
  // TODO(seo): e.g. "Unit 5, 123 Sample St., Barangay Name".
  streetAddress: "Tower 2, Harbour Park Residences, Barangay Vergara",
  city: "Mandaluyong",
  region: "Metro Manila",
  postalCode: "1550",
  country: "PH",
};

/** Price band shown in structured data ($ = budget … $$$$ = luxury). */
export const PRICE_RANGE = "$$";

/** Social/profile URLs Google can use to corroborate the business identity. */
export const SAME_AS = [CONTACT.instagram, CONTACT.facebook].filter(Boolean);
