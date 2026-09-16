-- ============================================================================
-- Veloura — re-apply the per-size FITTING rule
-- ============================================================================
-- Run this in the dev SQL editor (then prod, when the rest ships).
--
-- WHY THIS FILE EXISTS
-- `create_fitting_booking` on dev is running the OLD day rule:
--
--     if exists (select 1 from public.blocked_dates where blocked_day = p_date)
--
-- i.e. a fitting is refused whenever ANY dress in the catalogue is out. That
-- rule also lives in supabase/free-fittings-rpc.sql and
-- supabase/sync-dev-fitting-rpc.sql, so running either of those AFTER
-- per-size-availability.sql silently reverts this. Don't re-run them.
--
-- The rule below is the one from per-size-availability.sql §6, verbatim: a
-- fitting only needs ONE garment of THIS dress in the room, so the day closes
-- only once every size of it is out. Idempotent — safe to run again.
-- ============================================================================

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

-- create or replace keeps the existing grants, but re-assert them so this file
-- is safe to run on a database where the function was dropped rather than replaced.
revoke execute on function
  public.create_fitting_booking(uuid, text, text, date, text, boolean, text, text)
  from public;
grant execute on function
  public.create_fitting_booking(uuid, text, text, date, text, boolean, text, text)
  to anon, authenticated;
