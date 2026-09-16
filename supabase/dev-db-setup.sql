-- ============================================================================
-- Veloura — DEV database setup (single, from-scratch migration)
-- ============================================================================
-- Run this ONCE, top to bottom, in a BRAND-NEW Supabase project's SQL Editor
-- (Dashboard → SQL Editor → paste → Run). It creates the schema in its CURRENT
-- final shape — it is NOT a stack of incremental patches, so there is nothing
-- to run before or after it.
--
-- It reproduces production as of 2026-07-23: the payment-hold reserve flow, the
-- fitting RPC, date-aware accessory availability, and the locked-down RLS state
-- where anon has ZERO direct INSERT paths on bookings.
--
-- Setup (one-time):
--   1. supabase.com/dashboard → New project (e.g. "veloura-dev"), any region.
--   2. Run this whole file in that project's SQL Editor.
--   3. Dashboard → Authentication → Users → Add user: the admin email +
--      password from .env.local (tick "auto-confirm").
--   4. Dashboard → Project Settings → API: copy the Project URL and anon key
--      into .env.local as NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY.
--      (Vercel keeps the production values — only local dev changes.)
--
-- Deliberately NOT included (prod-only ops, not needed to develop):
--   • bookings / rental_history rows — customer PII stays in production.
--   • Storage FILES — the seed's image URLs point at prod's PUBLIC dress-photos
--     bucket, so dresses render in dev; new dev uploads go to dev's own buckets.
--   • Edge functions (purge-expired-pii, cleanup-holds), their pg_cron jobs and
--     the `purge_pii_cron_secret` Vault secret. The SQL functions they call ARE
--     created below so the schemas match; see §11 if you want to test them here.
--
-- What IS included beyond the schema: the real production CATALOGUE (§9) plus a
-- set of MOCK bookings, accessories and history (§10) so the app has something
-- to show the moment you open it.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Extensions
-- ---------------------------------------------------------------------------

-- Powers the bookings_no_overlap EXCLUDE constraint (daterange && with uuid =).
create extension if not exists btree_gist;


-- ---------------------------------------------------------------------------
-- 2) Tables
-- ---------------------------------------------------------------------------

create table public.dresses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  style_name text,
  price integer not null default 500,
  cost integer default 0,
  status text not null default 'live',
  created_at timestamptz default now()
);

create table public.dress_photos (
  id uuid primary key default gen_random_uuid(),
  dress_id uuid not null references public.dresses(id) on delete cascade,
  url text not null,
  label text default 'Front',
  is_cover boolean default false,
  sort_order integer default 0
);

create table public.dress_sizes (
  id uuid primary key default gen_random_uuid(),
  dress_id uuid not null references public.dresses(id) on delete cascade,
  size text not null,
  bust_cm integer,
  waist_cm integer,
  length_cm integer
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  dress_id uuid not null references public.dresses(id) on delete cascade,
  renter_name text not null,
  body text not null,
  photo_url text,
  created_at timestamptz default now()
);

-- Accessory inventory is PER UNIT:
--   stock             = units owned (admin-set)
--   unavailable_units = units pulled from service — damaged / lost / in repair
--                       (admin-set); the only thing that blocks EVERY date
--   capacity          = stock − unavailable_units
-- Units "out on rent" are NOT stored — they are derived per date from bookings
-- (see the accessory_blocked_dates / accessory_rented_today views in §3).
-- `rented` is a legacy column from the earlier flat-counter model: nothing reads
-- or writes it any more, but prod still has it and lib/supabase/types.ts is
-- generated from prod, so it stays here to keep the generated types matching.
create table public.accessories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null default 0,
  cost integer default 0,
  stock integer not null default 0,
  rented integer not null default 0,
  unavailable_units integer not null default 0,
  image_url text,
  created_at timestamptz default now()
);

-- payment_status: hold | pending | verified | invalid | none.
-- `hold` is the 10-minute reservation a customer gets while they pay; it carries
-- a hold_expires_at and is deleted once it lapses. Analytics count `verified`.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  dress_id uuid references public.dresses(id) on delete set null,
  dress_name text,
  renter_name text not null,
  contact text,
  address text,
  id_photo_url text,
  -- Which SIZE of the dress this booking holds. One garment per size, so
  -- (dress_id, size) names the physical unit that is out.
  size text,
  start_date date,
  end_date date,
  deliver_time text,
  fitting_date date,
  fitting_time text,
  parking boolean default false,
  vehicle text,
  plate text,
  amount integer default 0,
  payment_method text,
  payment_status text not null default 'pending',
  proof_url text,
  hold_expires_at timestamptz,
  created_at timestamptz default now(),
  manual boolean not null default false,
  -- Admin-only release of the hand-wash day (end_date + 1):
  --   'none'   the day after the rental is reserved for washing
  --   'admin'  washing is done; the admin may book it, customers may not
  --   'public' washing is done; the day is live on the customer site too
  wash_release text not null default 'none',
  constraint bookings_contact_required_for_app check (manual or contact is not null),
  constraint bookings_wash_release_valid check (wash_release in ('none', 'admin', 'public'))
);

