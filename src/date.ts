import { homedir } from "node:os"
import * as path from "node:path"

const pad = (n: number): string => String(n).padStart(2, "0")

/** Local-timezone YYYY-MM-DD string for a Date. */
export const localDateString = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const todayLocal = (): string => localDateString(new Date())

/**
 * Local-timezone day boundaries for a YYYY-MM-DD string, as JS Dates.
 * The pg driver serializes these to the correct UTC instants for
 * timestamptz comparisons, so the query honors the machine's local day.
 */
export const localDayRange = (date: string): readonly [Date, Date] => {
  const [year, month, day] = date.split("-").map(Number)
  if (!year || !month || !day) {
    throw new Error(`Invalid date: "${date}" (expected YYYY-MM-DD)`)
  }
  const start = new Date(year, month - 1, day, 0, 0, 0, 0)
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0)
  return [start, end]
}

export const expandHome = (p: string): string =>
  p === "~" ? homedir() : p.startsWith("~/") ? path.join(homedir(), p.slice(2)) : p
