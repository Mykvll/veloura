-- ============================================================================
-- PROD STEP 1 of 3 — add the size column and fill in what's obvious
-- ============================================================================
-- Safe to run on the live site. It adds one empty column and fills it in where
-- there's only one possible answer. Nothing reads the column yet, no rule
-- changes, no constraint is added. The site behaves exactly as it does now.
--
-- Run this, then run the SELECT at the bottom and send me the results.
-- ============================================================================

begin;

alter table public.bookings add column if not exists size text;
comment on column public.bookings.size is
  'Which size of the dress this booking holds. One garment per size, so '
  '(dress_id, size) identifies the physical unit that is out.';

-- Fill in every booking whose dress is stocked in exactly ONE size — there is
-- only one possible answer, so nothing is being guessed.
update public.bookings b
set size = s.size
from public.dress_sizes s
where b.size is null
  and b.dress_id = s.dress_id
  and (select count(*) from public.dress_sizes x where x.dress_id = b.dress_id) = 1;

commit;


-- ============================================================================
-- Now run this and send me what it returns.
-- ============================================================================
-- Everything still unlabelled, with the context needed to decide each one.
-- `overlaps_another` flags any booking sharing dates with another unlabelled
-- booking of the same dress — those are the ones that MUST be right, because
-- two garments on the same dates is exactly what the new rule allows.
select b.id,
       b.dress_name,
       b.renter_name,
       b.start_date,
       b.end_date,
       b.payment_status,
       b.manual,
       b.created_at::date as booked_on,
       exists (
         select 1 from public.bookings o
         where o.id <> b.id
           and o.dress_id = b.dress_id
           and o.size is null
           and o.type = 'rent'
           and o.payment_status in ('hold','pending','verified')
           and o.start_date <= b.end_date + 1
           and b.start_date <= o.end_date + 1
       ) as overlaps_another
from public.bookings b
where b.size is null
  and b.dress_id is not null
  and b.type = 'rent'
  and b.payment_status in ('hold','pending','verified')
order by b.start_date;

-- And the sizes that dress is offered in, so we know the options:
select d.name, s.size, s.bust_cm, s.waist_cm, s.length_cm
from public.dress_sizes s
join public.dresses d on d.id = s.dress_id
where exists (
  select 1 from public.bookings b
  where b.dress_id = s.dress_id and b.size is null and b.type = 'rent'
    and b.payment_status in ('hold','pending','verified')
)
order by d.name, s.size;
