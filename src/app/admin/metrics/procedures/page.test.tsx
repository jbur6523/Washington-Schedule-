import { expect, it, vi } from "vitest";
import ProcedureMetricsPage from "./page";
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
it("preserves dates on legacy procedure links and opens the combined view", async () => {
  await ProcedureMetricsPage({ searchParams: Promise.resolve({ range: "custom", start: "2026-09-01", end: "2026-09-30" }) });
  expect(redirect).toHaveBeenLastCalledWith("/admin/rvu-staffing-metrics?range=custom&start=2026-09-01&end=2026-09-30");
});
