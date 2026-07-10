import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Server (server component / route handler / server action) Supabase client.
 *
 * Use this on the server: in server components, route handlers, and server
 * actions. It runs on Vercel's servers, never in the browser. It reads the
 * auth session from the incoming request's cookies so queries run as the
 * logged-in user (and RLS policies apply to them).
 *
 * In Next.js App Router, cookies() is async, so this helper is async too —
 * always `await createClient()`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read every cookie the browser sent with the request.
        getAll() {
          return cookieStore.getAll();
        },
        // Write refreshed auth cookies back. When this runs inside a server
        // component (where cookies are read-only) the write throws; that's
        // fine — middleware refreshes the session, so we swallow the error.
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore.
          }
        },
      },
    },
  );
}
