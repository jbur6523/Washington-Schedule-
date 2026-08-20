begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;

create or replace function pg_temp.entry_rows(
  row_number integer,
  shift_day text,
  staff_id uuid,
  shift_kind text default 'day_shift',
  start_time text default '06:30',
  end_time text default '19:00',
  entry_state text default 'scheduled',
  lead_state boolean default false
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(jsonb_build_object(
    'row_index', row_number,
    'shift_date', shift_day,
    'shift_type', shift_kind,
    'shift_start', start_time,
    'shift_end', end_time,
    'staff_profile_id', staff_id,
    'raw_staff_name', 'synthetic',
    'entry_status', entry_state,
    'is_shift_lead', lead_state
  ));
$$;

create or replace function pg_temp.audit_rows(row_number integer, row_kind text default 'entry')
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(jsonb_build_object(
    'row_index', row_number,
    'row_type', row_kind,
    'source_line', upper(row_kind) || ' synthetic',
    'raw_staff_name', case when row_kind = 'entry' then 'synthetic' end,
    'excluded', false
  ));
$$;

create or replace function pg_temp.shortage_rows(
  row_number integer,
  shift_day text,
  severity_value text default 'short',
  message_value text default 'Synthetic shortage'
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(jsonb_build_object(
    'row_index', row_number,
    'shift_date', shift_day,
    'shift_type', 'night_shift',
    'shift_start', '18:30',
    'shift_end', '07:00',
    'severity', severity_value,
    'message', message_value
  ));
$$;

select plan(41);

select is(
  (select count(*)::integer from public.schedule_entries
   where schedule_version_id = '70000000-0000-0000-0000-000000000001'
     and shift_date < '2026-08-23'),
  998,
  'fixture has exactly 998 earlier schedule entries'
);
select is(
  (select count(*)::integer from public.schedule_entries
   where schedule_version_id = '70000000-0000-0000-0000-000000000001'
     and shift_date = '2026-08-23'),
  16,
  'fixture has 16 canonical target-date entries'
);
select cmp_ok(
  (select count(*) from public.schedule_entries
   where schedule_version_id = '70000000-0000-0000-0000-000000000001'),
  '>', 1000::bigint,
  'fixture contains more than 1,000 active-version rows'
);
select is(
  (select count(*)::integer from (
    select shift_date
    from public.schedule_entries
    where schedule_version_id = '70000000-0000-0000-0000-000000000001'
    order by shift_date, shift_start, created_at, id
    limit 1000
  ) capped where shift_date = '2026-08-23'),
  2,
  'old capped all-version query exposes only two target-date rows'
);
select is(
  (select count(*)::integer from public.schedule_entries
   where schedule_version_id = '70000000-0000-0000-0000-000000000001'
     and shift_date between '2026-08-23' and '2026-08-23'),
  16,
  'date-scoped replacement sees every target-date row'
);
select is(
  (with capped as (
    select id from public.schedule_entries
    where schedule_version_id = '70000000-0000-0000-0000-000000000001'
    order by shift_date, shift_start, created_at, id
    limit 1000
  )
  select count(*)::integer
  from public.schedule_entries entry
  where entry.schedule_version_id = '70000000-0000-0000-0000-000000000001'
    and entry.shift_date = '2026-08-23'
    and not exists (select 1 from capped where capped.id = entry.id)),
  14,
  'old duplicate check cannot see 14 canonical target-date rows'
);

drop index public.schedule_entries_exact_row_unique;
insert into public.schedule_entries (
  id, schedule_version_id, department_id, staff_profile_id, shift_date,
  day_of_week, shift_type, shift_start, shift_end, entry_status, is_shift_lead
)
select
  md5('old-retry-' || source.id::text)::uuid,
  source.schedule_version_id, source.department_id, source.staff_profile_id,
  source.shift_date, source.day_of_week, source.shift_type, source.shift_start,
  source.shift_end, source.entry_status, source.is_shift_lead
from (
  select * from public.schedule_entries
  where schedule_version_id = '70000000-0000-0000-0000-000000000001'
    and shift_date = '2026-08-23'
  order by created_at, id
  offset 2
) source;
select is(
  (select count(*)::integer from public.schedule_entries
   where schedule_version_id = '70000000-0000-0000-0000-000000000001'
     and shift_date = '2026-08-23'),
  30,
  'old retry behavior reproduces 14 surplus exact rows'
);
delete from public.schedule_entries where id in (
  select md5('old-retry-' || source.id::text)::uuid
  from public.schedule_entries source
  where source.schedule_version_id = '70000000-0000-0000-0000-000000000001'
    and source.shift_date = '2026-08-23'
    and source.id not in (
      select md5('old-retry-' || canonical.id::text)::uuid
      from public.schedule_entries canonical
      where canonical.schedule_version_id = '70000000-0000-0000-0000-000000000001'
        and canonical.shift_date = '2026-08-23'
    )
);
-- The deterministic inserted IDs are recognizable directly; remove any that
-- remain, then restore the protection before atomic-import tests continue.
delete from public.schedule_entries
where schedule_version_id = '70000000-0000-0000-0000-000000000001'
  and shift_date = '2026-08-23'
  and created_at > '2026-08-18';
create unique index schedule_entries_exact_row_unique
  on public.schedule_entries (
    schedule_version_id, staff_profile_id, shift_date, shift_type,
    shift_start, shift_end, entry_status, is_shift_lead
  ) where staff_profile_id is not null;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select is(
  (public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('1', 64), 'new row',
    '2026-09-04', '2026-09-04',
    pg_temp.entry_rows(1, '2026-09-04', md5('local-staff-3')::uuid),
    '[]', pg_temp.audit_rows(1)
  )->>'insertedEntries')::integer,
  1,
  'administrator can atomically insert a new row'
);
select is(
  (select ends_on::text from public.schedule_versions where id = '70000000-0000-0000-0000-000000000001'),
  '2026-09-04',
  'import extends the version end date'
);
select is(
  (select starts_on::text from public.schedule_versions where id = '70000000-0000-0000-0000-000000000001'),
  '2026-06-01',
  'later import never shrinks the version start date'
);
select is(
  (public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('1', 64), 'new row',
    '2026-09-04', '2026-09-04',
    pg_temp.entry_rows(1, '2026-09-04', md5('local-staff-3')::uuid),
    '[]', pg_temp.audit_rows(1)
  )->>'duplicateEntries')::integer,
  1,
  'identical retry rechecks state and skips the exact row'
);
select is(
  (select count(*)::integer from public.schedule_entries
   where schedule_version_id = '70000000-0000-0000-0000-000000000001'
     and shift_date = '2026-09-04'
     and staff_profile_id = md5('local-staff-3')::uuid),
  1,
  'identical retry creates no duplicate'
);
select is(
  (select attempt_count from public.schedule_imports where source_hash = repeat('1', 64)),
  2,
  'logical import retains retry attempt count'
);
select is(
  (select disposition from public.schedule_import_rows row
   join public.schedule_imports import on import.id = row.schedule_import_id
   where import.source_hash = repeat('1', 64)),
  'exact_duplicate',
  'row-level audit disposition is refreshed on retry'
);

