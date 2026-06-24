-- Manual first-admin bootstrap for the Washington-Schedule internal pilot.
-- Review and run this manually before the first admin claims username burj.
-- This is not an automatic migration.
-- Do not include real phone numbers unless approved by hospital policy.

begin;

with hospital as (
  insert into public.hospitals (name)
  values ('Washington Hospital')
  returning id
),
department as (
  insert into public.departments (hospital_id, name, timezone)
  select id, 'Respiratory Department', 'America/Los_Angeles'
  from hospital
  returning id
)
insert into public.staff_profiles (
  department_id,
  display_name,
  username,
  username_normalized,
  assigned_role,
  employment_type,
  home_assignment,
  preferred_contact_method,
  is_active
)
select
  department.id,
  'Jonathan Burdick',
  'burj',
  'burj',
  'admin',
  'full_time',
  'day_shift',
  'app',
  true
from department;

commit;
