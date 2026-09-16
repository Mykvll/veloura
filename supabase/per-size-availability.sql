-- ============================================================================
-- Veloura — per-size availability + admin-controlled wash-day release
-- ============================================================================
-- Run top to bottom in the DEV SQL editor first, verify, then PROD.
-- Wrapped in a transaction: if the size backfill can't be done unambiguously
-- (see §1) the whole thing rolls back rather than mislabelling a real rental.
--
-- What changes:
--   1. bookings.size          — a booking holds ONE dress in ONE size
--   2. bookings.wash_release  — admin releases the hand-wash day: to nobody,
--                               to the admin only, or to everyone
--   3. bookings_no_overlap    — re-keyed on (dress_id, size), honours the release
--   4. blocked_dates          — per size; hides the wash day only when public
--   5. create_rent_hold       — takes a size, re-checks per size
--   6. create_fitting_booking — a fitting day closes only when EVERY size is out
--
-- 'refunded' needs no DDL: payment_status has no CHECK constraint, and every
-- "active booking" list below names hold/pending/verified explicitly, so a
-- refunded booking releases its dates the moment the admin sets it.

begin;

-- ---------------------------------------------------------------------------
-- 1) bookings.size — which garment of the listing this booking holds
-- ---------------------------------------------------------------------------
alter table public.bookings add column if not exists size text;
comment on column public.bookings.size is
  'Which size of the dress this booking holds. One garment per size, so '
  '(dress_id, size) identifies the physical unit that is out.';

-- Backfill. Every dress whose catalogue entry lists exactly ONE size has an
-- unambiguous answer. A dress with several sizes cannot be guessed.
update public.bookings b
set size = s.size
from public.dress_sizes s
where b.size is null
  and b.dress_id = s.dress_id
  and (select count(*) from public.dress_sizes x where x.dress_id = b.dress_id) = 1;

-- Refuse to continue if any booking that still holds a FUTURE date is
-- unlabelled — those are the rows where a wrong size silently breaks
-- availability, and the only ones worth stopping the world for.
--
-- A finished rental cannot block anything, so an old booking from before sizes
-- were recorded is allowed to stay blank. That is honest: nobody knows which
-- garment went out, and inventing an answer would put made-up data into the
-- history screen. unitLabel() already falls back to the bare dress name, and
-- the exclusion constraint treats the blanks as one unit — harmless, because
-- past bookings by definition no longer overlap anything upcoming.
--
-- `end_date + 1` because a rental holds its dates through the hand-wash day.
do $$
declare n integer; detail text;
begin
  select count(*), string_agg(distinct dress_name, ', ')
    into n, detail
  from public.bookings
  where size is null
    and dress_id is not null
    and type = 'rent'
    and payment_status in ('hold', 'pending', 'verified')
    and end_date + 1 >= current_date;
  if n > 0 then
    raise exception
      'Cannot continue: % upcoming booking(s) on % have no size recorded. '
      'Set bookings.size for those rows first — see '
      'supabase/prod-step1-add-size-column.sql for how to list them.', n, detail;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) bookings.wash_release — who the hand-wash day is freed to
-- ---------------------------------------------------------------------------
--   'none'   (default) the day after the rental is reserved for washing
--   'admin'  washing is done; the admin may book that day, customers may not
--   'public' washing is done; the day is live on the customer site too
-- Only the admin ever sets this — anon has no write path to bookings at all.
alter table public.bookings add column if not exists wash_release text not null default 'none';
alter table public.bookings drop constraint if exists bookings_wash_release_valid;
alter table public.bookings add constraint bookings_wash_release_valid
  check (wash_release in ('none', 'admin', 'public'));
comment on column public.bookings.wash_release is
  'Admin-only release of the hand-wash day (end_date + 1): none | admin | public.';

