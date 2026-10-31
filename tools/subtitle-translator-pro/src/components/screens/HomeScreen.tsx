"use client";

import { useCallback, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { parseSubtitles } from "@/lib/subtitles/subtitleParser";
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
  formatBytes,
  validateSubtitleFile,
} from "@/lib/validation/fileValidation";
import { AlertIcon, FileIcon, ShieldIcon, UploadIcon } from "@/components/Icons";

export function HomeScreen() {
  const loadParsed = useAppStore((s) => s.loadParsed);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const check = validateSubtitleFile(file);
      if (!check.ok || !check.format) {
        setError(check.error ?? "Archivo no válido.");
        return;
      }
      if (check.format === "ass") {
        setError("El formato .ass aún no está soportado. Convierte a .srt o .vtt.");
        return;
      }

      let content: string;
      try {
        content = await file.text();
      } catch {
        setError("No se pudo leer el archivo en el navegador.");
        return;
      }

      const parsed = parseSubtitles(content, check.format);
      if (parsed.translatableCount === 0) {
        setError(
          parsed.warnings[0] ??
            "No se detectaron bloques traducibles. Verifica que el archivo tenga el formato correcto."
        );
        return;
      }

      const lineCount = content.split(/\r\n|\r|\n/).length;
      loadParsed(parsed, {
        name: file.name,
        size: file.size,
        format: check.format,
        lineCount,
      });
    },
    [loadParsed]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">
          <ShieldIcon width={14} height={14} className="text-emerald-400" />
          Procesamiento temporal — tus archivos no se guardan en el servidor
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Traduce subtítulos sin romper el formato
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-400">
          Sube un archivo <span className="font-mono text-slate-300">.srt</span> o{" "}
          <span className="font-mono text-slate-300">.vtt</span>, tradúcelo al idioma que quieras,
          revísalo línea por línea y descárgalo conservando tiempos y numeración originales.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          "card flex flex-col items-center justify-center px-6 py-14 text-center transition",
          dragging ? "border-brand-500 bg-brand-600/10" : "hover:border-slate-700",
        ].join(" ")}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600/20 text-brand-300">
          <UploadIcon width={26} height={26} />
        </div>
        <p className="text-lg font-semibold text-white">Arrastra tu archivo aquí</p>
        <p className="mt-1 text-sm text-slate-400">
          o haz clic para seleccionarlo — {ACCEPTED_EXTENSIONS.join(", ")} · máx.{" "}
          {formatBytes(MAX_FILE_BYTES)}
        </p>
        <button className="btn-primary mt-6" onClick={() => inputRef.current?.click()}>
          <UploadIcon /> Seleccionar archivo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".srt,.vtt,.ass"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertIcon className="mt-0.5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { t: "Formato intacto", d: "Tiempos, numeración y saltos de línea se conservan al exportar." },
          { t: "Editor bilingüe", d: "Revisa y corrige cada bloque comparando con el original." },
          { t: "Tú eliges el proveedor", d: "Mock offline, OpenAI, Anthropic, DeepL o Google." },
        ].map((f) => (
          <div key={f.t} className="card p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-100">
              <FileIcon width={16} height={16} className="text-brand-300" />
              {f.t}
            </div>
            <p className="text-xs leading-relaxed text-slate-400">{f.d}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
        <strong className="font-semibold">Uso responsable:</strong> traduce únicamente subtítulos
        propios o para los que tengas autorización. Esta herramienta no descarga ni busca subtítulos
        en internet.
      </div>
    </div>
  );
}
