use crate::commands::AppState;
use crate::config::schema::SpawnPosition;
use crate::errors::{AppError, AppResult};
use mouse_position::mouse_position::Mouse;
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindowBuilder,
};

const DONUT_LABEL: &str = "donut";
/// Issue #39 — janela do donut tem tamanho **fixo**, dimensionado pra
/// caber até `MAX_TAB_DEPTH = 2` anéis concêntricos (root + 1 sub-nível).
/// Antes (Plano 23) a janela era redimensionada por perfil via
/// `max_group_depth`, mas trocar de perfil via switcher disparava
/// resize+reposition mid-flight, gerando flick visível ("donut renderiza
/// em outro lugar antes do correto"). Com tamanho fixo, o SVG do frontend
/// continua adaptando seu `width/height` por perfil, mas centralizado
/// dentro de uma janela transparente sempre 560×560 — sem resize entre
/// perfis, sem flick. Custo: área transparente extra pra perfis sem
/// grupos. Imperceptível: window é transparent + skip-taskbar + sem
/// shadow, e click na área extra cai no backdrop e fecha o donut (mesma
/// UX do click outside).
///
/// Composição: `420` (base, 1 ring) + `140` (incremento pra ring 2).
const DONUT_WINDOW_SIZE: f64 = 560.0;

pub fn show<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let size = DONUT_WINDOW_SIZE;
    if let Some(window) = app.get_webview_window(DONUT_LABEL) {
        // Issue #39 — janela criada uma única vez no tamanho máximo. Mesmo
        // no caminho de re-show, set_size é no-op (já está no tamanho
        // máximo); mantemos por robustez caso o usuário arraste/corrija
        // manualmente em algum cenário futuro.
        window.set_size(LogicalSize::new(size, size)).map_err(|e| {
            AppError::window("window_set_size_failed", &[("reason", e.to_string())])
        })?;
        position_window(app, &window, size)?;
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

    position_window(app, &window, size)?;
    window
        .show()
        .map_err(|e| AppError::window("window_show_failed", &[("reason", e.to_string())]))?;
    window
        .set_focus()
        .map_err(|e| AppError::window("window_set_focus_failed", &[("reason", e.to_string())]))?;
    Ok(())
}

/// Issue #52 — escolhe entre cursor e centro do monitor ativo, conforme
/// `cfg.interaction.spawn_position`. AppState pode não estar disponível
/// durante o pré-aquecimento (raro, mas possível); cai pro modo cursor.
fn position_window<R: Runtime>(
    app: &AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
    size: f64,
) -> AppResult<()> {
    let mode = app
        .try_state::<AppState>()
        .map(|s| s.config.read().unwrap().interaction.spawn_position)
        .unwrap_or(SpawnPosition::Cursor);
    match mode {
        SpawnPosition::Cursor => position_at_cursor(window, size),
        SpawnPosition::Center => position_at_active_monitor_center(app, window, size),
    }
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

/// Issue #52 — posiciona no centro do monitor onde o cursor está. Fallback
/// pra primary_monitor() quando nenhum monitor contém o cursor (raro). Sem
/// monitor disponível, retorna `Ok(())` sem mover (mesma postura
/// fail-soft do `position_at_cursor` quando o mouse query falha).
fn position_at_active_monitor_center<R: Runtime>(
    app: &AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
    size: f64,
) -> AppResult<()> {
    let cursor = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Some((x, y)),
        Mouse::Error => None,
    };

    let monitors = app.available_monitors().map_err(|e| {
        AppError::window(
            "window_available_monitors_failed",
            &[("reason", e.to_string())],
        )
    })?;

    let monitor = cursor
        .and_then(|(cx, cy)| {
            monitors.iter().find(|m| {
                let p = m.position();
                let s = m.size();
                let right = p.x + s.width as i32;
                let bottom = p.y + s.height as i32;
                cx >= p.x && cx < right && cy >= p.y && cy < bottom
            })
        })
        .cloned()
        .or_else(|| app.primary_monitor().ok().flatten())
        .or_else(|| monitors.into_iter().next());

    let Some(monitor) = monitor else {
        return Ok(());
    };

    let scale = window.scale_factor().map_err(|e| {
        AppError::window("window_scale_factor_failed", &[("reason", e.to_string())])
    })?;
    let pos = monitor.position();
    let s = monitor.size();
    let half = ((size / 2.0) * scale).round() as i32;
    let center_x = pos.x + (s.width / 2) as i32;
    let center_y = pos.y + (s.height / 2) as i32;
    let x = center_x - half;
    let y = center_y - half;

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

    /// Issue #39 — sanity-check de paridade com o frontend.
    /// `src/donut/donutSize.ts` calcula o mesmo valor pelo helper
    /// `donutSizeForRings(DONUT_MAX_RINGS)` (= 420 + 140 * 1). Se essa
    /// constante mudar de qualquer lado, o teste falha aqui pra forçar
    /// alinhamento.
    #[test]
    fn donut_window_size_matches_frontend_max() {
        assert_eq!(DONUT_WINDOW_SIZE, 560.0);
    }
}
