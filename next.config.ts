import type { NextConfig } from "next";

// Baseline HTTP security headers applied to every response. These are static
// (no per-request values) so they live in next.config.ts rather than proxy.ts.
// A full Content-Security-Policy is intentionally NOT set here yet — it needs a
// nonce (per-request, via proxy.ts) and an audit of what the app loads; see the
// CSP follow-up plan in docs/security-enhancement/.
const securityHeaders = [
  {
    // Disallow the site being framed anywhere — clickjacking protection.
    // (CSP frame-ancestors 'none' will supersede this once the CSP lands.)
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Stop browsers from MIME-sniffing a response away from its declared type.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Send the full referrer same-origin, only the origin cross-origin, and
    // nothing when downgrading HTTPS→HTTP.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
];

const nextConfig: NextConfig = {
  images: {
    // Allow next/image to optimize dress photos served from Supabase Storage.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zurjduoqwzpqulsgssns.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // --- Image-transformation budget ---
    // Vercel counts one billable transformation per UNIQUE (source × width ×
    // quality × format), then caches it. Next's defaults expose 8 device sizes
    // + 7 image sizes, so every browser DPR/viewport combo can request a
    // different width and mint a separate transformation. This is a mobile-first
    // rental site with phone-shot portrait photos, so we trim the width buckets
    // to a handful of shared widths — de-duplicating requests collapses ~10
    // distinct widths per dress photo down to ~4, cutting the monthly count.
    // (formats defaults to ['image/webp'] and qualities to [75] already, so the
    // only remaining multiplier is the width list below.)
    deviceSizes: [640, 828, 1080, 1920], // was [640,750,828,1080,1200,1920,2048,3840]; drop redundant + 4K-tier widths
    imageSizes: [64, 128, 256], // was [32,48,64,96,128,256,384]; covers logos (44/110px) + 80px gallery thumbs at 1x/2x
    // Keep each unique transformation cached ~31 days so the same variant is
    // billed at most once per month; dress photos change via new upload paths,
    // not in-place edits, so a long TTL is safe.
    minimumCacheTTL: 2678400,
  },
  async headers() {
    return [
      {
        // Apply the baseline headers to all routes.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
