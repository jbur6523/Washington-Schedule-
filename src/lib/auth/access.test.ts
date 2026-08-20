import { describe, expect, it } from "vitest";
import {
  authenticatedLandingPath,
  canCreateLeadCommunication,
  canEditIcuCommandCenter,
  canManageDepartmentAnnouncement,
  canManageShiftStatus,
  canReplyToLeadCommunication,
  canUseNotifications,
  canViewDirectorShiftStatus,
  canViewIcuCommandCenter,
  canViewMetrics,
  canViewRvuStaffingMetrics,
  hasOperationsDashboardAccess,
  hasOrderManagementAccess,
  hasRentalManagementAccess
} from "@/lib/auth/access";
import type { AppRole, OperationsRole } from "@/lib/auth/types";

function accessContext(role: AppRole, operationsRole: OperationsRole = "none") {
  return { role, operationsRole };
}

describe("role permission matrix", () => {
  it("keeps regular staff outside privileged operational workflows", () => {
    const staff = accessContext("staff");

    expect(hasOperationsDashboardAccess(staff)).toBe(false);
    expect(hasRentalManagementAccess(staff)).toBe(false);
    expect(hasOrderManagementAccess(staff)).toBe(false);
    expect(canManageShiftStatus(staff)).toBe(false);
    expect(canManageDepartmentAnnouncement(staff)).toBe(false);
    expect(canViewDirectorShiftStatus(staff)).toBe(false);
    expect(canEditIcuCommandCenter(staff)).toBe(false);
    expect(canViewIcuCommandCenter(staff)).toBe(false);
    expect(canViewMetrics(staff)).toBe(false);
    expect(canViewRvuStaffingMetrics(staff)).toBe(false);
  });

  it("allows leads to manage shared shift operations without ICU edit access", () => {
    const lead = accessContext("lead");

    expect(hasOperationsDashboardAccess(lead)).toBe(true);
    expect(hasRentalManagementAccess(lead)).toBe(true);
    expect(hasOrderManagementAccess(lead)).toBe(false);
    expect(canManageShiftStatus(lead)).toBe(true);
    expect(canManageDepartmentAnnouncement(lead)).toBe(true);
    expect(canViewDirectorShiftStatus(lead)).toBe(true);
    expect(canEditIcuCommandCenter(lead)).toBe(false);
    expect(canViewMetrics(lead)).toBe(false);
    expect(canViewRvuStaffingMetrics(lead)).toBe(false);
  });

  it("keeps each operations role scoped to its intended surface", () => {
    const aide = accessContext("staff", "aide");
    const commandCenter = accessContext("staff", "command_center");
    const director = accessContext("staff", "director");
    const icu = accessContext("staff", "icu_command_center");

    expect(hasOperationsDashboardAccess(aide)).toBe(true);
    expect(hasOrderManagementAccess(aide)).toBe(true);
    expect(canManageShiftStatus(aide)).toBe(false);
    expect(canManageDepartmentAnnouncement(aide)).toBe(false);

    expect(hasRentalManagementAccess(commandCenter)).toBe(true);
    expect(canManageShiftStatus(commandCenter)).toBe(true);
    expect(canManageDepartmentAnnouncement(commandCenter)).toBe(true);
    expect(canViewIcuCommandCenter(commandCenter)).toBe(true);
    expect(canEditIcuCommandCenter(commandCenter)).toBe(false);
    expect(canReplyToLeadCommunication(commandCenter)).toBe(true);

    expect(canViewDirectorShiftStatus(director)).toBe(true);
    expect(canManageDepartmentAnnouncement(director)).toBe(true);
    expect(canViewIcuCommandCenter(director)).toBe(true);
    expect(canEditIcuCommandCenter(director)).toBe(false);
    expect(canUseNotifications(director)).toBe(true);

    expect(canEditIcuCommandCenter(icu)).toBe(true);
    expect(canManageDepartmentAnnouncement(icu)).toBe(false);
    expect(canViewIcuCommandCenter(icu)).toBe(true);
    expect(canViewDirectorShiftStatus(icu)).toBe(false);
  });

  it("restricts Leadership accounts to their dashboard and communication capabilities", () => {
    const leadership = accessContext("staff", "leadership");

    expect(authenticatedLandingPath(leadership)).toBe("/director/shift-status");
    expect(canViewDirectorShiftStatus(leadership)).toBe(true);
    expect(canManageDepartmentAnnouncement(leadership)).toBe(true);
    expect(canCreateLeadCommunication(leadership)).toBe(true);
    expect(canReplyToLeadCommunication(leadership)).toBe(true);
    expect(canUseNotifications(leadership)).toBe(false);

    expect(hasOperationsDashboardAccess(leadership)).toBe(false);
    expect(hasRentalManagementAccess(leadership)).toBe(false);
    expect(hasOrderManagementAccess(leadership)).toBe(false);
    expect(canManageShiftStatus(leadership)).toBe(false);
    expect(canEditIcuCommandCenter(leadership)).toBe(false);
    expect(canViewIcuCommandCenter(leadership)).toBe(false);
    expect(canViewMetrics(leadership)).toBe(false);
    expect(canViewRvuStaffingMetrics(leadership)).toBe(false);
  });

  it("retains administrator access across management surfaces", () => {
    const admin = accessContext("admin");

    expect(hasOperationsDashboardAccess(admin)).toBe(true);
    expect(hasRentalManagementAccess(admin)).toBe(true);
    expect(hasOrderManagementAccess(admin)).toBe(true);
    expect(canManageShiftStatus(admin)).toBe(true);
    expect(canManageDepartmentAnnouncement(admin)).toBe(true);
    expect(canViewDirectorShiftStatus(admin)).toBe(true);
    expect(canEditIcuCommandCenter(admin)).toBe(true);
    expect(canViewIcuCommandCenter(admin)).toBe(true);
    expect(canViewMetrics(admin)).toBe(true);
    expect(canViewRvuStaffingMetrics(admin)).toBe(true);
  });
});
