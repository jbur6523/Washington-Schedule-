import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reviewForm } from "@/test/etime-fixtures";
import { ReviewFolders } from "./ReviewFolders";

describe("role-based folders", () => {
  it("shows two timekeeper folders and counts whole forms regardless of signing", () => {
    const ready = reviewForm("ready");
    const signed = reviewForm("signed");
    signed.state.managerSignature = signed.state.employeeSignature;
    render(
      <ReviewFolders
        forms={[ready, signed]}
        category=""
        role="timekeeper"
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Pending (0)")).toBeInTheDocument();
    expect(screen.getByLabelText("Completed (2)")).toBeInTheDocument();
    expect(document.querySelectorAll("summary")).toHaveLength(2);
    expect(
      screen.queryByText(/Entered — Signature Needed/),
    ).not.toBeInTheDocument();
  });

  it("keeps a partially entered form pending even when a category filter matches only entered rows", () => {
    const partial = reviewForm();
    delete partial.state.entries[2].entered;
    render(
      <ReviewFolders
        forms={[partial]}
        category="lunch"
        role="manager"
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Pending (1)")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Entered — Signature Needed (0)"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Approved Exceptions (0)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 of 3 entries initialed · Manager signature needed"),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("li")).toHaveLength(1);
  });

  it("separates manager stages, sorts employees, and opens the same underlying form", () => {
    const z = reviewForm("z", "Zebra");
    const a = reviewForm("a", "Adams");
    const approved = reviewForm("approved", "Signed");
    approved.state.managerSignature = approved.state.employeeSignature;
    const onOpen = vi.fn();
    render(
      <ReviewFolders
        forms={[z, approved, a]}
        category=""
        role="manager"
        onOpen={onOpen}
      />,
    );
    const folder = screen
      .getByLabelText("Entered — Signature Needed (2)")
      .closest("details")!;
    fireEvent.click(within(folder).getByText(/Entered — Signature Needed/));
    const buttons = within(folder).getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Adams, Test");
    expect(buttons[1]).toHaveTextContent("Zebra, Test");
    fireEvent.click(buttons[0]);
    expect(onOpen).toHaveBeenCalledWith(a);
    expect(
      screen.getByLabelText("Approved Exceptions (1)"),
    ).toBeInTheDocument();
  });
});