delete from public.schedule_entries
where schedule_version_id = '70000000-0000-0000-0000-000000000001'
  and shift_date = '2026-09-04'
  and staff_profile_id = md5('local-staff-3')::uuid;
select is(
  (public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('1', 64), 'new row',
    '2026-09-04', '2026-09-04',
    pg_temp.entry_rows(1, '2026-09-04', md5('local-staff-3')::uuid),
    '[]', pg_temp.audit_rows(1)
  )->>'insertedEntries')::integer,
  1,
  'identical retry restores a deliberately removed canonical row'
);
select is(
  (select count(*)::integer from public.schedule_entries
   where schedule_version_id = '70000000-0000-0000-0000-000000000001'
     and shift_date = '2026-09-04'
     and staff_profile_id = md5('local-staff-3')::uuid),
  1,
  'restored row is independently present once'
);

select throws_ok(
  $$select public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('2', 64), 'conflict',
    '2026-08-23', '2026-08-23',
    pg_temp.entry_rows(1, '2026-08-23', md5('local-staff-1')::uuid, 'day_shift', '06:30', '19:00', 'scheduled', false),
    '[]', pg_temp.audit_rows(1)
  )$$,
  '40001', 'schedule_import_conflicts:1',
  'differing Shift Lead state is a conflict'
);
select is(
  (select count(*)::integer from public.schedule_imports where source_hash = repeat('2', 64)),
  0,
  'conflict leaves no approved or partial import audit'
);
select throws_ok(
  $$select public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('e', 64), 'status conflict',
    '2026-08-23', '2026-08-23',
    pg_temp.entry_rows(1, '2026-08-23', md5('local-staff-2')::uuid, 'day_shift', '06:30', '19:00', 'available', false),
    '[]', pg_temp.audit_rows(1)
  )$$,
  '40001', 'schedule_import_conflicts:1',
  'differing scheduled/available status is a conflict'
);
select throws_ok(
  $$select public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('f', 64), 'time conflict',
    '2026-08-23', '2026-08-23',
    pg_temp.entry_rows(1, '2026-08-23', md5('local-staff-3')::uuid, 'day_shift', '07:00', '19:30', 'scheduled', false),
    '[]', pg_temp.audit_rows(1)
  )$$,
  '40001', 'schedule_import_conflicts:1',
  'differing times are a conflict'
);

