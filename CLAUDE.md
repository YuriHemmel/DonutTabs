# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**DonutTabs** — cross-platform desktop app (Windows, macOS, Linux) that opens a transparent radial menu at the cursor via a global keyboard shortcut. Each slice represents a configured tab of URLs; clicking opens them all in the default browser.

Built with **Tauri 2** (Rust core) + **React 19 + TypeScript** (frontend) + **Vite**.

## Start here

Before making non-trivial changes, read:

- [docs/Plano.md](docs/Plano.md) — design spec with the "why" of every architectural decision, the phased roadmap, and extensibility hooks in the schema
- [docs/plans/01-fundacao.md](docs/plans/01-fundacao.md) — the executed implementation plan for the current MVP (Plano 1)
- [docs/plans/02-i18n.md](docs/plans/02-i18n.md) — the executed implementation plan for i18n + structured AppError (Plano 2)
- [docs/plans/03-settings-crud.md](docs/plans/03-settings-crud.md) — the executed implementation plan for the Settings window / CRUD (Plano 3)
- [docs/plans/04-settings-preferencias.md](docs/plans/04-settings-preferencias.md) — the executed implementation plan for Settings preferences (Plano 4)
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
3. **Settings webview** (`src/entry/settings.tsx` → `src/settings/*`) — decorated, resizable window with `<TabList>` + `<TabEditor>` for CRUD. Loads config via IPC and listens to `config-changed`; the donut mirrors the same event so both windows stay in sync without polling. Preferences UI (shortcut + appearance) lands in Plano 4.

Rust and frontend communicate via **typed Tauri commands** through `src/core/ipc.ts`. Types in `src/core/types/` are **auto-generated** from Rust by `ts-rs` — never hand-edit them.

The golden fence: **Rust never draws UI; frontend never touches disk or OS APIs.** Anything on the frontend that needs system access must add a new `#[tauri::command]` in `src-tauri/src/commands.rs` and expose it through `src/core/ipc.ts`.

### Rust module responsibilities

- `config/schema.rs` — `Config`, `Tab`, `Item`, the enums. All derive `Serialize + Deserialize + PartialEq + TS` with `#[serde(rename_all = "camelCase")]`. `Item` is a **tagged union** (`#[serde(tag = "kind")]`) designed for future `kind: "file" | "app" | "script" | "folder"` variants (Fase 3). Do **not** flatten it into an untagged enum. `Appearance.language` is `Language::{Auto, PtBr, En}`, consumed by `src/core/i18n.ts` at bootstrap.
- `config/validate.rs` — semantic rules: items_per_page range, at least one of `name`/`icon` per tab, URL parseability, unique ids. First-error semantics (not accumulating). Logic-level tests. Errors emit structured codes (e.g. `items_per_page_out_of_range`, `invalid_url`), never free-form strings.
- `config/io.rs` — `load_from_path` (default fallback, recovery error on malformed JSON) **and** `save_atomic` (validates first, writes to `config.json.tmp`, then `rename`). `appearance.language` uses `#[serde(default)]` so configs written before Plano 2 still load.
- `launcher/` — `Opener` trait for testability + `TauriOpener<'a, R>` impl that delegates to the `opener` plugin. `launch_tab` accumulates per-URL failures and only errors if **all** items failed (`all_items_failed` code).
- `tray/` — tray icon with "Abrir donut" / "Configurações" / "Sair". The "Configurações" item calls `settings_window::show`.
- `shortcut/` — `register_from_config` installs the initial shortcut at startup; `set_from_config` swaps it conflict-aware (registers the new combo before unregistering the old, so failure leaves the previous shortcut alive). The active `Shortcut` is kept in `ActiveShortcut` inside `AppState`.
- `donut_window/` — creates the window (transparent, undecorated, always-on-top, `skip_taskbar`, no shadow) and positions it at the cursor using the `mouse_position` crate, taking DPI into account via `scale_factor()`. Caches the window after first creation so subsequent `show` calls are instant.
- `settings_window/` — creates/focuses/closes the decorated Settings window (label `settings`, min size 720×520, initial 960×640). Consumed by the `open_settings` / `close_settings` commands and by the tray.
- `commands.rs` — `AppState { config: RwLock<Config>, config_path, pending_settings_intent, active_shortcut }` + Tauri commands `get_config`, `open_tab`, `hide_donut`, `save_tab`, `delete_tab`, `open_settings`, `consume_settings_intent`, `close_settings`, `set_shortcut`, `set_theme`, `set_language`. Mutations call pure helpers (`apply_save` / `apply_delete` / `apply_theme` / `apply_language`), then `save_atomic`; on IO failure, memory rolls back by reloading from disk. `set_shortcut` also rolls back the in-process global-shortcut binding if the disk write fails. Every successful mutation emits `CONFIG_CHANGED_EVENT` ("config-changed") with the new `Config` as payload.
- `errors.rs` — `AppError` with `#[serde(tag = "kind", content = "message")]`, content shape `{ code: String, context: BTreeMap<String, String> }`. Helpers `AppError::config/launcher/window/shortcut("code", &[("k", v)])` for ergonomic construction. Frontend maps `code` → translation key via `src/core/errors.ts`.
- `lib.rs` — orchestration: loads config, registers commands, sets up tray + shortcut, pre-warms the donut window.

