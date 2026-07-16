import { describe, expect, it } from "vitest";
import {
  applySpaceDelimiter,
  buildOrderLineRpcInputs,
  buildPmmLookupStates,
  formatPmmNumbers,
  getOrderRpcDiagnosticCode,
  isExplicitOrderRpcRejection,
  mapOrderRpcError,
  mapUnexpectedOrderRpcError,
  normalizePmmInput,
  parsePmmInput,
  validateNonCatalogItems
} from "@/lib/order-management/pmm";
import type { PmmCatalogRow } from "@/lib/order-management/types";
import { acquireSubmissionLock, releaseSubmissionLock } from "@/lib/order-management/submission";

const catalogRows: PmmCatalogRow[] = [
  {
    pmm_number: "1356",
    item_name: "Active item",
    catalog_status: "active",
    is_orderable: true,
    review_required: false
  },
  {
    pmm_number: "21586",
    item_name: "Review item",
    catalog_status: "active",
    is_orderable: true,
    review_required: true
  },
  {
    pmm_number: "68",
    item_name: "Old item",
    catalog_status: "discontinued",
    is_orderable: false,
    review_required: false
  },
  {
    pmm_number: "21751",
    item_name: "Do not use item",
    catalog_status: "do_not_use",
    is_orderable: false,
    review_required: false
  }
];

describe("PMM parsing", () => {
  it("normalizes mixed pasted separators", () => {
    expect(normalizePmmInput("1356 978; 21592\n1356")).toBe("1356, 978, 21592");
  });

  it("removes duplicates while preserving first-seen order", () => {
    expect(parsePmmInput("978, 1356, 978, 21592, 1356")).toEqual({
      pmmNumbers: ["978", "1356", "21592"],
      duplicatePmmNumbers: ["978", "1356"],
      invalidTokens: []
    });
  });

  it("never coerces leading-zero PMMs through JavaScript numbers", () => {
    expect(parsePmmInput("00135 00135 978").pmmNumbers).toEqual(["00135", "978"]);
    expect(formatPmmNumbers(["00135", "978"])).toBe("00135, 978");
  });

  it("reports invalid tokens without silently treating them as PMMs", () => {
    expect(parsePmmInput("1356, NONSTOCK, 978")).toEqual({
      pmmNumbers: ["1356", "978"],
      duplicatePmmNumbers: [],
      invalidTokens: ["NONSTOCK"]
    });
  });

  it("turns Space into a comma delimiter without repeated commas", () => {
    expect(applySpaceDelimiter("1356", 4, 4)).toEqual({ value: "1356, ", caret: 6 });
    expect(applySpaceDelimiter("1356,", 5, 5)).toEqual({ value: "1356, ", caret: 6 });
    expect(applySpaceDelimiter("", 0, 0)).toEqual({ value: "", caret: 0 });
  });
});

describe("PMM lookup states", () => {
  it("distinguishes active, review, unknown, discontinued, and do-not-use PMMs", () => {
    const states = buildPmmLookupStates(["1356", "21586", "99999", "68", "21751"], catalogRows, "ready");
    expect(states.map((state) => state.state)).toEqual(["active", "review", "unknown", "blocked", "blocked"]);
    expect(states[3].catalogStatus).toBe("discontinued");
    expect(states[4].catalogStatus).toBe("do_not_use");
  });

  it("keeps lookup failures distinct from unknown PMMs", () => {
    expect(buildPmmLookupStates(["1356"], [], "error")[0].state).toBe("error");
    expect(buildPmmLookupStates(["1356"], [], "loading")[0].state).toBe("loading");
  });
});

describe("normalized order lines", () => {
  it("places ordered PMMs before ordered non-catalog lines", () => {
    expect(
      buildOrderLineRpcInputs(
        ["1356", "978"],
        [
          { id: "a", itemName: "  Manual one  " },
          { id: "b", itemName: "Manual two" }
        ]
      )
    ).toEqual([
      { line_type: "pmm", pmm_number: "1356" },
      { line_type: "pmm", pmm_number: "978" },
      { line_type: "non_catalog", item_name: "Manual one" },
      { line_type: "non_catalog", item_name: "Manual two" }
    ]);
  });

  it("rejects blank and overlong non-catalog item names", () => {
    expect(
      validateNonCatalogItems([
        { id: "blank", itemName: "  " },
        { id: "valid", itemName: "Item" },
        { id: "long", itemName: "x".repeat(501) }
      ])
    ).toEqual(["blank", "long"]);
  });

  it("maps server-side validation failures to useful messages", () => {
    expect(mapOrderRpcError("P0001 UNKNOWN_PMM:99999")).toBe("PMM #99999 was not found.");
    expect(mapOrderRpcError("P0001 PMM_NOT_ORDERABLE:68")).toBe("PMM #68 cannot be ordered.");
    expect(isExplicitOrderRpcRejection("P0001 ORDER_ID_REPLAY_MISMATCH")).toBe(true);
    expect(isExplicitOrderRpcRejection("Failed to fetch")).toBe(false);
  });

  it("maps infrastructure failures to safe reportable diagnostic codes", () => {
    expect(getOrderRpcDiagnosticCode({ code: "42883" })).toBe("OM-RPC-42883");
    expect(getOrderRpcDiagnosticCode({ code: "PGRST202" })).toBe("OM-RPC-PGRST202");
    expect(getOrderRpcDiagnosticCode({ code: "bad code!" })).toBe("OM-RPC-BADCODE");
    expect(getOrderRpcDiagnosticCode({})).toBe("OM-RPC-UNEXPECTED");
    expect(mapUnexpectedOrderRpcError({ code: "42883", message: "raw database detail" })).toBe(
      "The order service needs a database repair. Report code OM-RPC-42883. Retry this order after the repair is applied."
    );
    expect(mapUnexpectedOrderRpcError({ code: "TRANSPORT" })).toContain("OM-RPC-TRANSPORT");
    expect(mapUnexpectedOrderRpcError({ code: "42883", message: "raw database detail" })).not.toContain(
      "raw database detail"
    );
  });

  it("blocks a second submit until the in-flight submission releases", () => {
    const lock = { current: false };
    expect(acquireSubmissionLock(lock)).toBe(true);
    expect(acquireSubmissionLock(lock)).toBe(false);
    releaseSubmissionLock(lock);
    expect(acquireSubmissionLock(lock)).toBe(true);
  });
});
