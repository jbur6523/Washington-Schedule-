create or replace function public.get_current_icu_snapshot_counts(target_department_id uuid)
returns table (
  vents integer,
  hfnc integer,
  bipap integer,
  cpap integer,
  critical_vents integer,
  total_active integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where ip.device_type = 'vent')::integer as vents,
    count(*) filter (where ip.device_type = 'hfnc')::integer as hfnc,
    count(*) filter (where ip.device_type = 'bipap')::integer as bipap,
    count(*) filter (where ip.device_type = 'cpap')::integer as cpap,
    count(*) filter (where ip.device_type = 'vent' and ip.is_critical_vent = true)::integer as critical_vents,
    count(*)::integer as total_active
  from public.icu_patients ip
  where ip.department_id = target_department_id
    and ip.is_active = true
  having public.user_is_department_member(target_department_id);
$$;

grant execute on function public.get_current_icu_snapshot_counts(uuid) to authenticated;
