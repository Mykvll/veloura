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
