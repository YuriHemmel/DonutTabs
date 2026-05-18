use crate::config::schema::{Item, Tab};
use crate::errors::{AppError, AppResult};
use uuid::Uuid;

/// Plano 19 — abstração ortogonal ao `Opener` para execução de scripts
/// com captura de stdout/stderr. Implementação real (em `commands.rs`)
/// instancia uma run no `ScriptHistory`, spawna o child via
/// `tauri-plugin-shell::Command::spawn()`, e consome o channel
/// `CommandEvent` em uma task assíncrona. `launch_tab` delega Scripts
/// para esta interface quando a captura está ligada.
pub trait ScriptCaptureExecutor: Send + Sync {
    fn execute_script(
        &self,
        profile_id: Uuid,
        tab_id: Uuid,
        item_index: usize,
        command: &str,
    ) -> Result<(), String>;
}

/// Abstraction over `tauri-plugin-opener` and `tauri-plugin-shell` so launcher
/// logic stays unit-testable.
///
/// `open_url` / `open_path` accept an optional `with` (handler/program — e.g.
/// `"firefox"`, `"code"`). `None` defers to the OS default. The string is
/// forwarded as-is to the plugin — semantics depend on the OS:
///   * Windows: executable on PATH or absolute `.exe` path
///   * macOS: `.app` bundle name (e.g. `"Firefox"`)
///   * Linux: program name on PATH
///
/// `spawn_app` and `spawn_script` (Plano 14) use `tauri-plugin-shell` to spawn
/// a process. `spawn_app` resolves the friendly name cross-OS (macOS uses
/// `open -a name`; Win/Linux call the binary directly). `spawn_script` runs
/// arbitrary shell command via `cmd /C` (Windows) or `sh -c` (Unix). **Trust
/// gating happens at the command layer (`commands::open_tab`)** — the launcher
/// only executes whatever it receives.
pub trait Opener: Send + Sync {
    fn open_url(&self, url: &str, with: Option<&str>) -> Result<(), String>;
    fn open_path(&self, path: &str, with: Option<&str>) -> Result<(), String>;
    fn spawn_app(&self, name: &str) -> Result<(), String>;
    fn spawn_script(&self, command: &str) -> Result<(), String>;
    /// Abre uma URL no navegador `browser` em modo anônimo/privado. Browser
    /// é resolvido para flag CLI específico via `browser_incognito_flag`.
    /// Implementações reais spawnam o processo direto via plugin-shell
    /// (`tauri-plugin-opener` não aceita args customizados). Default impl
    /// cai pro `open_url` normal e loga aviso — usado em testes que não
    /// precisam diferenciar incognito do caminho normal.
    fn open_url_incognito(&self, url: &str, browser: &str) -> Result<(), String> {
        eprintln!(
            "[opener] open_url_incognito fallback (browser={browser}): \
             implementação não suporta incognito; abrindo modo normal"
        );
        self.open_url(url, Some(browser))
    }
    /// Detecção runtime do navegador padrão do SO. Chamado pelo launcher
    /// quando `Item::Url.incognito == true && open_with.is_none()`. Default
    /// impl delega a `default_browser::detect()`; mocks de teste podem
    /// override pra controlar o ramo "detected" sem depender do ambiente.
    fn detect_default_browser(&self) -> Option<String> {
        crate::default_browser::detect()
    }
    /// Plano 21 — move o cursor pro centro do monitor especificado antes
    /// do launch. Browsers/apps spawnam fresh windows na tela com cursor;
    /// apps que reusam janela ignoram. Best-effort: erro retornado pra
    /// log mas não aborta launch (chamado fora da match arm).
    /// Default impl no-op pra implementações que não suportam (testes,
    /// futuros backends).
    fn warp_cursor_to_monitor(&self, _monitor_index: u32) -> Result<(), String> {
        Ok(())
    }
}

/// Mapeia nome/path do navegador → flag CLI de modo anônimo. Match é
/// case-insensitive em substring contra keywords conhecidas. Returns
/// `None` quando o navegador não tem flag conhecido (ex. Safari) ou não
/// foi reconhecido — caller decide o fallback.
pub fn browser_incognito_flag(browser: &str) -> Option<&'static str> {
    let lower = browser.to_lowercase();
    // Edge/msedge → --inprivate. Chromium-likes (chrome, brave, chromium,
    // vivaldi, opera) → --incognito. Firefox/forks → --private-window.
    // Match Edge primeiro pra evitar colisão com "edge" em outros nomes.
    if lower.contains("msedge") || lower.contains("microsoft edge") || lower.contains("edge.exe") {
        return Some("--inprivate");
    }
    if lower.contains("firefox")
        || lower.contains("librewolf")
        || lower.contains("waterfox")
        || lower.contains("zen")
    {
        // Firefox docs canonical: `-private-window` (single dash). Algumas
        // builds Windows ignoram `--private-window` (double dash) e tratam
        // como argumento literal — passa URL pra janela normal.
        return Some("-private-window");
    }
    if lower.contains("opera") {
        return Some("--private");
    }
    if lower.contains("chrome")
        || lower.contains("chromium")
        || lower.contains("brave")
        || lower.contains("vivaldi")
        || lower.contains("arc")
        || lower.contains("yandex")
        || lower.contains("duckduckgo")
    {
        return Some("--incognito");
    }
    // Safari não suporta CLI flag pra Private Browsing. Tor Browser sempre
    // é privado por design; flag não necessária.
    None
}

