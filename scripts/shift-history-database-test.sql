\set ON_ERROR_STOP on

begin;

insert into public.hospitals (id, name)
values ('91000000-0000-0000-0000-000000000001', 'Shift History Test Hospital');

insert into public.departments (id, hospital_id, name, timezone)
values (
  '91000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000001',
  'Shift History Test Department',
  'America/Los_Angeles'
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  '91000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'shift-history-test@audit.invalid',
  '',
  now(),
  now(),
  now()
);

insert into public.profiles (id, auth_user_id, display_name, email)
values (
  '91000000-0000-0000-0000-000000000004',
  '91000000-0000-0000-0000-000000000003',
  'Shift History Test Admin',
  'shift-history-test@audit.invalid'
);

insert into public.department_memberships (department_id, profile_id, role)
values (
  '91000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000004',
  'admin'
);

insert into public.staff_profiles (
  id, department_id, profile_id, auth_user_id, display_name, username,
  username_normalized, assigned_role, operations_role, employment_type,
  home_assignment, is_active, account_claimed_at
)
values (
  '91000000-0000-0000-0000-000000000005',
  '91000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000004',
  '91000000-0000-0000-0000-000000000003',
  'Shift History Test Admin',
  'shifthistorytest',
  'shifthistorytest',
  'admin',
  'none',
  'full_time',
  'day_shift',
  true,
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);

select public.save_shift_status_update(
  jsonb_build_object(
    'department_id', '91000000-0000-0000-0000-000000000002',
    'shift_date', options.day_shift_date,
    'shift_type', 'day',
    'rts_on', 7,
    'rvu_total', 176.45,
    'vent_count', 5,
    'bipap_count', 8,
    'c_section_count', 1,
    'updated_by_staff_profile_id', '91000000-0000-0000-0000-000000000005'
  )
)
from public.shift_status_record_options() options;

select public.save_shift_status_update(
  jsonb_build_object(
    'department_id', '91000000-0000-0000-0000-000000000002',
    'shift_date', options.night_shift_date,
    'shift_type', 'night',
    'rts_on', 8,
    'rvu_total', 188.65,
    'vent_count', 4,
    'bipap_count', 6,
    'updated_by_staff_profile_id', '91000000-0000-0000-0000-000000000005'
  )
)
from public.shift_status_record_options() options;

-- A correction to Day must update that canonical record and preserve its
-- omitted staffing and equipment fields.
select public.save_shift_status_update(
  jsonb_build_object(
    'department_id', '91000000-0000-0000-0000-000000000002',
    'shift_date', options.day_shift_date,
    'shift_type', 'day',
    'c_section_count', 2,
    'updated_by_staff_profile_id', '91000000-0000-0000-0000-000000000005'
  )
)
from public.shift_status_record_options() options;

do $$
declare
  options record;
begin
  select * into options from public.shift_status_record_options();

  if (
    select count(*)
    from public.shift_status_updates update_row
    where update_row.department_id = '91000000-0000-0000-0000-000000000002'
      and update_row.is_canonical = true
  ) <> 2 then
    raise exception 'Day/Night canonical saves did not produce exactly two records';
  end if;

  if not exists (
    select 1
    from public.shift_status_updates update_row
    where update_row.department_id = '91000000-0000-0000-0000-000000000002'
      and update_row.shift_date = options.day_shift_date
      and update_row.shift_type = 'day'
      and update_row.rts_on = 7
      and update_row.rvu_total = 176.45
      and update_row.rts_required = 6.5
      and update_row.vent_count = 5
      and update_row.c_section_count = 2
  ) then
    raise exception 'Day correction erased fields or used incorrect RVU rounding';
  end if;

  begin
    insert into public.shift_status_updates (
      department_id, shift_date, shift_type, rts_on, rts_required, bipap_count,
      updated_by_staff_profile_id
    ) values (
      '91000000-0000-0000-0000-000000000002', options.day_shift_date, 'day',
      1, 1, 1, '91000000-0000-0000-0000-000000000005'
    );
    raise exception 'Duplicate canonical shift record was accepted';
  exception when unique_violation then null;
  end;
