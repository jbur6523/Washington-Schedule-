-- Synthetic local fixtures only. Every record and role change rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
insert into public.rental_vendors(id,department_id,name) values('91000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','Rental test vendor');
update public.staff_profiles set assigned_role='lead' where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
create temp table ordered as select * from public.update_rental_list('30000000-0000-0000-0000-000000000002','order',
'{"vendor_id":"91000000-0000-0000-0000-000000000001","quantity":2,"at":"2026-10-13T16:00:00Z","person":{"name":"Order Person"}}',null,null,'92000000-0000-0000-0000-000000000001');
select is((select count(*)::int from ordered),2,'Quantity creates one persistent row per device');
select ok((select bool_and(status='pending_delivery') from ordered),'Rows start Ordered');
select is((select count(*)::int from public.update_rental_list('30000000-0000-0000-0000-000000000002','order','{}',null,null,'92000000-0000-0000-0000-000000000001')),2,'Retry returns original order');
select is((select count(*)::int from public.rental_records where order_request_id='92000000-0000-0000-0000-000000000001'),2,'Retry creates no duplicate order');
-- Use scalar subqueries for RPC arguments so tests do not depend on row order.
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000002','delivery','{"at":"2026-10-13T17:00:00Z","person":{"name":"Delivery Person"}}',(select id from ordered order by id limit 1),(select updated_at from ordered order by id limit 1))$$,'P0001','Serial Number is required.','Delivery requires serial');
create temp table delivered as select * from public.update_rental_list('30000000-0000-0000-0000-000000000002','delivery',
'{"serial_number":"TEST-RENTAL-SN","barcode_number":"TEST-RENTAL-BC","scanned":true,"at":"2026-10-13T17:00:00Z","person":{"name":"Delivery Person"}}',
(select id from ordered order by id limit 1),(select updated_at from ordered order by id limit 1));
select is((select status::text from delivered),'active','Delivered becomes Active');
select is((select count(*)::int from public.rental_events where rental_record_id=(select id from delivered) and event_type='barcode_scanned'),1,'Scan is audited');
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000002','delivery','{"serial_number":"TEST-RENTAL-SN","at":"2026-10-13T17:00:00Z","person":{"name":"Delivery Person"}}',(select id from ordered order by id limit 1),(select updated_at from ordered order by id limit 1))$$,'40001','STALE_RENTAL_STATE','Duplicate action is rejected');
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000002','delivery','{"serial_number":"TEST-RENTAL-SN","at":"2026-10-13T17:00:00Z","person":{"name":"Delivery Person"}}',(select id from ordered order by id desc limit 1),(select updated_at from ordered order by id desc limit 1))$$,'P0001','DUPLICATE_ACTIVE_RENTAL','Different row cannot duplicate serial');
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000002','returned','{"at":"2026-10-13T18:00:00Z","person":{"name":"Pickup Person"}}',(select id from delivered),(select updated_at from delivered))$$,'40001','STALE_RENTAL_STATE','Cannot skip pickup request');
create temp table pickup as select * from public.update_rental_list('30000000-0000-0000-0000-000000000002','pickup',
jsonb_build_object('at','2026-10-13T18:00:00Z','person',jsonb_build_object('staff_profile_id',(select id from public.staff_profiles where profile_id='40000000-0000-0000-0000-000000000002'),'name','Forged name')),
(select id from delivered),(select updated_at from delivered));
select is((select status::text from pickup),'pickup_called','Return request stays Awaiting Pickup');
select ok((select returned_at is null from pickup),'Request does not complete rental');
select ok((select attribution->'pickup'->>'name'<>'Forged name' from pickup),'Selected name is resolved from employee record');
select ok((select actor_staff_profile_id=public.current_staff_profile_id(department_id) and authenticated_user_id=auth.uid() from public.rental_events where rental_record_id=(select id from pickup) and event_type='pickup_called'),'Authenticated updater preserved separately');
create temp table completed as select * from public.update_rental_list('30000000-0000-0000-0000-000000000002','returned','{"at":"2026-10-13T19:00:00Z","person":{"name":"Pickup Person"}}',(select id from pickup),(select updated_at from pickup));
select is((select status::text from completed),'picked_up','Actual pickup completes rental');
select is((select attribution->'returned'->>'name' from completed),'Pickup Person','Manual name retained');
create temp table corrected as select * from public.update_rental_list('30000000-0000-0000-0000-000000000002','edit',
'{"vendor_id":"91000000-0000-0000-0000-000000000001","serial_number":"TEST-RENTAL-CORRECTED","barcode_number":"TEST-RENTAL-BC","stages":{"returned":{"at":"2026-10-13T19:30:00Z","person":{"name":"Corrected Person"}}}}',
(select id from completed),(select updated_at from completed));
select is((select count(*)::int from public.rental_events where rental_record_id=(select id from completed) and event_type='picked_up'),1,'Original event preserved');
select ok((select event_data->'before'->'attribution'->'returned'->>'name'='Pickup Person' and event_data->'after'->'attribution'->'returned'->>'name'='Corrected Person' from public.rental_events where rental_record_id=(select id from completed) and event_type='edited'),'Correction audit stores before and after');
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000002','edit','{}',(select id from completed),(select updated_at from completed))$$,'40001','STALE_RENTAL_STATE','Stale correction rejected');
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000003','order','{}',null,null,gen_random_uuid())$$,'42501','RENTAL_ACCESS_DENIED','Cross department writes denied');
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000002','order',jsonb_build_object('vendor_id','91000000-0000-0000-0000-000000000001','quantity',1,'at','2026-10-13T16:00:00Z','person',jsonb_build_object('staff_profile_id',public.current_staff_profile_id('30000000-0000-0000-0000-000000000002'))),null,null,gen_random_uuid())$$,'P0001','Select a Lead, Aide, or Insert Name.','Ineligible admin cannot be selected as operational employee');
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000002','order','{"vendor_id":"91000000-0000-0000-0000-000000000001","quantity":1,"at":"2026-10-13T16:00:00Z","person":{"name":" "}}',null,null,gen_random_uuid())$$,'P0001','Enter a name (up to 120 characters).','Blank manual name rejected');
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000002','delivery','{"serial_number":"TEST-EARLY","at":"2026-10-12T17:00:00Z","person":{"name":"Delivery Person"}}',(select id from ordered order by id desc limit 1),(select updated_at from ordered order by id desc limit 1))$$,'P0001','Dates must follow the rental lifecycle order.','Delivery cannot precede order');
-- A failure in the audit insert must roll back the record too.
reset role;
create function pg_temp.reject_rental_audit() returns trigger language plpgsql as $$begin raise exception 'Test audit failure'; end$$;
create trigger test_rental_audit before insert on public.rental_events for each row execute function pg_temp.reject_rental_audit();
set local role authenticated;
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000002','order','{"vendor_id":"91000000-0000-0000-0000-000000000001","quantity":1,"at":"2026-10-13T16:00:00Z","person":{"name":"Test"}}',null,null,'92000000-0000-0000-0000-000000000002')$$,'P0001','Test audit failure','Audit failure rejects order');
select is((select count(*)::int from public.rental_records where order_request_id='92000000-0000-0000-0000-000000000002'),0,'No partial record after audit failure');
reset role;
update public.staff_profiles set assigned_role='staff',operations_role='none' where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.update_rental_list('30000000-0000-0000-0000-000000000002','order','{}',null,null,gen_random_uuid())$$,'42501','RENTAL_ACCESS_DENIED','Regular staff denied');
select is((select count(*)::int from public.rental_records),0,'RLS hides rentals from regular staff');
select ok(not has_function_privilege('anon','public.update_rental_list(uuid,text,jsonb,uuid,timestamptz,uuid)','execute'),'Anonymous callers cannot execute');
select * from finish();
rollback;

