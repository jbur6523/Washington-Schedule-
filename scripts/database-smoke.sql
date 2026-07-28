\set ON_ERROR_STOP on

begin;

insert into public.hospitals (id, name)
values ('00000000-0000-0000-0000-000000000001', 'WHHS Audit Hospital');

insert into public.departments (id, hospital_id, name, timezone)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Respiratory Audit',
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
values
  (
    '11000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'lead@audit.invalid',
    '',
    now(),
    now(),
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'icu@audit.invalid',
    '',
    now(),
    now(),
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'staff@audit.invalid',
    '',
    now(),
    now(),
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'inactive@audit.invalid',
    '',
    now(),
    now(),
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'admin2@audit.invalid',
    '',
    now(),
    now(),
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000006',
    'authenticated',
    'authenticated',
    'director@washington-schedule.local',
    '',
    now(),
    now(),
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000007',
    'authenticated',
    'authenticated',
    'competitor@audit.invalid',
    '',
    now(),
    now(),
    now()
  ),
  (
    '11000000-0000-0000-0000-000000000008',
    'authenticated',
    'authenticated',
    'unknown@washington-schedule.local',
    '',
    now(),
    now(),
    now()
  );

insert into public.profiles (id, auth_user_id, display_name, email)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'Audit Lead',
    'lead@audit.invalid'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000002',
    'Audit ICU',
    'icu@audit.invalid'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000003',
    'Audit Staff',
    'staff@audit.invalid'
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    '11000000-0000-0000-0000-000000000004',
    'Audit Inactive',
    'inactive@audit.invalid'
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    '11000000-0000-0000-0000-000000000005',
    'Audit Second Admin',
    'admin2@audit.invalid'
  );

insert into public.department_memberships (department_id, profile_id, role)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'admin'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'staff'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000003',
    'staff'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    'staff'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000005',
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
values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'Audit Lead',
    'auld',
    'auld',
    'admin',
    'none',
    'full_time',
    'day_shift',
    true,
    now()
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000002',
    'Audit ICU',
    'auic',
    'auic',
    'staff',
    'icu_command_center',
    'full_time',
    'rt_aide',
    true,
    now()
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000003',
    'Audit Staff',
    'aust',
    'aust',
    'staff',
    'none',
    'per_diem',
    'night_shift',
    true,
    now()
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    '11000000-0000-0000-0000-000000000004',
    'Audit Inactive',
    'auin',
    'auin',
    'staff',
    'none',
    'per_diem',
    'night_shift',
    false,
    now()
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000005',
    '11000000-0000-0000-0000-000000000005',
    'Audit Second Admin',
    'aud2',
    'aud2',
    'admin',
    'none',
    'full_time',
    'day_shift',
    true,
    now()
  ),
  (
    '30000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    null,
    null,
    'Audit Username Claim',
    '  DiReCtOr  ',
    'malicious-client-value',
    'staff',
    'none',
    'per_diem',
    'night_shift',
    true,
    null
  );

do $$
begin
  if (
    select username_normalized
    from public.staff_profiles
    where id = '30000000-0000-0000-0000-000000000006'
  ) <> 'director' then
    raise exception 'Database username normalization was bypassed';
  end if;

  begin
    insert into public.staff_profiles (
      department_id,
      display_name,
      username,
      username_normalized,
      assigned_role,
      operations_role,
      employment_type,
      home_assignment,
      is_active
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      'Audit Duplicate Username',
      'DIRECTOR',
      'another-client-value',
      'staff',
      'none',
      'per_diem',
      'night_shift',
      true
    );

    raise exception 'Duplicate normalized username was accepted';
  exception
    when unique_violation then null;
  end;
end;
$$;

set local role service_role;

do $$
declare
  claimed record;
begin
  select *
  into claimed
  from public.claim_staff_profile(
    '  DiReCtOr ',
    '11000000-0000-0000-0000-000000000006'
  );

  if claimed.assigned_role <> 'staff'::public.app_role then
    raise exception 'Privileged username elevated the claimed role';
  end if;

  begin
    perform public.claim_staff_profile(
      'director',
      '11000000-0000-0000-0000-000000000007'
    );
    raise exception 'Already claimed username was claimed twice';
  exception
    when raise_exception then
      if sqlerrm <> 'claim_already_completed' then
        raise;
      end if;
  end;

  begin
    perform public.claim_staff_profile(
      'unknown',
      '11000000-0000-0000-0000-000000000008'
    );
    raise exception 'Unknown username created an account';
  exception
    when raise_exception then
      if sqlerrm <> 'claim_not_available' then
        raise;
      end if;
  end;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from public.department_memberships membership
    where membership.profile_id = (
      select staff.profile_id
      from public.staff_profiles staff
      where staff.id = '30000000-0000-0000-0000-000000000006'
    )
      and membership.role = 'staff'::public.app_role
  ) then
    raise exception 'Claim did not inherit the administrator-assigned role';
  end if;
end;
$$;

