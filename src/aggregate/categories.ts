export type Category = "code editor" | "terminal" | "browser" | "comms" | "other"

export const categories: ReadonlyArray<Category> = ["code editor", "terminal", "browser", "comms", "other"]

const normalize = (app: string): string =>
  app
    .toLowerCase()
    .replace(/\.exe$/, "")
    .trim()

/**
 * Static app-name -> category map, keyed by normalized app name (lowercase,
 * `.exe` stripped). Unknown apps fall back to "other" — never inferred.
 */
const appCategories: Readonly<Record<string, Category>> = {
  // code editors
  code: "code editor",
  "visual studio code": "code editor",
  "vs code": "code editor",
  cursor: "code editor",
  windsurf: "code editor",
  zed: "code editor",
  neovim: "code editor",
  vim: "code editor",
  emacs: "code editor",
  "intellij idea": "code editor",
  "jetbrains toolbox": "code editor",
  webstorm: "code editor",
  pycharm: "code editor",
  goland: "code editor",
  clion: "code editor",
  androidstudio: "code editor",
  xcode: "code editor",
  sublime: "code editor",
  "sublime text": "code editor",
  notepadplusplus: "code editor",
  // terminals
  iterm2: "terminal",
  terminal: "terminal",
  alacritty: "terminal",
  kitty: "terminal",
  hyper: "terminal",
  "windows terminal": "terminal",
  windowsterminal: "terminal",
  "windows powershell": "terminal",
  powershell: "terminal",
  conhost: "terminal",
  wezterm: "terminal",
  ghostty: "terminal",
  warp: "terminal",
  tilix: "terminal",
  konsole: "terminal",
  "gnome-terminal": "terminal",
  // browsers
  "google chrome": "browser",
  chrome: "browser",
  safari: "browser",
  firefox: "browser",
  "microsoft edge": "browser",
  msedge: "browser",
  arc: "browser",
  brave: "browser",
  opera: "browser",
  vivaldi: "browser",
  tor: "browser",
  // comms
  slack: "comms",
  discord: "comms",
  teams: "comms",
  "microsoft teams": "comms",
  messages: "comms",
  whatsapp: "comms",
  zoom: "comms",
  telegram: "comms",
  signal: "comms",
  skype: "comms",
  mail: "comms",
  outlook: "comms",
  spark: "comms",
  linear: "comms",
  "google chat": "comms",
  // everything else falls through to "other"
}

export const categorizeApp = (app: string): Category => appCategories[normalize(app)] ?? "other"
