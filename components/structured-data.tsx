import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  CONTACT,
  ADDRESS,
  PRICE_RANGE,
  SAME_AS,
} from "@/lib/site";

/**
 * LocalBusiness structured data (JSON-LD) for the customer home page.
 *
 * This is invisible to shoppers but tells Google exactly who Veloura is, where
 * it operates, and how to reach it — the signal behind rich local-search
 * results. We build the object from lib/site.ts and OMIT any field that's still
 * blank, so we never publish empty/placeholder contact info.
 *
 * Reference: https://schema.org/ClothingStore (a LocalBusiness subtype).
 */
export function StructuredData() {
  // Start with the always-true fields, then layer on whatever contact/address
  // details have been filled in.
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    "@id": `${SITE_URL}/#business`,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    image: `${SITE_URL}/veloura-logo.png`,
    priceRange: PRICE_RANGE,
    currenciesAccepted: "PHP",
    // We rent/serve across the metro even without a walk-in storefront.
    areaServed: { "@type": "City", name: "Metro Manila" },
  };

  if (CONTACT.phone) data.telephone = CONTACT.phone;
  if (CONTACT.email) data.email = CONTACT.email;
  if (SAME_AS.length > 0) data.sameAs = SAME_AS;

  // Only emit a postal address once there's an actual street line to publish;
  // otherwise areaServed above already covers the "we're in Metro Manila" case.
  if (ADDRESS.streetAddress) {
    data.address = {
      "@type": "PostalAddress",
      streetAddress: ADDRESS.streetAddress,
      addressLocality: ADDRESS.city,
      addressRegion: ADDRESS.region,
      postalCode: ADDRESS.postalCode,
      addressCountry: ADDRESS.country,
    };
  }

  return (
    <script
      type="application/ld+json"
      // JSON-LD must be raw JSON inside the script tag. This content is built
      // from our own config (no user input), so there's nothing to inject.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
