\set ON_ERROR_STOP on

begin;

insert into public.hospitals (id, name)
values ('90000000-0000-0000-0000-000000000001', 'RVU Metrics Test Hospital');

insert into public.departments (id, hospital_id, name, timezone)
values (
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-0000-0000-000000000001',
  'RVU Metrics Test Department',
  'America/Los_Angeles'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '90000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'rvu-metrics-test@audit.invalid',
  '',
  now(),
  now(),
  now()
);

insert into public.profiles (id, auth_user_id, display_name, email)
values (
  '90000000-0000-0000-0000-000000000004',
  '90000000-0000-0000-0000-000000000003',
  'RVU Metrics Test Admin',
  'rvu-metrics-test@audit.invalid'
);

insert into public.department_memberships (department_id, profile_id, role)
values (
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-0000-0000-000000000004',
  'admin'
);

insert into public.staff_profiles (
  id,
  department_id,
  profile_id,
  auth_user_id,
  display_name,
  username,
  username_normalized,
  assigned_role,
  operations_role,
  employment_type,
  home_assignment,
  is_active,
  account_claimed_at
)
values (
  '90000000-0000-0000-0000-000000000005',
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-0000-0000-000000000004',
  '90000000-0000-0000-0000-000000000003',
  'RVU Metrics Test Admin',
  'rvumetricstest',
  'rvumetricstest',
  'admin',
  'none',
  'full_time',
  'day_shift',
  true,
  now()
);

-- This historical row proves that the migration and current-window saves do
-- not synthesize or overwrite missing historical RVUs.
insert into public.shift_status_updates (
  department_id,
  shift_date,
  shift_type,
  rts_on,
  rts_required,
  bipap_count,
  updated_by_staff_profile_id,
  updated_by_name
)
values (
  '90000000-0000-0000-0000-000000000002',
  current_date - 30,
  'day',
  7,
  6.5,
  0,
  '90000000-0000-0000-0000-000000000005',
  'RVU Metrics Test Admin'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000003',
  true
);

select public.save_shift_status_update(
  pg_catalog.jsonb_build_object(
    'department_id', '90000000-0000-0000-0000-000000000002',
    'shift_date', reporting_window.shift_date,
    'shift_type', reporting_window.shift_type,
    'rts_on', 8,
    'rts_required', 99,
    'rvu_total', 188.65,
    'bipap_count', 2,
    'c_section_count', 1,
    'vaginal_delivery_count', 0,
    'cabg_count', 0,
    'bronch_count', 0,
    'sputum_induction_count', 0,
    'other_procedure_count', 0,
    'updated_by_staff_profile_id', '90000000-0000-0000-0000-000000000005',
    'updated_by_name', 'Attempted spoof'
  )
)
from public.current_shift_reporting_window() reporting_window;

-- A procedure-only correction intentionally omits RVUs and RTs On Shift.
select public.save_shift_status_update(
  pg_catalog.jsonb_build_object(
    'department_id', '90000000-0000-0000-0000-000000000002',
    'shift_date', reporting_window.shift_date,
    'shift_type', reporting_window.shift_type,
    'c_section_count', 2,
    'updated_by_staff_profile_id', '90000000-0000-0000-0000-000000000005',
    'updated_by_name', 'Attempted spoof'
  )
)
from public.current_shift_reporting_window() reporting_window;

do $$
declare
  active_window record;
  saved_update public.shift_status_updates%rowtype;
  current_row_count integer;
begin
  select * into active_window
  from public.current_shift_reporting_window();

  select count(*) into current_row_count
  from public.shift_status_updates update_row
  where update_row.department_id = '90000000-0000-0000-0000-000000000002'
    and update_row.shift_date = active_window.shift_date
    and update_row.shift_type = active_window.shift_type;

  if current_row_count <> 1 then
    raise exception 'Expected one canonical current-window row, found %', current_row_count;
  end if;

  select update_row.* into saved_update
  from public.shift_status_updates update_row
  where update_row.department_id = '90000000-0000-0000-0000-000000000002'
    and update_row.shift_date = active_window.shift_date
    and update_row.shift_type = active_window.shift_type;

  if saved_update.rvu_total is distinct from 188.65::numeric
     or saved_update.rts_required is distinct from 7.0::numeric
     or saved_update.rts_on is distinct from 8
     or saved_update.c_section_count is distinct from 2 then
    raise exception 'Canonical RVU save or partial-update preservation failed';
  end if;

  if saved_update.updated_by_name is distinct from 'RVU Metrics Test Admin' then
    raise exception 'Server attribution was not enforced';
  end if;

  if exists (
    select 1
    from public.shift_status_updates historical
    where historical.department_id = '90000000-0000-0000-0000-000000000002'
      and historical.shift_date = current_date - 30
      and historical.rvu_total is not null
  ) then
    raise exception 'Historical NULL RVU was modified';
  end if;
end;
$$;

do $$
declare
  active_window record;
begin
  select * into active_window
  from public.current_shift_reporting_window();

  begin
    perform public.save_shift_status_update(
      pg_catalog.jsonb_build_object(
        'department_id', '90000000-0000-0000-0000-000000000002',
        'shift_date', active_window.shift_date,
        'shift_type', active_window.shift_type,
        'rvu_total', -1,
        'updated_by_staff_profile_id', '90000000-0000-0000-0000-000000000005',
        'updated_by_name', 'RVU Metrics Test Admin'
      )
    );

    raise exception 'Negative RVUs were accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

rollback;
