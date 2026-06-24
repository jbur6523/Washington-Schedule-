export type AppRole = "admin" | "staff";

export type AuthenticatedUserContext = {
  authUserId: string;
  profileId: string;
  staffProfileId: string | null;
  departmentId: string;
  departmentName: string;
  role: AppRole;
  displayName: string;
  hasLinkedStaffProfile: boolean;
};

export type AuthContextResult =
  | { status: "authenticated"; context: AuthenticatedUserContext }
  | { status: "unauthenticated" }
  | { status: "unassigned"; displayName?: string };