### Frontend architecture

- `src/donut/geometry.ts` — pure math (SVG arc paths, polar→slice hit-testing). No React, fully unit-testable.
- `src/donut/useSliceHighlight.ts` — hook converting `MouseEvent` into the currently-hovered slice index, or `null` if in the center dead zone or beyond the outer ring.
- `src/donut/{Slice,CenterCircle,Donut}.tsx` — presentational SVG components. The ⚙ on `CenterCircle`'s left half is now clickable (opens Settings); the right half still shows the profile glyph 👤 reserved for the profile switcher (Plano 6). The donut passes `onOpenSettings` through.
- `src/core/i18n.ts` — `react-i18next` init. `resolveLanguage()` combines `appearance.language` from config with `navigator.language`; `initI18n()` bootstraps the global instance; `createI18n()` creates isolated instances for tests. `changeLanguage()` switches in runtime — both entrypoints call it inside their `config-changed` listeners so the two windows stay in the same locale. Locale JSON lives in `src/locales/{pt-BR,en}.json`.
- `src/core/theme.ts` — `resolveTheme()` maps `Theme` (`dark`/`light`/`auto`) to a concrete value using `prefers-color-scheme`; `applyTheme()` writes `data-theme` on `<html>`; `watchSystemTheme()` subscribes to OS theme changes while in `auto`.
- `src/core/errors.ts` — `translateAppError(err, t)` converts the Rust `AppError` payload into a localized string, trying `errors.{kind}.{camelCode}` → `errors.{kind}.unknown` → `errors.fallback`.
- `src/core/ipc.ts` — typed wrappers for all commands plus the `CONFIG_CHANGED_EVENT` constant that both windows use to subscribe via `@tauri-apps/api/event`'s `listen`.
- `src/entry/donut.tsx` — window entrypoint: bootstraps i18next from config before React mounts, wires ESC / click-outside / window-blur → `hideDonut`, delegates selection to `openTab`, listens for `config-changed` to refresh tabs AND call `changeLanguage`, surfaces launch failures as a dismissible localized toast, and routes gear clicks to `openSettings` + `hideDonut`.
- `src/entry/settings.tsx` + `src/settings/*` — the Settings window. `SettingsApp` routes between three sections via `<SectionTabs>` (`Abas` | `Aparência` | `Atalho`). `useConfig` is the single source of truth for config: loads on mount via `get_config` and subscribes to `config-changed`, with `saveTab`/`deleteTab`/`setShortcut`/`setTheme`/`setLanguage` helpers that round-trip through IPC. `TabEditor` validates name-or-icon / at-least-one-URL / `new URL(...)` client-side. `AppearanceSection` hosts theme radio + language select. `ShortcutSection` wraps `<ShortcutRecorder>`, which uses the pure `buildCombo(e)` helper to assemble the Tauri shortcut string from a keydown, rejecting reserved keys and modifier-only combos. Server-side `AppError`s render via `translateAppError`.

### Tauri config gotchas (already applied — do not undo)

- `tauri.conf.json`: `app.windows = []` (windows are created programmatically), `app.macOSPrivateApi = true` for transparency on macOS
- `src-tauri/Cargo.toml`: `tauri = { version = "2", features = ["macos-private-api", "tray-icon"] }` — both flags are **required** by the matching conf/API usage
- `capabilities/default.json` lists permissions for both `donut` and `settings` windows; global-shortcut and opener plugins are gated through `global-shortcut:default` / `opener:default` + `opener:allow-open-url`; `core:event:default` enables `listen`/`emit` for the `config-changed` event that syncs both windows

