-- Forward-only repair for create_department_order_with_lines.
--
-- PostgreSQL COALESCE is expression syntax, not a schema-qualified function.
-- The original RPC used pg_catalog.coalesce(...), which raised SQLSTATE 42883
-- during variable initialization before the function body could run.

create or replace function public.create_department_order_with_lines(
  p_order_id uuid,
  p_department_id uuid,
  p_req_number text,
  p_image_storage_path text,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile_id uuid;
  v_staff_profile_id uuid;
  v_created_by_name text;
  v_req_number text := nullif(pg_catalog.btrim(p_req_number), '');
  v_image_storage_path text := nullif(pg_catalog.btrim(p_image_storage_path), '');
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_normalized_lines jsonb := '[]'::jsonb;
  v_existing_lines jsonb;
  v_existing_order public.department_orders%rowtype;
  v_catalog_row public.pmm_catalog%rowtype;
  v_line jsonb;
  v_line_type text;
  v_pmm_number text;
  v_item_name text;
  v_seen_pmms text[] := array[]::text[];
  v_ordinality bigint;
  v_image_prefix text;
begin
  if auth.uid() is null then
    raise exception 'ORDER_ACCESS_DENIED';
  end if;

  if p_order_id is null or p_department_id is null then
    raise exception 'INVALID_ORDER_IDENTITY';
  end if;

  v_profile_id := public.current_profile_id();

  if v_profile_id is null or not public.user_is_department_member(p_department_id) then
    raise exception 'ORDER_ACCESS_DENIED';
  end if;

  if not (
    public.user_is_department_aide(p_department_id)
    or public.user_is_department_admin(p_department_id)
  ) then
    raise exception 'ORDER_ACCESS_DENIED';
  end if;

  v_staff_profile_id := public.current_staff_profile_id(p_department_id);

  select sp.display_name
  into v_created_by_name
  from public.staff_profiles sp
  where sp.id = v_staff_profile_id
    and sp.profile_id = v_profile_id
    and sp.department_id = p_department_id;

  if v_staff_profile_id is null or v_created_by_name is null then
    raise exception 'INVALID_ORDER_ACTOR';
  end if;

  if v_req_number is not null and pg_catalog.char_length(v_req_number) > 80 then
    raise exception 'INVALID_REQ_NUMBER';
  end if;

  if v_notes is not null and pg_catalog.char_length(v_notes) > 280 then
    raise exception 'INVALID_ORDER_NOTES';
  end if;

  if pg_catalog.jsonb_typeof(v_lines) <> 'array' then
    raise exception 'INVALID_ORDER_LINES';
  end if;

  v_image_prefix := p_department_id::text || '/' || p_order_id::text || '/';

  if v_image_storage_path is not null
     and pg_catalog.left(v_image_storage_path, pg_catalog.char_length(v_image_prefix)) <> v_image_prefix then
    raise exception 'INVALID_ORDER_IMAGE_PATH';
  end if;

  for v_line, v_ordinality in
    select input_line.value, input_line.ordinality
    from pg_catalog.jsonb_array_elements(v_lines) with ordinality as input_line(value, ordinality)
  loop
    v_line_type := v_line->>'line_type';

    if v_line_type = 'pmm' then
      v_pmm_number := nullif(pg_catalog.btrim(v_line->>'pmm_number'), '');

      if v_pmm_number is null or v_pmm_number !~ '^[0-9]+$' then
        raise exception 'INVALID_PMM_NUMBER:%', coalesce(v_pmm_number, '');
      end if;

      if v_pmm_number = any(v_seen_pmms) then
        raise exception 'DUPLICATE_PMM:%', v_pmm_number;
      end if;

      v_seen_pmms := pg_catalog.array_append(v_seen_pmms, v_pmm_number);
      v_normalized_lines := v_normalized_lines || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('line_type', 'pmm', 'pmm_number', v_pmm_number)
      );
    elsif v_line_type = 'non_catalog' then
      if nullif(pg_catalog.btrim(v_line->>'pmm_number'), '') is not null then
        raise exception 'INVALID_NON_CATALOG_PMM';
      end if;

      v_item_name := nullif(pg_catalog.btrim(v_line->>'item_name'), '');

      if v_item_name is null or pg_catalog.char_length(v_item_name) > 500 then
        raise exception 'INVALID_NON_CATALOG_ITEM';
      end if;

      v_normalized_lines := v_normalized_lines || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('line_type', 'non_catalog', 'item_name', v_item_name)
      );
    else
      raise exception 'INVALID_ORDER_LINE_TYPE';
    end if;
  end loop;

  if pg_catalog.jsonb_array_length(v_normalized_lines) = 0
     and v_req_number is null
     and v_image_storage_path is null
     and v_notes is null then
    raise exception 'ORDER_CONTENT_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id::text, 0));

  select department_order.*
  into v_existing_order
  from public.department_orders department_order
  where department_order.id = p_order_id;

  if found then
    if v_existing_order.department_id <> p_department_id
       or v_existing_order.created_by_staff_profile_id is distinct from v_staff_profile_id
       or v_existing_order.req_number is distinct from v_req_number
       or v_existing_order.image_storage_path is distinct from v_image_storage_path
       or v_existing_order.image_url is not null
       or v_existing_order.notes is distinct from v_notes then
      raise exception 'ORDER_ID_REPLAY_MISMATCH';
    end if;

    select coalesce(
      pg_catalog.jsonb_agg(
        case
          when order_line.line_type = 'pmm' then
            pg_catalog.jsonb_build_object('line_type', 'pmm', 'pmm_number', order_line.pmm_number)
          else
            pg_catalog.jsonb_build_object('line_type', 'non_catalog', 'item_name', order_line.item_name_snapshot)
        end
        order by order_line.sort_order
      ),
      '[]'::jsonb
    )
    into v_existing_lines
    from public.department_order_lines order_line
    where order_line.order_id = p_order_id;

    if v_existing_lines <> v_normalized_lines then
      raise exception 'ORDER_ID_REPLAY_MISMATCH';
    end if;

    return p_order_id;
  end if;

  insert into public.department_orders (
    id,
    department_id,
    created_by_staff_profile_id,
    created_by_name,
    req_number,
    image_url,
    image_storage_path,
    notes
  )
  values (
    p_order_id,
    p_department_id,
    v_staff_profile_id,
    v_created_by_name,
    v_req_number,
    null,
    v_image_storage_path,
    v_notes
  );

  for v_line, v_ordinality in
    select input_line.value, input_line.ordinality
    from pg_catalog.jsonb_array_elements(v_normalized_lines) with ordinality as input_line(value, ordinality)
  loop
    v_line_type := v_line->>'line_type';

    if v_line_type = 'pmm' then
      v_pmm_number := v_line->>'pmm_number';

      select catalog.*
      into v_catalog_row
      from public.pmm_catalog catalog
      where catalog.pmm_number = v_pmm_number;

      if not found then
        raise exception 'UNKNOWN_PMM:%', v_pmm_number;
      end if;

      if v_catalog_row.catalog_status <> 'active' or not v_catalog_row.is_orderable then
        raise exception 'PMM_NOT_ORDERABLE:%', v_pmm_number;
      end if;

      insert into public.department_order_lines (
        order_id,
        line_type,
        pmm_number,
        item_name_snapshot,
        sort_order
      )
      values (
        p_order_id,
        'pmm',
        v_pmm_number,
        v_catalog_row.item_name,
        (v_ordinality - 1)::integer
      );
    else
      insert into public.department_order_lines (
        order_id,
        line_type,
        pmm_number,
        item_name_snapshot,
        sort_order
      )
      values (
        p_order_id,
        'non_catalog',
        null,
        v_line->>'item_name',
        (v_ordinality - 1)::integer
      );
    end if;
  end loop;

  return p_order_id;
end;
$$;

revoke all on function public.create_department_order_with_lines(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.create_department_order_with_lines(uuid, uuid, text, text, text, jsonb) from anon;
grant execute on function public.create_department_order_with_lines(uuid, uuid, text, text, text, jsonb) to authenticated;
