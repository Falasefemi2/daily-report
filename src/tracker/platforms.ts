import { Effect, Layer } from "effect"
import { run as runShell, type ShellError } from "./shell.js"
import type { WindowSample } from "./window-sampler.js"
import { layerStub, WindowSampler, WindowSamplerError } from "./window-sampler.js"

const parseSample = (
  stdout: string,
  sampledAt: Date,
  source: string,
): Effect.Effect<WindowSample, WindowSamplerError> => {
  const [app, title = ""] = stdout.trim().split("\t")
  if (!app || app.length === 0) {
    return Effect.fail(new WindowSamplerError({ message: `${source} returned an empty app name` }))
  }
  return Effect.succeed({ app: app.trim(), title: title.trim(), sampledAt })
}

const runSample = (
  source: string,
  args: ReadonlyArray<string>,
  sampledAt: Date,
): Effect.Effect<WindowSample, WindowSamplerError> =>
  runShell(undefined, args).pipe(
    Effect.mapError(
      (error: ShellError): WindowSamplerError => new WindowSamplerError({ message: `${source}: ${error.message}` }),
    ),
    Effect.flatMap((stdout) => parseSample(stdout, sampledAt, source)),
  )

const makeSampler = (source: string, args: ReadonlyArray<string>): Effect.Effect<WindowSample, WindowSamplerError> =>
  Effect.flatMap(
    Effect.sync(() => new Date()),
    (sampledAt) => runSample(source, args, sampledAt),
  )

// ---------------------------------------------------------------------------
// macOS: osascript (System Events)
// ---------------------------------------------------------------------------

const macosAppleScript =
  'tell application "System Events"\n' +
  "  set frontApp to first application process whose frontmost is true\n" +
  "  set appName to name of frontApp\n" +
  '  set windowTitle to ""\n' +
  "  try\n" +
  "    set windowTitle to name of front window of frontApp\n" +
  "  end try\n" +
  "  return appName & tab & windowTitle\n" +
  "end tell"

export const macosLayer = Layer.succeed(
  WindowSampler,
  WindowSampler.of({
    sample: makeSampler("osascript", ["/usr/bin/osascript", "-e", macosAppleScript]),
  }),
)

// ---------------------------------------------------------------------------
// Linux (X11): xdotool
// ---------------------------------------------------------------------------

const xdotoolSample = Effect.flatMap(
  Effect.sync(() => new Date()),
  (sampledAt) =>
    Effect.gen(function* () {
      const id = yield* runShell(undefined, ["xdotool", "getactivewindow"]).pipe(
        Effect.mapError(
          (error: ShellError): WindowSamplerError => new WindowSamplerError({ message: `xdotool: ${error.message}` }),
        ),
      )
      const title = yield* runShell(undefined, ["xdotool", "getwindowname", id.trim()]).pipe(
        Effect.orElseSucceed(() => ""),
      )
      const windowClass = yield* runShell(undefined, ["xdotool", "getwindowclassname", id.trim()]).pipe(
        Effect.orElseSucceed(() => "unknown"),
      )
      return yield* parseSample(`${windowClass.trim()}\t${title.trim()}`, sampledAt, "xdotool")
    }),
)

export const linuxLayer = Layer.succeed(WindowSampler, WindowSampler.of({ sample: xdotoolSample }))

// ---------------------------------------------------------------------------
// Windows: PowerShell + user32 GetForegroundWindow
// ---------------------------------------------------------------------------

const windowsScript = [
  'Add-Type -TypeDefinition @"',
  "using System;",
  "using System.Runtime.InteropServices;",
  "using System.Text;",
  "public static class Win32Active {",
  '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '  [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int maxCount);',
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);',
  "}",
  '"@',
  "$h = [Win32Active]::GetForegroundWindow()",
  "$pid2 = [uint32]0",
  "[Win32Active]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null",
  "$title = New-Object System.Text.StringBuilder 512",
  "[Win32Active]::GetWindowTextW($h, $title, $title.Capacity) | Out-Null",
  '$name = "unknown"',
  "if ($pid2 -ne 0) { $name = (Get-Process -Id $pid2 -ErrorAction SilentlyContinue).ProcessName }",
  'Write-Output ("{0}`t{1}" -f $name, $title.ToString())',
].join("\n")

export const windowsLayer = Layer.succeed(
  WindowSampler,
  WindowSampler.of({
    sample: makeSampler("powershell", ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", windowsScript]),
  }),
)

// ---------------------------------------------------------------------------
// Platform selector
// ---------------------------------------------------------------------------

export const platformLayer = (platform: NodeJS.Platform): Layer.Layer<WindowSampler> => {
  switch (platform) {
    case "darwin":
      return macosLayer
    case "linux":
      return linuxLayer
    case "win32":
      return windowsLayer
    default:
      return layerStub
  }
}
