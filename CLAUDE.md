# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**DonutTabs** — cross-platform desktop app (Windows, macOS, Linux) that opens a transparent radial menu at the cursor via a global keyboard shortcut. Each slice represents a configured tab of URLs; clicking opens them all in the default browser.

Built with **Tauri 2** (Rust core) + **React 19 + TypeScript** (frontend) + **Vite**.

## Start here

Before making non-trivial changes, read:

- [docs/Plano.md](docs/Plano.md) — design spec with the "why" of every architectural decision, the phased roadmap, and extensibility hooks in the schema
- [docs/plans/01-fundacao.md](docs/plans/01-fundacao.md) — the executed implementation plan for the current MVP (Plano 1)
- [docs/qa-smoke.md](docs/qa-smoke.md) — manual smoke checklist for the three OSes

The user speaks Portuguese; all docs, commit messages, and user-facing strings in the app should be in Portuguese.

## Common commands

All commands run from the repo root.

```bash
# Dev loop (opens the app in tray, hot-reload on frontend)
npm run tauri dev

# Frontend only
npm test                   # vitest run (all frontend tests)
npx tsc --noEmit           # typecheck without emitting

# Rust only (cd src-tauri first)
cargo test --lib                         # all lib tests
cargo test --lib config::schema          # a single module's tests
cargo test --lib config::validate::tests::duplicate_ids_are_rejected  # a single test
cargo clippy --lib
cargo fmt --check                        # check; drop --check to apply
cargo build                              # full debug build (~5-10min cold)

# Production build of the installer bundle
npm run tauri build
```

### Regenerating ts-rs TypeScript bindings

`src/core/types/*.ts` is **generated** from Rust `#[derive(TS)]` types via `cargo test`. It **is** tracked in git (not gitignored) and CI enforces drift (Linux Rust job runs `git diff --exit-code src/core/types/` after `cargo test` and fails if the committed files are stale).

When you change any type in `src-tauri/src/config/schema.rs`:

```bash
cd src-tauri && cargo test --lib config::schema   # regenerates src/core/types/
cd .. && git add src/core/types/                  # stage the updated bindings
```

## Big-picture architecture

Single process with **three logical pieces**:

1. **Rust core** (`src-tauri/src/`) — all OS-level concerns: global shortcut, tray icon, window creation (transparent/undecorated/always-on-top), URL opening, config IO. Never draws UI.
2. **Donut webview** (`src/entry/donut.tsx` → `src/donut/*`) — transparent window rendered at cursor position, shows the SVG donut, captures hover/click, calls Rust commands via IPC.
3. **Settings webview** (not yet implemented — Plano 2) — normal decorated window with the CRUD UI for tabs and preferences.

Rust and frontend communicate via **typed Tauri commands** through `src/core/ipc.ts`. Types in `src/core/types/` are **auto-generated** from Rust by `ts-rs` — never hand-edit them.

The golden fence: **Rust never draws UI; frontend never touches disk or OS APIs.** Anything on the frontend that needs system access must add a new `#[tauri::command]` in `src-tauri/src/commands.rs` and expose it through `src/core/ipc.ts`.

### Rust module responsibilities

- `config/schema.rs` — `Config`, `Tab`, `Item`, the enums. All derive `Serialize + Deserialize + PartialEq + TS` with `#[serde(rename_all = "camelCase")]`. `Item` is a **tagged union** (`#[serde(tag = "kind")]`) designed for future `kind: "file" | "app" | "script" | "folder"` variants (Fase 3). Do **not** flatten it into an untagged enum.
- `config/validate.rs` — semantic rules: items_per_page range, at least one of `name`/`icon` per tab, URL parseability, unique ids. First-error semantics (not accumulating). Logic-level tests.
- `config/io.rs` — read-only in Plano 1 (`load_from_path` with default fallback, recovery errors on malformed JSON). Plano 2 adds atomic writes.
- `launcher/` — `Opener` trait for testability + `TauriOpener<'a, R>` impl that delegates to the `opener` plugin. `launch_tab` accumulates per-URL failures and only errors if **all** items failed.
- `tray/` — tray icon with "Abrir donut" / "Sair" menu. Triggers `donut_window::show` on menu click.
- `shortcut/` — registers the global shortcut from config; its handler calls `donut_window::show`.
- `donut_window/` — creates the window (transparent, undecorated, always-on-top, `skip_taskbar`, no shadow) and positions it at the cursor using the `mouse_position` crate, taking DPI into account via `scale_factor()`. Caches the window after first creation so subsequent `show` calls are instant.
- `commands.rs` — `AppState { config: RwLock<Config>, config_path }` + the three Tauri commands (`get_config`, `open_tab`, `hide_donut`). `config_path` is marked `#[allow(dead_code)]` — reserved for Plano 2 save/delete.
- `errors.rs` — `AppError` with `#[serde(tag = "kind", content = "message")]` so the frontend receives discriminated errors. **This shape changes in Plano 2** (see i18n note below).
- `lib.rs` — orchestration: loads config, registers commands, sets up tray + shortcut, pre-warms the donut window.

