alter table public.staff_profiles
  add column if not exists operations_role text not null default 'none';

alter table public.staff_profiles
  drop constraint if exists staff_profiles_operations_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_operations_role_check
  check (operations_role in ('none', 'aide'));
