// src-tauri/src/errors.rs
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("config error: {0}")]
    Config(String),
    #[error("shortcut error: {0}")]
    Shortcut(String),
    #[error("launcher error: {0}")]
    Launcher(String),
    #[error("window error: {0}")]
    Window(String),
    #[error("io error: {0}")]
    Io(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { AppError::Io(e.to_string()) }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self { AppError::Config(e.to_string()) }
}

pub type AppResult<T> = Result<T, AppError>;
