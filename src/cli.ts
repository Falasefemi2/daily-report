import { BunRuntime, BunServices } from "@effect/platform-bun"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Command, Flag } from "effect/unstable/cli"
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

const DatePattern = Schema.String.pipe(Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)))

const date = Flag.string("date").pipe(
  Flag.withSchema(DatePattern),
  Flag.withDescription("Report for this local day (defaults to today)"),
  Flag.optional,
)

const report = Command.make("report", { date }, ({ date }) =>
  reportProgram(Option.getOrElse(date, () => todayLocal())),
).pipe(
  Command.withDescription("Produce the end-of-day report for a local day"),
  Command.withExamples([
    { command: "bun run src/cli.ts report", description: "Report for today" },
    { command: "bun run src/cli.ts report --date 2026-08-04", description: "Report for a specific local day" },
  ]),
)

const tracker = Command.make("tracker", {}, () =>
  Effect.gen(function* () {
    const service = yield* Tracker
    yield* service.run
  }),
).pipe(Command.withDescription("Start the active-window tracking daemon"))

const migrate = Command.make("migrate", {}, () => migrateProgram).pipe(
  Command.withDescription("Apply pending SQL migrations"),
)

const app = Command.make("daily").pipe(
  Command.withDescription("Daily Activity Review Bot"),
  Command.withSubcommands([tracker, report, migrate]),
)

const program = Command.run(app, {
  version: "1.0.0",
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
  Effect.provide(BunServices.layer),
)

BunRuntime.runMain(main)
