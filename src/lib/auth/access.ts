import type { AuthenticatedUserContext } from "@/lib/auth/types";

export function isCommandCenter(context: Pick<AuthenticatedUserContext, "operationsRole">) {
  return context.operationsRole === "command_center";
}

export function isDirector(context: Pick<AuthenticatedUserContext, "operationsRole">) {
  return context.operationsRole === "director";
}

export function isLeadership(context: Pick<AuthenticatedUserContext, "operationsRole">) {
  return context.operationsRole === "leadership";
}

export function isIcuCommandCenter(context: Pick<AuthenticatedUserContext, "operationsRole">) {
  return context.operationsRole === "icu_command_center";
}

export function hasOperationsDashboardAccess(context: Pick<AuthenticatedUserContext, "role" | "operationsRole">) {
  return context.role === "admin" || context.role === "lead" || context.operationsRole === "aide";
}

export function hasRentalManagementAccess(context: Pick<AuthenticatedUserContext, "role" | "operationsRole">) {
  return hasOperationsDashboardAccess(context) || isCommandCenter(context);
}

export function hasOrderManagementAccess(context: Pick<AuthenticatedUserContext, "role" | "operationsRole">) {
  return context.role === "admin" || context.operationsRole === "aide";
}

export function canManageShiftStatus(context: Pick<AuthenticatedUserContext, "role" | "operationsRole">) {
  return context.role === "admin" || context.role === "lead" || isCommandCenter(context);
}

export function canViewDirectorShiftStatus(context: Pick<AuthenticatedUserContext, "role" | "operationsRole">) {
  return context.role === "admin" || context.role === "lead" || isDirector(context) || isLeadership(context);
}

export function canViewMetrics(context: Pick<AuthenticatedUserContext, "role">) {
  return context.role === "admin";
}

export function canViewRvuStaffingMetrics(context: Pick<AuthenticatedUserContext, "role">) {
  return canViewMetrics(context);
}

export function canManageDepartmentAnnouncement(
  context: Pick<AuthenticatedUserContext, "role" | "operationsRole">
) {
  return canManageShiftStatus(context) || canViewDirectorShiftStatus(context);
}

export function canEditIcuCommandCenter(context: Pick<AuthenticatedUserContext, "role" | "operationsRole">) {
  return context.role === "admin" || isIcuCommandCenter(context);
}

export function canViewIcuCommandCenter(context: Pick<AuthenticatedUserContext, "role" | "operationsRole">) {
  return canEditIcuCommandCenter(context) || isDirector(context) || isCommandCenter(context);
}

export function canCreateLeadCommunication(
  context: Pick<AuthenticatedUserContext, "role" | "operationsRole">
) {
  return (
    context.role === "admin"
    || context.role === "lead"
    || isDirector(context)
    || isLeadership(context)
    || isIcuCommandCenter(context)
    || isCommandCenter(context)
  );
}

export function canReplyToLeadCommunication(
  context: Pick<AuthenticatedUserContext, "role" | "operationsRole">
) {
  return (
    context.role === "admin"
    || context.role === "lead"
    || isLeadership(context)
    || isCommandCenter(context)
  );
}

export function canUseNotifications(context: Pick<AuthenticatedUserContext, "operationsRole">) {
  return !isLeadership(context);
}

export function authenticatedLandingPath(context: Pick<AuthenticatedUserContext, "operationsRole">) {
  if (isCommandCenter(context)) {
    return "/command-center";
  }

  if (isIcuCommandCenter(context)) {
    return "/icu-command-center";
  }

  if (isDirector(context) || isLeadership(context)) {
    return "/director/shift-status";
  }

  return "/";
}
