"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { LANGUAGES, TRANSLATION_STYLES, getStyle } from "@/lib/translation/styles";
import { PROVIDER_LABELS, providerNeedsKey } from "@/lib/translation/client";
import { glossaryToText, parseGlossary } from "@/lib/glossary";
import { formatBytes } from "@/lib/validation/fileValidation";
import { FileIcon, ShieldIcon } from "@/components/Icons";
import type { TranslationProvider } from "@/types";

const MODEL_HINT: Partial<Record<TranslationProvider, string>> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-5",
};

export function ConfigScreen() {
  const { config, fileMeta, parsed, setConfig, setStep } = useAppStore();
  const [glossaryText, setGlossaryText] = useState(() => glossaryToText(config.glossary));

  const glossaryEntries = useMemo(() => parseGlossary(glossaryText), [glossaryText]);
  const needsKey = providerNeedsKey(config.provider);

  const commitGlossary = (text: string) => {
    setGlossaryText(text);
    setConfig({ glossary: parseGlossary(text) });
  };

  const goTranslate = () => {
    setConfig({ glossary: glossaryEntries });
    setStep("translate");
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Idiomas y estilo</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Idioma de origen</label>
              <select
                className="input"
                value={config.sourceLang}
                onChange={(e) => setConfig({ sourceLang: e.target.value })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Idioma destino</label>
              <select
                className="input"
                value={config.targetLang}
                onChange={(e) => setConfig({ targetLang: e.target.value })}
              >
                {LANGUAGES.filter((l) => l.code !== "auto").map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Estilo de traducción</label>
            <select
              className="input"
              value={config.styleId}
              onChange={(e) => setConfig({ styleId: e.target.value })}
            >
              {TRANSLATION_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">{getStyle(config.styleId).instruction}</p>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Proveedor de traducción</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(PROVIDER_LABELS) as TranslationProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => setConfig({ provider: p })}
                className={[
                  "rounded-xl border px-3 py-3 text-left text-sm transition",
                  config.provider === p
                    ? "border-brand-500 bg-brand-600/15 text-brand-100"
                    : "border-slate-700 text-slate-300 hover:border-slate-600",
                ].join(" ")}
              >
                <div className="font-semibold">{PROVIDER_LABELS[p]}</div>
                <div className="text-[11px] text-slate-500">
                  {p === "mock" ? "Prueba el flujo sin API" : "Requiere clave"}
                </div>
              </button>
            ))}
          </div>

          {needsKey && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">API Key (opcional)</label>
                <input
                  type="password"
                  className="input font-mono"
                  placeholder="Usa tu propia clave (BYOK)"
                  value={config.apiKey}
                  autoComplete="off"
                  onChange={(e) => setConfig({ apiKey: e.target.value })}
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  Si la dejas vacía, se usará la clave del servidor (variable de entorno). Tu clave
                  no se almacena.
                </p>
              </div>
              {(config.provider === "openai" || config.provider === "anthropic") && (
                <div>
                  <label className="label">Modelo (opcional)</label>
                  <input
                    className="input font-mono"
                    placeholder={MODEL_HINT[config.provider]}
                    value={config.model}
                    onChange={(e) => setConfig({ model: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <label className="label">Tamaño de lote: {config.batchSize} bloques</label>
            <input
              type="range"
              min={5}
              max={50}
              step={5}
              value={config.batchSize}
              onChange={(e) => setConfig({ batchSize: Number(e.target.value) })}
              className="w-full accent-brand-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Lotes más pequeños son más robustos; más grandes, más rápidos.
            </p>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 text-lg font-semibold text-white">Glosario</h2>
          <p className="mb-3 text-xs text-slate-500">
            Un término por línea. Usa <span className="font-mono">Término = reemplazo</span> para
            forzar una traducción, o solo el término para mantenerlo intacto.
          </p>
          <textarea
            className="input min-h-[130px] font-mono text-xs"
            placeholder={"Frate\nCampus Central\nDJ\nlaptop = notebook"}
            value={glossaryText}
            onChange={(e) => commitGlossary(e.target.value)}
          />
          <p className="mt-2 text-[11px] text-slate-500">
            {glossaryEntries.length} término(s) detectado(s).
          </p>
        </section>
      </div>

      <aside className="space-y-4">
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100">
            <FileIcon width={16} height={16} className="text-brand-300" /> Archivo cargado
          </div>
          {fileMeta && parsed ? (
            <dl className="space-y-2 text-sm">
              <Row label="Nombre" value={fileMeta.name} mono />
              <Row label="Formato" value={fileMeta.format.toUpperCase()} />
              <Row label="Tamaño" value={formatBytes(fileMeta.size)} />
              <Row label="Bloques" value={String(parsed.blocks.filter((b) => !b.isMeta).length)} />
              <Row label="Traducibles" value={String(parsed.translatableCount)} />
              <Row label="Líneas" value={String(fileMeta.lineCount)} />
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Sin archivo.</p>
          )}
          {parsed && parsed.warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200/90">
              {parsed.warnings.slice(0, 3).map((w, i) => (
                <div key={i}>• {w}</div>
              ))}
            </div>
          )}
        </div>

        <div className="card border-emerald-500/20 bg-emerald-500/[0.04] p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-200">
            <ShieldIcon width={16} height={16} /> Privacidad
          </div>
          <p className="text-xs leading-relaxed text-emerald-100/80">
            Tus archivos se procesan temporalmente en memoria y no se almacenan en el servidor salvo
            que actives guardar proyecto.
            {needsKey && (
              <>
                {" "}
                Al traducir con <strong>{PROVIDER_LABELS[config.provider]}</strong>, el texto de los
                subtítulos se enviará a ese proveedor.
              </>
            )}
          </p>
        </div>

        <button className="btn-primary w-full" onClick={goTranslate} disabled={!parsed}>
          Continuar a traducir
        </button>
        <button className="btn-ghost w-full" onClick={() => setStep("home")}>
          Volver
        </button>
      </aside>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={["truncate text-right text-slate-200", mono ? "font-mono text-xs" : ""].join(" ")}>
        {value}
      </dd>
    </div>
  );
}
