import "./assert-local-supabase.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    })
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!url?.startsWith("http://127.0.0.1:") || !publishableKey || !secretKey) {
  throw new Error("Concurrency test requires the guarded local .env.local configuration.");
}

const versionId = "70000000-0000-0000-0000-000000000001";
const departmentId = "30000000-0000-0000-0000-000000000002";
const admin = createClient(url, secretKey, { auth: { persistSession: false } });
const { data: staffRows, error: staffError } = await admin
  .from("staff_profiles")
  .select("id, username_normalized")
  .in("username_normalized", ["staff07", "staff08"]);
if (staffError || !staffRows || staffRows.length !== 2) throw new Error("Synthetic concurrency staff fixture is missing.");
const ids = new Map(staffRows.map((row) => [row.username_normalized, row.id]));

async function signedInClient() {
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: "localadmin@washington-schedule.local",
    password: "LocalAdmin123!"
  });
  if (error) throw error;
  return client;
}

function payload(rowIndex, date, profileId, start = "06:30", end = "19:00") {
  return {
    entries: [{
      row_index: rowIndex,
      shift_date: date,
      shift_type: "day_shift",
      shift_start: start,
      shift_end: end,
      staff_profile_id: profileId,
      raw_staff_name: "synthetic",
      entry_status: "scheduled",
      is_shift_lead: false
    }],
    audit: [{
      row_index: rowIndex,
      row_type: "entry",
      source_line: "ENTRY synthetic concurrency",
      raw_staff_name: "synthetic",
      excluded: false
    }]
  };
}

async function commit(client, hash, date, rowPayload) {
  return client.rpc("commit_schedule_import", {
    p_expected_schedule_version_id: versionId,
    p_source_hash: hash,
    p_source_label: "Synthetic concurrency test",
    p_source_starts_on: date,
    p_source_ends_on: date,
    p_entry_rows: rowPayload.entries,
    p_shortage_rows: [],
    p_audit_rows: rowPayload.audit
  });
}

const clientA = await signedInClient();
const clientB = await signedInClient();
const identical = payload(1, "2026-09-12", ids.get("staff07"));
const identicalResults = await Promise.all([
  commit(clientA, "b".repeat(64), "2026-09-12", identical),
  commit(clientB, "b".repeat(64), "2026-09-12", identical)
]);
if (identicalResults.some((result) => result.error)) {
  throw new Error(`Concurrent identical import failed: ${identicalResults.map((result) => result.error?.message).join(" | ")}`);
}
const insertedTotal = identicalResults.reduce(
  (sum, result) => sum + Number(result.data?.insertedEntries ?? 0),
  0
);
if (insertedTotal !== 1) throw new Error(`Concurrent identical imports inserted ${insertedTotal} rows instead of 1.`);

const conflictA = payload(1, "2026-09-13", ids.get("staff08"), "06:30", "19:00");
const conflictB = payload(1, "2026-09-13", ids.get("staff08"), "07:00", "19:30");
const conflictResults = await Promise.all([
  commit(clientA, "c".repeat(64), "2026-09-13", conflictA),
  commit(clientB, "d".repeat(64), "2026-09-13", conflictB)
]);
if (conflictResults.filter((result) => !result.error).length !== 1
  || conflictResults.filter((result) => result.error).length !== 1) {
  throw new Error("Concurrent conflicting imports did not serialize to one success and one safe conflict.");
}

const { count: identicalCount } = await admin
  .from("schedule_entries")
  .select("id", { count: "exact", head: true })
  .eq("schedule_version_id", versionId)
  .eq("shift_date", "2026-09-12")
  .eq("staff_profile_id", ids.get("staff07"));
const { count: conflictCount } = await admin
  .from("schedule_entries")
  .select("id", { count: "exact", head: true })
  .eq("schedule_version_id", versionId)
  .eq("shift_date", "2026-09-13")
  .eq("staff_profile_id", ids.get("staff08"));
if (identicalCount !== 1 || conflictCount !== 1) {
  throw new Error(`Concurrency verification failed: identical=${identicalCount}, conflict=${conflictCount}.`);
}

const hashes = ["b".repeat(64), "c".repeat(64), "d".repeat(64)];
const { data: imports } = await admin.from("schedule_imports").select("id").in("source_hash", hashes);
if (imports?.length) await admin.from("schedule_imports").delete().in("id", imports.map((row) => row.id));
await admin
  .from("schedule_entries")
  .delete()
  .eq("schedule_version_id", versionId)
  .in("shift_date", ["2026-09-12", "2026-09-13"]);
await admin.from("schedule_versions").update({ ends_on: "2026-08-30" }).eq("id", versionId).eq("department_id", departmentId);
await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);

process.stdout.write("Concurrent identical and conflicting import tests passed.\n");
