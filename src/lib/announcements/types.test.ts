import { describe, expect, it } from "vitest";
import {
  announcementMessageLimit,
  announcementTitleLimit,
  validateAnnouncementInput
} from "@/lib/announcements/types";

describe("department announcement validation", () => {
  it("requires and trims both fields", () => {
    expect(validateAnnouncementInput("", "Message")).toEqual({
      error: "Announcement title and message are required."
    });
    expect(validateAnnouncementInput(" Title ", " Message\nline two ")).toEqual({
      title: "Title",
      message: "Message\nline two"
    });
  });

  it("enforces the title and message limits", () => {
    expect(validateAnnouncementInput("T".repeat(announcementTitleLimit + 1), "Message")).toEqual({
      error: "Announcement title must be 120 characters or fewer."
    });
    expect(validateAnnouncementInput("Title", "M".repeat(announcementMessageLimit + 1))).toEqual({
      error: "Announcement message must be 2,000 characters or fewer."
    });
  });
});
