import {
  compactPersonName,
  normalizePersonName,
  normalizeStaffUsername
} from "@/lib/schedule-import/parser";

export type MatchableStaff = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  username: string;
  username_normalized: string;
};

export function matchScheduleStaff(identifier: string, staff: MatchableStaff[]) {
  const username = normalizeStaffUsername(identifier);
  const usernameMatches = staff.filter(
    (profile) => normalizeStaffUsername(profile.username_normalized || profile.username) === username
  );
  if (usernameMatches.length === 1) return { profile: usernameMatches[0], source: "username" as const };

  const exactDisplay = staff.filter(
    (profile) => profile.display_name.trim().toLowerCase() === identifier.trim().toLowerCase()
  );
  if (exactDisplay.length === 1) return { profile: exactDisplay[0], source: "display_name" as const };

  const compactIdentifier = compactPersonName(identifier);
  const fullName = staff.filter((profile) => compactPersonName(profile.display_name) === compactIdentifier);
  if (fullName.length === 1) return { profile: fullName[0], source: "full_name" as const };

  const normalizedIdentifier = normalizePersonName(identifier);
  const lastName = staff.filter((profile) => {
    const profileLastName = profile.last_name || profile.display_name.split(/\s+/).at(-1) || "";
    return normalizePersonName(profileLastName) === normalizedIdentifier;
  });
  if (lastName.length === 1) return { profile: lastName[0], source: "last_name" as const };
  if (lastName.length > 1) return { profile: null, source: "ambiguous" as const };
  return { profile: null, source: "unmatched" as const };
}
