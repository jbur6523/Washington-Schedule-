import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayScheduleCard } from "@/components/DayScheduleCard";
import type { ScheduleDay } from "@/data/mockSchedule";

describe("DayScheduleCard personal status retirement", () => {
  it("does not display dormant personal status data beneath employee names", () => {
    const day = {
      day: "Wednesday 8/5",
      dateValue: "2026-08-05",
      scheduled: [
        {
          id: "entry-1",
          staffProfileId: "staff-1",
          staffName: "Employee Name",
          shiftTime: "06:30-19:00",
          shiftCategory: "day",
          staffType: "Full-time",
          status: "Scheduled",
          statusMessage: "This legacy status must not render"
        }
      ],
      available: [],
      coverageRequests: [],
      shiftPosts: []
    } as unknown as ScheduleDay;

    render(
      <DayScheduleCard
        day={day}
        expanded
        shiftFilter="all"
        onToggle={() => undefined}
      />
    );

    expect(screen.getByText("Employee Name")).toBeInTheDocument();
    expect(screen.queryByText("This legacy status must not render")).not.toBeInTheDocument();
  });
});
