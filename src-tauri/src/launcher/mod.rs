use crate::config::schema::{Item, Tab};
use crate::errors::{AppError, AppResult};

pub trait Opener: Send + Sync {
    fn open_url(&self, url: &str) -> Result<(), String>;
}

/// Resultado da tentativa de abrir uma aba: lista de erros por item.
/// Se estiver vazio, tudo deu certo.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct LaunchOutcome {
    pub failures: Vec<(String, String)>,
    pub total: usize,
}

pub fn launch_tab(tab: &Tab, opener: &dyn Opener) -> AppResult<LaunchOutcome> {
    let mut outcome = LaunchOutcome { total: tab.items.len(), ..Default::default() };
    for item in &tab.items {
        match item {
            Item::Url { value } => {
                if let Err(e) = opener.open_url(value) {
                    outcome.failures.push((value.clone(), e));
                }
            }
        }
    }
    if outcome.failures.len() == outcome.total && outcome.total > 0 {
        return Err(AppError::Launcher(format!(
            "todos os {} items falharam", outcome.total
        )));
    }
    Ok(outcome)
}

pub struct TauriOpener<'a, R: tauri::Runtime> {
    app: &'a tauri::AppHandle<R>,
}

impl<'a, R: tauri::Runtime> TauriOpener<'a, R> {
    pub fn new(app: &'a tauri::AppHandle<R>) -> Self { Self { app } }
}

impl<'a, R: tauri::Runtime> Opener for TauriOpener<'a, R> {
    fn open_url(&self, url: &str) -> Result<(), String> {
        use tauri_plugin_opener::OpenerExt;
        self.app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::schema::{OpenMode, Item, Tab};
    use std::sync::Mutex;
    use uuid::Uuid;

    struct MockOpener {
        calls: Mutex<Vec<String>>,
        fail_on: Vec<String>,
    }

    impl Opener for MockOpener {
        fn open_url(&self, url: &str) -> Result<(), String> {
            self.calls.lock().unwrap().push(url.to_string());
            if self.fail_on.iter().any(|f| f == url) {
                Err("simulated".into())
            } else {
                Ok(())
            }
        }
    }

    fn tab_with(urls: &[&str]) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: Some("t".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: urls.iter().map(|u| Item::Url { value: (*u).into() }).collect(),
        }
    }

    #[test]
    fn opens_all_urls_in_order() {
        let opener = MockOpener { calls: Mutex::new(vec![]), fail_on: vec![] };
        let tab = tab_with(&["https://a", "https://b", "https://c"]);
        let outcome = launch_tab(&tab, &opener).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(outcome.total, 3);
        assert_eq!(*opener.calls.lock().unwrap(), vec!["https://a", "https://b", "https://c"]);
    }

    #[test]
    fn continues_after_individual_failure() {
        let opener = MockOpener {
            calls: Mutex::new(vec![]),
            fail_on: vec!["https://b".into()],
        };
        let tab = tab_with(&["https://a", "https://b", "https://c"]);
        let outcome = launch_tab(&tab, &opener).unwrap();
        assert_eq!(outcome.failures.len(), 1);
        assert_eq!(outcome.failures[0].0, "https://b");
        assert_eq!(opener.calls.lock().unwrap().len(), 3);
    }

    #[test]
    fn total_failure_returns_error() {
        let opener = MockOpener {
            calls: Mutex::new(vec![]),
            fail_on: vec!["https://a".into(), "https://b".into()],
        };
        let tab = tab_with(&["https://a", "https://b"]);
        assert!(launch_tab(&tab, &opener).is_err());
    }

    #[test]
    fn empty_tab_is_ok() {
        let opener = MockOpener { calls: Mutex::new(vec![]), fail_on: vec![] };
        let tab = tab_with(&[]);
        let outcome = launch_tab(&tab, &opener).unwrap();
        assert_eq!(outcome.total, 0);
    }
}
