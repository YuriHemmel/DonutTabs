# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**DonutTabs** — cross-platform desktop app (Windows, macOS, Linux) that opens a transparent radial menu at the cursor via a global keyboard shortcut. Each slice represents a configured tab of URLs; clicking opens them all in the default browser.

Built with **Tauri 2** (Rust core) + **React 19 + TypeScript** (frontend) + **Vite**.

## Start here

Before making non-trivial changes, read:

- `docs/Plano.md` (local-only, gitignored) — design spec with the "why" of every architectural decision, the phased roadmap, and extensibility hooks in the schema
- `docs/plans/NN-*.md` (local-only, gitignored) — per-Plano executed implementation plans (01-fundacao, 02-i18n, 03-settings-crud, 04-settings-preferencias, 05-donut-gestos, 06-perfis, 07-perfil-autostart, 08-drag-and-drop, 09-menu-contexto-favicons, 10-items-file-folder, 11-openwith-per-item, 12-import-export-config, 13-busca-rapida, 14-app-script)
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

- `config/schema.rs` — `Config` v2: `version`, `activeProfileId`, `profiles: Vec<Profile>`, plus globals `appearance.language`, `interaction`, `pagination`, `system`. `Profile { id, name, icon, shortcut, theme, tabs }` carries the per-profile state. All derive `Serialize + Deserialize + PartialEq + TS` with `#[serde(rename_all = "camelCase")]`. `Item` is a **tagged union** (`#[serde(tag = "kind")]`) with three variants: `Url { value, open_with }`, `File { path, open_with }`, `Folder { path, open_with }`. Each variant carries an optional `open_with: Option<String>` (`#[serde(default, skip_serializing_if = "Option::is_none")]` keeps the JSON enxuto and lets Plano-10 configs deserialize as `None`); the launcher passes it as the second argument of `tauri-plugin-opener::open_url`/`open_path` (handler/program selection — e.g. `"firefox"`, `"code"`). `kind: "app"` and `kind: "script"` are reserved for Plano 14+ — do **not** flatten the tag. `Tab.openMode { Reuse | NewWindow | NewTab }` continues stored/validated/edited in the schema but is **not read by the launcher** (vestigial, kept for forward-compat). `Interaction.search_shortcut: String` (Plano 13) carries a Tauri-style combo (`CommandOrControl+F` default) for the window-level quick-search overlay; `#[serde(default = "default_search_shortcut")]` lets Plano-12 configs deserialize without the field.
- `config/v1.rs` — Rust-only snapshot of the pre-Plano-6 schema; used solely for deserializing legacy configs.
- `config/migrate.rs` — `migrate_to_v2(ConfigV1) -> Config` produces a single "Padrão" profile carrying the v1 shortcut/theme/tabs; globals migrate as-is.
- `config/validate.rs` — semantic rules: pagination/interaction sanity; at least one profile; `activeProfileId` must point to an existing profile; non-empty profile name + shortcut; no duplicate profile or tab ids; per-tab name-or-icon and URL parseability; per-item path non-empty for `file`/`folder` (existence is **not** checked — drives may be removable; existence falls into the runtime `partial_failure`); per-item `open_with` non-empty when `Some` (`None` is the canonical "use OS default" — empty string is rejected as `open_with_empty` to avoid persisting whitespace). Errors emit structured codes (e.g. `no_profiles`, `active_profile_not_found`, `profile_shortcut_empty`, `invalid_url`, `path_empty`, `open_with_empty`, `search_shortcut_empty`), never free-form strings. The `item_kind_label` helper feeds the `kind` field of `path_empty`/`open_with_empty` errors with the literal `"url"`/`"file"`/`"folder"` tag; `item_open_with` extracts the optional handler ref across variants. The search-shortcut combo is validated by `shortcut::validate_combo` (parses Tauri format without registering anything) — propagates `shortcut_parse_failed` on malformed input.
- `config/io.rs` — `load_from_path` reads the JSON's `version` field and either deserializes v2 directly or migrates v1 in memory. `save_atomic` validates first, writes `config.json.tmp`, then `rename`. Migration is **not** persisted automatically; the next mutation writes v2.
- `launcher/` — `Opener` trait for testability with two methods (`open_url(url, with)`, `open_path(path, with)`) + `TauriOpener<'a, R>` impl that delegates to the `opener` plugin (`OpenerExt::open_url` / `OpenerExt::open_path`). `launch_tab` dispatches per `Item` variant: URLs go through `open_url`, `File`/`Folder` share the `open_path` arm; the per-item `open_with` is forwarded as `Option<&str>` to the trait's `with` parameter (handler/program — `None` = OS default, `Some("firefox")` etc. on Windows uses PATH/exe, macOS uses `.app` bundle name, Linux uses PATH). Failures accumulate `(value_or_path, error)` pairs and only short-circuit to `AppError::Launcher { code: "all_items_failed" }` when **every** item failed. Mock tests track `(target, with)` per call and cover URL-only, mixed URL+file+folder, full-failure, and explicit `openWith` propagation.
- `tray/` — tray icon with "Abrir donut" / "Configurações" / "Sair". The "Configurações" item calls `settings_window::show`.
- `shortcut/` — `register_from_config` installs the initial shortcut at startup; `set_from_config` swaps it conflict-aware (registers the new combo before unregistering the old, so failure leaves the previous shortcut alive). The active `Shortcut` is kept in `ActiveShortcut` inside `AppState`.
- `donut_window/` — creates the window (transparent, undecorated, always-on-top, `skip_taskbar`, no shadow) and positions it at the cursor using the `mouse_position` crate, taking DPI into account via `scale_factor()`. Caches the window after first creation so subsequent `show` calls are instant.
- `settings_window/` — creates/focuses/closes the decorated Settings window (label `settings`, min size 720×520, initial 960×640). Consumed by the `open_settings` / `close_settings` commands and by the tray.
- `commands.rs` — `AppState { config: RwLock<Config>, config_path, pending_settings_intent, active_shortcut }` + Tauri commands. **Profile-aware mutations** (`save_tab`, `delete_tab`, `set_shortcut`, `set_theme`) accept an optional `profile_id`; default = active profile. `set_shortcut` only re-registers the global shortcut when targeting the active profile. `set_language` stays global. New: `set_active_profile` (conflict-aware shortcut swap + persist), `create_profile`, `delete_profile` (blocks last, reassigns active if needed), `update_profile` (name/icon), `set_autostart` (toggles `tauri-plugin-autostart` on the SO **before** persisting; rollback restores SO state if `save_autostart` fails), `reorder_tabs` / `reorder_profiles` (set-equality validation via the shared `reorder_in_place` helper; `reorder_tabs` also renormalizes the per-tab `order` field; profile reorder preserves `active_profile_id` since it references by id, not index), `fetch_favicon` (async; resolves the `app_config_dir` for the cache base and delegates to `favicon::fetch_favicon`; does **not** mutate config), `export_config` / `import_config` (Plano 12 — export uses `do_export` to write the in-memory `Config` via `save_atomic` to a user-chosen path; import uses `do_import` to call `load_from_path` on the source — which validates and migrates v1→v2 — then persists to the canonical `state.config_path`, reconciles the global shortcut to the new active profile via `shortcut::set_from_config` (best-effort: shortcut collision logs and stays bound to the previous combo), swaps in-memory state, and emits `CONFIG_CHANGED_EVENT`), `set_search_shortcut` (Plano 13 — validates the combo via `validate_combo`, persists with in-memory rollback on `save_atomic` failure; window-level shortcut so no global re-registration). Helpers `active_profile`, `profile_by_id_mut`, `apply_save_in_profile`, `apply_delete_in_profile`, `apply_reorder_tabs`, `apply_reorder_profiles`, `save_with_rollback`, `do_export`, `do_import` keep the command bodies thin. Every successful mutation emits `CONFIG_CHANGED_EVENT` with the new `Config`.
- `favicon/` — `fetch_favicon(url, base_dir)` with disk cache under `<app_config>/favicons/<sha256(origin)>.bin` (TTL 7 days). Lookup chain: cache hit → `<origin>/favicon.ico` → HTML `<link rel="icon|shortcut|apple-touch-icon">` (priority `apple-touch-icon > shortcut > icon`) → Google `s2/favicons` fallback. Mime sniffing via magic bytes (PNG/ICO/JPEG/SVG/GIF/WEBP); non-image responses are dropped. Pure helpers (`cache_path_for`, `is_stale`, `pick_icon_url`, `detect_mime`) are unit-tested; the network path is exercised manually. Returns `FaviconResult { localPath, mime }` for the frontend to feed `convertFileSrc`.
- `errors.rs` — `AppError` with `#[serde(tag = "kind", content = "message")]`, content shape `{ code: String, context: BTreeMap<String, String> }`. Helpers `AppError::config/launcher/window/shortcut/io("code", &[("k", v)])` for ergonomic construction. Frontend maps `code` → translation key via `src/core/errors.ts`.
- `lib.rs` — orchestration: loads config, registers commands, sets up tray + shortcut, pre-warms the donut window. Registers `tauri-plugin-autostart` (LaunchAgent on macOS), `tauri-plugin-opener`, `tauri-plugin-dialog` (used by Settings for the file/folder picker), and `tauri-plugin-global-shortcut`. Best-effort syncs the SO autostart state to `cfg.system.autostart` at startup.

