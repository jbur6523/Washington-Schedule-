import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import "./assert-local-supabase.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20261022231217_icu_oxygen_devices.sql", import.meta.url), "utf8")
  .replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, "");
const sql = `begin;
${migration}
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.staff_profiles where is_active and auth_user_id is not null and assigned_role in ('lead','admin') limit 1),true);
set local role authenticated;
do $$
declare dept uuid; saved jsonb; device text; patient_id uuid; version timestamptz;
begin
 select department_id into strict dept from public.staff_profiles where auth_user_id=auth.uid();
 foreach device in array array['nasal_cannula','non_rebreather','venturi_mask','ozymizer'] loop
  saved:=public.manage_icu_device(dept,'add',jsonb_build_object('bed','test-oxygen','device_type',device,'flow',6,'fio2',40),'{}'::jsonb,null,null);
  patient_id:=(saved->>'id')::uuid;
  if saved->>'device_type'<>device or (saved->>'flow')::numeric<>6 or (saved->>'fio2')::numeric<>40 then raise exception 'Oxygen add failed'; end if;
  update public.icu_patients set flow=8 where id=patient_id returning updated_at into version;
  if public.icu_modality_profile(device,'{"flow":8,"fio2":40,"notes":"excluded"}') <> '{"flow":8,"fio2":40}'::jsonb then raise exception 'Profile settings failed'; end if;
  saved:=public.manage_icu_modality(patient_id,'hfnc','{"flow":30,"fio2":45}','save',version);
  saved:=public.manage_icu_modality(patient_id,'hfnc','{}','switch',(saved->>'updated_at')::timestamptz);
  saved:=public.manage_icu_modality(patient_id,device,'{}','switch',(saved->>'updated_at')::timestamptz);
  if saved->>'device_type'<>device or (saved->>'flow')::numeric<>8 then raise exception 'Saved oxygen switch failed'; end if;
  begin
   update public.icu_patients set fio2=101 where id=patient_id;
   raise exception 'Invalid FiO2 accepted';
  exception when check_violation then null; end;
  saved:=public.manage_icu_device(dept,'discontinue',jsonb_build_object('discontinued_at',clock_timestamp()),'{}',patient_id,(saved->>'updated_at')::timestamptz);
  if (saved->>'is_active')::boolean then raise exception 'Discontinue failed'; end if;
  if not exists(select 1 from public.icu_patient_events where icu_patient_id=patient_id) then raise exception 'History missing'; end if;
 end loop;
end $$;
rollback;`;
const result = spawnSync("docker", ["exec", "-i", "supabase_db_whhs-schedule-local", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
if (result.status !== 0) { process.stderr.write(result.stderr || String(result.error)); process.exit(1); }
process.stdout.write("PASS: all four oxygen devices add, update, switch, validate, audit and discontinue (rolled back).\n");

