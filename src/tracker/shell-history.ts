import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Fs from "../fs.js"

export interface ShellEvent {
  readonly timestamp: Date
  readonly command: string
  readonly source: "zsh" | "bash"
}

export interface ReadResult {
  readonly events: ReadonlyArray<ShellEvent>
  readonly newOffset: number
}

export class ShellHistoryError extends Schema.TaggedErrorClass<ShellHistoryError>()("ShellHistory.ShellHistoryError", {
  message: Schema.String,
}) {}

export interface Interface {
  readonly readNew: (path: string, offset: number) => Effect.Effect<ReadResult, ShellHistoryError>
}

export class ShellHistory extends Context.Service<ShellHistory, Interface>()("@app/ShellHistory") {}

const zshLine = /^:\s*(\d+):\d+;(.*)$/
const bashMarker = /^#(\d+)$/

const parseZsh = (lines: ReadonlyArray<string>): ReadonlyArray<ShellEvent> =>
  lines.flatMap((line) => {
    const m = line.match(zshLine)
    if (!m) return []
    const timestamp = Number(m[1])
    const command = m[2]?.trim()
    if (timestamp === 0 || command === undefined || command.length === 0) return []
    return [{ timestamp: new Date(timestamp * 1000), command, source: "zsh" }]
  })

const parseBash = (lines: ReadonlyArray<string>): ReadonlyArray<ShellEvent> => {
  const events: Array<ShellEvent> = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue
    const m = line.match(bashMarker)
    if (m && i + 1 < lines.length) {
      const timestamp = Number(m[1])
      const command = lines[i + 1]?.trim() ?? ""
      if (timestamp !== 0 && command.length > 0) {
        events.push({
          timestamp: new Date(timestamp * 1000),
          command,
          source: "bash",
        })
      }
      i += 1
    }
  }
  return events
}

const parseHistory = (path: string, lines: ReadonlyArray<string>): ReadonlyArray<ShellEvent> => {
  if (path.includes("zsh")) return parseZsh(lines)
  if (path.includes("bash")) return parseBash(lines)
  return []
}

export const layer = Layer.effect(
  ShellHistory,
  Effect.gen(function* () {
    const readNew = Effect.fn("ShellHistory.readNew")(function* (path, offset) {
      const content = yield* Fs.readFileString(path).pipe(
        Effect.mapError((e) => new ShellHistoryError({ message: e.message })),
      )

      if (content.length <= offset) {
        return { events: [], newOffset: content.length }
      }

      const newContent = content.slice(offset)
      const lines = newContent.split("\n")
      const completeLines = newContent.endsWith("\n") ? lines : lines.slice(0, -1)
      const partial = newContent.endsWith("\n") ? "" : (lines.at(-1) ?? "")

      return {
        events: parseHistory(path, completeLines),
        newOffset: content.length - partial.length,
      }
    })

    return ShellHistory.of({ readNew })
  }),
)