create table public.booking_accessories (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  accessory_id uuid not null references public.accessories(id) on delete set null,
  price_at_booking integer not null,
  primary key (booking_id, accessory_id)
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qr_url text,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create table public.rental_history (
  id uuid primary key default gen_random_uuid(),
  dress_id uuid references public.dresses(id) on delete set null,
  dress_name text not null,
  renter_name text not null,
  start_date date not null,
  end_date date not null,
  amount_paid integer not null,
  created_at timestamptz default now(),
  constraint rental_history_dates_ok check (end_date >= start_date),
  constraint rental_history_amount_positive check (amount_paid > 0)
);

-- Indexes / constraints ------------------------------------------------------

create index bookings_hold_expires_idx
  on public.bookings (hold_expires_at) where payment_status = 'hold';

-- Authoritative no-double-book guard, keyed on the PHYSICAL UNIT (dress+size):
-- each size is its own garment, so Emily's M going out leaves the L bookable.
-- Customer rentals reserve through the wash day (end+1, hence +2 on a half-open
-- range); manual (admin) bookings reserve only the rental days, as does any
-- booking whose wash day the admin has released. Active = hold/pending/verified;
-- invalid/none/refunded (and expired holds, which get deleted) free the date.
-- coalesce(size,'') so legacy rows with a null size still collide with each
-- other: in an exclusion constraint NULL never equals NULL.
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

-- Same idea for fittings: no two ACTIVE fittings share a (date, time). The RPC
-- pre-checks for a friendly message; this index closes the check-then-insert
-- race under concurrency.
create unique index bookings_one_fitting_per_slot
  on public.bookings (fitting_date, fitting_time)
  where (type = 'fitting' and payment_status in ('pending', 'verified'));


-- ---------------------------------------------------------------------------
-- 3) Views — availability is DERIVED from bookings (single source of truth)
-- ---------------------------------------------------------------------------

-- Days a GARMENT is taken: the rental days plus the end_date+1 hand-wash day,
-- per (dress, size). The wash day drops out once the admin releases it to the
-- public. Time-aware: an unexpired hold blocks, an expired one frees instantly.
create view public.blocked_dates as
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

create view public.booked_fitting_slots as
select fitting_date, fitting_time
from public.bookings
where type = 'fitting'
  and payment_status = any (array['pending', 'verified'])
  and fitting_date is not null
  and fitting_time is not null;

-- Accessory analogue of blocked_dates. An accessory is a date-scoped resource
-- like a dress: one unit out July 25–27 is still free July 1–3. A day is blocked
-- only once EVERY capacity unit is committed to an overlapping active booking.
create view public.accessory_blocked_dates as
with day_load as (
  select ba.accessory_id,
         gs::date as blocked_day,
         count(*) as used
  from public.bookings b
  join public.booking_accessories ba on ba.booking_id = b.id
  cross join lateral generate_series(
    b.start_date::timestamptz, (b.end_date + 1)::timestamptz, '1 day'::interval
  ) gs
  where b.type = 'rent'
    and b.start_date is not null
    and (b.payment_status in ('pending', 'verified')
         or (b.payment_status = 'hold' and b.hold_expires_at > now()))
  group by ba.accessory_id, gs::date
)
select dl.accessory_id, dl.blocked_day
from day_load dl
join public.accessories a on a.id = dl.accessory_id
where dl.used >= (a.stock - a.unavailable_units);

-- Units of each accessory out on rent TODAY. Feeds the admin "N out on rent"
-- readouts and analytics (this replaced the stored `rented` counter).
create view public.accessory_rented_today as
select ba.accessory_id, count(*)::int as units_out
from public.bookings b
join public.booking_accessories ba on ba.booking_id = b.id
where b.type = 'rent'
  and b.start_date is not null
  and (b.payment_status in ('pending', 'verified')
       or (b.payment_status = 'hold' and b.hold_expires_at > now()))
  and current_date between b.start_date and b.end_date + 1
group by ba.accessory_id;


-- ---------------------------------------------------------------------------
-- 4) Customer RPCs — every public write goes through one of these
-- ---------------------------------------------------------------------------
-- They are SECURITY DEFINER, so they bypass RLS and are the ONLY way anon can
-- write a booking. That is why §6 gives anon no INSERT policy on bookings.

-- create_rent_hold — take a 10-minute (11 min server-side) reservation on a
-- dress + its accessories. Validates every field server-side (anon can call the
-- RPC directly), re-checks availability, and writes atomically.
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