create temporary table audit_operational_window as
select
  case
    when local_now::time < time '08:00' then local_now::date - 1
    else local_now::date
  end as shift_date,
  case
    when local_now::time >= time '08:00' and local_now::time < time '20:00'
      then 'day'::public.shift_status_shift_type
    else 'night'::public.shift_status_shift_type
  end as shift_type
from (
  select clock_timestamp() at time zone 'America/Los_Angeles' as local_now
) clock_value;

grant select on audit_operational_window to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000004',
  true
);

do $$
begin
  if public.user_is_department_member('10000000-0000-0000-0000-000000000001') then
    raise exception 'Inactive staff retained department access';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000003',
  true
);

do $$
begin
  begin
    insert into public.shift_status_updates (
      department_id,
      shift_date,
      shift_type,
      rts_on,
      rts_required,
      vent_count,
      bipap_count,
      updated_by_staff_profile_id,
      updated_by_name
    )
    select
      '10000000-0000-0000-0000-000000000001',
      shift_date,
      shift_type,
      8,
      8.5,
      99,
      0,
      '30000000-0000-0000-0000-000000000003',
      'Audit Staff'
    from audit_operational_window;

    raise exception 'Regular staff wrote Lead shift status';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000002',
  true
);

insert into public.icu_patients (
  id,
  department_id,
  bed,
  device_type,
  vent_mode,
  is_active,
  created_by_staff_profile_id,
  updated_by_staff_profile_id
)
values (
  '80000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'C220',
  'vent',
  'apvcmv',
  true,
  '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002'
);

insert into public.icu_patients (
  id,
  department_id,
  bed,
  device_type,
  vent_mode,
  is_active,
  created_by_staff_profile_id,
  updated_by_staff_profile_id
)
values (
  '80000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'C221',
  'vent',
  'apvcmv',
  true,
  '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002'
);

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000001',
  true
);

insert into public.shift_status_updates (
  department_id,
  shift_date,
  shift_type,
  rts_on,
  rts_required,
  vent_count,
  bipap_count,
  updated_by_staff_profile_id,
  updated_by_name
)
select
  '10000000-0000-0000-0000-000000000001',
  shift_date,
  shift_type,
  8,
  8.5,
  7,
  1,
  '30000000-0000-0000-0000-000000000003',
  'Forged Attribution'
from audit_operational_window;

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000002',
  true
);

do $$
begin
  if (
    select (vent_count, source) <> (7, 'lead_command_center')
    from public.official_vent_count_updates
    where department_id = '10000000-0000-0000-0000-000000000001'
    order by created_at desc, id desc
    limit 1
  ) then
    raise exception 'Lead vent update did not become official';
  end if;

  if (
    select (
      updated_by_staff_profile_id,
      updated_by_name
    ) <> (
      '30000000-0000-0000-0000-000000000001'::uuid,
      'Audit Lead'
    )
    from public.official_vent_count_updates
    where department_id = '10000000-0000-0000-0000-000000000001'
    order by created_at desc, id desc
    limit 1
  ) then
    raise exception 'Authenticated Lead/Admin spoofed shift attribution';
  end if;
end;
$$;

create temporary table audit_official_row_count as
select count(*)::integer as row_count
from public.official_vent_count_updates
where department_id = '10000000-0000-0000-0000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000002',
  true
);

update public.icu_patients
set
  vent_mode = 'scmv',
  updated_by_staff_profile_id = '30000000-0000-0000-0000-000000000002'
where id = '80000000-0000-0000-0000-000000000001';

do $$
begin
  if (
    select count(*)::integer
    from public.official_vent_count_updates
    where department_id = '10000000-0000-0000-0000-000000000001'
  ) <> (select row_count from audit_official_row_count) then
    raise exception 'Unrelated ICU edit published an official vent update';
  end if;
end;
$$;

insert into public.icu_patients (
  id,
  department_id,
  bed,
  device_type,
  vent_mode,
  is_active,
  created_by_staff_profile_id,
  updated_by_staff_profile_id
)
values (
  '80000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'C222',
  'vent',
  'apvcmv',
  true,
  '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002'
);

do $$
begin
  if (
    select (vent_count, source) <> (3, 'icu_command_center')
    from public.official_vent_count_updates
    where department_id = '10000000-0000-0000-0000-000000000001'
    order by created_at desc, id desc
    limit 1
  ) then
    raise exception 'ICU tracked count change did not become official';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000001',
  true
);

insert into public.shift_status_updates (
  department_id,
  shift_date,
  shift_type,
  rts_on,
  rts_required,
  vent_count,
  bipap_count,
  updated_by_staff_profile_id,
  updated_by_name
)
select
  '10000000-0000-0000-0000-000000000001',
  shift_date,
  shift_type,
  9,
  9,
  5,
  1,
  '30000000-0000-0000-0000-000000000001',
  'Audit Lead'
from audit_operational_window;

create temporary table audit_after_lead_count as
select count(*)::integer as row_count
from public.official_vent_count_updates
where department_id = '10000000-0000-0000-0000-000000000001';

