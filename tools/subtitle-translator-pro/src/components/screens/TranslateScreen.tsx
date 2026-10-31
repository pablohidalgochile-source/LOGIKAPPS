"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { translatableIndices, useAppStore } from "@/store/useAppStore";
import { translateItems, type BatchProgress } from "@/lib/translation/client";
import { getStyle } from "@/lib/translation/styles";
import { PROVIDER_LABELS } from "@/lib/translation/client";
import { AlertIcon, CheckIcon, RefreshIcon, TranslateIcon } from "@/components/Icons";

type Phase = "idle" | "running" | "done" | "error";

export function TranslateScreen() {
  const parsed = useAppStore((s) => s.parsed);
  const config = useAppStore((s) => s.config);
  const setStep = useAppStore((s) => s.setStep);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [errors, setErrors] = useState<{ batchIndex: number; message: string }[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const indices = parsed ? translatableIndices(parsed) : [];
  const total = indices.length;

  const run = useCallback(async () => {
    const state = useAppStore.getState();
    const parsedNow = state.parsed;
    if (!parsedNow) return;
    const activeIndices = translatableIndices(parsedNow);
    const texts = activeIndices.map((i) => parsedNow.blocks[i].originalText);

    // Supersede any in-flight run (e.g. a manual "Traducir de nuevo").
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("running");
    setErrors([]);
    setFatal(null);
    setProgress({ done: 0, total: texts.length, batchIndex: 0, batchCount: 0 });
    state.setTranslating(true);

    try {
      const { translations, errors } = await translateItems({
        texts,
        config: state.config,
        styleInstruction: getStyle(state.config.styleId).instruction,
        onProgress: (p) => {
          if (!controller.signal.aborted) setProgress(p);
        },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return; // cancelled / superseded
      state.applyTranslations(translations);
      setErrors(errors);
      setPhase("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return; // cancel handler owns the resulting UI state
      }
      setFatal(err instanceof Error ? err.message : "Error inesperado.");
      setPhase("error");
    } finally {
      if (abortRef.current === controller) {
        state.setTranslating(false);
        abortRef.current = null;
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    useAppStore.getState().setTranslating(false);
    setPhase("idle");
  }, []);

  // Auto-start exactly once. The latch survives a StrictMode re-mount, and we
  // intentionally do NOT abort on unmount so the run finishes rather than
  // getting stuck after the first batch.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, [run]);

  if (!parsed) return null;

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  const failedBlocks = errors.length;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/20 text-brand-300">
          {phase === "done" && failedBlocks === 0 ? (
            <CheckIcon width={30} height={30} className="text-emerald-400" />
          ) : phase === "error" ? (
            <AlertIcon width={30} height={30} className="text-red-400" />
          ) : (
            <TranslateIcon width={30} height={30} className={phase === "running" ? "animate-pulse" : ""} />
          )}
        </div>

        <h2 className="text-xl font-semibold text-white">
          {phase === "running" && "Traduciendo…"}
          {phase === "done" && (failedBlocks === 0 ? "Traducción completada" : "Traducción con avisos")}
          {phase === "error" && "No se pudo traducir"}
          {phase === "idle" && "Listo para traducir"}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {total} bloques · {PROVIDER_LABELS[config.provider]} ·{" "}
          {getStyle(config.styleId).label}
        </p>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>
              {progress ? `${progress.done}/${progress.total} bloques` : "0 bloques"}
              {progress && ` · lote ${progress.batchIndex}/${progress.batchCount}`}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {fatal && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-left text-sm text-red-200">
            <AlertIcon className="mt-0.5 shrink-0 text-red-400" />
            <span>{fatal}</span>
          </div>
        )}

        {failedBlocks > 0 && (
          <div className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-200">
            <div className="mb-1 font-semibold">
              Algunas líneas no se pudieron traducir automáticamente:
            </div>
            <ul className="max-h-24 space-y-0.5 overflow-auto text-xs text-amber-200/80">
              {errors.map((e, i) => (
                <li key={i}>• {e.message}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-200/80">
              Puedes reintentar, o continuar y retraducirlas puntualmente en el editor.
            </p>
          </div>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {phase === "running" && (
            <button className="btn-ghost" onClick={cancel}>
              Cancelar
            </button>
          )}
          {(phase === "done" || phase === "error") && (
            <button className="btn-subtle" onClick={() => void run()}>
              <RefreshIcon width={16} height={16} />
              {phase === "error" ? "Reintentar" : "Traducir de nuevo"}
            </button>
          )}
          {phase === "done" && (
            <button className="btn-primary" onClick={() => setStep("edit")}>
              Ir al editor
            </button>
          )}
        </div>
      </div>

      <button className="btn-ghost mx-auto mt-4 block" onClick={() => setStep("config")}>
        Volver a configuración
      </button>
    </div>
  );
}