-- attach_rent_payment — the customer uploaded proof in time: hold → pending.
create or replace function public.attach_rent_payment(
  p_booking_id uuid, p_payment_method text, p_proof_path text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_out record;
begin
  select payment_status, hold_expires_at into v_row
  from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;
  if v_row.payment_status = 'pending' then
    -- Idempotent retry: already submitted. We DON'T return a `summary` here, so
    -- the caller only fires the owner notification on the fresh transition below
    -- (exactly one ping per booking, even if the client retries).
    return jsonb_build_object('ok', true, 'booking_id', p_booking_id);
  end if;
  if v_row.payment_status <> 'hold' or v_row.hold_expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if p_proof_path is null or p_proof_path !~ '^proofs/[0-9a-fA-F-]+\.[a-zA-Z0-9]+$' then
    return jsonb_build_object('ok', false, 'error', 'bad_proof_path');
  end if;
  if p_payment_method is null or btrim(p_payment_method) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_method');
  end if;

  update public.bookings
  set payment_status = 'pending', payment_method = p_payment_method,
      proof_url = p_proof_path, hold_expires_at = null
  where id = p_booking_id
  returning renter_name, contact, dress_name, start_date, end_date, payment_method
  into v_out;

  -- `summary` gives the server action the details for the owner's Telegram ping
  -- without exposing bookings to anon (anon has no SELECT on the table).
  return jsonb_build_object(
    'ok', true, 'booking_id', p_booking_id,
    'summary', jsonb_build_object(
      'renter_name', v_out.renter_name,
      'contact', v_out.contact,
      'dress_name', v_out.dress_name,
      'start_date', v_out.start_date,
      'end_date', v_out.end_date,
      'payment_method', v_out.payment_method
    )
  );
end;
$$;

-- release_rent_hold — the customer backed out; free the dates immediately.
create or replace function public.release_rent_hold(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.bookings where id = p_booking_id and payment_status = 'hold';
end;
$$;

-- get_hold_status — the countdown timer polls this; `server_now` lets the client
-- work off server time instead of a possibly-skewed device clock.
create or replace function public.get_hold_status(p_booking_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', b.payment_status,
    'hold_expires_at', b.hold_expires_at,
    'server_now', now()
  )
  from public.bookings b where b.id = p_booking_id;
$$;

-- create_fitting_booking — the fitting equivalent: re-checks the blocked day and
-- the slot, computes the fee, and inserts atomically.
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

revoke execute on function
  public.create_rent_hold(uuid, uuid, text, text, text, text, text, date, text, uuid[]),
  public.attach_rent_payment(uuid, text, text),
  public.release_rent_hold(uuid),
  public.get_hold_status(uuid),
  public.create_fitting_booking(uuid, text, text, date, text, boolean, text, text)
  from public;
grant execute on function
  public.create_rent_hold(uuid, uuid, text, text, text, text, text, date, text, uuid[]),
  public.attach_rent_payment(uuid, text, text),
  public.release_rent_hold(uuid),
  public.get_hold_status(uuid),
  public.create_fitting_booking(uuid, text, text, date, text, boolean, text, text)
  to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5) Ops functions — called by edge functions running as service_role
-- ---------------------------------------------------------------------------
-- Created for schema parity even though the edge functions themselves are
-- prod-only. See §11 if you want to exercise them in dev.

-- purge_expired_holds — the `cleanup-holds` function calls this every 10 min; it
-- returns the ID-photo paths so the function can delete those files too.
create or replace function public.purge_expired_holds()
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare v_path text;
begin
  for v_path in
    delete from public.bookings
    where payment_status = 'hold' and hold_expires_at < now()
    returning id_photo_url
  loop
    if v_path is not null then
      return next v_path;
    end if;
  end loop;
end;
$$;

revoke execute on function public.purge_expired_holds() from public, anon, authenticated;
grant execute on function public.purge_expired_holds() to service_role;

-- The three below back `purge-expired-pii`: after a grace period, an invalid
-- booking's uploaded ID + payment proof are deleted from Storage and unlinked.
create or replace function public.clear_booking_files(booking_id uuid, clear_id boolean, clear_proof boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.bookings
  set id_photo_url = case when clear_id then null else id_photo_url end,
      proof_url    = case when clear_proof then null else proof_url end
  where id = booking_id;
end;
$function$;

create or replace function public.list_invalid_expired_pii(grace_days integer)
returns table(id uuid, id_photo_url text, proof_url text)
language sql
security definer
set search_path to ''
as $function$
  select b.id, b.id_photo_url, b.proof_url
  from public.bookings b
  where b.payment_status = 'invalid'
    and b.created_at < (now() - make_interval(days => grace_days))
    and (b.id_photo_url is not null or b.proof_url is not null);
$function$;

create or replace function public.verify_cron_secret(candidate text)
returns boolean
language sql
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'purge_pii_cron_secret'
      and decrypted_secret = candidate
  );
$function$;


-- ---------------------------------------------------------------------------
-- 6) Row Level Security
-- ---------------------------------------------------------------------------

