<p align="center">
  <img src="public/app-icon.png" alt="DonutTabs" width="96" height="96">
</p>

# DonutTabs

> Transparent radial menu that opens at your cursor via a global shortcut and fires off groups of URLs, files, folders, apps, or scripts in a single click.

[![CI](https://github.com/YuriHemmel/DonutTabs/actions/workflows/ci.yml/badge.svg)](https://github.com/YuriHemmel/DonutTabs/actions/workflows/ci.yml)

DonutTabs is a cross-platform tray app (Windows, macOS, Linux) built to remove the friction of the repetitive tasks at the start of your day: that combo of "open Gmail + calendar + Jira", "open 3 Grafana dashboards", "open the project folder + the terminal + VS Code". You configure **tabs** (each tab = a set of items), trigger a keyboard shortcut, and the donut appears centered on your cursor. Clicking a slice fires everything at once.

---

## Table of contents

- [Features](#features)
- [Installation](#installation)
  - [Antivirus / SmartScreen / Gatekeeper warnings](#antivirus--smartscreen--gatekeeper-warnings)
- [Basic usage](#basic-usage)
- [Configuration](#configuration)
- [Profiles](#profiles)
- [Supported item types](#supported-item-types)
- [Shortcuts](#shortcuts)
- [Automatic updates](#automatic-updates)
- [Development](#development)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Radial menu** — transparent, undecorated, always-on-top, positioned at the cursor.
- **Configurable global shortcut** (default `Ctrl+Shift+Space` / `Cmd+Shift+Space`).
- **Tabs and groups** — group tabs into sub-donuts (up to 2 levels deep).
- **Heterogeneous items** per tab — URLs, files, folders, installed apps, shell scripts.
- **Multiple profiles** — each profile has its own tabs, shortcut, theme, and rules (e.g. "Work", "Personal", "Study").
- **Customizable themes** per profile (colors, radii, transparency) + dark/light/auto presets.
- **Quick search** for tabs (overlay with `Ctrl+F` by default, configurable).
- **Visual picker** for installed apps (cross-OS) so you don't have to type paths.
- **Script history** with stdout/stderr capture (opt-out).
- **Import/export** of the entire configuration as JSON.
- **Optional autostart** (LaunchAgent on macOS, Task Scheduler on Windows).
- **i18n** in pt-BR and en, with automatic detection.
- **Auto-update** via GitHub Releases with OS-native notification.

---

## Installation

Download the installer for your platform from the [Releases](https://github.com/YuriHemmel/DonutTabs/releases/latest) page:

| Platform | File |
| --- | --- |
| Windows | `DonutTabs_<version>_x64-setup.exe` (also in [`installers/`](installers/)) or `.msi` |
| macOS (Apple Silicon) | `DonutTabs_<version>_aarch64.dmg` |
| macOS (Intel) | `DonutTabs_<version>_x64.dmg` |
| Linux (Debian/Ubuntu) | `donut-tabs_<version>_amd64.deb` |
| Linux (universal) | `donut-tabs_<version>_amd64.AppImage` |

> **Windows quick download:** the latest Windows installer (`.exe`) is committed directly to the [`installers/`](installers/) folder of this repository, so you can grab it without leaving the repo. macOS and Linux builds live only on the [Releases](https://github.com/YuriHemmel/DonutTabs/releases/latest) page.

After installing, the app runs straight in the system tray — **there is no main window**. Use the shortcut or the tray menu to get started.

### Antivirus / SmartScreen / Gatekeeper warnings

Since DonutTabs is a young app that hasn't yet gone through **commercial code-signing** (an OV/EV cert on Windows or Apple notarization on macOS), it's normal for your operating system or antivirus to show a warning on first launch. **This does not mean the binary is malicious** — it's the default behavior for any new installer without accumulated reputation.

The official bundles are compiled by this repository's `release.yml` workflow from the public source code; every release also publishes checksums for verification.

#### Windows — SmartScreen "Windows protected your PC"

1. Click **More info** on the warning.
2. Click **Run anyway**.
3. Defender may ask for one extra confirmation; approve it.

If your third-party antivirus (Kaspersky, Avast, Bitdefender, ESET, etc.) blocks the `.exe`/`.msi`:

- Check the **SHA256** of the downloaded file against the one published on the Release page.
- Restore the file from quarantine and add the install folder to the exclusion list, or
- Report it as a **false positive** in the vendor's form — they usually clear it within 24–72h after analysis.

#### macOS — Gatekeeper "DonutTabs can't be opened"

If you downloaded the `.dmg` and macOS refuses to open it:

```bash
# Remove the quarantine attribute that Safari/Chrome add to downloads
xattr -d com.apple.quarantine /Applications/DonutTabs.app
```

Or, without using the terminal:

1. In Finder, **right-click** (or Ctrl+click) on **DonutTabs.app** → **Open**.
2. In the dialog, click **Open** again.
3. Then approve it in **System Settings → Privacy & Security** if you're still prompted.

From the next launch on, the system remembers the decision.

#### Linux

`.AppImage` and `.deb` don't trigger equivalent alerts. If the `.AppImage` won't run, make sure the execute flag is set:

```bash
chmod +x DonutTabs_*.AppImage
./DonutTabs_*.AppImage
```

#### Verifying integrity

Each release publishes a `latest.json` file with the Ed25519 signature of the bundle (used by the automatic updater). To validate a download manually, compare the **SHA256** of the file:

```bash
# macOS / Linux
shasum -a 256 DonutTabs_*.dmg

# Windows (PowerShell)
Get-FileHash .\DonutTabs_*-setup.exe -Algorithm SHA256
```

against the checksum shown on the Release page.

---

## Basic usage

1. **Open the donut** with the global shortcut (default `Ctrl+Shift+Space` on Windows/Linux, `Cmd+Shift+Space` on macOS) or via tray → **Open donut**.
2. **Click a slice** to open all items in that tab.
3. **Hover-hold** on a slice (keep the mouse still over it) reveals the **edit** (✏️) and **delete** (🗑️) buttons.
4. **Right-click** on a slice opens a context menu with "Open all / Edit / Delete".
5. **Scroll the mouse wheel** to page between pages when there are many tabs.
6. **Left half of the center** (⚙) opens **Settings**; **right half** (👤) opens the profile switcher.
7. **ESC** closes the donut; in a sub-donut, ESC goes back one level.
8. **`Ctrl+F`** (configurable) opens the quick tab search inside the donut.

---

## Configuration

The configuration lives in a single JSON file, created automatically on first start:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\DonutTabs\config.json` |
| macOS | `~/Library/Application Support/DonutTabs/config.json` |
| Linux | `~/.config/DonutTabs/config.json` |

Edit it **through Settings** (tray → **Settings** or ⚙ on the donut). Hand-editing the JSON works, but loses the UI validations and the window only reloads after you reopen the app.

Settings offers:

- **Tabs**: CRUD, drag-and-drop reordering, icon picker (emoji or Lucide icons), native file/folder picker, visual picker for installed apps.
- **Appearance**: theme (dark/light/auto), language, fine-grained color and radii customization per profile, autostart toggle, the per-profile script-permission toggle, automatic updates.
- **Shortcut**: interactive recorder — press the desired combination.
- **History**: log of script executions with stdout/stderr (when enabled).

### Import / export

In **Settings → Appearance → System** there are buttons to **export** the entire JSON (including all profiles) and **import** a file from another machine. The import validates everything before replacing; failures keep the current configuration intact.

---

## Profiles

Each profile is an independent set of:

- **Name + icon**
- **Global shortcut** (only the active profile's is registered with the OS)
- **Theme and cosmetic overrides**
- **Tabs**
- **`allowScripts` flag** — a kill-switch that blocks execution of any script in the profile, regardless of the per-item `trusted` flag

Use profiles to separate contexts (e.g. "Work" with Jira/Gmail/Slack, "Personal" with YouTube/News). Switching profiles is instant via the switcher in the center of the donut or via Settings.

---

## Supported item types

Each tab carries an ordered list of items; clicking the tab fires them all in sequence.

| Type | Behavior | Fields |
| --- | --- | --- |
| **URL** | Opens in the default browser (or the handler in `openWith`, e.g. `firefox`) | `value`, `openWith?` |
| **File** | Opens in the OS default app or in `openWith` (e.g. `code` to force VS Code) | `path`, `openWith?` |
| **Folder** | Opens in the file explorer or in `openWith` | `path`, `openWith?` |
| **App** | Launches the executable by name (with a cross-OS visual picker) | `name` |
| **Script** | Runs a shell command (`cmd /C` on Windows, `sh -c` on Unix) | `command`, `trusted` |

**Script security:** untrusted scripts trigger a confirmation modal on first run, with a "Trust this tab" option to skip the modal next time. The per-profile `allowScripts` kill-switch takes absolute priority — when off, **no** script runs in the profile, regardless of the `trusted` flag.

---

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+Shift+Space` | Opens the donut at the cursor (configurable per profile) |
| `Ctrl/Cmd+F` | Quick tab search inside the donut (configurable globally) |
| `ESC` | Closes the donut (or goes back one level in a sub-donut) |
| Click outside / Alt-Tab | Closes the donut |
| Mouse wheel | Pages between tab pages |

---

## Automatic updates

The app checks for updates on startup (when online). When a new version is available:

- An **OS-native notification** appears once per version.
- The tray icon gains a **📥 Update to v…** entry.
- In **Settings → Appearance → System → Updates** there's a card with release notes and an **Install and restart** button.

To turn it off, uncheck **Check for updates automatically** in the same section. The **Check now** button ignores the gates and forces a check.

Release pipeline documented in [`docs/release-process.md`](docs/release-process.md).

---

## Development

### Stack

- **Tauri 2** (Rust core) — windows, global shortcut, tray, IO, IPC
- **React 19 + TypeScript** — donut SVG and Settings
- **Vite** — frontend bundling
- **ts-rs** — automatic generation of TS types from Rust structs

### Prerequisites

- **Node.js** ≥ 20
- **Rust** stable + Cargo (install via [rustup](https://rustup.rs))
- **Tauri native dependencies** — follow the [official guide](https://v2.tauri.app/start/prerequisites/) for your OS:
  - **Windows**: WebView2 (already ships with Windows 11) + Visual Studio Build Tools
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `webkit2gtk-4.1`, `libssl-dev`, `libgtk-3-dev`, `librsvg2-dev`, etc.

### Setup

```bash
git clone https://github.com/YuriHemmel/DonutTabs.git
cd DonutTabs
npm install
```

### Commands

```bash
# Dev loop with frontend hot-reload and Rust auto-rebuild
npm run tauri dev

# Frontend
npm test                 # vitest run (all frontend tests)
npx tsc --noEmit         # typecheck without emitting

# Rust (cd src-tauri first)
cargo test --lib         # all Rust tests
cargo clippy --lib       # lint (we run with -D warnings in CI)
cargo fmt --check        # format check; without --check it applies

# Production build (installers for the current OS)
npm run tauri build
```

### Regenerating ts-rs bindings

`src/core/types/*.ts` is **generated** from the Rust structs with `#[derive(TS)]` via `cargo test`. The files **are versioned** and CI validates drift:

```bash
cd src-tauri && cargo test --lib config::schema   # regenerates src/core/types/
cd .. && git add src/core/types/
```

### Structure

```
src-tauri/src/        # Rust core
  config/             # schema v2, v1→v2 migrations, validation, atomic IO
  commands.rs         # Tauri commands exposed to the frontend
  donut_window/       # creation of the transparent window
  settings_window/    # creation of the Settings window
  tray/               # tray icon and menu
  shortcut/           # global shortcut registration
  launcher/           # opening URLs/files/apps/scripts
  favicon/            # on-disk favicon cache
  apps_picker/        # cross-OS enumeration of installed apps
  updater/            # tauri-plugin-updater wrapper
  script_history/     # stdout/stderr capture for scripts
  errors.rs           # AppError tagged enum with i18n-friendly codes

src/                  # Frontend
  donut/              # donut SVG + gesture hooks
  settings/           # configuration window
  core/               # i18n, IPC, theme, generated types
  entry/              # React entrypoints (donut.tsx, settings.tsx)
  locales/            # pt-BR.json, en.json
```

The golden rule: **Rust never draws UI; the frontend never touches disk or OS APIs**. Every new need for system access becomes a `#[tauri::command]` in `src-tauri/src/commands.rs` exposed via `src/core/ipc.ts`.

Detailed per-module documentation in [`CLAUDE.md`](CLAUDE.md).

---

## Architecture

A single process with three logical pieces:

1. **Rust core** — every OS-level concern (global shortcut, tray, window creation, opening URLs, config IO).
2. **Donut webview** — transparent window at the cursor that renders the donut SVG and captures hover/click.
3. **Settings webview** — decorated, resizable window for CRUD of tabs, profiles, and preferences.

The two webviews communicate with Rust via **typed Tauri commands**. Config changes fire a `config-changed` event that both windows listen for, keeping state in sync without polling.

Diagrams and design rationale in [`docs/Plano.md`](docs/Plano.md) (local, gitignored).

---

## Contributing

PRs are welcome. Main conventions:

- **TDD for pure logic** (`config/*`, `launcher`, `geometry`, validators) — failing test first, then the minimum code to pass.
- **Schema-first** — any new data exchanged between Rust and the frontend is born as a Rust struct with `#[derive(TS)]`.
- **Atomic writes for config** — always via `config::io::save_atomic` (validate → `.tmp` → rename) with in-memory rollback if the write fails.
- **UI strings go through `t()`** — no hardcoded text in JSX or in `AppError` payloads. Every new key must exist in both `src/locales/pt-BR.json` and `src/locales/en.json`.
- **Small, scoped commits**: `feat(config): ...`, `fix(launcher): ...`, `docs(plan): ...`. One logical concern = one commit.
- **Green CI before merge** — 5 parallel jobs (frontend, lint, test-linux, test-macos, test-windows). Clippy runs with `-D warnings`.

For non-trivial changes, open an issue first describing the problem. For bugs, attach the `config.json` (sanitized of sensitive URLs) and your OS.

---

## License

To be determined. The source code is public while the license isn't formalized; get in touch before redistributing commercially.

---

## Credits

Built with [Tauri](https://tauri.app), [React](https://react.dev), [Vite](https://vitejs.dev), and [Lucide Icons](https://lucide.dev).
