//! Plano 19 — bounded queue in-memory de execuções de script com
//! captura de stdout/stderr. Sem persistência em disco (output pode
//! conter secrets).
//!
//! Caps:
//! - `MAX_RUNS`: 50 entradas; 51ª evicta a mais antiga.
//! - `MAX_LINES_PER_STREAM`: 10_000 linhas por stream (stdout / stderr).
//! - `MAX_BYTES_PER_STREAM`: 1 MiB por stream.
//!
//! O buffer cresce monotonicamente até atingir os caps; ao atingir,
//! `truncated = true` e novo output é descartado pra aquele stream.
//!
//! Helpers puros (`truncate_with_flag`, `unix_millis_now`,
//! `ScriptRun::summary`) ficam em `state.rs` e cobertos por unit tests.

pub mod state;

use state::{truncate_with_flag, unix_millis_now};
pub use state::{ScriptRun, ScriptRunSummary, ScriptStatus, ScriptStream};

use std::collections::VecDeque;
use std::sync::Mutex;
use uuid::Uuid;

const MAX_RUNS: usize = 50;
const MAX_LINES_PER_STREAM: usize = 10_000;
const MAX_BYTES_PER_STREAM: usize = 1024 * 1024;

/// Bounded queue de runs. `Mutex` (não `RwLock`) porque writes dominam
/// (cada chunk de output trava); contention de read fica baixa.
pub struct ScriptHistory {
    runs: Mutex<VecDeque<ScriptRun>>,
    max_runs: usize,
}

impl Default for ScriptHistory {
    fn default() -> Self {
        Self::new()
    }
}

impl ScriptHistory {
    pub fn new() -> Self {
        Self {
            runs: Mutex::new(VecDeque::with_capacity(MAX_RUNS)),
            max_runs: MAX_RUNS,
        }
    }

    /// Variante para tests com cap menor.
    #[cfg(test)]
    fn with_max(max: usize) -> Self {
        Self {
            runs: Mutex::new(VecDeque::with_capacity(max)),
            max_runs: max,
        }
    }

    /// Cria entrada `Running` e retorna o id. Se a fila atingir `max_runs`,
    /// evicta a mais antiga.
    pub fn start_run(
        &self,
        profile_id: Uuid,
        tab_id: Uuid,
        item_index: usize,
        command: String,
    ) -> Uuid {
        let id = Uuid::new_v4();
        let run = ScriptRun {
            id,
            profile_id,
            tab_id,
            item_index,
            command,
            started_at: unix_millis_now(),
            finished_at: None,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            truncated: false,
            status: ScriptStatus::Running,
        };
        let mut q = self.runs.lock().unwrap();
        if q.len() >= self.max_runs {
            q.pop_front();
        }
        q.push_back(run);
        id
    }

    /// Append um chunk a stdout ou stderr da run. Respeita cap dual
    /// (linhas + bytes). Retorna `false` se a run não existe ou já
    /// terminou (chunks tardios são descartados).
    pub fn append_output(&self, id: Uuid, stream: ScriptStream, chunk: &str) -> bool {
        let mut q = self.runs.lock().unwrap();
        let Some(run) = q.iter_mut().find(|r| r.id == id) else {
            return false;
        };
        if run.status != ScriptStatus::Running {
            return false;
        }
        let target = match stream {
            ScriptStream::Stdout => &mut run.stdout,
            ScriptStream::Stderr => &mut run.stderr,
        };
        let hit = truncate_with_flag(target, chunk, MAX_LINES_PER_STREAM, MAX_BYTES_PER_STREAM);
        if hit {
            run.truncated = true;
        }
        true
    }

    /// Finaliza a run com `status` + `exit_code`. Retorna `false` se a
    /// run não existe ou já está em estado terminal.
    pub fn finish_run(&self, id: Uuid, exit_code: Option<i32>, status: ScriptStatus) -> bool {
        debug_assert!(status != ScriptStatus::Running);
        let mut q = self.runs.lock().unwrap();
        let Some(run) = q.iter_mut().find(|r| r.id == id) else {
            return false;
        };
        if run.status != ScriptStatus::Running {
            return false;
        }
        run.finished_at = Some(unix_millis_now());
        run.exit_code = exit_code;
        run.status = status;
        true
    }

    /// Lista todas as runs como summaries (mais nova primeiro).
    pub fn list_runs(&self) -> Vec<ScriptRunSummary> {
        let q = self.runs.lock().unwrap();
        q.iter().rev().map(|r| r.summary()).collect()
    }

    /// Retorna a run completa por id.
    pub fn get_run(&self, id: Uuid) -> Option<ScriptRun> {
        let q = self.runs.lock().unwrap();
        q.iter().find(|r| r.id == id).cloned()
    }

    /// Esvazia o buffer.
    pub fn clear(&self) {
        let mut q = self.runs.lock().unwrap();
        q.clear();
    }

