import { PgClient } from "@effect/sql-pg"
import { Config, Effect } from "effect"
import { Migrator, SqlClient } from "effect/unstable/sql"
import * as Fs from "./fs.js"
import { AppConfigService } from "./config.js"

export const layer = PgClient.layerConfig(
  Config.redacted("DATABASE_URL").pipe(Config.map((url) => ({ url }))),
)

/**
 * Migration loader that reads plain `.sql` files named `<id>_<name>.sql` from
 * the configured migrations directory and executes each pending file as a
 * single statement, inside the migrator's transaction. Mirrors the effectq
 * schema-management approach (migrations table + forward-only files), but
 * without the pg_dump schema dumping that PgMigrator wires in.
 */
const sqlFileLoader = Effect.gen(function* () {
  const config = yield* AppConfigService
  const files = yield* Fs.readDirectory(config.migrationsDirectory)

  const migrations = files
    .flatMap((file) => {
      const m = file.match(/^(\d+)_(.+)\.sql$/)
      const name = m?.[2]
      if (m === null || name === undefined) return []
      return [{ file, id: Number(m[1]), name }]
    })
    .sort((a, b) => a.id - b.id)

  return migrations.map(
    ({ file, id, name }): Migrator.ResolvedMigration => [
      id,
      name,
      Effect.succeed(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const content = yield* Fs.readFileString(`${config.migrationsDirectory}/${file}`)
          yield* sql.unsafe(content)
        }),
      ),
    ],
  )
}).pipe(
  Effect.mapError(
    (error): Migrator.MigrationError =>
      new Migrator.MigrationError({
        kind: "Failed",
        message: error.message,
      }),
  ),
)

/**
 * Applies pending migrations. Requires `SqlClient` (provided by the PgClient
 * layer) plus `AppConfigService` for the migrations directory.
 */
export const migrateProgram = Migrator.make({ dumpSchema: () => Effect.void })({
  loader: sqlFileLoader,
})
