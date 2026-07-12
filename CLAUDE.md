# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
Veloura by CM — a dress-rental web app (Metro Manila) with a public customer
site and a password-protected admin site. Explain changes, add comments, and
prefer small, reviewable steps.

## Commands
- `npm run dev` — start the dev server at http://localhost:3000
- `npm run build` — production build (also the main type/correctness check)
- `npm run lint` — ESLint
- There is no unit-test suite. `node tests/audit-shots.mjs <before|after>` takes
  Playwright screenshots of the customer + admin pages at mobile/desktop sizes
  (dev server must be running); shots land in tests/screenshots/audit/.
- The `/run-veloura` skill launches the app and drives it in a headless browser
  to verify a change works end to end.

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript.
  **Next 16 has breaking changes vs. training data** — read the relevant guide
  in `node_modules/next/dist/docs/` before writing framework-touching code.
  One example already in this repo: request middleware lives in `proxy.ts`
  (exporting `proxy()`), not the deprecated `middleware.ts`.
- Tailwind CSS v4 (brand config in tailwind.config.ts — use the semantic tokens
  like bg-brand-primary, text-text-heading, shadow-card; do NOT invent new colors)
- shadcn/ui for primitives (dialog, select, calendar)
- Supabase (Postgres DB, Storage, Auth). Client code in lib/supabase/.
- Deployed on Vercel.

## Architecture
- **Routes**: the customer site is a single page (`app/page.tsx`) with modals
  for dress detail / reserve flows. Admin lives under `app/admin/`:
  `app/admin/login/` is public; everything else sits in the
  `app/admin/(protected)/` route group, whose `layout.tsx` is the auth guard —
  it calls `supabase.auth.getUser()` (server-verified, never `getSession()`)
  and redirects to /admin/login when unauthenticated. It is `force-dynamic`.
- **Supabase clients**: `lib/supabase/server.ts` for server components/actions
  (async — always `await createClient()`); `lib/supabase/client.ts` for browser
  code; `proxy.ts` → `lib/supabase/middleware.ts` refreshes the auth session on
  every request. Everything uses the anon key + RLS; there is no service-role
  key in the app.
- **Generated DB types**: `lib/supabase/types.ts` is generated from the live
  schema (Supabase MCP `generate_typescript_types`). Regenerate it after any
  schema change; don't hand-edit it.
- **Availability**: the `blocked_dates` DB view is the single source of truth
  for which dates a dress is taken (rental days + the end_date+1 wash day, for
  pending/verified bookings). Customer calendars render from it, and server
  actions re-check it right before inserting a booking — see the
  "WHY WE RE-CHECK ON THE SERVER" note in `app/reserve-actions.ts`.
- **Mutations are all server actions**: `app/reserve-actions.ts` (customer rent
  + fitting bookings), `app/admin/(protected)/*-actions.ts` (dress, accessory,
  booking, payment CRUD), `app/admin/actions.ts` (sign-out). Shared reserve-flow
  constants/date math live in `lib/reserve.ts`, imported by both the client
  forms and the server action so they can't drift apart.
- **Components**: `components/` (customer site), `components/reserve/` (the
  multi-step rent/fitting/payment forms), `components/admin/` (admin managers +
  editor modals), `components/ui/` (shadcn primitives).
- **Uploads** (customer IDs, payment proofs) go to the private
  `payment-proofs` Storage bucket; the DB stores storage paths, not URLs.
- **Local-only dirs**: `docs/` and `tests/` exist locally but are gitignored —
  don't rely on them being present for other contributors.

## Design source of truth (read BEFORE building any screen)
The brand and every screen's look/behavior live in the separate **Veloura design
project**, which you can read over the **design MCP**: prototypes
(ui_kits/webapp/index.html = customer, admin.html = admin), tokens
(docs/design-tokens.md), and rules (readme.md). This app repo does NOT contain
those files — always pull them from the design MCP, not the local tree.
The "by CM" script font (Alex Brush) is for the logo lockup ONLY.

## Workflow for every feature/screen
1. Read the matching prototype + tokens over the design MCP first.
2. Read the existing code in this repo (components/, app/) and build on it —
   never recreate a component that already exists.
3. Honor the business rules and conventions below.
4. Make a small, reviewable change; explain what you changed and why.
5. If the design MCP is unavailable, STOP and tell me — don't guess the design.

## Data model
See the Veloura data model over the design MCP (docs/data-model.md) for tables
and RLS policies. Tables: dresses,
dress_photos, dress_sizes, reviews, accessories, bookings, booking_accessories.

## Business rules that code must honor
1. A rental blocks its dates start_date..end_date PLUS end_date+1 (hand-wash day),
   unavailable to both rent and fit.
2. Accessories have limited stock; decrement on a verified booking; hide/disable
   at 0. Do stock changes on the server.
3. bookings.payment_status is none|pending|verified|invalid. Analytics count
   verified only. Admin can verify, flag invalid, or delete (delete frees dates).
4. Destructive admin actions (delete dress/accessory/booking) must show a confirm
   step first.

## Conventions
- Fetch data in server components; add "use client" only where interactivity is needed.
- Keep secrets in .env.local, never in committed code.
- Mobile-first; 44px minimum tap targets; the app must work on iOS Safari and
  Android Chrome.
- Title color rule: ALL display-serif titles (hero, section titles, dress names,
  modal titles) and the VELOURA/"by CM" wordmark are GOLD (text.accent #9C7B3C).
  Brown (text.primary / text.heading) is for body copy, labels, and spec text only.
