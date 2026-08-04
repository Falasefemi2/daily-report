import type { Stats } from "node:fs"
import * as fs from "node:fs/promises"
import { Effect } from "effect"

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

export const stat = (file: string): Effect.Effect<Stats, Error> =>
  Effect.tryPromise({
    try: () => fs.stat(file),
    catch: (cause) => new Error(`Failed to stat ${file}: ${String(cause)}`),
  })

export const openFile = (file: string): Effect.Effect<fs.FileHandle, Error> =>
  Effect.tryPromise({
    try: () => fs.open(file, "r"),
    catch: (cause) => new Error(`Failed to open ${file}: ${String(cause)}`),
  })
