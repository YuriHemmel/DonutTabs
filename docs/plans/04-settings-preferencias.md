# DonutTabs — Plano 4: Preferências da Settings (atalho + aparência + idioma)

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa. Passos usam checkbox (`- [ ]`) para rastreamento.

**Meta:** Fechar a parte de Settings da Fase 2 do `Plano.md` entregando três preferências editáveis pela UI:

1. **Atalho global** — gravado por um `<ShortcutRecorder>` que captura a combinação, valida (rejeita teclas reservadas + atalhos só-modificador), chama o comando Rust `set_shortcut` (conflict-aware: registra o novo antes de largar o antigo).
2. **Idioma** — `Auto` / `Português (Brasil)` / `English`. Troca em tempo real via `changeLanguage` (já exportado em [src/core/i18n.ts](../../src/core/i18n.ts:1)), retraduzindo `document.title`. Persiste em `appearance.language`.
3. **Tema** — `Auto` / `Escuro` / `Claro`. Persiste em `appearance.theme`. Aparência visual **limitada** à janela de Settings nesta slice (tokens CSS em `settings.html` + atributo `data-theme`); porte do donut e de cada componente pra theme-aware fica para um plano de polimento.

**Arquitetura:** Nenhuma novidade estrutural. A Settings ganha **navegação por seções** (topbar horizontal: `Abas` | `Aparência` | `Atalho`) para não empilhar tudo na mesma tela. O Rust ganha um novo comando `set_shortcut` e o módulo `shortcut::` é refatorado pra permitir desregistrar + re-registrar. `set_theme` e `set_language` são mutações simples da config (reusa o caminho `save_atomic` + `config-changed`).

**Stack adicional:** nenhuma.

**Fora desta slice:**
- Porte visual do donut para o tema claro (vem em **07-polimento**).
- `kind: file/app/script/folder` e `openMode` por item (Fase 3 do `Plano.md`).
- Paginação da fatia + hover-hold editar/excluir (Plano 5).
- Perfis (Plano 6).

---

## Pré-requisitos (estado atual pós-merge do Plano 3)

- [src-tauri/src/config/schema.rs](../../src-tauri/src/config/schema.rs:1): `Appearance { theme: Theme, language: Language }` já existe; `Theme::{Dark, Light, Auto}` também. **Nenhuma mudança de schema** neste plano.
- [src-tauri/src/shortcut/mod.rs](../../src-tauri/src/shortcut/mod.rs:1): `register_from_config` não guarda o atalho corrente. Precisa refatorar para permitir unregister seletivo.
- [src-tauri/src/errors.rs](../../src-tauri/src/errors.rs:71): `AppError::shortcut` tem `#[allow(dead_code)]` — vai ser consumido aqui; remover o allow e apertar o clippy para `-D warnings`.
- [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs:1): fonte única das mutações — todas emitem `config-changed`. Padrão já estabelecido, basta replicar para os novos comandos.
- [src/settings/SettingsApp.tsx](../../src/settings/SettingsApp.tsx:1): layout atual é sidebar (`TabList`) + conteúdo (`TabEditor`). Precisa virar `topbar de seções` + `conteúdo específico da seção`.
- [src/core/i18n.ts](../../src/core/i18n.ts:1): `changeLanguage(configLanguage)` já pronto — basta chamar.
- [src/locales/{pt-BR,en}.json](../../src/locales): extendidos com novas chaves (seção `settings.appearance.*`, `settings.shortcut.*`).

---

