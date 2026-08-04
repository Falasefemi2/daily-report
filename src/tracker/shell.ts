import { Effect, Schema } from "effect"

export class ShellError extends Schema.TaggedErrorClass<ShellError>()(
  "Tracker.ShellError",
  { command: Schema.String, message: Schema.String },
) {}

/**
 * Runs an argv array via Bun.spawn (no shell quoting involved), returning
 * stdout as a string. Fails with a typed ShellError on non-zero exit.
 */
export const run = (
  cwd: string | undefined,
  args: ReadonlyArray<string>,
): Effect.Effect<string, ShellError> =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn({
        cmd: [...args],
        cwd: cwd ?? process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      })
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        throw new Error(stderr.trim() || `exit code ${exitCode}`)
      }
      return stdout
    },
    catch: (cause) =>
      new ShellError({
        command: args.join(" "),
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  })
