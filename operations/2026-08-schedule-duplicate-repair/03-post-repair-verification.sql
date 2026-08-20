-- READ ONLY. Run immediately after the approved repair transaction.
begin transaction read only;

with scoped as (
  select * from public.schedule_entries
  where schedule_version_id = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446'
    and shift_date between '2026-08-23' and '2026-08-26'
), duplicate_groups as (
  select count(*) as row_count
  from scoped
  group by schedule_version_id, staff_profile_id, shift_date, shift_type,
           shift_start, shift_end, entry_status, coalesce(is_shift_lead, false)
  having count(*) > 1
)
select
  (select count(*) from duplicate_groups) as duplicate_groups,
  (select coalesce(sum(row_count - 1), 0) from duplicate_groups) as surplus_rows;

select shift_date, count(*) as canonical_count
from public.schedule_entries
where schedule_version_id = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446'
  and shift_date between '2026-08-23' and '2026-08-26'
group by shift_date
order by shift_date;

select count(*) as repair_audit_rows
from public.audit_events
where event_type = 'schedule_exact_duplicate_removed'
  and (after_json ->> 'active_version_id')::uuid = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446';

select id, status, created_at, approved_at
from public.schedule_imports
where id in (
  'a08d3531-86b3-4169-b63b-22d43d341971',
  '391631d5-47eb-43c4-967d-1d30127fb650',
  'bf72fb0a-4732-41ce-974a-02aecfd075d7'
)
order by created_at, id;

rollback;
