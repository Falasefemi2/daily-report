import * as Schema from "effect/Schema"
import type { Category } from "./categories.js"
import { categorizeApp } from "./categories.js"
import { redactTitle } from "./redact.js"

// ---------------------------------------------------------------------------
// Domain types (from the database / git ingestion)
// ---------------------------------------------------------------------------

export interface WindowInterval {
  readonly id: number
  readonly startAt: Date
  readonly endAt: Date
  readonly app: string
  readonly title: string
}

export interface GitCommit {
  readonly repo: string
  readonly message: string
  readonly at: Date
}

// ---------------------------------------------------------------------------
// Wire model — the single JSON document sent to the LLM
// ---------------------------------------------------------------------------

export const CategorySchema = Schema.Literals(["code editor", "terminal", "browser", "comms", "other"])

export const AppTime = Schema.Struct({
  app: Schema.String,
  category: CategorySchema,
  minutes: Schema.Number,
  topTitles: Schema.Array(Schema.String),
})

export interface AppTime extends Schema.Schema.Type<typeof AppTime> {}

export const CategoryBreakdown = Schema.Struct({
  "code editor": Schema.Number,
  terminal: Schema.Number,
  browser: Schema.Number,
  comms: Schema.Number,
  other: Schema.Number,
})

export type CategoryBreakdown = Schema.Schema.Type<typeof CategoryBreakdown>

export const GitCommitWire = Schema.Struct({
  repo: Schema.String,
  message: Schema.String,
  at: Schema.String,
})

export type GitCommitWire = Schema.Schema.Type<typeof GitCommitWire>

export const DailyReport = Schema.Struct({
  date: Schema.String,
  totalActiveMinutes: Schema.Number,
  activeHours: Schema.Number,
  contextSwitches: Schema.Number,
  switchesPerHour: Schema.Number,
  topApps: Schema.Array(AppTime),
  categories: CategoryBreakdown,
  commits: Schema.Array(GitCommitWire),
})

export type DailyReport = Schema.Schema.Type<typeof DailyReport>

// ---------------------------------------------------------------------------
// Pure aggregation helpers (unit-testable, no Effect/I/O)
// ---------------------------------------------------------------------------

const toMinutes = (ms: number): number => Math.max(0, ms) / 60000

const emptyBreakdown = (): Record<Category, number> => ({
  "code editor": 0,
  terminal: 0,
  browser: 0,
  comms: 0,
  other: 0,
})

const sortByStart = (intervals: ReadonlyArray<WindowInterval>): ReadonlyArray<WindowInterval> =>
  [...intervals].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())

/**
 * Number of context switches across the day: transitions between consecutive
 * window intervals where the (app, title) pair differs.
 */
export const countContextSwitches = (intervals: ReadonlyArray<WindowInterval>): number => {
  const ordered = sortByStart(intervals)
  let switches = 0
  let previous: { readonly app: string; readonly title: string } | undefined
  for (const interval of ordered) {
    if (previous !== undefined && (previous.app !== interval.app || previous.title !== interval.title)) {
      switches += 1
    }
    previous = { app: interval.app, title: interval.title }
  }
  return switches
}

export const topTitlesForApp = (
  intervals: ReadonlyArray<WindowInterval>,
  app: string,
  limit: number,
): ReadonlyArray<string> => {
  const byTitle = new Map<string, number>()
  for (const interval of intervals) {
    if (interval.app !== app) continue
    const title = redactTitle(app, interval.title)
    if (title.length === 0) continue
    byTitle.set(title, (byTitle.get(title) ?? 0) + Math.max(0, interval.endAt.getTime() - interval.startAt.getTime()))
  }
  return [...byTitle.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([title]) => title)
}

/**
 * Produces the aggregate report document for one day. Pure: takes intervals
 * and commits, returns a plain object matching `DailyReport`.
 */
export const aggregate = (options: {
  readonly date: string
  readonly intervals: ReadonlyArray<WindowInterval>
  readonly commits: ReadonlyArray<GitCommit>
}): DailyReport => {
  const { date, intervals, commits } = options

  const byApp = new Map<string, number>()
  const byAppTitles = new Map<string, Array<WindowInterval>>()
  for (const interval of intervals) {
    byApp.set(
      interval.app,
      (byApp.get(interval.app) ?? 0) + Math.max(0, interval.endAt.getTime() - interval.startAt.getTime()),
    )
    const titles = byAppTitles.get(interval.app) ?? []
    titles.push(interval)
    byAppTitles.set(interval.app, titles)
  }

  const totalActiveMs = [...byApp.values()].reduce((acc, ms) => acc + ms, 0)
  const activeHours = totalActiveMs / 3_600_000

  const categories = emptyBreakdown()
  const topApps = [...byApp.entries()]
    .map(
      ([app, ms]): AppTime => ({
        app,
        category: categorizeApp(app),
        minutes: Math.round(toMinutes(ms) * 10) / 10,
        topTitles: [...topTitlesForApp(byAppTitles.get(app) ?? [], app, 5)],
      }),
    )
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10)

  for (const entry of topApps) {
    categories[entry.category] = Math.round((categories[entry.category] + entry.minutes) * 10) / 10
  }

  const contextSwitches = countContextSwitches(intervals)
  const switchesPerHour = activeHours > 0 ? Math.round((contextSwitches / activeHours) * 10) / 10 : 0

  return {
    date,
    totalActiveMinutes: Math.round(toMinutes(totalActiveMs) * 10) / 10,
    activeHours: Math.round(activeHours * 10) / 10,
    contextSwitches,
    switchesPerHour,
    topApps,
    categories,
    commits: [...commits]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map(
        (commit): GitCommitWire => ({
          repo: commit.repo,
          message: commit.message,
          at: commit.at.toISOString(),
        }),
      ),
  }
}
