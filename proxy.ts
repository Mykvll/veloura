import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp } from "@/lib/csp";

/**
 * Next.js runs this on every matching request (see `config.matcher` below),
 * before the page renders. It does two things:
 *  1. Keeps the Supabase auth session fresh (the actual "is this admin logged
 *     in?" check lives in the admin layout, app/admin/(protected)/layout.tsx).
 *  2. Attaches a per-request Content-Security-Policy in REPORT-ONLY mode.
 *
 * This lives in `proxy.ts` (the current Next.js convention; the older
 * `middleware.ts` name is deprecated in Next 16).
 */
export async function proxy(request: NextRequest) {
  // A fresh, unguessable nonce per request. Next.js reads it back off the
  // request's CSP header (below) and stamps it onto its own inline scripts, so
  // those trusted scripts satisfy the policy instead of tripping it.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildCsp(nonce, isDev);

  // Put the nonce + policy on the REQUEST so Next can extract the nonce and
  // apply it during render. We use the report-only header name here too: Next
  // reads `content-security-policy` OR `content-security-policy-report-only`
  // for the nonce, and we only ever want to report — never block — for now.
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy-report-only", csp);

  // Run the Supabase session refresh, which returns the response we send back
  // (a redirect for unauthenticated /admin pages, or a pass-through otherwise).
  const response = await updateSession(request);

  // Emit the policy to the browser as REPORT-ONLY: violations are logged to the
  // console but nothing is blocked. Flip this header name to
  // `Content-Security-Policy` to enforce once the reports come back clean.
  response.headers.set("Content-Security-Policy-Report-Only", csp);

  return response;
}

export const config = {
  // Run on all routes EXCEPT Next.js internals and static asset files, where
  // refreshing a session would just be wasted work.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
