import { describe, expect, it } from "bun:test"
import * as Schema from "effect/Schema"
import type { WindowInterval } from "../src/aggregate/aggregate.js"
import { aggregate, countContextSwitches, DailyReport } from "../src/aggregate/aggregate.js"
import { categorizeApp } from "../src/aggregate/categories.js"
import { redactTitle } from "../src/aggregate/redact.js"

const interval = (id: number, app: string, title: string, startMin: number, durationMin: number): WindowInterval => {
  const start = new Date(2026, 7, 4, 9, startMin, 0, 0)
  return { id, app, title, startAt: start, endAt: new Date(start.getTime() + durationMin * 60000) }
}

describe("categorizeApp", () => {
  it("maps known apps to their static category", () => {
    expect(categorizeApp("Code")).toBe("code editor")
    expect(categorizeApp("Google Chrome")).toBe("browser")
    expect(categorizeApp("Slack")).toBe("comms")
    expect(categorizeApp("iTerm2")).toBe("terminal")
  })

  it("normalizes case and .exe suffix", () => {
    expect(categorizeApp("WINDOWSTERMINAL.EXE")).toBe("terminal")
    expect(categorizeApp("chrome")).toBe("browser")
  })

  it("falls back to other for unknown apps", () => {
    expect(categorizeApp("Spotify")).toBe("other")
  })
})

describe("redactTitle", () => {
  it("truncates browser titles at the first ' - '", () => {
    expect(redactTitle("Google Chrome", "GitHub - alice/project - pull #12")).toBe("GitHub")
  })

  it("keeps a bare URL to its domain only", () => {
    expect(redactTitle("Google Chrome", "https://www.notion.so/workspace/page")).toBe("notion.so")
    expect(redactTitle("Google Chrome", "example.com/docs")).toBe("example.com")
  })

  it("passes non-browser titles through unchanged", () => {
    expect(redactTitle("Code", "notes.md - ai-task-update")).toBe("notes.md - ai-task-update")
  })
})

describe("countContextSwitches", () => {
  it("counts transitions between differing app/title pairs", () => {
    const intervals = [
      interval(1, "Code", "a.ts", 0, 10),
      interval(2, "Code", "a.ts", 10, 10),
      interval(3, "Code", "b.ts", 20, 10),
      interval(4, "Slack", "#general", 30, 10),
    ]
    expect(countContextSwitches(intervals)).toBe(2)
  })

  it("returns 0 for empty input", () => {
    expect(countContextSwitches([])).toBe(0)
  })
})

describe("aggregate", () => {
  it("groups minutes by app and category", () => {
    const report = aggregate({
      date: "2026-08-04",
      intervals: [
        interval(1, "Code", "a.ts", 0, 60),
        interval(2, "Code", "a.ts", 60, 60),
        interval(3, "Google Chrome", "GitHub - alice/repo", 120, 30),
      ],
      commits: [{ repo: "/repo", message: "fix: thing", at: new Date(2026, 7, 4, 12, 0) }],
    })

    expect(report.totalActiveMinutes).toBe(150)
    expect(report.categories["code editor"]).toBe(120)
    expect(report.categories.browser).toBe(30)
    expect(report.topApps[0]?.app).toBe("Code")
    expect(report.topApps[0]?.topTitles).toContain("a.ts")
  })

  it("applies browser title redaction in top titles", () => {
    const report = aggregate({
      date: "2026-08-04",
      intervals: [interval(1, "Google Chrome", "GitHub - alice/secret-project", 0, 45)],
      commits: [],
    })
    expect(report.topApps[0]?.topTitles).toEqual(["GitHub"])
  })

  it("computes switches per hour from active time", () => {
    const report = aggregate({
      date: "2026-08-04",
      intervals: [interval(1, "Code", "a.ts", 0, 60), interval(2, "Slack", "#general", 60, 60)],
      commits: [],
    })
    expect(report.contextSwitches).toBe(1)
    expect(report.switchesPerHour).toBe(0.5)
    expect(report.commits).toEqual([])
  })

  it("matches the DailyReport schema", () => {
    const report = aggregate({
      date: "2026-08-04",
      intervals: [interval(1, "Code", "a.ts", 0, 10)],
      commits: [],
    })
    expect(Schema.decodeUnknownSync(DailyReport)(report)).toEqual(report)
  })
})
