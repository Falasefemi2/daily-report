import { Effect, Schema } from "effect"
import type { WindowInterval } from "../aggregate/aggregate.js"
import { aggregate, type DailyReport } from "../aggregate/aggregate.js"
import { AppConfigService } from "../config.js"
import { expandHome, localDayRange } from "../date.js"
import * as Fs from "../fs.js"
import { GitCommits } from "../git/commits.js"
import { LlmClient, type LlmResponse } from "../llm/llm-client.js"
import { ActivityRepo } from "../tracker/activity-repo.js"

export class ReportError extends Schema.TaggedErrorClass<ReportError>()("Report.ReportError", {
  message: Schema.String,
}) {}

const minutesLabel = (minutes: number): string => {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const rest = Math.round(minutes % 60)
    return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
  }
  return `${Math.round(minutes)}m`
}

export const render = (report: DailyReport, response: LlmResponse): string => {
  const lines: Array<string> = []
  lines.push(`# Daily Review — ${report.date}`)
  lines.push("")
  lines.push(response.summary)
  lines.push("")
  lines.push(
    `**Focus verdict: ${response.verdict}** (${report.contextSwitches} context switches, ${report.switchesPerHour}/hour over ${report.activeHours}h active)`,
  )
  lines.push("")
  lines.push(`**Active time:** ${minutesLabel(report.totalActiveMinutes)}`)
  lines.push("")
  lines.push("**Categories:**")
  for (const [category, minutes] of Object.entries(report.categories)) {
    if (minutes > 0) lines.push(`- ${category}: ${minutesLabel(minutes)}`)
  }
  lines.push("")
  lines.push("**Top apps:**")
  for (const app of report.topApps) {
    const titles = app.topTitles.length > 0 ? ` — ${app.topTitles.join(", ")}` : ""
    lines.push(`- ${app.app} (${app.category}): ${minutesLabel(app.minutes)}${titles}`)
  }
  if (response.shipped.length > 0) {
    lines.push("")
    lines.push("**Shipped:**")
    for (const item of response.shipped) lines.push(`- ${item}`)
  }
  lines.push("")
  return lines.join("\n")
}

const mapError =
  (label: string) =>
  (error: unknown): ReportError =>
    new ReportError({
      message: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    })

/**
 * Produces the end-of-day report for a local date (YYYY-MM-DD), optionally
 * writing the markdown file to the configured review directory.
 */
export const reportProgram = (
  date: string,
): Effect.Effect<void, ReportError, ActivityRepo | GitCommits | LlmClient | AppConfigService> =>
  Effect.gen(function* () {
    const repo = yield* ActivityRepo
    const git = yield* GitCommits
    const llm = yield* LlmClient
    const config = yield* AppConfigService

    const [start, end] = localDayRange(date)

    const rows = yield* repo.listDay(start, end).pipe(Effect.mapError(mapError("listing activity")))
    const commits = yield* git.listSince(start).pipe(Effect.mapError(mapError("listing git commits")))

    const intervals = rows.map(
      (row): WindowInterval => ({
        id: row.id,
        startAt: row.startAt,
        endAt: row.endAt,
        app: row.app,
        title: row.title,
      }),
    )

    if (intervals.length === 0 && commits.length === 0) {
      yield* Effect.logWarning(`No activity recorded for ${date}`)
      return
    }

    const report = aggregate({ date, intervals, commits })
    const response = yield* llm.summarize(report).pipe(Effect.mapError(mapError("summarizing")))

    const text = render(report, response)
    console.log(text)

    const directory = expandHome(config.reviewDirectory)
    yield* Fs.makeDirectory(directory, { recursive: true }).pipe(Effect.mapError(mapError("creating review directory")))
    yield* Fs.writeFileString(`${directory}/${date}.md`, text).pipe(Effect.mapError(mapError("writing review file")))
    yield* Effect.log(`Wrote ${directory}/${date}.md`)
  })
