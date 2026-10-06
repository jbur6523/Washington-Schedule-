begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select plan(12);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-05',
    'shift_type', 'day',
    'rts_on', 8,
    'rvu_total', 216,
    'bipap_count', 3,
    'stayed_over_count', 2,
    'called_in_count', 1,
    'updated_by_staff_profile_id', md5('local-staff-1')::uuid,
    'updated_by_name', 'Local Administrator'
  ))$$,
  'an authorized Shift Update persists Additional Staffing counts'
);

select is(
  (select count(*)::integer from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-05'
     and shift_type = 'day'
     and is_canonical = true),
  1,
  'the first additional staffing save creates one canonical shift row'
);

select is(
  (select concat_ws(':', stayed_over_count, called_in_count)
   from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-05'
     and shift_type = 'day'
     and is_canonical = true),
  '2:1',
  'both additional staffing counts are stored on the canonical shift row'
);

select lives_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-05',
    'shift_type', 'day',
    'rts_on', 8,
    'rvu_total', 216,
    'bipap_count', 3,
    'stayed_over_count', 0,
    'called_in_count', 4,
    'updated_by_staff_profile_id', md5('local-staff-1')::uuid,
    'updated_by_name', 'Local Administrator'
  ))$$,
  'editing the shift replaces its additional staffing values and preserves a submitted zero'
);

select is(
  (select count(*)::integer from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-05'
     and shift_type = 'day'
     and is_canonical = true),
  1,
  'editing additional staffing counts does not duplicate the canonical shift row'
);

select is(
  (select concat_ws(':', stayed_over_count, called_in_count)
   from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-05'
     and shift_type = 'day'
     and is_canonical = true),
  '0:4',
  'the edited values replace earlier counts exactly'
);

select lives_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-05',
    'shift_type', 'day',
    'shift_note', 'Partial update preserves additional staffing counts',
    'updated_by_staff_profile_id', md5('local-staff-1')::uuid,
    'updated_by_name', 'Local Administrator'
  ))$$,
  'a partial canonical save may omit the additional staffing fields'
);

select is(
  (select concat_ws(':', stayed_over_count, called_in_count)
   from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-05'
     and shift_type = 'day'
     and is_canonical = true),
  '0:4',
  'omitted additional staffing fields preserve the current canonical values'
);

select is(
  (select concat_ws(':', rts_on, rts_required::integer, rvu_total::integer)
   from public.shift_status_updates where shift_date = '2031-02-05' and shift_type = 'day' and is_canonical),
  '8:8:216', 'additional staffing never alters RTs on shift, RTs needed, or RVUs'
);
select throws_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-05', 'shift_type', 'day', 'stayed_over_count', -1,
    'updated_by_name', 'Local Administrator'
  ))$$, '23514', null, 'negative counts are rejected by the database'
);
select throws_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-05', 'shift_type', 'day', 'called_in_count', 1.5,
    'updated_by_name', 'Local Administrator'
  ))$$, '22P02', null, 'fractional counts are rejected by the database'
);
select lives_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-05', 'shift_type', 'night',
    'rts_on', 8, 'rvu_total', 216, 'bipap_count', 3,
    'updated_by_staff_profile_id', md5('local-staff-1')::uuid,
    'updated_by_name', 'Local Administrator'
  ))$$, 'older clients can create shifts without the additional fields'
);
select * from finish();
rollback;
