create or replace function public.generated_staff_username_base(display_name text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[];
  first_name text;
  last_name text;
  first_clean text;
  last_clean text;
begin
  parts := regexp_split_to_array(trim(regexp_replace(coalesce(display_name, ''), '[^[:alnum:][:space:]''-]', ' ', 'g')), '\s+');
  first_name := coalesce(parts[1], '');
  last_name := coalesce(parts[array_length(parts, 1)], first_name);
  first_clean := public.normalize_username(first_name);
  last_clean := public.normalize_username(last_name);

  if first_clean = 'bei' and last_clean = 'yi' then
    return 'yibe';
  end if;

  if first_clean = 'reggie' and last_clean = 'jesus' then
    return 'jesr';
  end if;

  if first_clean = 'pawanjit' and last_clean = 'khera' then
    return 'pawk';
  end if;

  if first_clean = 'yiqin' and last_clean = 'meng' then
    return 'yiqm';
  end if;

  if last_clean = 'roberts' and first_clean in ('john', 'marshall') then
    return 'robm';
  end if;

  return left(last_clean, 3) || left(first_clean, 1);
end;
$$;

update public.staff_profiles
set
  username = 'yiqm',
  username_normalized = 'yiqm'
where public.normalize_username(display_name) in ('yiqinmeng', 'maggie', 'yiqinmengmaggie')
  and account_claimed_at is null
  and username_normalized in ('meny', 'menm')
  and not exists (
    select 1
    from public.staff_profiles existing
    where existing.department_id = staff_profiles.department_id
      and existing.username_normalized = 'yiqm'
      and existing.id <> staff_profiles.id
  );

update public.staff_profiles
set
  username = 'robm',
  username_normalized = 'robm'
where public.normalize_username(display_name) in ('johnroberts', 'marshallroberts', 'johnmarshallroberts')
  and account_claimed_at is null
  and username_normalized in ('robj', 'robm')
  and not exists (
    select 1
    from public.staff_profiles existing
    where existing.department_id = staff_profiles.department_id
      and existing.username_normalized = 'robm'
      and existing.id <> staff_profiles.id
  );
