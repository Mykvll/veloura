"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server action: sign the current admin out.
 *
 * Called from the sign-out button's <form>. It clears the Supabase session
 * cookies on the server, then sends the user back to the login page.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
