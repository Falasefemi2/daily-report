import type { Effect } from "effect"
import * as Context from "effect/Context"
import * as Schema from "effect/Schema"
import type { DailyReport } from "../aggregate/aggregate.js"

export const LlmResponse = Schema.Struct({
  summary: Schema.String,
  verdict: Schema.Literals(["focused", "balanced", "scattered"]),
  shipped: Schema.Array(Schema.String),
})

export interface LlmResponse extends Schema.Schema.Type<typeof LlmResponse> {}

export class LlmError extends Schema.TaggedErrorClass<LlmError>()("LlmClient.LlmError", { message: Schema.String }) {}

export interface Interface {
  readonly summarize: (report: DailyReport) => Effect.Effect<LlmResponse, LlmError>
}

export class LlmClient extends Context.Service<LlmClient, Interface>()("@app/LlmClient") {}
