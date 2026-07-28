// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authEmailForUsername,
  normalizeUsername
} from "@/lib/auth/username";

const hardeningMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202607270002_production_readiness_hardening.sql"
  ),
  "utf8"
);
const claimRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/auth/claim/route.ts"),
  "utf8"
);
const statusRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/auth/username-status/route.ts"),
  "utf8"
);
const sessionStatusRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/auth/session-status/route.ts"),
  "utf8"
);
const contactRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/onboarding/contact/route.ts"),
  "utf8"
);
const notificationsRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/onboarding/notifications/route.ts"),
  "utf8"
);
const loginForm = readFileSync(
  resolve(process.cwd(), "src/app/login/login-form.tsx"),
  "utf8"
);

describe("username account activation", () => {
  it("normalizes case, whitespace, and punctuation consistently", () => {
    expect(normalizeUsername("  DiReCt.Or  ")).toBe("director");
    expect(authEmailForUsername("  DiReCt.Or  ")).toBe(
      "director@washington-schedule.local"
    );
  });

  it("does not require or retain one-time setup-code fields", () => {
    expect(claimRoute).not.toMatch(/setupCode|account_setup/i);
    expect(loginForm).not.toMatch(/setup code|one-time code/i);
    expect(hardeningMigration).not.toMatch(/account_setup|setup_token/i);
  });

  it("enforces one globally unique database-normalized username", () => {
    expect(hardeningMigration).toContain(
      "create unique index if not exists staff_profiles_username_normalized_unique"
    );
    expect(hardeningMigration).toContain(
      "before insert or update of username, username_normalized"
    );
    expect(hardeningMigration).toContain(
      "new.username_normalized := public.normalize_username(new.username)"
    );
    expect(statusRoute).toContain('.eq("username_normalized", username)');
  });

  it("claims only a locked, pre-created, active, unclaimed staff row", () => {
    expect(hardeningMigration).toContain(
      "create or replace function public.claim_staff_profile"
    );
    expect(hardeningMigration).toMatch(
      /where staff\.username_normalized = normalized_username\s+for update/
    );
    expect(hardeningMigration).toContain("if not staff_record.is_active then");
    expect(hardeningMigration).toContain(
      "staff_record.account_claimed_at is not null"
    );
    expect(hardeningMigration).toContain(
      "and staff.account_claimed_at is null"
    );
    expect(claimRoute).toContain('.rpc("claim_staff_profile"');
  });

  it("inherits the stored role and ignores client role fields and privileged usernames", () => {
    expect(hardeningMigration).toContain("staff_record.assigned_role");
    expect(claimRoute).not.toMatch(/body\.(role|assignedRole|assigned_role)/);
    expect(claimRoute).not.toMatch(
      /username\s*===\s*["'](?:admin|administrator|director|lead|burj)["']/
    );
    expect(hardeningMigration).not.toMatch(
      /normalized_username\s*=\s*'(?:admin|administrator|director|lead|burj)'/
    );
  });

  it("does not expose roles or internal database identifiers during activation", () => {
    expect(claimRoute).not.toContain("staffProfileId: claimedProfile");
    expect(claimRoute).not.toContain("departmentId: claimedProfile");
    expect(claimRoute).not.toContain("role: claimedProfile");
    expect(claimRoute).not.toContain("operationsRole: claimedProfile");
    expect(sessionStatusRoute).not.toContain("role: auth.context");
    expect(sessionStatusRoute).not.toContain("operationsRole: auth.context");
    expect(loginForm).not.toContain("staffProfileId: onboardingContext");
    expect(loginForm).not.toContain("departmentId: onboardingContext");
    expect(contactRoute).toContain('.eq("auth_user_id", auth.context.authUserId)');
    expect(notificationsRoute).toContain("auth.context.staffProfileId");
    expect(notificationsRoute).toContain("auth.context.departmentId");
  });

  it("keeps access changes audited and protects the final administrator", () => {
    expect(hardeningMigration).toContain(
      "create or replace function public.protect_active_administrator"
    );
    expect(hardeningMigration).toContain(
      "pg_catalog.pg_advisory_xact_lock"
    );
    expect(hardeningMigration).toContain("'staff_access_changed'");
    expect(hardeningMigration).toContain("'staff_account_reset'");
    expect(hardeningMigration).toContain(
      "actor_profile_id uuid := public.current_profile_id()"
    );
  });
});
