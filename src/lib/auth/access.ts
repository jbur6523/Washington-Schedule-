import type { AuthenticatedUserContext } from "@/lib/auth/types";

export function isCommandCenter(context: Pick<AuthenticatedUserContext, "operationsRole">) {
  return context.operationsRole === "command_center";
}

export function isDirector(context: Pick<AuthenticatedUserContext, "operationsRole">) {
  return context.operationsRole === "director";
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
  return context.role === "admin" || context.role === "lead" || isDirector(context);
}

export function canEditIcuCommandCenter(context: Pick<AuthenticatedUserContext, "role" | "operationsRole">) {
  return context.role === "admin" || isIcuCommandCenter(context);
}

export function canViewIcuCommandCenter(context: Pick<AuthenticatedUserContext, "role" | "operationsRole">) {
  return canEditIcuCommandCenter(context) || isDirector(context) || isCommandCenter(context);
}
