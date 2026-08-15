import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandCenterTabs } from "@/components/CommandCenterTabs";

vi.mock("next/navigation", () => ({ usePathname: () => "/command-center/schedule" }));

describe("CommandCenterTabs", () => {
  it("places Schedule between Live Board and History and marks its real route active", () => {
    render(<CommandCenterTabs />);
    const links = screen.getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual(["Live Board", "Schedule", "History"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/command-center",
      "/command-center/schedule",
      "/command-center/history"
    ]);
    expect(screen.getByRole("link", { name: "Schedule" })).toHaveAttribute("aria-current", "page");
  });
});
