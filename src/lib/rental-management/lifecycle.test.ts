import { describe, it, expect } from "vitest";
import { eventTimestamp, localFields, rentalState } from "./lifecycle";
const zone = "America/Los_Angeles";
describe("rental date/time and legacy statuses", () => {
  it("uses hospital time, including midnight, with no AM/PM", () => {
    expect(localFields("2026-10-13T07:00:00Z", zone)).toEqual({
      date: "10/13/2026",
      time: "00:00",
    });
    expect(eventTimestamp("10/13/2026", "00:00", zone)).toBe(
      "2026-10-13T07:00:00.000Z",
    );
    expect(eventTimestamp("01/13/2026", "14:30", zone)).toBe(
      "2026-01-13T22:30:00.000Z",
    );
  });
  it("rejects invalid formats, impossible dates, and skipped DST times", () => {
    for (const [date, time] of [
      ["2/01/2026", "12:00"],
      ["02/30/2026", "12:00"],
      ["10/13/2026", "24:00"],
      ["10/13/2026", "2:00 PM"],
      ["03/08/2026", "02:30"],
    ])
      expect(eventTimestamp(date, time, zone)).toBe("");
  });
  it("keeps all historical lifecycle aliases compatible", () => {
    for (const status of ["called_in", "pending_delivery"])
      expect(rentalState(status).label).toBe("Pending Delivery");
    for (const status of ["active", "delivered"])
      expect(rentalState(status).button).toBe("Return");
    for (const status of [
      "pickup_requested",
      "pickup_called",
      "called_for_pickup",
    ])
      expect(rentalState(status).label).toBe("Pending Pick-up");
    for (const status of [
      "returned",
      "picked_up",
      "cancelled",
      "delivery_cancelled",
    ])
      expect(rentalState(status).action).toBeNull();
  });
});