/// Resultado da tentativa de abrir uma aba: lista de erros por item.
/// Se estiver vazio, tudo deu certo.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct LaunchOutcome {
    pub failures: Vec<(String, String)>,
    pub total: usize,
}

/// Helper puro: decide se um `Item::App.name` no Windows deve ser roteado
/// via opener (ShellExecute) em vez de `Command::new`. Tudo que termina em
/// `.lnk` (case-insensitive) é shell-link e CreateProcess não resolve.
/// Cross-platform pra cobrir nos testes (compila em qualquer SO).
///
/// Em Linux/macOS o `#[cfg(target_os = "windows")]` bloco do `spawn_app`
/// não compila, então a função fica órfã do call-site real — `dead_code`
/// dispara só nesses targets. Suprimimos cirurgicamente sem mascarar o
/// dead-code real do build Windows.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn windows_app_should_route_via_opener(name: &str) -> bool {
    name.to_lowercase().ends_with(".lnk")
}

/// Itera os itens da aba e roteia cada um pelo Opener apropriado. Quando
/// `script_capture` é `Some`, items `Item::Script` vão pelo executor de
/// captura (Plano 19); quando `None`, caem no fire-and-forget legacy
/// (`opener.spawn_script`). Demais kinds inalterados. Falhas individuais
/// são acumuladas em `outcome.failures`; total-failure (todos itens
/// falharam) curto-circuita pra `AppError::Launcher { code: "all_items_failed" }`.
pub fn launch_tab(
    tab: &Tab,
    opener: &dyn Opener,
    profile_id: Uuid,
    script_capture: Option<&dyn ScriptCaptureExecutor>,
) -> AppResult<LaunchOutcome> {
    let mut outcome = LaunchOutcome {
        total: tab.items.len(),
        ..Default::default()
    };
    for (idx, item) in tab.items.iter().enumerate() {
        // Plano 21 — cursor warp pré-launch quando o item carrega `monitor`.
        // Best-effort: warp falhar (Wayland sem suporte, FFI error) não
        // bloqueia o launch — segue pro OS handler que abre na tela default.
        if let Some(m) = item.monitor() {
            if let Err(e) = opener.warp_cursor_to_monitor(m) {
                eprintln!("[launcher] cursor warp pro monitor {m} falhou: {e}");
            }
        }
        match item {
            Item::Url {
                value,
                open_with,
                incognito,
                ..
            } => {
                let result = if *incognito {
                    // Resolve navegador: explícito > detecção do default do SO.
                    let explicit = open_with
                        .as_deref()
                        .map(str::trim)
                        .filter(|s| !s.is_empty());
                    let detected = if explicit.is_none() {
                        opener.detect_default_browser()
                    } else {
                        None
                    };
                    let browser_ref = explicit.or(detected.as_deref());
                    eprintln!(
                        "[launcher] incognito dispatch: explicit={:?} detected={:?} chosen={:?} url={:?}",
                        explicit, detected, browser_ref, value
                    );
                    match browser_ref {
                        Some(b) => opener.open_url_incognito(value, b),
                        None => {
                            eprintln!(
                                "[launcher] incognito=true mas nenhum navegador \
                                 detectado; abrindo URL normalmente"
                            );
                            opener.open_url(value, None)
                        }
                    }
                } else {
                    opener.open_url(value, open_with.as_deref())
                };
                if let Err(e) = result {
                    eprintln!("[launcher] url launch falhou: {} ({})", value, e);
                    outcome.failures.push((value.clone(), e));
                }
            }
            Item::File {
                path, open_with, ..
            }
            | Item::Folder {
                path, open_with, ..
            } => {
                if let Err(e) = opener.open_path(path, open_with.as_deref()) {
                    outcome.failures.push((path.clone(), e));
                }
            }
            Item::App { name, .. } => {
                if let Err(e) = opener.spawn_app(name) {
                    outcome.failures.push((name.clone(), e));
                }
            }
            Item::Script { command, .. } => {
                let result = if let Some(exec) = script_capture {
                    exec.execute_script(profile_id, tab.id, idx, command)
                } else {
                    opener.spawn_script(command)
                };
                if let Err(e) = result {
                    outcome.failures.push((command.clone(), e));
                }
            }
        }
    }
    if outcome.failures.len() == outcome.total && outcome.total > 0 {
        return Err(AppError::launcher(
            "all_items_failed",
            &[("total", outcome.total.to_string())],
        ));
    }
    Ok(outcome)
}

