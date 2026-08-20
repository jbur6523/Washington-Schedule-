begin;

alter table public.schedule_imports
  add column if not exists target_schedule_version_id uuid references public.schedule_versions(id) on delete set null,
  add column if not exists source_hash text,
  add column if not exists source_label text,
  add column if not exists source_starts_on date,
  add column if not exists source_ends_on date,
  add column if not exists source_row_count integer not null default 0,
  add column if not exists expected_row_count integer not null default 0,
  add column if not exists inserted_count integer not null default 0,
  add column if not exists exact_duplicate_count integer not null default 0,
  add column if not exists excluded_count integer not null default 0,
  add column if not exists conflict_count integer not null default 0,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists verified_at timestamptz,
  add column if not exists result_json jsonb;

alter table public.schedule_imports
  drop constraint if exists schedule_imports_source_hash_format;

alter table public.schedule_imports
  add constraint schedule_imports_source_hash_format
  check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$');

alter table public.schedule_import_rows
  add column if not exists row_type text not null default 'entry',
  add column if not exists source_line text,
  add column if not exists disposition text,
  add column if not exists exclusion_reason text,
  add column if not exists schedule_entry_id uuid references public.schedule_entries(id) on delete set null,
  add column if not exists shift_shortage_id uuid references public.shift_shortages(id) on delete set null,
  add column if not exists shortage_severity public.shift_shortage_severity,
  add column if not exists shortage_message text;

alter table public.schedule_import_rows
  drop constraint if exists schedule_import_rows_row_type_check,
  drop constraint if exists schedule_import_rows_disposition_check,
  drop constraint if exists schedule_import_rows_one_result_target_check;

alter table public.schedule_import_rows
  add constraint schedule_import_rows_row_type_check
    check (row_type in ('entry', 'short_shift')),
  add constraint schedule_import_rows_disposition_check
    check (
      disposition is null
      or disposition in ('inserted', 'exact_duplicate', 'internal_duplicate', 'excluded', 'conflict', 'rejected')
    ),
  add constraint schedule_import_rows_one_result_target_check
    check (not (schedule_entry_id is not null and shift_shortage_id is not null));

create index if not exists schedule_imports_target_version_created_idx
  on public.schedule_imports(target_schedule_version_id, created_at desc);

create unique index if not exists schedule_imports_logical_source_unique
  on public.schedule_imports(department_id, target_schedule_version_id, source_hash)
  where source_hash is not null and target_schedule_version_id is not null;

create index if not exists schedule_import_rows_schedule_entry_idx
  on public.schedule_import_rows(schedule_entry_id)
  where schedule_entry_id is not null;

create index if not exists schedule_import_rows_shift_shortage_idx
  on public.schedule_import_rows(shift_shortage_id)
  where shift_shortage_id is not null;

do $$
begin
  if exists (
    select 1
    from public.schedule_entries entry
    where entry.staff_profile_id is not null
    group by
      entry.schedule_version_id,
      entry.staff_profile_id,
      entry.shift_date,
      entry.shift_type,
      entry.shift_start,
      entry.shift_end,
      entry.entry_status,
      entry.is_shift_lead
    having count(*) > 1
  ) then
    raise exception 'schedule_entries_exact_duplicates_must_be_repaired_before_atomic_import_migration'
      using errcode = '23505';
  end if;
end;
$$;

create unique index if not exists schedule_entries_exact_row_unique
  on public.schedule_entries(
    schedule_version_id,
    staff_profile_id,
    shift_date,
    shift_type,
    shift_start,
    shift_end,
    entry_status,
    is_shift_lead
  )
  where staff_profile_id is not null;

create table if not exists public.schedule_import_attempts (
  id uuid primary key default gen_random_uuid(),
  schedule_import_id uuid not null references public.schedule_imports(id) on delete cascade,
  attempted_by uuid references public.profiles(id) on delete set null,
  outcome text not null,
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint schedule_import_attempts_outcome_check
    check (outcome in ('verified', 'verification_warning'))
);

create index if not exists schedule_import_attempts_import_created_idx
  on public.schedule_import_attempts(schedule_import_id, created_at desc);

