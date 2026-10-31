"use client";

import { useAppStore } from "@/store/useAppStore";
import { Stepper } from "./Stepper";
import { HomeScreen } from "./screens/HomeScreen";
import { ConfigScreen } from "./screens/ConfigScreen";
import { TranslateScreen } from "./screens/TranslateScreen";
import { EditScreen } from "./screens/EditScreen";
import { ExportScreen } from "./screens/ExportScreen";
import { TranslateIcon } from "./Icons";

export function AppShell() {
  const step = useAppStore((s) => s.step);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800/70 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button
            className="flex items-center gap-2.5"
            onClick={() => useAppStore.getState().setStep("home")}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-900/40">
              <TranslateIcon width={20} height={20} />
            </span>
            <span className="text-left">
              <span className="block text-sm font-bold leading-tight text-white">
                Subtitle Translator <span className="text-brand-400">Pro</span>
              </span>
              <span className="block text-[11px] leading-tight text-slate-500">
                .srt · .vtt — formato intacto
              </span>
            </span>
          </button>
          <Stepper />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {step === "home" && <HomeScreen />}
        {step === "config" && <ConfigScreen />}
        {step === "translate" && <TranslateScreen />}
        {step === "edit" && <EditScreen />}
        {step === "export" && <ExportScreen />}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-4 text-center text-xs text-slate-600">
        Procesamiento temporal en memoria · No se almacenan archivos · Traduce solo contenido
        autorizado.
      </footer>
    </div>
  );
}
