begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select plan(10);

select col_is_null(
  'public',
  'shift_status_updates',
  'neonatal_high_flow_count',
  'historical neonatal high-flow values remain missing rather than fabricated zeroes'
);

select col_is_null(
  'public',
  'shift_status_updates',
  'bubble_cpap_count',
  'historical Bubble CPAP values remain missing rather than fabricated zeroes'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-04',
    'shift_type', 'day',
    'rts_on', 8,
    'rvu_total', 216,
    'bipap_count', 3,
    'neonatal_high_flow_count', 2,
    'bubble_cpap_count', 1,
    'updated_by_staff_profile_id', md5('local-staff-1')::uuid,
    'updated_by_name', 'Local Administrator'
  ))$$,
  'an authorized Shift Update persists Special Care Nursery counts'
);

select is(
  (select count(*)::integer from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-04'
     and shift_type = 'day'
     and is_canonical = true),
  1,
  'the first nursery save creates one canonical shift row'
);

select is(
  (select concat_ws(':', neonatal_high_flow_count, bubble_cpap_count)
   from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-04'
     and shift_type = 'day'
     and is_canonical = true),
  '2:1',
  'both nursery counts are stored on the canonical shift row'
);

select lives_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-04',
    'shift_type', 'day',
    'rts_on', 8,
    'rvu_total', 216,
    'bipap_count', 3,
    'neonatal_high_flow_count', 0,
    'bubble_cpap_count', 4,
    'updated_by_staff_profile_id', md5('local-staff-1')::uuid,
    'updated_by_name', 'Local Administrator'
  ))$$,
  'editing the shift replaces its nursery values and preserves a submitted zero'
);

select is(
  (select count(*)::integer from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-04'
     and shift_type = 'day'
     and is_canonical = true),
  1,
  'editing nursery counts does not duplicate the canonical shift row'
);

select is(
  (select concat_ws(':', neonatal_high_flow_count, bubble_cpap_count)
   from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-04'
     and shift_type = 'day'
     and is_canonical = true),
  '0:4',
  'the edited values replace earlier counts exactly'
);

select lives_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-04',
    'shift_type', 'day',
    'shift_note', 'Partial update preserves nursery counts',
    'updated_by_staff_profile_id', md5('local-staff-1')::uuid,
    'updated_by_name', 'Local Administrator'
  ))$$,
  'a partial canonical save may omit the nursery fields'
);

select is(
  (select concat_ws(':', neonatal_high_flow_count, bubble_cpap_count)
   from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-04'
     and shift_type = 'day'
     and is_canonical = true),
  '0:4',
  'omitted nursery fields preserve the current canonical values'
);

select * from finish();
rollback;