## Estrutura de arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/settings/AppearanceSection.tsx` | Tema (radio) + idioma (select) |
| `src/settings/ShortcutSection.tsx` | Rótulo do atalho atual + `<ShortcutRecorder>` |
| `src/settings/ShortcutRecorder.tsx` | Captura keydown, monta combo string Tauri, valida |
| `src/settings/SectionTabs.tsx` | Topbar horizontal das seções (`Abas` / `Aparência` / `Atalho`) |
| `src/settings/__tests__/AppearanceSection.test.tsx` | Interação (seleciona tema/idioma → chama handlers) |
| `src/settings/__tests__/ShortcutRecorder.test.tsx` | Pura — builder de combo, teclas reservadas, modifier-only rejeitado |
| `src/settings/__tests__/ShortcutSection.test.tsx` | Integração leve (grava → chama ipc.setShortcut) |

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src-tauri/src/shortcut/mod.rs` | Guardar o atalho ativo; expor `set_from_config(app, new) -> Result` que tenta registrar o novo, só desregistra o antigo se conseguir |
| `src-tauri/src/commands.rs` | Novos comandos `set_shortcut`, `set_theme`, `set_language`. Todos persistem + emitem `config-changed` |
| `src-tauri/src/errors.rs` | Remover `#[allow(dead_code)]` do helper `shortcut` (agora usado) |
| `src-tauri/src/lib.rs` | Registrar os três novos comandos no `generate_handler!` |
| `src/core/ipc.ts` | Wrappers `setShortcut`, `setTheme`, `setLanguage` |
| `src/settings/useConfig.ts` | Expor `setShortcut`, `setTheme`, `setLanguage` |
| `src/settings/SettingsApp.tsx` | Layout refatorado — topbar de seções + roteamento interno |
| `src/entry/settings.tsx` | Escutar `config-changed` para (1) chamar `changeLanguage` quando o idioma mudou; (2) reaplicar `document.title` traduzido; (3) aplicar `data-theme` no `<html>` |
| `src/entry/donut.tsx` | Escutar `config-changed` já acontece — só chamar `changeLanguage` no listener pra manter o idioma sincronizado entre as janelas |
| `settings.html` | CSS tokens `[data-theme="dark"]` / `[data-theme="light"]` (mínimos: `--bg`, `--fg`, `--border`) — usar em paineis de topo da Settings |
| `src/locales/pt-BR.json` | Novas chaves `settings.appearance.*`, `settings.shortcut.*`, `errors.shortcut.*` |
| `src/locales/en.json` | Idem |
| `CLAUDE.md` | Atualizar "Looking ahead to Plano 4" → Plano 5; notar que clippy agora roda com `-D warnings` (via `.github/workflows/ci.yml`) |
| `.github/workflows/ci.yml` | Job `lint`: trocar `cargo clippy --lib` para `cargo clippy --lib -- -D warnings` |

---

## Tarefas

### Task 1: Rust — `shortcut::set_from_config` conflict-aware

**Arquivos:**
- Modificar: `src-tauri/src/shortcut/mod.rs`

A ideia-chave: a rotina de troca tenta **registrar o novo antes** de tirar o antigo. Se falhar, o antigo continua ativo (alinhado com `Plano.md` 6.1).

- [ ] **Step 1.1 — Guardar o atalho atualmente registrado**

Substituir a assinatura livre por uma estrutura com estado:

```rust
use std::sync::Mutex;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Estado do atalho global ativo. Vive em `AppState` (próxima task).
pub struct ActiveShortcut(pub Mutex<Option<Shortcut>>);

impl Default for ActiveShortcut {
    fn default() -> Self {
        ActiveShortcut(Mutex::new(None))
    }
}

pub fn register_from_config<R: Runtime>(
    app: &AppHandle<R>,
    active: &ActiveShortcut,
    shortcut_str: &str,
) -> AppResult<()> {
    let shortcut: Shortcut = parse(shortcut_str)?;
    bind(app, &shortcut)?;
    *active.0.lock().unwrap() = Some(shortcut);
    Ok(())
}

/// Tenta trocar o atalho. Em caso de falha no registro do novo, mantém
/// o atual em vigor.
pub fn set_from_config<R: Runtime>(
    app: &AppHandle<R>,
    active: &ActiveShortcut,
    new_combo: &str,
) -> AppResult<()> {
    let new_sc: Shortcut = parse(new_combo)?;
    // Registra o novo primeiro — se falhar (combo em uso por outro app),
    // o antigo segue ativo intocado.
    bind(app, &new_sc)?;
    // Sucesso: remove o antigo, substitui o corrente.
    let mut slot = active.0.lock().unwrap();
    if let Some(old) = slot.take() {
        let _ = app.global_shortcut().unregister(old);
    }
    *slot = Some(new_sc);
    Ok(())
}

fn parse(combo: &str) -> AppResult<Shortcut> {
    combo.parse::<Shortcut>().map_err(|e| {
        AppError::shortcut(
            "shortcut_parse_failed",
            &[("combo", combo.to_string()), ("reason", format!("{e}"))],
        )
    })
}

fn bind<R: Runtime>(app: &AppHandle<R>, sc: &Shortcut) -> AppResult<()> {
    let app_for_handler = app.clone();
    app.global_shortcut()
        .on_shortcut(sc.clone(), move |_app, _sc, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = crate::donut_window::show(&app_for_handler);
            }
        })
        .map_err(|e| {
            AppError::shortcut(
                "shortcut_registration_failed",
                &[("combo", format!("{sc}")), ("reason", e.to_string())],
            )
        })
}
```

