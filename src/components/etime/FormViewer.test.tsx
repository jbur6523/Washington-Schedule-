import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewForm } from "@/test/etime-fixtures";
import { FormViewer } from "./FormViewer";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: new Promise(() => {}), destroy: vi.fn() }),
}));
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("PDF manager signature control", () => {
  const manager = {
    name: "Ramon Hollander",
    savedName: "Ramon Hollander",
    onSign: vi.fn(),
  };
  it("allows timekeepers to initial but never exposes manager signing", () => {
    const form = reviewForm();
    delete form.state.entries[2].entered;
    const onInitial = vi.fn();
    const { rerender } = render(
      <FormViewer form={form} busy={false} onInitial={onInitial} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Confirm eTime entry/ }),
    );
    expect(onInitial).toHaveBeenCalledWith(expect.objectContaining(form.state.entries[2]));
    expect(
      screen.queryByRole("button", { name: /Sign Timecard/ }),
    ).not.toBeInTheDocument();
    rerender(
      <FormViewer form={reviewForm()} busy={false} onInitial={onInitial} />,
    );
    expect(
      screen.queryByRole("button", { name: /Sign Timecard/ }),
    ).not.toBeInTheDocument();
  });

  it("requires complete entry before exposing the PDF field and explicit adoption before signing", () => {
    const form = reviewForm();
    const entered = form.state.entries[2].entered;
    delete form.state.entries[2].entered;
    const { rerender } = render(
      <FormViewer form={form} busy={false} manager={manager} />,
    );
    expect(
      screen.queryByRole("button", { name: /Sign Timecard/ }),
    ).not.toBeInTheDocument();
    form.state.entries[2].entered = entered;
    rerender(<FormViewer form={form} busy={false} manager={manager} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sign Timecard in Manager/Director Signature field",
      }),
    );
    expect(screen.getByLabelText("Signature preview")).toHaveTextContent(
      "Ramon Hollander",
    );
    expect(
      screen.getByRole("button", { name: "Sign Timecard" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Sign Timecard" }),
    );
    expect(manager.onSign).toHaveBeenCalledWith("Ramon Hollander", true);
    form.state.managerSignature = {
      ...form.state.employeeSignature!,
      name: manager.name,
    };
    rerender(<FormViewer form={form} busy={false} manager={manager} />);
    expect(
      screen.queryByRole("button", { name: /Sign Timecard/ }),
    ).not.toBeInTheDocument();
  });
});
