import { useCallback, useEffect, useMemo, useState } from "react";
import { resources, aspects, fps } from "./catalog";
import Preview from "./Preview";
import Fields from "./Fields";
import ProjectPanel from "./ProjectPanel";
import ExportPanel from "./ExportPanel";
import LivePanel from "./LivePanel";
import {
  createProject,
  loadProjects,
  saveProject,
  type Project,
} from "./projects";
import "./projects.css";
import "./workflow.css";
import {
  defaults,
  catalogNames,
  resourceCatalog,
  isLiveResource,
  duration,
  familyNames,
  resourceName,
  resourceUrl,
  themes,
  timeLabel,
} from "./model";
import type { FieldValue, Resource, Values } from "./model";
function preferredResource(project: Project): string {
  const selected = project.template.resources;
  if (selected.length && selected.every((id) => id.startsWith("fraternidad-")))
    return selected.includes("fraternidad-lower-third") ? "fraternidad-lower-third" : selected[0];
  return "lower-third";
}
export default function App() {
  const [initial] = useState(() => {
    try {
      const saved = loadProjects().sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      return { project: saved[0] || createProject(), error: "" };
    } catch (e) {
      return { project: createProject(), error: (e as Error).message };
    }
  });
  const [selected, setSelected] = useState(() => preferredResource(initial.project));
  const [project, setProject] = useState<Project>(initial.project);
  const [saveError, setSaveError] = useState(initial.error),
    [saved, setSaved] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null),
    [livePreview, setLivePreview] = useState(false);
  const { drafts, theme, font } = project;
  const aspect = resources
    .find((r) => r.id === selected)!
    .aspects.includes(project.aspect)
    ? project.aspect
    : resources.find((r) => r.id === selected)!.aspects[0];
  const activeItem = project.items.find((item) => item.id === activeItemId);
  function changeProject(next: Project) {
    setSaved(false);
    setProject({ ...next, updatedAt: new Date().toISOString() });
  }
  const setAspect = (aspect: string) => changeProject({ ...project, aspect });
  const setTheme = (theme: string) => changeProject({ ...project, theme });
  const setFont = (font: string) => changeProject({ ...project, font });
  useEffect(() => {
    if (initial.error) return;
    try {
      saveProject(project);
      setSaved(true);
      setSaveError("");
    } catch (e) {
      setSaved(false);
      setSaveError((e as Error).message);
    }
  }, [project, initial.error]);
  function loadProject(next: Project) {
    setPlaying(false);
    setLivePreview(false);
    setActiveItemId(null);
    const selectedId = preferredResource(next);
    setSelected(selectedId);
    if (catalog !== "todas") setCatalog(resourceCatalog(resources.find((r) => r.id === selectedId)!));
    changeProject(next);
  }
  function chooseItem(id: string) {
    const item = project.items.find((i) => i.id === id);
    if (!item) return;
    setPlaying(false);
    setLivePreview(false);
    setActiveItemId(id);
    setSelected(item.resourceId);
    const nextResource = resources.find((r) => r.id === item.resourceId)!;
    if (!nextResource.aspects.includes(project.aspect)) setAspect(nextResource.aspects[0]);
    setTime(
      Math.min(
        3000,
        resources.find((r) => r.id === item.resourceId)!.durationMs * 0.45,
      ),
    );
    setProjectOpen(false);
  }
  const [query, setQuery] = useState(""),
    [family, setFamily] = useState("todas"),
    [catalog, setCatalog] = useState("todas");
  const [tab, setTab] = useState("contenido");
  const [time, setTime] = useState(3000),
    [playing, setPlaying] = useState(false),
    [ready, setReady] = useState(false);
  const [safe, setSafe] = useState(false),
    [background, setBackground] = useState("checker");
  const resource = resources.find((r) => r.id === selected)!;
  const values = useMemo(
    () => activeItem?.values || drafts[selected] || defaults(resource),
    [activeItem, drafts, selected, resource],
  );
  const total = duration(resource, values, aspect);
  const format = aspects[aspect as keyof typeof aspects];
  const liveConfig =
    project.live[activeItem?.id || selected] || project.live[selected];
  const sourceUrl = resourceUrl(resource, values, aspect, theme, font);
  const configQuery = new URLSearchParams();
  if (liveConfig) {
    configQuery.set("liveMode", liveConfig.mode);
    configQuery.set("liveDurationMs", String(liveConfig.durationMs));
    if (liveConfig.targetTime)
      configQuery.set("liveTargetTime", String(liveConfig.targetTime));
  }
  const baseUrl = sourceUrl + (configQuery.size ? "&" + configQuery : "");
  const liveChannel = `${project.id}-${activeItem?.id || selected}`
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 96);
  const liveParams = new URL(baseUrl, location.origin).searchParams;
  liveParams.set("channel", liveChannel);
  liveParams.set("autoplay", "1");
  const url = livePreview ? `/live/${resource.id}?${liveParams}` : baseUrl;
  const visible = resources.filter(
    (r) =>
      (catalog === "todas" || resourceCatalog(r) === catalog) &&
      (family === "todas" || r.family === family) &&
      `${resourceName(r)} ${r.name} ${familyNames[r.family]}`
        .toLocaleLowerCase("es")
        .includes(query.toLocaleLowerCase("es")),
  );
  const onReady = useCallback((value: boolean) => setReady(value), []);
  function pick(r: Resource) {
    if (r.id === selected && !activeItemId) return;
    setActiveItemId(null);
    setLivePreview(false);
    setPlaying(false);
    setSelected(r.id);
    const nextAspect = r.aspects.includes(aspect) ? aspect : r.aspects[0];
    setAspect(nextAspect);
    setTime(
      Math.min(
        3000,
        duration(r, drafts[r.id] || defaults(r), nextAspect) * 0.45,
      ),
    );
  }
  function fieldChange(key: string, value: FieldValue) {
    setPlaying(false);
    updateValues({ ...values, [key]: value });
  }
  function updateValues(next: Values) {
    if (activeItem)
      changeProject({
        ...project,
        items: project.items.map((i) =>
          i.id === activeItem.id ? { ...i, values: next } : i,
        ),
      });
    else changeProject({ ...project, drafts: { ...drafts, [selected]: next } });
  }
  function seek(value: number) {
    setPlaying(false);
    setTime(Math.max(0, Math.min(total, value)));
  }
  useEffect(() => {
    setTime((t) => Math.min(t, total));
  }, [total]);
  useEffect(() => {
    if (!playing || !ready || !total || livePreview) return;
    let request: number;
    const start = performance.now(),
      initial = time >= total ? 0 : time;
    function tick(now: number) {
      const elapsed =
        (Math.floor(((initial + now - start) * fps) / 1000) * 1000) / fps;
      if (!resource.loop && elapsed >= total) {
        setTime(total);
        setPlaying(false);
        return;
      }
      setTime(resource.loop ? elapsed % total : elapsed);
      request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
    // El tiempo inicial se captura una vez al comenzar la reproducción.
  }, [playing, ready, total, resource.loop, livePreview]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (projectOpen || exportOpen || livePreview) return;
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,button,[contenteditable]",
        )
      )
        return;
      if (event.code === "Space" && ready && total && !livePreview) {
        event.preventDefault();
        setPlaying((p) => !p);
      }
      if (event.code === "ArrowRight" || event.code === "ArrowLeft") {
        event.preventDefault();
        setPlaying(false);
        setTime((t) =>
          Math.max(
            0,
            Math.min(
              total,
              t + ((event.code === "ArrowRight" ? 1 : -1) * 1000) / fps,
            ),
          ),
        );
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [ready, total, projectOpen, exportOpen, livePreview]);
  const liveClock = isLiveResource(resource, values);
  const fraternidad = resourceCatalog(resource) === "fraternidad";
  return (
    <div className="studio-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-word">
            FRA<span>TV</span>
          </span>
          <span className="brand-divider" />
          <div>
            <strong>Overlay Studio</strong>
            <small>CONTENIDO DIGITAL HUMANO</small>
          </div>
        </div>
        <div className="project-heading">
          <strong>{project.name}</strong>
          <small role="status">
            {saveError
              ? "Error de guardado"
              : saved
                ? "Guardado en este navegador"
                : "Guardando…"}
          </small>
        </div>
        <nav className="workflow-nav" aria-label="Producción">
          <button className="secondary" onClick={() => setProjectOpen(true)}>
            Programa y proyectos
          </button>
          <button
            className="primary-action"
            onClick={() => setExportOpen(true)}
          >
            Exportar
          </button>
        </nav>
      </header>
      {saveError && (
        <div role="alert" className="save-warning">
          No se pudo guardar: {saveError}. Exporta el proyecto para conservar
          los cambios.
        </div>
      )}
      {project.items.length > 0 && (
        <div className="episode-strip">
          <label>
            Piezas del episodio
            <select
              aria-label="Pieza del episodio"
              value={activeItemId || ""}
              onChange={(e) => {
                if (e.target.value) chooseItem(e.target.value);
                else {
                  setActiveItemId(null);
                  setLivePreview(false);
                }
              }}
            >
              <option value="">Biblioteca original</option>
              {project.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <span>{project.items.length} piezas preparadas</span>
        </div>
      )}
      <div className="workspace">
        <aside className="library" aria-label="Biblioteca de recursos">
          <div className="section-heading">
            <h2>Biblioteca</h2>
            <span className="count">{visible.length}</span>
          </div>
          <p className="muted">Tu identidad, lista para salir al aire.</p>
          <div className="search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Buscar recurso"
              placeholder="Buscar un recurso…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                aria-label="Limpiar búsqueda"
                onClick={() => setQuery("")}
              >
                ×
              </button>
            )}
          </div>
          <label className="sr-only" htmlFor="catalog">Identidad</label>
          <select id="catalog" className="family-filter catalog-filter" value={catalog} onChange={(e) => setCatalog(e.target.value)}>
            <option value="todas">Todas las identidades</option>
            {Object.entries(catalogNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          <label className="sr-only" htmlFor="family">
            Familia
          </label>
          <select
            id="family"
            className="family-filter"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
          >
            <option value="todas">Todas las familias</option>
            {Object.entries(familyNames).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
          <div className="resource-list">
            {Object.entries(familyNames).map(([key, name]) => {
              const group = visible.filter((r) => r.family === key);
              if (!group.length) return null;
              return (
                <section key={key}>
                  <h3>
                    {name}
                    <span>{group.length.toString().padStart(2, "0")}</span>
                  </h3>
                  {group.map((r) => (
                    <button
                      className={`resource-card ${selected === r.id ? "active" : ""}`}
                      key={r.id}
                      data-resource={r.id}
                      aria-pressed={selected === r.id}
                      onClick={() => pick(r)}
                    >
                      <div className={`thumbnail ${resourceCatalog(r) === "fraternidad" ? "fraternidad-thumbnail" : ""}`}>
                        <img
                          loading="lazy"
                          src={resourceCatalog(r) === "fraternidad" ? "/media/assets/eventos/fraternidad-horizontal-blanco.png" : `/reference/${r.id}.png`}
                          alt=""
                        />
                      </div>
                      <div className="resource-copy">
                        <strong>{resourceName(r)}</strong>
                        <small>
                          {r.durationMs
                            ? timeLabel(r.durationMs)
                            : "Permanente"}{" "}
                          <span>·</span> {r.alpha ? "Alfa" : "Fondo pleno"}
                        </small>
                      </div>
                      <span className="selection-mark">
                        {selected === r.id ? "●" : "›"}
                      </span>
                    </button>
                  ))}
                </section>
              );
            })}
            {!visible.length && (
              <p className="no-results">
                No encontramos ese recurso. Prueba otro nombre o familia.
              </p>
            )}
          </div>
          <footer className="library-footer">
            <span className="small-dot" />
            {resources.length} recursos · tres identidades
          </footer>
        </aside>
        <main className="editor-main">
          <div className="editor-heading">
            <div>
              <div className="eyebrow">
                {familyNames[resource.family]} <span>/</span> VISTA PREVIA
              </div>
              <h1>{activeItem?.label || resourceName(resource)}</h1>
            </div>
            <span className="resource-kind">
              {resource.alpha ? "◈ Transparencia" : "▣ Fondo pleno"}
            </span>
          </div>
          <div className="canvas-toolbar">
            <div className="format-control">
              <label htmlFor="aspect">Formato</label>
              <select
                id="aspect"
                value={aspect}
                onChange={(e) => {
                  setPlaying(false);
                  setAspect(e.target.value);
                }}
              >
                {Object.keys(aspects).map((a) => (
                  <option
                    key={a}
                    value={a}
                    disabled={!resource.aspects.includes(a)}
                  >
                    {a} ·{" "}
                    {
                      {
                        "16:9": "Horizontal",
                        "9:16": "Vertical",
                        "1:1": "Cuadrado",
                        "4:5": "Retrato",
                      }[a]
                    }
                  </option>
                ))}
              </select>
            </div>
            <label className="safe-toggle">
              <input
                type="checkbox"
                checked={safe}
                onChange={(e) => setSafe(e.target.checked)}
              />
              Área segura
            </label>
          </div>
          <div className="stage-area">
            <Preview
              live={livePreview}
              selfManagedFonts={fraternidad}
              url={url}
              width={format.w}
              height={format.h}
              time={time}
              font={font}
              background={background}
              safe={safe}
              areas={format.safeAreas}
              onReady={onReady}
            />
          </div>
          <div className="canvas-footer">
            <span>
              {format.w} × {format.h} <b>·</b> {fps} fps <b>·</b> Ajustar al
              espacio
            </span>
            <div
              className="background-switch"
              aria-label="Fondo de vista previa"
            >
              <span>Fondo</span>
              {[
                ["checker", "Transparente"],
                ["black", "Negro"],
                ["ivory", "Marfil"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`swatch ${value} ${background === value ? "chosen" : ""}`}
                  aria-label={`Fondo ${label.toLowerCase()}`}
                  aria-pressed={background === value}
                  title={label}
                  onClick={() => setBackground(value)}
                />
              ))}
            </div>
          </div>
          {["1:1", "4:5"].includes(aspect) && (
            <p className="stage-notice">
              Formato disponible, pendiente de revisión visual pieza por pieza.
            </p>
          )}
          <section className="timeline" aria-label="Control de tiempo">
            <div className="transport">
              <div className="playback-buttons">
                <button
                  aria-label="Volver al inicio"
                  title="Volver al inicio"
                  disabled={livePreview || !total || !ready}
                  onClick={() => seek(0)}
                >
                  ↤
                </button>
                <button
                  aria-label="Cuadro anterior"
                  title="Cuadro anterior · ←"
                  disabled={livePreview || !total || !ready}
                  onClick={() => seek(time - 1000 / fps)}
                >
                  ‹
                </button>
                <button
                  className="play-button"
                  aria-label={playing ? "Pausar" : "Reproducir"}
                  title="Reproducir / pausar · espacio"
                  disabled={livePreview || !total || !ready}
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? "Ⅱ" : "▶"}
                </button>
                <button
                  aria-label="Cuadro siguiente"
                  title="Cuadro siguiente · →"
                  disabled={livePreview || !total || !ready}
                  onClick={() => seek(time + 1000 / fps)}
                >
                  ›
                </button>
              </div>
              <div className="time-readout">
                <strong>{timeLabel(time)}</strong>
                <span>/ {total ? timeLabel(total) : "Permanente"}</span>
              </div>
              <span className="loop-label">
                {total
                  ? resource.loop
                    ? "↻ Bucle"
                    : "Una pasada"
                  : liveClock
                    ? "Reloj en vivo"
                    : "Recurso estático"}
              </span>
            </div>
            <div className="timeline-track">
              <div className="ruler">
                {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                  <span key={f}>{timeLabel(total * f)}</span>
                ))}
              </div>
              <input
                aria-label="Tiempo"
                type="range"
                min="0"
                max={total || 1}
                step={1000 / fps}
                value={time}
                disabled={livePreview || !total || !ready}
                onChange={(e) => seek(Number(e.target.value))}
              />
              <div className="clip-bar">
                <span>{resourceName(resource)}</span>
                <span>
                  {total
                    ? `${Math.round((total * fps) / 1000)} cuadros`
                    : "Sin animación temporal"}
                </span>
              </div>
            </div>
            <div className="timeline-note">
              {livePreview
                ? "Fuente viva conectada al panel de OBS. El transporte del editor no controla su reloj."
                : liveClock
                  ? fraternidad ? "El reloj de edición es una muestra. Abre En vivo para controlar la cuenta compartida con OBS." : "El reloj avanza en tiempo real, incluso con la animación en pausa."
                  : "Espacio para reproducir · Flechas para avanzar cuadro a cuadro"}
            </div>
          </section>
        </main>
        <aside className="inspector" aria-label="Controles del recurso">
          <div className="section-heading">
            <h2>Personalizar</h2>
            <span className="inspector-icon">☷</span>
          </div>
          <div className="tabs" role="tablist" aria-label="Controles">
            <button
              role="tab"
              id="tab-content"
              aria-controls="panel-content"
              aria-selected={tab === "contenido"}
              onClick={() => setTab("contenido")}
            >
              Contenido
            </button>
            <button
              role="tab"
              id="tab-style"
              aria-controls="panel-style"
              aria-selected={tab === "estilo"}
              onClick={() => setTab("estilo")}
            >
              Estilo
            </button>
            {liveClock && (
              <button
                role="tab"
                id="tab-live"
                aria-controls="panel-live"
                aria-selected={tab === "vivo"}
                onClick={() => setTab("vivo")}
              >
                En vivo
              </button>
            )}
          </div>
          <div
            className="inspector-scroll"
            role="tabpanel"
            id={
              tab === "contenido"
                ? "panel-content"
                : tab === "vivo"
                  ? "panel-live"
                  : "panel-style"
            }
            aria-labelledby={
              tab === "contenido"
                ? "tab-content"
                : tab === "vivo"
                  ? "tab-live"
                  : "tab-style"
            }
          >
            {tab === "vivo" && liveClock ? (
              <>
                <LivePanel
                  config={liveConfig}
                  onConfigChange={(config) =>
                    changeProject({
                      ...project,
                      live: {
                        ...project.live,
                        [selected]: config,
                        [activeItem?.id || selected]: config,
                      },
                    })
                  }
                  key={liveChannel}
                  channel={liveChannel}
                  sourceUrl={baseUrl}
                  resourceId={resource.id}
                  defaultMode={resource.liveMode}
                  aspect={aspect}
                  onPreview={() => {
                    setPlaying(false);
                    setLivePreview(true);
                  }}
                />
                {livePreview && (
                  <button
                    className="secondary full"
                    onClick={() => setLivePreview(false)}
                  >
                    Volver a vista previa de edición
                  </button>
                )}
              </>
            ) : tab === "contenido" || tab === "vivo" ? (
              <>
                <div className="panel-intro">
                  <h3>Hazlo tuyo</h3>
                  <p>Cambia el contenido y revisa el resultado en el lienzo.</p>
                </div>
                <Fields
                  resource={resource}
                  values={values}
                  onChange={fieldChange}
                />
                <button
                  className="text-button"
                  onClick={() => {
                    setPlaying(false);
                    updateValues(defaults(resource));
                  }}
                >
                  ↺ Restablecer contenido
                </button>
              </>
            ) : (
              <>
                <div className="panel-intro">
                  <h3>Una misma identidad</h3>
                  <p>
                    {fraternidad ? "Fraternidad conserva su paleta aprobada. Puedes elegir la tipografía del proyecto y comparar el resultado." : "El tema y la tipografía se aplican a los recursos compatibles de este proyecto."}
                  </p>
                </div>
                <div className={`palette-preview ${fraternidad ? "fraternidad-palette" : ""}`}>
                  <i />
                  <i />
                  <i />
                </div>
                <div className="field">
                  <label htmlFor="theme">Tema</label>
                  <select
                    id="theme"
                    disabled={fraternidad}
                    value={fraternidad ? "fraternidad" : theme}
                    onChange={(e) => {
                      setPlaying(false);
                      setTheme(e.target.value);
                    }}
                  >
                    {fraternidad ? <option value="fraternidad">Fraternidad · azul, dorado y marfil</option> : themes.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="font">Tipografía</label>
                  <select
                    id="font"
                    value={font}
                    onChange={(e) => {
                      setPlaying(false);
                      setFont(e.target.value);
                    }}
                  >
                    <option value="aprobado">
                      {fraternidad ? "Aprobada · Manrope + IBM Plex Mono" : "Oficial · Poppins + JetBrains Mono"}
                    </option>
                    <option value="editorial">
                      Editorial · Instrument Sans + IBM Plex
                    </option>
                    <option value="neutro">{fraternidad ? "Neutra · Inter + IBM Plex Mono" : "Neutra · Inter + Roboto Mono"}</option>
                  </select>
                  <p className="field-note">
                    Las fuentes se cargan desde Google Fonts. Necesitas conexión
                    a internet.
                  </p>
                </div>
                <div className="brand-note">
                  <strong>La composición se conserva</strong>
                  <p>
                    {fraternidad ? "Manrope conserva el diseño aprobado. Editorial y Neutra son alternativas opcionales; los logos y colores se mantienen." : "Los temas cambian color y tipografía sobre los recursos originales."}
                  </p>
                </div>
              </>
            )}
          </div>
          <footer className="inspector-footer">
            <button
              className="secondary full"
              onClick={() => {
                setPlaying(false);
                changeProject({
                  ...project,
                  theme: "fratv-oficial",
                  font: "aprobado",
                });
              }}
            >
              ↺ Identidad oficial
            </button>
            <p>Guardado local · exporta una copia del proyecto</p>
          </footer>
        </aside>
      </div>
      <footer className="statusbar">
        <span>
          <i className={ready ? "small-dot" : "small-dot pending"} />
          {ready ? "Vista previa lista" : "Preparando vista previa…"}
        </span>
        <span>
          FRATV OVERLAY STUDIO <b>·</b> 0.2.0
        </span>
      </footer>
      {projectOpen && (
        <ProjectPanel
          project={project}
          onChange={changeProject}
          onClose={() => setProjectOpen(false)}
          onSelectItem={chooseItem}
          onProjectSelected={loadProject}
        />
      )}
      <ExportPanel
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        project={project}
        current={{
          id: activeItem?.id || selected,
          resourceId: selected,
          label: activeItem?.label || resourceName(resource),
          values,
        }}
        time={time}
      />
    </div>
  );
}
