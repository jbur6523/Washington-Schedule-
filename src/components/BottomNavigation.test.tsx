import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNavigation } from "@/components/BottomNavigation";

describe("BottomNavigation", () => {
  it("renders four internal tabs and an inactive external Email shortcut", () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <BottomNavigation activeTab="schedule" onTabChange={onTabChange} />
    );

    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Schedule" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("button", { name: "Manage Schedule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cover/Switch" })).toBeInTheDocument();
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
    render(<BottomNavigation activeTab="staff" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Manage Schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Cover/Switch" }));
    fireEvent.click(screen.getByRole("button", { name: "Staff" }));

    expect(onTabChange.mock.calls.map(([tab]) => tab)).toEqual([
      "schedule",
      "manage-schedule",
      "shift-board",
      "staff"
    ]);
    expect(screen.getByRole("button", { name: "Staff" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
