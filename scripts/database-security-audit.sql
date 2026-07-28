\set ON_ERROR_STOP on

do $$
declare
  insecure_tables text;
begin
  select string_agg(format('%I.%I', namespace.nspname, relation.relname), ', ')
  into insecure_tables
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and (
      relation.relrowsecurity = false
      or not exists (
        select 1
        from pg_catalog.pg_policy policy
        where policy.polrelid = relation.oid
      )
    );

  if insecure_tables is not null then
    raise exception 'Public tables without RLS and at least one policy: %',
      insecure_tables;
  end if;
end;
$$;

do $$
declare
  unsafe_functions text;
begin
  select string_agg(
    function_row.oid::regprocedure::text,
    ', '
    order by function_row.oid::regprocedure::text
  )
  into unsafe_functions
  from pg_catalog.pg_proc function_row
  join pg_catalog.pg_namespace namespace
    on namespace.oid = function_row.pronamespace
  where namespace.nspname = 'public'
    and function_row.prosecdef
    and not coalesce(
      array_to_string(function_row.proconfig, ',') like
        '%search_path=pg_catalog%',
      false
    );

  if unsafe_functions is not null then
    raise exception 'SECURITY DEFINER functions without a restricted search path: %',
      unsafe_functions;
  end if;
end;
$$;

do $$
declare
  anonymous_tables text;
begin
  select string_agg(relation.oid::regclass::text, ', ' order by relation.oid::regclass::text)
  into anonymous_tables
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and (
      has_table_privilege('anon', relation.oid, 'SELECT')
      or has_table_privilege('anon', relation.oid, 'INSERT')
      or has_table_privilege('anon', relation.oid, 'UPDATE')
      or has_table_privilege('anon', relation.oid, 'DELETE')
    );

  if anonymous_tables is not null then
    raise exception 'Anonymous role has direct public-table access: %',
      anonymous_tables;
  end if;
end;
$$;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.claim_staff_profile(text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.claim_staff_profile(text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Account-claim RPC is callable outside service_role';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.claim_staff_profile(text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Account-claim RPC is unavailable to service_role';
  end if;

  if has_function_privilege(
    'anon',
    'public.reset_staff_account_link(uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.reset_staff_account_link(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Account-reset RPC is callable outside service_role';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.department_memberships',
    'INSERT'
  ) or has_table_privilege(
    'authenticated',
    'public.department_memberships',
    'UPDATE'
  ) or has_table_privilege(
    'authenticated',
    'public.department_memberships',
    'DELETE'
  ) then
    raise exception 'Browser sessions can mutate effective membership roles';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.notification_events',
    'INSERT'
  ) then
    raise exception 'Browser sessions can create arbitrary notifications';
  end if;

  if has_column_privilege(
    'authenticated',
    'public.staff_profiles',
    'auth_user_id',
    'UPDATE'
  ) or has_column_privilege(
    'authenticated',
    'public.staff_profiles',
    'profile_id',
    'UPDATE'
  ) or has_column_privilege(
    'authenticated',
    'public.staff_profiles',
    'account_claimed_at',
    'UPDATE'
  ) then
    raise exception 'Browser sessions can modify protected account linkage';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.profiles',
    'INSERT'
  ) or has_table_privilege(
    'authenticated',
    'public.profiles',
    'UPDATE'
  ) or has_table_privilege(
    'authenticated',
    'public.profiles',
    'DELETE'
  ) then
    raise exception 'Browser sessions can modify authentication profiles';
  end if;
end;
$$;

do $$
declare
  missing_realtime_tables text;
begin
  select string_agg(required_table.table_name, ', ' order by required_table.table_name)
  into missing_realtime_tables
  from unnest(array[
    'departments',
    'shift_status_updates',
    'official_vent_count_updates',
    'icu_patients',
    'icu_patient_events',
    'schedule_versions',
    'schedule_entries',
    'shift_shortages',
    'user_schedule_overrides',
    'shift_requests',
    'shift_request_offers',
    'rental_records',
    'rental_events',
    'department_orders'
  ]) as required_table(table_name)
  where not exists (
    select 1
    from pg_catalog.pg_publication_tables published_table
    where published_table.pubname = 'supabase_realtime'
      and published_table.schemaname = 'public'
      and published_table.tablename = required_table.table_name
  );

  if missing_realtime_tables is not null then
    raise exception 'Operational tables missing from realtime publication: %',
      missing_realtime_tables;
  end if;
end;
$$;

select 'database security audit passed' as result;
