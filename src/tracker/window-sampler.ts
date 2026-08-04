import { Context, Effect, Layer, Schema } from "effect"

export interface WindowSample {
  readonly app: string
  readonly title: string
  readonly sampledAt: Date
}

export class WindowSamplerError extends Schema.TaggedErrorClass<WindowSamplerError>()(
  "WindowSampler.WindowSamplerError",
  { message: Schema.String },
) {}

export interface Interface {
  readonly sample: Effect.Effect<WindowSample, WindowSamplerError>
}

export class WindowSampler extends Context.Service<WindowSampler, Interface>()("@app/WindowSampler") {}

export const layerStub = Layer.succeed(
  WindowSampler,
  WindowSampler.of({
    sample: Effect.fail(
      new WindowSamplerError({
        message: "No active-window backend available on this platform",
      }),
    ),
  }),
)
