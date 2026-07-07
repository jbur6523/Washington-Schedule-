create or replace function public.create_pending_rental_delivery(
  target_department_id uuid,
  target_vendor_id uuid,
  target_equipment_type public.rental_equipment_type,
  order_quantity integer,
  p_called_in_at timestamptz,
  actor_staff_profile_id uuid,
  p_order_note text default null
)
returns setof public.rental_records
language plpgsql
security definer
set search_path = public
as $$
declare
  vendor_name text;
  actor_display_name text;
  created_record public.rental_records%rowtype;
  item_index integer;
begin
  if not public.user_can_manage_rentals(target_department_id) then
    raise exception 'RENTAL_ACCESS_DENIED';
  end if;

  select sp.display_name into actor_display_name
  from public.staff_profiles sp
  where sp.id = actor_staff_profile_id
    and sp.department_id = target_department_id
    and sp.is_active = true;

  if actor_display_name is null then
    raise exception 'INVALID_RENTAL_ACTOR';
  end if;

  select rv.name into vendor_name
  from public.rental_vendors rv
  where rv.id = target_vendor_id
    and rv.department_id = target_department_id
    and rv.is_active = true;

  if vendor_name is null then
    raise exception 'INVALID_RENTAL_VENDOR';
  end if;

  if order_quantity is null or order_quantity < 1 or order_quantity > 20 then
    raise exception 'INVALID_RENTAL_QUANTITY';
  end if;

  if p_called_in_at is null then
    raise exception 'INVALID_CALLED_IN_DETAILS';
  end if;

  for item_index in 1..order_quantity loop
    insert into public.rental_records (
      department_id,
      equipment_id,
      vendor_id,
      equipment_type,
      barcode_number,
      serial_number,
      status,
      called_in_at,
      called_in_by_staff_profile_id,
      called_in_by_name,
      checked_in_at,
      checked_in_by_staff_profile_id,
      current_location,
      notes
    )
    values (
      target_department_id,
      null,
      target_vendor_id,
      target_equipment_type,
      null,
      null,
      'pending_delivery'::public.rental_record_status,
      p_called_in_at,
      actor_staff_profile_id,
      actor_display_name,
      null,
      null,
      null,
      nullif(trim(p_order_note), '')
    )
    returning * into created_record;

    insert into public.rental_events (
      department_id,
      rental_record_id,
      equipment_id,
      event_type,
      event_at,
      actor_staff_profile_id,
      event_data
    )
    values (
      target_department_id,
      created_record.id,
      null,
      'called_in'::public.rental_event_type,
      p_called_in_at,
      actor_staff_profile_id,
      jsonb_build_object(
        'equipment_type', target_equipment_type,
        'vendor_id', target_vendor_id,
        'vendor_name', vendor_name,
        'called_in_by', actor_display_name,
        'order_quantity', order_quantity,
        'order_item', item_index,
        'timestamp', p_called_in_at
      )
    );

    return next created_record;
  end loop;
end;
$$;

create or replace function public.confirm_rental_delivery(
  target_record_id uuid,
  actor_staff_profile_id uuid,
  p_delivered_at timestamptz,
  p_barcode_number text,
  p_serial_number text default null,
  p_current_location text default null,
  p_delivery_note text default null,
  p_scan_event_type public.rental_event_type default 'manual_check_in'
)
returns public.rental_records
language plpgsql
security definer
set search_path = public
as $$
declare
  current_record public.rental_records%rowtype;
  updated_record public.rental_records%rowtype;
  equipment_record_id uuid;
  vendor_name text;
