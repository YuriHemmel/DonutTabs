use crate::donut_window;
use crate::errors::{AppError, AppResult};
use crate::settings_window;
use crate::updater::UpdateSummary;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Runtime,
};

const TRAY_ID: &str = "main";
pub(crate) const UPDATE_MENU_ITEM_ID: &str = "open_update";

pub fn setup<R: Runtime>(app: &tauri::App<R>) -> AppResult<()> {
    let menu = build_menu(app, None)?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("DonutTabs")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open_donut" => {
                let _ = donut_window::show(app);
            }
            "open_settings" => {
                let _ = settings_window::show(app);
            }
            id if id == UPDATE_MENU_ITEM_ID => {
                // Click no item dinâmico abre Settings — o `<UpdateCard>`
                // já mostra banner + botão "Instalar e reiniciar".
                let _ = settings_window::show(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)
        .map_err(|e| AppError::window("tray_build_failed", &[("reason", e.to_string())]))?;

    Ok(())
}

/// Plano 18 — rebuild do menu pra refletir mudança em `pending_update`.
/// Quando `summary` é `Some`, insere "📥 Atualizar para vX.Y.Z" antes do
/// "Sair"; `None` reverte ao menu padrão. Idempotente.
pub fn rebuild_with_pending_update<R: Runtime>(
    handle: &AppHandle<R>,
    summary: Option<&UpdateSummary>,
) -> AppResult<()> {
    let menu = build_menu(handle, summary)?;
    let tray = handle
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| AppError::window("tray_not_found", &[("id", TRAY_ID.into())]))?;
    tray.set_menu(Some(menu))
        .map_err(|e| AppError::window("tray_set_menu_failed", &[("reason", e.to_string())]))?;
    Ok(())
}

#[cfg(test)]
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TrayItemSpec {
    pub id: &'static str,
    pub label: String,
}

/// Helper puro pra inspeção em testes — descreve o conjunto/ordem dos
/// itens do menu sem precisar instanciar o tray real do Tauri (que
/// requer um `App` rodando).
#[cfg(test)]
pub(crate) fn tray_item_specs(summary: Option<&UpdateSummary>) -> Vec<TrayItemSpec> {
    let mut items = vec![
        TrayItemSpec {
            id: "open_donut",
            label: "Abrir donut".into(),
        },
        TrayItemSpec {
            id: "open_settings",
            label: "Configurações".into(),
        },
    ];
    if let Some(s) = summary {
        items.push(TrayItemSpec {
            id: UPDATE_MENU_ITEM_ID,
            label: format!("📥 Atualizar para v{}", s.version),
        });
    }
    items.push(TrayItemSpec {
        id: "quit",
        label: "Sair".into(),
    });
    items
}

fn build_menu<R: Runtime, M: tauri::Manager<R>>(
    app: &M,
    summary: Option<&UpdateSummary>,
) -> AppResult<Menu<R>> {
    let open = MenuItem::with_id(app, "open_donut", "Abrir donut", true, None::<&str>)
        .map_err(|e| AppError::window("tray_menu_item_failed", &[("reason", e.to_string())]))?;
    let settings = MenuItem::with_id(app, "open_settings", "Configurações", true, None::<&str>)
        .map_err(|e| AppError::window("tray_menu_item_failed", &[("reason", e.to_string())]))?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)
        .map_err(|e| AppError::window("tray_menu_item_failed", &[("reason", e.to_string())]))?;

    let menu = if let Some(s) = summary {
        let label = format!("📥 Atualizar para v{}", s.version);
        let update_item = MenuItem::with_id(app, UPDATE_MENU_ITEM_ID, &label, true, None::<&str>)
            .map_err(|e| {
            AppError::window("tray_menu_item_failed", &[("reason", e.to_string())])
        })?;
        Menu::with_items(app, &[&open, &settings, &update_item, &quit])
    } else {
        Menu::with_items(app, &[&open, &settings, &quit])
    }
    .map_err(|e| AppError::window("tray_menu_failed", &[("reason", e.to_string())]))?;

    Ok(menu)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_item_specs_without_update_omits_update_item() {
        let items = tray_item_specs(None);
        let ids: Vec<_> = items.iter().map(|i| i.id).collect();
        assert_eq!(ids, vec!["open_donut", "open_settings", "quit"]);
    }

    #[test]
    fn tray_item_specs_with_update_inserts_before_quit() {
        let s = UpdateSummary {
            version: "0.2.0".into(),
            notes: None,
            date: None,
        };
        let items = tray_item_specs(Some(&s));
        let ids: Vec<_> = items.iter().map(|i| i.id).collect();
        assert_eq!(
            ids,
            vec!["open_donut", "open_settings", UPDATE_MENU_ITEM_ID, "quit"]
        );
        let label = items
            .iter()
            .find(|i| i.id == UPDATE_MENU_ITEM_ID)
            .unwrap()
            .label
            .clone();
        assert_eq!(label, "📥 Atualizar para v0.2.0");
    }
}
