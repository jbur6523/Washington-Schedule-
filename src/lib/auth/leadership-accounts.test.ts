// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608100001_leadership_accounts.sql"),
  "utf8"
);
const claimRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/auth/claim/route.ts"),
  "utf8"
);
const usernameStatusRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/auth/username-status/route.ts"),
  "utf8"
);
const loginForm = readFileSync(
  resolve(process.cwd(), "src/app/login/login-form.tsx"),
  "utf8"
);
const usernameHelpers = readFileSync(
  resolve(process.cwd(), "src/lib/auth/username.ts"),
  "utf8"
);
const notificationOnboardingRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/onboarding/notifications/route.ts"),
  "utf8"
);
const leadershipDashboard = readFileSync(
  resolve(process.cwd(), "src/components/DirectorShiftStatusClient.tsx"),
  "utf8"
);
const restrictedRouteGuards = [
  ["src/app/command-center/page.tsx", "!canManageShiftStatus(auth.context)"],
  ["src/app/command-center/phone-list/page.tsx", "!canManageShiftStatus(auth.context)"],
  ["src/app/command-center/shift-update/page.tsx", "!canManageShiftStatus(auth.context)"],
  ["src/app/command-center/short-shift-alert/page.tsx", "!canManageShiftStatus(auth.context)"],
  ["src/app/command-center/icu-snapshot/page.tsx", "!canViewIcuCommandCenter(auth.context)"],
  ["src/app/icu-command-center/page.tsx", "!canEditIcuCommandCenter(auth.context)"],
  ["src/app/operations/page.tsx", "!hasOperationsDashboardAccess(auth.context)"],
  ["src/app/operations/order-management/page.tsx", "!hasOrderManagementAccess(auth.context)"],
  ["src/app/operations/rental-management/page.tsx", "!hasRentalManagementAccess(auth.context)"],
  ["src/app/admin/page.tsx", 'auth.context.role !== "admin"'],
  ["src/app/admin/roster/page.tsx", 'auth.context.role !== "admin"'],
  ["src/app/admin/import-schedule/page.tsx", 'auth.context.role !== "admin"'],
  ["src/app/admin/schedule-versions/page.tsx", 'auth.context.role !== "admin"']
] as const;

const firstLoginAccounts = [
  ["chaj", "Jimmy Chang"],
  ["lead", "Lead/Leadership"]
] as const;

describe.each(firstLoginAccounts)("pre-provisioned Leadership account %s", (username, displayName) => {
  it("is created as an active, unclaimed Leadership identity", () => {
    expect(migration).toContain(`('${username}'::text, '${displayName}'::text)`);
    expect(migration).toContain("'leadership'");
    expect(migration).toContain("password_reset_required");
    expect(usernameStatusRoute).toMatch(
      /profile\.account_claimed_at\s*\|\|\s*profile\.auth_user_id\s*\|\|\s*profile\.profile_id[\s\S]*\? "claimed"[\s\S]*: "unclaimed"/
    );
  });

  it("uses the existing user-created password activation flow", () => {
    expect(claimRoute).toContain('password.length < 12');
    expect(claimRoute).toContain('supabase.auth.admin.createUser');
    expect(loginForm).toContain("Create the password you will use to sign in.");
    expect(loginForm).toContain('autoComplete="new-password"');
    expect(loginForm).toContain('autoComplete="current-password"');
    expect(migration).not.toMatch(/insert\s+into\s+auth\.users/i);
    expect(migration).not.toMatch(/encrypted_password\s*=/i);
    expect(migration).not.toMatch(/default_password|shared_password|temporary_password/i);
  });
});