select throws_ok(
  $$insert into public.schedule_entries (
    schedule_version_id, department_id, staff_profile_id, shift_date, day_of_week,
    shift_type, shift_start, shift_end, entry_status, is_shift_lead
  ) values (
    '70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
    md5('local-staff-1')::uuid, '2026-08-23', 'Sunday', 'day_shift', '06:30', '19:00', 'scheduled', true
  )$$,
  '23505',
  'duplicate key value violates unique constraint "schedule_entries_exact_row_unique"',
  'exact unique index blocks an exact schedule duplicate'
);
select lives_ok(
  $$insert into public.schedule_entries (
    schedule_version_id, department_id, staff_profile_id, shift_date, day_of_week,
    shift_type, shift_start, shift_end, entry_status, is_shift_lead
  ) values (
    '70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
    md5('local-staff-1')::uuid, '2026-08-23', 'Sunday', 'day_shift', '08:00', '12:00', 'scheduled', true
  )$$,
  'legitimate distinct split shift remains allowed'
);

select is(
  (public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('3', 64), 'shortage',
    '2026-09-05', '2026-09-05', '[]',
    pg_temp.shortage_rows(1, '2026-09-05'), pg_temp.audit_rows(1, 'short_shift')
  )->>'insertedShortages')::integer,
  1,
  'Short Shift is inserted in the atomic import'
);
select is(
  (public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('3', 64), 'shortage',
    '2026-09-05', '2026-09-05', '[]',
    pg_temp.shortage_rows(1, '2026-09-05'), pg_temp.audit_rows(1, 'short_shift')
  )->>'duplicateShortages')::integer,
  1,
  'Short Shift retry is idempotent'
);
select is(
  (select count(*)::integer from public.shift_shortages
   where schedule_version_id = '70000000-0000-0000-0000-000000000001'
     and shift_date = '2026-09-05' and status = 'active'),
  1,
  'Short Shift exact duplicate remains single'
);
select is(
  ((public.verify_schedule_import(
    (select id from public.schedule_imports where source_hash = repeat('3', 64))
  )->>'verified')::boolean),
  true,
  'read-after-write verifier confirms Short Shift audit linkage'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('4', 64), 'unauthorized',
    '2026-09-06', '2026-09-06',
    pg_temp.entry_rows(1, '2026-09-06', md5('local-staff-4')::uuid), '[]', pg_temp.audit_rows(1)
  )$$,
  '42501', 'schedule_import_department_admin_required',
  'non-administrator is rejected'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('5', 64), 'cross department',
    '2026-09-06', '2026-09-06',
    pg_temp.entry_rows(1, '2026-09-06', md5('local-staff-4')::uuid), '[]', pg_temp.audit_rows(1)
  )$$,
  '42501', 'schedule_import_department_admin_required',
  'cross-department active version is rejected'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
insert into public.schedule_versions (
  id, department_id, label, starts_on, ends_on, status, created_by
) values (
  '70000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000002',
  'Replacement active version', '2026-08-01', '2026-08-31', 'published',
  '40000000-0000-0000-0000-000000000001'
);
update public.departments
set active_schedule_version_id = '70000000-0000-0000-0000-000000000009'
where id = '30000000-0000-0000-0000-000000000002';
select throws_ok(
  $$select public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('6', 64), 'stale preview',
    '2026-09-06', '2026-09-06',
    pg_temp.entry_rows(1, '2026-09-06', md5('local-staff-4')::uuid), '[]', pg_temp.audit_rows(1)
  )$$,
  '40001', 'schedule_import_active_version_changed',
  'version changed between preview and commit is rejected'
);
update public.departments
set active_schedule_version_id = '70000000-0000-0000-0000-000000000001'
where id = '30000000-0000-0000-0000-000000000002';
update public.departments
set active_schedule_version_id = null
where id = '30000000-0000-0000-0000-000000000002';
select throws_ok(
  $$select public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('a', 64), 'no active schedule',
    '2026-09-06', '2026-09-06',
    pg_temp.entry_rows(1, '2026-09-06', md5('local-staff-4')::uuid), '[]', pg_temp.audit_rows(1)
  )$$,
  '40001', 'schedule_import_active_version_changed',
  'missing active schedule is rejected'
);
update public.departments
set active_schedule_version_id = '70000000-0000-0000-0000-000000000001'
where id = '30000000-0000-0000-0000-000000000002';

