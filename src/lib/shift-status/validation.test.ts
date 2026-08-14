import { describe, expect, it } from "vitest";
import {
  optionalShiftStatusNumberValue,
  rtsNeededFromRvus,
  shiftStatusNumberValue,
  validateShiftStatusCounts,
  type ShiftStatusCountInput
} from "@/lib/shift-status/validation";

const validCounts: ShiftStatusCountInput = {
  rtsOn: "8",
  rvuCount: "229.5",
  ventCount: "0",
  bipapCount: "2",
  cSectionCount: "",
  vaginalDeliveryCount: "0",
  cabgCount: "1",
  bronchCount: "",
  sputumInductionCount: "0",
  otherProcedureCount: ""
};

describe("shift status count validation", () => {
  it("accepts zero, optional blanks, and fractional staffing needs", () => {
    expect(validateShiftStatusCounts(validCounts)).toBeNull();
    expect(shiftStatusNumberValue("")).toBe(0);
    expect(shiftStatusNumberValue("0")).toBe(0);
    expect(optionalShiftStatusNumberValue("")).toBeNull();
    expect(optionalShiftStatusNumberValue("0")).toBe(0);
  });

  it("treats a blank Vent field as no update while preserving a real zero", () => {
    expect(validateShiftStatusCounts({ ...validCounts, ventCount: "" })).toBeNull();
    expect(optionalShiftStatusNumberValue(" ")).toBeNull();
    expect(optionalShiftStatusNumberValue("0")).toBe(0);
  });

  it("rejects negative operational values instead of coercing them to zero", () => {
    expect(
      validateShiftStatusCounts({ ...validCounts, ventCount: "-1" })
    ).toBe("Vents must be a whole number of 0 or more.");
    expect(
      validateShiftStatusCounts({ ...validCounts, rvuCount: "-0.5" })
    ).toBe("RVUs must be a number of 0 or more.");
  });

  it("rejects fractional device and procedure counts", () => {
    expect(
      validateShiftStatusCounts({ ...validCounts, bipapCount: "1.5" })
    ).toBe("BiPAPs must be a whole number of 0 or more.");
  });

  it("calculates RT need from RVUs using 27 and normal one-decimal rounding", () => {
    expect(rtsNeededFromRvus("154")).toBe(5.7);
    expect(rtsNeededFromRvus("184")).toBe(6.8);
    expect(rtsNeededFromRvus("188.65")).toBe(7);
  });

  it("returns no staffing value for blank, invalid, or negative RVUs", () => {
    expect(rtsNeededFromRvus("")).toBeNull();
    expect(rtsNeededFromRvus("not-a-number")).toBeNull();
    expect(rtsNeededFromRvus("-1")).toBeNull();
  });
});
