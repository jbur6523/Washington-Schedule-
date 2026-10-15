import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNavigation } from "@/components/BottomNavigation";

describe("BottomNavigation", () => {
  it("omits ICU and retains four evenly spaced controls for Aides", () => {
    const { container } = render(<BottomNavigation activeTab="schedule" onTabChange={vi.fn()} canAccessIcu={false} />);
    expect(screen.queryByRole("link", { name: "ICU" })).not.toBeInTheDocument();
    expect(container.querySelector(".grid-cols-4")?.children).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email" })).toBeInTheDocument();
  });
  it("renders three tabs, a same-session ICU link, and an external Email shortcut", () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <BottomNavigation activeTab="schedule" onTabChange={onTabChange} canAccessIcu />
    );

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.queryByRole("button", { name: "Manage Schedule" })).not.toBeInTheDocument();
    const icuLink = screen.getByRole("link", { name: "ICU" });
    expect(icuLink).toHaveAttribute("href", "/icu-command-center");
    expect(icuLink).not.toHaveAttribute("target");
    expect(icuLink.querySelector("svg")).toHaveClass("lucide-bed");
    expect(screen.getByRole("button", { name: "Time Card" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Staff" })).toBeInTheDocument();
    expect(screen.queryByText("Gossip")).not.toBeInTheDocument();

    const emailLink = screen.getByRole("link", { name: "Email" });
    expect(emailLink).toHaveAttribute("href", "https://mail.whhs.com/owa/");
    expect(emailLink).toHaveAttribute("target", "_blank");
    expect(emailLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(emailLink).toHaveClass("text-slate-500", "hover:bg-slate-50");
    expect(emailLink).not.toHaveAttribute("aria-current");
    expect(emailLink.querySelector("svg")).toHaveClass("lucide-mail");

    fireEvent.click(emailLink);
    expect(onTabChange).not.toHaveBeenCalled();
    expect(container.querySelector(".grid-cols-5")?.children).toHaveLength(5);
  });

  it("keeps the other navigation buttons wired to their existing tabs", () => {
    const onTabChange = vi.fn();
    render(<BottomNavigation activeTab="staff" onTabChange={onTabChange} canAccessIcu />);

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Time Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Staff" }));

    expect(onTabChange.mock.calls.map(([tab]) => tab)).toEqual([
      "schedule",
      "time-card",
      "staff"
    ]);
    expect(screen.getByRole("button", { name: "Staff" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