-- ---------------------------------------------------------------------------
-- 3) The no-double-book guard, re-keyed on the physical unit
-- ---------------------------------------------------------------------------
-- coalesce(size,'') so legacy rows with a null size still collide with each
-- other: in an exclusion constraint NULL never equals NULL, which would let two
-- unlabelled bookings share a date.
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (
    dress_id with =,
    (coalesce(size, '')) with =,
    daterange(
      start_date,
      end_date + (case when manual or wash_release <> 'none' then 1 else 2 end),
      '[)'
    ) with &&
  )
  where (type = 'rent'
         and payment_status in ('hold', 'pending', 'verified')
         and start_date is not null);

-- ---------------------------------------------------------------------------
-- 4) blocked_dates — per size, and honouring a PUBLIC wash release
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE (not drop/create) so the existing grants survive; the new
-- column therefore has to be appended last.
create or replace view public.blocked_dates as
select dress_id,
       dress_name,
       generate_series(
         start_date::timestamptz,
         (end_date + (case when wash_release = 'public' then 0 else 1 end))::timestamptz,
         '1 day'::interval
       )::date as blocked_day,
       size
from public.bookings
where type = 'rent'
  and start_date is not null
  and (payment_status in ('pending', 'verified')
       or (payment_status = 'hold' and hold_expires_at > now()));

-- ---------------------------------------------------------------------------
-- 5) create_rent_hold — now holds ONE size
-- ---------------------------------------------------------------------------
-- The old signature has to go: the arg list changes, so this is a new function.
drop function if exists public.create_rent_hold(uuid, uuid, text, text, text, text, date, text, uuid[]);

