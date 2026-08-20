import { describe, expect, it } from "vitest";
import { matchScheduleStaff, type MatchableStaff } from "@/lib/schedule-import/matching";

const staff: MatchableStaff[] = [
  { id: "1", display_name: "Ava O'Neil", first_name: "Ava", last_name: "O'Neil", username: "onea", username_normalized: "onea" },
  { id: "2", display_name: "Ben Shared", first_name: "Ben", last_name: "Shared", username: "shab", username_normalized: "shab" },
  { id: "3", display_name: "Cara Shared", first_name: "Cara", last_name: "Shared", username: "shac", username_normalized: "shac" }
];

describe("Staff Directory schedule matching", () => {
  it("matches username identifiers", () => expect(matchScheduleStaff("ONE-A", staff)).toMatchObject({ profile: { id: "1" }, source: "username" }));
  it("matches exact display names", () => expect(matchScheduleStaff("Ava O'Neil", staff)).toMatchObject({ profile: { id: "1" }, source: "display_name" }));
  it("matches normalized full names", () => expect(matchScheduleStaff("ava oneil", staff)).toMatchObject({ profile: { id: "1" }, source: "full_name" }));
  it("matches unique last names", () => expect(matchScheduleStaff("O'Neil", staff)).toMatchObject({ profile: { id: "1" }, source: "last_name" }));
  it("rejects ambiguous last names", () => expect(matchScheduleStaff("Shared", staff)).toEqual({ profile: null, source: "ambiguous" }));
  it("reports unmatched identifiers", () => expect(matchScheduleStaff("missing", staff)).toEqual({ profile: null, source: "unmatched" }));
});