end;
$$;

select public.capture_phone_list_roster(
  '91000000-0000-0000-0000-000000000002',
  options.day_shift_date,
  'day',
  jsonb_build_array(
    jsonb_build_object(
      'row_key', 'main_4_west',
      'selected_staff_profile_id', '91000000-0000-0000-0000-000000000005',
      'staff_name_snapshot', 'Ignored spoof',
      'phone_number', '6404'
    ),
    jsonb_build_object(
      'row_key', 'main_5w',
      'selected_staff_profile_id', '91000000-0000-0000-0000-000000000005',
      'staff_name_snapshot', 'Ignored spoof',
      'phone_number', '6404'
    ),
    jsonb_build_object(
      'row_key', 'mhp_er',
      'selected_staff_profile_id', null,
      'staff_name_snapshot', 'Agency Therapist',
      'phone_number', '6410'
    )
  )
)
from public.shift_status_record_options() options;

do $$
declare
  snapshot_count integer;
  entry_count integer;
begin
  select count(*), coalesce(sum(entry_totals.entry_count), 0)
  into snapshot_count, entry_count
  from public.phone_list_roster_snapshots snapshot
  cross join lateral (
    select count(*)::integer as entry_count
    from public.phone_list_roster_entries entry
    where entry.roster_snapshot_id = snapshot.id
  ) entry_totals
  where snapshot.department_id = '91000000-0000-0000-0000-000000000002';

  if snapshot_count <> 1 or entry_count <> 2 then
    raise exception 'Initial roster capture did not group one person with multiple areas';
  end if;

  if not exists (
    select 1
    from public.phone_list_roster_entries entry
    join public.phone_list_roster_snapshots snapshot on snapshot.id = entry.roster_snapshot_id
    where snapshot.department_id = '91000000-0000-0000-0000-000000000002'
      and entry.staff_display_name = 'Shift History Test Admin'
      and entry.area_labels = array['4 WEST', '5W']::text[]
  ) then
    raise exception 'Stable staff name or ordered area labels were not captured';
  end if;
end;
$$;

-- Reprint atomically replaces the same snapshot rather than appending.
select public.capture_phone_list_roster(
  '91000000-0000-0000-0000-000000000002',
  options.day_shift_date,
  'day',
  jsonb_build_array(
    jsonb_build_object(
      'row_key', 'mhp_ccu_b',
      'selected_staff_profile_id', '91000000-0000-0000-0000-000000000005',
      'staff_name_snapshot', 'Shift History Test Admin',
      'phone_number', '6404'
    )
  )
)
from public.shift_status_record_options() options;

do $$
begin
  if (
    select count(*)
    from public.phone_list_roster_snapshots snapshot
    where snapshot.department_id = '91000000-0000-0000-0000-000000000002'
  ) <> 1 then
    raise exception 'Reprint duplicated the roster snapshot';
  end if;

  if not exists (
    select 1
    from public.phone_list_roster_entries entry
    join public.phone_list_roster_snapshots snapshot on snapshot.id = entry.roster_snapshot_id
    where snapshot.department_id = '91000000-0000-0000-0000-000000000002'
      and entry.area_labels = array['CCU-B']::text[]
  ) or (
    select count(*)
    from public.phone_list_roster_entries entry
    join public.phone_list_roster_snapshots snapshot on snapshot.id = entry.roster_snapshot_id
    where snapshot.department_id = '91000000-0000-0000-0000-000000000002'
  ) <> 1 then
    raise exception 'Reprint did not atomically replace roster entries';
  end if;

  if (
    select count(*)
    from public.list_shift_history(
      '91000000-0000-0000-0000-000000000002',
      now() - interval '3 days',
      now() + interval '3 days',
      null,
      0,
      13
    )
  ) <> 2 then
    raise exception 'Bounded History query did not return both canonical shifts';
  end if;
end;
$$;

rollback;
