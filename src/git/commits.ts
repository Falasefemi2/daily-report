import { Context, Effect, Layer, Schema } from "effect"
import type { GitCommit } from "../aggregate/aggregate.js"
import { AppConfigService } from "../config.js"
import * as Shell from "../tracker/shell.js"

export interface Interface {
  readonly listSince: (start: Date) => Effect.Effect<ReadonlyArray<GitCommit>, GitError>
}

export class GitCommits extends Context.Service<GitCommits, Interface>()("@app/GitCommits") {}

export class GitError extends Schema.TaggedErrorClass<GitError>()("GitCommits.GitError", {
  repo: Schema.String,
  message: Schema.String,
}) {}

const listRepo = (repo: string, since: string): Effect.Effect<ReadonlyArray<GitCommit>, GitError> =>
  Effect.gen(function* () {
    const out = yield* Shell.run(repo, [
      "git",
      "log",
      `--since=${since}`,
      "--date=iso-strict",
      "--pretty=format:%H|%aI|%s",
    ]).pipe(Effect.mapError((error): GitError => new GitError({ repo, message: error.message })))
    return out.split("\n").flatMap((line) => {
      const [hash, at, ...messageParts] = line.split("|")
      if (!hash || !at) return []
      return [{ repo, message: messageParts.join("|"), at: new Date(at) }]
    })
  })

export const layer = Layer.effect(
  GitCommits,
  Effect.gen(function* () {
    const config = yield* AppConfigService

    const listSince = Effect.fn("GitCommits.listSince")(function* (start: Date) {
      if (config.repoPaths.length === 0) return []

      const since = start.toISOString()
      const results = yield* Effect.forEach(
        config.repoPaths,
        (repo) =>
          listRepo(repo, since).pipe(
            Effect.matchEffect({
              onFailure: (error) =>
                Effect.logWarning(`git log in ${repo} failed: ${error.message}`).pipe(Effect.as([])),
              onSuccess: (commits) => Effect.succeed(commits),
            }),
          ),
        { concurrency: "unbounded" },
      )
      return results.flat()
    })

    return GitCommits.of({ listSince })
  }),
)