### Frontend architecture

- `src/donut/geometry.ts` — pure math (SVG arc paths, polar→slice hit-testing). No React, fully unit-testable.
- `src/donut/pagination.ts` — pure `paginate(tabs, itemsPerPage)` honoring the "+ on the last page" rule from `Plano.md` 5.6.
- `src/donut/useSliceHighlight.ts` — hook converting `MouseEvent` into the currently-hovered slice index, or `null` if in the center dead zone or beyond the outer ring.
- `src/donut/useHoverHold.ts` — state machine `idle → holding → actionable → confirming` keyed off the currently hovered slice. Skips non-tab slices (the "+"). The owner (Donut) decides what happens on `onComplete` (just visual) and on the explicit `cancel` / `requestDelete` / `confirmDelete` calls.
- `src/donut/{Slice,CenterCircle,PaginationDots,HoverHoldOverlay,ProfileSwitcher,Donut}.tsx` — presentational SVG components. The Donut renders a single page at a time, navigates via wheel (respecting `wheelDirection`) and clickable indicator dots. CenterCircle's left half (⚙) opens Settings; the right half (👤) toggles `mode = "profiles"` when profile props are provided, exposing the `<ProfileSwitcher>` (one slice per profile + "+", active profile gets a golden marker). HoverHoldOverlay paints the radial fill while holding and the ✏️/🗑️ split + 🗑️/✕ confirm in the action phases. Hover-hold and pagination are suppressed in profiles mode. Right-click on a tab slice opens `<SliceContextMenu>` ("Abrir tudo" / "Editar" / "Excluir"); while the menu is mounted the hover-hold gesture is locked off so the two interactions don't fight for the same slice.
- `src/donut/IconRenderer.tsx` — decides how a tab/profile icon string renders inside the SVG: `lucide:Name` looks up the matching component in `lucide-react` and renders it inside a `<foreignObject>`; `data:`/`http(s):`/`file:`/`asset:` (and common image-suffix paths) render as `<image href>`; anything else is treated as an emoji-style `<text>`. Falls back to `fallback` (typically the tab-name initial) when the Lucide name is unknown or the icon string is empty. The schema stays `icon: string?` — the `lucide:` prefix is purely a frontend convention.
- `src/donut/useFavicon.ts` — hook that resolves a cached favicon for a tab without an explicit `icon`. Calls `ipc.fetchFavicon(firstUrl)`, runs the result through `convertFileSrc`, and memoizes by URL inside the module so re-renders don't refetch. The donut's internal `<TabSlice>` wires this in: `tab.icon ?? favicon.src ?? null` is fed to `<IconRenderer>` with `tabInitial(tab.name)` as the fallback.
- `src/donut/searchTabs.ts` — pure helper `searchTabs(tabs, query) -> Tab[]`. Substring case-insensitive match on `tab.name` and `tab.icon` (ignores `lucide:` tokens since those are component-name implementation detail, not user-facing labels). Empty/whitespace query returns the input intact, preserving order.
- `src/donut/matchesCombo.ts` — pure helper `matchesCombo(e: KeyboardEvent, combo: string): boolean` that parses a Tauri-style combo string (`CommandOrControl+Shift+F`) into `{ ctrl, shift, alt, meta, key }` and compares **all** modifiers exactly (so `Ctrl+F` does not match an event with `shiftKey: true`). `CommandOrControl` maps to `metaKey` on macOS and `ctrlKey` on Win/Linux via `navigator.platform`. Malformed combos return `false` without throwing.
- `src/donut/TabSearchOverlay.tsx` — HTML (not SVG) modal overlay positioned `fixed`, full-viewport, with auto-focused search input + filtered list. Keyboard: ↑/↓ wrap, Enter calls `onSelect(tab.id)`, Esc calls `onClose` (via capture + `stopPropagation` so the entry-level Esc handler that hides the donut window does not fire). Hover updates selection. Click on a row also dispatches `onSelect`. Empty results show a localized "no match" message.
- The `<Donut>` accepts a `searchShortcut: string` prop. A capture-phase `keydown` listener on `window` watches for the configured combo via `matchesCombo`; matching opens the overlay (and is gated off when in profiles mode, when a slice context menu is open, or when the overlay is already open). While the overlay is mounted, `useHoverHold`'s `hoveredSlice` is forced to `null` (suppresses the radial-fill gesture) and the wheel handler short-circuits (no pagination). The entry's existing Esc handler still fires when the overlay isn't mounted, so the donut window keeps closing on Esc when nothing else is in the way.
- `src/core/i18n.ts` — `react-i18next` init. `resolveLanguage()` combines `appearance.language` from config with `navigator.language`; `initI18n()` bootstraps the global instance; `createI18n()` creates isolated instances for tests. `changeLanguage()` switches in runtime — both entrypoints call it inside their `config-changed` listeners so the two windows stay in the same locale. Locale JSON lives in `src/locales/{pt-BR,en}.json`.
- `src/core/theme.ts` — `resolveTheme()` maps `Theme` (`dark`/`light`/`auto`) to a concrete value using `prefers-color-scheme`; `applyTheme()` writes `data-theme` on `<html>`; `watchSystemTheme()` subscribes to OS theme changes while in `auto`.
- `src/core/errors.ts` — `translateAppError(err, t)` converts the Rust `AppError` payload into a localized string, trying `errors.{kind}.{camelCode}` → `errors.{kind}.unknown` → `errors.fallback`.
- `src/core/ipc.ts` — typed wrappers for all commands plus the `CONFIG_CHANGED_EVENT` constant that both windows use to subscribe via `@tauri-apps/api/event`'s `listen`.
- `src/entry/donut.tsx` — window entrypoint: bootstraps i18next from config before React mounts, wires ESC / click-outside / window-blur → `hideDonut`, delegates selection to `openTab`, listens for `config-changed` to refresh tabs AND call `changeLanguage`, surfaces launch failures as a dismissible localized toast. Donut receives the **active profile's tabs**, plus the full `profiles` array for the switcher. Routes gear clicks to `openSettings("new-tab"?)`; hover-hold edit to `openSettings("edit-tab:<id>")` + `hideDonut`; hover-hold delete to `ipc.deleteTab` (scope = active profile by default); profile-slice click to `ipc.setActiveProfile`; "+" in switcher to `openSettings("new-profile")`.
- `src/entry/settings.tsx` + `src/settings/*` — the Settings window. `SettingsApp` routes between three sections via `<SectionTabs>` (`Abas` | `Aparência` | `Atalho`) plus a top `<ProfilePicker>` selecting which profile is being edited (default = active; sections scope to that selection, not the active one). `useConfig` is the single source of truth for config: loads on mount via `get_config` and subscribes to `config-changed`, with `saveTab`/`deleteTab`/`setShortcut`/`setTheme`/`setLanguage`/`setActiveProfile`/`createProfile`/`deleteProfile`/`updateProfile`/`setAutostart`/`reorderTabs`/`reorderProfiles` helpers that round-trip through IPC. `resolveIntent` parses `"new-tab"`, `"edit-tab:<id>"` (searches all profiles and switches the picker to the owner) and `"new-profile"` (intents that arrive before the config snapshot are buffered and replayed in a single effect, avoiding races with the default-to-active assignment). `TabEditor` validates name-or-icon / at-least-one-item / `new URL(...)` for `kind:"url"` items / non-empty path for `file`/`folder` items client-side; the shared text helpers (`stripLetters` / `graphemeCount`) live in `src/settings/textUtils.ts`. `<ProfileEditor>` (used by `<ProfilePicker>`'s "+ Novo" / "Editar perfil") replaces the previous `window.prompt` flow with an inline panel for both creating and editing profile name + icon; `"new-profile"` intent now opens it instead of prompting. `<ProfilePicker>` shows the profiles via `<DraggableProfileList>` (chips with HTML5 native DnD; replaces the old `<select>` since `<option>` is not draggable) — clicking a chip switches the editor target, dragging emits `reorderProfiles`. The shared `useDragReorder<T extends { id: string }>` hook drives both `<DraggableProfileList>` and the row reorder inside `<TabList>`; it computes `above`/`below` against the cursor's vertical midpoint and skips emit when the resulting order would be unchanged. `AppearanceSection` hosts theme radio + language select + a **Sistema** fieldset with the autostart toggle wired to `setAutostart`; when editing a non-active profile, also renders a "Set as active" button. `ShortcutSection` wraps `<ShortcutRecorder>`, which uses the pure `buildCombo(e)` helper to assemble the Tauri shortcut string from a keydown, rejecting reserved keys and modifier-only combos. Server-side `AppError`s render via `translateAppError`. Both `<TabEditor>` and `<ProfileEditor>` ship a "🎨 Escolher" button next to the icon input that opens `<IconPicker>` — a modal with two tabs (Emoji presets + a curated, searchable Lucide grid). The picker emits the literal emoji or a `lucide:Name` token; the editors apply `stripLetters` only when the value does **not** start with `lucide:` (and skip the single-grapheme cap for Lucide tokens) so the `:` and PascalCase identifier survive. The items section is rendered by `<ItemListEditor>` (replaced the old `<UrlListEditor>`): each row carries a kind selector (URL/Arquivo/Pasta), a value input with a kind-specific placeholder, an optional "Abrir com" input (handler/program — empty string means OS default), and — for file/folder rows — a "Procurar…" button that opens the native picker via `dialog.pickFile()` / `dialog.pickFolder()` (wrappers around `@tauri-apps/plugin-dialog`'s `open`). The `ItemDraft` type carries `{ kind, value, openWith }`; submit trims both fields, drops items whose `value` is empty, and maps to `Item[]` (URL → `{kind:"url",value,openWith}`, file/folder → `{kind,path,openWith}`) with `openWith` collapsed to `null` when empty/whitespace.

### Tauri config gotchas (already applied — do not undo)

- `tauri.conf.json`: `app.windows = []` (windows are created programmatically), `app.macOSPrivateApi = true` for transparency on macOS, and `app.security.assetProtocol = { enable: true, scope: ["$APPCONFIG/favicons/**"] }` so the donut webview can load cached favicons via `convertFileSrc`
- `src-tauri/Cargo.toml`: `tauri = { version = "2", features = ["macos-private-api", "tray-icon", "protocol-asset"] }` — all three flags are **required** by the matching conf/API usage (the asset feature is what unlocks `convertFileSrc` for the favicon cache)
- `capabilities/default.json` lists permissions for both `donut` and `settings` windows; global-shortcut, opener, autostart and dialog plugins are gated through `global-shortcut:default` / `opener:default` + `opener:allow-open-url` + `opener:allow-open-path` / `autostart:default` / `dialog:default` + `dialog:allow-open` + `dialog:allow-save` (the save permission unlocks the export-config "save as" picker); `core:event:default` enables `listen`/`emit` for the `config-changed` event that syncs both windows

## Conventions

- **TDD** for pure logic (`config/*`, `launcher`, `geometry`, `useSliceHighlight`, `Donut`). Write the failing test first, then the minimum code to pass. Don't backfill tests onto already-written code unless the task says so.
- **Atualizar/adicionar testes acompanha toda mudança de comportamento.** Ao adicionar uma feature ou alterar uma existente, escrever (ou ajustar) os testes na mesma tarefa — não em uma "segunda passada". Para comandos Tauri ou outro código com efeitos colaterais difíceis de testar diretamente (atalho global, janelas, tray), extraia a lógica pura — planners, validadores, mutadores de `Config` — em helpers `pub(crate)` e cubra esses helpers; o wrapper `#[tauri::command]` fica fino o bastante para inspeção visual. Toda regra nova em `config/validate.rs`, todo novo `AppError` code, todo novo handler de UI com ramo condicional, todo novo `Profile`/`Tab`/config mutator deve ter teste correspondente. PR não está pronto sem cobertura.
- **Small commits with scoped messages**: `feat(config): ...`, `chore(tray): ...`, `fix(config): ...`, `ci: ...`, `docs(plan): ...`. One task = one logical concern = one commit (Cargo.lock updates piggy-back on the commit that changed Cargo.toml).
- **Nunca commitar sem confirmação explícita do usuário.** Finalize alterações (código, testes, docs) e aguarde o "ok"/"pode commitar" antes de rodar `git commit`. Terminar uma tarefa ≠ autorização para commitar. Vale mesmo quando o plano/checklist menciona commit ao final.
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

## Looking ahead to Plano 14 and beyond

Plano 13 is done: busca rápida por aba via overlay `<TabSearchOverlay>` (HTML, não SVG) que abre com `Ctrl+F` por padrão, configurável em Settings → Atalho. Schema ganhou `Interaction.search_shortcut: String` com `#[serde(default = "default_search_shortcut")]` (configs antigas migram grátis). `validate.rs` rejeita `search_shortcut_empty` e propaga `shortcut_parse_failed` via `shortcut::validate_combo`. Comando `set_search_shortcut(combo)` valida + persiste + emite. Helpers puros: `searchTabs(tabs, query)` (substring case-insensitive em name + icon emoji, ignora tokens `lucide:`); `matchesCombo(e, combo)` (parse Tauri-style + comparação exata de modificadores; `CommandOrControl` mapeia Ctrl/Meta por SO via `navigator.platform`). `<Donut>` recebe `searchShortcut` prop e abre o overlay quando `matchesCombo` casa; hover-hold + wheel pagination ficam suprimidos enquanto o overlay está aberto. `<ShortcutSection>` ganhou subseção "Atalho de busca" com segundo `<ShortcutRecorder>`.

Próximo (Plano 14): `kind: "app"` + `kind: "script"` em uma slice combinada com `tauri-plugin-shell` (compartilham mecânica de spawn + UX de segurança). `app` = friendly name resolution (PATH/Windows registry App Paths/macOS .app); `script` = shell command com modal de confirmação dedicado.

Plano 15+: temas customizáveis, sub-donuts, auto-updater Tauri.

(O donut permanece propositalmente em paleta escura — é overlay transparente; alternar para tema claro brigaria com o fundo da área de trabalho.)

Any new user-facing string must have keys in both locale files; any new `AppError` code must have a translation under `errors.{kind}.{camelCode}`. The `errors.{kind}.unknown` fallback exists precisely to catch missed ones — if you see it surfaced in dev, add the specific key before merging.
