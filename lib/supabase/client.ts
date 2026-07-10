import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Browser (client component) Supabase client.
 *
 * Use this ONLY inside components marked "use client" — it runs in the
 * user's browser. It reads the public URL + anon key (both are safe to
 * expose to the browser) and keeps the auth session in sync via cookies
 * that the browser manages automatically.
 *
 * Call createClient() wherever you need it; @supabase/ssr returns the same
 * underlying instance per browser, so it's cheap to call.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
