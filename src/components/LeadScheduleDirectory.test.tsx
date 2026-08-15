import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeadScheduleDirectory } from "@/components/LeadScheduleDirectory";
import type { DirectoryStaffProfile, ScheduledDirectoryEmployee } from "@/lib/lead-schedule/directory";

vi.mock("next/navigation", () => ({ usePathname: () => "/command-center/schedule" }));

const schedule: ScheduledDirectoryEmployee[] = [
  {
    id: "kinty",
    fullName: "Kinty Khera",
    phoneNumber: "510-501-6630",
    hireDate: "2001-10-01",
    employmentType: "full_time",
    directoryAvailable: true
  },
  {
    id: "legacy",
    fullName: "Legacy Schedule Name",
    phoneNumber: null,
    hireDate: null,
    employmentType: "per_diem",
    directoryAvailable: false
  }
];

const directory: DirectoryStaffProfile[] = [
  {
    id: "pd",
    display_name: "Mona Ahmed",
    first_name: "Mona",
    last_name: "Ahmed",
    hire_date: "2004-06-21",
    phone_number: "510-579-0556",
    employment_type: "per_diem",
    home_assignment: "day_shift",
    operations_role: "none",
    directory_shift: "day",
    name_aliases: [],
    is_active: true
  },
  {
    id: "kinty",
    display_name: "Pawanjit Khera",
    first_name: "Kinty",
    last_name: "Khera",
    hire_date: "2001-10-01",
    phone_number: "510-501-6630",
    employment_type: "full_time",
    home_assignment: "day_shift",
    operations_role: "none",
    directory_shift: "day",
    name_aliases: ["Pawanjit Khera"],
    is_active: true
  }
];

describe("LeadScheduleDirectory", () => {
  it("renders compact responsive schedule rows, tappable phones, missing metadata, and the selected controls", () => {
    const view = render(
      <LeadScheduleDirectory
        selectedDate="2026-08-15"
        selectedShift="day"
        schedule={schedule}
        directory={directory}
        scheduleError={false}
        directoryError={false}
      />
    );

    expect(screen.getByText("Sorted by seniority · Most senior first")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-08-15")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Day Shift")).toBeInTheDocument();
    expect(screen.getAllByText("Legacy Schedule Name").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Directory information unavailable").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /510-501-6630/ }).every((link) => link.getAttribute("href") === "tel:5105016630")).toBe(true);
    expect(view.container.querySelector("ul.md\\:hidden")).toBeInTheDocument();
    expect(view.container.querySelector("div.hidden.overflow-x-auto.md\\:block table")).toBeInTheDocument();
  });

  it("keeps familiar directory sections, filters employment type, and searches internal aliases", () => {
    render(
      <LeadScheduleDirectory
        selectedDate="2026-08-15"
        selectedShift="day"
        schedule={[]}
        directory={directory}
        scheduleError={false}
        directoryError={false}
      />
    );

    expect(screen.getByRole("heading", { name: "Per Diem" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Full-Time Day Shift" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Full Time" }));
    expect(screen.queryByRole("heading", { name: "Per Diem" })).not.toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "Search employees" });
    fireEvent.change(search, { target: { value: "Pawanjit" } });
    const daySection = screen.getByRole("heading", { name: "Full-Time Day Shift" }).closest("section");
    expect(daySection).not.toBeNull();
    if (daySection) {
      expect(within(daySection).getAllByText("Kinty Khera").length).toBeGreaterThan(0);
      expect(within(daySection).queryByText("Pawanjit Khera")).not.toBeInTheDocument();
    }
  });

  it("keeps the schedule visible when directory metadata fails", () => {
    render(
      <LeadScheduleDirectory
        selectedDate="2026-08-15"
        selectedShift="night"
        schedule={schedule}
        directory={[]}
        scheduleError={false}
        directoryError
      />
    );

    expect(screen.getAllByText("Kinty Khera").length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent("current schedule above is still available");
  });
});
