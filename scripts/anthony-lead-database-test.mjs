import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import "./assert-local-supabase.mjs";

// Use only the repository's synthetic local database. Every scenario rolls back.
const migration = readFileSync(new URL("../supabase/migrations/20260909171904_promote_anthony_alix_to_lead.sql", import.meta.url), "utf8")
  .replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, "");

for (const scenario of ["claimed", "unclaimed", "inactive", "stale-membership", "missing"]) {
  const sql = `
begin;
${scenario === "missing" ? "" : `
update public.staff_profiles
set display_name = 'Anthony Alix', username = 'alia', username_normalized = 'alia',
    is_active = ${scenario !== "inactive"},
    assigned_role = '${scenario === "stale-membership" ? "lead" : "staff"}'
where id = md5('local-staff-2')::uuid;
${scenario === "unclaimed" ? `update public.staff_profiles set profile_id = null, auth_user_id = null, account_claimed_at = null where username_normalized = 'alia';` : ""}
${scenario === "stale-membership" ? `update public.department_memberships set role = 'staff' where profile_id = '40000000-0000-0000-0000-000000000002';` : ""}
`}
create temp table before_staff as select id, assigned_role, to_jsonb(s) - 'assigned_role' - 'updated_at' as fields from public.staff_profiles s;
create temp table before_memberships as select id, role, to_jsonb(m) - 'role' - 'updated_at' as fields from public.department_memberships m;
${migration}
${migration}
do $$
begin
  if (select count(*) from public.staff_profiles where username_normalized = 'alia') <> ${scenario === "missing" ? 0 : 1} then
    raise exception 'Unexpected Anthony profile count';
  end if;
  if exists (select 1 from public.staff_profiles s join before_staff b using(id)
             where s.username_normalized is distinct from 'alia' and s.assigned_role is distinct from b.assigned_role) then
    raise exception 'Changed another staff role';
  end if;
  if exists (select 1 from public.department_memberships m join before_memberships b using(id)
             where m.role is distinct from b.role and not exists (
               select 1 from public.staff_profiles s where s.username_normalized = 'alia'
               and s.profile_id = m.profile_id and s.department_id = m.department_id)) then
    raise exception 'Changed another membership role';
  end if;
  if (select count(*) from public.staff_profiles) <> (select count(*) from before_staff) then
    raise exception 'Migration changed the number of staff profiles';
  end if;
  if exists (select 1 from public.staff_profiles s full join before_staff b using(id)
             where b.fields is distinct from to_jsonb(s) - 'assigned_role' - 'updated_at') then
    raise exception 'Migration changed unrelated staff fields';
  end if;
  if exists (select 1 from public.department_memberships m full join before_memberships b using(id)
             where b.fields is distinct from to_jsonb(m) - 'role' - 'updated_at') then
    raise exception 'Migration changed unrelated membership fields';
  end if;
  if exists (select 1 from public.staff_profiles where username_normalized = 'alia' and assigned_role <> 'lead') then
    raise exception 'Anthony was not promoted';
  end if;
  if exists (select 1 from public.department_memberships m join public.staff_profiles s
             on s.profile_id = m.profile_id and s.department_id = m.department_id
             where s.username_normalized = 'alia' and m.role <> 'lead') then
    raise exception 'Anthony membership not synchronized';
  end if;
end $$;
${scenario === "claimed" || scenario === "inactive" ? `
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
do $$
begin
  if public.user_is_department_lead('30000000-0000-0000-0000-000000000002') is distinct from ${scenario === "claimed"} then
    raise exception 'Unexpected database Lead authorization';
  end if;
end $$;
${scenario === "claimed" ? `
select public.save_shift_status_update(jsonb_build_object(
  'department_id', '30000000-0000-0000-0000-000000000002',
  'shift_date', '2031-02-03', 'shift_type', 'night', 'rts_on', 8,
  'rvu_total', 216, 'vent_count', 5, 'bipap_count', 3,
  'updated_by_staff_profile_id', md5('local-staff-2')::uuid, 'updated_by_name', 'Anthony Alix'
));
do $$ begin
  if not exists (select 1 from public.shift_status_updates
    where updated_by_staff_profile_id = md5('local-staff-2')::uuid and updated_by_name = 'Anthony Alix') then
    raise exception 'Shift attribution not saved';
  end if;
end $$;
` : ""}
` : ""}
rollback;
`;
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_whhs-schedule-local", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || String(result.error));
    process.exit(1);
  }
  process.stdout.write(`PASS: ${scenario} promotion, idempotence, and field preservation\n`);
}
