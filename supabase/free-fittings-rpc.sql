-- ############################################################################
-- DO NOT RUN THIS FILE ANY MORE.  Superseded 2026-09-16.
--
-- It contains the OLD fitting rule:
--     if exists (select 1 from public.blocked_dates where blocked_day = p_date)
-- i.e. "no fittings on any day ANY dress is out".
--
-- That rule was replaced by "no fittings only once EVERY size of THIS dress is
-- out" in supabase/per-size-availability.sql. Running this file again silently
-- puts the old rule back — it already happened once on dev, and it took a while
-- to work out why fittings were being refused.
--
-- Kept only as a record of what was applied at the time.
-- ############################################################################

-- FREE FITTINGS — drop the ₱200 fitting fee from create_fitting_booking.
--
-- WHY: fittings are now free. Parking (₱50, optional) is unchanged and is the
-- only thing a fitting can cost, so the snapshotted `bookings.amount` becomes
-- 50 when parking is reserved and 0 otherwise.
--
-- No column changes — `amount` is shared with rentals and stays. Only the
-- amount this RPC computes changes.
--
-- RUN ON BOTH PROJECTS (Supabase dashboard → SQL Editor):
--   • PROD  ndqkuvvxcnnavhksdmlq
--   • DEV   mzpheehlswkhjlmadrbv
-- CREATE OR REPLACE keeps the existing grants, so no re-GRANT is needed.
--
-- Existing fitting rows keep their historical ₱200 amount on purpose — they
-- record what was charged at the time. Fittings are never `verified`, so they
-- have never counted toward revenue analytics either way.

CREATE OR REPLACE FUNCTION public.create_fitting_booking(
  p_dress_id uuid, p_name text, p_contact text, p_date date, p_time text,
  p_parking boolean, p_vehicle text, p_plate text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_dress record;
  v_plate text := btrim(coalesce(p_plate, ''));
  v_amount integer;
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

  if exists (select 1 from public.blocked_dates where blocked_day = p_date) then
    return jsonb_build_object('ok', false, 'conflict', 'day');
  end if;

  if exists (
    select 1 from public.booked_fitting_slots
    where fitting_date = p_date and fitting_time = p_time
  ) then
    return jsonb_build_object('ok', false, 'conflict', 'slot');
  end if;

  -- The fitting itself is free; 50 mirrors PARKING_FEE in lib/reserve.ts. This
  -- flat fee has no DB table (unlike dress/accessory prices, which the rent RPC
  -- reads live), so it is the one value duplicated between code and SQL.
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
$function$;