### Frontend architecture

- `src/donut/geometry.ts` — pure math (SVG arc paths, polar→slice hit-testing). No React, fully unit-testable.
- `src/donut/useSliceHighlight.ts` — hook converting `MouseEvent` into the currently-hovered slice index, or `null` if in the center dead zone or beyond the outer ring.
- `src/donut/{Slice,CenterCircle,Donut}.tsx` — presentational SVG components. `CenterCircle` currently shows a gear ⚙ (will open Settings in Plano 2) and a profile glyph 👤 (right half reserved for the profile switcher — see Fase 2 in `Plano.md`).
- `src/entry/donut.tsx` — window entrypoint: fetches config via IPC, wires ESC / click-outside / window-blur → `hideDonut`, and delegates selection to `openTab`.

### Tauri config gotchas (already applied — do not undo)

- `tauri.conf.json`: `app.windows = []` (windows are created programmatically), `app.macOSPrivateApi = true` for transparency on macOS
- `src-tauri/Cargo.toml`: `tauri = { version = "2", features = ["macos-private-api", "tray-icon"] }` — both flags are **required** by the matching conf/API usage
- `capabilities/default.json` lists permissions for only the `donut` window; global-shortcut and opener plugins are gated through `global-shortcut:default` / `opener:default` + `opener:allow-open-url`

## Conventions

- **TDD** for pure logic (`config/*`, `launcher`, `geometry`, `useSliceHighlight`, `Donut`). Write the failing test first, then the minimum code to pass. Don't backfill tests onto already-written code unless the task says so.
- **Small commits with scoped messages**: `feat(config): ...`, `chore(tray): ...`, `fix(config): ...`, `ci: ...`, `docs(plan): ...`. One task = one logical concern = one commit (Cargo.lock updates piggy-back on the commit that changed Cargo.toml).
- **Schema-first, IPC-typed**: any new frontend↔Rust data shape lives as a Rust struct with `#[derive(TS)]`, generated into TS, and consumed through `src/core/ipc.ts`. Don't duplicate types by hand.
- **Config file is the source of truth** at startup. The app reads `%APPDATA%\DonutTabs\config.json` (Windows), `~/Library/Application Support/DonutTabs/config.json` (macOS), or `~/.config/DonutTabs/config.json` (Linux). Plano 2 adds write-back with atomic rename (`config.json.tmp` → `rename`).
- **Text in code vs in UI**: internal logs and dev-facing error context can be in English; anything the user reads (Portuguese today, i18n-ready in Plano 2) must go through a translation layer. Do not hardcode Portuguese strings in JSX starting in Plano 2.

## CI

`.github/workflows/ci.yml` runs 5 parallel jobs, all with `Swatinem/rust-cache@v2`:

- `frontend` — tsc + vitest (Ubuntu)
- `lint` — cargo fmt + clippy (Ubuntu)
- `test-linux` — cargo test + ts-rs drift check (Ubuntu)
- `test-macos` — cargo test (macOS)
- `test-windows` — cargo test (Windows)

Docs-only changes are skipped via `paths-ignore` (`**/*.md`, `docs/**`, `LICENSE*`, `.gitignore`). Linux is the primary test target; macOS/Windows mainly verify cross-platform compilation of the same tests.

**Clippy is currently run without `-D warnings`** because the MVP intentionally leaves some dead-code warnings for items consumed in Plano 2 (e.g., `AppState::config_path`). When Plano 2 wires these up, tighten to `-D warnings`.

## Looking ahead to Plano 2

Read `Plano.md` section 8.2 and `Plano.md` section 6.7 before starting. Key decisions already made:

1. **i18n comes first** in Plano 2, **before** the Settings UI. Any string the UI of Plano 2 adds must already be translation-ready (`react-i18next`, JSON files in `src/locales/{pt-BR,en}.json`, fallback `en`).
2. **`AppError` evolves** from free-form Portuguese strings to structured codes + context (e.g., `AppError::Config { code: "items_per_page_out_of_range", context: { got: 99 } }`). The frontend maps codes to translated strings. This is a breaking change in the IPC shape and requires updating all `AppError` call sites in `config/validate.rs` and `launcher/mod.rs`.
3. **`appearance.language`** is already reserved in the schema (`"pt-BR" | "en" | "auto"`, default `"auto"` which uses `navigator.language` with `en` fallback). Currently ignored; Plano 2 activates it.
4. **The right half of the center circle** becomes the **profile switcher**, not a generic "close" button. Clicking it enters "profile mode" where the outer slices become profiles.
5. **The `+` slice** (last position of last page) opens Settings in "new tab" mode.