begin
  select * into current_record
  from public.rental_records
  where id = target_record_id;

  if current_record.id is null then
    raise exception 'RENTAL_NOT_FOUND';
  end if;

  if not public.user_can_manage_rentals(current_record.department_id) then
    raise exception 'RENTAL_ACCESS_DENIED';
  end if;

  if actor_staff_profile_id is null or not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = actor_staff_profile_id
      and sp.department_id = current_record.department_id
      and sp.is_active = true
  ) then
    raise exception 'INVALID_RENTAL_ACTOR';
  end if;

  if nullif(trim(p_barcode_number), '') is null or p_delivered_at is null then
    raise exception 'INVALID_DELIVERY_DETAILS';
  end if;

  if p_scan_event_type not in ('barcode_scanned'::public.rental_event_type, 'manual_check_in'::public.rental_event_type) then
    raise exception 'INVALID_SCAN_EVENT_TYPE';
  end if;

  if exists (
    select 1
    from public.rental_records rr
    where rr.department_id = current_record.department_id
      and rr.id <> target_record_id
      and rr.status in (
        'active'::public.rental_record_status,
        'delivered'::public.rental_record_status,
        'pickup_requested'::public.rental_record_status,
        'pickup_called'::public.rental_record_status,
        'called_for_pickup'::public.rental_record_status
      )
      and (
        lower(coalesce(rr.barcode_number, '')) = lower(trim(p_barcode_number))
        or lower(coalesce(rr.serial_number, '')) = lower(trim(p_barcode_number))
        or (
          nullif(trim(p_serial_number), '') is not null
          and lower(coalesce(rr.barcode_number, '')) = lower(trim(p_serial_number))
        )
        or (
          nullif(trim(p_serial_number), '') is not null
          and lower(coalesce(rr.serial_number, '')) = lower(trim(p_serial_number))
        )
      )
  ) then
    raise exception 'DUPLICATE_ACTIVE_RENTAL';
  end if;

  select rv.name into vendor_name
  from public.rental_vendors rv
  where rv.id = current_record.vendor_id;

  select re.id into equipment_record_id
  from public.rental_equipment re
  where re.department_id = current_record.department_id
    and (
      lower(coalesce(re.barcode_number, '')) = lower(trim(p_barcode_number))
      or (
        nullif(trim(p_serial_number), '') is not null
        and lower(coalesce(re.serial_number, '')) = lower(trim(p_serial_number))
      )
    )
  order by re.updated_at desc
  limit 1;

  if equipment_record_id is null then
    insert into public.rental_equipment (
      department_id,
      vendor_id,
      equipment_type,
      barcode_number,
      serial_number,
      last_known_company,
      is_active
    )
    values (
      current_record.department_id,
      current_record.vendor_id,
      current_record.equipment_type,
      trim(p_barcode_number),
      nullif(trim(p_serial_number), ''),
      vendor_name,
      true
    )
    returning id into equipment_record_id;
  else
    update public.rental_equipment
    set vendor_id = current_record.vendor_id,
        equipment_type = current_record.equipment_type,
        barcode_number = trim(p_barcode_number),
        serial_number = nullif(trim(p_serial_number), ''),
        last_known_company = vendor_name,
        is_active = true,
        updated_at = now()
    where id = equipment_record_id;
  end if;

  update public.rental_records
  set equipment_id = equipment_record_id,
      barcode_number = trim(p_barcode_number),
      serial_number = nullif(trim(p_serial_number), ''),
      status = 'active'::public.rental_record_status,
      checked_in_at = p_delivered_at,
      checked_in_by_staff_profile_id = actor_staff_profile_id,
      current_location = coalesce(nullif(trim(p_current_location), ''), 'RT Equipment Room'),
      notes = coalesce(nullif(trim(p_delivery_note), ''), notes),
      updated_at = now()
  where id = target_record_id
    and status in ('pending_delivery'::public.rental_record_status, 'called_in'::public.rental_record_status)
  returning * into updated_record;

  if updated_record.id is null then
    raise exception 'STALE_RENTAL_STATE';
  end if;

  insert into public.rental_events (
    department_id,
    rental_record_id,
    equipment_id,
    event_type,
    event_at,
    actor_staff_profile_id,
    event_data
  )
  values
    (
      updated_record.department_id,
      updated_record.id,
      equipment_record_id,
      p_scan_event_type,
      p_delivered_at,
      actor_staff_profile_id,
      jsonb_build_object(
        'barcode_number', updated_record.barcode_number,
        'serial_number', updated_record.serial_number,
        'equipment_type', updated_record.equipment_type,
        'vendor_id', updated_record.vendor_id,
        'vendor_name', vendor_name,
        'current_location', updated_record.current_location,
        'timestamp', p_delivered_at
      )
    ),
    (
      updated_record.department_id,
      updated_record.id,
      equipment_record_id,
      'delivered'::public.rental_event_type,
      p_delivered_at,
      actor_staff_profile_id,
      jsonb_build_object(
        'source', case when p_scan_event_type = 'barcode_scanned'::public.rental_event_type then 'barcode' else 'manual' end,
        'barcode_number', updated_record.barcode_number,
        'serial_number', updated_record.serial_number,
        'equipment_type', updated_record.equipment_type,
        'vendor_id', updated_record.vendor_id,
        'vendor_name', vendor_name,
        'current_location', updated_record.current_location,
        'timestamp', p_delivered_at
      )
    );

  return updated_record;
