import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js runs this on every matching request (see `config.matcher` below),
 * before the page renders. We use it only to keep the Supabase auth session
 * fresh — the actual "is this admin logged in?" check lives in the admin
 * layout (app/admin/(protected)/layout.tsx).
 *
 * This lives in `proxy.ts` (the current Next.js convention; the older
 * `middleware.ts` name is deprecated in Next 16).
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on all routes EXCEPT Next.js internals and static asset files, where
  // refreshing a session would just be wasted work.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