## Conventions

- **TDD** for pure logic (`config/*`, `launcher`, `geometry`, `useSliceHighlight`, `Donut`). Write the failing test first, then the minimum code to pass. Don't backfill tests onto already-written code unless the task says so.
- **Small commits with scoped messages**: `feat(config): ...`, `chore(tray): ...`, `fix(config): ...`, `ci: ...`, `docs(plan): ...`. One task = one logical concern = one commit (Cargo.lock updates piggy-back on the commit that changed Cargo.toml).
- **Schema-first, IPC-typed**: any new frontend↔Rust data shape lives as a Rust struct with `#[derive(TS)]`, generated into TS, and consumed through `src/core/ipc.ts`. Don't duplicate types by hand.
- **Config file is the source of truth** at startup. The app reads `%APPDATA%\DonutTabs\config.json` (Windows), `~/Library/Application Support/DonutTabs/config.json` (macOS), or `~/.config/DonutTabs/config.json` (Linux). Mutations always go through `config::io::save_atomic` (validate → write `.tmp` → rename); no other code writes directly.
- **Every `Config` mutation broadcasts.** `save_tab` and `delete_tab` emit `CONFIG_CHANGED_EVENT` on success. Future write commands must follow the same pattern: validate + atomic-write + emit, with in-memory rollback (reload from disk) if the write fails.
- **Text in code vs in UI**: internal logs and dev-facing error context stay in English technical form; anything the user reads goes through `t()` from `react-i18next`. No hardcoded Portuguese (or English) UI strings in JSX or in `AppError` payloads. New Rust errors use `AppError::config/launcher/window/shortcut` with `snake_case` codes and a matching entry in both `src/locales/pt-BR.json` and `src/locales/en.json` (under `errors.{kind}.{camelCode}`).
- **Temporary files go in `tmp/`**: any throwaway artifact (scratch notes, ad-hoc scripts, generated logs, PR bodies, debug dumps, one-off reproducers) must be written under the repo-root `tmp/` folder, which is gitignored via `tmp/*`. Never drop temporary files at the repo root, inside `src/`, `src-tauri/`, or `docs/`. Create the directory if it doesn't exist yet. **Delete `tmp/` artifacts as soon as you're done with them** — once the file has served its purpose (PR body submitted, log inspected, scratch note consumed), remove it in the same turn. Don't leave stale throwaways behind for the next session to sift through.

## CI

`.github/workflows/ci.yml` runs 5 parallel jobs, all with `Swatinem/rust-cache@v2`:

- `frontend` — tsc + vitest (Ubuntu)
- `lint` — cargo fmt + clippy (Ubuntu)
- `test-linux` — cargo test + ts-rs drift check (Ubuntu)
- `test-macos` — cargo test (macOS)
- `test-windows` — cargo test (Windows)

Docs-only changes are skipped via `paths-ignore` (`**/*.md`, `docs/**`, `LICENSE*`, `.gitignore`). Linux is the primary test target; macOS/Windows mainly verify cross-platform compilation of the same tests.

**Clippy runs with `-D warnings`.** No dead-code allowances — every `AppError` variant and `AppState` field has live call sites.

## Looking ahead to Plano 5 and beyond

Plano 4 is done: Settings preferences with `<AppearanceSection>` (theme + language), `<ShortcutRecorder>` (keydown → Tauri combo string, reserved-key validation, conflict-aware `set_shortcut` with rollback), and theme tokens in `settings.html`. Language changes propagate to both windows via `config-changed`.

Next slices (in order):

1. **Plano 5 — Donut gestures**: paginação com roda + indicadores, hover-hold → editar/excluir (abre o TabEditor na aba correspondente). A fatia "+" já foi entregue no Plano 3.
2. **Plano 6 — Perfis**: schema v2 + migração v1→v2 + profile switcher no lado direito do centro (atalho e tema por perfil).
3. **Plano 7 — Polimento**: menu de contexto nas fatias, favicons / Lucide, drag-and-drop para reordenar, autostart. (O donut permanece propositalmente em paleta escura — é overlay transparente; alternar para tema claro brigaria com o fundo da área de trabalho.)

Any new user-facing string must have keys in both locale files; any new `AppError` code must have a translation under `errors.{kind}.{camelCode}`. The `errors.{kind}.unknown` fallback exists precisely to catch missed ones — if you see it surfaced in dev, add the specific key before merging.
