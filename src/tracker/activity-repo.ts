import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqlError } from "effect/unstable/sql";

export const EventRow = Schema.Struct({
  id: Schema.NumberFromString,
  startAt: Schema.Date,
  endAt: Schema.Date,
  app: Schema.String,
  title: Schema.String,
  kind: Schema.Literals(["window", "shell"]),
});

export interface EventRow extends Schema.Schema.Type<typeof EventRow> {}

export interface NewEvent {
  readonly startAt: Date;
  readonly endAt: Date;
  readonly app: string;
  readonly title: string;
  readonly kind: "window" | "shell";
  readonly command: string | undefined;
}

export class PersistenceError extends Schema.TaggedErrorClass<PersistenceError>()(
  "ActivityRepo.PersistenceError",
  { message: Schema.String },
) {}

export interface Interface {
  readonly insertEvent: (
    event: NewEvent,
  ) => Effect.Effect<{ id: number }, SqlError.SqlError | PersistenceError>;
  readonly updateEventEnd: (
    id: number,
    endAt: Date,
  ) => Effect.Effect<void, SqlError.SqlError | PersistenceError>;
  readonly listDay: (
    start: Date,
    end: Date,
  ) => Effect.Effect<ReadonlyArray<EventRow>, SqlError.SqlError | PersistenceError>;
}

export class ActivityRepo extends Context.Service<ActivityRepo, Interface>()(
  "@app/ActivityRepo",
) {}

const decodeRows = (
  rows: ReadonlyArray<unknown>,
): Effect.Effect<ReadonlyArray<EventRow>, PersistenceError> =>
  Schema.decodeUnknownEffect(Schema.Array(EventRow))(rows).pipe(
    Effect.mapError(
      (error): PersistenceError =>
        new PersistenceError({
          message: `Failed to decode activity rows: ${error.message}`,
        }),
    ),
  );

export const layer = Layer.effect(
  ActivityRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const insertEvent = Effect.fn("ActivityRepo.insertEvent")(function* (
      event: NewEvent,
    ) {
      const rows = yield* sql<{ id: string | number }>`
        INSERT INTO activity.event (start_at, end_at, app, title, kind, command)
        VALUES (${event.startAt}, ${event.endAt}, ${event.app}, ${event.title}, ${event.kind}, ${event.command})
        RETURNING id
      `;
      const rawId = rows[0]?.id;
      if (rawId === undefined) {
        return yield* Effect.fail(
          new PersistenceError({ message: "INSERT returned no id" }),
        );
      }
      return { id: Number(rawId) };
    });

    const updateEventEnd = Effect.fn("ActivityRepo.updateEventEnd")(function* (
      id: number,
      endAt: Date,
    ) {
      yield* sql`
        UPDATE activity.event SET end_at = ${endAt} WHERE id = ${id}
      `;
    });

    const listDay = Effect.fn("ActivityRepo.listDay")(function* (
      start: Date,
      end: Date,
    ) {
      const rows = yield* sql`
        SELECT id, start_at AS "startAt", end_at AS "endAt", app, title, kind
        FROM activity.event
        WHERE kind = 'window' AND start_at >= ${start} AND start_at < ${end}
        ORDER BY start_at ASC
      `;
      return yield* decodeRows(rows);
    });

    return ActivityRepo.of({ insertEvent, updateEventEnd, listDay });
  }),
);
