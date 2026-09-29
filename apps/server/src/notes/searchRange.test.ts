import { describe, expect, it } from "vitest";
import { noteSearchRangeStart } from "./searchRange.js";

const noon = new Date("2026-09-23T12:00:00.000Z");

describe("noteSearchRangeStart", () => {
  it("liefert für „any“ keinen Startzeitpunkt", () => {
    expect(noteSearchRangeStart("any", noon)).toBeNull();
  });

  it("beginnt „today“ um Mitternacht", () => {
    const start = noteSearchRangeStart("today", noon);
    expect(start).not.toBeNull();
    const date = new Date(start!);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getDate()).toBe(noon.getDate());
  });

  it("rechnet Woche und Monat rückwärts", () => {
    const week = new Date(noteSearchRangeStart("week", noon)!);
    const month = new Date(noteSearchRangeStart("month", noon)!);
    expect(week.getTime()).toBeLessThan(noon.getTime());
    expect(month.getTime()).toBeLessThan(week.getTime());
    expect(noon.getTime() - week.getTime()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(noon.getTime() - week.getTime()).toBeLessThan(8 * 24 * 60 * 60 * 1000);
  });
});
