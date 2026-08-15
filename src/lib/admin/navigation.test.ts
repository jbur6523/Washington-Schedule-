import { describe, expect, it } from "vitest";
import tailwindConfig from "../../../tailwind.config";
import { adminDashboardAreas, getProfileDashboardShortcut } from "./navigation";

describe("admin navigation", () => {
  it("links administrators directly to the admin dashboard", () => {
    expect(getProfileDashboardShortcut({ role: "admin", operationsRole: "none" })).toEqual({
      href: "/admin",
      label: "Admin View"
    });
  });

  it("preserves the operations dashboard for leads and aides", () => {
    expect(getProfileDashboardShortcut({ role: "lead", operationsRole: "none" })).toEqual({
      href: "/operations",
      label: "Lead"
    });
    expect(getProfileDashboardShortcut({ role: "staff", operationsRole: "aide" })).toEqual({
      href: "/operations",
      label: "Aide"
    });
  });

  it("does not expose an operations shortcut to other staff", () => {
    expect(getProfileDashboardShortcut({ role: "staff", operationsRole: "none" })).toBeNull();
  });

  it("shows the eight approved admin dashboard areas", () => {
    expect(adminDashboardAreas.map((area) => area.title)).toEqual([
      "Lead Command Board",
      "Leadership Dashboard",
      "ICU Command Center",
      "Rental Management",
      "Order Management",
      "Staff Management",
      "Import Schedule",
      "RVU & Staffing Metrics"
    ]);
  });

  it("keeps navigation palette classes in Tailwind's scanned source tree", () => {
    expect(tailwindConfig.content).toContain("./src/**/*.{js,ts,jsx,tsx,mdx}");
  });
});