insert into public.shift_status_updates (
  department_id,
  shift_date,
  shift_type,
  rts_on,
  rts_required,
  vent_count,
  bipap_count,
  updated_by_staff_profile_id,
  updated_by_name
)
select
  '10000000-0000-0000-0000-000000000001',
  shift_date,
  shift_type,
  10,
  10,
  5,
  2,
  '30000000-0000-0000-0000-000000000001',
  'Audit Lead'
from audit_operational_window;

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000002',
  true
);

do $$
begin
  if (
    select count(*)::integer
    from public.official_vent_count_updates
    where department_id = '10000000-0000-0000-0000-000000000001'
  ) <> (select row_count from audit_after_lead_count) then
    raise exception 'Unrelated Lead save published an official vent update';
  end if;

  if (
    select (vent_count, source) <> (5, 'lead_command_center')
    from public.official_vent_count_updates
    where department_id = '10000000-0000-0000-0000-000000000001'
    order by created_at desc, id desc
    limit 1
  ) then
    raise exception 'Latest Lead vent count was not preserved';
  end if;

  if (
    select count(*) from public.icu_patients
    where department_id = '10000000-0000-0000-0000-000000000001'
      and is_active = true
      and device_type = 'vent'
  ) <> 3 then
    raise exception 'Lead vent update altered ICU tracked patients';
  end if;
end;
$$;

reset role;

insert into public.schedule_versions (
  id,
  department_id,
  label,
  status
)
values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Audit Schedule',
  'published'
);

update public.departments
set active_schedule_version_id = '40000000-0000-0000-0000-000000000001'
where id = '10000000-0000-0000-0000-000000000001';

insert into public.schedule_entries (
  id,
  schedule_version_id,
  department_id,
  staff_profile_id,
  shift_date,
  day_of_week,
  shift_type,
  shift_start,
  shift_end,
  entry_status
)
values (
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000003',
  '2099-01-01',
  'Thursday',
  'day_shift',
  '06:30',
  '19:00',
  'scheduled'
);

insert into public.shift_requests (
  id,
  department_id,
  schedule_entry_id,
  staff_profile_id,
  request_type,
  status,
  created_by
)
values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000003',
  'coverage_requested',
  'active',
  '20000000-0000-0000-0000-000000000003'
);

insert into public.shift_request_offers (
  id,
  department_id,
  shift_request_id,
  offer_type,
  offered_by_staff_profile_id,
  status
)
values
  (
    '70000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'coverage',
    '30000000-0000-0000-0000-000000000002',
    'offered'
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'coverage',
    '30000000-0000-0000-0000-000000000001',
    'offered'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000003',
  true
);

select public.respond_to_shift_request_offer(
  '70000000-0000-0000-0000-000000000001',
  'accepted'
);

do $$
begin
  if (
    select status <> 'resolved'
    from public.shift_requests
    where id = '60000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Accepted offer did not resolve request';
  end if;

  if (
    select status <> 'cancelled'
    from public.shift_request_offers
    where id = '70000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Accepted offer did not cancel competing offer';
  end if;
end;
$$;

select public.save_self_managed_shift(
  '10000000-0000-0000-0000-000000000001',
  'move',
  '50000000-0000-0000-0000-000000000001',
  '2099-01-02',
  'night_shift',
  '18:30',
  '07:00',
  'Audit move'
);

do $$
begin
  if (
    select count(*)
    from public.user_schedule_overrides
    where department_id = '10000000-0000-0000-0000-000000000001'
      and staff_profile_id = '30000000-0000-0000-0000-000000000003'
      and is_active = true
  ) <> 2 then
    raise exception 'Self-managed move did not commit both changes';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000005',
  true
);

update public.staff_profiles
set assigned_role = 'staff'
where id = '30000000-0000-0000-0000-000000000001';

do $$
begin
  if (
    select membership.role
    from public.department_memberships membership
    where membership.profile_id = '20000000-0000-0000-0000-000000000001'
  ) <> 'staff'::public.app_role then
    raise exception 'Staff role change did not synchronize membership';
  end if;

  if not exists (
    select 1
    from public.audit_events audit
    where audit.entity_id = '30000000-0000-0000-0000-000000000001'
      and audit.event_type = 'staff_access_changed'
      and audit.actor_profile_id = '20000000-0000-0000-0000-000000000005'
      and audit.before_json ->> 'assigned_role' = 'admin'
      and audit.after_json ->> 'assigned_role' = 'staff'
  ) then
    raise exception 'Role change audit did not capture actor and before/after roles';
  end if;

  begin
    update public.staff_profiles
    set assigned_role = 'staff'
    where id = '30000000-0000-0000-0000-000000000005';

    raise exception 'Administrator removed their own access';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;

do $$
begin
  begin
    update public.staff_profiles
    set is_active = false
    where id = '30000000-0000-0000-0000-000000000005';

    raise exception 'Final active administrator was disabled';
  exception
    when check_violation then null;
  end;
end;
$$;

rollback;
