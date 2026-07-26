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
  // hCaptcha proves a human (not a brute-force bot) is signing in. The widget
  // in login-form.tsx produces this single-use token; Supabase Auth verifies it
  // against the secret key configured in the dashboard before checking the
  // password, so a bot without a valid token never reaches the password check.
  const captchaToken = String(formData.get("captchaToken") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }
  if (!captchaToken) {
    return { error: "Please complete the CAPTCHA and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });

  if (error) {
    // A failed captcha check (expired/reused token, or a misconfigured secret)
    // surfaces here too — call it out so the user knows to redo the widget
    // rather than second-guessing their password.
    if (/captcha/i.test(error.message)) {
      return { error: "CAPTCHA check failed. Please try again." };
    }
    // Otherwise keep the message generic — don't reveal whether the email exists.
    return { error: "Incorrect email or password." };
  }

  // Signed in. redirect() throws internally to stop the action, so nothing
  // after it runs.
  redirect("/admin");
}
