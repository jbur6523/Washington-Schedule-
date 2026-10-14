import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { RentalManagementClient } from "./RentalManagementClient";
import type { AuthenticatedUserContext } from "@/lib/auth/types";
const store = vi.hoisted(() => ({
  records: [] as Record<string, unknown>[],
  rpc: vi.fn(),
  filters: [] as string[],
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = () => ({
        data:
          table === "rental_records"
            ? store.records
            : table === "rental_vendors"
              ? [{ id: "vendor", name: "US Med Equipment", is_active: true }]
              : table === "staff_profiles"
                ? [
                    {
                      id: "lead",
                      display_name: "Local Lead",
                      assigned_role: "lead",
                    },
                    {
                      id: "aide",
                      display_name: "Local Aide",
                      operations_role: "aide",
                    },
                  ]
                : table === "departments"
                  ? { timezone: "America/Los_Angeles" }
                  : [],
        error: null,
      });
      const chain = {
        select: () => chain,
        eq: () => chain,
        or: (filter: string) => {
          store.filters.push(filter);
          return chain;
        },
        order: () => chain,
        range: () => Promise.resolve(result()),
        single: () => Promise.resolve(result()),
        then: (resolve: (result: unknown) => void) =>
          Promise.resolve(result()).then(resolve),
      };
      return chain;
    },
    rpc: store.rpc,
  }),
}));
vi.mock("./RentalBarcodeScanner", () => ({
  RentalBarcodeScanner: ({ onScan }: { onScan: (value: string) => void }) => (
    <button type="button" onClick={() => onScan("SCANNED")}>
      Read test barcode
    </button>
  ),
}));
const auth: AuthenticatedUserContext = {
  authUserId: "account",
  profileId: "profile",
  staffProfileId: "lead",
  departmentId: "dept",
  departmentName: "RT",
  role: "lead",
  operationsRole: "none",
  displayName: "Local Lead",
  hasLinkedStaffProfile: true,
};
function record(id: string, status: string) {
  return {
    id,
    status,
    vendor_id: "vendor",
    serial_number: status === "pending_delivery" ? null : "SN-" + id,
    updated_at: "2026-10-13T16:00:00Z",
    called_in_at: "2026-10-13T15:00:00Z",
    attribution: { order: { name: "Local Lead", staff_profile_id: "lead" } },
  };
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  store.records = [];
  store.filters = [];
  store.rpc.mockReset();
  store.rpc.mockImplementation(async (_name, args) => {
    if (args.action === "order") {
      const created = Array.from({ length: args.payload.quantity }, (_, i) =>
        record(String(i), "pending_delivery"),
      );
      store.records.push(...created);
      return { data: created, error: null };
    }
    const item = store.records.find((r) => r.id === args.target_record_id)!;
    Object.assign(item, {
      status:
        args.action === "delivery"
          ? "active"
          : args.action === "pickup" ||
              (args.action === "return_update" && !args.payload.stages.returned)
            ? "pickup_called"
            : "picked_up",
      serial_number: args.payload.serial_number || item.serial_number,
      updated_at: new Date().toISOString(),
    });
    if (args.payload.stages?.pickup)
      item.pickup_requested_at = args.payload.stages.pickup.at;
    return { data: [item], error: null };
  });
});
async function ready() {
  render(<RentalManagementClient authContext={auth} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "+ Order BiPAP" })).toBeEnabled(),
  );
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
describe("single rental list", () => {
  it("orders multiple devices inline with eligible names and plain text dates", async () => {
    await ready();
    click("+ Order BiPAP");
    const form = screen.getByRole("form", { name: "Order BiPAP" });
    expect(within(form).getByLabelText("Date")).toHaveAttribute("type", "text");
    expect(within(form).getByLabelText("Time")).toHaveAttribute("type", "text");
    expect(
      (within(form).getByLabelText("Time") as HTMLInputElement).value,
    ).toMatch(/^\d{2}:\d{2}$/);
    expect(within(form).getByLabelText("Ordered by")).toHaveValue("lead");
    expect(store.filters[0]).toBe(
      "assigned_role.eq.lead,operations_role.eq.aide,home_assignment.eq.rt_aide",
    );
    expect(
      within(form)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "US Med Equipment",
      "Select name",
      "Local Lead",
      "Local Aide",
      "Insert Name",
    ]);
    fireEvent.change(within(form).getByLabelText("Quantity"), {
      target: { value: "2" },
    });
    fireEvent.change(within(form).getByLabelText("Ordered by"), {
      target: { value: "manual" },
    });
    fireEvent.change(within(form).getByLabelText("Name", { exact: true }), {
      target: { value: "Manual Person" },
    });
    click("Order BiPAP");
    await waitFor(() =>
      expect(screen.queryByRole("form")).not.toBeInTheDocument(),
    );
    expect(
      screen.getAllByText("Pending Delivery", { exact: true }),
    ).toHaveLength(2);
    expect(store.rpc.mock.calls[0][1].payload.person).toEqual({
      staff_profile_id: null,
      name: "Manual Person",
    });
  });
  it("keeps the same device visible until pickup then moves it to history", async () => {
    store.records = [record("one", "pending_delivery")];
    await ready();
    click("Delivered");
    click("Update");
    expect(await screen.findByText("Serial Number is required.")).toBeVisible();
    expect(store.rpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Serial Number", { exact: true }), {
      target: { value: "100416666" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "02/30/2026" },
    });
    click("Update");
    expect(screen.getByRole("alert")).toHaveTextContent("valid Date");
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "10/13/2026" },
    });
    click("Scan barcode");
    click("Read test barcode");
    expect(screen.getByLabelText("Barcode", { exact: true })).toHaveValue(
      "SCANNED",
    );
    click("Update");
    await screen.findByRole("button", { name: "Return" });
    expect(screen.getByText("100416666")).toBeVisible();
    click("Return");
    fireEvent.change(
      within(
        screen.getByRole("group", { name: "Called for Pick Up" }),
      ).getByLabelText("Name"),
      { target: { value: "lead" } },
    );
    click("Update");
    await screen.findByText("Awaiting Pickup");
    expect(screen.getByText("100416666")).toBeVisible();
    click("Picked Up");
    fireEvent.change(
      within(
        screen.getByRole("group", { name: "Picked Up by Company" }),
      ).getByLabelText("Name"),
      { target: { value: "aide" } },
    );
    click("Update");
    await screen.findByText("No current rentals.");
    click("Rental History +");
    expect(screen.getByText("Returned", { exact: true })).toBeVisible();
    expect(screen.getByText("100416666")).toBeVisible();
    expect(
      store.rpc.mock.calls.map((call) => call[1].target_record_id),
    ).toEqual(["one", "one", "one"]);
  });
  it("opens only one editor and prevents duplicate submits while saving", async () => {
    store.records = [
      record("one", "active"),
      record("two", "pending_delivery"),
    ];
    await ready();
    click("Return");
    click("Cancel");
    click("Delivered");
    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(screen.queryByLabelText("Called in by")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Serial Number", { exact: true }), {
      target: { value: "1004" },
    });
    let resolve!: (value: unknown) => void;
    store.rpc.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    fireEvent.submit(screen.getByRole("form"));
    fireEvent.submit(screen.getByRole("form"));
    expect(store.rpc).toHaveBeenCalledTimes(1);
    resolve({ data: [], error: { message: "STALE_RENTAL_STATE" } });
    await waitFor(() =>
      expect(screen.queryByRole("form")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("This rental changed");
  });
  it("preserves untouched historical timestamps and attribution during corrections", async () => {
    store.records = [
      {
        ...record("old", "picked_up"),
        called_in_at: "2026-10-13T15:00:42Z",
        returned_at: "2026-10-13T18:00:00Z",
      },
    ];
    await ready();
    click("Rental History +");
    click("Details / Edit");
    click("Edit");
    fireEvent.change(screen.getByLabelText("Serial Number", { exact: true }), {
      target: { value: "CORRECTED" },
    });
    click("Save");
    await waitFor(() => expect(store.rpc).toHaveBeenCalledTimes(1));
    expect(store.rpc.mock.calls[0][1].payload.stages).toEqual({});
    expect(store.rpc.mock.calls[0][1].payload.serial_number).toBe("CORRECTED");
  });

  it("finds an active rental by barcode without leaving the list", async () => {
    store.records = [
      { ...record("lookup", "active"), barcode_number: "SCAN-123" },
    ];
    await ready();
    click("Find / Scan");
    fireEvent.change(screen.getByLabelText("Barcode or serial number"), {
      target: { value: "SCAN-123" },
    });
    click("Find");
    expect(screen.getByRole("dialog", { name: "Return BiPAP" })).toBeVisible();
    expect(screen.getByText("SN-lookup")).toBeVisible();
  });

  it("sorts pending delivery, active, then pending pickup", async () => {
    store.records = [
      record("pickup", "pickup_called"),
      record("active", "active"),
      record("delivery", "pending_delivery"),
    ];
    await ready();
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((r) => within(r).getAllByRole("cell")[0].textContent),
    ).toEqual(["Pending Delivery", "Active", "Awaiting Pickup"]);
  });
  it.each([false, true])(
    "allows collection with optional call details: %s",
    async (includeCall) => {
      store.records = [record("direct", "active")];
      await ready();
      click("Return");
      click("Update");
      expect(store.rpc).not.toHaveBeenCalled();
      fireEvent.change(
        within(
          screen.getByRole("group", { name: "Picked Up by Company" }),
        ).getByLabelText("Name"),
        { target: { value: "aide" } },
      );
      if (includeCall)
        fireEvent.change(
          within(
            screen.getByRole("group", { name: "Called for Pick Up" }),
          ).getByLabelText("Name"),
          { target: { value: "lead" } },
        );
      click("Update");
      await screen.findByText("No current rentals.");
      expect(store.rpc.mock.calls[0][1].action).toBe("return_update");
      expect(Object.keys(store.rpc.mock.calls[0][1].payload.stages)).toEqual(
        includeCall ? ["pickup", "returned"] : ["returned"],
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("uses a delivery dialog with ordered fields and Escape cancellation", async () => {
    store.records = [record("popup", "pending_delivery")];
    await ready();
    click("Delivered");
    const popup = screen.getByRole("dialog", { name: "Delivered" });
    expect(
      Array.from(popup.querySelectorAll("input, select"))
        .slice(0, 4)
        .map(
          (element) =>
            element
              .closest("label")
              ?.textContent?.trim()
              .split("Select name")[0],
        ),
    ).toEqual(["Date", "Time", "Serial Number", "Name"]);
    fireEvent(popup, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(store.rpc).not.toHaveBeenCalled();
  });
  it("validates a partially filled optional section", async () => {
    store.records = [record("partial", "active")];
    await ready();
    click("Return");
    fireEvent.change(
      within(
        screen.getByRole("group", { name: "Picked Up by Company" }),
      ).getByLabelText("Time"),
      { target: { value: "25:00" } },
    );
    click("Update");
    expect(screen.getByRole("alert")).toHaveTextContent("valid Date");
    expect(store.rpc).not.toHaveBeenCalled();
  });
  it("does not render actions for unauthorized staff", () => {
    render(<RentalManagementClient authContext={{ ...auth, role: "staff" }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
