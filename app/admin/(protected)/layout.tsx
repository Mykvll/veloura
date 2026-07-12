import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { SiteFooter } from "@/components/site-footer";

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
      {/* Admin header — round logo + VELOURA / "by CM" lockup on the left,
          section links on the right, plus sign-out. */}
      <header className="sticky top-0 z-20 border-b border-border-soft bg-background-card">
        <div className="mx-auto flex w-full max-w-page-max flex-wrap items-center gap-x-5 gap-y-1 px-6 py-2.5">
          <span className="flex flex-none items-center gap-3">
            <Image
              src="/veloura-logo.png"
              alt=""
              width={44}
              height={44}
              className="h-9 w-9 rounded-full md:h-11 md:w-11"
              priority
            />
            <span className="flex flex-col leading-none">
              <span className="font-display text-logo uppercase tracking-[0.14em] text-text-accent">
                VELOURA
              </span>
              <span className="mt-0.5 font-script text-lg leading-none text-text-accent">
                by CM
              </span>
            </span>
          </span>

          {/* Section links — right-aligned beside the lockup on wide screens.
              The admin bar carries six links + sign-out, so its "narrow" mode
              (links on their own full-width row under the lockup, scrolling
              sideways if needed) applies below lg, not just below the 720px
              brand breakpoint. */}
          <div className="flex flex-1 justify-end overflow-x-auto max-lg:order-last max-lg:w-full max-lg:flex-none max-lg:justify-start max-lg:border-t max-lg:border-background-panel">
            <AdminNav />
          </div>

          <div className="ml-auto flex flex-none items-center gap-3">
            <span className="hidden text-body-sm text-text-secondary xl:inline">
              {user.email}
            </span>
            {/* Sign out still runs as a server action; the client wrapper only
                adds the "Signing out…" pending state on the button. */}
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-page-max flex-1 px-6 py-12">
        {children}
      </main>

      {/* Same tagline + taupe contact band as the customer site (admin.html
          ends with the shared <Footer />). */}
      <SiteFooter />
    </div>
  );
}
