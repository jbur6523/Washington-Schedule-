alter type public.user_schedule_override_type add value if not exists 'add_available';

create unique index if not exists user_schedule_overrides_one_active_availability
  on public.user_schedule_overrides(
    department_id,
    staff_profile_id,
    shift_date,
    shift_type,
    shift_start,
    shift_end
  )
  where is_active = true
    and override_type::text = 'add_available';
