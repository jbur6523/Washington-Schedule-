-- Ruth Deguzman is no longer part of the RT directory displayed to leads.
-- Preserve the canonical staff profile and any linked history; directory_shift
-- is the existing opt-in marker used by the Lead Schedule directory query.
update public.staff_profiles
set directory_shift = null,
    updated_at = now()
where lower(trim(first_name)) = 'ruth'
  and lower(trim(last_name)) = 'deguzman'
  and directory_shift is not null;
