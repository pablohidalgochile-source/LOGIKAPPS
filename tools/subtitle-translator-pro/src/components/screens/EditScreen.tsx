"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore } from "@/store/useAppStore";
import { translateItems } from "@/lib/translation/client";
import { getStyle } from "@/lib/translation/styles";
import { runQualityChecks } from "@/lib/validation/qualityCheck";
import { AlertIcon, CheckIcon, RefreshIcon, SearchIcon } from "@/components/Icons";
import type { QualityIssue, SubtitleBlock } from "@/types";

export function EditScreen() {
  const { parsed, config, setStep, updateBlockTranslation } = useAppStore();
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const blockRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.blocks
      .map((b, arrayIndex) => ({ b, arrayIndex }))
      .filter(({ b }) => !b.isMeta && b.originalText.trim() !== "");
  }, [parsed]);

  const issues = useMemo(() => (parsed ? runQualityChecks(parsed) : []), [parsed]);
  const issuesByBlock = useMemo(() => {
    const map = new Map<number, QualityIssue[]>();
    for (const it of issues) {
      if (it.blockIndex === undefined) continue;
      const arr = map.get(it.blockIndex) ?? [];
      arr.push(it);
      map.set(it.blockIndex, arr);
    }
    return map;
  }, [issues]);

  if (!parsed) return null;

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warnCount = issues.filter((i) => i.level === "warning").length;

  const applyReplaceAll = () => {
    if (!find) return;
    let count = 0;
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    for (const { b, arrayIndex } of blockRows) {
      if (b.translatedText.includes(find)) {
        const next = b.translatedText.replace(re, replace);
        if (next !== b.translatedText) {
          updateBlockTranslation(arrayIndex, next);
          count++;
        }
      }
    }
    setNotice(count ? `Se reemplazó en ${count} bloque(s).` : "Sin coincidencias.");
  };

  const visibleRows = onlyIssues
    ? blockRows.filter(({ b }) => issuesByBlock.has(b.index) || b.translatedText.trim() === "")
    : blockRows;

  return (
    <div className="mx-auto max-w-5xl">
      {/* Toolbar */}
      <div className="card sticky top-2 z-10 mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[140px] flex-1">
            <SearchIcon
              width={15}
              height={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              className="input pl-9"
              placeholder="Buscar en traducción"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
          </div>
          <input
            className="input min-w-[140px] flex-1"
            placeholder="Reemplazar por"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
          />
          <button className="btn-subtle" onClick={applyReplaceAll} disabled={!find}>
            Reemplazar todo
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            className="accent-brand-500"
            checked={onlyIssues}
            onChange={(e) => setOnlyIssues(e.target.checked)}
          />
          Solo con avisos
        </label>
        <button className="btn-primary" onClick={() => setStep("export")}>
          Continuar a exportar
        </button>
      </div>

      {/* QA summary */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className={badge(errorCount ? "red" : "emerald")}>
          {errorCount ? <AlertIcon width={13} height={13} /> : <CheckIcon width={13} height={13} />}
          {errorCount} errores
        </span>
        <span className={badge(warnCount ? "amber" : "slate")}>{warnCount} avisos</span>
        <span className={badge("slate")}>{blockRows.length} bloques</span>
        {notice && <span className="text-slate-400">{notice}</span>}
      </div>

      {/* Column headers */}
      <div className="mb-2 hidden grid-cols-2 gap-4 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
        <div>Original</div>
        <div>Traducción (editable)</div>
      </div>

      {visibleRows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-400">
          No hay bloques que mostrar con el filtro actual.
        </div>
      ) : (
        <VirtualBlockList rows={visibleRows} issuesByBlock={issuesByBlock} />
      )}

      <button className="btn-ghost mx-auto mt-6 block" onClick={() => setStep("translate")}>
        Volver a traducir
      </button>
    </div>
  );
}

