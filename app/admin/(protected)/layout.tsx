import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../actions";

// The session comes from cookies, so anything under here is per-request, never
// statically cached.
export const dynamic = "force-dynamic";

/**
 * Guard + shell for every protected admin page.
 *
 * This layout wraps all admin routes EXCEPT /admin/login (which lives outside
 * the `(protected)` route group). Because it wraps them, the auth check here
 * runs before any of those pages render — so there's no way to see an admin
 * page without a valid session.
 *
 * How the check works on the server:
 *  - `supabase.auth.getUser()` reads the auth cookies from the request and
 *    asks Supabase to VERIFY the token (not just decode it). That network
 *    round-trip is why we use getUser() and not getSession() on the server —
 *    getSession() trusts the cookie as-is, which a client could tamper with.
 *  - No verified user → redirect to the login page before rendering anything.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Admin header */}
      <header className="border-b border-border-soft bg-background-card">
        <div className="mx-auto flex w-full max-w-page-max items-center justify-between px-6 py-4">
          <span className="font-display text-display-md uppercase tracking-display text-text-accent">
            Veloura Admin
          </span>

          <div className="flex items-center gap-4">
            <span className="hidden text-body-sm text-text-secondary sm:inline">
              {user.email}
            </span>
            {/* Sign out is a server action, so no client JS is needed here. */}
            <form action={signOut}>
              <button
                type="submit"
                className="min-h-tap rounded-sm border border-border-soft px-4 text-label-sm uppercase tracking-label text-text-secondary transition-fast hover:bg-background-panel hover:text-text-heading focus-visible:shadow-focus"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-page-max flex-1 px-6 py-12">
        {children}
      </main>
    </div>
  );
}
