-- Deterministic, synthetic-only local development fixture.
-- Browser login: localadmin / LocalAdmin123!
-- The schedule has exactly 998 rows before 2026-08-23, then 16 on that date.

begin;

-- Remove the minimum identity/department used only to let the historical
-- leadership migration replay on an otherwise empty database. Cascades remove
-- the leadership rows and audit records that migration created for the fixture.
-- Delete staff while the parent department still exists because the existing
-- staff lifecycle trigger records the deletion against that department.
delete from public.staff_profiles
where department_id = '10000000-0000-0000-0000-000000000002';

delete from public.departments
where id = '10000000-0000-0000-0000-000000000002';

delete from public.hospitals
where id = '10000000-0000-0000-0000-000000000001';

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change, phone_change,
  reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, is_super_admin, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'localadmin@washington-schedule.local',
   crypt('LocalAdmin123!', gen_salt('bf')), now(), '', '', '', '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'localstaff@washington-schedule.local',
   crypt('LocalStaff123!', gen_salt('bf')), now(), '', '', '', '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'otheradmin@washington-schedule.local',
   crypt('OtherAdmin123!', gen_salt('bf')), now(), '', '', '', '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now());

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  id, email, id,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003'
);

insert into public.hospitals (id, name)
values ('30000000-0000-0000-0000-000000000001', 'Synthetic Test Hospital');

insert into public.departments (id, hospital_id, name, timezone)
values
  ('30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
   'Synthetic Respiratory Therapy', 'America/Los_Angeles'),
  ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
   'Synthetic Isolated Department', 'America/Los_Angeles');

insert into public.profiles (id, auth_user_id, display_name, email)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'Local Administrator', 'local-admin@example.invalid'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
   'Local Staff Member', 'local-staff@example.invalid'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003',
   'Other Department Administrator', 'other-admin@example.invalid');

insert into public.department_memberships (id, department_id, profile_id, role)
values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000001', 'admin'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000002', 'staff'),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003',
   '40000000-0000-0000-0000-000000000003', 'admin');

insert into public.staff_profiles (
  id, department_id, profile_id, auth_user_id, display_name, first_name,
  last_name, username, username_normalized, employment_type, home_assignment,
  directory_shift, assigned_role, account_claimed_at, is_active
)
select
  md5('local-staff-' || number)::uuid,
  '30000000-0000-0000-0000-000000000002'::uuid,
  case number when 1 then '40000000-0000-0000-0000-000000000001'::uuid
              when 2 then '40000000-0000-0000-0000-000000000002'::uuid end,
  case number when 1 then '20000000-0000-0000-0000-000000000001'::uuid
              when 2 then '20000000-0000-0000-0000-000000000002'::uuid end,
  'Schedule Staff ' || lpad(number::text, 2, '0'),
  'Staff' || lpad(number::text, 2, '0'),
  case when number in (19, 20) then 'Shared' else 'Last' || lpad(number::text, 2, '0') end,
  case number when 1 then 'localadmin' when 2 then 'localstaff'
              else 'staff' || lpad(number::text, 2, '0') end,
  case number when 1 then 'localadmin' when 2 then 'localstaff'
              else 'staff' || lpad(number::text, 2, '0') end,
  case when number % 5 = 0 then 'per_diem'::public.staff_employment_type
       else 'full_time'::public.staff_employment_type end,
  case when number % 2 = 0 then 'night_shift'::public.staff_home_assignment
       else 'day_shift'::public.staff_home_assignment end,
  case when number % 2 = 0 then 'night'::public.staff_directory_shift
       else 'day'::public.staff_directory_shift end,
  case when number = 1 then 'admin'::public.app_role else 'staff'::public.app_role end,
  case when number in (1, 2) then now() end,
  true
from generate_series(1, 20) as number;

insert into public.staff_profiles (
  id, department_id, profile_id, auth_user_id, display_name, first_name,
  last_name, username, username_normalized, employment_type, home_assignment,
  directory_shift, assigned_role, account_claimed_at, is_active
)
values (
  '60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003',
  'Other Department Admin', 'Other', 'Admin', 'otheradmin', 'otheradmin',
  'full_time', 'day_shift', 'day', 'admin', now(), true
);