Nota: `Shortcut` implementa `Clone` e `Display` no plugin 2.x. Se não, armazenar a string e re-parsear.

- [ ] **Step 1.2 — `cargo check`**

```bash
cd src-tauri && cargo check --lib && cd ..
```

Esperado: compila; call site em `lib.rs` vai dar erro porque a assinatura mudou. Próximo step corrige.

- [ ] **Step 1.3 — Sem commit — passa direto para Task 2** (AppState precisa do `ActiveShortcut` pra chamar as funções)

---

### Task 2: Rust — comandos `set_shortcut`, `set_theme`, `set_language`

**Arquivos:**
- Modificar: `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 2.1 — Adicionar `ActiveShortcut` ao `AppState`**

```rust
use crate::shortcut::ActiveShortcut;

pub struct AppState {
    pub config: RwLock<Config>,
    pub config_path: PathBuf,
    pub pending_settings_intent: Mutex<Option<String>>,
    pub active_shortcut: ActiveShortcut,
}

pub fn initial_load(config_path: PathBuf) -> AppResult<AppState> {
    let cfg = load_from_path(&config_path)?;
    Ok(AppState {
        config: RwLock::new(cfg),
        config_path,
        pending_settings_intent: Mutex::new(None),
        active_shortcut: ActiveShortcut::default(),
    })
}
```

E em `lib.rs`, trocar `shortcut::register_from_config(app.handle(), &shortcut_str)` por:

```rust
let state: tauri::State<'_, AppState> = app.state();
if let Err(e) = shortcut::register_from_config(app.handle(), &state.active_shortcut, &shortcut_str) {
    eprintln!("[setup] shortcut registration failed ({e:?}); ...");
}
```

Como `app.manage(state)` já foi chamado antes, `app.state::<AppState>()` funciona aqui.

- [ ] **Step 2.2 — Escrever testes de mutações puras (FALHAM)**

A lógica pura é aplicar o theme/language no `Config` clonado. Extrair e testar:

```rust
fn apply_theme(cfg: &mut Config, theme: Theme) {
    cfg.appearance.theme = theme;
}

fn apply_language(cfg: &mut Config, language: Language) {
    cfg.appearance.language = language;
}

#[cfg(test)]
mod tests {
    // ... testes existentes ...

    #[test]
    fn apply_theme_updates_appearance() {
        let mut cfg = Config::default();
        apply_theme(&mut cfg, Theme::Light);
        assert_eq!(cfg.appearance.theme, Theme::Light);
    }

    #[test]
    fn apply_language_updates_appearance() {
        let mut cfg = Config::default();
        apply_language(&mut cfg, Language::En);
        assert_eq!(cfg.appearance.language, Language::En);
    }
}
```

- [ ] **Step 2.3 — Comando `set_shortcut` com rollback**

```rust
#[tauri::command]
pub fn set_shortcut<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    combo: String,
) -> Result<Config, AppError> {
    // 1. Registra o novo (se falhar, antigo continua).
    crate::shortcut::set_from_config(&app, &state.active_shortcut, &combo)?;

    // 2. Persiste. Se falhar, precisa desfazer o registro (voltar ao antigo).
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let old_combo = cfg.shortcut.clone();
        cfg.shortcut = combo.clone();
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            // rollback: tenta voltar o atalho
            let _ = crate::shortcut::set_from_config(&app, &state.active_shortcut, &old_combo);
            cfg.shortcut = old_combo;
            return Err(e);
        }
        cfg.clone()
    };

    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}
```

- [ ] **Step 2.4 — Comandos `set_theme` e `set_language`**

```rust
use crate::config::schema::{Language, Theme};

#[tauri::command]
pub fn set_theme<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    theme: Theme,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        apply_theme(&mut cfg, theme);
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            if let Ok(fresh) = load_from_path(&state.config_path) {
                *cfg = fresh;
            }
            return Err(e);
        }
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

// set_language segue o mesmo molde, trocando `apply_theme` por `apply_language`.
```

- [ ] **Step 2.5 — Registrar no `lib.rs`**

```rust
.invoke_handler(tauri::generate_handler![
    commands::get_config,
    commands::open_tab,
    commands::hide_donut,
    commands::save_tab,
    commands::delete_tab,
    commands::open_settings,
    commands::consume_settings_intent,
    commands::close_settings,
    commands::set_shortcut,
    commands::set_theme,
    commands::set_language,
])
```

- [ ] **Step 2.6 — `cargo fmt` / `cargo clippy --lib -- -D warnings` / `cargo test --lib`**

Com `AppError::shortcut` agora consumido de verdade, remover `#[allow(dead_code)]` em `errors.rs`. O lint com `-D warnings` deve passar.

