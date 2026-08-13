import * as fs from "node:fs/promises"
import * as Effect from "effect/Effect"

export const readDirectory = (directory: string): Effect.Effect<ReadonlyArray<string>, Error> =>
  Effect.tryPromise({
    try: () => fs.readdir(directory),
    catch: (cause) => new Error(`Failed to read directory ${directory}: ${String(cause)}`),
  })

export const readFileString = (file: string): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: () => fs.readFile(file, "utf8"),
    catch: (cause) => new Error(`Failed to read file ${file}: ${String(cause)}`),
  })

export const writeFileString = (file: string, content: string): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () => fs.writeFile(file, content, "utf8"),
    catch: (cause) => new Error(`Failed to write file ${file}: ${String(cause)}`),
  })

export const makeDirectory = (
  directory: string,
  options?: { readonly recursive?: boolean },
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () => fs.mkdir(directory, options),
    catch: (cause) => new Error(`Failed to create directory ${directory}: ${String(cause)}`),
  })