create or replace function public.create_rent_hold(
  p_booking_id uuid,
  p_dress_id uuid,
  p_size text,
  p_name text,
  p_contact text,
  p_address text,
  p_id_path text,
  p_date date,
  p_deliver_time text,
  p_accessory_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dress record;
  v_end date := p_date + 1;
  v_new daterange := daterange(p_date, p_date + 3, '[)');
  v_amount integer;
  v_existing record;
  v_hold_expires timestamptz;
  v_conflict text;
  v_ids uuid[] := coalesce(p_accessory_ids, '{}');
  v_unavailable integer;
  v_size text := btrim(coalesce(p_size, ''));
begin
  select payment_status, hold_expires_at into v_existing
  from public.bookings where id = p_booking_id;
  if found then
    if v_existing.payment_status = 'hold' and v_existing.hold_expires_at > now() then
      return jsonb_build_object('ok', true, 'booking_id', p_booking_id,
        'hold_expires_at', v_existing.hold_expires_at, 'server_now', now());
    end if;
    return jsonb_build_object('ok', false, 'conflict', 'gone');
  end if;

  if p_name is null or btrim(p_name) = '' or p_contact is null or btrim(p_contact) = ''
     or p_address is null or btrim(p_address) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_fields');
  end if;
  if p_date is null or p_deliver_time is null or btrim(p_deliver_time) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_fields');
  end if;
  if p_id_path is null or p_id_path !~ '^ids/[0-9a-fA-F-]+\.[a-zA-Z0-9]+$' then
    return jsonb_build_object('ok', false, 'error', 'bad_id_path');
  end if;

  select id, name, price into v_dress from public.dresses where id = p_dress_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'dress_gone');
  end if;

  -- The size must be one this dress is actually offered in. The client sends it,
  -- and anon can call this RPC directly, so never trust the string.
  if v_size = '' or not exists (
    select 1 from public.dress_sizes ds
    where ds.dress_id = p_dress_id and ds.size = v_size
  ) then
    return jsonb_build_object('ok', false, 'error', 'bad_size');
  end if;

  -- Clear our own lapsed holds on THIS unit so the constraint sees it free.
  delete from public.bookings
  where dress_id = p_dress_id and size = v_size
    and payment_status = 'hold' and hold_expires_at <= now()
    and daterange(start_date, end_date + 2, '[)') && v_new;

  -- WHY THIS CHECK EXISTS ON TOP OF THE CONSTRAINT
  -- A wash day released to the ADMIN only is free at the constraint level (so a
  -- manual booking can take it) but must stay shut to customers. The constraint
  -- cannot express "blocks customers but not the admin" — the overlap test can't
  -- see who is asking — so the customer half of that rule lives here, against
  -- blocked_dates, which is the single source of truth for what the public sees.
  if exists (
    select 1 from public.blocked_dates bd
    where bd.dress_id = p_dress_id
      and bd.size = v_size
      and bd.blocked_day >= p_date
      and bd.blocked_day <= p_date + 2
  ) then
    return jsonb_build_object('ok', false, 'conflict', 'reserved');
  end if;

  if array_length(v_ids, 1) is not null then
    perform 1 from public.accessories where id = any(v_ids) for update;

    select count(*) into v_unavailable
    from public.accessories a
    where a.id = any(v_ids)
      and (a.stock - a.unavailable_units) - (
        select count(*)
        from public.bookings b
        join public.booking_accessories ba on ba.booking_id = b.id
        where ba.accessory_id = a.id
          and b.type = 'rent' and b.start_date is not null
          and (b.payment_status in ('pending', 'verified')
               or (b.payment_status = 'hold' and b.hold_expires_at > now()))
          and daterange(b.start_date, b.end_date + 2, '[)') && v_new
      ) < 1;
    if v_unavailable > 0 then
      return jsonb_build_object('ok', false, 'conflict', 'accessory');
    end if;
  end if;

  v_amount := v_dress.price
    + coalesce((select sum(price) from public.accessories where id = any(v_ids)), 0);
  v_hold_expires := now() + interval '11 minutes';

  begin
    insert into public.bookings (id, type, payment_status, renter_name, contact, address,
        id_photo_url, dress_id, dress_name, size, start_date, end_date, deliver_time, amount,
        hold_expires_at, manual)
    values (p_booking_id, 'rent', 'hold', btrim(p_name), btrim(p_contact), btrim(p_address),
        p_id_path, v_dress.id, v_dress.name, v_size, p_date, v_end, p_deliver_time, v_amount,
        v_hold_expires, false);
  exception when exclusion_violation then
    select case when exists (
        select 1 from public.bookings b
        where b.dress_id = p_dress_id and b.size = v_size and b.type = 'rent'
          and b.payment_status in ('pending', 'verified')
          and daterange(b.start_date,
                        b.end_date + (case when b.manual or b.wash_release <> 'none' then 1 else 2 end),
                        '[)') && v_new
      ) then 'reserved' else 'hold' end
    into v_conflict;
    return jsonb_build_object('ok', false, 'conflict', v_conflict);
  end;

  if array_length(v_ids, 1) is not null then
    insert into public.booking_accessories (booking_id, accessory_id, price_at_booking)
    select p_booking_id, a.id, a.price
    from public.accessories a where a.id = any(v_ids);
  end if;

  return jsonb_build_object('ok', true, 'booking_id', p_booking_id,
    'hold_expires_at', v_hold_expires, 'server_now', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) create_fitting_booking — a day closes only when EVERY size is out