alter table public.dresses enable row level security;
alter table public.dress_photos enable row level security;
alter table public.dress_sizes enable row level security;
alter table public.reviews enable row level security;
alter table public.accessories enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_accessories enable row level security;
alter table public.payment_methods enable row level security;
alter table public.rental_history enable row level security;

-- Catalogue tables: everyone reads, admin (any signed-in user) does everything.
create policy "public read dresses" on public.dresses for select using (true);
create policy "admin all dresses" on public.dresses for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read photos" on public.dress_photos for select using (true);
create policy "admin all photos" on public.dress_photos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read sizes" on public.dress_sizes for select using (true);
create policy "admin all sizes" on public.dress_sizes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read reviews" on public.reviews for select using (true);
create policy "admin all reviews" on public.reviews for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read accessories" on public.accessories for select using (true);
create policy "admin all accessories" on public.accessories for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read payment_methods" on public.payment_methods for select using (true);
create policy "admin all payment_methods" on public.payment_methods for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Bookings hold PII, so there is NO anon policy of any kind here — not even
-- INSERT. Customers write bookings ONLY through the SECURITY DEFINER RPCs in §4
-- (create_rent_hold / attach_rent_payment / create_fitting_booking), which run
-- as the owner and therefore bypass RLS entirely. The policies below are what
-- the logged-in admin UI uses, including manual (walk-in) bookings.
create policy "admin create booking" on public.bookings for insert to authenticated
  with check (auth.role() = 'authenticated');
create policy "admin read bookings" on public.bookings for select using (auth.role() = 'authenticated');
create policy "admin manage bookings" on public.bookings for update using (auth.role() = 'authenticated');
create policy "admin delete bookings" on public.bookings for delete using (auth.role() = 'authenticated');

-- Same shape for the accessory links. The admin INSERT policy exists because a
-- manual booking can carry accessories (which must block those dates for
-- customers too); anon links still go in exclusively via create_rent_hold.
create policy "admin read booking_accessories" on public.booking_accessories for select
  to authenticated using (auth.role() = 'authenticated');
create policy "admin create booking_accessories" on public.booking_accessories for insert
  to authenticated with check (auth.role() = 'authenticated');

-- rental_history (pre-system rentals, logged by hand) is admin-only end to end.
create policy "admin all rental_history" on public.rental_history for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');


-- ---------------------------------------------------------------------------
-- 7) Grants
-- ---------------------------------------------------------------------------
-- New Supabase projects (2025+) no longer auto-grant anon/authenticated on
-- tables you create. Without these, PostgREST answers "permission denied"
-- before RLS is even consulted — grants and policies must BOTH be right.

-- Catalogue: public reads, admin writes.
grant select on public.dresses, public.dress_photos, public.dress_sizes,
                public.reviews, public.accessories, public.payment_methods
  to anon;
grant select, insert, update, delete
  on public.dresses, public.dress_photos, public.dress_sizes,
     public.reviews, public.accessories, public.payment_methods
  to authenticated;

-- Bookings: anon gets NOTHING (see §6 — it writes only through the RPCs, which
-- run as the definer). Admin gets full CRUD.
grant select, insert, update, delete
  on public.bookings, public.booking_accessories to authenticated;

-- rental_history: admin-only; add + remove, no edit (there is no edit flow).
grant select, insert, delete on public.rental_history to authenticated;

-- Availability views power the customer calendars + accessory picker.
grant select on public.blocked_dates, public.booked_fitting_slots,
                public.accessory_blocked_dates, public.accessory_rented_today
  to anon, authenticated;

-- The service role (edge functions) sees everything.
grant all on all tables in schema public to service_role;


-- ---------------------------------------------------------------------------
-- 8) Storage: buckets + object policies
-- ---------------------------------------------------------------------------
-- dress-photos is PUBLIC (catalogue imagery). payment-proofs is PRIVATE: the
-- customer uploads their ID + payment screenshot into it and can never read
-- back; the DB stores storage PATHS, not URLs.

insert into storage.buckets (id, name, public)
values ('dress-photos', 'dress-photos', true),
       ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

create policy "admin upload dress-photos" on storage.objects for insert
  to authenticated with check (bucket_id = 'dress-photos');
create policy "admin read dress-photos" on storage.objects for select
  to authenticated using (bucket_id = 'dress-photos');
create policy "admin update dress-photos" on storage.objects for update
  to authenticated using (bucket_id = 'dress-photos') with check (bucket_id = 'dress-photos');
create policy "admin delete dress-photos" on storage.objects for delete
  to authenticated using (bucket_id = 'dress-photos');

create policy "public upload payment-proofs" on storage.objects for insert
  with check (bucket_id = 'payment-proofs');
