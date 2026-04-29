use crate::config::schema::{Item, Tab};
use crate::errors::{AppError, AppResult};

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
pub fn windows_app_should_route_via_opener(name: &str) -> bool {
    name.to_lowercase().ends_with(".lnk")
}

pub fn launch_tab(tab: &Tab, opener: &dyn Opener) -> AppResult<LaunchOutcome> {
    let mut outcome = LaunchOutcome {
        total: tab.items.len(),
        ..Default::default()
    };
    for item in &tab.items {
        match item {
            Item::Url { value, open_with } => {
                if let Err(e) = opener.open_url(value, open_with.as_deref()) {
                    outcome.failures.push((value.clone(), e));
                }
            }
            Item::File { path, open_with } | Item::Folder { path, open_with } => {
                if let Err(e) = opener.open_path(path, open_with.as_deref()) {
                    outcome.failures.push((path.clone(), e));
                }
            }
            Item::App { name } => {
                if let Err(e) = opener.spawn_app(name) {
                    outcome.failures.push((name.clone(), e));
                }
            }
            Item::Script { command, .. } => {
                if let Err(e) = opener.spawn_script(command) {
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
        fail_urls: Vec<String>,
        fail_paths: Vec<String>,
        fail_apps: Vec<String>,
        fail_scripts: Vec<String>,
    }

    impl MockOpener {
        fn new() -> Self {
            Self {
                url_calls: Mutex::new(vec![]),
                path_calls: Mutex::new(vec![]),
                app_calls: Mutex::new(vec![]),
                script_calls: Mutex::new(vec![]),
                fail_urls: vec![],
                fail_paths: vec![],
                fail_apps: vec![],
                fail_scripts: vec![],
            }
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
        let outcome = launch_tab(&tab, &opener).unwrap();
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
        let outcome = launch_tab(&tab, &opener).unwrap();
        assert_eq!(outcome.failures.len(), 1);
        assert_eq!(outcome.failures[0].0, "https://b");
        assert_eq!(opener.url_calls.lock().unwrap().len(), 3);
    }

    #[test]
    fn total_failure_returns_error() {
        let mut opener = MockOpener::new();
        opener.fail_urls = vec!["https://a".into(), "https://b".into()];
        let tab = tab_url(&["https://a", "https://b"]);
        match launch_tab(&tab, &opener).unwrap_err() {
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
        let outcome = launch_tab(&tab, &opener).unwrap();
        assert_eq!(outcome.total, 0);
    }

    #[test]
    fn opens_mixed_url_file_folder_items() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![
            Item::Url {
                value: "https://a".into(),
                open_with: None,
            },
            Item::File {
                path: "/tmp/x.txt".into(),
                open_with: None,
            },
            Item::Folder {
                path: "/tmp".into(),
                open_with: None,
            },
        ]);
        let outcome = launch_tab(&tab, &opener).unwrap();
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
                value: "https://a".into(),
                open_with: None,
            },
            Item::File {
                path: "/missing".into(),
                open_with: None,
            },
        ]);
        let outcome = launch_tab(&tab, &opener).unwrap();
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
                path: "/a".into(),
                open_with: None,
            },
            Item::Folder {
                path: "/b".into(),
                open_with: None,
            },
        ]);
        match launch_tab(&tab, &opener).unwrap_err() {
            AppError::Launcher { code, .. } => assert_eq!(code, "all_items_failed"),
            other => panic!("expected Launcher error, got {other:?}"),
        }
    }

    #[test]
    fn open_with_is_forwarded_per_item() {
        let opener = MockOpener::new();
        let tab = tab_with_items(vec![
            Item::Url {
                value: "https://work".into(),
                open_with: Some("edge".into()),
            },
            Item::Url {
                value: "https://personal".into(),
                open_with: None,
            },
            Item::File {
                path: "/tmp/x.txt".into(),
                open_with: Some("code".into()),
            },
        ]);
        let outcome = launch_tab(&tab, &opener).unwrap();
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
            name: "firefox".into(),
        }]);
        let outcome = launch_tab(&tab, &opener).unwrap();
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
                command: "ls".into(),
                trusted: false,
            },
            Item::Script {
                command: "git status".into(),
                trusted: true,
            },
        ]);
        let outcome = launch_tab(&tab, &opener).unwrap();
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
                name: "firefox".into(),
            },
            Item::App {
                name: "nonexistent".into(),
            },
        ]);
        let outcome = launch_tab(&tab, &opener).unwrap();
        assert_eq!(outcome.failures.len(), 1);
        assert_eq!(outcome.failures[0].0, "nonexistent");
    }

    #[test]
    fn script_failure_records_command_in_outcome() {
        let mut opener = MockOpener::new();
        opener.fail_scripts = vec!["rm -rf /".into()];
        let tab = tab_with_items(vec![Item::Script {
            command: "rm -rf /".into(),
            trusted: true,
        }]);
        match launch_tab(&tab, &opener).unwrap_err() {
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
                value: "https://a".into(),
                open_with: None,
            },
            Item::File {
                path: "/tmp/x".into(),
                open_with: None,
            },
            Item::Folder {
                path: "/tmp".into(),
                open_with: None,
            },
            Item::App {
                name: "code".into(),
            },
            Item::Script {
                command: "git pull".into(),
                trusted: true,
            },
        ]);
        let outcome = launch_tab(&tab, &opener).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(outcome.total, 5);
        assert_eq!(opener.url_calls.lock().unwrap().len(), 1);
        assert_eq!(opener.path_calls.lock().unwrap().len(), 2);
        assert_eq!(opener.app_calls.lock().unwrap().len(), 1);
        assert_eq!(opener.script_calls.lock().unwrap().len(), 1);
    }
}
