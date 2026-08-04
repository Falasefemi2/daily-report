import { Context, Effect, Layer, Option, Ref, Schedule } from "effect"
import { AppConfigService } from "../config.js"
import { ActivityRepo } from "./activity-repo.js"
import type { ShellEvent } from "./shell-history.js"
import { ShellHistory } from "./shell-history.js"
import { WindowSampler } from "./window-sampler.js"

export interface Interface {
  readonly run: Effect.Effect<never>
}

export class Tracker extends Context.Service<Tracker, Interface>()("@app/Tracker") {}

export const layer = Layer.effect(
  Tracker,
  Effect.gen(function* () {
    const sampler = yield* WindowSampler
    const repo = yield* ActivityRepo
    const history = yield* ShellHistory
    const config = yield* AppConfigService

    const openInterval = yield* Ref.make<
      { readonly id: number; readonly app: string; readonly title: string } | undefined
    >(undefined)
    const shellOffset = yield* Ref.make(0)

    const ingestSample = Effect.gen(function* () {
      const sample = yield* sampler.sample.pipe(
        Effect.matchEffect({
          onFailure: (error) => Effect.logWarning(`window sample failed: ${error.message}`).pipe(Effect.as(undefined)),
          onSuccess: (sample) => Effect.succeed(sample),
        }),
      )
      if (sample === undefined) return

      const current = yield* Ref.get(openInterval)
      if (current !== undefined && current.app === sample.app && current.title === sample.title) {
        // Debounce: extend the open interval's end time, no new row.
        yield* repo.updateEventEnd(current.id, sample.sampledAt).pipe(
          Effect.matchEffect({
            onFailure: (error) => Effect.logWarning(`extend interval failed: ${error.message}`),
            onSuccess: () => Effect.void,
          }),
        )
        return
      }

      // App/title changed (or no open interval): close the previous one and open a new one.
      if (current !== undefined) {
        yield* repo.updateEventEnd(current.id, sample.sampledAt).pipe(
          Effect.matchEffect({
            onFailure: (error) => Effect.logWarning(`close interval failed: ${error.message}`),
            onSuccess: () => Effect.void,
          }),
        )
      }

      const inserted = yield* repo
        .insertEvent({
          startAt: sample.sampledAt,
          endAt: sample.sampledAt,
          app: sample.app,
          title: sample.title,
          kind: "window",
          command: undefined,
        })
        .pipe(
          Effect.matchEffect({
            onFailure: (error) =>
              Effect.logWarning(`insert interval failed: ${error.message}`).pipe(Effect.as(undefined)),
            onSuccess: (row) => Effect.succeed(row),
          }),
        )

      if (inserted !== undefined) {
        yield* Ref.set(openInterval, {
          id: inserted.id,
          app: sample.app,
          title: sample.title,
        })
      }
    })

    const ingestShell = Effect.gen(function* () {
      if (Option.isNone(config.shellHistoryPath)) return
      const path = config.shellHistoryPath.value

      const offset = yield* Ref.get(shellOffset)
      const result = yield* history.readNew(path, offset).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.logWarning(`shell history read failed: ${error.message}`).pipe(Effect.as(undefined)),
          onSuccess: (result) => Effect.succeed(result),
        }),
      )
      if (result === undefined) return

      yield* Ref.set(shellOffset, result.newOffset)

      yield* Effect.forEach(
        result.events,
        (event: ShellEvent) =>
          repo
            .insertEvent({
              startAt: event.timestamp,
              endAt: event.timestamp,
              app: "shell",
              title: "",
              kind: "shell",
              command: event.command,
            })
            .pipe(
              Effect.matchEffect({
                onFailure: (error) => Effect.logWarning(`shell insert failed: ${error.message}`),
                onSuccess: () => Effect.void,
              }),
            ),
        { concurrency: "unbounded" },
      )
    })

    const runPass = Effect.gen(function* () {
      yield* ingestSample
      yield* ingestShell
    })

    // Poll forever at the configured interval. Typed failures are already
    // contained in runPass, so the loop keeps going until interrupted.
    const run = runPass.pipe(
      Effect.repeat(Schedule.spaced(config.pollInterval)),
      Effect.andThen(() => Effect.never),
      Effect.annotateLogs({ module: "tracker" }),
    )

    return Tracker.of({ run })
  }),
)
