/**
 * Content-Security-Policy builder — the single source of truth for our CSP.
 *
 * This is being rolled out in REPORT-ONLY mode first (see proxy.ts): the browser
 * reports violations to the console but blocks nothing, so we can watch what a
 * real policy would break before enforcing it. See the CSP rollout plan in
 * docs/security-enhancement/.
 *
 * What the app actually loads (audited 2026-07-20), and why each directive is
 * shaped the way it is:
 *  - scripts: only Next.js's own inline bootstrap/hydration scripts — no
 *    third-party JS. We nonce them ('strict-dynamic' lets those trusted scripts
 *    load their chunks) so we never need 'unsafe-inline' for scripts.
 *  - styles: Tailwind's stylesheet (self) PLUS Radix/shadcn inline `style`
 *    attributes (dialogs, selects, calendar). A nonce can't cover inline style
 *    *attributes*, so style-src must keep 'unsafe-inline'.
 *  - fonts: next/font/google self-hosts the fonts at build time → served from
 *    _next/static (self). No Google Fonts domain needed.
 *  - images: next/image (same-origin) + plain <img> from the public Supabase
 *    'dress-photos' bucket + blob:/data: upload previews.
 *  - connect (fetch/XHR): Supabase auth + REST from the browser client. No
 *    realtime/websockets are used today, so no wss: is included.
 *
 * We allow https://*.supabase.co to cover both the dev and prod Supabase
 * projects; tighten this to the exact prod host if you want a stricter policy.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  // 'unsafe-eval' is only needed in dev, where React uses eval() for its error
  // overlay / stack reconstruction. It is never emitted in production.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    isDev ? "'unsafe-eval'" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https://*.supabase.co`,
    `font-src 'self'`,
    `connect-src 'self' https://*.supabase.co`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join("; ");
}
