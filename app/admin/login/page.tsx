import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

// The session lives in cookies, so this page must never be statically cached.
export const dynamic = "force-dynamic";

/**
 * Admin login page (/admin/login).
 *
 * This route sits OUTSIDE the protected layout on purpose, so someone who
 * isn't signed in can actually reach it. If they're ALREADY signed in, there's
 * no reason to show the form — send them straight to the admin dashboard.
 */
export default async function AdminLoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/admin");
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-display text-display-lg uppercase tracking-display text-text-accent">
        Admin
      </h1>
      <p className="mt-2 text-body-base text-text-secondary">
        Sign in to manage the collection.
      </p>

      <LoginForm />
    </main>
  );
}