- [ ] **Step 2.7 — Commit**

```bash
git add src-tauri/src/
git commit -m "feat(commands): set_shortcut/set_theme/set_language + active-shortcut state"
```

---

### Task 3: Tightening — clippy `-D warnings` no CI

**Arquivos:**
- Modificar: `.github/workflows/ci.yml`

- [ ] **Step 3.1 — Atualizar job `lint`**

Localizar a linha `cargo clippy --lib` e trocar por `cargo clippy --lib -- -D warnings`.

- [ ] **Step 3.2 — Rodar localmente para garantir clean**

```bash
cd src-tauri && cargo clippy --lib -- -D warnings && cd ..
```

- [ ] **Step 3.3 — Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: tighten clippy to -D warnings now that AppError::shortcut is live"
```

---

### Task 4: Frontend — IPC wrappers + `useConfig` helpers

**Arquivos:**
- Modificar: `src/core/ipc.ts`, `src/settings/useConfig.ts`
- Modificar: `src/settings/__tests__/useConfig.test.tsx` (mock dos novos comandos)

- [ ] **Step 4.1 — `ipc.ts`**

```ts
import type { Theme } from "./types/Theme";
import type { Language } from "./types/Language";
// ...
export const ipc = {
  // ... anteriores ...
  setShortcut: (combo: string) => invoke<Config>("set_shortcut", { combo }),
  setTheme: (theme: Theme) => invoke<Config>("set_theme", { theme }),
  setLanguage: (language: Language) => invoke<Config>("set_language", { language }),
};
```

- [ ] **Step 4.2 — Extender `useConfig`**

```ts
export interface UseConfig {
  config: Config | null;
  loadError: unknown;
  saveTab: (tab: Tab) => Promise<Config>;
  deleteTab: (tabId: string) => Promise<Config>;
  setShortcut: (combo: string) => Promise<Config>;
  setTheme: (theme: Theme) => Promise<Config>;
  setLanguage: (language: Language) => Promise<Config>;
}
```

Implementação segue o padrão dos helpers existentes (aplicam o snapshot retornado).

- [ ] **Step 4.3 — Atualizar o mock em `useConfig.test.tsx`**

Adicionar `setShortcut`, `setTheme`, `setLanguage` como `vi.fn()` no mock de `../../core/ipc`.

- [ ] **Step 4.4 — Teste: os três helpers chamam o ipc correto**

Adicionar 3 `it(...)`s curtos, cada um dispara o helper e assert no `ipc.*.toHaveBeenCalledWith(...)`.

- [ ] **Step 4.5 — Commit**

```bash
git add src/core/ipc.ts src/settings/useConfig.ts src/settings/__tests__/useConfig.test.tsx
git commit -m "feat(ipc): wrappers for set_shortcut/set_theme/set_language"
```

---

### Task 5: `<AppearanceSection>` + traduções

**Arquivos:**
- Criar: `src/settings/AppearanceSection.tsx`, `src/settings/__tests__/AppearanceSection.test.tsx`
- Modificar: `src/locales/pt-BR.json`, `src/locales/en.json`

- [ ] **Step 5.1 — Chaves de tradução**

Em `pt-BR.json`:

```json
"settings": {
  "sections": {
    "tabs": "Abas",
    "appearance": "Aparência",
    "shortcut": "Atalho"
  },
  "appearance": {
    "sectionTitle": "Aparência",
    "theme": "Tema",
    "themeDark": "Escuro",
    "themeLight": "Claro",
    "themeAuto": "Automático (sistema)",
    "language": "Idioma",
    "languageAuto": "Automático (sistema)",
    "languagePtBr": "Português (Brasil)",
    "languageEn": "English"
  }
}
```

Em `en.json`, análogo com valores em inglês.

- [ ] **Step 5.2 — Teste primeiro (FALHA)**

```tsx
// AppearanceSection.test.tsx
describe("AppearanceSection", () => {
  it("calls onThemeChange when a theme radio is toggled", async () => {
    const onThemeChange = vi.fn();
    await render(
      <AppearanceSection
        theme="dark" language="auto"
        onThemeChange={onThemeChange} onLanguageChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByLabelText(/claro/i));
    expect(onThemeChange).toHaveBeenCalledWith("light");
  });

  it("calls onLanguageChange when a language option is selected", async () => {
    const onLanguageChange = vi.fn();
    await render(
      <AppearanceSection
        theme="dark" language="auto"
        onThemeChange={() => {}} onLanguageChange={onLanguageChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText(/idioma/i), "en");
    expect(onLanguageChange).toHaveBeenCalledWith("en");
  });
});
```

- [ ] **Step 5.3 — Implementar**

```tsx
export interface AppearanceSectionProps {
  theme: Theme;
  language: Language;
  onThemeChange: (t: Theme) => void;
  onLanguageChange: (l: Language) => void;
}
export const AppearanceSection: React.FC<AppearanceSectionProps> = (p) => {
  const { t } = useTranslation();
  return (
    <section style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <h2>{t("settings.appearance.sectionTitle")}</h2>
      <fieldset>
        <legend>{t("settings.appearance.theme")}</legend>
        {(["dark", "light", "auto"] as Theme[]).map((opt) => (
          <label key={opt} /* ... */>
            <input
              type="radio"
              checked={p.theme === opt}
              onChange={() => p.onThemeChange(opt)}
            />
            {t(`settings.appearance.theme${capitalize(opt)}`)}
          </label>
        ))}
      </fieldset>
      <label>
        {t("settings.appearance.language")}
        <select
          value={p.language}
          onChange={(e) => p.onLanguageChange(e.target.value as Language)}
        >
          <option value="auto">{t("settings.appearance.languageAuto")}</option>
          <option value="ptBr">{t("settings.appearance.languagePtBr")}</option>
          <option value="en">{t("settings.appearance.languageEn")}</option>
        </select>
      </label>
    </section>
  );
};
```

- [ ] **Step 5.4 — Rodar tests**

```bash
npm test -- --run src/settings/__tests__/AppearanceSection.test.tsx
```

- [ ] **Step 5.5 — Commit**

```bash
git add src/settings/AppearanceSection.tsx src/settings/__tests__/AppearanceSection.test.tsx src/locales/
git commit -m "feat(settings): AppearanceSection (theme + language)"
```

---

### Task 6: `<ShortcutRecorder>` + validação + seção

**Arquivos:**
- Criar: `src/settings/ShortcutRecorder.tsx`, `src/settings/ShortcutSection.tsx`, `src/settings/__tests__/ShortcutRecorder.test.tsx`, `src/settings/__tests__/ShortcutSection.test.tsx`
- Modificar: locales

- [ ] **Step 6.1 — Chaves de tradução**

```json
"settings": {
  "shortcut": {
    "sectionTitle": "Atalho global",
    "current": "Atual:",
    "record": "Gravar novo atalho",
    "recording": "Pressione a combinação…",
    "cancel": "Cancelar",
    "hint": "Combinação precisa conter Ctrl, Alt, Shift ou Super + uma tecla.",
    "reservedKey": "Tecla reservada: {{key}}",
    "noModifier": "Inclua um modificador (Ctrl/Alt/Shift/Super).",
    "conflictToast": "Não foi possível registrar — {{reason}}"
  }
}
```

Também em `errors.shortcut.registrationFailed` (já existe) + novas:
- `errors.shortcut.shortcutParseFailed`
- `errors.shortcut.unknown` (já existe como catch-all)

- [ ] **Step 6.2 — `ShortcutRecorder` — builder de combo (pura, com testes)**

A função `buildCombo(e: KeyboardEvent)` é pura e testável sem render. Assinatura:

```ts
export interface ComboBuildResult {
  combo: string | null;    // null → não finalizou (ex: só modificador)
  error: "reservedKey" | "noModifier" | null;
  errorContext?: Record<string, string>;
}

export function buildCombo(e: KeyboardEvent): ComboBuildResult;
```

Regras:
- Teclas reservadas rejeitadas: `Enter`, `Escape`, `Tab`, ` ` sozinho (sem modificador), teclas mortas.
- Se `e.key` é um nome de modificador (`Control`, `Shift`, `Alt`, `Meta`), retorna `{ combo: null, error: null }` (ainda está compondo).
- Se tem tecla real mas nenhum modificador: `error: "noModifier"`.
- Combo final: parts ordenadas `CommandOrControl`, `Alt`, `Shift`, `<KEY>` concatenadas com `+`. `Meta`/`Ctrl` → `CommandOrControl`.
- Normalização de `e.key`: espaço → `Space`, letras → uppercase, setas → `Up`/`Down`/`Left`/`Right`.

Testes tabela-dirigidos:

```ts
describe("buildCombo", () => {
  const fake = (over: Partial<KeyboardEvent>): KeyboardEvent => ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, key: "", code: "", ...over } as KeyboardEvent);

  it.each([
    [{ ctrlKey: true, shiftKey: true, key: " " }, { combo: "CommandOrControl+Shift+Space" }],
    [{ ctrlKey: true, key: "a" }, { combo: "CommandOrControl+A" }],
    [{ altKey: true, key: "ArrowUp" }, { combo: "Alt+Up" }],
    [{ key: "a" }, { combo: null, error: "noModifier" }],
    [{ ctrlKey: true, key: "Enter" }, { combo: null, error: "reservedKey" }],
    [{ key: "Control" }, { combo: null, error: null }],
  ])("input %p → %p", (over, expected) => {
    expect(buildCombo(fake(over))).toMatchObject(expected);
  });
});
```

- [ ] **Step 6.3 — `ShortcutRecorder` componente**

```tsx
export interface ShortcutRecorderProps {
  current: string;
  onCapture: (combo: string) => void;
}
export const ShortcutRecorder: React.FC<ShortcutRecorderProps> = ({ current, onCapture }) => {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setRecording(false); setError(null); return; }
      const r = buildCombo(e);
      if (r.error === "reservedKey") {
        setError(t("settings.shortcut.reservedKey", { key: e.key }));
        return;
      }
      if (r.error === "noModifier") {
        setError(t("settings.shortcut.noModifier"));
        return;
      }
      if (r.combo) {
        onCapture(r.combo);
        setRecording(false);
        setError(null);
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [recording, t, onCapture]);

  return (
    <div>
      <div>{t("settings.shortcut.current")} <code>{current}</code></div>
      {recording ? (
        <div>{t("settings.shortcut.recording")}</div>
      ) : (
        <button onClick={() => setRecording(true)}>{t("settings.shortcut.record")}</button>
      )}
      {recording && <button onClick={() => setRecording(false)}>{t("settings.shortcut.cancel")}</button>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
};
```

- [ ] **Step 6.4 — `ShortcutSection` (wrapper)**

Orquestra `ShortcutRecorder` com `useConfig.setShortcut`, exibindo toast de erro traduzido quando o registro falha (ex: `errors.shortcut.shortcutRegistrationFailed` retornado pelo Rust).

- [ ] **Step 6.5 — Testes**

- `buildCombo`: já coberta em 6.2.
- `ShortcutRecorder`:
  - Click "Gravar" → `fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true, key: " " })` → assert `onCapture("CommandOrControl+Shift+Space")`, recording desligado.
  - ESC durante gravação cancela sem chamar `onCapture`.
  - Tecla reservada → mostra erro, mantém gravação.
- `ShortcutSection`:
  - Grava combo válido → `ipc.setShortcut` chamado com a string correta.
  - Rust retorna erro → toast traduzido aparece.

- [ ] **Step 6.6 — Commit**

```bash
git add src/settings/ShortcutRecorder.tsx src/settings/ShortcutSection.tsx src/settings/__tests__/Shortcut*.test.tsx src/locales/
git commit -m "feat(settings): ShortcutRecorder + ShortcutSection with conflict-aware save"
```

---

### Task 7: Navegação por seções no `<SettingsApp>`

**Arquivos:**
- Criar: `src/settings/SectionTabs.tsx`
- Modificar: `src/settings/SettingsApp.tsx`, `src/settings/__tests__/SettingsApp.test.tsx`

- [ ] **Step 7.1 — `SectionTabs` — topbar simples**

```tsx
export type Section = "tabs" | "appearance" | "shortcut";
export interface SectionTabsProps { active: Section; onChange: (s: Section) => void; }
export const SectionTabs: React.FC<SectionTabsProps> = ({ active, onChange }) => {
  const { t } = useTranslation();
  const items: Section[] = ["tabs", "appearance", "shortcut"];
  return (
    <nav role="tablist" style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid #23304d" }}>
      {items.map((s) => (
        <button key={s} role="tab" aria-selected={active === s} onClick={() => onChange(s)}>
          {t(`settings.sections.${s}`)}
        </button>
      ))}
    </nav>
  );
};
```

- [ ] **Step 7.2 — Refatorar `SettingsApp`**

Novo layout:

```tsx
const [section, setSection] = useState<Section>("tabs");
// ... intent listener deve também alternar section quando for "new-tab":
//   if (intent === "new-tab") { setSection("tabs"); setSelection({ mode: "new" }); }

