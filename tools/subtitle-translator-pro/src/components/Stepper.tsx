"use client";

import type { AppStep } from "@/types";
import { useAppStore } from "@/store/useAppStore";
import { CheckIcon, DownloadIcon, EditIcon, SettingsIcon, TranslateIcon, UploadIcon } from "./Icons";

const STEPS: { id: AppStep; label: string; Icon: typeof UploadIcon }[] = [
  { id: "home", label: "Subir", Icon: UploadIcon },
  { id: "config", label: "Configurar", Icon: SettingsIcon },
  { id: "translate", label: "Traducir", Icon: TranslateIcon },
  { id: "edit", label: "Editar", Icon: EditIcon },
  { id: "export", label: "Exportar", Icon: DownloadIcon },
];

const ORDER: AppStep[] = ["home", "config", "translate", "edit", "export"];

export function Stepper() {
  const step = useAppStore((s) => s.step);
  const parsed = useAppStore((s) => s.parsed);
  const setStep = useAppStore((s) => s.setStep);
  const current = ORDER.indexOf(step);

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((s, i) => {
        const pos = ORDER.indexOf(s.id);
        const active = s.id === step;
        const done = pos < current;
        // Allow navigating to steps already reachable (needs a parsed file past home).
        const reachable = s.id === "home" || (!!parsed && pos <= Math.max(current, 1));
        return (
          <div key={s.id} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && setStep(s.id)}
              className={[
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand-600/20 text-brand-200 ring-1 ring-brand-500/40"
                  : done
                    ? "text-slate-200 hover:bg-slate-800/60"
                    : "text-slate-500",
                reachable ? "cursor-pointer" : "cursor-not-allowed",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                  active
                    ? "bg-brand-500 text-white"
                    : done
                      ? "bg-emerald-500/90 text-white"
                      : "bg-slate-800 text-slate-400",
                ].join(" ")}
              >
                {done ? <CheckIcon width={14} height={14} /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-slate-700/70" />}
          </div>
        );
      })}
    </nav>
  );
}
