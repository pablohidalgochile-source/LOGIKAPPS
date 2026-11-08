import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  builtInTemplates,
  createProject,
  deleteProject,
  prepareProject,
  generationWarnings,
  loadProjects,
  loadTemplates,
  MAX_PROJECT_BYTES,
  parseBrief,
  resources,
  saveProject,
  saveTemplate,
  serializeProject,
  validateProject,
} from "./projects.ts";
import type {
  Episode,
  ParsedBrief,
  ProgramTemplate,
  Project,
} from "./projects.ts";
import { familyNames, resourceName, catalogNames, resourceCatalog, isLiveResource, defaults } from "./model.ts";
import "./projects.css";

interface Props {
  project: Project;
  onChange: (project: Project) => void;
  onClose: () => void;
  onSelectItem: (itemId: string) => void;
  onProjectSelected: (project: Project) => void;
}
const briefExample =
  "Programa: Conversaciones FRATV\nFecha: 2026-11-01T21:00\nConductor: Ana Pérez\nCargo conductor: Conductora\nInvitado: Juan Soto | Músico\nInvitado: María Lagos | Directora\nTema: Cultura y comunidad\nTema: Próximas actividades\nAuspiciador: Nombre del auspiciador";
function downloadProject(project: Project) {
  const blob = new Blob([serializeProject(project)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `${project.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_-]/g, "-").slice(0, 60) || "programa"}.fratv.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function ProjectPanel({
  project,
  onChange,
  onClose,
  onSelectItem,
  onProjectSelected,
}: Props) {
  const [tab, setTab] = useState("episodio");
  const [saved, setSaved] = useState<Project[]>([]),
    [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [templateCatalog, setTemplateCatalog] = useState("todas");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [newName, setNewName] = useState("Nuevo programa");
  const [deleteId, setDeleteId] = useState<string | null>(null),
    [replace, setReplace] = useState(false);
  const [brief, setBrief] = useState(""),
    [parsed, setParsed] = useState<ParsedBrief | null>(null);
  const [imported, setImported] = useState<Project | null>(null);
  const dialog = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  function run(action: () => void) {
    setError("");
    setNotice("");
    try {
      action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function refresh() {
    run(() => {
      setSaved(loadProjects());
      setTemplates(loadTemplates());
    });
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHandler.current();
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(
        dialog.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ),
      ).filter((el) => el.getClientRects().length);
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  function change(next: Project) {
    onChange({ ...next, updatedAt: new Date().toISOString() });
    setReplace(false);
  }
  function episode(patch: Partial<Episode>) {
    change({ ...project, episode: { ...project.episode, ...patch } });
  }
  function selectProject(value: Project) {
    onProjectSelected(value);
    setNotice(`Proyecto «${value.name}» abierto.`);
    setTab("episodio");
    setImported(null);
    setReplace(false);
  }
  function prepare() {
    run(() => {
      const next = prepareProject(project);
      validateProject(next);
      onChange(next);
      setReplace(false);
      setNotice(
        `${next.items.length} piezas preparadas. Revisa los textos antes de exportar.`,
      );
    });
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    setImported(null);
    try {
      if (file.size > MAX_PROJECT_BYTES)
        throw new Error("El archivo supera el máximo de 8 MB.");
      const value = validateProject(JSON.parse(await file.text()));
      setImported(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  }
  async function importBrief(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 100000)
        throw new Error("El brief supera los 100.000 caracteres.");
      const text = await file.text();
      setBrief(text);
      setParsed(parseBrief(text));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const warnings = generationWarnings(project);
  return (
    <div className="project-overlay">
      <div
        className="project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-heading"
        ref={dialog}
      >
        <header className="project-header">
          <div>
            <span className="project-eyebrow">PREPARACIÓN DE PROGRAMA</span>
            <h2 id="project-heading">{project.name}</h2>
          </div>
          <button
            ref={close}
            onClick={onClose}
            aria-label="Cerrar preparación de programa"
          >
            ×
          </button>
        </header>
        <nav className="project-tabs" aria-label="Preparación">
          <button
            aria-pressed={tab === "episodio"}
            onClick={() => setTab("episodio")}
          >
            Episodio
          </button>
          <button
            aria-pressed={tab === "plantilla"}
            onClick={() => setTab("plantilla")}
          >
            Plantilla
          </button>
          <button
            aria-pressed={tab === "importar"}
            onClick={() => setTab("importar")}
          >
            Importador general
          </button>
          <button
            aria-pressed={tab === "proyectos"}
            onClick={() => {
              setTab("proyectos");
              refresh();
            }}
          >
            Mis proyectos
          </button>
        </nav>
        {error && (
          <div className="project-message error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="project-message" role="status">
            {notice}
          </div>
        )}
        <div className="project-body">
          {tab === "episodio" && (
            <div className="project-columns">
              <section>
                <h3>Los datos de hoy</h3>
                <p className="project-help">
                  Escríbelos una vez. La plantilla prepara las piezas del
                  programa con esta información.
                </p>
                <div className="project-grid">
                  <label>
                    Nombre del proyecto
                    <input
                      maxLength={120}
                      value={project.name}
                      onChange={(e) =>
                        change({ ...project, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Nombre del programa
                    <input
                      maxLength={160}
                      value={project.episode.program}
                      onChange={(e) => episode({ program: e.target.value })}
                    />
                  </label>
                  <label>
                    Fecha y hora de emisión
                    <input
                      type="datetime-local"
                      value={project.episode.date}
                      onChange={(e) => episode({ date: e.target.value })}
                    />
                  </label>
                  <label>
                    Conductor o conductora
                    <input
                      maxLength={100}
                      value={project.episode.host}
                      onChange={(e) => episode({ host: e.target.value })}
                    />
                  </label>
                  <label>
                    Cargo del conductor
                    <input
                      maxLength={140}
                      value={project.episode.hostRole}
                      onChange={(e) => episode({ hostRole: e.target.value })}
                    />
                  </label>
                </div>
                <div className="project-subheading">
                  <h3>Invitados</h3>
                  <button
                    className="secondary"
                    disabled={project.episode.guests.length >= 20}
                    onClick={() =>
                      episode({
                        guests: [
                          ...project.episode.guests,
                          { name: "", role: "" },
                        ],
                      })
                    }
                  >
                    ＋ Agregar invitado
                  </button>
                </div>
                {!project.episode.guests.length && (
                  <p className="project-help">
                    Agrega un invitado para preparar su placa de nombre y cargo.
                  </p>
                )}
                {project.episode.guests.map((guest, i) => (
                  <div className="project-guest" key={i}>
                    <label>
                      Invitado {i + 1}
                      <input
                        maxLength={100}
                        value={guest.name}
                        onChange={(e) =>
                          episode({
                            guests: project.episode.guests.map((g, n) =>
                              n === i ? { ...g, name: e.target.value } : g,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Cargo del invitado {i + 1}
                      <input
                        maxLength={140}
                        value={guest.role}
                        onChange={(e) =>
                          episode({
                            guests: project.episode.guests.map((g, n) =>
                              n === i ? { ...g, role: e.target.value } : g,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      aria-label={`Eliminar invitado ${i + 1}`}
                      onClick={() =>
                        episode({
                          guests: project.episode.guests.filter(
                            (_, n) => n !== i,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="project-grid">
                  <label>
                    Temas del episodio
                    <textarea
                      rows={4}
                      value={project.episode.topics.join("\n")}
                      onChange={(e) =>
                        episode({
                          topics: e.target.value
                            .split("\n")
                            .slice(0, 30)
                            .map((s) => s.slice(0, 200)),
                        })
                      }
                    />
                    <small>Un tema por línea.</small>
                  </label>
                  <label>
                    Auspiciadores
                    <textarea
                      rows={4}
                      value={project.episode.sponsors.join("\n")}
                      onChange={(e) =>
                        episode({
                          sponsors: e.target.value
                            .split("\n")
                            .slice(0, 20)
                            .map((s) => s.slice(0, 150)),
                        })
                      }
                    />
                    <small>
                      Un nombre por línea. Asigna los logos al revisar las
                      piezas.
                    </small>
                  </label>
                </div>
              </section>
              <section className="project-package">
                <h3>Paquete del episodio</h3>
                <p className="project-help">
                  Plantilla: <strong>{project.template.name}</strong> ·{" "}
                  {project.template.resources.length} tipos de recurso.
                </p>
                {warnings.length > 0 && (
                  <ul className="project-warnings">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                {!replace ? (
                  <button
                    className="project-primary full"
                    disabled={
                      !project.name.trim() || !project.template.resources.length
                    }
                    onClick={() =>
                      project.items.length ? setReplace(true) : prepare()
                    }
                  >
                    {project.items.length
                      ? "Volver a preparar las piezas"
                      : "Preparar todas las piezas"}
                  </button>
                ) : (
                  <div className="project-confirm">
                    <p>
                      Esto reemplazará las {project.items.length} piezas y sus
                      ajustes manuales con los datos del formulario.
                    </p>
                    <button className="project-primary" onClick={prepare}>
                      Sí, volver a preparar
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setReplace(false)}
                    >
                      Conservar piezas
                    </button>
                  </div>
                )}
                <div className="program-items">
                  {project.items.map((item, index) => (
                    <button key={item.id} onClick={() => onSelectItem(item.id)}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{item.label}</strong>
                        <small>
                          {resourceName(
                            resources.find((r) => r.id === item.resourceId)!,
                          )}
                        </small>
                      </div>
                      <b>Revisar ›</b>
                    </button>
                  ))}
                </div>
                {!project.items.length && (
                  <p className="project-empty">
                    Las piezas aparecerán aquí. Después podrás revisar y
                    exportar el programa completo.
                  </p>
                )}
              </section>
            </div>
          )}
          {tab === "plantilla" && (
            <section>
              <h3>Elige qué necesita tu programa</h3>
              <p className="project-help">
                Guarda esta selección una vez y reutilízala en cada episodio.
                Cada invitado genera su propia placa.
              </p>
              <div className="project-grid">
                <label>
                  Partir de una plantilla
                  <select
                    value=""
                    onChange={(e) => {
                      const all = [...builtInTemplates, ...templates],
                        value = all[Number(e.target.value)];
                      if (value) {
                        setTemplateCatalog(value.resources.every((id) => id.startsWith("fraternidad-")) ? "fraternidad" : "todas");
                        change({ ...project, template: structuredClone(value) });
                      }
                    }}
                  >
                    <option value="" disabled>
                      Selecciona una plantilla…
                    </option>
                    {[...builtInTemplates, ...templates].map((t, i) => (
                      <option value={i} key={`${t.name}-${i}`}>
                        {t.name}
                        {i >= builtInTemplates.length ? " · guardada" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nombre de esta plantilla
                  <input
                    maxLength={100}
                    value={project.template.name}
                    onChange={(e) =>
                      change({
                        ...project,
                        template: { ...project.template, name: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
              <label className="template-catalog">Filtrar recursos de la plantilla
                <select aria-label="Identidad de plantilla" value={templateCatalog} onChange={(e) => setTemplateCatalog(e.target.value)}>
                  <option value="todas">Todas las identidades</option>
                  {Object.entries(catalogNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                </select>
              </label>
              <div className="template-resources">
                {resources.filter((r) => templateCatalog === "todas" || resourceCatalog(r) === templateCatalog).map((r) => (
                  <label key={r.id}>
                    <input
                      type="checkbox"
                      checked={project.template.resources.includes(r.id)}
                      onChange={(e) =>
                        change({
                          ...project,
                          template: {
                            ...project.template,
                            resources: e.target.checked
                              ? [...project.template.resources, r.id]
                              : project.template.resources.filter(
                                  (id) => id !== r.id,
                                ),
                          },
                        })
                      }
                    />
                    <span>
                      <strong>{resourceName(r)}</strong>
                      <small>
                        {familyNames[r.family]} ·{" "}
                        {isLiveResource(r, defaults(r))
                          ? "Reloj vivo para OBS"
                          : r.durationMs
                            ? "Pieza animada"
                            : "Pieza permanente"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <button
                className="project-primary"
                onClick={() =>
                  run(() => {
                    saveTemplate(project.template);
                    setTemplates(loadTemplates());
                    setNotice("Plantilla guardada para futuros programas.");
                  })
                }
              >
                Guardar plantilla reutilizable
              </button>
              <p className="project-help">
                Las piezas «con evento» son coproducciones FRATV + Fraternidad.
                El catálogo exclusivo de Fraternidad se propondrá por separado.
              </p>
            </section>
          )}
          {tab === "importar" && (
            <div className="project-columns">
              <section>
                <h3>Importar un brief</h3>
                <p className="project-help">
                  Pega texto con etiquetas o carga un archivo TXT. Revisa la
                  interpretación antes de aplicarla. Esta versión reconoce
                  campos explícitos; no inventa datos ni interpreta PDF o Word.
                </p>
                <textarea
                  aria-label="Brief del episodio"
                  rows={12}
                  value={brief}
                  placeholder={briefExample}
                  onChange={(e) => {
                    setBrief(e.target.value);
                    setParsed(null);
                  }}
                />
                <div className="project-actions">
                  <button
                    className="project-primary"
                    disabled={!brief.trim()}
                    onClick={() => run(() => setParsed(parseBrief(brief)))}
                  >
                    Revisar brief
                  </button>
                  <label className="project-file-button">
                    Cargar TXT
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      onChange={importBrief}
                    />
                  </label>
                  <button
                    className="text-button"
                    onClick={() => {
                      setBrief(briefExample);
                      setParsed(null);
                    }}
                  >
                    Usar ejemplo
                  </button>
                </div>
                {parsed && (
                  <div className="brief-preview">
                    <h4>Información reconocida</h4>
                    <dl>
                      {Object.entries(parsed.episode).map(([key, value]) => (
                        <div key={key}>
                          <dt>
                            {
                              {
                                program: "Programa",
                                date: "Fecha",
                                host: "Conductor",
                                hostRole: "Cargo",
                                guests: "Invitados",
                                topics: "Temas",
                                sponsors: "Auspiciadores",
                              }[key]
                            }
                          </dt>
                          <dd>
                            {key === "guests"
                              ? (value as Episode["guests"])
                                  .map(
                                    (p) =>
                                      `${p.name}${p.role ? ` · ${p.role}` : ""}`,
                                  )
                                  .join("\n")
                              : Array.isArray(value)
                                ? value.join("\n")
                                : value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {parsed.warnings.length > 0 && (
                      <ul className="project-warnings">
                        {parsed.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                    <p className="project-help">
                      Solo reemplaza los campos reconocidos del formulario. Las
                      piezas existentes se conservan hasta que vuelvas a
                      prepararlas.
                    </p>
                    <button
                      className="project-primary"
                      disabled={!Object.keys(parsed.episode).length}
                      onClick={() =>
                        run(() => {
                          const next = {
                            ...project,
                            episode: { ...project.episode, ...parsed.episode },
                          };
                          validateProject(next);
                          change(next);
                          setParsed(null);
                          setNotice(
                            "Brief aplicado al formulario. Revisa los datos y prepara las piezas.",
                          );
                          setTab("episodio");
                        })
                      }
                    >
                      Aplicar al episodio
                    </button>
                  </div>
                )}
              </section>
              <section>
                <h3>Importar un proyecto completo</h3>
                <p className="project-help">
                  Abre un archivo .fratv.json con su plantilla, episodio, piezas
                  y ajustes. Se importará como copia para conservar tus
                  proyectos actuales.
                </p>
                <label className="project-file-button">
                  Elegir proyecto .fratv.json
                  <input
                    aria-label="Importar proyecto FRATV"
                    type="file"
                    accept=".json,.fratv.json,application/json"
                    onChange={importFile}
                  />
                </label>
                {imported && (
                  <div className="brief-preview">
                    <h4>{imported.name}</h4>
                    <p>
                      {imported.items.length} piezas · {imported.template.name}{" "}
                      · {imported.aspect}
                    </p>
                    <p className="project-help">
                      El archivo fue validado. Al importar se crea una copia
                      local.
                    </p>
                    <button
                      className="project-primary"
                      onClick={() =>
                        run(() => {
                          const copy = {
                            ...imported,
                            id: crypto.randomUUID(),
                            updatedAt: new Date().toISOString(),
                          };
                          saveProject(copy);
                          setSaved(loadProjects());
                          selectProject(copy);
                        })
                      }
                    >
                      Importar como copia
                    </button>
                  </div>
                )}
                <div className="project-export-box">
                  <h3>Respaldo general</h3>
                  <p className="project-help">
                    Descarga el proyecto editable para recuperarlo o moverlo a
                    otro computador. Los logos enlazados siguen necesitando su
                    URL; los assets del paquete se incluyen al exportar HTML
                    para OBS.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => run(() => downloadProject(project))}
                  >
                    Exportar proyecto .fratv.json
                  </button>
                </div>
              </section>
            </div>
          )}
          {tab === "proyectos" && (
            <section>
              <h3>Proyectos de este navegador</h3>
              <p className="project-help">
                El editor guarda tus cambios automáticamente en este navegador.
                Exporta un respaldo para moverlos o protegerlos antes de borrar
                los datos del navegador.
              </p>
              <div className="project-new">
                <label>
                  Nombre del nuevo proyecto
                  <input
                    maxLength={120}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
                <button
                  className="project-primary"
                  disabled={!newName.trim()}
                  onClick={() =>
                    run(() => {
                      const next = createProject(newName.trim());
                      saveProject(next);
                      setSaved(loadProjects());
                      selectProject(next);
                    })
                  }
                >
                  Crear proyecto
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    run(() => {
                      const next = {
                        ...structuredClone(project),
                        id: crypto.randomUUID(),
                        name: `${project.name.slice(0, 112)} · copia`,
                        updatedAt: new Date().toISOString(),
                      };
                      saveProject(next);
                      setSaved(loadProjects());
                      selectProject(next);
                    })
                  }
                >
                  Duplicar episodio actual
                </button>
              </div>
              <div className="saved-projects">
                {saved.map((p) => (
                  <article key={p.id}>
                    <div>
                      <h4>
                        {p.name}
                        {p.id === project.id && <span>Actual</span>}
                      </h4>
                      <p>
                        {p.episode.program || "Sin nombre de programa"} ·{" "}
                        {p.items.length} piezas
                      </p>
                      <small>
                        {new Date(p.updatedAt).toLocaleString("es-CL")}
                      </small>
                    </div>
                    <div className="project-actions">
                      <button
                        className="secondary"
                        onClick={() => selectProject(p)}
                      >
                        Abrir
                      </button>
                      <button
                        className="text-button"
                        onClick={() => run(() => downloadProject(p))}
                      >
                        Respaldar
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setDeleteId(p.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                    {deleteId === p.id && (
                      <div className="project-confirm">
                        <p>
                          ¿Eliminar «{p.name}» del navegador? Conserva un
                          respaldo si lo necesitas.
                        </p>
                        <button
                          className="project-primary"
                          onClick={() =>
                            run(() => {
                              deleteProject(p.id);
                              const remaining = loadProjects();
                              setSaved(remaining);
                              setDeleteId(null);
                              if (p.id === project.id)
                                selectProject(remaining[0] || createProject());
                              else
                                setNotice("Proyecto eliminado del navegador.");
                            })
                          }
                        >
                          Sí, eliminar proyecto
                        </button>
                        <button
                          className="secondary"
                          onClick={() => setDeleteId(null)}
                        >
                          Conservar
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {!saved.length && (
                <p className="project-empty">
                  Todavía no hay proyectos guardados.
                </p>
              )}
            </section>
          )}
        </div>
        <footer className="project-footer">
          <span>
            {project.items.length} piezas preparadas · {project.aspect}
          </span>
          <button
            className="secondary"
            onClick={() => run(() => downloadProject(project))}
          >
            Exportar proyecto
          </button>
          <button className="project-primary" onClick={onClose}>
            Volver al editor
          </button>
        </footer>
      </div>
    </div>
  );
}
