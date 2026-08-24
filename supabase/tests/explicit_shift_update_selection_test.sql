begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select plan(6);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-03',
    'shift_type', 'night',
    'rts_on', 8,
    'rvu_total', 216,
    'vent_count', 5,
    'bipap_count', 3,
    'updated_by_staff_profile_id', md5('local-staff-1')::uuid,
    'updated_by_name', 'Local Administrator'
  ))$$,
  'an authorized lead can save an explicitly selected shift outside the former active window'
);

select is(
  (select count(*)::integer from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-03'
     and shift_type = 'night'
     and is_canonical = true),
  1,
  'the first save creates one canonical row'
);

select is(
  (select concat_ws(':', rts_on, rvu_total, vent_count, bipap_count)
   from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-03'
     and shift_type = 'night'
     and is_canonical = true),
  '8:216:5:3',
  'the selected shift values are persisted'
);

select lives_ok(
  $$select public.save_shift_status_update(jsonb_build_object(
    'department_id', '30000000-0000-0000-0000-000000000002',
    'shift_date', '2031-02-03',
    'shift_type', 'night',
    'rts_on', 9,
    'rvu_total', 243,
    'vent_count', 6,
    'bipap_count', 4,
    'updated_by_staff_profile_id', md5('local-staff-1')::uuid,
    'updated_by_name', 'Local Administrator'
  ))$$,
  'saving the same selected shift again updates its canonical row'
);

select is(
  (select count(*)::integer from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-03'
     and shift_type = 'night'
     and is_canonical = true),
  1,
  'the second save does not create a duplicate canonical row'
);

select is(
  (select concat_ws(':', rts_on, rvu_total, vent_count, bipap_count)
   from public.shift_status_updates
   where department_id = '30000000-0000-0000-0000-000000000002'
     and shift_date = '2031-02-03'
     and shift_type = 'night'
     and is_canonical = true),
  '9:243:6:4',
  'the second save replaces the prior values on the same canonical row'
);

select * from finish();
rollback;
