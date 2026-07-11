"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

/**
 * The login form. It's a client component only because it uses `useActionState`
 * to show a pending state and any error message; the actual sign-in work runs
 * on the server in the `login` action.
 */
export function LoginForm() {
  // `state` holds whatever the action returned (e.g. an error); `formAction`
  // is what we hand to <form action={...}>; `pending` is true while the action
  // is running so we can disable the button.
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-label-sm uppercase tracking-label text-text-secondary"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="min-h-tap w-full rounded-sm border border-border-soft bg-background-card px-4 text-body-base text-text-primary outline-none transition-fast focus-visible:border-border-accent focus-visible:shadow-focus"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-label-sm uppercase tracking-label text-text-secondary"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-tap w-full rounded-sm border border-border-soft bg-background-card px-4 text-body-base text-text-primary outline-none transition-fast focus-visible:border-border-accent focus-visible:shadow-focus"
        />
      </div>

      {/* Error message, only shown when the action reported one. */}
      {state.error ? (
        <p className="text-body-sm text-state-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="min-h-tap w-full rounded-sm bg-brand-primary px-6 text-label-base uppercase tracking-label text-text-on-primary transition-fast hover:bg-brand-primary-hover focus-visible:shadow-focus disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
