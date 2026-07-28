import { describe, expect, it } from "vitest";
import {
  shiftStatusNumberValue,
  validateShiftStatusCounts,
  type ShiftStatusCountInput
} from "@/lib/shift-status/validation";

const validCounts: ShiftStatusCountInput = {
  rtsOn: "8",
  rtsRequired: "8.5",
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
  });

  it("rejects negative operational values instead of coercing them to zero", () => {
    expect(
      validateShiftStatusCounts({ ...validCounts, ventCount: "-1" })
    ).toBe("Vents must be a whole number of 0 or more.");
    expect(
      validateShiftStatusCounts({ ...validCounts, rtsRequired: "-0.5" })
    ).toBe("RTs Needed must be a number of 0 or more.");
  });

  it("rejects fractional device and procedure counts", () => {
    expect(
      validateShiftStatusCounts({ ...validCounts, bipapCount: "1.5" })
    ).toBe("BiPAPs must be a whole number of 0 or more.");
  });
});