return (
  <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
    <SectionTabs active={section} onChange={setSection} />
    {section === "tabs" && (
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <TabList ... />
        { /* editor ou prompt */ }
      </div>
    )}
    {section === "appearance" && (
      <AppearanceSection
        theme={config.appearance.theme}
        language={config.appearance.language}
        onThemeChange={setTheme}
        onLanguageChange={setLanguage}
      />
    )}
    {section === "shortcut" && (
      <ShortcutSection current={config.shortcut} onCapture={setShortcut} />
    )}
  </div>
);
```

- [ ] **Step 7.3 — Atualizar testes existentes**

`SettingsApp.test.tsx` hoje assume que a TabList aparece na tela inicial. Precisa:
- Setar `section="tabs"` default → teste continua passando.
- Adicionar teste: clicar em `role="tab"` com nome "Aparência" → painel de aparência aparece, TabList some.
- Adicionar teste: intent `new-tab` navega para section "tabs" AND abre editor new.

- [ ] **Step 7.4 — Commit**

```bash
git add src/settings/SectionTabs.tsx src/settings/SettingsApp.tsx src/settings/__tests__/SettingsApp.test.tsx
git commit -m "feat(settings): horizontal section tabs (Abas | Aparência | Atalho)"
```

---

### Task 8: Tema visual mínimo + idioma reativo nas webviews

**Arquivos:**
- Modificar: `settings.html`, `src/entry/settings.tsx`, `src/entry/donut.tsx`

- [ ] **Step 8.1 — Tokens CSS em `settings.html`**

```html
<style>
  :root[data-theme="dark"] {
    --bg: #0f1320;
    --fg: #dde;
    --border: #23304d;
    --panel: #0c1020;
  }
  :root[data-theme="light"] {
    --bg: #f4f4f8;
    --fg: #222;
    --border: #cfd3dc;
    --panel: #e8ebf1;
  }
  html, body { background: var(--bg); color: var(--fg); ... }
