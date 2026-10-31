"use client";

import { useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  exportBilingualTxt,
  exportCsv,
  exportSrt,
  exportVtt,
} from "@/lib/export/subtitleExporter";
import { runQualityChecks } from "@/lib/validation/qualityCheck";
import { AlertIcon, CheckIcon, DownloadIcon } from "@/components/Icons";
import type { ExportFormat } from "@/types";

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export function ExportScreen() {
  const { parsed, fileMeta, config, setStep, reset } = useAppStore();

  const issues = useMemo(() => (parsed ? runQualityChecks(parsed) : []), [parsed]);
  if (!parsed || !fileMeta) return null;

  const errorCount = issues.filter((i) => i.level === "error").length;
  const untranslated = parsed.blocks.filter(
    (b) => !b.isMeta && b.originalText.trim() !== "" && b.translatedText.trim() === ""
  ).length;

  const stem = `${baseName(fileMeta.name)}.${config.targetLang}`;

  const options: {
    fmt: ExportFormat;
    title: string;
    desc: string;
    filename: string;
    mime: string;
    build: () => string;
  }[] = [
    {
      fmt: "srt",
      title: "SubRip (.srt)",
      desc: "Mismos tiempos y numeración, texto traducido.",
      filename: `${stem}.srt`,
      mime: "text/plain",
      build: () => exportSrt(parsed.blocks),
    },
    {
      fmt: "vtt",
      title: "WebVTT (.vtt)",
      desc: "Conserva encabezado, notas y estilos.",
      filename: `${stem}.vtt`,
      mime: "text/vtt",
      build: () => exportVtt(parsed.blocks),
    },
    {
      fmt: "txt",
      title: "Bilingüe (.txt)",
      desc: "Original y traducción intercalados.",
      filename: `${stem}.bilingue.txt`,
      mime: "text/plain",
      build: () => exportBilingualTxt(parsed.blocks),
    },
    {
      fmt: "csv",
      title: "Tabla (.csv)",
      desc: "index, startTime, endTime, original, traducción.",
      filename: `${stem}.csv`,
      mime: "text/csv",
      build: () => exportCsv(parsed.blocks),
    },
  ];

  const primaryFormat = fileMeta.format === "vtt" ? "vtt" : "srt";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
          <DownloadIcon width={26} height={26} />
        </div>
        <h2 className="text-2xl font-bold text-white">Exportar traducción</h2>
        <p className="mt-1 text-sm text-slate-400">
          Descarga tu archivo traducido conservando el formato original.
        </p>
      </div>

      {(errorCount > 0 || untranslated > 0) && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertIcon className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            {untranslated > 0 && (
              <div>{untranslated} bloque(s) sin traducir usarán el texto original al exportar.</div>
            )}
            {errorCount > 0 && <div>{errorCount} error(es) de control de calidad detectado(s).</div>}
            <button className="mt-1 underline" onClick={() => setStep("edit")}>
              Volver al editor para revisarlos
            </button>
          </div>
        </div>
      )}

      {errorCount === 0 && untranslated === 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <CheckIcon className="text-emerald-400" />
          Todo listo: sin errores de calidad y todos los bloques traducidos.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <div
            key={o.fmt}
            className={[
              "card flex flex-col justify-between p-4",
              o.fmt === primaryFormat ? "border-brand-500/50 bg-brand-600/[0.06]" : "",
            ].join(" ")}
          >
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{o.title}</h3>
                {o.fmt === primaryFormat && (
                  <span className="badge bg-brand-500/20 text-brand-200">Recomendado</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-400">{o.desc}</p>
              <p className="mt-2 font-mono text-[11px] text-slate-500">{o.filename}</p>
            </div>
            <button
              className={o.fmt === primaryFormat ? "btn-primary mt-4" : "btn-subtle mt-4"}
              onClick={() => download(o.build(), o.filename, o.mime)}
            >
              <DownloadIcon width={16} height={16} /> Descargar
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button className="btn-ghost" onClick={() => setStep("edit")}>
          Volver al editor
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            if (confirm("¿Empezar de nuevo? Se descartará el archivo y la traducción actuales.")) {
              reset();
            }
          }}
        >
          Traducir otro archivo
        </button>
      </div>
    </div>
  );
}
