import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import type { DailyReport } from "../aggregate/aggregate.js"
import { AppConfigService } from "../config.js"
import { LlmClient, LlmError, LlmResponse } from "./llm-client.js"
import { buildUserPrompt, systemPrompt } from "./prompt.js"

const postChat = (endpoint: string, apiKey: Redacted.Redacted, body: unknown): Effect.Effect<string, LlmError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Redacted.value(apiKey)}`,
        },
        body: JSON.stringify(body),
      })
      const text = await response.text()
      if (!response.ok) {
        throw new Error(`Groq HTTP ${response.status}: ${text.slice(0, 500)}`)
      }
      return text
    },
    catch: (cause) => new LlmError({ message: cause instanceof Error ? cause.message : String(cause) }),
  })

const extractContent = (raw: string): Effect.Effect<unknown, LlmError> =>
  Effect.try({
    try: () => {
      const json = JSON.parse(raw) as {
        choices?: ReadonlyArray<{ message?: { content?: string } }>
      }
      const content = json.choices?.[0]?.message?.content
      if (typeof content !== "string") {
        throw new Error("Groq response missing choices[0].message.content")
      }
      return JSON.parse(content) as unknown
    },
    catch: (cause) => new LlmError({ message: cause instanceof Error ? cause.message : String(cause) }),
  })

export const layer = Layer.effect(
  LlmClient,
  Effect.gen(function* () {
    const config = yield* AppConfigService

    const summarize = Effect.fn("LlmClient.summarize")(function* (report: DailyReport) {
      if (Option.isNone(config.groqApiKey)) {
        return yield* Effect.fail(new LlmError({ message: "GROQ_API_KEY is not set" }))
      }
      const apiKey = config.groqApiKey.value

      const body = {
        model: config.groqModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildUserPrompt(report) },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }

      const raw = yield* postChat(config.groqEndpoint, apiKey, body).pipe(
        Effect.timeout(Duration.seconds(60)),
        Effect.retry(Schedule.exponential("500 millis").pipe(Schedule.jittered, Schedule.upTo({ times: 4 }))),
        Effect.mapError(
          (error): LlmError =>
            new LlmError({
              message: error instanceof Error ? error.message : "Groq request timed out",
            }),
        ),
      )

      const parsed = yield* extractContent(raw)
      const decoded = yield* Schema.decodeUnknownEffect(LlmResponse)(parsed).pipe(
        Effect.mapError((error): LlmError => new LlmError({ message: `Invalid LLM response: ${error.message}` })),
      )
      return decoded
    })

    return LlmClient.of({ summarize })
  }),
)
