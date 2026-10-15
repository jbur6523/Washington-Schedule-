import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Signature } from "./Signature";

describe("reviewer signature adoption", () => {
  it("shows a saved signature but requires fresh consent for each form revision", () => {
    const onSign = vi.fn();
    const { rerender } = render(
      <Signature
        key="form-a:1"
        expected="Ramon Hollander"
        savedName="Ramon Hollander"
        busy={false}
        label="Sign Timecard"
        onSign={onSign}
      />,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Signature preview")).toHaveTextContent(
      "Ramon Hollander",
    );
    expect(
      screen.getByRole("button", { name: "Sign Timecard" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Sign Timecard" }));
    expect(onSign).toHaveBeenCalledWith("Ramon Hollander", true);
    rerender(
      <Signature
        key="form-a:2"
        expected="Ramon Hollander"
        savedName="Ramon Hollander"
        busy={false}
        label="Sign Timecard"
        onSign={onSign}
      />,
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Sign Timecard" }),
    ).toBeDisabled();
  });

  it("requires a typed name on first use and clears consent when it changes", () => {
    render(
      <Signature expected="Ramon Hollander" busy={false} onSign={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Ramon Hollander" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button")).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Ramon" },
    });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
