import { categorizeApp } from "./categories.js"

const schemePattern = /^https?:\/\//i

const isBareUrl = (title: string): boolean => {
  const stripped = title.replace(schemePattern, "").replace(/^www\./i, "")
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(stripped)
}

const domainOf = (title: string): string => {
  const stripped = title.replace(schemePattern, "").replace(/^www\./i, "")
  return stripped.split("/")[0] ?? stripped
}

/**
 * Redacts a window title before it is sent to the LLM.
 *
 * User-set rule (browser category): keep everything before the first " - ";
 * if the title is a bare URL (no " - "), keep only its domain. Non-browser
 * titles pass through unchanged.
 *
 * Raw titles stay in Postgres; this only shapes the aggregated payload.
 */
export const redactTitle = (app: string, title: string): string => {
  if (categorizeApp(app) !== "browser") {
    return title
  }

  const trimmed = title.trim()

  if (isBareUrl(trimmed)) {
    return domainOf(trimmed)
  }

  const separator = trimmed.indexOf(" - ")
  if (separator !== -1) {
    return trimmed.slice(0, separator).trim()
  }

  return trimmed
}
