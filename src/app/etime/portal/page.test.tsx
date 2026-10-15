import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reviewer } from "@/lib/etime/server";
import PortalPage from "./page";

vi.mock("@/lib/etime/server", () => ({ reviewer: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
}));
vi.mock("@/components/etime/EtimeClient", () => ({
  EtimeClient: ({ demoView }: { demoView?: string }) => (
    <div data-testid="portal">{demoView ?? "assigned role"}</div>
  ),
}));

function grant(
  role: "manager" | "timekeeper" | "identity_admin",
  temporary = false,
) {
  vi.mocked(reviewer).mockResolvedValue({
    id: "test",
    department_id: "department",
    auth_user_id: "user",
    username: "test",
    display_name: "Test Administrator",
    initials: "TA",
    saved_signature_name: null,
    role,
    temporary_manager_access: temporary,
    active: true,
    portal_only: false,
  });
}
describe("temporary admin role chooser", () => {
  it("offers both workflows when temporary access is opened", async () => {
    grant("identity_admin", true);
    render(await PortalPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("link", { name: /Timekeeper \(Olive\)/ }),
    ).toHaveAttribute("href", "/etime/portal?view=timekeeper");
    expect(
      screen.getByRole("link", { name: /Manager \(Ramon\)/ }),
    ).toHaveAttribute("href", "/etime/portal?view=manager");
  });
  it.each(["timekeeper", "manager"])(
    "opens the chosen %s view",
    async (view) => {
      grant("identity_admin", true);
      render(await PortalPage({ searchParams: Promise.resolve({ view }) }));
      expect(screen.getByTestId("portal")).toHaveTextContent(view);
    },
  );
  it("keeps ordinary timekeepers on their own role even with a manager URL", async () => {
    grant("timekeeper");
    render(
      await PortalPage({ searchParams: Promise.resolve({ view: "manager" }) }),
    );
    expect(screen.getByTestId("portal")).toHaveTextContent("assigned role");
  });
  it("denies revoked temporary access to both role URLs", async () => {
    grant("identity_admin");
    await expect(
      PortalPage({ searchParams: Promise.resolve({ view: "manager" }) }),
    ).rejects.toThrow("redirect");
  });
});