end;
$$;

create or replace function public.call_rental_pickup(
  target_record_id uuid,
  actor_staff_profile_id uuid,
  p_pickup_called_at timestamptz,
  p_confirmation_number text default null,
  p_pickup_note text default null
)
returns public.rental_records
language plpgsql
security definer
set search_path = public
as $$
declare
  current_record public.rental_records%rowtype;
  updated_record public.rental_records%rowtype;
  vendor_name text;
begin
  select * into current_record
  from public.rental_records
  where id = target_record_id;

  if current_record.id is null then
    raise exception 'RENTAL_NOT_FOUND';
  end if;

  if not public.user_can_manage_rentals(current_record.department_id) then
    raise exception 'RENTAL_ACCESS_DENIED';
  end if;

  if actor_staff_profile_id is null or not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = actor_staff_profile_id
      and sp.department_id = current_record.department_id
      and sp.is_active = true
  ) then
    raise exception 'INVALID_RENTAL_ACTOR';
  end if;

  if p_pickup_called_at is null then
    raise exception 'INVALID_PICKUP_DETAILS';
  end if;

  select rv.name into vendor_name
  from public.rental_vendors rv
  where rv.id = current_record.vendor_id;

  update public.rental_records
  set status = 'pickup_called'::public.rental_record_status,
      pickup_requested_at = p_pickup_called_at,
      pickup_requested_by_staff_profile_id = actor_staff_profile_id,
      pickup_confirmation_number = nullif(trim(p_confirmation_number), ''),
      pickup_request_note = nullif(trim(p_pickup_note), ''),
      updated_at = now()
  where id = target_record_id
    and status in ('active'::public.rental_record_status, 'delivered'::public.rental_record_status)
  returning * into updated_record;

  if updated_record.id is null then
    raise exception 'STALE_RENTAL_STATE';
  end if;

  insert into public.rental_events (
    department_id,
    rental_record_id,
    equipment_id,
    event_type,
    event_at,
    actor_staff_profile_id,
    event_data
  )
  values (
    updated_record.department_id,
    updated_record.id,
    updated_record.equipment_id,
    'pickup_called'::public.rental_event_type,
    p_pickup_called_at,
    actor_staff_profile_id,
    jsonb_build_object(
      'barcode_number', updated_record.barcode_number,
      'serial_number', updated_record.serial_number,
      'equipment_type', updated_record.equipment_type,
      'vendor_id', updated_record.vendor_id,
      'vendor_name', vendor_name,
      'current_location', updated_record.current_location,
      'confirmation_number', nullif(trim(p_confirmation_number), ''),
      'note', nullif(trim(p_pickup_note), ''),
      'timestamp', p_pickup_called_at
    )
  );

  return updated_record;
end;
$$;

