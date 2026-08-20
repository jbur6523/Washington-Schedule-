-- READ ONLY. Production identifiers are intentionally hard-coded safeguards.
begin transaction read only;

select d.id as department_id, d.active_schedule_version_id, v.label, v.status,
       v.starts_on, v.ends_on
from public.departments d
join public.schedule_versions v on v.id = d.active_schedule_version_id
where v.id = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446';

select id, status, created_at, approved_at
from public.schedule_imports
where id in (
  'a08d3531-86b3-4169-b63b-22d43d341971',
  '391631d5-47eb-43c4-967d-1d30127fb650',
  'bf72fb0a-4732-41ce-974a-02aecfd075d7'
)
order by created_at, id;

with ranked as (
  select entry.*,
         row_number() over (
           partition by schedule_version_id, staff_profile_id, shift_date,
                        shift_type, shift_start, shift_end, entry_status,
                        coalesce(is_shift_lead, false)
           order by created_at, id
         ) as duplicate_rank,
         count(*) over (
           partition by schedule_version_id, staff_profile_id, shift_date,
                        shift_type, shift_start, shift_end, entry_status,
                        coalesce(is_shift_lead, false)
         ) as group_size
  from public.schedule_entries entry
  where schedule_version_id = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446'
    and shift_date between '2026-08-23' and '2026-08-26'
)
select
  count(*) filter (where group_size > 1 and duplicate_rank = 1) as duplicate_groups,
  count(*) filter (where duplicate_rank > 1) as surplus_rows,
  count(*) filter (where duplicate_rank = 1) as canonical_rows
from ranked;

with canonical as (
  select distinct on (
    schedule_version_id, staff_profile_id, shift_date, shift_type,
    shift_start, shift_end, entry_status, coalesce(is_shift_lead, false)
  ) shift_date
  from public.schedule_entries
  where schedule_version_id = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446'
    and shift_date between '2026-08-23' and '2026-08-26'
  order by schedule_version_id, staff_profile_id, shift_date, shift_type,
           shift_start, shift_end, entry_status, coalesce(is_shift_lead, false),
           created_at, id
)
select shift_date, count(*) as canonical_count
from canonical
group by shift_date
order by shift_date;

with ranked as (
  select id,
         row_number() over (
           partition by schedule_version_id, staff_profile_id, shift_date,
                        shift_type, shift_start, shift_end, entry_status,
                        coalesce(is_shift_lead, false)
           order by created_at, id
         ) as duplicate_rank
  from public.schedule_entries
  where schedule_version_id = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446'
    and shift_date between '2026-08-23' and '2026-08-26'
), duplicate_ids as (
  select id from ranked where duplicate_rank > 1
)
select 'user_schedule_overrides.base_schedule_entry_id' as reference, count(*) as referenced_rows
from public.user_schedule_overrides where base_schedule_entry_id in (select id from duplicate_ids)
union all
select 'shift_requests.schedule_entry_id', count(*)
from public.shift_requests where schedule_entry_id in (select id from duplicate_ids)
union all
select 'shift_request_offers.offered_schedule_entry_id', count(*)
from public.shift_request_offers where offered_schedule_entry_id in (select id from duplicate_ids);

rollback;
