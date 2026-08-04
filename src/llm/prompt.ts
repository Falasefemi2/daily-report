import type { DailyReport } from "../aggregate/aggregate.js"

export const systemPrompt = `You are a personal productivity assistant writing a short end-of-day review.

You receive a JSON object describing one day of computer activity. It is already aggregated and any sensitive window titles have been redacted.

Rules:
- Write 3-5 concise, specific sentences referencing the actual categories and apps from the data.
- Base the focus-vs-scattered verdict on context-switch density: switchesPerHour >= 15 means scattered, <= 6 means focused, otherwise balanced.
- "shipped" is a bullet list of what got shipped based only on the git commits; use an empty array when there are no commits.
- Never invent data that is not present in the input.

Respond with ONLY a single JSON object in exactly this shape:
{"summary": "3-5 sentences", "verdict": "focused" | "balanced" | "scattered", "shipped": ["short bullet", "..."]}`

export const buildUserPrompt = (report: DailyReport): string =>
  `Here is the aggregated activity for ${report.date}:\n\n` +
  `${JSON.stringify(report, null, 2)}\n\n` +
  `Write the end-of-day review JSON now.`
