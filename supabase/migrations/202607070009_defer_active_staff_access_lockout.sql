-- Emergency stabilization: defer staff deactivation access lockout.
-- The staff_profiles.is_active column remains for roster display/filtering, but
-- these helpers must not use it as a hard auth/RLS gate until the lockout flow
-- has safer management/IT review and production smoke testing.

create or replace function public.user_is_department_member(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_memberships dm
    where dm.department_id = target_department_id
      and dm.profile_id = public.current_profile_id()
  );
$$;

grant execute on function public.user_is_department_member(uuid) to authenticated;

create or replace function public.user_is_department_admin(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_memberships dm
    where dm.department_id = target_department_id
      and dm.profile_id = public.current_profile_id()
      and dm.role = 'admin'
  );
$$;

grant execute on function public.user_is_department_admin(uuid) to authenticated;

create or replace function public.current_staff_profile_id(target_department_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sp.id
  from public.staff_profiles sp
  where sp.department_id = target_department_id
    and sp.profile_id = public.current_profile_id()
  limit 1;
$$;

grant execute on function public.current_staff_profile_id(uuid) to authenticated;

create or replace function public.user_is_department_lead(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_memberships dm
    where dm.department_id = target_department_id
      and dm.profile_id = public.current_profile_id()
      and dm.role in ('lead', 'admin')
  );
$$;

grant execute on function public.user_is_department_lead(uuid) to authenticated;

create or replace function public.user_is_department_lead_or_admin(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_memberships dm
    where dm.department_id = target_department_id
      and dm.profile_id = public.current_profile_id()
      and dm.role in ('lead', 'admin')
  );
$$;

grant execute on function public.user_is_department_lead_or_admin(uuid) to authenticated;

create or replace function public.user_can_manage_rentals(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_is_department_lead_or_admin(target_department_id)
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.department_id = target_department_id
      and sp.profile_id = public.current_profile_id()
      and sp.operations_role in ('aide', 'command_center')
  );
$$;

grant execute on function public.user_can_manage_rentals(uuid) to authenticated;

create or replace function public.user_is_department_aide(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.department_id = target_department_id
      and sp.profile_id = public.current_profile_id()
      and sp.operations_role = 'aide'
  );
$$;

grant execute on function public.user_is_department_aide(uuid) to authenticated;

create or replace function public.user_is_command_center(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.department_id = target_department_id
      and sp.profile_id = public.current_profile_id()
      and sp.operations_role = 'command_center'
  );
$$;

grant execute on function public.user_is_command_center(uuid) to authenticated;

create or replace function public.user_is_department_director(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.department_id = target_department_id
      and sp.profile_id = public.current_profile_id()
      and sp.operations_role = 'director'
  );
$$;

grant execute on function public.user_is_department_director(uuid) to authenticated;

create or replace function public.user_is_icu_command_center(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.department_id = target_department_id
      and sp.profile_id = public.current_profile_id()
      and sp.operations_role = 'icu_command_center'
  );
$$;

grant execute on function public.user_is_icu_command_center(uuid) to authenticated;
