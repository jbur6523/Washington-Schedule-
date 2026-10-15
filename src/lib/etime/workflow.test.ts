import { describe, expect, it } from "vitest";
import { reviewForm } from "@/test/etime-fixtures";
import { canManagerSign, reviewFolder } from "./workflow";

describe("whole-form reviewer workflow", () => {
  it("keeps a three-entry form pending until its last entry is initialed", () => {
    const { state } = reviewForm();
    const entered = state.entries[2].entered;
    delete state.entries[2].entered;
    expect(reviewFolder(state, "timekeeper")).toBe("pending");
    expect(reviewFolder(state, "manager")).toBe("pending");
    expect(canManagerSign(state)).toBe(false);
    state.entries[2].entered = entered;
    expect(reviewFolder(state, "timekeeper")).toBe("completed");
    expect(reviewFolder(state, "manager")).toBe("entered");
    expect(canManagerSign(state)).toBe(true);
    state.managerSignature = {
      ...state.employeeSignature!,
      name: "Ramon Hollander",
      actor: "reviewer:ramon",
    };
    expect(reviewFolder(state, "timekeeper")).toBe("completed");
    expect(reviewFolder(state, "manager")).toBe("approved");
  });

  it("does not approve changed content or accept stale initials/signatures", () => {
    const { state } = reviewForm();
    state.managerSignature = {
      ...state.employeeSignature!,
      name: "Ramon Hollander",
    };
    state.contentRevision++;
    expect(reviewFolder(state, "manager")).toBe("entered");
    expect(canManagerSign(state)).toBe(false);
    state.employeeSignature!.contentRevision = state.contentRevision;
    expect(canManagerSign(state)).toBe(true);
    expect(reviewFolder(state, "manager")).toBe("entered");
    state.entries[0].revision++;
    expect(reviewFolder(state, "manager")).toBe("pending");
    expect(reviewFolder(state, "timekeeper")).toBe("pending");
    expect(canManagerSign(state)).toBe(false);
  });

  it("never offers signing for an empty form or a missing employee signature", () => {
    const { state } = reviewForm();
    delete state.employeeSignature;
    expect(canManagerSign(state)).toBe(false);
    state.entries = [];
    expect(reviewFolder(state, "manager")).toBe("pending");
  });
});
