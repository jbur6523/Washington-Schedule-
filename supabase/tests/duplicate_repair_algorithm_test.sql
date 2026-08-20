begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select plan(8);

insert into public.schedule_entries (
  id, schedule_version_id, department_id, staff_profile_id, shift_date,
  day_of_week, shift_type, shift_start, shift_end, entry_status,
  is_shift_lead, created_at
)
select
  md5('repair-canonical-' || shift_date::text || '-' || staff_number)::uuid,
  '70000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  md5('local-staff-' || staff_number)::uuid,
  shift_date,
  trim(to_char(shift_date, 'Day')),
  'day_shift', '06:30', '19:00', 'scheduled', staff_number = 1,
  '2026-08-17 13:00:00+00'::timestamptz + make_interval(secs => staff_number)
from (
  select '2026-08-24'::date as shift_date, generate_series(1, 18) as staff_number
  union all select '2026-08-25'::date, generate_series(1, 17)
  union all select '2026-08-26'::date, generate_series(1, 18)
) canonical;

select is(
  (select array_agg(day_count order by shift_date) from (
    select shift_date, count(*)::integer day_count
    from public.schedule_entries
    where schedule_version_id = '70000000-0000-0000-0000-000000000001'
      and shift_date between '2026-08-23' and '2026-08-26'
    group by shift_date
  ) daily),
  array[16,18,17,18],
  'synthetic repair fixture begins with canonical 16/18/17/18'
);

drop index public.schedule_entries_exact_row_unique;
insert into public.schedule_entries (
  id, schedule_version_id, department_id, staff_profile_id, shift_date,
  day_of_week, shift_type, shift_start, shift_end, entry_status,
  is_shift_lead, created_at
)
select
  md5('repair-surplus-' || canonical.id::text || '-' || copy_number)::uuid,
  canonical.schedule_version_id, canonical.department_id,
  canonical.staff_profile_id, canonical.shift_date, canonical.day_of_week,
  canonical.shift_type, canonical.shift_start, canonical.shift_end,
  canonical.entry_status, canonical.is_shift_lead,
  canonical.created_at + make_interval(hours => copy_number)
from public.schedule_entries canonical
cross join lateral generate_series(
  1,
  case
    when canonical.shift_date = '2026-08-23' and canonical.staff_profile_id in (
      select md5('local-staff-' || number)::uuid from generate_series(1, 14) number
    ) then 1
    when canonical.shift_date between '2026-08-24' and '2026-08-26' then 2
    else 0
  end
) copy_number
where canonical.schedule_version_id = '70000000-0000-0000-0000-000000000001'
  and canonical.shift_date between '2026-08-23' and '2026-08-26';

select is(
  (select array_agg(day_count order by shift_date) from (
    select shift_date, count(*)::integer day_count
    from public.schedule_entries
    where schedule_version_id = '70000000-0000-0000-0000-000000000001'
      and shift_date between '2026-08-23' and '2026-08-26'
    group by shift_date
  ) daily),
  array[30,54,51,54],
  'synthetic incident reproduces 30/54/51/54 persisted rows'
);
select throws_ok(
  $$do $guard$
  begin
    if exists (
      select 1 from public.schedule_entries
      group by schedule_version_id, staff_profile_id, shift_date, shift_type,
               shift_start, shift_end, entry_status, coalesce(is_shift_lead, false)
      having staff_profile_id is not null and count(*) > 1
    ) then
      raise exception 'schedule_entries_exact_duplicates_present';
    end if;
  end $guard$;$$,
  'P0001', 'schedule_entries_exact_duplicates_present',
  'additive migration fails clearly while exact duplicates remain'
);

create temporary table repair_ranked on commit drop as
select entry.*,
       row_number() over (
         partition by schedule_version_id, staff_profile_id, shift_date,
                      shift_type, shift_start, shift_end, entry_status,
                      coalesce(is_shift_lead, false)
         order by created_at, id
       ) duplicate_rank,
       count(*) over (
         partition by schedule_version_id, staff_profile_id, shift_date,
                      shift_type, shift_start, shift_end, entry_status,
                      coalesce(is_shift_lead, false)
       ) group_size
from public.schedule_entries entry
where schedule_version_id = '70000000-0000-0000-0000-000000000001'
  and shift_date between '2026-08-23' and '2026-08-26';

select is(
  (select count(*)::integer from repair_ranked where group_size > 1 and duplicate_rank = 1),
  67,
  'repair identifies exactly 67 duplicate groups'
);
select is(
  (select count(*)::integer from repair_ranked where duplicate_rank > 1),
  120,
  'repair identifies exactly 120 surplus rows'
);

insert into public.audit_events (
  department_id, event_type, entity_type, entity_id, before_json, after_json
)
select department_id, 'schedule_exact_duplicate_removed', 'schedule_entry', id,
       to_jsonb(repair_ranked) - 'duplicate_rank' - 'group_size',
       jsonb_build_object('repair', 'synthetic-local-regression')
from repair_ranked where duplicate_rank > 1;
select is(
  (select count(*)::integer from public.audit_events
   where event_type = 'schedule_exact_duplicate_removed'
     and after_json ->> 'repair' = 'synthetic-local-regression'),
  120,
  'repair records audit evidence for all removed rows'
);

delete from public.schedule_entries entry
using repair_ranked ranked
where ranked.duplicate_rank > 1 and entry.id = ranked.id;

select is(
  (select count(*)::integer from (
    select 1 from public.schedule_entries
    where schedule_version_id = '70000000-0000-0000-0000-000000000001'
      and shift_date between '2026-08-23' and '2026-08-26'
    group by schedule_version_id, staff_profile_id, shift_date, shift_type,
             shift_start, shift_end, entry_status, coalesce(is_shift_lead, false)
    having count(*) > 1
  ) duplicates),
  0,
  'repair leaves zero exact duplicate groups'
);
select is(
  (select array_agg(day_count order by shift_date) from (
    select shift_date, count(*)::integer day_count
    from public.schedule_entries
    where schedule_version_id = '70000000-0000-0000-0000-000000000001'
      and shift_date between '2026-08-23' and '2026-08-26'
    group by shift_date
  ) daily),
  array[16,18,17,18],
  'repair restores exact canonical 16/18/17/18 counts'
);

select * from finish();
rollback;
