"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

/**
 * hCaptcha site key (public — safe to ship in the browser bundle). In dev we
 * fall back to hCaptcha's official TEST key, which always passes, so local
 * sign-in works without any setup. Production MUST set the real key in Vercel;
 * the matching secret key lives in the Supabase dashboard (Auth → Attack
 * Protection → CAPTCHA), never in this repo.
 */
const HCAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ??
  "10000000-ffff-ffff-ffff-000000000001";

/**
 * The login form. It's a client component because it uses `useActionState` to
 * show a pending state / error, and because the hCaptcha widget hands us a
 * single-use token we stash in a hidden field for the server action to verify.
 */
export function LoginForm() {
  // `state` holds whatever the action returned (e.g. an error); `formAction`
  // is what we hand to <form action={...}>; `pending` is true while the action
  // is running so we can disable the button.
  const [state, formAction, pending] = useActionState(login, initialState);

  // The hCaptcha token, set once the widget verifies the visitor. It's cleared
  // after each submit because hCaptcha tokens are single-use.
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<HCaptcha>(null);

  // A completed attempt (success redirects away; failure returns an error)
  // burns the token. Reset the widget so the next try gets a fresh one.
  useEffect(() => {
    if (state.error) {
      setCaptchaToken("");
      captchaRef.current?.resetCaptcha();
    }
  }, [state.error]);

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

      {/* Bot check. onVerify fires with the token when the visitor passes; the
          hidden input carries it into the server action via form data. */}
      <HCaptcha
        ref={captchaRef}
        sitekey={HCAPTCHA_SITE_KEY}
        onVerify={(token) => setCaptchaToken(token)}
        onExpire={() => setCaptchaToken("")}
      />
      <input type="hidden" name="captchaToken" value={captchaToken} />

      {/* Error message, only shown when the action reported one. */}
      {state.error ? (
        <p className="text-body-sm text-state-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !captchaToken}
        className="min-h-tap w-full rounded-pill bg-brand-primary px-6 text-label-base uppercase tracking-label text-text-on-primary transition-fast hover:bg-brand-primary-hover active:bg-brand-primary-active focus-visible:shadow-focus disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
