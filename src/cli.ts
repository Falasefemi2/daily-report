import { Effect } from "effect"
import { layer as appConfigLayer } from "./config.js"
import { todayLocal } from "./date.js"
import { layer as dbLayer, migrateProgram } from "./db.js"
import { layer as gitCommitsLayer } from "./git/commits.js"
import { layer as groqLayer } from "./llm/groq.js"
import { reportProgram } from "./report/report.js"
import { layer as activityRepoLayer } from "./tracker/activity-repo.js"
import { platformLayer } from "./tracker/platforms.js"
import { layer as shellHistoryLayer } from "./tracker/shell-history.js"
import { Tracker, layer as trackerLayer } from "./tracker/tracker.js"

// Bot verification comment: this change exists so the AI review bot has
// something to review on a fresh PR.
const usage = `Daily Activity Review Bot

usage:
  bun run tracker              start the active-window tracking daemon
  bun run report               produce today's report
  bun run report --date 2026-08-04   produce a report for a specific local day
  bun run migrate              apply pending SQL migrations`

const parseDateArg = (args: ReadonlyArray<string>): string => {
  const index = args.indexOf("--date")
  if (index === -1) return todayLocal()
  const value = args[index + 1]
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid --date value "${value}" (expected YYYY-MM-DD)`)
  }
  return value
}

const program = Effect.gen(function* () {
  const [command, ...rest] = process.argv.slice(2)

  switch (command) {
    case "tracker": {
      const tracker = yield* Tracker
      yield* tracker.run
      break
    }
    case "report": {
      const date = parseDateArg(rest)
      yield* reportProgram(date)
      break
    }
    case "migrate": {
      yield* migrateProgram
      break
    }
    default:
      console.log(usage)
  }
})

const main = program.pipe(
  Effect.provide(trackerLayer),
  Effect.provide(platformLayer(process.platform)),
  Effect.provide(activityRepoLayer),
  Effect.provide(shellHistoryLayer),
  Effect.provide(gitCommitsLayer),
  Effect.provide(groqLayer),
  Effect.provide(dbLayer),
  Effect.provide(appConfigLayer),
)

Effect.runPromise(main).then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  },
)