alter table public.schedule_import_attempts enable row level security;

drop policy if exists "Department admins can read schedule import attempts"
  on public.schedule_import_attempts;
create policy "Department admins can read schedule import attempts"
  on public.schedule_import_attempts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.schedule_imports schedule_import
      where schedule_import.id = schedule_import_attempts.schedule_import_id
        and public.user_is_department_admin(schedule_import.department_id)
    )
  );

drop policy if exists "Department admins can create schedule import attempts"
  on public.schedule_import_attempts;
create policy "Department admins can create schedule import attempts"
  on public.schedule_import_attempts
  for insert
  to authenticated
  with check (
    schedule_import_attempts.attempted_by = public.current_profile_id()
    and exists (
      select 1
      from public.schedule_imports schedule_import
      where schedule_import.id = schedule_import_attempts.schedule_import_id
        and public.user_is_department_admin(schedule_import.department_id)
    )
  );

grant select, insert on public.schedule_import_attempts to authenticated;

create or replace function public.commit_schedule_import(
  p_expected_schedule_version_id uuid,
  p_source_hash text,
  p_source_label text,
  p_source_starts_on date,
  p_source_ends_on date,
  p_entry_rows jsonb,
  p_shortage_rows jsonb,
  p_audit_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_profile_id uuid;
  target_department_id uuid;
  current_active_version_id uuid;
  target_version public.schedule_versions%rowtype;
  existing_import public.schedule_imports%rowtype;
  import_id uuid;
  entry_row record;
  shortage_row record;
  existing_entry_id uuid;
  existing_shortage_id uuid;
  inserted_entries integer := 0;
  duplicate_entries integer := 0;
  inserted_shortages integer := 0;
  duplicate_shortages integer := 0;
  excluded_rows integer := 0;
  expected_rows integer := 0;
  source_rows integer := 0;
  conflict_rows integer := 0;
  first_affected_date date;
  last_affected_date date;
  final_starts_on date;
  final_ends_on date;
  result jsonb;
begin
  -- Supabase database lint uses plpgsql_check, which cannot infer tables that
  -- are created in a function at runtime. These no-op pragmas provide only the
  -- temporary table shapes for static analysis; the real tables are still
  -- created below in the caller's transaction-local pg_temp schema.
  perform 'PRAGMA:TABLE: import_entry_input (row_index integer, shift_date date, shift_type text, shift_start time, shift_end time, staff_profile_id uuid, raw_staff_name text, entry_status public.schedule_entry_status, is_shift_lead boolean)';
  perform 'PRAGMA:TABLE: import_shortage_input (row_index integer, shift_date date, shift_type text, shift_start time, shift_end time, severity public.shift_shortage_severity, message text)';
  perform 'PRAGMA:TABLE: import_audit_input (row_index integer, row_type text, source_line text, raw_staff_name text, excluded boolean, exclusion_reason text)';
  perform 'PRAGMA:TABLE: import_entry_result (row_index integer, disposition text, schedule_entry_id uuid)';
  perform 'PRAGMA:TABLE: import_shortage_result (row_index integer, disposition text, shift_shortage_id uuid)';

  if p_expected_schedule_version_id is null then
    raise exception 'active_schedule_version_required' using errcode = '22023';
  end if;

  p_source_hash := pg_catalog.lower(pg_catalog.btrim(coalesce(p_source_hash, '')));
  if p_source_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'schedule_import_source_hash_invalid' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_entry_rows, 'null'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_shortage_rows, 'null'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_audit_rows, 'null'::jsonb)) <> 'array' then
    raise exception 'schedule_import_payload_arrays_required' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_array_length(p_entry_rows) > 2000
     or pg_catalog.jsonb_array_length(p_shortage_rows) > 500
     or pg_catalog.jsonb_array_length(p_audit_rows) > 2500 then
    raise exception 'schedule_import_payload_too_large' using errcode = '22023';
  end if;

  actor_profile_id := public.current_profile_id();
  if actor_profile_id is null then
    raise exception 'schedule_import_authentication_required' using errcode = '42501';
  end if;

  select department.id, department.active_schedule_version_id
  into target_department_id, current_active_version_id
  from public.departments department
  join public.schedule_versions requested_version
    on requested_version.id = p_expected_schedule_version_id
   and requested_version.department_id = department.id
  join public.department_memberships membership
    on membership.department_id = department.id
   and membership.profile_id = actor_profile_id
   and membership.role = 'admin'
  join public.staff_profiles staff
   on staff.department_id = department.id
   and staff.profile_id = actor_profile_id
   and staff.is_active = true
  for update of department;

  if target_department_id is null then
    raise exception 'schedule_import_department_admin_required' using errcode = '42501';
  end if;

  if current_active_version_id is distinct from p_expected_schedule_version_id then
    raise exception 'schedule_import_active_version_changed' using errcode = '40001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('schedule-import:' || p_expected_schedule_version_id::text, 0)
  );

  select version.*
  into target_version
  from public.schedule_versions version
  where version.id = p_expected_schedule_version_id
    and version.department_id = target_department_id
    and version.status = 'published'
  for update;

  if not found then
    raise exception 'schedule_import_active_version_changed' using errcode = '40001';
  end if;

  -- RPC calls normally run in separate transactions. Dropping any prior
  -- session-local staging tables also makes retries safe in database test
  -- transactions and connection-pool sessions that reuse one transaction.
  drop table if exists pg_temp.import_entry_input;
  drop table if exists pg_temp.import_shortage_input;
  drop table if exists pg_temp.import_audit_input;
  drop table if exists pg_temp.import_entry_result;
  drop table if exists pg_temp.import_shortage_result;

  create temporary table import_entry_input (
    row_index integer primary key,
    shift_date date not null,
    shift_type text not null,
    shift_start time not null,
    shift_end time not null,
    staff_profile_id uuid not null,
    raw_staff_name text,
    entry_status public.schedule_entry_status not null,
    is_shift_lead boolean not null
  ) on commit drop;

  create temporary table import_shortage_input (
    row_index integer primary key,
    shift_date date not null,
    shift_type text not null,
    shift_start time not null,
    shift_end time not null,
    severity public.shift_shortage_severity not null,
    message text
  ) on commit drop;

  create temporary table import_audit_input (
    row_index integer primary key,
    row_type text not null,
    source_line text,
    raw_staff_name text,
    excluded boolean not null,
    exclusion_reason text
  ) on commit drop;

  create temporary table import_entry_result (
    row_index integer primary key,
    disposition text not null,
    schedule_entry_id uuid not null
  ) on commit drop;

  create temporary table import_shortage_result (
    row_index integer primary key,
    disposition text not null,
    shift_shortage_id uuid not null
  ) on commit drop;

  insert into import_entry_input (
    row_index,
    shift_date,
    shift_type,
    shift_start,
    shift_end,
    staff_profile_id,
    raw_staff_name,
    entry_status,
    is_shift_lead
  )
  select
    parsed.row_index,
    parsed.shift_date::date,
    pg_catalog.btrim(parsed.shift_type),
    parsed.shift_start::time,
    parsed.shift_end::time,
    parsed.staff_profile_id,
    nullif(pg_catalog.btrim(parsed.raw_staff_name), ''),
    parsed.entry_status::public.schedule_entry_status,
    coalesce(parsed.is_shift_lead, false)
  from pg_catalog.jsonb_to_recordset(p_entry_rows) as parsed(
    row_index integer,
    shift_date text,
    shift_type text,
    shift_start text,
    shift_end text,
    staff_profile_id uuid,
    raw_staff_name text,
    entry_status text,
    is_shift_lead boolean
  );

  insert into import_shortage_input (
    row_index,
    shift_date,
    shift_type,
    shift_start,
    shift_end,
    severity,
    message
  )
  select
    parsed.row_index,
    parsed.shift_date::date,
    pg_catalog.btrim(parsed.shift_type),
    parsed.shift_start::time,
    parsed.shift_end::time,
    parsed.severity::public.shift_shortage_severity,
    nullif(pg_catalog.left(pg_catalog.btrim(parsed.message), 140), '')
  from pg_catalog.jsonb_to_recordset(p_shortage_rows) as parsed(
    row_index integer,
    shift_date text,
    shift_type text,
    shift_start text,
    shift_end text,
    severity text,
    message text
  );

  insert into import_audit_input (
    row_index,
    row_type,
    source_line,
    raw_staff_name,
    excluded,
    exclusion_reason
  )
  select
    parsed.row_index,
    pg_catalog.btrim(parsed.row_type),
    pg_catalog.left(parsed.source_line, 1000),
    nullif(pg_catalog.btrim(parsed.raw_staff_name), ''),
    coalesce(parsed.excluded, false),
    nullif(pg_catalog.left(pg_catalog.btrim(parsed.exclusion_reason), 500), '')
  from pg_catalog.jsonb_to_recordset(p_audit_rows) as parsed(
    row_index integer,
    row_type text,
    source_line text,
    raw_staff_name text,
    excluded boolean,
    exclusion_reason text
  );

  if exists (
    select 1
    from import_audit_input audit
    where audit.row_type not in ('entry', 'short_shift')
  ) then
    raise exception 'schedule_import_audit_row_type_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from import_entry_input entry
    where entry.shift_type not in ('day_shift', 'night_shift', 'pft', 'pulmonary_rehab', 'rt_aide', 'flexible')
       or entry.shift_start = entry.shift_end
  ) then
    raise exception 'schedule_import_entry_value_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from import_shortage_input shortage
    where shortage.shift_type not in ('day_shift', 'night_shift', 'pft', 'pulmonary_rehab', 'rt_aide', 'flexible')
       or shortage.shift_start = shortage.shift_end
  ) then
    raise exception 'schedule_import_shortage_value_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from import_entry_input entry
    left join public.staff_profiles staff
      on staff.id = entry.staff_profile_id
     and staff.department_id = target_department_id
     and staff.is_active = true
    where staff.id is null
  ) then
    raise exception 'schedule_import_staff_profile_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from import_entry_input entry
    group by
      entry.staff_profile_id,
      entry.shift_date,
      entry.shift_type,
      entry.shift_start,
      entry.shift_end,
      entry.entry_status,
      entry.is_shift_lead
    having count(*) > 1
  ) then
    raise exception 'schedule_import_internal_exact_duplicates_unresolved' using errcode = '22023';
  end if;

  if exists (
    select 1
    from import_entry_input entry
    group by entry.staff_profile_id, entry.shift_date, entry.shift_type
    having count(*) > 1
  ) then
    raise exception 'schedule_import_internal_conflicts_unresolved' using errcode = '22023';
  end if;

  if exists (
    select 1
    from import_shortage_input shortage
    group by shortage.shift_date, shortage.shift_type, shortage.shift_start, shortage.shift_end
    having count(*) > 1
  ) then
    raise exception 'schedule_import_internal_shortage_duplicates_unresolved' using errcode = '22023';
  end if;

  source_rows := (select count(*) from import_audit_input);
  expected_rows := (select count(*) from import_entry_input) + (select count(*) from import_shortage_input);
  excluded_rows := (select count(*) from import_audit_input where excluded);

  if source_rows <> expected_rows + excluded_rows then
    raise exception 'schedule_import_audit_row_count_mismatch' using errcode = '22023';
  end if;

  if exists (
    select 1
    from import_entry_input entry
    where not exists (
      select 1
      from import_audit_input audit
      where audit.row_index = entry.row_index
        and audit.row_type = 'entry'
        and not audit.excluded
    )
  ) or exists (
    select 1
    from import_shortage_input shortage
    where not exists (
      select 1
      from import_audit_input audit
      where audit.row_index = shortage.row_index
        and audit.row_type = 'short_shift'
        and not audit.excluded
    )
  ) then
    raise exception 'schedule_import_audit_identity_mismatch' using errcode = '22023';
  end if;

  select count(*)
  into conflict_rows
  from import_entry_input entry
  where exists (
    select 1
    from public.schedule_entries existing
    where existing.schedule_version_id = target_version.id
      and existing.staff_profile_id = entry.staff_profile_id
      and existing.shift_date = entry.shift_date
      and existing.shift_type = entry.shift_type
      and not (
        existing.shift_start = entry.shift_start
        and existing.shift_end = entry.shift_end
        and existing.entry_status = entry.entry_status
        and existing.is_shift_lead = entry.is_shift_lead
      )
  );

  conflict_rows := conflict_rows + (
    select count(*)
    from import_shortage_input shortage
    where exists (
      select 1
      from public.shift_shortages existing
      where existing.schedule_version_id = target_version.id
        and existing.shift_date = shortage.shift_date
        and existing.shift_type = shortage.shift_type
        and existing.shift_start = shortage.shift_start
        and existing.shift_end = shortage.shift_end
        and existing.status = 'active'
        and not (
          existing.severity = shortage.severity
          and coalesce(existing.message, '') = coalesce(shortage.message, '')
        )
    )
  );

  if conflict_rows > 0 then
    raise exception 'schedule_import_conflicts:%', conflict_rows using errcode = '40001';
  end if;

  select schedule_import.*
  into existing_import
  from public.schedule_imports schedule_import
  where schedule_import.department_id = target_department_id
    and schedule_import.target_schedule_version_id = target_version.id
    and schedule_import.source_hash = p_source_hash
  for update;

  if found then
    import_id := existing_import.id;
    update public.schedule_imports schedule_import
    set
      status = 'uploaded',
      source_label = nullif(pg_catalog.left(pg_catalog.btrim(p_source_label), 200), ''),
      source_starts_on = p_source_starts_on,
      source_ends_on = p_source_ends_on,
      source_row_count = source_rows,
      expected_row_count = expected_rows,
      excluded_count = excluded_rows,
      conflict_count = 0,
      attempt_count = schedule_import.attempt_count + 1,
      approved_by = null,
      approved_at = null,
      verified_at = null
    where schedule_import.id = import_id;
  else
    insert into public.schedule_imports (
      department_id,
      target_schedule_version_id,
      status,
      source_filename,
      source_hash,
      source_label,
      source_starts_on,
      source_ends_on,
      source_row_count,
      expected_row_count,
      excluded_count,
      conflict_count,
      attempt_count,
      created_by
    )
    values (
      target_department_id,
      target_version.id,
      'uploaded',
      'Schedule Code',
      p_source_hash,
      nullif(pg_catalog.left(pg_catalog.btrim(p_source_label), 200), ''),
      p_source_starts_on,
      p_source_ends_on,
      source_rows,
      expected_rows,
      excluded_rows,
      0,
      1,
      actor_profile_id
    )
    returning id into import_id;
  end if;

  for entry_row in
    select * from import_entry_input order by row_index
  loop
    existing_entry_id := null;

    select existing.id
    into existing_entry_id
    from public.schedule_entries existing
    where existing.schedule_version_id = target_version.id
      and existing.staff_profile_id = entry_row.staff_profile_id
      and existing.shift_date = entry_row.shift_date
      and existing.shift_type = entry_row.shift_type
      and existing.shift_start = entry_row.shift_start
      and existing.shift_end = entry_row.shift_end
      and existing.entry_status = entry_row.entry_status
      and existing.is_shift_lead = entry_row.is_shift_lead;

    if existing_entry_id is not null then
      duplicate_entries := duplicate_entries + 1;
      insert into import_entry_result values (entry_row.row_index, 'exact_duplicate', existing_entry_id);
    else
      insert into public.schedule_entries (
        schedule_version_id,
        department_id,
        staff_profile_id,
        shift_date,
        day_of_week,
        shift_type,
        shift_start,
        shift_end,
        entry_status,
        is_shift_lead
      )
      values (
        target_version.id,
        target_department_id,
        entry_row.staff_profile_id,
        entry_row.shift_date,
        pg_catalog.to_char(entry_row.shift_date, 'FMDay'),
        entry_row.shift_type,
        entry_row.shift_start,
        entry_row.shift_end,
        entry_row.entry_status,
        entry_row.is_shift_lead
      )
      returning id into existing_entry_id;

      inserted_entries := inserted_entries + 1;
      insert into import_entry_result values (entry_row.row_index, 'inserted', existing_entry_id);
    end if;
  end loop;

  for shortage_row in
    select * from import_shortage_input order by row_index
  loop
    existing_shortage_id := null;

    select existing.id
    into existing_shortage_id
    from public.shift_shortages existing
    where existing.schedule_version_id = target_version.id
      and existing.shift_date = shortage_row.shift_date
      and existing.shift_type = shortage_row.shift_type
      and existing.shift_start = shortage_row.shift_start
      and existing.shift_end = shortage_row.shift_end
      and existing.status = 'active'
      and existing.severity = shortage_row.severity
      and coalesce(existing.message, '') = coalesce(shortage_row.message, '');

    if existing_shortage_id is not null then
      duplicate_shortages := duplicate_shortages + 1;
      insert into import_shortage_result values (shortage_row.row_index, 'exact_duplicate', existing_shortage_id);
    else
      insert into public.shift_shortages (
        schedule_version_id,
        department_id,
        shift_date,
        shift_type,
        shift_start,
        shift_end,
        severity,
        status,
        message,
        created_by
      )
      values (
        target_version.id,
        target_department_id,
        shortage_row.shift_date,
        shortage_row.shift_type,
        shortage_row.shift_start,
        shortage_row.shift_end,
        shortage_row.severity,
        'active',
        shortage_row.message,
        actor_profile_id
      )
      returning id into existing_shortage_id;

      inserted_shortages := inserted_shortages + 1;
      insert into import_shortage_result values (shortage_row.row_index, 'inserted', existing_shortage_id);
    end if;
  end loop;

  select min(affected.shift_date), max(affected.shift_date)
  into first_affected_date, last_affected_date
  from (
    select entry.shift_date from import_entry_input entry
    union all
    select shortage.shift_date from import_shortage_input shortage
  ) affected;

  if first_affected_date is not null then
    update public.schedule_versions version
    set
      starts_on = case
        when version.starts_on is null then first_affected_date
        else least(version.starts_on, first_affected_date)
      end,
      ends_on = case
        when version.ends_on is null then last_affected_date
        else greatest(version.ends_on, last_affected_date)
      end
    where version.id = target_version.id
    returning version.starts_on, version.ends_on into final_starts_on, final_ends_on;
  else
    final_starts_on := target_version.starts_on;
    final_ends_on := target_version.ends_on;
  end if;

  insert into public.schedule_import_rows (
    schedule_import_id,
    row_index,
    row_type,
    source_line,
    shift_date,
    day_of_week,
    shift_type,
    shift_start,
    shift_end,
    shift_time,
    raw_staff_name,
    matched_staff_profile_id,
    employment_type,
    status,
    notes,
    confidence,
    needs_review,
    validation_status,
    is_shift_lead,
    disposition,
    exclusion_reason,
    schedule_entry_id,
    shift_shortage_id,
    shortage_severity,
    shortage_message,
    removed_at
  )
  select
    import_id,
    audit.row_index,
    audit.row_type,
    audit.source_line,
    coalesce(entry.shift_date, shortage.shift_date),
    case
      when coalesce(entry.shift_date, shortage.shift_date) is null then null
      else pg_catalog.to_char(coalesce(entry.shift_date, shortage.shift_date), 'FMDay')
    end,
    coalesce(entry.shift_type, shortage.shift_type),
    coalesce(entry.shift_start, shortage.shift_start),
    coalesce(entry.shift_end, shortage.shift_end),
    case
      when coalesce(entry.shift_start, shortage.shift_start) is null then null
      else pg_catalog.to_char(coalesce(entry.shift_start, shortage.shift_start), 'HH24:MI')
        || '-' || pg_catalog.to_char(coalesce(entry.shift_end, shortage.shift_end), 'HH24:MI')
    end,
    coalesce(entry.raw_staff_name, audit.raw_staff_name),
    entry.staff_profile_id,
    staff.employment_type,
    entry.entry_status,
    audit.exclusion_reason,
    case when entry.staff_profile_id is null then null else 1.00 end,
    false,
    case when audit.excluded then 'Excluded' else 'Verified' end,
    coalesce(entry.is_shift_lead, false),
    case
      when audit.excluded then 'excluded'
      when audit.row_type = 'entry' then entry_result.disposition
      else shortage_result.disposition
    end,
    audit.exclusion_reason,
    entry_result.schedule_entry_id,
    shortage_result.shift_shortage_id,
    shortage.severity,
    shortage.message,
    case when audit.excluded then pg_catalog.clock_timestamp() else null end
  from import_audit_input audit
  left join import_entry_input entry
    on entry.row_index = audit.row_index and audit.row_type = 'entry'
  left join import_shortage_input shortage
    on shortage.row_index = audit.row_index and audit.row_type = 'short_shift'
  left join import_entry_result entry_result
    on entry_result.row_index = audit.row_index
  left join import_shortage_result shortage_result
    on shortage_result.row_index = audit.row_index
  left join public.staff_profiles staff
    on staff.id = entry.staff_profile_id
  on conflict (schedule_import_id, row_index) do update
  set
    row_type = excluded.row_type,
    source_line = excluded.source_line,
    shift_date = excluded.shift_date,
    day_of_week = excluded.day_of_week,
    shift_type = excluded.shift_type,
    shift_start = excluded.shift_start,
    shift_end = excluded.shift_end,
    shift_time = excluded.shift_time,
    raw_staff_name = excluded.raw_staff_name,
    matched_staff_profile_id = excluded.matched_staff_profile_id,
    employment_type = excluded.employment_type,
    status = excluded.status,
    notes = excluded.notes,
    confidence = excluded.confidence,
    needs_review = excluded.needs_review,
    validation_status = excluded.validation_status,
    is_shift_lead = excluded.is_shift_lead,
    disposition = excluded.disposition,
    exclusion_reason = excluded.exclusion_reason,
    schedule_entry_id = excluded.schedule_entry_id,
    shift_shortage_id = excluded.shift_shortage_id,
    shortage_severity = excluded.shortage_severity,
    shortage_message = excluded.shortage_message,
    removed_at = excluded.removed_at;

  if inserted_entries + duplicate_entries <> (select count(*) from import_entry_input)
     or inserted_shortages + duplicate_shortages <> (select count(*) from import_shortage_input)
     or expected_rows <> inserted_entries + duplicate_entries + inserted_shortages + duplicate_shortages then
    raise exception 'schedule_import_result_count_mismatch' using errcode = '40001';
  end if;

  if exists (
    select 1
    from import_entry_input entry
    where (
      select count(*)
      from public.schedule_entries existing
      where existing.schedule_version_id = target_version.id
        and existing.staff_profile_id = entry.staff_profile_id
        and existing.shift_date = entry.shift_date
        and existing.shift_type = entry.shift_type
        and existing.shift_start = entry.shift_start
        and existing.shift_end = entry.shift_end
        and existing.entry_status = entry.entry_status
        and existing.is_shift_lead = entry.is_shift_lead
    ) <> 1
  ) then
    raise exception 'schedule_import_entry_verification_failed' using errcode = '40001';
  end if;

  if exists (
    select 1
    from import_shortage_input shortage
    where (
      select count(*)
      from public.shift_shortages existing
      where existing.schedule_version_id = target_version.id
        and existing.shift_date = shortage.shift_date
        and existing.shift_type = shortage.shift_type
        and existing.shift_start = shortage.shift_start
        and existing.shift_end = shortage.shift_end
        and existing.status = 'active'
        and existing.severity = shortage.severity
        and coalesce(existing.message, '') = coalesce(shortage.message, '')
    ) <> 1
  ) then
    raise exception 'schedule_import_shortage_verification_failed' using errcode = '40001';
  end if;

  if (select count(*) from public.schedule_import_rows row where row.schedule_import_id = import_id) <> source_rows then
    raise exception 'schedule_import_audit_verification_failed' using errcode = '40001';
  end if;

  result := pg_catalog.jsonb_build_object(
    'importId', import_id,
    'versionId', target_version.id,
    'sourceHash', p_source_hash,
    'sourceRows', source_rows,
    'expectedRows', expected_rows,
    'insertedEntries', inserted_entries,
    'duplicateEntries', duplicate_entries,
    'insertedShortages', inserted_shortages,
    'duplicateShortages', duplicate_shortages,
    'insertedCount', inserted_entries + inserted_shortages,
    'duplicateCount', duplicate_entries + duplicate_shortages,
    'excludedCount', excluded_rows,
    'conflictCount', 0,
    'firstDate', first_affected_date,
    'lastDate', last_affected_date,
    'startsOn', final_starts_on,
    'endsOn', final_ends_on,
    'verified', true
  );

  update public.schedule_imports schedule_import
  set
    status = 'approved',
    inserted_count = inserted_entries + inserted_shortages,
    exact_duplicate_count = duplicate_entries + duplicate_shortages,
    excluded_count = excluded_rows,
    conflict_count = 0,
    approved_by = actor_profile_id,
    approved_at = pg_catalog.clock_timestamp(),
    verified_at = pg_catalog.clock_timestamp(),
    result_json = result
  where schedule_import.id = import_id;

  insert into public.schedule_import_attempts (
    schedule_import_id,
    attempted_by,
    outcome,
    result_json
  )
  values (import_id, actor_profile_id, 'verified', result);

  return result;
