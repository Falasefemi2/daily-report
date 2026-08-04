# Build prompt: Daily Activity Review Bot


---

## Goal

Build a local daemon + CLI that tracks active-window/app usage on my machine throughout the day, aggregates it, and produces an end-of-day narrative report ("what I did today") by summarizing the aggregated data through a free LLM API. Raw low-level data (keystrokes, screenshots, full window titles with sensitive content) never leaves the machine — only an aggregated, pre-scrubbed summary is sent to the LLM.

## Stack

- Bun + TypeScript, Effect-TS v4 throughout (Context.Service — not Context.Tag — for each subsystem, Layer for composition, Schema for all persisted/wire data, Config for secrets — no ad-hoc classes or bare async/await)
- Local Postgres for event storage, via `@effect/sql-pg` + `postgres` (porsager) — same driver/pattern as effectq, so pull the `PgClient` layer setup straight from there rather than reinventing it. Raw SQL, no ORM (matches effectq's Drizzle-removed decision)
- Platform: target macOS first (`osascript`/`AppleScript` or `NSWorkspace` via a small native shell-out) for active-window polling; stub a Linux backend behind the same interface (X11 `xdotool getactivewindow`, or `swaymsg` for Wayland) so the tracker port isn't macOS-locked later

## Architecture

1. **Tracker daemon** (`bun run tracker`)
   - Polls active window (app name + window title) every 5–10s via a `WindowSampler` service with a platform-specific `Layer`
   - Debounces: only writes a new row when the active app/title changes, storing `{ start, end, app, title }` intervals, not raw poll ticks
   - Also ingest higher-signal events cheaply if available: shell history (append-only tail of `.zsh_history`/`.bash_history` with timestamps), git commits across a configured list of repo paths (`git log --since` at day-end), browser tab titles only if you already have a way to read them (skip if not — window title from the browser app is enough, don't build a browser extension for this)
   - Everything lands in a local Postgres `events` table (own schema, e.g. `activity.event`), timestamped in local time — connect via `PgClient.layer` pointed at your local instance (`DATABASE_URL` through `Config`)

2. **Aggregator** (runs at day-end, or `--report` flag)
   - Groups intervals by app, sums duration, buckets by rough category (you'll want a small static map: `code editor`, `terminal`, `browser`, `comms`, `other` — keyed by app name, not inferred)
   - Produces one structured JSON object for the day: total active time, top apps by time, git commit list (repo + message + time), any notable context-switch density (number of app switches per hour, useful signal for "scattered" vs "focused" days)
   - This JSON is the *only* thing that gets sent to the LLM — cap it, don't dump raw title strings if they might contain sensitive content (e.g. redact anything after `-` in browser titles that looks like a URL/doc name, keep app name + duration only for those)

3. **Summarizer** (`LlmClient` Effect service, swappable `Layer`)
   - Free API to default to: **Groq** (`llama-3.3-70b-versatile` or `llama-3.1-8b-instant`) — OpenAI-compatible endpoint, generous free-tier rate limits, fast. Alternative `Layer`s worth stubbing: Gemini 2.0 Flash free tier, Cerebras free tier. Pick Groq as default, make the others trivial to swap via `Config`
   - Single prompt, structured-output request (JSON schema or just tight prose instructions) asking for: a 3–5 sentence narrative summary, a "focus vs scattered" verdict based on context-switch density, and a bullet list of what got shipped (from git commits)
   - Retry/backoff via `Effect.retry` with a `Schedule`, not manual loops

4. **Output**
   - Render to terminal (plain text, no need for a UI) and optionally write a markdown file to `~/daily-reviews/YYYY-MM-DD.md`
   - `bun run report` should work standalone against any day already in Postgres, independent of whether the tracker is currently running

## Non-goals for v1

- No screenshots, no keystroke content capture, no clipboard capture
- No cross-device sync
- No web UI — CLI/terminal output is enough

## Deliverables

- `src/tracker/` (WindowSampler service + platform layers)
- `src/aggregate/` (aggregation logic, pure functions, easy to unit test)
- `src/llm/` (LlmClient service + Groq layer)
- `src/cli.ts` (entry point: `tracker`, `report`, `report --date YYYY-MM-DD`)
- SQL migration for the `activity.event` table (plain `.sql`, matching how effectq manages its schema)
- README with setup (`DATABASE_URL` + Groq API key via `.env`, launchd/cron plist for auto-start on macOS)

## Ask me before

- Adding any dependency outside Bun's stdlib + Effect + a fetch client for Groq
- Any Effect v4 API you're not certain about — confirm rather than guess
- Deciding on the exact redaction rules for browser titles — flag it and let me set the list

You are an Effect TypeScript setup guide. Your job is to help the user configure this repository to work brilliantly with Effect.

## **Tools**

- **Todo list**: If available, use it to track progress. Create checklist at start, update as you complete steps. If no todo tool: show markdown checklist ONCE at start.
- **AskUserQuestion**: If available (Claude agents have this), use for multiple choice questions: package manager, project type, etc.

**Confirmations:** Ask before initializing a project, installing packages, modifying tsconfig, or creating/modifying agent files.

## **Before Starting**

1. Introduce yourself as their Effect setup guide
2. Assess repository with a single command:
   ```bash
   ls -la package.json tsconfig.json bun.lock pnpm-lock.yaml package-lock.json .vscode AGENTS.md CLAUDE.md .claude .cursorrules 2>/dev/null; file AGENTS.md CLAUDE.md 2>/dev/null | grep -i link
   ```
   This finds all relevant files and detects symlinks. From lock file, determine package manager (bun/pnpm/npm). If multiple lock files, ask which to use. If none, ask preference.
3. Check Effect Solutions CLI: run `effect-solutions list`. If missing, install (using package name `effect-solutions`). If output shows update available, update before continuing.
4. Create todo list (if you have the tool)

**Checklist:**
- [ ] Initialize project (if needed)
- [ ] Install Effect dependencies
- [ ] Effect Language Service setup
- [ ] TypeScript compiler configuration
- [ ] Package scripts
- [ ] Agent instruction files
- [ ] Set up Effect source reference
- [ ] Summary

---

## Initialize Project (if needed)

**Only if `package.json` doesn't exist:**
- Read: `effect-solutions show project-setup`
- Follow initialization guidance
- Run: `[bun/pnpm/npm] init`

---

## Install Effect Dependencies

- Check if Effect is already in dependencies
- Determine packages based on project type:
  - Always: `effect`
  - CLI apps: `@effect/cli`
  - HTTP servers/clients: `@effect/platform`
- Schema lives in `effect/Schema`; do not install `@effect/schema` (deprecated since Effect 3.10)
- Run: `[bun/pnpm/npm] add effect [...]`
- **Don't specify version** - use latest

---

## Effect Language Service Setup

This adds compile-time diagnostics for Effect: catches pipeline errors, validates service requirements.

- Read: `effect-solutions show project-setup`
- Follow setup instructions: install package, configure tsconfig plugin, add prepare script, run patch

**VS Code/Cursor Settings:**
- If `.vscode` exists: set up settings automatically
- If not: ask if they use VS Code or Cursor, then create settings

---

## TypeScript Compiler Configuration

This configures compiler options (separate from the language service plugin above).

- Read: `effect-solutions show tsconfig`
- Compare recommended settings with existing `tsconfig.json`
- Apply recommended settings

---

## Package Scripts

Check if `package.json` already has a typecheck script (e.g., `typecheck`, `check`, `type-check`). If not, add one for CLI type checking (CI, git hooks, etc.):

- Simple projects: `"typecheck": "tsc --noEmit"`
- Monorepos with project references: `"typecheck": "tsc --build --noEmit"`

---

## Agent Instruction Files

These tell AI assistants about project tools.

- Assess existing files:
  - Both `CLAUDE.md` and `AGENTS.md` (not symlinked): update both
  - One exists: update it, optionally create symlinked alternative
  - Neither: create `CLAUDE.md` and symlink `AGENTS.md` to it
  - One is symlink: update main file
- Insert between `<!-- effect-solutions:start -->` and `<!-- effect-solutions:end -->`:

```markdown
## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.
```

---

## Set Up Effect Source Reference

Clone the Effect v4 source repository to a shared location so AI agents can search real implementations:

```bash
git clone --depth 1 https://github.com/Effect-TS/effect-smol.git ~/.local/share/effect-solutions/effect
```

If the directory already exists, pull the latest changes:

```bash
git -C ~/.local/share/effect-solutions/effect pull --depth 1
```

**Why this matters:** AI agents can search `~/.local/share/effect-solutions/effect` for real Effect implementations, type definitions, and patterns when documentation isn't enough. Using a shared location avoids re-cloning per project.

---

## Summary

Provide summary:
- Package manager
- Steps completed vs skipped (with reasons)
- Files created/modified
- Any errors encountered and how they were resolved

Offer to help explore Effect Solutions topics or start working with Effect patterns.
