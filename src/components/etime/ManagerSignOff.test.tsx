import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reviewForm } from "@/test/etime-fixtures";
import { ManagerSignOff } from "./ManagerSignOff";

describe("visible manager sign-off", () => {
  it("shows first-use signature entry immediately without a PDF click", () => {
    const onSign = vi.fn();
    render(
      <ManagerSignOff
        form={reviewForm()}
        name="Ramon Hollander"
        busy={false}
        onSign={onSign}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Manager sign-off" }),
    ).toBeVisible();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Ramon Hollander" },
    });
    expect(
      screen.getByRole("button", { name: "Sign Timecard" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Sign Timecard" }));
    expect(onSign).toHaveBeenCalledWith("Ramon Hollander", true);
  });
  it("shows a saved signature immediately but still requires adoption", () => {
    render(
      <ManagerSignOff
        form={reviewForm()}
        name="Ramon Hollander"
        savedName="Ramon Hollander"
        busy={false}
        onSign={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Signature preview")).toHaveTextContent(
      "Ramon Hollander",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign Timecard" }),
    ).toBeDisabled();
  });
  it("explains a missing employee signature even when every entry is initialed", () => {
    const form = reviewForm();
    delete form.state.employeeSignature;
    render(
      <ManagerSignOff
        form={form}
        name="Ramon Hollander"
        busy={false}
        onSign={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Manager sign-off" }),
    ).toBeVisible();
    expect(screen.getByText(/Awaiting employee signature/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Sign Timecard" }),
    ).not.toBeInTheDocument();
  });
});
