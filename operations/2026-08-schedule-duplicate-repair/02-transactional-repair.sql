-- ONE-TIME REVIEWED OPERATION. DO NOT run before export and approval.
-- Safe default: this file ends with ROLLBACK. Change only the final statement
-- to COMMIT in the approved execution copy after every assertion passes.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '2min';

lock table public.schedule_entries in share row exclusive mode;

do $$
declare
  active_version uuid;
  import_count integer;
begin
  select active_schedule_version_id into active_version
  from public.departments
  where active_schedule_version_id = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446';
  if active_version is distinct from 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446'::uuid then
    raise exception 'repair aborted: expected version is not active';
  end if;

  select count(*) into import_count
  from public.schedule_imports
  where id in (
    'a08d3531-86b3-4169-b63b-22d43d341971',
    '391631d5-47eb-43c4-967d-1d30127fb650',
    'bf72fb0a-4732-41ce-974a-02aecfd075d7'
  );
  if import_count <> 3 then
    raise exception 'repair aborted: expected three incident import records, found %', import_count;
  end if;
end $$;

do $$
declare
  referencing_constraints text[];
begin
  select array_agg(constraint_name order by constraint_name)
  into referencing_constraints
  from (
    select constraint_record.conname as constraint_name
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.contype = 'f'
      and constraint_record.confrelid = 'public.schedule_entries'::regclass
  ) constraints;

  if referencing_constraints is distinct from array[
    'shift_request_offers_offered_schedule_entry_id_fkey',
    'shift_requests_schedule_entry_id_fkey',
    'user_schedule_overrides_base_schedule_entry_id_fkey'
  ]::text[] then
    raise exception 'repair aborted: schedule_entries foreign-key set changed: %',
      referencing_constraints;
  end if;
end $$;

create temporary table repair_ranked on commit drop as
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
  and shift_date between '2026-08-23' and '2026-08-26';

do $$
declare
  groups integer;
  surplus integer;
  counts integer[];
begin
  select count(*) filter (where group_size > 1 and duplicate_rank = 1),
         count(*) filter (where duplicate_rank > 1)
  into groups, surplus
  from repair_ranked;
  if groups <> 67 or surplus <> 120 then
    raise exception 'repair aborted: expected 67 duplicate groups/120 surplus rows, found %/%', groups, surplus;
  end if;

  select array_agg(day_count order by shift_date) into counts
  from (
    select shift_date, count(*) filter (where duplicate_rank = 1)::integer as day_count
    from repair_ranked group by shift_date
  ) daily;
  if counts is distinct from array[16,18,17,18] then
    raise exception 'repair aborted: canonical counts are %, expected {16,18,17,18}', counts;
  end if;
end $$;

do $$
declare referenced integer;
begin
  select
    (select count(*) from public.user_schedule_overrides where base_schedule_entry_id in
      (select id from repair_ranked where duplicate_rank > 1))
    + (select count(*) from public.shift_requests where schedule_entry_id in
      (select id from repair_ranked where duplicate_rank > 1))
    + (select count(*) from public.shift_request_offers where offered_schedule_entry_id in
      (select id from repair_ranked where duplicate_rank > 1))
  into referenced;
  if referenced <> 0 then
    raise exception 'repair aborted: % surplus rows have dependent workflow references', referenced;
  end if;
end $$;

insert into public.audit_events (
  department_id, actor_profile_id, event_type, entity_type, entity_id,
  before_json, after_json
)
select
  ranked.department_id,
  null,
  'schedule_exact_duplicate_removed',
  'schedule_entry',
  ranked.id,
  to_jsonb(ranked) - 'duplicate_rank' - 'group_size',
  jsonb_build_object(
    'repair', '2026-08-schedule-duplicate-repair',
    'canonical_rule', 'earliest created_at then id',
    'active_version_id', ranked.schedule_version_id
  )
from repair_ranked ranked
where ranked.duplicate_rank > 1;

delete from public.schedule_entries entry
using repair_ranked ranked
where ranked.duplicate_rank > 1
  and entry.id = ranked.id;

do $$
declare
  remaining_duplicates integer;
  counts integer[];
  repair_audits integer;
begin
  select count(*) into remaining_duplicates
  from (
    select 1
    from public.schedule_entries
    where schedule_version_id = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446'
      and shift_date between '2026-08-23' and '2026-08-26'
    group by schedule_version_id, staff_profile_id, shift_date, shift_type,
             shift_start, shift_end, entry_status, coalesce(is_shift_lead, false)
    having count(*) > 1
  ) duplicate_groups;
  if remaining_duplicates <> 0 then
    raise exception 'repair aborted: % duplicate groups remain', remaining_duplicates;
  end if;

  select array_agg(day_count order by shift_date) into counts
  from (
    select shift_date, count(*)::integer as day_count
    from public.schedule_entries
    where schedule_version_id = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446'
      and shift_date between '2026-08-23' and '2026-08-26'
    group by shift_date
  ) daily;
  if counts is distinct from array[16,18,17,18] then
    raise exception 'repair aborted: post-repair counts are %, expected {16,18,17,18}', counts;
  end if;

  select count(*) into repair_audits
  from public.audit_events
  where event_type = 'schedule_exact_duplicate_removed'
    and entity_id in (select id from repair_ranked where duplicate_rank > 1);
  if repair_audits <> 120 then
    raise exception 'repair aborted: expected 120 repair audit rows, found %', repair_audits;
  end if;
end $$;

select shift_date, count(*) as canonical_count
from public.schedule_entries
where schedule_version_id = 'd1c1ab1c-d842-4f1e-b155-3dca2a21b446'
  and shift_date between '2026-08-23' and '2026-08-26'
group by shift_date
order by shift_date;

-- SAFE DEFAULT. The approved execution copy must change only this line.
rollback;
