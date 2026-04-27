use crate::config::schema::{Item, Tab};
use crate::errors::{AppError, AppResult};

pub trait Opener: Send + Sync {
    /// `with` is the optional handler/program (e.g. `"firefox"`, `"code"`).
    /// `None` defers to the OS default. The string is forwarded as-is to
    /// `tauri-plugin-opener` — semantics depend on the OS:
    ///   * Windows: executable on PATH or absolute `.exe` path
    ///   * macOS: `.app` bundle name (e.g. `"Firefox"`)
    ///   * Linux: program name on PATH
    fn open_url(&self, url: &str, with: Option<&str>) -> Result<(), String>;
    fn open_path(&self, path: &str, with: Option<&str>) -> Result<(), String>;
}

/// Resultado da tentativa de abrir uma aba: lista de erros por item.
/// Se estiver vazio, tudo deu certo.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct LaunchOutcome {
    pub failures: Vec<(String, String)>,
    pub total: usize,
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::schema::{Item, OpenMode, Tab};
    use std::sync::Mutex;
    use uuid::Uuid;

    type Call = (String, Option<String>);

    struct MockOpener {
        url_calls: Mutex<Vec<Call>>,
        path_calls: Mutex<Vec<Call>>,
        fail_urls: Vec<String>,
        fail_paths: Vec<String>,
    }

    impl MockOpener {
        fn new() -> Self {
            Self {
                url_calls: Mutex::new(vec![]),
                path_calls: Mutex::new(vec![]),
                fail_urls: vec![],
                fail_paths: vec![],
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
}
