-- Manual first-admin bootstrap for the Washington-Schedule internal pilot.
-- Review and run this manually after creating the first Supabase Auth user.
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
),
profile as (
  insert into public.profiles (auth_user_id, display_name, email)
  values (
    '00000000-0000-0000-0000-000000000000',
    'First Admin Name',
    'admin@example.invalid'
  )
  returning id
),
membership as (
  insert into public.department_memberships (department_id, profile_id, role)
  select department.id, profile.id, 'admin'
  from department, profile
  returning department_id, profile_id
)
insert into public.staff_profiles (
  department_id,
  profile_id,
  display_name,
  employment_type,
  home_assignment,
  email,
  preferred_contact_method,
  is_active
)
select
  membership.department_id,
  membership.profile_id,
  'First Admin Name',
  'full_time',
  'day_shift',
  'admin@example.invalid',
  'email',
  true
from membership;

commit;
