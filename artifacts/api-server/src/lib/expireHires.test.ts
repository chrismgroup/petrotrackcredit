import { describe, it, expect } from "vitest";
import { findExpiredCharters } from "./expireHires";

describe("findExpiredCharters", () => {
  it("returns charters whose hireEnd is strictly in the past", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const active = [
      { id: 1, vesselId: 10, hireEnd: new Date("2025-05-31T23:59:59Z") },
      { id: 2, vesselId: 20, hireEnd: new Date("2025-06-02T00:00:00Z") },
    ];
    const expired = findExpiredCharters(active, now);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe(1);
  });

  it("includes a charter whose hireEnd equals exactly now (boundary)", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const active = [
      { id: 3, vesselId: 30, hireEnd: new Date("2025-06-01T12:00:00Z") },
    ];
    const expired = findExpiredCharters(active, now);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe(3);
  });

  it("ignores charters with no hireEnd (open-ended hires)", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const active = [
      { id: 4, vesselId: 40, hireEnd: null },
      { id: 5, vesselId: 50, hireEnd: null },
    ];
    expect(findExpiredCharters(active, now)).toHaveLength(0);
  });

  it("handles a mix of expired, future, and null hireEnd", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const active = [
      { id: 10, vesselId: 100, hireEnd: new Date("2025-05-01T00:00:00Z") },
      { id: 11, vesselId: 101, hireEnd: new Date("2025-07-01T00:00:00Z") },
      { id: 12, vesselId: 102, hireEnd: null },
      { id: 13, vesselId: 103, hireEnd: new Date("2025-06-01T12:00:00Z") },
    ];
    const expired = findExpiredCharters(active, now);
    expect(expired).toHaveLength(2);
    expect(expired.map((c) => c.id).sort()).toEqual([10, 13]);
  });

  it("returns an empty array when given no active charters", () => {
    expect(findExpiredCharters([], new Date())).toHaveLength(0);
  });

  it("returns an empty array when all charters are still active", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const active = [
      { id: 20, vesselId: 200, hireEnd: new Date("2025-12-31T23:59:59Z") },
      { id: 21, vesselId: 201, hireEnd: new Date("2025-06-01T12:00:01Z") },
    ];
    expect(findExpiredCharters(active, now)).toHaveLength(0);
  });

  it("accepts hireEnd as a string (DB date serialisation)", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const active = [
      { id: 30, vesselId: 300, hireEnd: "2025-05-30T00:00:00.000Z" },
    ];
    const expired = findExpiredCharters(active, now);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe(30);
  });
});
