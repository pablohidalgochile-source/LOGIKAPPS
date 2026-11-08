import { useEffect, useState } from "react";
import type { LiveConfig } from "./projects";
interface LiveState {
  mode: "countdown" | "elapsed";
  valueMs: number;
  running: boolean;
  visible: boolean;
  durationMs: number;
}
export default function LivePanel({
  channel,
  sourceUrl,
  resourceId,
  defaultMode,
  aspect,
  onPreview,
  config,
  onConfigChange,
}: {
  channel: string;
  sourceUrl: string;
  resourceId: string;
  defaultMode?: "countdown" | "elapsed";
  aspect: string;
  onPreview: () => void;
  config?: LiveConfig;
  onConfigChange: (config: LiveConfig) => void;
}) {
  const [state, setState] = useState<LiveState | null>(null),
    [error, setError] = useState(""),
    [copied, setCopied] = useState("");
  const [minutes, setMinutes] = useState(
      String((config?.durationMs ?? 300000) / 60000),
    ),
    [target, setTarget] = useState(""),
    [mode, setMode] = useState<string>(
      config?.mode || defaultMode || (resourceId === "live-badge" ? "elapsed" : "countdown"),
    );
  useEffect(() => {
    let alive = true;
    setState(null);
    async function poll() {
      try {
        const params = new URL(sourceUrl, location.origin).searchParams;
        const seed = new URLSearchParams({
          mode:
            config?.mode || defaultMode ||
            (resourceId === "live-badge" ? "elapsed" : "countdown"),
        });
        if (config) {
          seed.set("durationMs", String(config.durationMs));
          if (config.targetTime)
            seed.set("targetTime", String(config.targetTime));
        } else {
          const target = params.get("target") || params.get("clockTarget");
          if (target) seed.set("target", target);
        }
        const r = await fetch(`/api/live/${channel}?${seed}`);
        const data = await r.json();
        if (!r.ok)
          throw new Error(data.error || "No se pudo consultar el reloj.");
        if (alive) {
          setState(data);
          setError("");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    void poll();
    const timer = setInterval(poll, 500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [channel]);
  async function action(action: string, extra: Record<string, unknown> = {}) {
    try {
      const r = await fetch(`/api/live/${channel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.error || "No se pudo controlar el reloj.");
      setState(data);
      setError("");
      if (action === "configure") {
        const next: LiveConfig = {
          mode: data.mode,
          durationMs: Math.min(86400000, data.durationMs),
        };
        if (extra.targetTime) next.targetTime = Number(extra.targetTime);
        onConfigChange(next);
        setMode(data.mode);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied("Selecciona la URL y cópiala manualmente.");
    }
  }
  const q = new URL(sourceUrl, location.origin).searchParams;
  q.set("channel", channel);
  q.set("autoplay", "1");
  const liveUrl = `${location.origin}/live/${resourceId}?${q}`;
  const dockUrl = `${location.origin}/live-control?channel=${encodeURIComponent(channel)}`;
  const valueSeconds = (state?.valueMs || 0) / 1000;
  const seconds = Math.max(0, state?.mode === "countdown" ? Math.ceil(valueSeconds) : Math.floor(valueSeconds));
  const readout = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((x) => String(x).padStart(2, "0"))
    .join(":");
  return (
    <div className="live-panel">
      <div className="panel-intro">
        <h3>Control en vivo · OBS</h3>
        <p>
          La fuente de navegador y este panel comparten el mismo reloj. Mantén
          el servidor local abierto durante la transmisión.
        </p>
      </div>
      <div className="live-readout">
        {readout}
        <small>
          {state?.running ? "En marcha" : "En pausa"} ·{" "}
          {state?.visible ? "Visible" : "Oculto"}
        </small>
      </div>
      <label>
        Modo
        <select
          aria-label="Modo del reloj"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="countdown">Cuenta regresiva</option>
          <option value="elapsed">Tiempo transcurrido</option>
        </select>
      </label>
      <label>
        Duración en minutos
        <input
          aria-label="Duración en minutos"
          type="number"
          min="0.1"
          max="1440"
          step="0.1"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </label>
      <button
        className="secondary full"
        disabled={
          !Number(minutes) || Number(minutes) < 0 || Number(minutes) > 1440
        }
        onClick={() =>
          action("configure", { mode, durationMs: Number(minutes) * 60000 })
        }
      >
        Aplicar duración
      </button>
      <div className="live-actions">
        <button
          className="primary-action"
          onClick={() => action(state?.running ? "pause" : "start")}
        >
          {state?.running ? "Pausar reloj" : "Iniciar reloj"}
        </button>
        <button className="secondary" onClick={() => action("reset")}>
          Reiniciar
        </button>
        <button
          className="secondary"
          onClick={() => action(state?.visible ? "hide" : "show")}
        >
          {state?.visible ? "Ocultar gráfica" : "Mostrar gráfica"}
        </button>
      </div>
      <label>
        O terminar a una hora
        <input
          aria-label="Hora objetivo en vivo"
          type="datetime-local"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </label>
      <button
        className="secondary full"
        disabled={!target || !Number.isFinite(new Date(target).getTime())}
        onClick={() =>
          action("configure", {
            mode: "countdown",
            targetTime: new Date(target).getTime(),
          })
        }
      >
        Fijar hora objetivo
      </button>
      <button className="text-button" onClick={onPreview}>
        Ver la fuente en vivo en el lienzo
      </button>
      <div className="live-links">
        <label>
          URL de la fuente · {aspect}
          <input
            aria-label="URL de la fuente OBS"
            readOnly
            value={liveUrl}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <button
          className="secondary full"
          onClick={() => copy(liveUrl, "URL de la fuente copiada")}
        >
          Copiar fuente para OBS
        </button>
        <label>
          Panel para un dock de OBS
          <input
            aria-label="URL del panel OBS"
            readOnly
            value={dockUrl}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <button
          className="secondary full"
          onClick={() => copy(dockUrl, "URL del panel copiada")}
        >
          Copiar panel de control
        </button>
        <p className="field-note">
          En OBS: agrega una Fuente de navegador con la resolución del formato.
          Luego agrega el panel como dock de navegador personalizado. El reloj
          conserva su estado al recargar la fuente.
        </p>
      </div>
      {copied && (
        <p role="status" className="field-note">
          {copied}
        </p>
      )}
      {error && (
        <p role="alert" className="workflow-error">
          {error}
        </p>
      )}
    </div>
  );
}
