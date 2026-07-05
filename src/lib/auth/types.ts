export type AppRole = "admin" | "lead" | "staff";
export type OperationsRole = "none" | "aide" | "command_center" | "director";

export type AuthenticatedUserContext = {
  authUserId: string;
  profileId: string;
  staffProfileId: string | null;
  departmentId: string;
  departmentName: string;
  role: AppRole;
  operationsRole: OperationsRole;
  displayName: string;
  hasLinkedStaffProfile: boolean;
};

export type AuthContextResult =
  | { status: "authenticated"; context: AuthenticatedUserContext }
  | { status: "unauthenticated" }
  | { status: "unassigned"; displayName?: string };
