// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608050001_department_announcements.sql"),
  "utf8"
);
const appClient = readFileSync(resolve(process.cwd(), "src/app/app-client.tsx"), "utf8");
const dayScheduleCard = readFileSync(resolve(process.cwd(), "src/components/DayScheduleCard.tsx"), "utf8");
const commandCenter = readFileSync(resolve(process.cwd(), "src/components/CommandCenterClient.tsx"), "utf8");
const directorDashboard = readFileSync(
  resolve(process.cwd(), "src/components/DirectorShiftStatusClient.tsx"),
  "utf8"
);

describe("department announcement migration and integration contract", () => {
  it("keeps one canonical announcement per department with required validation and attribution", () => {
    expect(migration).toContain("constraint department_announcements_department_unique unique (department_id)");
    expect(migration).toContain("char_length(title) between 1 and 120");
    expect(migration).toContain("char_length(message) between 1 and 2000");
    expect(migration).toContain("updated_by_staff_profile_id uuid references public.staff_profiles(id)");
    expect(migration).toContain("before insert or update on public.department_announcements");
    expect(migration).toContain("new.updated_by_staff_profile_id := actor_staff_profile_id");
    expect(migration).toContain("new.updated_by_name := actor_name");
  });

  it("allows department members to read while restricting every mutation policy", () => {
    expect(migration).toContain("using (public.user_is_department_member(department_id))");
    expect(migration).toContain("Lead and director users can create announcements");
    expect(migration).toContain("Lead and director users can update announcements");
    expect(migration).toContain("Lead and director users can clear announcements");
    expect(migration).toContain("public.user_is_department_lead(department_id)");
    expect(migration).toContain("public.user_is_command_center(department_id)");
    expect(migration).toContain("public.user_is_department_director(department_id)");
    expect(migration).toContain("raise exception 'Announcement management access is required.'");
  });

  it("publishes full department-scoped rows for realtime replacement and clearing", () => {
    expect(migration).toContain("alter table public.department_announcements replica identity full");
    expect(migration).toContain("alter publication supabase_realtime");
    expect(migration).toContain("add table public.department_announcements");
  });

  it("uses the shared editor in both management locations", () => {
    expect(commandCenter).toContain(
      '<DepartmentAnnouncementManagerCard departmentId={authContext.departmentId} timezone={timezone} />'
    );
    expect(directorDashboard).toContain("<DepartmentAnnouncementManagerDialog");
    expect(commandCenter).not.toContain("<DepartmentAnnouncementEditor");
    expect(directorDashboard).not.toContain("<DepartmentAnnouncementEditor");
  });

  it("keeps the requested Lead card order and moves the Director action into its compact menu", () => {
    const leadCardLabels = [
      "Shift Update",
      "ICU Snapshot",
      "Lead Communication Board",
      "Phone List",
      "Aide Communication Board",
      "Rental Management",
      "Short Shift Alert",
      "<DepartmentAnnouncementManagerCard"
    ];
    const leadCardPositions = leadCardLabels.map((label) => commandCenter.indexOf(label));
    expect(leadCardPositions.every((position) => position >= 0)).toBe(true);
    expect(leadCardPositions).toEqual([...leadCardPositions].sort((left, right) => left - right));

    const directorHeader = directorDashboard.slice(
      directorDashboard.indexOf("Director View"),
      directorDashboard.indexOf("Current Shift Status")
    );
    expect(directorHeader).toContain("<MenuIcon");
    expect(directorHeader).toContain("Menu");
    expect(directorHeader).not.toContain("Announcement Board");
    expect(directorHeader).not.toContain("Respiratory Directory");
    expect(directorHeader).not.toContain("Lead Communication Board");
    expect(directorHeader).not.toContain("Sign Out");
    expect(directorDashboard).toContain("setAnnouncementOpen(true)");
    expect(directorDashboard).not.toContain("<DepartmentAnnouncementManagerCard");
  });

  it("replaces only personal status while preserving Current Shift Status and filter independence", () => {
    expect(appClient).toContain(
      '<CurrentShiftStatusSummary authContext={authContext} timezone={timezone} />'
    );
    expect(appClient).toContain("<DepartmentAnnouncementBoard");
    expect(appClient.indexOf("<DepartmentAnnouncementBoard")).toBeLessThan(
      appClient.indexOf("{visibleDays.map((day) =>")
    );
    expect(appClient).not.toContain("MyStatusCard");
    expect(appClient).not.toContain("My Status");
    expect(appClient).not.toContain("/api/settings/status");
    expect(dayScheduleCard).not.toContain("statusMessage");
    expect(migration).not.toContain("shift_status_updates");
    expect(migration).not.toMatch(/drop\s+column\s+(if\s+exists\s+)?status_(message|updated_at)/i);
    expect(
      existsSync(resolve(process.cwd(), "src/app/api/settings/status/route.ts"))
    ).toBe(false);
  });
});
