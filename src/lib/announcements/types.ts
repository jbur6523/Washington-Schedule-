export const announcementTitleLimit = 120;
export const announcementMessageLimit = 2000;

export type DepartmentAnnouncement = {
  id: string;
  department_id: string;
  title: string;
  message: string;
  updated_by_staff_profile_id: string | null;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
};

export function validateAnnouncementInput(title: unknown, message: unknown) {
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedMessage = typeof message === "string" ? message.trim() : "";

  if (!normalizedTitle || !normalizedMessage) {
    return { error: "Announcement title and message are required." } as const;
  }

  if (normalizedTitle.length > announcementTitleLimit) {
    return { error: `Announcement title must be ${announcementTitleLimit} characters or fewer.` } as const;
  }

  if (normalizedMessage.length > announcementMessageLimit) {
    return { error: `Announcement message must be ${announcementMessageLimit.toLocaleString()} characters or fewer.` } as const;
  }

  return { title: normalizedTitle, message: normalizedMessage } as const;
}
