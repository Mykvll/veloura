"use client";

import { useFormStatus } from "react-dom";
import { signOut } from "@/app/admin/actions";

/**
 * The submit button needs `useFormStatus`, which only reports pending state
 * from INSIDE the <form> it belongs to — hence the tiny inner component.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-tap rounded-pill border border-border-soft px-4 text-label-sm uppercase tracking-label text-text-secondary transition-fast hover:bg-background-panel hover:text-text-heading focus-visible:shadow-focus disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

/**
 * Sign-out form for the admin header. A client component only so the button
 * can disable itself and show "Signing out…" while the server action runs.
 */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <SubmitButton />
    </form>
  );
}
