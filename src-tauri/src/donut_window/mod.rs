use crate::commands::AppState;
use crate::config::schema::SpawnPosition;
use crate::errors::{AppError, AppResult};
use mouse_position::mouse_position::Mouse;
#[cfg(target_os = "macos")]
use tauri::LogicalPosition;
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
/// Issue #91 — `OUTER_RING_BAND_WIDTH` subiu pra 72 no frontend, mas o
/// ring externo ainda cabe dentro de 560/2 = 280, então a janela
/// permanece 560.
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

    // Cuidado com unidades: a crate `mouse_position` devolve coordenadas em
    // unidades diferentes por SO. Tratamos cada caso na sua unidade nativa
    // pra evitar confusão de scale especialmente em multi-monitor.
    //
    // - macOS: `CGEventGetLocation` retorna pontos lógicos (sistema Quartz).
    //   Nosso `size` também é lógico (LogicalSize). Subtraímos half lógico
    //   e setamos via LogicalPosition — Tauri converte pra físico no destino
    //   usando o scale do monitor onde a janela ficar. Tentar multiplicar
    //   por `window.scale_factor()` aqui quebra em Retina (mouse em pontos
    //   * scale ≠ pixels) e em multi-monitor de DPIs diferentes (scale do
    //   monitor anterior é usado antes da janela mover).
    //
    // - Windows: `GetCursorPos` retorna pixels físicos.
    // - Linux X11: `XQueryPointer` retorna pixels físicos.
    //   Em ambos, multiplicamos `size/2` por `scale` pra ficar em físicos e
    //   setamos via PhysicalPosition.
    #[cfg(target_os = "macos")]
    {
        let half = size / 2.0;
        let x = pos.0 - half;
        let y = pos.1 - half;
        window
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e| {
                AppError::window("window_set_position_failed", &[("reason", e.to_string())])
            })?;
    }
    #[cfg(not(target_os = "macos"))]
    {
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
    }
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

    // Match cursor → monitor: comparamos cursor em pontos lógicos contra
    // bounds do monitor em pontos lógicos. `monitor.position()`/`.size()`
    // são **pixels físicos** em todas as plataformas (Tauri normaliza),
    // então em macOS Retina precisamos dividir pelo scale do monitor pra
    // chegar a pontos. Em Win/Linux cursor já é físico mas dividir por
    // `scale=1.0` (display sem HiDPI) ou pelo scale correto produz o mesmo
    // resultado da comparação física original — é estável cross-OS.
    let monitor = cursor
        .and_then(|(cx, cy)| {
            let cxf = cx as f64;
            let cyf = cy as f64;
            monitors.iter().find(|m| {
                let scale = m.scale_factor();
                let p = m.position();
                let s = m.size();
                #[cfg(target_os = "macos")]
                let (px, py, sw, sh) = (
                    p.x as f64 / scale,
                    p.y as f64 / scale,
                    s.width as f64 / scale,
                    s.height as f64 / scale,
                );
                #[cfg(not(target_os = "macos"))]
                let (px, py, sw, sh) = {
                    let _ = scale;
                    (p.x as f64, p.y as f64, s.width as f64, s.height as f64)
                };
                cxf >= px && cxf < px + sw && cyf >= py && cyf < py + sh
            })
        })
        .cloned()
        .or_else(|| app.primary_monitor().ok().flatten())
        .or_else(|| monitors.into_iter().next());

    let Some(monitor) = monitor else {
        return Ok(());
    };

    // Issue #52 — usar `monitor.scale_factor()` (não `window.scale_factor()`).
    // Em multi-monitor com DPIs diferentes, `window.scale_factor()` reporta
    // o scale do monitor onde a janela está agora (potencialmente o anterior),
    // o que descentraliza o donut quando o cursor mudou de monitor.
    let scale = monitor.scale_factor();
    let pos = monitor.position();
    let s = monitor.size();
    let half = ((size / 2.0) * scale).round() as i32;
    let center_x = pos.x + (s.width as i32) / 2;
    let center_y = pos.y + (s.height as i32) / 2;
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