</style>
```

Dentro de `SectionTabs` e `SettingsApp`, trocar `background: "#0c1020"` / `"#0f1320"` / `"#23304d"` pelas `var(--panel)` / `var(--bg)` / `var(--border)`. **Não** porte todos os componentes internos nesta slice — foque no cascão da Settings. (TabEditor, TabList, etc. permanecem com inline hex dark-only por enquanto — isso sai em 07-polimento.)

- [ ] **Step 8.2 — Resolver tema efetivo + aplicar `data-theme`**

Em `src/entry/settings.tsx`, função `applyTheme(theme: Theme)` que:
- `dark` → `document.documentElement.setAttribute("data-theme", "dark")`
- `light` → `"light"`
- `auto` → usa `matchMedia("(prefers-color-scheme: light)")`, e adiciona listener para reagir a mudanças de SO enquanto o app está aberto.

Chamar no bootstrap (logo após `initI18n`) e dentro do listener de `config-changed`.

- [ ] **Step 8.3 — Idioma reativo**

No listener de `config-changed` em ambos os entrypoints:

```ts
void listen<Config>(CONFIG_CHANGED_EVENT, async (e) => {
  const cfg = e.payload;
  setConfig(cfg); // donut
  await changeLanguage(cfg.appearance.language);
  document.title = i18next.t("settings.title"); // só no settings
  applyTheme(cfg.appearance.theme); // só no settings
});
```

- [ ] **Step 8.4 — `npm test` + smoke**

```bash
npm test -- --run
npx tsc --noEmit
npm run tauri dev
```

Smoke:
- Alternar idioma na Settings → Settings retranscreve imediatamente; abrir donut → strings dele também em novo idioma (abrir aba com URL inválida pra ver o toast).
- Alternar tema na Settings → fundo da Settings muda imediatamente; donut não muda (esperado nesta slice).
- Gravar atalho Ctrl+Shift+D → ao pressionar Ctrl+Shift+D globalmente, donut abre. Antigo atalho já não dispara.

- [ ] **Step 8.5 — Commit**

```bash
git add settings.html src/entry/
git commit -m "feat(settings): live theme + language switching with data-theme tokens"
```

---

### Task 9: Fechamento — CLAUDE.md + PR

**Arquivos:**
- Modificar: `CLAUDE.md`

- [ ] **Step 9.1 — Atualizar CLAUDE.md**

- Adicionar `docs/plans/04-settings-preferencias.md` em "Start here".
- Mencionar que:
  - `AppState` agora guarda `ActiveShortcut`.
  - `set_shortcut` registra-antes-de-largar para preservar o atalho antigo em caso de conflito.
  - Clippy roda com `-D warnings`.
  - Tema visual é limitado ao cascão da Settings; porte completo em planos futuros.
- "Looking ahead to Plano 5 and beyond": gestos do donut (paginação, hover-hold).

- [ ] **Step 9.2 — Pipeline local completo**

```bash
npm test -- --run
npx tsc --noEmit
cd src-tauri && cargo fmt --check && cargo clippy --lib -- -D warnings && cargo test --lib && cd ..
```

- [ ] **Step 9.3 — Commit final + push + PR**

```bash
git add CLAUDE.md docs/plans/04-settings-preferencias.md
git commit -m "docs(claude): mark Plano 4 (Settings preferences) complete"
git push -u origin HEAD
gh pr create --title "Plano 4 — Settings: preferências" --body-file docs/pr-4-body.md
```

---

## Resumo dos commits previstos

1. `feat(commands): set_shortcut/set_theme/set_language + active-shortcut state`
2. `ci: tighten clippy to -D warnings now that AppError::shortcut is live`
3. `feat(ipc): wrappers for set_shortcut/set_theme/set_language`
4. `feat(settings): AppearanceSection (theme + language)`
5. `feat(settings): ShortcutRecorder + ShortcutSection with conflict-aware save`
6. `feat(settings): horizontal section tabs (Abas | Aparência | Atalho)`
7. `feat(settings): live theme + language switching with data-theme tokens`
8. `docs(claude): mark Plano 4 (Settings preferences) complete`

---

## Critérios de aceitação

- [ ] Setar idioma via Settings troca a UI imediatamente em ambas as janelas (donut e settings).
- [ ] Setar tema aplica no cascão da Settings em tempo real; valor persiste em `config.appearance.theme`.
- [ ] Gravar um atalho válido (ex: `Ctrl+Alt+Y`) passa a disparar o donut; atalho anterior não dispara mais.
- [ ] Tentar gravar um atalho em uso por outro app (simular registrando o combo do próprio app duas vezes, ou tentando gravar algo já usado pelo SO) → toast traduzido; atalho antigo permanece ativo.
- [ ] Teclas reservadas (Enter, Tab, Escape) rejeitadas com mensagem.
- [ ] Atalho sem modificador (só letra) rejeitado com mensagem.
- [ ] Config persistido em disco (verificar `%APPDATA%\DonutTabs\config.json`).
- [ ] `cargo clippy --lib -- -D warnings` verde.
- [ ] `#[allow(dead_code)]` removido de `AppError::shortcut`.
- [ ] CI verde (Linux/macOS/Windows).

