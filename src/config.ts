import { Config, Context, Duration, Effect, Layer, type Option, type Redacted } from "effect"

export interface AppConfig {
  readonly databaseUrl: Redacted.Redacted
  readonly groqApiKey: Option.Option<Redacted.Redacted>
  readonly groqModel: string
  readonly groqEndpoint: string
  readonly repoPaths: ReadonlyArray<string>
  readonly pollInterval: Duration.Duration
  readonly shellHistoryPath: Option.Option<string>
  readonly reviewDirectory: string
  readonly migrationsDirectory: string
}

export class AppConfigService extends Context.Service<AppConfigService, AppConfig>()("@app/AppConfig") {}

const repoPaths = Config.string("REPO_PATHS").pipe(
  Config.withDefault(""),
  Config.map((s) =>
    s
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
  ),
)

const shellHistoryPath = Config.option(Config.string("SHELL_HISTORY_PATH"))

export const layer = Layer.effect(
  AppConfigService,
  Effect.gen(function* () {
    const databaseUrl = yield* Config.redacted("DATABASE_URL")
    const groqApiKey = yield* Config.option(Config.redacted("GROQ_API_KEY"))
    const groqModel = yield* Config.string("GROQ_MODEL").pipe(Config.withDefault("llama-3.3-70b-versatile"))
    const groqEndpoint = yield* Config.string("GROQ_ENDPOINT").pipe(
      Config.withDefault("https://api.groq.com/openai/v1/chat/completions"),
    )
    const repos = yield* repoPaths
    const pollInterval = yield* Config.duration("POLL_INTERVAL").pipe(Config.withDefault(Duration.seconds(5)))
    const historyPath = yield* shellHistoryPath
    const reviewDirectory = yield* Config.string("REVIEW_DIR").pipe(Config.withDefault("~/daily-reviews"))
    const migrationsDirectory = yield* Config.string("MIGRATIONS_DIR").pipe(Config.withDefault("migrations"))

    return AppConfigService.of({
      databaseUrl,
      groqApiKey,
      groqModel,
      groqEndpoint,
      repoPaths: repos,
      pollInterval,
      shellHistoryPath: historyPath,
      reviewDirectory,
      migrationsDirectory,
    })
  }),
)