select is(
  (public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('7', 64), 'earlier',
    '2026-05-15', '2026-05-15',
    pg_temp.entry_rows(1, '2026-05-15', md5('local-staff-5')::uuid), '[]', pg_temp.audit_rows(1)
  )->>'startsOn'),
  '2026-05-15',
  'range extends earlier automatically'
);
select is(
  (select ends_on::text from public.schedule_versions where id = '70000000-0000-0000-0000-000000000001'),
  '2026-09-05',
  'earlier extension never shrinks end date'
);

select is(
  ((public.verify_schedule_import(
    (select id from public.schedule_imports where source_hash = repeat('1', 64))
  )->>'verified')::boolean),
  true,
  'read-after-write verifier confirms all linked canonical rows'
);
select is(
  (select count(*)::integer from public.schedule_import_rows row
   join public.schedule_imports import on import.id = row.schedule_import_id
   where import.source_hash = repeat('1', 64)),
  1,
  'every parsed source row has one audit row'
);
select is(
  (public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('0', 64), 'excluded',
    '2026-09-08', '2026-09-08', '[]', '[]',
    jsonb_build_array(jsonb_build_object(
      'row_index', 1, 'row_type', 'entry', 'source_line', 'ENTRY excluded',
      'raw_staff_name', 'excluded', 'excluded', true,
      'exclusion_reason', 'Excluded during test review'
    ))
  )->>'excludedCount')::integer,
  1,
  'explicitly excluded rows are not committed as schedule rows'
);
select is(
  (select disposition from public.schedule_import_rows row
   join public.schedule_imports import on import.id = row.schedule_import_id
   where import.source_hash = repeat('0', 64)),
  'excluded',
  'excluded source row retains row-level audit disposition'
);

reset role;
create or replace function pg_temp.fail_last_import_row()
returns trigger
language plpgsql
as $$
begin
  if new.shift_date = '2026-09-09' and new.staff_profile_id = md5('local-staff-4')::uuid then
    raise exception 'forced final row failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger test_fail_last_import_row
before insert on public.schedule_entries
for each row execute function pg_temp.fail_last_import_row();
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('8', 64), 'forced failure',
    '2026-09-09', '2026-09-09',
    pg_temp.entry_rows(1, '2026-09-09', md5('local-staff-3')::uuid, 'day_shift')
      || pg_temp.entry_rows(2, '2026-09-09', md5('local-staff-4')::uuid, 'night_shift', '18:30', '07:00'),
    '[]', pg_temp.audit_rows(1) || pg_temp.audit_rows(2)
  )$$,
  'P0001', 'forced final row failure',
  'forced final-row failure aborts the RPC'
);
select is(
  (select count(*)::integer from public.schedule_entries
   where schedule_version_id = '70000000-0000-0000-0000-000000000001'
     and shift_date = '2026-09-09'),
  0,
  'forced final-row failure leaves no partial entries'
);
select is(
  (select count(*)::integer from public.schedule_imports where source_hash = repeat('8', 64)),
  0,
  'forced final-row failure leaves no approved partial audit'
);
reset role;
drop trigger test_fail_last_import_row on public.schedule_entries;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.commit_schedule_import(
    '70000000-0000-0000-0000-000000000001', repeat('9', 64), 'internal conflict',
    '2026-09-10', '2026-09-10',
    pg_temp.entry_rows(1, '2026-09-10', md5('local-staff-6')::uuid, 'day_shift', '06:30', '19:00')
      || pg_temp.entry_rows(2, '2026-09-10', md5('local-staff-6')::uuid, 'day_shift', '07:00', '19:30'),
    '[]', pg_temp.audit_rows(1) || pg_temp.audit_rows(2)
  )$$,
  '22023', 'schedule_import_internal_conflicts_unresolved',
  'internal differing times are rejected before persistence'
);

select is(
  (select count(*)::integer from public.schedule_entries
   where schedule_version_id = '70000000-0000-0000-0000-000000000001'
     and shift_date = '2026-09-10'),
  0,
  'internal conflict leaves zero schedule rows'
);

select * from finish();
rollback;
