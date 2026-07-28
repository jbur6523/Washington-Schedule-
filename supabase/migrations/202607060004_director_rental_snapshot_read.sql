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
      and sp.is_active = true
  );
$$;

grant execute on function public.user_is_department_director(uuid) to authenticated;

drop policy if exists "Directors can read rental snapshot records" on public.rental_records;
create policy "Directors can read rental snapshot records"
  on public.rental_records
  for select
  to authenticated
  using (public.user_is_department_director(department_id));
