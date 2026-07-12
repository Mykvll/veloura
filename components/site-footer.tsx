import { MapPin, Send, Heart } from "lucide-react";

/**
 * The customer-site footer (design/index.html → <Footer />).
 *
 * Two stacked strips, matching the catalogue:
 *  1. a tagline line on the page background, in gold italic display serif;
 *  2. the taupe contact band (brand.secondary) with white uppercase entries.
 *
 * These are static informational labels (not links), exactly as the prototype
 * has them, so no interactivity — this stays a server component.
 */
const CONTACT = [
  { Icon: MapPin, label: "Metro Manila" },
  { Icon: Send, label: "DM us for reservations" },
  { Icon: Heart, label: "Veloura by CM" },
] as const;

export function SiteFooter() {
  return (
    <footer>
      {/* Tagline strip — gold italic, per the title colour rule. */}
      <div className="bg-background-page px-5 py-8 text-center">
        <p className="font-display text-display-md italic tracking-wide text-text-accent">
          Wear luxury, not the price.
        </p>
      </div>

      {/* Taupe contact band with white uppercase entries. */}
      <div className="flex flex-wrap items-center justify-around gap-4 bg-brand-secondary px-5 py-4 text-text-on-primary">
        {CONTACT.map(({ Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-2.5 text-label-sm uppercase tracking-label"
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            {label}
          </span>
        ))}
      </div>
    </footer>
  );
}