create policy "admin read payment-proofs" on storage.objects for select
  to authenticated using (bucket_id = 'payment-proofs');
create policy "admin delete payment-proofs" on storage.objects for delete
  to authenticated using (bucket_id = 'payment-proofs');


-- ---------------------------------------------------------------------------
-- 9) Seed — the production catalogue (same ids, so cross-refs keep working)
-- ---------------------------------------------------------------------------
-- Image URLs point at prod's PUBLIC dress-photos bucket, so dresses render in
-- dev without copying any files. No bookings / history — that is customer data.

insert into public.dresses (id, name, style_name, price, cost, status) values
  ('56ca2556-00c7-4503-b053-8e394316ff64', 'Emily',     null, 500, 1708, 'live'),
  ('0ddb0749-771f-4336-85dd-1e1441a8404b', 'Florencia', null, 500, 2690, 'live'),
  ('f15e23e1-9633-45ef-8067-fe638dc0e32c', 'Maxine',    null, 500, 2790, 'live'),
  ('c55d4612-fdeb-4809-8733-7a9c643fa6f8', 'Thiang',    null, 500, 1827, 'live'),
  ('829c4722-0220-4233-a1fc-2015cbacb655', 'Zolana',    null, 500, 2890, 'live'),
  ('0c757993-b59d-4ca4-be02-8c080a811348', 'Melany',    null, 600, 2690, 'live'),
  ('e48d01d8-d771-40b7-a3f0-75a93637ab48', 'Flora',     null, 600, 2890, 'live'),
  ('ffc0fd93-b74a-401b-bf1c-6db99855f988', 'Steph',     null, 600, 2890, 'live'),
  ('4bcaed44-2ae3-4e10-8732-2da460aa2688', 'Zemira',    null, 500, 3290, 'live'),
  ('1482ab8e-43e3-4c7c-ba49-4232c1e433f9', 'Odessa',    null, 500, 1000, 'live');