pub struct TauriOpener<'a, R: tauri::Runtime> {
    app: &'a tauri::AppHandle<R>,
}

impl<'a, R: tauri::Runtime> TauriOpener<'a, R> {
    pub fn new(app: &'a tauri::AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<'a, R: tauri::Runtime> Opener for TauriOpener<'a, R> {
    fn open_url(&self, url: &str, with: Option<&str>) -> Result<(), String> {
        use tauri_plugin_opener::OpenerExt;
        self.app
            .opener()
            .open_url(url, with)
            .map_err(|e| e.to_string())
    }

    fn open_path(&self, path: &str, with: Option<&str>) -> Result<(), String> {
        use tauri_plugin_opener::OpenerExt;
        self.app
            .opener()
            .open_path(path, with)
            .map_err(|e| e.to_string())
    }

    fn open_url_incognito(&self, url: &str, browser: &str) -> Result<(), String> {
        // Resolve flag CLI específico do browser. Quando não há flag mapeado
        // (Safari, Tor, browser desconhecido), invoca o browser apenas com
        // a URL — vai abrir uma janela normal. Fallback intencional: melhor
        // abrir não-anônima do que falhar.
        let flag = browser_incognito_flag(browser);
        eprintln!(
            "[opener] incognito launch: browser={:?} flag={:?} url={:?}",
            browser, flag, url
        );
        // std::process::Command direto em vez de tauri-plugin-shell pra
        // evitar restrição de scope (plugin pode bloquear spawn de paths
        // arbitrários sem allowlist explícito).
        #[cfg(target_os = "macos")]
        {
            use std::process::Command;
            let Some(flag) = flag else {
                return self.open_url(url, Some(browser));
            };
            return Command::new("open")
                .args(["-na", browser, "--args", flag, url])
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string());
        }
        #[cfg(target_os = "windows")]
        {
            // `CREATE_NO_WINDOW = 0x0800_0000` evita o flash de console preto
            // quando o browser é um `.exe` console-aware. Sem isto, alguns
            // builds (Firefox Nightly, instaladores antigos) mostram cmd
            // window por uma fração de segundo antes do GUI surgir.
            use std::os::windows::process::CommandExt;
            use std::process::Command;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            let mut cmd = Command::new(browser);
            cmd.creation_flags(CREATE_NO_WINDOW);
            if let Some(f) = flag {
                cmd.arg(f);
            }
            cmd.arg(url);
            cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
        }
        #[cfg(target_os = "linux")]
        {
            use std::process::Command;
            let mut cmd = Command::new(browser);
            if let Some(f) = flag {
                cmd.arg(f);
            }
            cmd.arg(url);
            cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        {
            let _ = flag;
            self.open_url(url, Some(browser))
        }
    }

    fn spawn_app(&self, name: &str) -> Result<(), String> {
        use tauri_plugin_shell::ShellExt;
        // macOS: nomes amigáveis (`Firefox`, `Visual Studio Code`) precisam
        // ser resolvidos via Launch Services. `open -a NAME` faz isso e
        // funciona com `.app` bundle names sem caminho absoluto.
        // Win/Linux: confiamos no PATH ou no caminho absoluto que o user
        // digitou. Plugin-shell spawns o processo direto.
        // Windows + `.lnk`: CreateProcess/Command::new não resolve shell-links;
        // roteamos via plugin-opener (ShellExecute) que segue o link e
        // executa o target. Isso casa com o que o picker do Plano 17 popula
        // pra rows de Start Menu.
        #[cfg(target_os = "macos")]
        {
            self.app
                .shell()
                .command("open")
                .args(["-a", name])
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        #[cfg(target_os = "windows")]
        {
            if windows_app_should_route_via_opener(name) {
                use tauri_plugin_opener::OpenerExt;
                return self
                    .app
                    .opener()
                    .open_path(name, None::<&str>)
                    .map_err(|e| e.to_string());
            }
            self.app
                .shell()
                .command(name)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        {
            self.app
                .shell()
                .command(name)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
    }

    fn spawn_script(&self, command: &str) -> Result<(), String> {
        use tauri_plugin_shell::ShellExt;
        // Trust + profile.allow_scripts gating já aconteceu no `open_tab`;
        // aqui só executamos. Shell wrapping permite operadores (&&, |, etc.).
        #[cfg(target_os = "windows")]
        let (shell, flag) = ("cmd", "/C");
        #[cfg(not(target_os = "windows"))]
        let (shell, flag) = ("sh", "-c");
        self.app
            .shell()
            .command(shell)
            .args([flag, command])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    fn warp_cursor_to_monitor(&self, monitor_index: u32) -> Result<(), String> {
        crate::cursor_warp::warp_to_monitor(self.app, monitor_index).map_err(|e| format!("{e:?}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::schema::{Item, OpenMode, Tab, TabKind};
    use std::sync::Mutex;
    use uuid::Uuid;

    type Call = (String, Option<String>);

    struct MockOpener {
        url_calls: Mutex<Vec<Call>>,
        path_calls: Mutex<Vec<Call>>,
        app_calls: Mutex<Vec<String>>,
        script_calls: Mutex<Vec<String>>,
        /// Plano 21 — registra cada chamada `warp_cursor_to_monitor`. Pré-launch:
        /// a ordem dos warps relativa aos opens é o que validamos nos tests.
        warp_calls: Mutex<Vec<u32>>,
        /// Issue — registra cada chamada `open_url_incognito` como
        /// `(url, browser)`. Permite que tests distingam path normal vs
        /// incognito sem confiar no fallback default da trait.
        incognito_calls: Mutex<Vec<Call>>,
        /// Browser que `detect_default_browser` deve devolver. `None`
        /// simula SO sem default detectável (CI Linux sem xdg-settings).
        /// `Some(s)` injeta um browser pra exercitar o caminho "detected".
        detected_browser: Option<String>,
        fail_urls: Vec<String>,
        fail_paths: Vec<String>,
        fail_apps: Vec<String>,
        fail_scripts: Vec<String>,
        fail_warps: Vec<u32>,
    }

    impl MockOpener {
        fn new() -> Self {
            Self {
                url_calls: Mutex::new(vec![]),
                path_calls: Mutex::new(vec![]),
                app_calls: Mutex::new(vec![]),
                script_calls: Mutex::new(vec![]),
                warp_calls: Mutex::new(vec![]),
                incognito_calls: Mutex::new(vec![]),
                detected_browser: None,
                fail_urls: vec![],
                fail_paths: vec![],
                fail_apps: vec![],
                fail_scripts: vec![],
                fail_warps: vec![],
            }
        }

        fn with_detected(mut self, browser: &str) -> Self {
            self.detected_browser = Some(browser.to_string());
            self
        }
    }

    impl Opener for MockOpener {
        fn open_url(&self, url: &str, with: Option<&str>) -> Result<(), String> {
            self.url_calls
                .lock()
                .unwrap()
                .push((url.to_string(), with.map(str::to_string)));
            if self.fail_urls.iter().any(|f| f == url) {
                Err("simulated url failure".into())
            } else {
                Ok(())
            }
        }

        fn open_path(&self, path: &str, with: Option<&str>) -> Result<(), String> {
            self.path_calls
                .lock()
                .unwrap()
                .push((path.to_string(), with.map(str::to_string)));
            if self.fail_paths.iter().any(|f| f == path) {
                Err("simulated path failure".into())
            } else {
                Ok(())
            }
        }

        fn open_url_incognito(&self, url: &str, browser: &str) -> Result<(), String> {
            self.incognito_calls
                .lock()
                .unwrap()
                .push((url.to_string(), Some(browser.to_string())));
            if self.fail_urls.iter().any(|f| f == url) {
                Err("simulated url failure".into())
            } else {
                Ok(())
            }
        }

        fn spawn_app(&self, name: &str) -> Result<(), String> {
            self.app_calls.lock().unwrap().push(name.to_string());
            if self.fail_apps.iter().any(|f| f == name) {
                Err("simulated app failure".into())
            } else {
                Ok(())
            }
        }

        fn spawn_script(&self, command: &str) -> Result<(), String> {
            self.script_calls.lock().unwrap().push(command.to_string());
            if self.fail_scripts.iter().any(|f| f == command) {
                Err("simulated script failure".into())
            } else {
                Ok(())
            }
        }

        fn warp_cursor_to_monitor(&self, monitor_index: u32) -> Result<(), String> {
            self.warp_calls.lock().unwrap().push(monitor_index);
            if self.fail_warps.iter().any(|i| *i == monitor_index) {
                Err("simulated warp failure".into())
            } else {
                Ok(())
            }
        }

        fn detect_default_browser(&self) -> Option<String> {
            self.detected_browser.clone()
        }
    }

    fn tab_url(urls: &[&str]) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: Some("t".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: urls
                .iter()
                .map(|u| Item::Url {
                    value: (*u).into(),
                    open_with: None,
                    monitor: None,
                    incognito: false,
                })
                .collect(),
            kind: TabKind::Leaf,
            children: vec![],
        }
    }

    fn tab_with_items(items: Vec<Item>) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: Some("t".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items,
            kind: TabKind::Leaf,
            children: vec![],
        }
    }

    fn url_values(calls: &Mutex<Vec<Call>>) -> Vec<String> {
        calls
            .lock()
            .unwrap()
            .iter()
            .map(|(v, _)| v.clone())
            .collect()
    }

    #[test]
    fn opens_all_urls_in_order() {
        let opener = MockOpener::new();
        let tab = tab_url(&["https://a", "https://b", "https://c"]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(outcome.total, 3);
        assert_eq!(
            url_values(&opener.url_calls),
            vec!["https://a", "https://b", "https://c"]
        );
        assert!(opener.path_calls.lock().unwrap().is_empty());
    }

    #[test]
    fn continues_after_individual_failure() {
        let mut opener = MockOpener::new();
        opener.fail_urls = vec!["https://b".into()];
        let tab = tab_url(&["https://a", "https://b", "https://c"]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert_eq!(outcome.failures.len(), 1);
        assert_eq!(outcome.failures[0].0, "https://b");
        assert_eq!(opener.url_calls.lock().unwrap().len(), 3);
    }

    #[test]
    fn total_failure_returns_error() {
        let mut opener = MockOpener::new();
        opener.fail_urls = vec!["https://a".into(), "https://b".into()];
        let tab = tab_url(&["https://a", "https://b"]);
        match launch_tab(&tab, &opener, Uuid::nil(), None).unwrap_err() {
            AppError::Launcher { code, context } => {
                assert_eq!(code, "all_items_failed");
                assert_eq!(context.get("total").map(String::as_str), Some("2"));
            }
            other => panic!("expected Launcher error, got {other:?}"),
        }
    }

    #[test]
    fn empty_tab_is_ok() {
        let opener = MockOpener::new();
        let tab = tab_url(&[]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert_eq!(outcome.total, 0);
    }

    #[test]
    fn opens_mixed_url_file_folder_items() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: None,
                value: "https://a".into(),
                open_with: None,
                incognito: false,
            },
            Item::File {
                monitor: None,
                path: "/tmp/x.txt".into(),
                open_with: None,
            },
            Item::Folder {
                monitor: None,
                path: "/tmp".into(),
                open_with: None,
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(outcome.total, 3);
        assert_eq!(url_values(&opener.url_calls), vec!["https://a"]);
        assert_eq!(
            opener
                .path_calls
                .lock()
                .unwrap()
                .iter()
                .map(|(p, _)| p.clone())
                .collect::<Vec<_>>(),
            vec!["/tmp/x.txt", "/tmp"]
        );
    }

    #[test]
    fn file_failure_records_path_in_outcome() {
        let mut opener = MockOpener::new();
        opener.fail_paths = vec!["/missing".into()];
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: None,
                value: "https://a".into(),
                open_with: None,
                incognito: false,
            },
            Item::File {
                monitor: None,
                path: "/missing".into(),
                open_with: None,
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert_eq!(outcome.failures.len(), 1);
        assert_eq!(outcome.failures[0].0, "/missing");
        assert_eq!(outcome.failures[0].1, "simulated path failure");
    }

    #[test]
    fn all_path_failures_returns_error() {
        let mut opener = MockOpener::new();
        opener.fail_paths = vec!["/a".into(), "/b".into()];
        let tab = tab_with_items(vec![
            Item::File {
                monitor: None,
                path: "/a".into(),
                open_with: None,
            },
            Item::Folder {
                monitor: None,
                path: "/b".into(),
                open_with: None,
            },
        ]);
        match launch_tab(&tab, &opener, Uuid::nil(), None).unwrap_err() {
            AppError::Launcher { code, .. } => assert_eq!(code, "all_items_failed"),
            other => panic!("expected Launcher error, got {other:?}"),
        }
    }

    #[test]
    fn open_with_is_forwarded_per_item() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: None,
                value: "https://work".into(),
                open_with: Some("edge".into()),
                incognito: false,
            },
            Item::Url {
                monitor: None,
                value: "https://personal".into(),
                open_with: None,
                incognito: false,
            },
            Item::File {
                monitor: None,
                path: "/tmp/x.txt".into(),
                open_with: Some("code".into()),
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        let url_calls = opener.url_calls.lock().unwrap().clone();
        assert_eq!(
            url_calls,
            vec![
                ("https://work".to_string(), Some("edge".to_string())),
                ("https://personal".to_string(), None),
            ]
        );
        let path_calls = opener.path_calls.lock().unwrap().clone();
        assert_eq!(
            path_calls,
            vec![("/tmp/x.txt".to_string(), Some("code".to_string()))]
        );
    }

    #[test]
    fn dispatches_app_to_spawn_app() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![Item::App {
            monitor: None,
            name: "firefox".into(),
        }]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(
            *opener.app_calls.lock().unwrap(),
            vec!["firefox".to_string()]
        );
        assert!(opener.url_calls.lock().unwrap().is_empty());
        assert!(opener.path_calls.lock().unwrap().is_empty());
        assert!(opener.script_calls.lock().unwrap().is_empty());
    }

    #[test]
    fn dispatches_script_to_spawn_script_regardless_of_trusted() {
        // Trust gating é responsabilidade do `commands::open_tab`. Quando
        // `launch_tab` recebe um Script, executa — `trusted` é só metadata
        // para o filtro upstream.
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![
            Item::Script {
                monitor: None,
                command: "ls".into(),
                trusted: false,
            },
            Item::Script {
                monitor: None,
                command: "git status".into(),
                trusted: true,
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(
            *opener.script_calls.lock().unwrap(),
            vec!["ls".to_string(), "git status".to_string()]
        );
    }

    #[test]
    fn app_failure_records_name_in_outcome() {
        let mut opener = MockOpener::new();
        opener.fail_apps = vec!["nonexistent".into()];
        let tab = tab_with_items(vec![
            Item::App {
                monitor: None,
                name: "firefox".into(),
            },
            Item::App {
                monitor: None,
                name: "nonexistent".into(),
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert_eq!(outcome.failures.len(), 1);
        assert_eq!(outcome.failures[0].0, "nonexistent");
    }

    #[test]
    fn script_failure_records_command_in_outcome() {
        let mut opener = MockOpener::new();
        opener.fail_scripts = vec!["rm -rf /".into()];
        let tab = tab_with_items(vec![Item::Script {
            monitor: None,
            command: "rm -rf /".into(),
            trusted: true,
        }]);
        match launch_tab(&tab, &opener, Uuid::nil(), None).unwrap_err() {
            AppError::Launcher { code, .. } => assert_eq!(code, "all_items_failed"),
            other => panic!("expected Launcher error, got {other:?}"),
        }
    }

    #[test]
    fn windows_routing_helper_detects_lnk_extension() {
        assert!(windows_app_should_route_via_opener(
            "C:\\Start Menu\\Firefox.lnk"
        ));
        assert!(windows_app_should_route_via_opener(
            "C:\\Start Menu\\Firefox.LNK"
        ));
        assert!(windows_app_should_route_via_opener("Firefox.lnk"));
        assert!(!windows_app_should_route_via_opener(
            "C:\\Program Files\\Firefox\\firefox.exe"
        ));
        assert!(!windows_app_should_route_via_opener("firefox"));
        assert!(!windows_app_should_route_via_opener(""));
    }

    #[test]
    fn opens_full_mix_of_all_five_kinds() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: None,
                value: "https://a".into(),
                open_with: None,
                incognito: false,
            },
            Item::File {
                monitor: None,
                path: "/tmp/x".into(),
                open_with: None,
            },
            Item::Folder {
                monitor: None,
                path: "/tmp".into(),
                open_with: None,
            },
            Item::App {
                monitor: None,
                name: "code".into(),
            },
            Item::Script {
                monitor: None,
                command: "git pull".into(),
                trusted: true,
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(outcome.total, 5);
        assert_eq!(opener.url_calls.lock().unwrap().len(), 1);
        assert_eq!(opener.path_calls.lock().unwrap().len(), 2);
        assert_eq!(opener.app_calls.lock().unwrap().len(), 1);
        assert_eq!(opener.script_calls.lock().unwrap().len(), 1);
    }

    // ---------- Plano 19: ScriptCaptureExecutor routing ----------

    struct MockCaptureExecutor {
        calls: Mutex<Vec<(Uuid, Uuid, usize, String)>>,
        fail_commands: Vec<String>,
    }

    impl MockCaptureExecutor {
        fn new() -> Self {
            Self {
                calls: Mutex::new(vec![]),
                fail_commands: vec![],
            }
        }
    }

    impl ScriptCaptureExecutor for MockCaptureExecutor {
        fn execute_script(
            &self,
            profile_id: Uuid,
            tab_id: Uuid,
            item_index: usize,
            command: &str,
        ) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push((profile_id, tab_id, item_index, command.to_string()));
            if self.fail_commands.iter().any(|c| c == command) {
                Err("simulated capture failure".into())
            } else {
                Ok(())
            }
        }
    }

    #[test]
    fn script_capture_executor_handles_scripts_when_enabled() {
        let opener = MockOpener::new();
        let executor = MockCaptureExecutor::new();
        let profile_id = Uuid::new_v4();
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: None,
                value: "https://a".into(),
                open_with: None,
                incognito: false,
            },
            Item::Script {
                monitor: None,
                command: "ls".into(),
                trusted: true,
            },
            Item::Script {
                monitor: None,
                command: "git status".into(),
                trusted: true,
            },
        ]);
        let outcome = launch_tab(&tab, &opener, profile_id, Some(&executor)).unwrap();
        assert!(outcome.failures.is_empty());
        // Scripts foram pra captura, NÃO pro opener.spawn_script.
        assert!(opener.script_calls.lock().unwrap().is_empty());
        let captured = executor.calls.lock().unwrap();
        assert_eq!(captured.len(), 2);
        assert_eq!(captured[0].0, profile_id);
        assert_eq!(captured[0].1, tab.id);
        assert_eq!(captured[0].2, 1); // item_index do primeiro Script
        assert_eq!(captured[0].3, "ls");
        assert_eq!(captured[1].2, 2);
        assert_eq!(captured[1].3, "git status");
    }

    #[test]
    fn script_capture_disabled_falls_back_to_opener_spawn_script() {
        let opener = MockOpener::new();
        let executor = MockCaptureExecutor::new();
        let tab = tab_with_items(vec![Item::Script {
            monitor: None,
            command: "ls".into(),
            trusted: true,
        }]);
        // `None` desliga captura — script vai pro fire-and-forget legacy.
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(*opener.script_calls.lock().unwrap(), vec!["ls".to_string()]);
        assert!(executor.calls.lock().unwrap().is_empty());
    }

    #[test]
    fn script_capture_failure_records_command_in_outcome() {
        let opener = MockOpener::new();
        let mut executor = MockCaptureExecutor::new();
        executor.fail_commands = vec!["bad-cmd".into()];
        let tab = tab_with_items(vec![
            Item::Script {
                monitor: None,
                command: "good".into(),
                trusted: true,
            },
            Item::Script {
                monitor: None,
                command: "bad-cmd".into(),
                trusted: true,
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), Some(&executor)).unwrap();
        assert_eq!(outcome.failures.len(), 1);
        assert_eq!(outcome.failures[0].0, "bad-cmd");
    }

    #[test]
    fn script_capture_does_not_intercept_non_script_items() {
        let opener = MockOpener::new();
        let executor = MockCaptureExecutor::new();
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: None,
                value: "https://a".into(),
                open_with: None,
                incognito: false,
            },
            Item::App {
                monitor: None,
                name: "firefox".into(),
            },
            Item::File {
                monitor: None,
                path: "/tmp/x".into(),
                open_with: None,
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), Some(&executor)).unwrap();
        assert!(outcome.failures.is_empty());
        assert!(executor.calls.lock().unwrap().is_empty());
        assert_eq!(opener.url_calls.lock().unwrap().len(), 1);
        assert_eq!(opener.app_calls.lock().unwrap().len(), 1);
        assert_eq!(opener.path_calls.lock().unwrap().len(), 1);
    }

    // ---------- Plano 21: cursor warp pre-launch ----------

    #[test]
    fn no_warp_when_item_has_no_monitor() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: None,
                value: "https://a".into(),
                open_with: None,
                incognito: false,
            },
            Item::App {
                monitor: None,
                name: "firefox".into(),
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        assert!(opener.warp_calls.lock().unwrap().is_empty());
    }

    #[test]
    fn warp_called_per_item_with_monitor_set() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: Some(0),
                value: "https://a".into(),
                open_with: None,
                incognito: false,
            },
            Item::Url {
                monitor: None,
                value: "https://b".into(),
                open_with: None,
                incognito: false,
            },
            Item::Url {
                monitor: Some(1),
                value: "https://c".into(),
                open_with: None,
                incognito: false,
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        // Apenas os items 0 e 2 dispararam warp; ordem preservada.
        assert_eq!(*opener.warp_calls.lock().unwrap(), vec![0, 1]);
    }

    #[test]
    fn warp_called_for_all_kinds_with_monitor() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: Some(2),
                value: "https://a".into(),
                open_with: None,
                incognito: false,
            },
            Item::File {
                monitor: Some(1),
                path: "/tmp/x".into(),
                open_with: None,
            },
            Item::Folder {
                monitor: Some(0),
                path: "/tmp".into(),
                open_with: None,
            },
            Item::App {
                monitor: Some(1),
                name: "code".into(),
            },
            Item::Script {
                monitor: Some(0),
                command: "git pull".into(),
                trusted: true,
            },
        ]);
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(*opener.warp_calls.lock().unwrap(), vec![2, 1, 0, 1, 0]);
    }

    #[test]
    fn warp_failure_does_not_abort_launch() {
        let mut opener = MockOpener::new();
        opener.fail_warps = vec![1];
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: Some(1),
                value: "https://a".into(),
                open_with: None,
                incognito: false,
            },
            Item::Url {
                monitor: None,
                value: "https://b".into(),
                open_with: None,
                incognito: false,
            },
        ]);
        // Warp failure não impede open_url de rodar — best-effort.
        let outcome = launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(opener.url_calls.lock().unwrap().len(), 2);
        assert_eq!(*opener.warp_calls.lock().unwrap(), vec![1]);
    }

    #[test]
    fn warp_happens_before_open_for_same_item() {
        // Ordem das chamadas: warp(idx=2) → open_url; warp(idx=0) → open_path.
        // Mock não preserva ordem entre métodos diferentes, mas total counts e
        // sequência interna de cada Vec confirmam pareamento por iteração.
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![
            Item::Url {
                monitor: Some(2),
                value: "https://a".into(),
                open_with: None,
                incognito: false,
            },
            Item::File {
                monitor: Some(0),
                path: "/tmp/x".into(),
                open_with: None,
            },
        ]);
        launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        // Warps na ordem dos items.
        assert_eq!(*opener.warp_calls.lock().unwrap(), vec![2, 0]);
        // Opens nas suas respectivas filas, na ordem dos items.
        assert_eq!(opener.url_calls.lock().unwrap().len(), 1);
        assert_eq!(opener.path_calls.lock().unwrap().len(), 1);
    }

    // ---- Issue: incognito ----

    #[test]
    fn browser_flag_chromium_likes_use_incognito() {
        for b in ["chrome.exe", "Chrome", "Brave", "vivaldi", "Chromium"] {
            assert_eq!(browser_incognito_flag(b), Some("--incognito"));
        }
    }

    #[test]
    fn browser_flag_firefox_likes_use_private_window() {
        for b in ["firefox", "Firefox", "librewolf", "Waterfox", "Zen Browser"] {
            assert_eq!(browser_incognito_flag(b), Some("-private-window"));
        }
    }

    #[test]
    fn browser_flag_edge_uses_inprivate() {
        for b in ["msedge.exe", "Microsoft Edge"] {
            assert_eq!(browser_incognito_flag(b), Some("--inprivate"));
        }
    }

    #[test]
    fn browser_flag_opera_uses_private() {
        assert_eq!(browser_incognito_flag("Opera"), Some("--private"));
    }

    #[test]
    fn browser_flag_unknown_returns_none() {
        assert_eq!(browser_incognito_flag("Safari"), None);
        assert_eq!(browser_incognito_flag(""), None);
        assert_eq!(browser_incognito_flag("Notepad"), None);
    }

    #[test]
    fn launcher_routes_incognito_url_to_dedicated_method() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![Item::Url {
            monitor: None,
            value: "https://example.com".into(),
            open_with: Some("Firefox".into()),
            incognito: true,
        }]);
        launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        // open_url normal NÃO foi chamado; open_url_incognito sim.
        assert!(opener.url_calls.lock().unwrap().is_empty());
        let inc = opener.incognito_calls.lock().unwrap().clone();
        assert_eq!(
            inc,
            vec![("https://example.com".into(), Some("Firefox".into()))]
        );
    }

    #[test]
    fn launcher_uses_normal_open_when_incognito_false() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![Item::Url {
            monitor: None,
            value: "https://example.com".into(),
            open_with: Some("Firefox".into()),
            incognito: false,
        }]);
        launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        // open_url chamado; incognito não.
        assert_eq!(opener.url_calls.lock().unwrap().len(), 1);
        assert!(opener.incognito_calls.lock().unwrap().is_empty());
    }

    #[test]
    fn incognito_without_open_with_uses_detected_browser() {
        // Mock injeta "Firefox" como default detectado. Launcher deve rotar
        // pra `open_url_incognito("...", "Firefox")` sem chamar `open_url`.
        let opener = MockOpener::new().with_detected("Firefox");
        let tab = tab_with_items(vec![Item::Url {
            monitor: None,
            value: "https://example.com".into(),
            open_with: None,
            incognito: true,
        }]);
        launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert!(opener.url_calls.lock().unwrap().is_empty());
        let inc = opener.incognito_calls.lock().unwrap().clone();
        assert_eq!(
            inc,
            vec![("https://example.com".into(), Some("Firefox".into()))]
        );
    }

    #[test]
    fn incognito_without_open_with_falls_back_when_no_default_detected() {
        // Mock sem `detected_browser`. Launcher cai pro `open_url(None)`
        // (modo normal) em vez de explodir. `open_url_incognito` não é
        // chamado quando não há browser pra passar.
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![Item::Url {
            monitor: None,
            value: "https://example.com".into(),
            open_with: None,
            incognito: true,
        }]);
        launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        assert_eq!(
            opener.url_calls.lock().unwrap().clone(),
            vec![("https://example.com".into(), None)]
        );
        assert!(opener.incognito_calls.lock().unwrap().is_empty());
    }

    #[test]
    fn incognito_explicit_open_with_skips_default_detection() {
        // Quando `open_with` é explícito, detected_browser não importa —
        // o explícito ganha. Detected vazio mesmo com Firefox setado.
        let opener = MockOpener::new().with_detected("ShouldNotBeUsed");
        let tab = tab_with_items(vec![Item::Url {
            monitor: None,
            value: "https://example.com".into(),
            open_with: Some("Chrome".into()),
            incognito: true,
        }]);
        launch_tab(&tab, &opener, Uuid::nil(), None).unwrap();
        let inc = opener.incognito_calls.lock().unwrap().clone();
        assert_eq!(
            inc,
            vec![("https://example.com".into(), Some("Chrome".into()))]
        );
    }
}