end;
$$;

create or replace function public.verify_schedule_import(p_schedule_import_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  target_import public.schedule_imports%rowtype;
  linked_rows integer;
  verified_rows integer;
  result jsonb;
begin
  select schedule_import.*
  into target_import
  from public.schedule_imports schedule_import
  where schedule_import.id = p_schedule_import_id
    and public.user_is_department_admin(schedule_import.department_id);

  if not found then
    raise exception 'schedule_import_not_found' using errcode = '42501';
  end if;

  select count(*)
  into linked_rows
  from public.schedule_import_rows row
  where row.schedule_import_id = target_import.id
    and row.disposition in ('inserted', 'exact_duplicate');

  select count(*)
  into verified_rows
  from public.schedule_import_rows row
  where row.schedule_import_id = target_import.id
    and row.disposition in ('inserted', 'exact_duplicate')
    and (
      (
        row.row_type = 'entry'
        and exists (
          select 1
          from public.schedule_entries entry
          where entry.id = row.schedule_entry_id
            and entry.schedule_version_id = target_import.target_schedule_version_id
            and entry.staff_profile_id = row.matched_staff_profile_id
            and entry.shift_date = row.shift_date
            and entry.shift_type = row.shift_type
            and entry.shift_start = row.shift_start
            and entry.shift_end = row.shift_end
            and entry.entry_status = row.status
            and entry.is_shift_lead = row.is_shift_lead
        )
      )
      or (
        row.row_type = 'short_shift'
        and exists (
          select 1
          from public.shift_shortages shortage
          where shortage.id = row.shift_shortage_id
            and shortage.schedule_version_id = target_import.target_schedule_version_id
            and shortage.shift_date = row.shift_date
            and shortage.shift_type = row.shift_type
            and shortage.shift_start = row.shift_start
            and shortage.shift_end = row.shift_end
            and shortage.severity = row.shortage_severity
            and coalesce(shortage.message, '') = coalesce(row.shortage_message, '')
            and shortage.status = 'active'
        )
      )
    );

  result := pg_catalog.jsonb_build_object(
    'importId', target_import.id,
    'versionId', target_import.target_schedule_version_id,
    'sourceHash', target_import.source_hash,
    'expectedRows', target_import.expected_row_count,
    'linkedRows', linked_rows,
    'verifiedRows', verified_rows,
    'excludedCount', target_import.excluded_count,
    'verified',
      target_import.status = 'approved'
      and target_import.verified_at is not null
      and linked_rows = target_import.expected_row_count
      and verified_rows = target_import.expected_row_count
  );

  return result;
end;
$$;

revoke all on function public.commit_schedule_import(uuid, text, text, date, date, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.commit_schedule_import(uuid, text, text, date, date, jsonb, jsonb, jsonb)
  to authenticated;

revoke all on function public.verify_schedule_import(uuid)
  from public, anon;
grant execute on function public.verify_schedule_import(uuid)
  to authenticated;

commit;
