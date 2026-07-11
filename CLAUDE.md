# Veloura by CM — project context for Claude Code

## What this is
A dress-rental web app (Metro Manila) with a public customer site and a
password-protected admin site. Beginner developer — explain your changes and
add comments. Prefer small, reviewable steps.

## Stack
- Next.js (App Router) + React + TypeScript
- Tailwind CSS (brand config already in tailwind.config.ts — use the semantic
  tokens like bg-brand-primary, text-text-heading, shadow-card; do NOT invent
  new colors)
- shadcn/ui for primitives (dialog, select, calendar)
- Supabase (Postgres DB, Storage, Auth). Client code in lib/supabase/.
- Deployed on Vercel.

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