---

## Notas para quem for implementar

- **Rollback do `set_shortcut`**: dois pontos de falha — registro do novo (lidado pelo `shortcut::set_from_config` — mantém o antigo intacto) e gravação em disco (lidado dentro do comando `set_shortcut` — re-registra o antigo se o disco falhar). Teste manualmente forçando disk-full ou via permissão de escrita negada em `%APPDATA%\DonutTabs` se quiser validar o caminho (não cobrir em teste automatizado — depende de condições do SO).
- **Teclas reservadas**: manter a lista conservadora nesta slice (`Enter`, `Tab`, `Escape`, tecla morta). Não ampliar para ex: `F-keys` sem motivo — usuários avançados podem querer.
- **Normalização de `e.key`**: o plugin `global-shortcut` tem sua própria tabela de nomes aceitos (ver [docs do crate](https://crates.io/crates/tauri-plugin-global-shortcut)). Focar em cobrir: letras (A–Z uppercase), dígitos, setas (Up/Down/Left/Right), espaço (Space), F-keys (F1–F12), teclas de navegação (Home/End/PageUp/PageDown/Insert/Delete). Outros casos podem ser adicionados sob demanda quando descobertos.
- **Tema `auto`**: use `matchMedia` mas lembre de registrar o listener para reagir à mudança de tema do SO enquanto o app está aberto; caso contrário o usuário precisa reabrir a Settings pra ver a mudança.
- **Escopo deliberado**: esta slice **não** porta cada componente pra theme-aware. Se você ceder à tentação e começar a trocar `#0f1320` por `var(--bg)` em TabList, TabEditor, UrlListEditor, donut components — pare. Isso é Plano 7 (polimento). Se fizer aqui, o plano vai explodir.
