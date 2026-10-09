-- Reuse the Schedule identity for ICU access. The membership helper requires
-- a verified auth.uid(), linked active staff profile, and the same department.
-- Existing patient/event RLS and ICU RPCs continue using these helpers.
create or replace function public.user_can_manage_icu_patients(target_department_id uuid)
returns boolean
language sql stable security invoker set search_path = pg_catalog
as $$
  select auth.uid() is not null
    and public.user_is_department_member(target_department_id)
    and exists (
      select 1 from public.staff_profiles staff
      where staff.id = public.current_staff_profile_id(target_department_id)
        and staff.department_id = target_department_id
        and staff.is_active
        and coalesce(staff.operations_role, 'none') <> 'aide'
    );
$$;

create or replace function public.user_can_view_icu_patients(target_department_id uuid)
returns boolean
language sql stable security invoker set search_path = pg_catalog
as $$
  select public.user_can_manage_icu_patients(target_department_id);
$$;

-- Do not retain the previous Lead/Admin alternative: Aide exclusion takes
-- precedence even if an Aide also has an elevated membership role.
create or replace function public.user_can_manage_icu_lifecycle(target_department_id uuid)
returns boolean
language sql stable security invoker set search_path = pg_catalog
as $$
  select public.user_can_manage_icu_patients(target_department_id);
$$;

revoke all on function public.user_can_manage_icu_patients(uuid) from public, anon;
revoke all on function public.user_can_view_icu_patients(uuid) from public, anon;
revoke all on function public.user_can_manage_icu_lifecycle(uuid) from public, anon;
grant execute on function public.user_can_manage_icu_patients(uuid) to authenticated;
grant execute on function public.user_can_view_icu_patients(uuid) to authenticated;
grant execute on function public.user_can_manage_icu_lifecycle(uuid) to authenticated;

-- Apply the same restriction to the legacy ICU summary RPC as to row reads.
create or replace function public.get_current_icu_snapshot_counts(target_department_id uuid)
returns table (vents integer, hfnc integer, bipap integer, cpap integer,
  critical_vents integer, total_active integer, latest_updated_at timestamptz)
language sql stable security invoker set search_path = pg_catalog
as $$
  select count(*) filter (where patient.device_type = 'vent')::integer,
    count(*) filter (where patient.device_type = 'hfnc')::integer,
    count(*) filter (where patient.device_type = 'bipap')::integer,
    count(*) filter (where patient.device_type = 'cpap')::integer,
    count(*) filter (where patient.device_type = 'vent' and patient.is_critical_vent)::integer,
    count(*)::integer, max(patient.updated_at)
  from public.icu_patients patient
  where patient.department_id = target_department_id and patient.is_active
  having public.user_can_view_icu_patients(target_department_id);
$$;
revoke all on function public.get_current_icu_snapshot_counts(uuid) from public, anon;
grant execute on function public.get_current_icu_snapshot_counts(uuid) to authenticated;
