// Local-only integration test. Synthetic fixtures are retained for browser QA.
// Never use this script with a hosted project or an official record store.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import nextEnv from "@next/env";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
nextEnv.loadEnvConfig(process.cwd());
const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(
  dbUrl,
  "http://127.0.0.1:61321",
  "This test must only use WHHS local Supabase.",
);
const base = "http://localhost:3100";
const db = createClient(dbUrl, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
function check(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
const department = check(
  await db.from("departments").select("id").limit(1).single(),
).id;
check(
  await db
    .from("etime_trial_config")
    .upsert({ id: true, department_id: department, enabled: true }),
);
if (process.env.ETIME_TEMPLATE_PATH) {
  const bytes = await readFile(process.env.ETIME_TEMPLATE_PATH);
  check(
    await db.from("etime_trial_templates").upsert({
      id: "approved-v1",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      pdf_base64: bytes.toString("base64"),
    }),
  );
}
const suffix = Date.now().toString(36);
const password = randomBytes(24).toString("base64url") + "aA1!";
const users = [];
async function account(role, displayName, portalOnly = true) {
  const username = `et${role.replace("_", "")}${suffix}`;
  const user = check(
    await db.auth.admin.createUser({
      email: `${username}@washington-schedule.local`,
      password,
      email_confirm: true,
    }),
  ).user;
  users.push(user.id);
  check(
    await db.from("etime_trial_grants").insert({
      department_id: department,
      auth_user_id: user.id,
      username,
      display_name: displayName,
      initials: role === "manager" ? "TM" : "TT",
      role,
      portal_only: portalOnly,
      claimed_at: new Date().toISOString(),
    }),
  );
  const jar = [];
  const client = createServerClient(
    dbUrl,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => jar,
        setAll: (items) => {
          for (const c of items) {
            const i = jar.findIndex((v) => v.name === c.name);
            if (i >= 0) jar[i] = c;
            else jar.push(c);
          }
        },
      },
    },
  );
  check(
    await client.auth.signInWithPassword({
      email: `${username}@washington-schedule.local`,
      password,
    }),
  );
  return {
    cookie: jar.map((c) => `${c.name}=${c.value}`).join("; "),
    username,
  };
}
const manager = await account("manager", "Test Manager");
const timekeeper = await account("timekeeper", "Test Timekeeper");
const admin = await account("identity_admin", "Test Administrator");
const qr = { cookie: "" };
async function api(who, body, path = "/api/etime", expected = 200) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: base } : {}),
      Cookie: who.cookie,
      "X-Forwarded-For": `local-e2e-${suffix}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const cookie = response.headers.get("set-cookie");
  if (cookie?.startsWith("etime_trial_session="))
    who.cookie = cookie.split(";")[0];
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const employeeId = String(Date.now());
assert.equal(
  (await api(qr, { action: "identify", employee_id: employeeId })).enroll,
  true,
);
await api(qr, {
  action: "identify",
  employee_id: employeeId,
  confirm_employee_id: employeeId,
  first_name: "Synthetic",
  last_name: "Employee",
});
const employee = await api(qr);
const save = (entry, form) => ({
  action: "save",
  form_id: form?.id,
  revision: form?.revision ?? 0,
  entry,
  name: "Synthetic Employee",
  adopted: true,
});
await api(
  qr,
  {
    ...save({
      date: today,
      category: "education",
      hours: "1",
      reason: "Unsigned submission must fail",
    }),
    adopted: false,
  },
  "/api/etime",
  400,
);
assert.equal(
  (await api(qr)).forms.length,
  0,
  "Unsigned submissions must not create a form",
);
let form = (
  await api(
    qr,
    save({
      date: today,
      category: "lunch",
      lunch_out: "12:00",
      lunch_in: "12:50",
      reason: "Synthetic lunch correction",
    }),
  )
).form;
assert.equal(form.state.entries[0].lunch_in, "12:50");
const originalFormId = form.id;
form = (
  await api(
    qr,
    save(
      {
        date: today,
        category: "education",
        hours: "7.25",
        reason: "Synthetic training hours",
      },
      form,
    ),
  )
).form;
assert.equal(form.state.entries.length, 2);
assert.equal(
  form.id,
  originalFormId,
  "New exceptions reuse the pay-period form",
);
assert.equal(
  (await api(qr)).forms.length,
  1,
  "One form per employee and pay period",
);
const initial = (who, row, entered = true) =>
  api(who, {
    action: "initial",
    form_id: form.id,
    revision: form.revision,
    entry_id: form.state.entries[row].id,
    entered,
  });
await api(
  qr,
  {
    action: "initial",
    form_id: form.id,
    revision: form.revision,
    entry_id: form.state.entries[0].id,
    entered: true,
  },
  "/api/etime",
  403,
);
await api(qr, null, "/api/etime?mode=review", 403);
form = (await initial(timekeeper, 0)).form;
assert.equal(form.state.entries[0].entered.initials, "TT");
assert.match(form.state.entries[0].entered.actor, /^reviewer:/);
assert.ok(Date.parse(form.state.entries[0].entered.at));
await api(
  manager,
  {
    action: "managerSign",
    form_id: form.id,
    revision: form.revision,
    name: "Test Manager",
    adopted: true,
  },
  "/api/etime",
  400,
);
assert.equal((await api(qr)).forms[0].state.entries[1].entered, undefined);
form = (await initial(manager, 1)).form;
assert.equal(
  form.state.entries[1].entered.initials,
  "TM",
  "Manager can cover timekeeper entry",
);
await api(
  timekeeper,
  {
    action: "managerSign",
    form_id: form.id,
    revision: form.revision,
    name: "Test Manager",
    adopted: true,
  },
  "/api/etime",
  403,
);
assert.equal(
  (await api(qr)).forms[0].revision,
  form.revision,
  "Denied signing cannot change the form",
);
form = (
  await api(manager, {
    action: "managerSign",
    form_id: form.id,
    revision: form.revision,
    name: "Test Manager",
    adopted: true,
  })
).form;
assert.ok(form.state.managerSignature);
assert.equal(
  (await api(manager, null, "/api/etime?mode=review")).grant
    .saved_signature_name,
  "Test Manager",
);
await api(
  manager,
  {
    action: "managerSign",
    form_id: form.id,
    revision: form.revision,
    name: "Test Manager",
    adopted: false,
  },
  "/api/etime",
  400,
);
const signedRevision = form.revision;
const edited = { ...form.state.entries[0], lunch_in: "12:55" };
form = (await api(qr, { ...save(edited, form), entry_id: edited.id })).form;
assert.equal(form.state.entries[0].entered, undefined);
assert.ok(form.state.entries[1].entered);
assert.equal(form.state.managerSignature, undefined);
assert.equal(form.state.entries[1].entered.initials, "TM");
await api(
  manager,
  {
    action: "managerSign",
    form_id: form.id,
    revision: form.revision,
    name: "Test Manager",
    adopted: true,
  },
  "/api/etime",
  400,
);
await api(
  qr,
  { ...save(edited, form), revision: form.revision - 1, entry_id: edited.id },
  "/api/etime",
  400,
);
form = (await initial(timekeeper, 0)).form;
assert.equal(
  form.state.managerSignature,
  undefined,
  "Reinitialing does not reuse prior approval",
);
form = (
  await api(manager, {
    action: "managerSign",
    form_id: form.id,
    revision: form.revision,
    name: "Test Manager",
    adopted: true,
  })
).form;
assert.equal(
  form.state.managerSignature.contentRevision,
  form.state.contentRevision,
);
const other = { cookie: "" };
await api(other, {
  action: "identify",
  employee_id: String(Date.now() + 1),
  confirm_employee_id: String(Date.now() + 1),
  first_name: "Second",
  last_name: "Synthetic",
});
const denied = await fetch(base + `/api/etime/forms/${form.id}`, {
  headers: { Cookie: other.cookie },
});
assert.equal(denied.status, 404);
const signedPdf = await fetch(
  base + `/api/etime/forms/${form.id}?revision=${signedRevision}`,
  { headers: { Cookie: qr.cookie } },
);
assert.equal(
  signedPdf.status,
  200,
  await (signedPdf.ok ? Promise.resolve("") : signedPdf.text()),
);
await writeFile(
  join(tmpdir(), "etime-signed-qa.pdf"),
  Buffer.from(await signedPdf.arrayBuffer()),
);
const history = await api(qr, null, `/api/etime/forms/${form.id}?history=1`);
assert.equal(history.history.length, form.revision);
const newId = String(Date.now() + 100);
await api(admin, {
  action: "correct",
  identity_id: employee.identity.id,
  employee_id: newId,
  confirm_employee_id: newId,
  first_name: "Synthetic",
  last_name: "Corrected",
  reason: "Synthetic correction verification",
});
assert.equal(
  (await api(qr)).identity,
  null,
  "Correction revokes old QR sessions",
);
await api(qr, { action: "identify", employee_id: newId });
const corrected = await api(qr);
assert.equal(corrected.forms[0].id, form.id);
assert.equal(corrected.forms[0].state.employeeSignature, undefined);
const old = check(
  await db
    .from("etime_trial_revisions")
    .select("state")
    .eq("form_id", form.id)
    .eq("revision", signedRevision)
    .single(),
);
assert.equal(old.state.identity.last_name, "Employee");
assert.ok(old.state.managerSignature);
assert.equal(old.state.entries[0].lunch_in, "12:50");
assert.equal(
  old.state.entries[0].entered.initials,
  "TT",
  "Historical initials survive edits",
);
await api(
  manager,
  {
    action: "managerSign",
    form_id: form.id,
    revision: corrected.forms[0].revision,
    name: "Test Manager",
    adopted: true,
  },
  "/api/etime",
  400,
);
assert.equal(
  (await api(timekeeper, null, "/api/auth/session-status")).redirectTo,
  "/etime/portal",
);
assert.equal(
  check(await db.from("staff_profiles").select("id").in("auth_user_id", users))
    .length,
  0,
  "Portal-only accounts have no schedule staff access",
);
const invitation = `etinvite${suffix}`;
check(
  await db.from("etime_trial_grants").insert({
    department_id: department,
    username: invitation,
    display_name: "Invited Timekeeper",
    initials: "IT",
    role: "timekeeper",
    portal_only: true,
  }),
);
assert.equal(
  (
    await api(
      { cookie: "" },
      { username: invitation },
      "/api/auth/username-status",
    )
  ).status,
  "unclaimed",
);
await api(
  { cookie: "" },
  { username: invitation, password, confirmPassword: password },
  "/api/auth/claim",
);
const invited = check(
  await db
    .from("etime_trial_grants")
    .select("auth_user_id,claimed_at")
    .eq("username", invitation)
    .single(),
);
assert.ok(invited.auth_user_id);
assert.ok(invited.claimed_at);
assert.equal(
  check(
    await db
      .from("staff_profiles")
      .select("id")
      .eq("auth_user_id", invited.auth_user_id),
  ).length,
  0,
);
const staffUsername = `etstaff${suffix}`;
check(
  await db.from("staff_profiles").insert({
    department_id: department,
    username: staffUsername,
    display_name: `App Nickname ${suffix}`,
    employment_type: "full_time",
    home_assignment: "day_shift",
  }),
);
await api(
  { cookie: "" },
  { username: staffUsername, password, confirmPassword: password },
  "/api/auth/claim",
);
const staffJar = [];
const staffClient = createServerClient(
  dbUrl,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    cookies: {
      getAll: () => staffJar,
      setAll: (items) => staffJar.push(...items),
    },
  },
);
check(
  await staffClient.auth.signInWithPassword({
    email: `${staffUsername}@washington-schedule.local`,
    password,
  }),
);
const staff = {
  cookie: staffJar.map((c) => `${c.name}=${c.value}`).join("; "),
};
assert.equal((await api(staff)).signedIn, true);
await api(staff, {
  action: "identify",
  employee_id: newId,
  confirm_employee_id: newId,
  first_name: "Synthetic",
  last_name: "Corrected",
});
const linked = await api(staff);
assert.equal(linked.identity.id, employee.identity.id);
assert.equal(linked.forms[0].id, form.id);
assert.equal(linked.identity.first_name, "Synthetic");
await api(staff, null, "/api/etime?mode=review", 403);
// Finish correction tests with a valid employee signature for the beta preview.
const previewSigned = await api(staff, {
  action: "employeeSign",
  form_id: form.id,
  revision: linked.forms[0].revision,
  name: "Synthetic Corrected",
  adopted: true,
});
form = previewSigned.form;
await api(admin, null, "/api/etime?mode=review", 403);
const adminGrant = check(
  await db
    .from("etime_trial_grants")
    .select("id")
    .eq("username", admin.username)
    .single(),
);
const setTemporaryAccess = async (enabled) =>
  check(
    await db
      .from("etime_trial_grants")
      .update({ temporary_manager_access: enabled })
      .eq("id", adminGrant.id),
  );
await setTemporaryAccess(true);
assert.equal(
  (await api(admin, null, "/api/etime?mode=review")).grant.role,
  "manager",
);
assert.equal(
  (await api(admin, null, "/api/etime?mode=admin")).grant.role,
  "identity_admin",
);
const adminAccess = await api(admin, null, "/api/etime?mode=access");
assert.equal(adminAccess.reviewer, true);
assert.equal(adminAccess.identityAdmin, true);
form = (await initial(admin, 0)).form;
assert.equal(form.state.entries[0].entered.actor, `reviewer:${adminGrant.id}`);
form = (
  await api(admin, {
    action: "managerSign",
    form_id: form.id,
    revision: form.revision,
    name: "Test Administrator",
    adopted: true,
  })
).form;
assert.equal(form.state.managerSignature.name, "Test Administrator");
assert.equal(form.state.managerSignature.actor, `reviewer:${adminGrant.id}`);
assert.equal(
  (await api(admin, null, "/api/etime?mode=review")).grant.saved_signature_name,
  "Test Administrator",
);
assert.equal(
  (
    await fetch(base + `/api/etime/forms/${form.id}`, {
      headers: { Cookie: admin.cookie },
    })
  ).status,
  200,
);
await setTemporaryAccess(false);
await api(admin, null, "/api/etime?mode=review", 403);
await api(
  admin,
  {
    action: "managerSign",
    form_id: form.id,
    revision: form.revision,
    name: "Test Administrator",
    adopted: true,
  },
  "/api/etime",
  403,
);
await api(
  admin,
  {
    action: "initial",
    form_id: form.id,
    revision: form.revision,
    entry_id: form.state.entries[0].id,
    entered: true,
  },
  "/api/etime",
  403,
);
assert.equal(
  (
    await fetch(base + `/api/etime/forms/${form.id}`, {
      headers: { Cookie: admin.cookie },
    })
  ).status,
  503, // This portal-only fixture has no employee membership to fall back to.
);
await api(admin, null, "/api/etime?mode=admin");
await setTemporaryAccess(true);
try {
  check(
    await db
      .from("etime_trial_config")
      .update({ enabled: false })
      .eq("id", true),
  );
  assert.equal(
    check(
      await db
        .from("etime_trial_grants")
        .select("temporary_manager_access")
        .eq("id", adminGrant.id)
        .single(),
    ).temporary_manager_access,
    false,
  );
} finally {
  check(
    await db
      .from("etime_trial_config")
      .update({ enabled: true })
      .eq("id", true),
  );
}
await api(admin, null, "/api/etime?mode=review", 403);
console.log(
  "PASS: temporary admin review/initial/sign/PDF access, own signer identity, retained correction authority, immediate revocation, and trial-end revocation without reactivation.",
);
console.log(
  "PASS: QR enrollment, exact punches, grouped entries, scoped reviewer access, initials, signatures, stale edit rejection, PDF archive, ownership checks, correction preservation, portal isolation, portal activation, app/QR identity linking.",
);
// Password is written only to a local temporary QA file; never stdout or repository.
await writeFile(
  join(tmpdir(), "etime-local-qa.json"),
  JSON.stringify({
    manager: manager.username,
    timekeeper: timekeeper.username,
    password,
    employeeId: newId,
    formId: form.id,
  }),
);
