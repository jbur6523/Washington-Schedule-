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

  if first_clean = 'pawanjit' and last_clean = 'khera' then
    return 'pawk';
  end if;

  return left(last_clean, 3) || left(first_clean, 1);
end;
$$;

update public.staff_profiles
set
  username = 'pawk',
  username_normalized = 'pawk'
where public.normalize_username(display_name) in ('pawanjitkhera', 'pawanjitkherakinty')
  and account_claimed_at is null
  and username_normalized in ('khep', 'khek')
  and not exists (
    select 1
    from public.staff_profiles existing
    where existing.department_id = staff_profiles.department_id
      and existing.username_normalized = 'pawk'
      and existing.id <> staff_profiles.id
  );
