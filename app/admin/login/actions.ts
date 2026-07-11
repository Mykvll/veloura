"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The shape our login form reads back to show errors. `useActionState` on the
 * form passes the previous state in and expects the new state out.
 */
export type LoginState = { error: string | null };

/**
 * Server action: sign an admin in with email + password.
 *
 * Runs on the server (never in the browser), so it can set the auth session
 * cookies securely. On success we redirect into the admin area; on failure we
 * return a friendly message the form can display.
 */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Keep the message generic — don't reveal whether the email exists.
    return { error: "Incorrect email or password." };
  }

  // Signed in. redirect() throws internally to stop the action, so nothing
  // after it runs.
  redirect("/admin");
}
