-- READ ONLY. This proves the intended data state of the unrecorded migration.
begin transaction read only;

select id, department_id, display_name, first_name, last_name,
       employment_type, name_aliases
from public.staff_profiles
where public.normalize_staff_directory_name(display_name) in ('stefanie ortiz', 'stephanie ortiz')
   or (lower(btrim(first_name)) = 'harjot' and lower(btrim(last_name)) = 'kaur')
   or (lower(btrim(first_name)) = 'tom' and lower(btrim(last_name)) = 'macasaet')
order by department_id, last_name, first_name, id;

with checks as (
  select
    not exists (
      select 1 from public.staff_profiles
      where public.normalize_staff_directory_name(display_name) = 'stefanie ortiz'
    ) as no_misspelled_stefanie,
    not exists (
      select 1 from public.staff_profiles
      where lower(btrim(last_name)) = 'ortiz'
        and lower(btrim(first_name)) in ('stefanie', 'stephanie')
        and (
          display_name <> 'Stephanie Ortiz'
          or first_name <> 'Stephanie'
          or not ('Stefanie Ortiz' = any(name_aliases))
        )
    ) as ortiz_correction_complete,
    not exists (
      select 1 from public.staff_profiles
      where lower(btrim(first_name)) = 'harjot'
        and lower(btrim(last_name)) = 'kaur'
        and employment_type <> 'full_time'
    ) as harjot_kaur_full_time,
    not exists (
      select 1 from public.staff_profiles
      where lower(btrim(first_name)) = 'tom'
        and lower(btrim(last_name)) = 'macasaet'
        and employment_type <> 'full_time'
    ) as tom_macasaet_full_time
)
select *,
       no_misspelled_stefanie
       and ortiz_correction_complete
       and harjot_kaur_full_time
       and tom_macasaet_full_time as safe_to_mark_applied
from checks;

rollback;
