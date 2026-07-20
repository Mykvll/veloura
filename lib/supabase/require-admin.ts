import type { createClient } from "./server";

/** The server Supabase client type, derived so we don't import the generic. */
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Guard for admin server actions (defense in depth — see the security audit,
 * section 5a).
 *
 * Server actions are just public POST endpoints: anyone can invoke them, and
 * they are normally kept safe only by RLS. But RLS fails *silently* for an anon
 * caller — the write simply matches 0 rows and the action reports success — so
 * an unauthenticated call looks like a no-op instead of a rejection. This helper
 * makes that refusal explicit: call it first in every admin action and it
 * returns an error result (null user → not signed in) before any DB work runs.
 *
 * We verify the user with `getUser()` (server-checked against Supabase), never
 * `getSession()`, matching the app's two auth layers (proxy.ts + the protected
 * layout guard).
 *
 * @param supabase the action's already-created server client (so we don't spin
 *   up a second one just to check auth).
 * @returns `{ error }` when there is no signed-in user, or `null` when the
 *   caller is authenticated and the action may proceed. The `{ error: string }`
 *   shape is a subset of every admin action's `ActionResult`, so callers can
 *   return it directly.
 */
export async function requireAdmin(
  supabase: Supabase,
): Promise<{ error: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in as an admin to do that." };
  }
  return null;
}