-- ---------------------------------------------------------------------------
-- Was: blocked if ANY dress in the catalogue was out that day. A fitting only
-- needs one garment of THIS dress in the room, so the rule narrows twice — to
-- this dress, and to "every one of its sizes is out".
create or replace function public.create_fitting_booking(
  p_dress_id uuid, p_name text, p_contact text, p_date date, p_time text,
  p_parking boolean, p_vehicle text, p_plate text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dress record;
  v_plate text := btrim(coalesce(p_plate, ''));
  v_amount integer;
  v_sizes integer;
  v_free integer;
begin
  if p_name is null or btrim(p_name) = '' or p_contact is null or btrim(p_contact) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_fields');
  end if;
  if p_date is null or p_time is null or btrim(p_time) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_fields');
  end if;
  if p_parking and v_plate = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_plate');
  end if;

  select id, name into v_dress from public.dresses where id = p_dress_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'dress_gone');
  end if;

  select count(*) into v_sizes from public.dress_sizes where dress_id = p_dress_id;
  if v_sizes > 0 then
    select count(*) into v_free
    from public.dress_sizes ds
    where ds.dress_id = p_dress_id
      and not exists (
        select 1 from public.blocked_dates bd
        where bd.dress_id = p_dress_id and bd.size = ds.size and bd.blocked_day = p_date
      );
    if v_free = 0 then
      return jsonb_build_object('ok', false, 'conflict', 'day');
    end if;
  end if;

  if exists (
    select 1 from public.booked_fitting_slots
    where fitting_date = p_date and fitting_time = p_time
  ) then
    return jsonb_build_object('ok', false, 'conflict', 'slot');
  end if;

  v_amount := case when p_parking then 50 else 0 end;

  begin
    insert into public.bookings (type, payment_status, renter_name, contact,
        dress_id, dress_name, fitting_date, fitting_time, parking, vehicle, plate,
        amount, manual)
    values ('fitting', 'pending', btrim(p_name), btrim(p_contact),
        v_dress.id, v_dress.name, p_date, p_time, p_parking,
        case when p_parking then coalesce(nullif(btrim(p_vehicle), ''), 'Car') else null end,
        case when p_parking then v_plate else null end,
        v_amount, false);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'conflict', 'slot');
  end;

  return jsonb_build_object(
    'ok', true,
    'summary', jsonb_build_object(
      'renter_name', btrim(p_name),
      'contact', btrim(p_contact),
      'dress_name', v_dress.name,
      'fitting_date', p_date,
      'fitting_time', p_time,
      'parking', p_parking
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6b) Compatibility shim — keeps the LIVE site working during the changeover
-- ---------------------------------------------------------------------------
-- The site deployed right now calls create_rent_hold with 9 arguments (no
-- size). Section 5 dropped that version, so between running this file and
-- deploying the new code, every rent booking on the live site would fail.
--
-- This puts the 9-argument version back as a thin pass-through: it looks up the
-- dress's size and calls the real function. Every dress is stocked in exactly
-- one size today, so there is nothing to guess. If a dress ever has two, the
-- old call has no way to say which, and it refuses rather than pick one.
--
-- DELETE THIS once the new site is deployed:
--   drop function public.create_rent_hold(uuid, uuid, text, text, text, text, date, text, uuid[]);
create or replace function public.create_rent_hold(
  p_booking_id uuid,
  p_dress_id uuid,
  p_name text,
  p_contact text,
  p_address text,
  p_id_path text,
  p_date date,
  p_deliver_time text,
  p_accessory_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_size text;
  v_count integer;
begin
  select count(*) into v_count from public.dress_sizes where dress_id = p_dress_id;
  if v_count <> 1 then
    -- Either the dress has no sizes, or it has several and this old call can't
    -- say which one it means. The new site always sends the size explicitly.
    return jsonb_build_object('ok', false, 'error', 'bad_size');
  end if;
  select size into v_size from public.dress_sizes where dress_id = p_dress_id;

  return public.create_rent_hold(p_booking_id, p_dress_id, v_size, p_name, p_contact,
                                 p_address, p_id_path, p_date, p_deliver_time,
                                 p_accessory_ids);
end;
$$;


-- ---------------------------------------------------------------------------
-- 7) Grants — a dropped/recreated function loses them
-- ---------------------------------------------------------------------------
revoke execute on function
  public.create_rent_hold(uuid, uuid, text, text, text, text, text, date, text, uuid[]),
  public.create_rent_hold(uuid, uuid, text, text, text, text, date, text, uuid[]),
  public.create_fitting_booking(uuid, text, text, date, text, boolean, text, text)
  from public;
grant execute on function
  public.create_rent_hold(uuid, uuid, text, text, text, text, text, date, text, uuid[]),
  public.create_rent_hold(uuid, uuid, text, text, text, text, date, text, uuid[]),
  public.create_fitting_booking(uuid, text, text, date, text, boolean, text, text)
  to anon, authenticated;

commit;