/**
 * Windowed list: only the rows near the viewport are mounted, so the editor
 * stays instant even with thousands of blocks. Row heights are measured
 * dynamically, so growing a translation textarea reflows correctly.
 */
function VirtualBlockList({
  rows,
  issuesByBlock,
}: {
  rows: { b: SubtitleBlock; arrayIndex: number }[];
  issuesByBlock: Map<number, QualityIssue[]>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 196,
    overscan: 8,
    getItemKey: (i) => rows[i].arrayIndex,
  });

  return (
    <div
      ref={scrollRef}
      className="overflow-y-auto pr-1"
      style={{ height: "calc(100vh - 250px)", minHeight: 360 }}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const { b, arrayIndex } = rows[vi.index];
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              <div className="pb-3">
                <BlockRow arrayIndex={arrayIndex} issues={issuesByBlock.get(b.index) ?? []} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BlockRow({ arrayIndex, issues }: { arrayIndex: number; issues: QualityIssue[] }) {
  const block = useAppStore((s) => s.parsed!.blocks[arrayIndex]);
  const config = useAppStore((s) => s.config);
  const updateBlockTranslation = useAppStore((s) => s.updateBlockTranslation);
  const [retranslating, setRetranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retranslate = async () => {
    setRetranslating(true);
    setError(null);
    try {
      const { translations, errors } = await translateItems({
        texts: [block.originalText],
        config,
        styleInstruction: getStyle(config.styleId).instruction,
      });
      if (errors.length || translations[0] == null) {
        setError(errors[0]?.message ?? "No se pudo retraducir.");
      } else {
        updateBlockTranslation(arrayIndex, translations[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setRetranslating(false);
    }
  };

  const chars = block.translatedText.replace(/\n/g, "").length;
  const hasError = issues.some((i) => i.level === "error");
  const hasWarn = issues.some((i) => i.level === "warning");
  const untranslated = block.translatedText.trim() === "";

  return (
    <div
      className={[
        "card p-3 sm:p-4",
        hasError
          ? "border-red-500/40"
          : untranslated || hasWarn
            ? "border-amber-500/30"
            : "",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-slate-300">
            #{block.index}
          </span>
          <span className="font-mono">
            {block.startTime} → {block.endTime}
          </span>
        </div>
        <button
          className="btn-subtle !px-2.5 !py-1 text-xs"
          onClick={retranslate}
          disabled={retranslating}
          title="Retraducir solo este bloque"
        >
          <RefreshIcon width={13} height={13} className={retranslating ? "animate-spin" : ""} />
          {retranslating ? "…" : "Retraducir"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="whitespace-pre-wrap rounded-lg bg-slate-950/50 p-3 text-sm leading-relaxed text-slate-300">
          {block.originalText}
        </div>
        <div>
          <textarea
            className="input min-h-[72px] resize-y whitespace-pre-wrap text-sm leading-relaxed"
            value={block.translatedText}
            placeholder="Sin traducir…"
            onChange={(e) => updateBlockTranslation(arrayIndex, e.target.value)}
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>{chars} caracteres</span>
            {untranslated && <span className="text-amber-400">sin traducir</span>}
          </div>
        </div>
      </div>

      {(issues.length > 0 || error) && (
        <div className="mt-2 space-y-1">
          {error && <div className="text-[11px] text-red-300">• {error}</div>}
          {issues.map((it, i) => (
            <div
              key={i}
              className={[
                "text-[11px]",
                it.level === "error"
                  ? "text-red-300"
                  : it.level === "warning"
                    ? "text-amber-300"
                    : "text-slate-500",
              ].join(" ")}
            >
              • {it.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function badge(color: "red" | "amber" | "emerald" | "slate"): string {
  const map = {
    red: "badge bg-red-500/15 text-red-300",
    amber: "badge bg-amber-500/15 text-amber-300",
    emerald: "badge bg-emerald-500/15 text-emerald-300",
    slate: "badge bg-slate-800 text-slate-300",
  };
  return map[color];
}
