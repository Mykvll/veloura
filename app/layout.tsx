import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Poppins,
  Alex_Brush,
  Italiana,
  Pinyon_Script,
  Marcellus,
} from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { cn } from "@/lib/utils";
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_TAGLINE,
} from "@/lib/site";

// Display serif — page titles, section/card headings (font-display).
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
  display: "swap",
});

// Body sans — default text, inputs, labels (font-body).
const body = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

// Script — the "by CM" lockup (font-script).
const script = Alex_Brush({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-script",
  display: "swap",
});

// Hero-only pairing (font-hero-serif / font-hero-script). These override the
// display font for the home-page tagline lockup ONLY — everything else keeps
// Cormorant Garamond. See the "Every Entrance / deserves elegance" hero in
// app/page.tsx and the design project's ui_kits/webapp/index.html.
const heroSerif = Italiana({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-hero-serif",
  display: "swap",
});

const heroScript = Pinyon_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-hero-script",
  display: "swap",
});

// Section titles (font-section) — the ✦ TITLE ✦ headings on both the customer
// one-pager and the admin page. Marcellus ships in a single 400 weight; the
// display-lg token asks for 500, which the browser synthesizes, exactly as the
// design project's SectionTitle does.
const section = Marcellus({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-section",
  display: "swap",
});

export const metadata: Metadata = {
  // metadataBase lets Next resolve the relative OG/canonical URLs below to
  // absolute ones (required for valid Open Graph tags).
  metadataBase: new URL(SITE_URL),
  // Template: sub-pages can set just `title: "Foo"` and get "Foo | Veloura by CM".
  // `default`/`absolute` keep the home page's title clean (no trailing brand).
  title: {
    default: `${SITE_NAME} — Dress Rental in Metro Manila`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  // Canonical URL for the home page — prevents duplicate-content dilution from
  // query strings, www/non-www, etc.
  alternates: { canonical: "/" },
  // Open Graph — the preview card shown when a link is shared on Facebook,
  // Messenger, Viber, WhatsApp, Instagram, iMessage, LinkedIn, etc. (i.e. every
  // platform our customers actually use). Uses app/opengraph-image (the
  // file-based convention) for the image, so no `images` array is needed here.
  // Note: we deliberately don't set Twitter-card tags — X falls back to these
  // Open Graph tags, and Veloura has no Twitter presence to tailor for.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_PH",
  },
  // Let Google index the public site and follow its links.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // Expose each font as a CSS variable; the brand color/body font are
      // applied in globals.css so every page inherits them.
      className={cn(
        // scroll-smooth: the one-pager's nav + hero CTA are plain #anchors;
        // this gives them smooth scrolling with no client JS.
        "h-full scroll-smooth antialiased",
        display.variable,
        body.variable,
        script.variable,
        heroSerif.variable,
        heroScript.variable,
        section.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Vercel Speed Insights — reports real-user Core Web Vitals to the
            Vercel dashboard. No-ops outside Vercel deployments. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