create or replace function public.confirm_rental_picked_up(
  target_record_id uuid,
  actor_staff_profile_id uuid,
  p_picked_up_at timestamptz,
  p_pickup_note text default null
)
returns public.rental_records
language plpgsql
security definer
set search_path = public
as $$
declare
  current_record public.rental_records%rowtype;
  updated_record public.rental_records%rowtype;
  vendor_name text;
begin
  select * into current_record
  from public.rental_records
  where id = target_record_id;

  if current_record.id is null then
    raise exception 'RENTAL_NOT_FOUND';
  end if;

  if not public.user_can_manage_rentals(current_record.department_id) then
    raise exception 'RENTAL_ACCESS_DENIED';
  end if;

  if actor_staff_profile_id is null or not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = actor_staff_profile_id
      and sp.department_id = current_record.department_id
      and sp.is_active = true
  ) then
    raise exception 'INVALID_RENTAL_ACTOR';
  end if;

  if p_picked_up_at is null then
    raise exception 'INVALID_PICKUP_DETAILS';
  end if;

  select rv.name into vendor_name
  from public.rental_vendors rv
  where rv.id = current_record.vendor_id;

  update public.rental_records
  set status = 'picked_up'::public.rental_record_status,
      returned_at = p_picked_up_at,
      returned_by_staff_profile_id = actor_staff_profile_id,
      return_note = nullif(trim(p_pickup_note), ''),
      updated_at = now()
  where id = target_record_id
    and status in (
      'pickup_requested'::public.rental_record_status,
      'pickup_called'::public.rental_record_status,
      'called_for_pickup'::public.rental_record_status
    )
  returning * into updated_record;

  if updated_record.id is null then
    raise exception 'STALE_RENTAL_STATE';
  end if;

  insert into public.rental_events (
    department_id,
    rental_record_id,
    equipment_id,
    event_type,
    event_at,
    actor_staff_profile_id,
    event_data
  )
  values (
    updated_record.department_id,
    updated_record.id,
    updated_record.equipment_id,
    'picked_up'::public.rental_event_type,
    p_picked_up_at,
    actor_staff_profile_id,
    jsonb_build_object(
      'barcode_number', updated_record.barcode_number,
      'serial_number', updated_record.serial_number,
      'equipment_type', updated_record.equipment_type,
      'vendor_id', updated_record.vendor_id,
      'vendor_name', vendor_name,
      'current_location', updated_record.current_location,
      'note', nullif(trim(p_pickup_note), ''),
      'timestamp', p_picked_up_at
    )
  );

  return updated_record;
end;
$$;

create or replace function public.cancel_rental_delivery(
  target_record_id uuid,
  actor_staff_profile_id uuid,
  p_cancelled_at timestamptz,
  p_cancellation_note text default null
)
returns public.rental_records
language plpgsql
security definer
set search_path = public
as $$
declare
  current_record public.rental_records%rowtype;
  updated_record public.rental_records%rowtype;
  vendor_name text;
begin
  select * into current_record
  from public.rental_records
  where id = target_record_id;

  if current_record.id is null then
    raise exception 'RENTAL_NOT_FOUND';
  end if;

  if not public.user_can_manage_rentals(current_record.department_id) then
    raise exception 'RENTAL_ACCESS_DENIED';
  end if;

  if actor_staff_profile_id is null or not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = actor_staff_profile_id
      and sp.department_id = current_record.department_id
      and sp.is_active = true
  ) then
    raise exception 'INVALID_RENTAL_ACTOR';
  end if;

  select rv.name into vendor_name
  from public.rental_vendors rv
  where rv.id = current_record.vendor_id;

  update public.rental_records
  set status = 'delivery_cancelled'::public.rental_record_status,
      cancelled_at = p_cancelled_at,
      cancelled_by_staff_profile_id = actor_staff_profile_id,
      cancellation_note = nullif(trim(p_cancellation_note), ''),
      updated_at = now()
  where id = target_record_id
    and status in ('pending_delivery'::public.rental_record_status, 'called_in'::public.rental_record_status)
  returning * into updated_record;

  if updated_record.id is null then
    raise exception 'STALE_RENTAL_STATE';
  end if;

  insert into public.rental_events (
    department_id,
    rental_record_id,
    equipment_id,
    event_type,
    event_at,
    actor_staff_profile_id,
    event_data
  )
  values (
    updated_record.department_id,
    updated_record.id,
    updated_record.equipment_id,
    'delivery_cancelled'::public.rental_event_type,
    p_cancelled_at,
    actor_staff_profile_id,
    jsonb_build_object(
      'barcode_number', updated_record.barcode_number,
      'serial_number', updated_record.serial_number,
      'equipment_type', updated_record.equipment_type,
      'vendor_id', updated_record.vendor_id,
      'vendor_name', vendor_name,
      'current_location', updated_record.current_location,
      'note', nullif(trim(p_cancellation_note), ''),
      'timestamp', p_cancelled_at
    )
  );

  return updated_record;
