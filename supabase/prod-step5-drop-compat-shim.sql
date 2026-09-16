-- ============================================================================
-- PROD STEP 5 — remove the compatibility shim
-- ============================================================================
-- WHAT THIS IS
-- per-size-availability.sql §6b put the old 9-argument create_rent_hold back as
-- a thin pass-through, so the site that was live at migration time kept taking
-- bookings until the new build deployed. The new build is live now and always
-- sends the size, so nothing calls the 9-argument version any more.
--
-- WHEN TO RUN IT
-- NOT immediately. While this shim exists you can roll the site back to the
-- previous deployment and bookings still work. Drop it and that safety net is
-- gone — a rollback would leave the old code calling a function that no longer
-- exists, and every rent booking would fail.
--
-- Give the new build a few days on real traffic first. There is no cost to
-- leaving it: it is a few lines of unused SQL, and nothing reaches it.
--
-- HOW TO CHECK IT IS REALLY UNUSED
-- Any booking made since the deploy will have a size recorded. If this returns
-- rows, something is still calling the old path — do not drop it yet:
--
--   select id, renter_name, created_at
--   from public.bookings
--   where size is null and dress_id is not null and type = 'rent'
--     and created_at > '2026-09-16'      -- the deploy date
--   order by created_at desc;
-- ============================================================================

drop function if exists public.create_rent_hold(
  uuid, uuid, text, text, text, text, date, text, uuid[]
);
