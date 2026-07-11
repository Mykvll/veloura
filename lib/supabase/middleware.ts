import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

/**
 * Keep the logged-in user's session fresh on every request.
 *
 * Supabase auth tokens are short-lived and need periodic refreshing. Server
 * components (like our admin layout) can read cookies but CAN'T write them, so
 * they can't refresh an expired token on their own. Middleware runs before the
 * page and CAN write cookies, so this is where the refresh happens.
 *
 * The flow:
 *  1. Build a response we can attach cookies to.
 *  2. Create a Supabase client wired to read the request's cookies and write
 *     any refreshed ones onto that response.
 *  3. Call getUser() — this contacts Supabase, and if the access token was
 *     stale it hands back a new one, which setAll() writes to the response.
 *
 * The browser then stores the refreshed cookies, and the next server render
 * sees a valid session.
 */
export async function updateSession(request: NextRequest) {
  // Start with a pass-through response; we may replace it below when cookies
  // need to be written back.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // What the browser sent us.
        getAll() {
          return request.cookies.getAll();
        },
        // Refreshed cookies get written both onto the incoming request (so the
        // rest of this request sees them) and onto the outgoing response (so
        // the browser saves them).
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: this call is what actually refreshes the session. Don't remove
  // it, and don't run any auth logic between creating the client and here.
  await supabase.auth.getUser();

  return supabaseResponse;
}
