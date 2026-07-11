---
name: run-veloura
description: Launch and drive the Veloura dress-rental web app (Next.js) in a browser to see a change working — start the dev server and drive headless Chromium via Playwright. Use when asked to run, start, or screenshot the app, or to confirm a customer-facing change works in the real app.
---

# Running the Veloura app

This is a Next.js (App Router) app backed by Supabase. "Running it" means
starting the dev server and driving a headless Chromium against it with
Playwright, then looking at a screenshot — an agent can't open a browser window.

## Prerequisites (already set up)

- `playwright` is a dev dependency and Chromium is installed. If a fresh
  checkout is missing the browser, run `npx playwright install chromium`.
- `.env.local` holds the Supabase URL + keys. The dev server needs it — the
  collection page fetches dresses/accessories from Supabase on every request
  (`export const dynamic = "force-dynamic"`), so **without env the page renders
  its shell but the grid is empty**.

## Start the dev server

Port matters: `next dev` silently falls back to the next free port (3001, 3002…)
if 3000 is taken, and then your screenshots hit the wrong app. Kill stale
servers and pin the port:

```bash
pkill -f "next dev" 2>/dev/null; sleep 1
PORT=3000 npm run dev > /tmp/veloura-dev.log 2>&1 &
echo $! > /tmp/veloura-dev.pid
# Poll the port — don't `sleep`. First compile can take 10s+.
timeout 60 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done' \
  && echo "up on 3000" || { echo "not up — check /tmp/veloura-dev.log"; tail -20 /tmp/veloura-dev.log; }
```

Stop it when done: `kill $(cat /tmp/veloura-dev.pid)` (or `pkill -f "next dev"`).

## Drive it

Run the smoke driver — it loads the collection, opens the first dress's detail
modal, screenshots each state, and prints any console errors:

```bash
node .claude/skills/run-veloura/smoke.mjs
# screenshots land in $TMPDIR/veloura-shots (path is printed); override with SHOT_DIR=…
```

**Look at the screenshots** — a blank frame is a failed launch, not a pass. Check
the printed `errors` array too: the page can render while every Supabase fetch
fails. Use `smoke.mjs` as the template for a deeper drive (it's plain
Playwright) — `page.locator("main button", { hasText: "FLORENCIA" }).click()`,
`getByRole("button", { name: /Pearl drop earrings/ })`, etc.

## App-specific gotchas

- **The reserve panel is gated behind sizes.** The dress-detail modal only
  renders `<DressDetailsPanel>` (sizes, fees, the accessories picker, the running
  total) when the dress has at least one `dress_sizes` row — otherwise it shows
  "Sizing details coming soon." To exercise the accessories picker, drive a dress
  that has a size (e.g. seed one), not just any card. `smoke.mjs` reports
  `hasAccessoriesPicker` so a data-less run is obvious.
- **Accessories need rows.** The picker reads the `accessories` table; an empty
  table shows no picker section. Out-of-stock (`stock <= 0`) rows render disabled,
  not hidden.
- **Duplicate `key` warning** appears if a dress has two `dress_sizes` rows with
  the same `size` value (the size pills key on `s.size`). That's seed-data noise,
  not a code bug.
- **Controlled inputs**: set values with Playwright `fill`/`type`, not
  `el.value = …` — the latter doesn't fire React's `onChange`.
- **Admin** (`/admin`) is password-protected; the customer collection page (`/`)
  needs no auth.
