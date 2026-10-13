import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftRvuComparison } from "./ShiftRvuComparison";
import type { ShiftStatusUpdate } from "@/lib/shift-status/types";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/metrics/queries", () => ({ fetchRvuStaffingMetricRows: query }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const update = { department_id: "local-department", shift_date: "2026-10-12", shift_type: "night", updated_at: "2026-10-12T20:00:00Z", rvu_total: 189 } as ShiftStatusUpdate;

describe("leadership RVU comparison", () => {
  beforeEach(() => { query.mockReset(); });
  it("loads the same department and shift window and keeps details collapsed", async () => {
    query.mockResolvedValue({ error: null, data: Array.from({ length: 10 }, (_, i) => ({ id: String(i), shift_date: `2026-10-${String(i + 1).padStart(2, "0")}`, shift_type: "night", rvu_total: 180, rts_on: 7, created_at: "2026-10-01", updated_at: "2026-10-01" })) });
    const { container } = render(<ShiftRvuComparison update={update} />);
    expect(await screen.findByText("Near average")).toBeTruthy();
    expect(screen.getByText("189 RVUs")).toBeTruthy();
    expect(query).toHaveBeenCalledWith({}, "local-department", { minimumShiftDate: "2026-09-27", maximumShiftDate: "2026-10-11", shift: "night" });
    expect(container.querySelector("details")?.open).toBe(false);
    expect(screen.getByText("15-day average: 180 RVUs")).toBeTruthy();
    expect(screen.getByText("5% above average")).toBeTruthy();
  });
  it("distinguishes failed history from insufficient history", async () => {
    query.mockRejectedValue(new Error("offline"));
    render(<ShiftRvuComparison update={update} />);
    expect(await screen.findByText("Comparison unavailable")).toBeTruthy();
    expect(screen.queryByText("Not enough history")).toBeNull();
  });
  it("replaces the previous shift history when the displayed shift changes", async () => {
    query.mockResolvedValue({ data: [], error: null });
    const view = render(<ShiftRvuComparison update={update} />);
    await screen.findByText("Not enough history");
    view.rerender(<ShiftRvuComparison key="day" update={{ ...update, shift_type: "day" }} />);
    await waitFor(() => expect(query).toHaveBeenLastCalledWith({}, "local-department", expect.objectContaining({ shift: "day" })));
  });
});
