import { useCallback, useEffect, useRef, useState } from "react";

export type HoverHoldPhase =
  | { phase: "idle" }
  | { phase: "holding"; sliceIndex: number; progress: number }
  | { phase: "actionable"; sliceIndex: number }
  | { phase: "confirming"; sliceIndex: number };

export interface UseHoverHoldOpts {
  hoveredSlice: number | null;
  isTabSlice: (index: number) => boolean;
  holdMs: number;
  onComplete: (sliceIndex: number) => void;
}

export interface UseHoverHoldResult {
  state: HoverHoldPhase;
  cancel: () => void;
  requestDelete: () => void;
  confirmDelete: () => void;
  reset: () => void;
}

/**
 * Máquina de estados do gesto hover-hold:
 *   idle  →(hover entra em fatia tab) holding(progress=0..1)
 *   holding ─(hover sai/troca)→ idle
 *   holding ─(progress=1)→ actionable        (chama onComplete uma vez)
 *   actionable ─cancel()→ idle
 *   actionable ─requestDelete()→ confirming
 *   confirming ─cancel()→ actionable
 *   confirming ─confirmDelete()→ idle        (caller dispara o delete)
 *
 * Hover sobre fatia onde `isTabSlice(i) === false` é ignorado (i.e., a "+"
 * não dispara o gesto).
 */
export function useHoverHold(opts: UseHoverHoldOpts): UseHoverHoldResult {
  const [state, setState] = useState<HoverHoldPhase>({ phase: "idle" });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const stateRef = useRef<HoverHoldPhase>(state);
  stateRef.current = state;
  const onCompleteRef = useRef(opts.onComplete);
  onCompleteRef.current = opts.onComplete;
  const isTabSliceRef = useRef(opts.isTabSlice);
  isTabSliceRef.current = opts.isTabSlice;

  const stopTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Reage à mudança de hoveredSlice. `confirming` fica travado (usuário já
  // pediu pra excluir — só Sim/Não / cancel explícito tiram de lá).
  // `actionable` desmonta quando o cursor sai da fatia (intuitivo: tirou o
  // mouse de cima, overlay some).
  useEffect(() => {
    const current = stateRef.current;
    if (current.phase === "confirming") {
      return;
    }

    const i = opts.hoveredSlice;
    if (i === null || !isTabSliceRef.current(i)) {
      stopTimer();
      if (current.phase !== "idle") setState({ phase: "idle" });
      return;
    }

    if (current.phase === "actionable") {
      if (current.sliceIndex === i) {
        // mesma fatia em modo ação — mantém o overlay
        return;
      }
      // cursor pulou pra outra fatia: volta ao idle e (cai pro fluxo abaixo)
      // reinicia o holding na nova fatia
      stopTimer();
      setState({ phase: "idle" });
    }

    if (current.phase === "holding" && current.sliceIndex === i) {
      // mesma fatia, deixa o timer correr
      return;
    }

    // nova fatia (ou veio de idle): reinicia
    stopTimer();
    startedAtRef.current = Date.now();
    setState({ phase: "holding", sliceIndex: i, progress: 0 });
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const progress = Math.min(1, elapsed / opts.holdMs);
      const s = stateRef.current;
      if (s.phase !== "holding") {
        stopTimer();
        return;
      }
      if (progress >= 1) {
        stopTimer();
        setState({ phase: "actionable", sliceIndex: s.sliceIndex });
        onCompleteRef.current(s.sliceIndex);
      } else {
        setState({ ...s, progress });
      }
    }, 16);
  }, [opts.hoveredSlice, opts.holdMs, stopTimer]);

  // Cleanup global
  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  const cancel = useCallback(() => {
    const s = stateRef.current;
    stopTimer();
    if (s.phase === "confirming") {
      setState({ phase: "actionable", sliceIndex: s.sliceIndex });
    } else if (s.phase !== "idle") {
      setState({ phase: "idle" });
    }
  }, [stopTimer]);

  const requestDelete = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "actionable") {
      setState({ phase: "confirming", sliceIndex: s.sliceIndex });
    }
  }, []);

  const confirmDelete = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "confirming") {
      setState({ phase: "idle" });
    }
  }, []);

  // Hard reset para qualquer phase → idle. Usado quando o contexto que
  // ancorava o gesto desaparece (ex.: a página do donut mudou e o
  // sliceIndex agora aponta para outra aba).
  const reset = useCallback(() => {
    stopTimer();
    if (stateRef.current.phase !== "idle") setState({ phase: "idle" });
  }, [stopTimer]);

  return { state, cancel, requestDelete, confirmDelete, reset };
}
