# The SQL in this folder

Two Supabase projects: **dev** (`mzph…`, what `.env.local` and Vercel Preview use)
and **prod** (`zurj…`, what velourabycm.com uses). Apply to dev, verify, then prod.

## Build a dev database from scratch

| file | what it does |
|---|---|
| `dev-db-setup.sql` | The whole schema in its current shape, plus the catalogue and some mock bookings. Run once in a brand-new project. Not a stack of patches — keep it in sync whenever a migration lands. |

## Per-size availability — shipped to prod 2026-09-16

Each size a dress is listed in is a separate garment, so renting the M leaves
the L bookable on the same dates. Run in this order:

| file | when |
|---|---|
| `prod-step1-add-size-column.sql` | First. Adds an empty `size` column and fills in every dress that has only one size. Changes no behaviour — safe on a live site, safe to re-run. Ends with queries listing anything left to label by hand. |
| `per-size-availability.sql` | The main migration. Re-keys availability to (dress, size), adds the wash-day release, narrows the fitting rule, and rewrites both booking functions. One transaction: it either completes or does nothing. **Refuses to run if a booking with upcoming dates has no size** — label those first. |
| `prod-step5-drop-compat-shim.sql` | Last, and **not immediately**. Removes the backwards-compatibility function that keeps the previously-deployed site working. Leaving it in place is what makes a rollback possible. Read the header. |

`fitting-rule-per-size.sql` re-applies just the fitting rule from
`per-size-availability.sql` §6. It exists because dev's copy got overwritten by
one of the superseded files below; prod never needed it.

## Superseded — do not run

| file | why it's dangerous |
|---|---|
| `free-fittings-rpc.sql` | Both contain the OLD fitting rule: "no fittings on any day ANY dress is out". Running either silently reverts the current rule ("only once EVERY size of THIS dress is out"). This already happened once on dev and took a while to diagnose. Kept only as a record of what was applied at the time. |
| `sync-dev-fitting-rpc.sql` | |

## Things that have bitten us

- **New Supabase projects grant nothing to `anon`/`authenticated` automatically.**
  Every migration that adds a table, view or function must carry explicit
  `grant` statements, or PostgREST answers "permission denied" before RLS is
  even consulted.
- **`create or replace` keeps a view's grants; `drop` + `create` loses them.**
  A replaced view can only gain columns at the end.
- **Changing a function's arguments creates a new function**, it doesn't replace
  the old one. Drop the old signature explicitly and re-grant the new one.
- **These files can be tested without a database.** `dev-db-setup.sql` and the
  migrations run end-to-end in PGlite (`@electric-sql/pglite` plus its bundled
  `btree_gist`), which is how the per-size work was verified before it went
  anywhere near dev. Create the `anon`, `authenticated` and `service_role` roles
  first, and skip the sections that need Supabase's `vault` schema.
