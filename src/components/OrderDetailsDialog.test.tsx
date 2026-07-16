import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderDetailsDialog } from "@/components/OrderDetailsDialog";
import type { OrderWithPreview } from "@/lib/order-management/types";

function makeOrder(overrides: Partial<OrderWithPreview> = {}): OrderWithPreview {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    department_id: "00000000-0000-0000-0000-000000000002",
    created_by_staff_profile_id: "00000000-0000-0000-0000-000000000003",
    created_by_name: "Test User",
    req_number: "REQ-42",
    image_url: null,
    image_storage_path: null,
    notes: "Order notes",
    created_at: "2026-07-15T18:30:00.000Z",
    updated_at: "2026-07-15T18:30:00.000Z",
    signedImageUrl: null,
    department_order_lines: [
      {
        id: "line-2",
        order_id: "00000000-0000-0000-0000-000000000001",
        line_type: "non_catalog",
        pmm_number: null,
        item_name_snapshot: "Manual item",
        sort_order: 1,
        created_at: "2026-07-15T18:30:00.000Z"
      },
      {
        id: "line-1",
        order_id: "00000000-0000-0000-0000-000000000001",
        line_type: "pmm",
        pmm_number: "1356",
        item_name_snapshot: "Historical catalog name",
        sort_order: 0,
        created_at: "2026-07-15T18:30:00.000Z"
      }
    ],
    ...overrides
  };
}

describe("OrderDetailsDialog", () => {
  it("renders date, PMM number, stored item-name snapshot, manual items, and legacy fields", () => {
    render(<OrderDetailsDialog order={makeOrder()} onClose={vi.fn()} onOpenImage={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "View Order" })).toBeInTheDocument();
    expect(screen.getByText("PMM #1356")).toBeInTheDocument();
    expect(screen.getByText("Historical catalog name")).toBeInTheDocument();
    expect(screen.getByText("Manual item")).toBeInTheDocument();
    expect(screen.getByText("REQ-42")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("Order notes")).toBeInTheDocument();
  });

  it("renders a legacy order without lines and without a placeholder image", () => {
    render(
      <OrderDetailsDialog
        order={makeOrder({ department_order_lines: undefined, signedImageUrl: null })}
        onClose={vi.fn()}
        onOpenImage={vi.fn()}
      />
    );

    expect(screen.getByText(/legacy order/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows an existing image and preserves the full-size interaction", () => {
    const onOpenImage = vi.fn();
    render(
      <OrderDetailsDialog
        order={makeOrder({ signedImageUrl: "https://example.test/signed-image" })}
        onClose={vi.fn()}
        onOpenImage={onOpenImage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open full-size order image" }));
    expect(onOpenImage).toHaveBeenCalledWith("https://example.test/signed-image", "Order Req - REQ-42");
  });

  it("keeps the final item in a long order in the scrollable dialog content", () => {
    const lines = Array.from({ length: 30 }, (_, index) => ({
      id: `line-${index}`,
      order_id: "00000000-0000-0000-0000-000000000001",
      line_type: "non_catalog" as const,
      pmm_number: null,
      item_name_snapshot: `Manual item ${index + 1}`,
      sort_order: index,
      created_at: "2026-07-15T18:30:00.000Z"
    }));
    render(
      <OrderDetailsDialog
        order={makeOrder({ department_order_lines: lines })}
        onClose={vi.fn()}
        onOpenImage={vi.fn()}
      />
    );

    expect(screen.getByText("Manual item 30")).toBeInTheDocument();
    expect(screen.getByRole("dialog").querySelector(".overflow-y-auto")).toBeInTheDocument();
  });
});