insert into public.schedule_versions (
  id, department_id, label, starts_on, ends_on, status,
  published_at, published_by, created_by
)
values
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
   'Synthetic 1,000 Row Regression Schedule', '2026-06-01', '2026-08-30', 'published', now(),
   '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003',
   'Other Department Schedule', '2026-08-01', '2026-08-31', 'published', now(),
   '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003');

update public.departments
set active_schedule_version_id = case id
  when '30000000-0000-0000-0000-000000000002'::uuid
    then '70000000-0000-0000-0000-000000000001'::uuid
  else '70000000-0000-0000-0000-000000000002'::uuid
end
where id in (
  '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000003'
);

insert into public.schedule_entries (
  id, schedule_version_id, department_id, staff_profile_id, shift_date,
  day_of_week, shift_type, shift_start, shift_end, entry_status,
  is_shift_lead, created_at
)
select
  md5('earlier-entry-' || number)::uuid,
  '70000000-0000-0000-0000-000000000001'::uuid,
  '30000000-0000-0000-0000-000000000002'::uuid,
  md5('local-staff-' || (((number - 1) % 20) + 1))::uuid,
  '2026-06-01'::date + ((number - 1) / 20)::integer,
  trim(to_char('2026-06-01'::date + ((number - 1) / 20)::integer, 'Day')),
  case when ((number - 1) % 20) < 10 then 'day_shift' else 'night_shift' end,
  case when ((number - 1) % 20) < 10 then '06:30'::time else '18:30'::time end,
  case when ((number - 1) % 20) < 10 then '19:00'::time else '07:00'::time end,
  case when number % 10 = 0 then 'available'::public.schedule_entry_status
       else 'scheduled'::public.schedule_entry_status end,
  number % 97 = 0,
  '2026-08-01 12:00:00+00'::timestamptz + make_interval(secs => number)
from generate_series(1, 998) as number;

insert into public.schedule_entries (
  id, schedule_version_id, department_id, staff_profile_id, shift_date,
  day_of_week, shift_type, shift_start, shift_end, entry_status,
  is_shift_lead, created_at
)
select
  md5('target-entry-' || number)::uuid,
  '70000000-0000-0000-0000-000000000001'::uuid,
  '30000000-0000-0000-0000-000000000002'::uuid,
  md5('local-staff-' || number)::uuid,
  '2026-08-23', 'Sunday', 'day_shift', '06:30', '19:00', 'scheduled', number = 1,
  '2026-08-17 12:00:00+00'::timestamptz + make_interval(secs => number)
from generate_series(1, 16) as number;

insert into public.shift_shortages (
  id, schedule_version_id, department_id, shift_date, shift_type,
  shift_start, shift_end, severity, message, created_by
)
values (
  '80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002', '2026-08-24', 'night_shift',
  '18:30', '07:00', 'short', 'Synthetic short shift alert',
  '40000000-0000-0000-0000-000000000001'
);

insert into public.user_schedule_overrides (
  id, department_id, staff_profile_id, override_type, shift_date,
  shift_type, shift_start, shift_end, note
)
values (
  '90000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
  md5('local-staff-2')::uuid, 'add_available', '2026-08-25', 'day_shift',
  '06:30', '19:00', 'Synthetic availability'
);

insert into public.shift_requests (
  id, department_id, schedule_entry_id, staff_profile_id,
  request_type, note, created_by
)
values (
  'a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
  md5('target-entry-2')::uuid, md5('local-staff-2')::uuid,
  'coverage_requested', 'Synthetic coverage request',
  '40000000-0000-0000-0000-000000000002'
);

insert into public.shift_request_offers (
  id, department_id, shift_request_id, offer_type,
  offered_by_staff_profile_id, note
)
values (
  'b0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001', 'coverage',
  md5('local-staff-3')::uuid, 'Synthetic coverage offer'
);

commit;