insert into public.dress_photos (id, dress_id, url, label, is_cover, sort_order) values
  ('ac2d6ddd-c741-475e-acb3-40061eb386e6', '56ca2556-00c7-4503-b053-8e394316ff64', 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/56ca2556-00c7-4503-b053-8e394316ff64/e45bfb75-80be-47da-a4f2-7cd7088e8de1.jpeg', 'Front', true, 0),
  ('0b8df479-d895-4820-b803-851f0ea1a710', 'ffc0fd93-b74a-401b-bf1c-6db99855f988', 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/ffc0fd93-b74a-401b-bf1c-6db99855f988/a9f41abb-6575-4cb9-85b7-4ff1c9ef32d6.png', 'Front', true, 0),
  ('454d11dd-c962-44ab-bdfb-cf62ed8b9f68', '829c4722-0220-4233-a1fc-2015cbacb655', 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/829c4722-0220-4233-a1fc-2015cbacb655/33bf7ce4-082f-4c29-aefe-1d0e233788e0.png', 'Front', true, 0),
  ('ec8e41f8-acf7-44f3-ab7d-192076d69eb8', '0ddb0749-771f-4336-85dd-1e1441a8404b', 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/0ddb0749-771f-4336-85dd-1e1441a8404b/108b8852-71c1-4c80-8c39-0a49f3bb1d8c.jpeg', 'Front', true, 0),
  ('b2068639-86a4-4bf4-8d24-1ce41034b3e6', 'c55d4612-fdeb-4809-8733-7a9c643fa6f8', 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/c55d4612-fdeb-4809-8733-7a9c643fa6f8/e08cf20d-a921-4bb4-b040-c4a7db3107e8.jpeg', 'Front', true, 0),
  ('1ed5c652-1349-4a7f-a52b-41edf7b284a8', 'f15e23e1-9633-45ef-8067-fe638dc0e32c', 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/f15e23e1-9633-45ef-8067-fe638dc0e32c/c7875e29-7be0-49c2-ba78-70f7c70ef4c0.jpeg', 'Front', true, 0),
  ('f65236fc-2ea3-496c-88a2-c93ca656ae1d', '4bcaed44-2ae3-4e10-8732-2da460aa2688', 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/4bcaed44-2ae3-4e10-8732-2da460aa2688/552d02e6-f923-42bd-8cc4-e1f592dd5fb6.png', 'Front', true, 0),
  ('03e60506-2a69-4ddd-a596-72d2d456c909', '0c757993-b59d-4ca4-be02-8c080a811348', 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/0c757993-b59d-4ca4-be02-8c080a811348/aaa46bf1-8d0c-49e8-b81c-2fe49f01f12b.png', 'Front', true, 0),
  ('b28d8794-8b71-439a-9ba4-2916bff84219', 'e48d01d8-d771-40b7-a3f0-75a93637ab48', 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/e48d01d8-d771-40b7-a3f0-75a93637ab48/a13ec262-ba2d-4148-a269-4f70488f92e2.png', 'Front', true, 0),
  ('61bb4bc8-ad6a-4830-b9c8-0074d3017d6b', '1482ab8e-43e3-4c7c-ba49-4232c1e433f9', 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/1482ab8e-43e3-4c7c-ba49-4232c1e433f9/7ba80c75-2d85-4f58-afae-081b42d266d3.png', 'Front', true, 0);

insert into public.dress_sizes (id, dress_id, size, bust_cm, waist_cm, length_cm) values
  ('a7ee51bb-df3b-4e93-9af5-39b629e26cf0', '56ca2556-00c7-4503-b053-8e394316ff64', 'M', 80, 72, 60),
  ('638c7081-205b-4e83-a708-572e2e97957f', 'ffc0fd93-b74a-401b-bf1c-6db99855f988', 'M', 80, 72, 117),
  ('6cb9fd39-8be3-4d41-84c9-5741e2bfb709', '829c4722-0220-4233-a1fc-2015cbacb655', 'L', 92, 80, 118),
  ('04929d1a-2c56-4638-a4e6-82e901e9a580', '0ddb0749-771f-4336-85dd-1e1441a8404b', 'M', 84, 72, 117),
  ('55e253ae-f5f0-4e2b-a471-c98392d3e076', 'c55d4612-fdeb-4809-8733-7a9c643fa6f8', 'M', 84, 70, 140),
  ('398d0e06-b8af-44e3-8cfe-55bb5540f5f9', 'f15e23e1-9633-45ef-8067-fe638dc0e32c', 'S', 76, 68, 116),
  ('8d43cb9f-f704-4ca1-87c8-2721b95ebeeb', '4bcaed44-2ae3-4e10-8732-2da460aa2688', 'S', 76, 68, 117),
  ('9ac14d36-72eb-4c75-87ce-da3dcd9988b9', '0c757993-b59d-4ca4-be02-8c080a811348', 'M', 80, 72, 72),
  ('f760564a-8261-43d4-8b9e-438cd11058b6', 'e48d01d8-d771-40b7-a3f0-75a93637ab48', 'M', 80, 72, 72),
  ('6daac8dc-390c-4098-9ee5-d6329070c4bc', '1482ab8e-43e3-4c7c-ba49-4232c1e433f9', 'L', 84, 76, 118);

insert into public.reviews (id, dress_id, renter_name, body, photo_url) values
  ('32761587-338e-48c5-99af-109abbddbbe3', '56ca2556-00c7-4503-b053-8e394316ff64', 'Aljayn Aranzamendez', $rv$thank you!! super ganda ❤️will sendphotos when worn po$rv$, 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/56ca2556-00c7-4503-b053-8e394316ff64/reviews/bb24b918-9c00-488b-8479-bb390e62b8d2.jpeg'),
  ('5843896c-9c10-4094-a747-febdd895ef0a', '829c4722-0220-4233-a1fc-2015cbacb655', 'Shai Andres', $rv$Helloooo!!! Super ganda nung dress..
Kayo na po rerentahan ko everytime may event 🥹$rv$, 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/829c4722-0220-4233-a1fc-2015cbacb655/reviews/079da64b-a2a1-4565-93a6-c16bfb64d4da.jpeg'),
  ('21b712e7-f7dc-497e-a81f-aa0b17c5f239', '829c4722-0220-4233-a1fc-2015cbacb655', 'January Cherreguine', $rv$Thank you po!😊$rv$, 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/829c4722-0220-4233-a1fc-2015cbacb655/reviews/c6e5c35a-6ac8-402a-a460-2cce29dd2d68.jpeg'),
  ('14fcf4a5-67d2-40af-927e-e3776d1a85fd', '0ddb0749-771f-4336-85dd-1e1441a8404b', 'Rina Yamagata', $rv$ito po ung pics ko ng naka dress
thank you po ulit!$rv$, 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/0ddb0749-771f-4336-85dd-1e1441a8404b/reviews/c7b478b5-8dd6-41f6-96fc-f2ad53987bb3.jpeg'),
  ('331f0ffe-afcf-4cc6-86d4-f12a2c62122c', 'f15e23e1-9633-45ef-8067-fe638dc0e32c', 'Danica', $rv$Dto nalang sis thank youuuy next time ulit 😘😘$rv$, 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/f15e23e1-9633-45ef-8067-fe638dc0e32c/reviews/98afcca0-3bec-4f8e-9b8e-e57f15f3383a.jpeg'),
  ('c2a60749-42af-43fd-b04c-fd4b353a6ce5', 'f15e23e1-9633-45ef-8067-fe638dc0e32c', 'Marnelli Marquez', $rv$Hi Sis, sharing with you mu photos from last night. Super dami naka appreciate ng dress$rv$, 'https://zurjduoqwzpqulsgssns.supabase.co/storage/v1/object/public/dress-photos/f15e23e1-9633-45ef-8067-fe638dc0e32c/reviews/c5402c0d-a083-4f91-9c08-f7ef68a2768c.jpeg');


-- ---------------------------------------------------------------------------
-- 10) Mock data — so a fresh dev DB is immediately interactive
-- ---------------------------------------------------------------------------
-- None of this exists in production; it is here so that the first time you open
-- the dev app you already have accessories in the picker, blocked days on the
-- calendars, and bookings + analytics on /admin instead of empty states.
--
-- All dates are RELATIVE to current_date, so the seed stays "fresh" no matter
-- when you run it. To wipe just the mock bookings later and start clean:
--   delete from public.bookings;  delete from public.rental_history;
--
-- NOTE: id_photo_url / proof_url are left NULL on purpose — there are no real
-- files in this project's payment-proofs bucket, and a path pointing at nothing
-- would just fail to sign in the admin UI. Make a real booking through the
-- customer flow if you want to exercise the upload + proof-viewer path.

-- Accessories. Together these cover every state the picker can render: plenty
-- in stock, a single unit (goes "rented" on its booked dates only), and one
-- with a unit pulled from service (capacity = stock − unavailable_units).
insert into public.accessories (id, name, price, cost, stock, unavailable_units, image_url) values
  ('a1000000-0000-4000-8000-000000000001', 'Pearl Drop Earrings', 100, 350, 4, 0, null),
  ('a1000000-0000-4000-8000-000000000002', 'Satin Clutch',        150, 600, 2, 0, null),
  ('a1000000-0000-4000-8000-000000000003', 'Crystal Hair Comb',   120, 450, 3, 1, null),
  ('a1000000-0000-4000-8000-000000000004', 'Velvet Shawl',        200, 900, 1, 0, null);

-- Payment methods shown on the payment step. qr_url is null — upload a QR in the
-- admin if you want to see the image render.
insert into public.payment_methods (id, name, qr_url, sort_order) values
  ('b1000000-0000-4000-8000-000000000001', 'GCash',              null, 0),
  ('b1000000-0000-4000-8000-000000000002', 'Maya',               null, 1),
  ('b1000000-0000-4000-8000-000000000003', 'BPI Bank Transfer',  null, 2);

-- Bookings — one of every payment_status, spread so their blocked ranges never
-- collide (bookings_no_overlap would reject them if they did). Remember each
-- customer rental blocks start .. end+1 (the wash day); a manual one does not.
insert into public.bookings (id, type, dress_id, dress_name, renter_name, contact, address,
    start_date, end_date, deliver_time, fitting_date, fitting_time, parking, vehicle, plate,
    amount, payment_method, payment_status, hold_expires_at, manual) values

  -- VERIFIED customer rental, a few days out (blocks +3, +4, +5).
  ('c1000000-0000-4000-8000-000000000001', 'rent',
   '56ca2556-00c7-4503-b053-8e394316ff64', 'Emily',
   'Bea Santillan', '0917 555 0142', '14 Mabini St, Brgy. Poblacion, Makati City',
   current_date + 3, current_date + 4, '10:00 AM', null, null, false, null, null,
   750, 'GCash', 'verified', null, false),

  -- MANUAL (walk-in) rental the admin logged, same days, different dress. Manual
  -- bookings skip the wash day, so this one blocks only +3 and +4.
  ('c1000000-0000-4000-8000-000000000002', 'rent',
   'c55d4612-fdeb-4809-8733-7a9c643fa6f8', 'Thiang',
   'Marisol Cruz (IG DM)', '0928 555 0193', 'Pasig City',
   current_date + 3, current_date + 4, '1:00 PM', null, null, false, null, null,
   700, 'Maya', 'verified', null, true),

  -- PENDING — customer paid, admin has not verified yet. Still blocks its dates.
  ('c1000000-0000-4000-8000-000000000003', 'rent',
   '829c4722-0220-4233-a1fc-2015cbacb655', 'Zolana',
   'Trisha Lim', '0906 555 0177', '8B Aurora Tower, Quezon City',
   current_date + 10, current_date + 11, '3:00 PM', null, null, false, null, null,
   600, 'GCash', 'pending', null, false),

  -- HOLD — someone is mid-checkout right now. Blocks its dates until it lapses
  -- (~9 minutes after you run this), then the days free themselves. Re-run this
  -- one INSERT any time you want to look at the amber "hold" state again.
  ('c1000000-0000-4000-8000-000000000004', 'rent',
   'f15e23e1-9633-45ef-8067-fe638dc0e32c', 'Maxine',
   'Kaye Domingo', '0919 555 0108', '221 Katipunan Ave, Quezon City',
   current_date + 16, current_date + 17, '11:00 AM', null, null, false, null, null,
   620, null, 'hold', now() + interval '9 minutes', false),

  -- INVALID — admin flagged the proof as bad. Frees the dates; its uploaded PII
  -- is what the purge-expired-pii job would clear after the grace period.
  ('c1000000-0000-4000-8000-000000000005', 'rent',
   'ffc0fd93-b74a-401b-bf1c-6db99855f988', 'Steph',
   'Anonymous Booker', '0999 555 0000', 'Taguig City',
   current_date + 20, current_date + 21, '9:00 AM', null, null, false, null, null,
   600, 'GCash', 'invalid', null, false),

  -- PAST verified rental, so revenue/analytics are non-zero on day one.
  ('c1000000-0000-4000-8000-000000000006', 'rent',
   '0ddb0749-771f-4336-85dd-1e1441a8404b', 'Florencia',
   'Ella Bautista', '0915 555 0121', '3 Sampaguita St, San Juan City',
   current_date - 14, current_date - 13, '2:00 PM', null, null, false, null, null,
   600, 'Maya', 'verified', null, false),

  -- FITTINGS. 7:00 PM is offered on every weekday AND weekend (see fittingSlots()
  -- in lib/reserve.ts), so these stay valid whichever day you run the seed. Both
  -- dates are clear of the rentals above — a fitting can't share a day with any
  -- rental hand-off or wash day.
  ('c1000000-0000-4000-8000-000000000007', 'fitting',
   '4bcaed44-2ae3-4e10-8732-2da460aa2688', 'Zemira',
   'Nadine Reyes', '0917 555 0166', null,
   null, null, null, current_date + 7, '7:00 PM', true, 'Car', 'ABC 1234',
   250, 'GCash', 'pending', null, false),

  ('c1000000-0000-4000-8000-000000000008', 'fitting',
   '0c757993-b59d-4ca4-be02-8c080a811348', 'Melany',
   'Joy Fernandez', '0908 555 0154', null,
   null, null, null, current_date + 8, '7:00 PM', false, null, null,
   200, 'Maya', 'verified', null, false);

-- Label every seeded booking with the garment it holds. Each dress above is
-- offered in exactly ONE size, so this is unambiguous and saves repeating the
-- size on every row — and it keeps the seed valid for the (dress_id, size)
-- exclusion constraint, which treats an unlabelled booking as its own unit.
update public.bookings b
set size = s.size
from public.dress_sizes s
where b.size is null
  and b.dress_id = s.dress_id
  and (select count(*) from public.dress_sizes x where x.dress_id = b.dress_id) = 1;

-- Accessory add-ons. These are what make accessory availability date-aware: the
-- Velvet Shawl has ONE unit, so the walk-in booking makes it show as "rented"
-- on +3/+4 while staying bookable on every other date.
insert into public.booking_accessories (booking_id, accessory_id, price_at_booking) values
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 100),
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 150),
  ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000004', 200),
  ('c1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 100),
  ('c1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000003', 120),
  ('c1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 100);

-- Pre-system rentals the admin logged by hand. They feed "Rented N×" and
-- "Most rented" without blocking any dates.
insert into public.rental_history (dress_id, dress_name, renter_name, start_date, end_date, amount_paid) values
  ('56ca2556-00c7-4503-b053-8e394316ff64', 'Emily',     'Camille Ocampo', current_date - 60, current_date - 59, 500),
  ('56ca2556-00c7-4503-b053-8e394316ff64', 'Emily',     'Rhea Villanueva', current_date - 45, current_date - 44, 500),
  ('829c4722-0220-4233-a1fc-2015cbacb655', 'Zolana',    'Patricia Uy',    current_date - 38, current_date - 37, 500),
  ('f15e23e1-9633-45ef-8067-fe638dc0e32c', 'Maxine',    'Angel Mercado',  current_date - 25, current_date - 24, 500);


-- ---------------------------------------------------------------------------
-- 11) Optional: running the scheduled jobs in dev
-- ---------------------------------------------------------------------------
-- Not needed for normal development. Expired holds simply linger as rows —
-- blocked_dates and accessory_blocked_dates already ignore them, and
-- create_rent_hold deletes any that are in its way. If you DO want the real
-- cleanup loop in dev:
--   1. supabase functions deploy cleanup-holds  (and/or purge-expired-pii)
--   2. Store a `purge_pii_cron_secret` in this project's Vault.
--   3. Enable pg_cron + pg_net, then schedule it with THIS project's URL:
--        select cron.schedule('cleanup-expired-holds', '*/10 * * * *', $job$
--          select net.http_post(
--            url := 'https://<your-dev-ref>.supabase.co/functions/v1/cleanup-holds',
--            headers := jsonb_build_object(
--              'Content-Type', 'application/json',
--              'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
--                                where name = 'purge_pii_cron_secret')),
--            body := '{}'::jsonb);
--        $job$);
-- ============================================================================
