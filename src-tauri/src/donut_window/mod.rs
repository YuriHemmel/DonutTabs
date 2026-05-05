use crate::commands::AppState;
use crate::config::schema::{Tab, TabKind};
use crate::errors::{AppError, AppResult};
use mouse_position::mouse_position::Mouse;
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindowBuilder,
};

const DONUT_LABEL: &str = "donut";
/// Plano 23 — tamanho base do donut (1 ring = root). Cresce em incrementos
/// de `RING_SIZE_INCREMENT` por nível adicional de grupo aninhado.
const BASE_DONUT_SIZE: f64 = 420.0;
const RING_SIZE_INCREMENT: f64 = 140.0;
/// Plano 23 — limite alinhado a `MAX_TAB_DEPTH = 3` em `validate.rs`.
/// Donut renderiza no máximo 3 anéis concêntricos.
const MAX_DONUT_RINGS: usize = 3;

/// Plano 23 — descobre a profundidade máxima de grupos aninhados na árvore
/// de tabs do perfil ativo. Pure, testável. Retorna 1 quando não há grupos
/// (1 ring = root). Cada nível adicional drillável adiciona 1.
pub fn max_group_depth(tabs: &[Tab]) -> usize {
    let mut max = 1;
    for tab in tabs {
        if matches!(tab.kind, TabKind::Group) {
            let child = 1 + max_group_depth(&tab.children);
            if child > max {
                max = child;
            }
        }
    }
    max
}

/// Plano 23 — tamanho da janela em logical pixels para `rings` anéis.
/// Pure, testável. Clamped em `[BASE_DONUT_SIZE, BASE_DONUT_SIZE + (MAX-1)*INCREMENT]`.
pub fn donut_size_for_rings(rings: usize) -> f64 {
    let clamped = rings.clamp(1, MAX_DONUT_RINGS);
    BASE_DONUT_SIZE + RING_SIZE_INCREMENT * (clamped.saturating_sub(1) as f64)
}

fn current_donut_size<R: Runtime>(app: &AppHandle<R>) -> f64 {
    let state: tauri::State<'_, AppState> = app.state();
    let cfg = state.config.read().unwrap();
    let depth = cfg
        .profiles
        .iter()
        .find(|p| p.id == cfg.active_profile_id)
        .map(|p| max_group_depth(&p.tabs))
        .unwrap_or(1);
    donut_size_for_rings(depth)
}

pub fn show<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let size = current_donut_size(app);
    if let Some(window) = app.get_webview_window(DONUT_LABEL) {
        // Plano 23 — perfil pode ter ganhado/perdido grupos desde o último
        // show (config-changed). Re-aplica o tamanho antes de posicionar
        // para que o anel externo tenha espaço, e antes de tornar visível
        // para evitar reflow visível.
        window.set_size(LogicalSize::new(size, size)).map_err(|e| {
            AppError::window("window_set_size_failed", &[("reason", e.to_string())])
        })?;
        position_at_cursor(&window, size)?;
        window
            .show()
            .map_err(|e| AppError::window("window_show_failed", &[("reason", e.to_string())]))?;
        window.set_focus().map_err(|e| {
            AppError::window("window_set_focus_failed", &[("reason", e.to_string())])
        })?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(app, DONUT_LABEL, WebviewUrl::App("donut.html".into()))
        .title("DonutTabs")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .inner_size(size, size)
        .visible(false)
        .shadow(false)
        .build()
        .map_err(|e| AppError::window("window_build_failed", &[("reason", e.to_string())]))?;

    position_at_cursor(&window, size)?;
    window
        .show()
        .map_err(|e| AppError::window("window_show_failed", &[("reason", e.to_string())]))?;
    window
        .set_focus()
        .map_err(|e| AppError::window("window_set_focus_failed", &[("reason", e.to_string())]))?;
    Ok(())
}

fn position_at_cursor<R: Runtime>(window: &tauri::WebviewWindow<R>, size: f64) -> AppResult<()> {
    let pos = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => (x as f64, y as f64),
        Mouse::Error => return Ok(()),
    };

    let scale = window.scale_factor().map_err(|e| {
        AppError::window("window_scale_factor_failed", &[("reason", e.to_string())])
    })?;
    let half = (size / 2.0) * scale;
    let x = (pos.0 - half).round() as i32;
    let y = (pos.1 - half).round() as i32;

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| {
            AppError::window("window_set_position_failed", &[("reason", e.to_string())])
        })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::schema::{Item, OpenMode, Tab, TabKind};
    use uuid::Uuid;

    fn leaf(name: &str) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: Some(name.into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![Item::Url {
                monitor: None,
                value: "https://x".into(),
                open_with: None,
            }],
            kind: TabKind::Leaf,
            children: vec![],
        }
    }

    fn group(name: &str, children: Vec<Tab>) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: Some(name.into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![],
            kind: TabKind::Group,
            children,
        }
    }

    #[test]
    fn max_group_depth_empty_returns_one() {
        assert_eq!(max_group_depth(&[]), 1);
    }

    #[test]
    fn max_group_depth_only_leaves_returns_one() {
        let tabs = vec![leaf("a"), leaf("b"), leaf("c")];
        assert_eq!(max_group_depth(&tabs), 1);
    }

    #[test]
    fn max_group_depth_one_level_of_groups_returns_two() {
        let tabs = vec![leaf("a"), group("g", vec![leaf("g1")])];
        assert_eq!(max_group_depth(&tabs), 2);
    }

    #[test]
    fn max_group_depth_two_levels_of_nested_groups_returns_three() {
        let tabs = vec![group("g1", vec![group("g2", vec![leaf("leaf")])])];
        assert_eq!(max_group_depth(&tabs), 3);
    }

    #[test]
    fn max_group_depth_picks_deepest_branch() {
        // Tree mistura ramos rasos e profundos — deve retornar o maior.
        let tabs = vec![
            leaf("shallow"),
            group("g1", vec![leaf("g1l")]),
            group("deep", vec![group("inner", vec![leaf("l")])]),
        ];
        assert_eq!(max_group_depth(&tabs), 3);
    }

    #[test]
    fn max_group_depth_empty_group_counts_as_two() {
        // Group vazio é drillável (sub-donut mostra "+"), conta como nível.
        let tabs = vec![group("empty", vec![])];
        assert_eq!(max_group_depth(&tabs), 2);
    }

    #[test]
    fn donut_size_for_rings_clamps_lower() {
        assert_eq!(donut_size_for_rings(0), BASE_DONUT_SIZE);
        assert_eq!(donut_size_for_rings(1), BASE_DONUT_SIZE);
    }

    #[test]
    fn donut_size_for_rings_grows_per_increment() {
        assert_eq!(
            donut_size_for_rings(2),
            BASE_DONUT_SIZE + RING_SIZE_INCREMENT
        );
        assert_eq!(
            donut_size_for_rings(3),
            BASE_DONUT_SIZE + 2.0 * RING_SIZE_INCREMENT
        );
    }

    #[test]
    fn donut_size_for_rings_clamps_upper() {
        // MAX = 3. Pedidos acima viram size de 3.
        let max_size = donut_size_for_rings(MAX_DONUT_RINGS);
        assert_eq!(donut_size_for_rings(4), max_size);
        assert_eq!(donut_size_for_rings(100), max_size);
    }
}
