//! Plano 21 — cursor warp cross-OS pra direcionar launches a um monitor.
//!
//! O pure helper `monitor_center_point` é testável (cobre cálculo do
//! ponto-alvo); a FFI por SO é smoke-only e não roda em CI headless. O
//! launcher chama isso best-effort antes de cada item com `monitor: Some(_)`,
//! e ignora silenciosamente erros (Wayland sem suporte, FFI fail) — o
//! launch real prossegue na tela default do OS.

use crate::errors::{AppError, AppResult};
use tauri::{AppHandle, Runtime};

/// Centro físico de um monitor pelos seus retângulos. Pure pra teste.
pub fn monitor_center_point(pos_x: i32, pos_y: i32, width: u32, height: u32) -> (i32, i32) {
    (pos_x + (width / 2) as i32, pos_y + (height / 2) as i32)
}

/// Move o cursor pro centro do monitor `index` (0-based) consultando
/// `AppHandle::available_monitors()`. Erros são propagados pra log no
/// caller — o launch real segue independente.
pub fn warp_to_monitor<R: Runtime>(app: &AppHandle<R>, index: u32) -> AppResult<()> {
    let monitors = app.available_monitors().map_err(|e| {
        AppError::launcher("warp_monitors_query_failed", &[("reason", e.to_string())])
    })?;
    let monitor = monitors.get(index as usize).ok_or_else(|| {
        AppError::launcher(
            "warp_monitor_out_of_range",
            &[
                ("index", index.to_string()),
                ("available", monitors.len().to_string()),
            ],
        )
    })?;
    let pos = monitor.position();
    let size = monitor.size();
    let (x, y) = monitor_center_point(pos.x, pos.y, size.width, size.height);
    warp_cursor(x, y)
}

#[cfg(target_os = "windows")]
fn warp_cursor(x: i32, y: i32) -> AppResult<()> {
    // FFI direto pra user32!SetCursorPos. Single-function dependência,
    // não justifica `windows-sys`/`winapi` no Cargo.toml.
    extern "system" {
        fn SetCursorPos(x: i32, y: i32) -> i32;
    }
    let ok = unsafe { SetCursorPos(x, y) };
    if ok == 0 {
        return Err(AppError::launcher(
            "warp_cursor_ffi_failed",
            &[("os", "windows".into())],
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn warp_cursor(x: i32, y: i32) -> AppResult<()> {
    #[repr(C)]
    struct CGPoint {
        x: f64,
        y: f64,
    }
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWarpMouseCursorPosition(point: CGPoint) -> i32;
    }
    let code = unsafe {
        CGWarpMouseCursorPosition(CGPoint {
            x: x as f64,
            y: y as f64,
        })
    };
    if code != 0 {
        return Err(AppError::launcher(
            "warp_cursor_ffi_failed",
            &[("os", "macos".into()), ("code", code.to_string())],
        ));
    }
    Ok(())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn warp_cursor(_x: i32, _y: i32) -> AppResult<()> {
    // Linux: X11 suporta via XWarpPointer mas Wayland bloqueia explicitamente
    // por motivos de segurança. V1 não embute dep X11 (peso desproporcional);
    // user em Linux que escolheu monitor vê launch ir pra default + warning
    // no log. Plano 22+ pode adicionar suporte X11 opcional.
    Err(AppError::launcher(
        "warp_cursor_unsupported_os",
        &[("os", std::env::consts::OS.into())],
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn center_of_primary_monitor() {
        assert_eq!(monitor_center_point(0, 0, 1920, 1080), (960, 540));
    }

    #[test]
    fn center_of_secondary_monitor_to_the_right() {
        // Segundo monitor 1280×720 à direita do primário 1920×1080.
        assert_eq!(monitor_center_point(1920, 0, 1280, 720), (2560, 360));
    }

    #[test]
    fn center_of_monitor_with_negative_position() {
        // Windows usa coordenadas negativas pra monitor à esquerda do primário.
        assert_eq!(monitor_center_point(-1920, 0, 1920, 1080), (-960, 540));
    }

    #[test]
    fn center_of_monitor_with_negative_y() {
        assert_eq!(monitor_center_point(0, -1080, 1920, 1080), (960, -540));
    }

    #[test]
    fn handles_odd_dimensions() {
        // Divisão inteira: 1921/2 = 960. Acceptable — monitor ímpar é raro
        // mas cobertura defensiva.
        assert_eq!(monitor_center_point(0, 0, 1921, 1081), (960, 540));
    }
}
