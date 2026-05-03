use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

/// Estado terminal (ou em curso) de uma execução de script.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum ScriptStatus {
    Running,
    Succeeded,
    Failed,
    Interrupted,
    Cancelled,
}

/// Stream de origem de um chunk de output. Frontend usa pra dirigir
/// painéis stdout/stderr separados.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum ScriptStream {
    Stdout,
    Stderr,
}

/// Entrada completa do histórico — detail view do `<HistorySection>`.
/// Buffer in-memory only; nunca persistido em disco (output pode conter
/// secrets).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct ScriptRun {
    pub id: Uuid,
    pub profile_id: Uuid,
    pub tab_id: Uuid,
    pub item_index: usize,
    pub command: String,
    /// Unix epoch millis. Frontend converte pra timezone local via `new Date()`.
    /// `#[ts(type = "number")]` força a binding pra `number` (ts-rs default
    /// pra `i64` é `bigint` — incompatível com `new Date()`).
    #[ts(type = "number")]
    pub started_at: i64,
    #[ts(type = "number | null")]
    pub finished_at: Option<i64>,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    /// `true` quando algum dos streams atingiu o cap (linhas ou bytes).
    pub truncated: bool,
    pub status: ScriptStatus,
}

/// Shape leve consumido pela lista de runs no `<HistorySection>` —
/// evita transferir o output completo na list view.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct ScriptRunSummary {
    pub id: Uuid,
    pub profile_id: Uuid,
    pub tab_id: Uuid,
    pub command: String,
    #[ts(type = "number")]
    pub started_at: i64,
    #[ts(type = "number | null")]
    pub finished_at: Option<i64>,
    pub exit_code: Option<i32>,
    pub status: ScriptStatus,
    pub truncated: bool,
}

impl ScriptRun {
    pub fn summary(&self) -> ScriptRunSummary {
        ScriptRunSummary {
            id: self.id,
            profile_id: self.profile_id,
            tab_id: self.tab_id,
            command: self.command.clone(),
            started_at: self.started_at,
            finished_at: self.finished_at,
            exit_code: self.exit_code,
            status: self.status,
            truncated: self.truncated,
        }
    }
}

/// Append `chunk` ao `existing` respeitando dois caps simultâneos:
/// `max_lines` (contagem de `\n`) e `max_bytes` (tamanho em bytes UTF-8).
/// Quando qualquer cap é atingido, append é truncado e a função retorna
/// `true` — caller seta o `truncated` flag do `ScriptRun`.
///
/// `current_lines` é mantido pelo caller (sidecar counter no
/// `ScriptHistory`) para evitar O(n) re-scan do buffer a cada chunk.
/// Função atualiza o counter in-place adicionando as linhas efetivamente
/// anexadas (ignora linhas truncadas pelo cap).
///
/// Comportamento:
/// - Cap por linhas: descarta excedente preservando ordem.
/// - Cap por bytes: trunca chunk em char boundary (não parte UTF-8
///   multi-byte ao meio).
/// - Chunk vazio: no-op; retorna `true` se algum cap já estava atingido.
pub fn truncate_with_flag(
    existing: &mut String,
    current_lines: &mut usize,
    chunk: &str,
    max_lines: usize,
    max_bytes: usize,
) -> bool {
    if chunk.is_empty() {
        return existing.len() >= max_bytes || *current_lines >= max_lines;
    }

    let current_bytes = existing.len();
    let mut hit_cap = false;

    let mut to_append = String::new();
    let mut appended_lines = 0usize;
    let mut appended_bytes = 0usize;

    for ch in chunk.chars() {
        if *current_lines + appended_lines >= max_lines {
            hit_cap = true;
            break;
        }
        let ch_bytes = ch.len_utf8();
        if current_bytes + appended_bytes + ch_bytes > max_bytes {
            hit_cap = true;
            break;
        }
        to_append.push(ch);
        appended_bytes += ch_bytes;
        if ch == '\n' {
            appended_lines += 1;
        }
    }

    existing.push_str(&to_append);
    *current_lines += appended_lines;
    hit_cap
}