describe("Ramon Hollander Leadership account rename", () => {
  it("positively identifies the unclaimed aloha staff identity and rejects a different account", () => {
    expect(migration).toContain("where staff.username_normalized = 'aloha'");
    expect(migration).toContain("public.normalize_username(ramon.display_name) <> 'ramonhollander'");
    expect(migration).toContain("leadership_ramon_identity_mismatch");
    expect(migration).toContain("ramon.account_claimed_at is null");
    expect(migration).toContain("ramon.auth_user_id is null");
    expect(migration).toContain("ramon.profile_id is null");
    expect(migration).toContain("leadership_ramon_unclaimed_account_required");
    expect(migration).toContain("leadership_ramon_target_username_collision");
    expect(migration).toContain("leadership_ramon_duplicate_profile_collision");
  });

  it("renames the same staff row without creating or replacing an Auth/profile identity", () => {
    expect(migration).toContain("where staff.id = ramon.id");
    expect(migration).toContain("username = 'holr'");
    expect(migration).toContain("password_reset_required = ramon_is_unclaimed");
    expect(migration).not.toMatch(/insert\s+into\s+auth\.users/i);
    expect(migration).not.toMatch(/update\s+auth\.users/i);
    expect(migration).not.toContain("encrypted_password");
    expect(migration).not.toMatch(/delete\s+from\s+(?:public\.)?staff_profiles/i);
    expect(migration).not.toMatch(/delete\s+from\s+auth\.users/i);
  });

  it("uses the existing first-login claim flow to create Ramon's own holr password", () => {
    expect(usernameHelpers).toContain('return `${normalizeUsername(username)}@washington-schedule.local`;');
    expect(usernameStatusRoute).toMatch(/\? "claimed"\s*: "unclaimed"/);
    expect(claimRoute).toContain('password.length < 12');
    expect(claimRoute).toContain('supabase.auth.admin.createUser');
    expect(claimRoute).toContain("requested_username: username");
    expect(loginForm).toContain("Create the password you will use to sign in.");
    expect(loginForm).toContain('autoComplete="new-password"');
  });

  it("records the unclaimed rename while keeping relationship keys on the original staff UUID", () => {
    expect(migration).toContain("'staff_username_renamed'");
    expect(migration).toContain("'account_state', 'unclaimed'");
    expect(migration).toContain("'staff_profile_id', ramon.id");
  });
});

describe("Leadership account security contracts", () => {
  it("fails safely on username or display-name collisions instead of creating duplicates", () => {
    expect(migration).toContain("leadership_username_collision");
    expect(migration).toContain("leadership_display_name_collision");
    expect(migration).toContain("leadership_claimed_account_collision");
    expect(migration).toContain("leadership_existing_account_collision");
    expect(migration).toContain("leadership_existing_account_linkage_invalid");
    expect(migration).toContain("where staff.username_normalized = account.username");
    expect(migration).not.toContain("update public.staff_profiles staff\n      set\n        display_name = account.display_name");
  });

  it("disables notification onboarding and push enrollment at both API and RLS layers", () => {
    expect(notificationOnboardingRoute).toContain("canUseNotifications(auth.context)");
    expect(notificationOnboardingRoute).toContain("Notifications are disabled for this account.");
    expect(migration).toContain("initialize_leadership_notification_preferences");
    expect(migration).toContain("short_shift_alerts = false");
    expect(migration).toContain("and not public.user_is_department_leadership(department_id)");
    expect(migration).toContain("is_active = false");
  });

  it("grants only attributed Lead Communication Board creation and restricted replies", () => {
    expect(migration).toContain("public.user_is_department_leadership(department_id)");
    expect(migration).toContain("staff.display_name = created_by_name");
    expect(migration).toContain("create or replace function public.reply_to_lead_communication_note");
    expect(migration).toContain("followed_up_by_name = actor_staff.display_name");
    expect(migration).toContain("note.follow_up_text is null");
  });

  it("keeps navigation inside the Leadership Dashboard", () => {
    expect(leadershipDashboard).not.toMatch(/href=["'{`]\/(?:admin|command-center|icu-command-center|operations)/);
    expect(leadershipDashboard).toContain('context={isLeadership(authContext) ? "leadership" : "director"}');
  });

  it.each(restrictedRouteGuards)("keeps direct access to %s behind its server authorization guard", (path, guard) => {
    const route = readFileSync(resolve(process.cwd(), path), "utf8");

    expect(route).toContain(guard);
  });
});