end;
$$;

create or replace function public.cancel_rental_pickup(
  target_record_id uuid,
  actor_staff_profile_id uuid,
  p_cancelled_at timestamptz,
  p_cancellation_note text default null
)
returns public.rental_records
language plpgsql
security definer
set search_path = public
as $$
declare
  current_record public.rental_records%rowtype;
  updated_record public.rental_records%rowtype;
  vendor_name text;
begin
  select * into current_record
  from public.rental_records
  where id = target_record_id;

  if current_record.id is null then
    raise exception 'RENTAL_NOT_FOUND';
  end if;

  if not public.user_can_manage_rentals(current_record.department_id) then
    raise exception 'RENTAL_ACCESS_DENIED';
  end if;

  if actor_staff_profile_id is null or not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = actor_staff_profile_id
      and sp.department_id = current_record.department_id
      and sp.is_active = true
  ) then
    raise exception 'INVALID_RENTAL_ACTOR';
  end if;

  select rv.name into vendor_name
  from public.rental_vendors rv
  where rv.id = current_record.vendor_id;

  update public.rental_records
  set status = 'active'::public.rental_record_status,
      pickup_requested_at = null,
      pickup_requested_by_staff_profile_id = null,
      pickup_confirmation_number = null,
      pickup_request_note = null,
      updated_at = now()
  where id = target_record_id
    and status in (
      'pickup_requested'::public.rental_record_status,
      'pickup_called'::public.rental_record_status,
      'called_for_pickup'::public.rental_record_status
    )
  returning * into updated_record;

  if updated_record.id is null then
    raise exception 'STALE_RENTAL_STATE';
  end if;

  insert into public.rental_events (
    department_id,
    rental_record_id,
    equipment_id,
    event_type,
    event_at,
    actor_staff_profile_id,
    event_data
  )
  values (
    updated_record.department_id,
    updated_record.id,
    updated_record.equipment_id,
    'pickup_cancelled'::public.rental_event_type,
    p_cancelled_at,
    actor_staff_profile_id,
    jsonb_build_object(
      'barcode_number', updated_record.barcode_number,
      'serial_number', updated_record.serial_number,
      'equipment_type', updated_record.equipment_type,
      'vendor_id', updated_record.vendor_id,
      'vendor_name', vendor_name,
      'current_location', updated_record.current_location,
      'note', nullif(trim(p_cancellation_note), ''),
      'timestamp', p_cancelled_at
    )
  );

  return updated_record;
end;
$$;

grant execute on function public.confirm_rental_delivery(uuid, uuid, timestamptz, text, text, text, text, public.rental_event_type) to authenticated;
grant execute on function public.create_pending_rental_delivery(uuid, uuid, public.rental_equipment_type, integer, timestamptz, uuid, text) to authenticated;
grant execute on function public.call_rental_pickup(uuid, uuid, timestamptz, text, text) to authenticated;
grant execute on function public.confirm_rental_picked_up(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_rental_delivery(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_rental_pickup(uuid, uuid, timestamptz, text) to authenticated;
