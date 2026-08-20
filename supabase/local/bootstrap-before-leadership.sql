-- Local-only compatibility fixture.
--
-- The already-applied production migration 202608100001 assumes an existing,
-- unclaimed legacy Ramon Hollander staff identity. A clean database has no
-- application data at that point, so local replay inserts the minimum row the
-- historical migration requires. The normal synthetic seed removes this
-- compatibility department data after every replay.

begin;

insert into public.hospitals (id, name)
values ('10000000-0000-0000-0000-000000000001', 'Local Migration Compatibility Hospital');

insert into public.departments (id, hospital_id, name, timezone)
values (
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Local Migration Compatibility Department',
  'America/Los_Angeles'
);

insert into public.staff_profiles (
  id,
  department_id,
  display_name,
  username,
  username_normalized,
  assigned_role,
  operations_role,
  employment_type,
  home_assignment,
  password_reset_required,
  is_active
)
values (
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002',
  'Ramon Hollander',
  'aloha',
  'aloha',
  'staff',
  'none',
  'full_time',
  'day_shift',
  true,
  true
);

commit;
