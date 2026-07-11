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

## Documentation drive (full reserve flow + checklist)

When the ask is to **prove a customer-facing flow works and hand off screenshots**
(not just a quick smoke), use `doc-drive.mjs`. It walks the entire reserve flow
and produces the "final output": one **numbered screenshot per state** plus a
`results` JSON of assertions that proves each behaviour actually happened.

```bash
# 1) seed blocked days (see the header of doc-drive.mjs for the exact INSERT).
#    Dates MUST be future days in one month — past days render disabled.
# 2) run the drive:
node .claude/skills/run-veloura/doc-drive.mjs
# → writes ./reserve-flow-screenshots/01..11-*.png  (override with SHOT_DIR=…)
# 3) clean up (below), then Read the PNGs back so they render for the user.
```

It captures: `01-collection`, `02-detail-modal`, `03-rent-calendar` (this dress's
days disabled, another dress's booked days clickable-with-dot), `04-rent-date-selected`,
`05-next-month-jump-to-today`, `06-fitting-calendar` (any booked day disabled),
`07-rent-form-filled`, `08-rent-confirmation`, `09-overlap-rejected` (server
re-check), `10-fitting-form-filled`, `11-fitting-confirmation`. Each screenshot
number in `doc-drive.mjs` is a checklist item — add a step + `shot("NN-…png")`
to extend it.

**Deliverable to the user:** the numbered PNGs (they persist in
`reserve-flow-screenshots/`, which is untracked — not committed), a checklist
table mapping each item to its screenshot + assertion, and confirmation that
`errors` was empty and test data was cleaned up. `Read` each PNG so it renders
inline in the reply.

### Clean up after a write drive

`doc-drive.mjs` **writes** bookings and uploads test IDs. Always undo it so the
DB/storage stay clean (over the Supabase MCP / SQL, then the storage helper):

```sql
-- 1) delete the seed + form-created bookings and any orphaned accessory links
delete from bookings where renter_name in
  ('DEMO Florencia','DEMO Carmela','Maria Santos','Fitting Tester','Overlap Tester');
delete from booking_accessories ba
  where not exists (select 1 from bookings b where b.id = ba.booking_id);
```

```sql
-- 2) grant the anon role TEMP read+delete on the private bucket so the helper
--    can remove the uploaded test IDs (SQL can't delete storage objects directly)
create policy "temp cleanup select" on storage.objects for select to anon using (bucket_id='payment-proofs');
create policy "temp cleanup delete" on storage.objects for delete to anon using (bucket_id='payment-proofs');
```

```bash
node .claude/skills/run-veloura/storage-cleanup.mjs   # removes ids/*.png
```

```sql
-- 3) DROP the temp policies (leave only "public upload payment-proofs")
drop policy "temp cleanup select" on storage.objects;
drop policy "temp cleanup delete" on storage.objects;
```

Verify a clean slate: `select count(*) from bookings;` → 0 (if the DB had none
before), and `pg_policies` on `storage.objects` shows only the real policies.

## App-specific gotchas

- **The reserve buttons are gated behind sizes.** The dress-detail modal only
  renders `<DressDetailsPanel>` (sizes, fees, the **Reserve this dress** +
  **Book a fitting** buttons) when the dress has at least one `dress_sizes` row —
  otherwise it shows "Sizing details coming soon." Drive a dress that has a size
  (e.g. seed one), not just any card. `smoke.mjs` reports `hasReserveButtons`.
- **The reserve flow is a wizard inside the modal.** Clicking a reserve button
  swaps the modal body to the **date step**: the availability calendar (left) +
  the rent/fitting form (right), then a confirmation step. So the accessories
  picker and the ID upload live in the **rent form**, NOT on the detail page.
  `getByRole("button",{name:"Reserve this dress"})` → date step (rent);
  `"Book a fitting"` → date step (fitting); `"← Back to details"` goes back.
- **Accessories need rows.** The rent form's picker reads the `accessories`
  table; an empty table shows no picker. Out-of-stock (`stock <= 0`) rows render
  disabled, not hidden.
- **Writes run as `anon` and can't read back.** Bookings are INSERT-only for the
  public role (SELECT is admin-only), so the reserve flow never uses
  `.insert().select()`. A drive that submits a booking creates real rows — always
  clean up (see the documentation-drive section).
- **Duplicate `key` warning** appears if a dress has two `dress_sizes` rows with
  the same `size` value (the size pills key on `s.size`). That's seed-data noise,
  not a code bug.
- **Controlled inputs**: set values with Playwright `fill`/`type`, not
  `el.value = …` — the latter doesn't fire React's `onChange`.
- **Admin** (`/admin`) is password-protected; the customer collection page (`/`)
  needs no auth.
