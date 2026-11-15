import { describe, expect, it } from "vitest"
import {
  addDaysToKey,
  buildInstallationCalendar,
  earliestInstallationDate,
  installationLeadDays,
  isValidDateKey,
  parseInstallationRules,
  scheduledAtFromKey,
  toDateKey,
  unavailableReason,
  type InstallationRules,
} from "@/features/shared/lib/delivery/installation-calendar"

const rules: InstallationRules = {
  minBusinessDays: 2,
  windowDays: 14,
  dailyCapacity: 2,
  weekdays: [1, 2, 3, 4, 5],
  blockedDates: ["2026-11-20"],
}

// Wednesday, 11/11/2026, 10:00 in São Paulo
const now = new Date("2026-11-11T13:00:00.000Z")

describe("installation calendar (RN05)", () => {
  it("reads dates in the São Paulo calendar", () => {
    expect(toDateKey(new Date("2026-11-12T02:30:00.000Z"))).toBe("2026-11-11")
    expect(toDateKey(new Date("2026-11-12T03:00:00.000Z"))).toBe("2026-11-12")
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("stores the date at noon in São Paulo", () => {
    const stored = scheduledAtFromKey("2026-11-18")
    expect(stored.toISOString()).toBe("2026-11-18T15:00:00.000Z")
    expect(toDateKey(stored)).toBe("2026-11-18")
  })

  it("accepts only real calendar dates", () => {
    expect(isValidDateKey("2026-11-18")).toBe(true)
    expect(isValidDateKey("2026-02-30")).toBe(false)
    expect(isValidDateKey("18/11/2026")).toBe(false)
  })

  it("adds the preparation, the extras and the delivery time", () => {
    expect(installationLeadDays(rules, 3, 5)).toBe(10)
    expect(installationLeadDays(rules, 0, null)).toBe(2)
    expect(earliestInstallationDate(now, 2)).toBe("2026-11-13")
    // Never the same day, even with a zero lead time
    expect(earliestInstallationDate(now, 0)).toBe("2026-11-12")
  })

  it("blocks weekends, holidays, full dates and dates out of the window", () => {
    const booked = new Map([["2026-11-17", 2]])
    const input = { now, leadBusinessDays: 2, rules, booked }
    expect(unavailableReason("2026-11-12", input)).toBe("too_early")
    expect(unavailableReason("2026-11-13", input)).toBeNull()
    expect(unavailableReason("2026-11-14", input)).toBe("weekday")
    expect(unavailableReason("2026-11-17", input)).toBe("full")
    expect(unavailableReason("2026-11-20", input)).toBe("blocked")
    expect(unavailableReason("2026-11-26", input)).toBeNull()
    expect(unavailableReason("2026-11-27", input)).toBe("too_late")
  })

  it("lists every date of the window with the blocked ones marked", () => {
    const calendar = buildInstallationCalendar({
      now,
      leadBusinessDays: 2,
      rules,
      booked: new Map([["2026-11-16", 1]]),
    })
    expect(calendar).toHaveLength(14)
    expect(calendar[0]).toEqual({
      date: "2026-11-13",
      available: true,
      reason: null,
    })
    expect(calendar[1]).toMatchObject({ date: "2026-11-14", reason: "weekday" })
    expect(calendar[3]).toMatchObject({ date: "2026-11-16", available: true })
    expect(calendar.find((day) => day.date === "2026-11-20")?.reason).toBe(
      "blocked"
    )
  })

  it("refuses invalid settings instead of opening the calendar", () => {
    const valid = {
      minBusinessDays: 2,
      windowDays: 45,
      dailyCapacity: 3,
      weekdays: [1, 2, 3, 4, 5],
      blockedDates: ["2026-12-25"],
    }
    expect(parseInstallationRules(valid)).toEqual(valid)
    expect(() =>
      parseInstallationRules({ ...valid, minBusinessDays: 0 })
    ).toThrow()
    expect(() => parseInstallationRules({ ...valid, weekdays: [7] })).toThrow()
    expect(() =>
      parseInstallationRules({ ...valid, blockedDates: ["25/12/2026"] })
    ).toThrow()
  })
})