    /// `true` se a run existe E está em estado `Running` (caller usa pra
    /// decidir se mata o child antes de marcar `Cancelled`).
    pub fn is_running(&self, id: Uuid) -> bool {
        let q = self.runs.lock().unwrap();
        q.iter()
            .find(|r| r.id == id)
            .map(|r| r.status == ScriptStatus::Running)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_ids() -> (Uuid, Uuid) {
        (Uuid::new_v4(), Uuid::new_v4())
    }

    #[test]
    fn start_run_returns_unique_ids_and_initial_state_is_running() {
        let h = ScriptHistory::new();
        let (p, t) = fixture_ids();
        let a = h.start_run(p, t, 0, "echo a".into());
        let b = h.start_run(p, t, 1, "echo b".into());
        assert_ne!(a, b);
        let run_a = h.get_run(a).unwrap();
        assert_eq!(run_a.status, ScriptStatus::Running);
        assert_eq!(run_a.command, "echo a");
        assert_eq!(run_a.exit_code, None);
        assert_eq!(run_a.finished_at, None);
    }

    #[test]
    fn list_runs_orders_newest_first() {
        let h = ScriptHistory::new();
        let (p, t) = fixture_ids();
        let first = h.start_run(p, t, 0, "first".into());
        let second = h.start_run(p, t, 0, "second".into());
        let runs = h.list_runs();
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[0].id, second);
        assert_eq!(runs[1].id, first);
    }

    #[test]
    fn append_output_routes_to_correct_stream() {
        let h = ScriptHistory::new();
        let (p, t) = fixture_ids();
        let id = h.start_run(p, t, 0, "x".into());
        assert!(h.append_output(id, ScriptStream::Stdout, "hello\n"));
        assert!(h.append_output(id, ScriptStream::Stderr, "err\n"));
        let run = h.get_run(id).unwrap();
        assert_eq!(run.stdout, "hello\n");
        assert_eq!(run.stderr, "err\n");
        assert!(!run.truncated);
    }

    #[test]
    fn append_output_returns_false_for_unknown_id() {
        let h = ScriptHistory::new();
        let bogus = Uuid::new_v4();
        assert!(!h.append_output(bogus, ScriptStream::Stdout, "x"));
    }

    #[test]
    fn append_output_returns_false_after_finish() {
        let h = ScriptHistory::new();
        let (p, t) = fixture_ids();
        let id = h.start_run(p, t, 0, "x".into());
        assert!(h.finish_run(id, Some(0), ScriptStatus::Succeeded));
        assert!(!h.append_output(id, ScriptStream::Stdout, "late\n"));
        let run = h.get_run(id).unwrap();
        assert_eq!(run.stdout, "");
    }

    #[test]
    fn finish_run_sets_terminal_status_and_exit_code() {
        let h = ScriptHistory::new();
        let (p, t) = fixture_ids();
        let id = h.start_run(p, t, 0, "x".into());
        assert!(h.finish_run(id, Some(7), ScriptStatus::Failed));
        let run = h.get_run(id).unwrap();
        assert_eq!(run.status, ScriptStatus::Failed);
        assert_eq!(run.exit_code, Some(7));
        assert!(run.finished_at.is_some());
    }

    #[test]
    fn finish_run_is_idempotent_after_terminal_state() {
        let h = ScriptHistory::new();
        let (p, t) = fixture_ids();
        let id = h.start_run(p, t, 0, "x".into());
        assert!(h.finish_run(id, Some(0), ScriptStatus::Succeeded));
        // Segundo finish é no-op.
        assert!(!h.finish_run(id, Some(1), ScriptStatus::Failed));
        let run = h.get_run(id).unwrap();
        assert_eq!(run.status, ScriptStatus::Succeeded);
        assert_eq!(run.exit_code, Some(0));
    }

    #[test]
    fn bounded_queue_evicts_oldest_when_full() {
        let h = ScriptHistory::with_max(3);
        let (p, t) = fixture_ids();
        let a = h.start_run(p, t, 0, "a".into());
        let b = h.start_run(p, t, 0, "b".into());
        let c = h.start_run(p, t, 0, "c".into());
        let d = h.start_run(p, t, 0, "d".into());
        assert!(h.get_run(a).is_none()); // evicted
        assert!(h.get_run(b).is_some());
        assert!(h.get_run(c).is_some());
        assert!(h.get_run(d).is_some());
        let runs = h.list_runs();
        assert_eq!(runs.len(), 3);
        assert_eq!(runs[0].id, d); // newest first
        assert_eq!(runs[2].id, b); // oldest
    }

    #[test]
    fn truncated_flag_set_when_cap_hit() {
        let h = ScriptHistory::new();
        let (p, t) = fixture_ids();
        let id = h.start_run(p, t, 0, "x".into());
        // Spam até cap de bytes.
        let huge = "x".repeat(MAX_BYTES_PER_STREAM + 100);
        h.append_output(id, ScriptStream::Stdout, &huge);
        let run = h.get_run(id).unwrap();
        assert!(run.truncated);
        assert!(run.stdout.len() <= MAX_BYTES_PER_STREAM);
    }

    #[test]
    fn clear_empties_queue() {
        let h = ScriptHistory::new();
        let (p, t) = fixture_ids();
        h.start_run(p, t, 0, "a".into());
        h.start_run(p, t, 0, "b".into());
        h.clear();
        assert!(h.list_runs().is_empty());
    }

    #[test]
    fn is_running_reflects_state() {
        let h = ScriptHistory::new();
        let (p, t) = fixture_ids();
        let id = h.start_run(p, t, 0, "x".into());
        assert!(h.is_running(id));
        h.finish_run(id, Some(0), ScriptStatus::Succeeded);
        assert!(!h.is_running(id));
        assert!(!h.is_running(Uuid::new_v4()));
    }
}
