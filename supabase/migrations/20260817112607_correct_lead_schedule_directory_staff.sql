begin;

do $$
begin
  if exists (
    select 1
    from public.staff_profiles misspelled
    join public.staff_profiles corrected
      on corrected.department_id = misspelled.department_id
     and corrected.id <> misspelled.id
     and public.normalize_staff_directory_name(corrected.display_name) = 'stephanie ortiz'
    where public.normalize_staff_directory_name(misspelled.display_name) = 'stefanie ortiz'
  ) then
    raise exception 'Cannot correct Stefanie Ortiz because a separate Stephanie Ortiz profile already exists in the same department';
  end if;
end $$;

update public.staff_profiles profile
set
  display_name = 'Stephanie Ortiz',
  first_name = 'Stephanie',
  name_aliases = array(
    select distinct alias_value
    from pg_catalog.unnest(
      coalesce(profile.name_aliases, '{}'::text[]) || array['Stefanie Ortiz']
    ) as alias_value
    where pg_catalog.btrim(alias_value) <> ''
    order by alias_value
  )
where lower(pg_catalog.btrim(profile.last_name)) = 'ortiz'
  and (
    lower(pg_catalog.btrim(profile.first_name)) in ('stefanie', 'stephanie')
    or public.normalize_staff_directory_name(profile.display_name) in ('stefanie ortiz', 'stephanie ortiz')
  );

update public.staff_profiles profile
set employment_type = 'full_time'::public.staff_employment_type
where lower(pg_catalog.btrim(profile.first_name)) = 'harjot'
  and lower(pg_catalog.btrim(profile.last_name)) = 'kaur';

update public.staff_profiles profile
set employment_type = 'full_time'::public.staff_employment_type
where lower(pg_catalog.btrim(profile.first_name)) = 'tom'
  and lower(pg_catalog.btrim(profile.last_name)) = 'macasaet';

commit;
