import { useEffect, useState } from "react";
import { resources, aspects as catalogAspects } from "./catalog";
import {
  defaults,
  catalogNames,
  resourceCatalog,
  duration,
  resourceName,
  resourceUrl,
  type Values,
} from "./model";
import type { Project } from "./projects";
interface Job {
  id: string;
  status: string;
  progress: number;
  message?: string;
  error?: string;
  download?: string;
  warnings?: string[];
}
const labels: Record<string, string> = {
  png: "PNG · cuadro con transparencia",
  mov: "MOV · video ProRes 4444",
  mp4: "MP4 · video sobre negro",
  html: "OBS · fuentes vivas y panel de control",
};
export default function ExportPanel({
  open,
  onClose,
  project,
  current,
  time,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  current: { id: string; resourceId: string; label: string; values: Values };
  time: number;
}) {
  const [scope, setScope] = useState("current");
  const [catalog, setCatalog] = useState(() => resourceCatalog(resources.find((r) => r.id === current.resourceId)!));
  useEffect(() => {
    if (open) {
      const resource = resources.find((r) => r.id === current.resourceId)!;
      setCatalog(resourceCatalog(resource));
      setAspects([resource.aspects.includes(project.aspect) ? project.aspect : resource.aspects[0]]);
    }
  }, [open, current.resourceId, project.aspect]);
  const [formats, setFormats] = useState(["png", "html"]);
  const [aspects, setAspects] = useState([project.aspect]);
  const [job, setJob] = useState<Job | null>(null),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Job[]>([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/exports")
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "No se pudo recuperar el historial de exportaciones.",
          );
        return r.json();
      })
      .then((rows: Job[]) => {
        if (alive) {
          setHistory(rows);
          if (!job && rows.length) setJob(rows[0]);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [open]);
  const active =
    !!job && !["completed", "done", "failed", "cancelled"].includes(job.status);
  useEffect(() => {
    if (!active || !job) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/exports/${job.id}`);
        const data = await r.json();
        if (!r.ok)
          throw new Error(data.error || "No se pudo consultar la exportación.");
        if (alive) {
          setJob(data);
          setError("");
        }
      } catch (e) {
        if (alive) setError(String((e as Error).message));
      }
    }, 800);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active, job?.id]);
  const bases =
    scope === "current"
      ? [current]
      : scope === "program"
        ? project.items
        : resources.filter((r) => catalog === "todas" || resourceCatalog(r) === catalog).map((r) => ({
            id: r.id,
            resourceId: r.id,
            label: resourceName(r),
            values: project.drafts[r.id] || defaults(r),
          }));
  const items = bases.flatMap((item) => {
    const r = resources.find((r) => r.id === item.resourceId)!;
    const live = project.live[item.id] || project.live[r.id];
    const extra = new URLSearchParams();
    if (live) {
      extra.set("liveMode", live.mode);
      extra.set("liveDurationMs", String(live.durationMs));
      if (live.targetTime) extra.set("liveTargetTime", String(live.targetTime));
    }
    return aspects
      .filter((a) => r.aspects.includes(a))
      .map((a) => ({
        id: `${item.id}-${a.replace(":", "x")}`,
        label: item.label,
        resourceId: r.id,
        channel: `${project.id}-${item.id}`
          .replace(/[^a-zA-Z0-9_-]/g, "-")
          .slice(0, 96),
        aspect: a,
        url:
          resourceUrl(r, item.values, a, project.theme, project.font) +
          (extra.size ? "&" + extra : ""),
        time:
          scope === "current"
            ? time
            : Math.min(3000, duration(r, item.values, a) * 0.45),
        durationMs: duration(r, item.values, a),
      }));
  });
  async function start() {
    setError("");
    setJob(null);
    setSending(true);
    try {
      const r = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, formats, project }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.error || "No se pudo comenzar la exportación.");
      setJob(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  async function cancel() {
    try {
      const r = await fetch(`/api/exports/${job!.id}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setJob(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!open) return null;
  return (
    <div className="dialog-shade">
      <section
        className="workflow-dialog export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        <header>
          <div>
            <small>PAQUETE DE PRODUCCIÓN</small>
            <h2 id="export-title">Exportador general</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar exportador">
            ×
          </button>
        </header>
        <div className="dialog-content">
          <p className="workflow-intro">
            Prepara los archivos y las fuentes de OBS en un solo ZIP. El
            proyecto editable también va incluido.
          </p>
          <label>
            Qué exportar
            <select
              aria-label="Qué exportar"
              value={scope}
              disabled={active}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="current">Recurso abierto · {current.label}</option>
              <option value="program" disabled={!project.items.length}>
                Programa completo · {project.items.length} piezas
              </option>
              <option value="all">Biblioteca por identidad</option>
            </select>
          </label>
          {scope === "all" && <label>Identidad a exportar
            <select aria-label="Identidad a exportar" value={catalog} disabled={active} onChange={(e) => setCatalog(e.target.value)}>
              {Object.entries(catalogNames).map(([key, name]) => <option key={key} value={key}>{name} · {resources.filter((r) => resourceCatalog(r) === key).length} recursos</option>)}
              <option value="todas">Todas · {resources.length} recursos</option>
            </select>
          </label>}
          <fieldset disabled={active}>
            <legend>Formatos del lienzo</legend>
            <div className="option-grid">
              {Object.keys(catalogAspects).map((a) => (
                <label key={a}>
                  <input
                    type="checkbox"
                    checked={aspects.includes(a)}
                    onChange={(e) =>
                      setAspects(
                        e.target.checked
                          ? [...aspects, a]
                          : aspects.filter((x) => x !== a),
                      )
                    }
                  />
                  {a}
                </label>
              ))}
            </div>
            <p className="field-note">
              Cada recurso se incluye solo en sus formatos compatibles. 1:1 y
              4:5 están pendientes de revisión visual completa.
            </p>
          </fieldset>
          <fieldset disabled={active}>
            <legend>Archivos de salida</legend>
            {Object.entries(labels).map(([key, label]) => (
              <label className="export-option" key={key}>
                <input
                  type="checkbox"
                  checked={formats.includes(key)}
                  onChange={(e) =>
                    setFormats(
                      e.target.checked
                        ? [...formats, key]
                        : formats.filter((x) => x !== key),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="brand-note">
            <strong>La gráfica y el reloj son cosas distintas</strong>
            <p>
              El PNG captura un instante. Los relojes reales se entregan como
              fuentes vivas para OBS; no como videos con una cuenta que se
              agota. El paquete OBS incluye su panel de control y las
              instrucciones de apertura.
            </p>
          </div>
          <p className="field-note">
            {items.length} piezas/formato · videos a 60 fps · los videos pueden
            tardar varios minutos. Los logos del catálogo viajan en el paquete
            OBS. Los logos externos siguen necesitando conexión.
          </p>
          {history.length > 0 && !active && (
            <label>
              Exportaciones anteriores
              <select
                aria-label="Exportaciones anteriores"
                value={job?.id || ""}
                onChange={(e) =>
                  setJob(history.find((j) => j.id === e.target.value) || null)
                }
              >
                <option value="">Selecciona un paquete</option>
                {history.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.message || j.status} · {j.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <p role="alert" className="workflow-error">
              {error}
            </p>
          )}
          {items.length > 60 && <p className="workflow-error">El máximo es 60 combinaciones por paquete. Selecciona menos formatos o exporta el programa en dos lotes.</p>}
          {job && (
            <div className="export-progress" role="status">
              <strong>{job.message || job.status}</strong>
              <progress max="100" value={job.progress} />
              <span>{Math.round(job.progress)} %</span>
              {job.error && <p className="workflow-error">{job.error}</p>}
              {job.warnings?.map((w) => (
                <p className="field-note" key={w}>
                  {w}
                </p>
              ))}
              {job.download && (
                <a className="primary-action" href={job.download} download>
                  Descargar paquete ZIP
                </a>
              )}
              {active && (
                <button className="secondary" onClick={cancel}>
                  Cancelar exportación
                </button>
              )}
            </div>
          )}
        </div>
        <footer>
          <span>
            {active
              ? "Puedes cerrar este panel y volver a consultar el progreso."
              : "Los recursos originales no se modifican."}
          </span>
          <button
            className="primary-action"
            onClick={start}
            disabled={
              active ||
              sending ||
              !items.length ||
              !formats.length ||
              items.length > 60
            }
          >
            {sending ? "Preparando…" : "Exportar paquete"}
          </button>
        </footer>
      </section>
    </div>
  );
}