/// Helper puro: instante atual em Unix epoch milliseconds (UTC).
/// Implementação minimalista via
/// `SystemTime::now().duration_since(UNIX_EPOCH)`. Frontend converte
/// para timezone local com `new Date(millis)`.
pub fn unix_millis_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_appends_when_under_caps() {
        let mut buf = String::from("hello\n");
        let mut lines = 1;
        let hit = truncate_with_flag(&mut buf, &mut lines, "world\n", 100, 1024);
        assert!(!hit);
        assert_eq!(buf, "hello\nworld\n");
        assert_eq!(lines, 2);
    }

    #[test]
    fn truncate_caps_by_lines() {
        let mut buf = String::from("a\nb\n");
        let mut lines = 2;
        // max_lines = 3 → só cabe 1 linha nova
        let hit = truncate_with_flag(&mut buf, &mut lines, "c\nd\ne\n", 3, 1024);
        assert!(hit);
        assert_eq!(buf, "a\nb\nc\n");
        assert_eq!(lines, 3);
    }

    #[test]
    fn truncate_caps_by_bytes() {
        let mut buf = String::from("123456");
        let mut lines = 0;
        // max_bytes = 10 → cabem 4 chars
        let hit = truncate_with_flag(&mut buf, &mut lines, "abcdefghij", 100, 10);
        assert!(hit);
        assert_eq!(buf, "123456abcd");
        assert_eq!(lines, 0);
    }

    #[test]
    fn truncate_preserves_utf8_boundary() {
        // "ó" = 2 bytes UTF-8; max_bytes 1 byte de folga não cabe
        let mut buf = String::from("xy"); // 2 bytes used, 1 free until cap=3
        let mut lines = 0;
        let hit = truncate_with_flag(&mut buf, &mut lines, "ó", 100, 3);
        assert!(hit);
        // "ó" não cabe (precisaria 4 bytes total, cap é 3) → buf inalterado
        assert_eq!(buf, "xy");
        assert_eq!(lines, 0);
    }

    #[test]
    fn truncate_noop_on_empty_chunk_under_cap() {
        let mut buf = String::from("hi");
        let mut lines = 0;
        let hit = truncate_with_flag(&mut buf, &mut lines, "", 10, 100);
        assert!(!hit);
        assert_eq!(buf, "hi");
        assert_eq!(lines, 0);
    }

    #[test]
    fn truncate_noop_on_empty_chunk_at_cap() {
        let mut buf = String::from("0123456789"); // 10 bytes
        let mut lines = 0;
        let hit = truncate_with_flag(&mut buf, &mut lines, "", 100, 10);
        assert!(hit);
        assert_eq!(buf, "0123456789");
    }

    #[test]
    fn truncate_increments_line_counter_only_for_appended_lines() {
        // Cap por linhas trunca no meio do chunk — counter reflete linhas
        // efetivamente anexadas, não as descartadas.
        let mut buf = String::from("a\n");
        let mut lines = 1;
        let hit = truncate_with_flag(&mut buf, &mut lines, "b\nc\nd\n", 3, 1024);
        assert!(hit);
        assert_eq!(buf, "a\nb\nc\n");
        // Anexou 2 linhas (b, c); d foi descartado.
        assert_eq!(lines, 3);
    }

    #[test]
    fn script_run_summary_strips_output_buffers() {
        let run = ScriptRun {
            id: Uuid::nil(),
            profile_id: Uuid::nil(),
            tab_id: Uuid::nil(),
            item_index: 0,
            command: "echo hi".into(),
            started_at: 1000,
            finished_at: Some(2000),
            exit_code: Some(0),
            stdout: "hi\n".into(),
            stderr: String::new(),
            truncated: false,
            status: ScriptStatus::Succeeded,
        };
        let s = run.summary();
        assert_eq!(s.id, run.id);
        assert_eq!(s.command, "echo hi");
        assert_eq!(s.status, ScriptStatus::Succeeded);
        // Summary não tem stdout/stderr — confirma via shape (struct fields).
    }

    #[test]
    fn script_run_round_trips_serde() {
        let run = ScriptRun {
            id: Uuid::nil(),
            profile_id: Uuid::nil(),
            tab_id: Uuid::nil(),
            item_index: 2,
            command: "ls".into(),
            started_at: 1700_000_000_000,
            finished_at: None,
            exit_code: None,
            stdout: "out".into(),
            stderr: "err".into(),
            truncated: true,
            status: ScriptStatus::Running,
        };
        let json = serde_json::to_string(&run).unwrap();
        let back: ScriptRun = serde_json::from_str(&json).unwrap();
        assert_eq!(run, back);
    }

    #[test]
    fn script_status_serializes_camel_case() {
        assert_eq!(
            serde_json::to_string(&ScriptStatus::Running).unwrap(),
            "\"running\""
        );
        assert_eq!(
            serde_json::to_string(&ScriptStatus::Succeeded).unwrap(),
            "\"succeeded\""
        );
        assert_eq!(
            serde_json::to_string(&ScriptStatus::Cancelled).unwrap(),
            "\"cancelled\""
        );
    }

    #[test]
    fn unix_millis_returns_positive_value() {
        let t = unix_millis_now();
        assert!(t > 1_700_000_000_000);
    }
}
