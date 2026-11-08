import { useEffect, useState } from "react";
import type { Field, FieldValue, Resource, Values } from "./model";
import { fieldUnavailable, textListLimit } from "./model";
const columnNames: Record<string, string> = {
  time: "Hora",
  title: "Programa",
  tag: "Etiqueta",
  role: "Rol",
  name: "Nombre",
};
export default function Fields({
  resource,
  values,
  onChange,
}: {
  resource: Resource;
  values: Values;
  onChange: (key: string, value: FieldValue) => void;
}) {
  function control(field: Field) {
    const id = `field-${field.key}`,
      value = values[field.key] ?? "";
    const unavailable = fieldUnavailable(resource, field);
    if (unavailable) return <p className="field-note">{unavailable}</p>;
    if (field.type === "enum")
      return (
        <select
          id={id}
          value={String(value)}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    if (field.type === "multienum")
      return (
        <div className="check-list">
          {field.options?.map((o) => (
            <label key={o}>
              <input
                type="checkbox"
                checked={(value as string[]).includes(o)}
                onChange={(e) =>
                  onChange(
                    field.key,
                    e.target.checked
                      ? [...(value as string[]), o]
                      : (value as string[]).filter((v) => v !== o),
                  )
                }
              />
              {o}
            </label>
          ))}
        </div>
      );
    if (field.type === "rows") {
      const rows = value as string[][];
      return (
        <div className="rows-editor">
          {rows.map((row, i) => (
            <div className="row-card" key={i}>
              <div className="row-heading">
                Fila {i + 1}
                <button
                  type="button"
                  aria-label={`Eliminar fila ${i + 1}`}
                  disabled={rows.length < 2}
                  onClick={() =>
                    onChange(
                      field.key,
                      rows.filter((_, n) => n !== i),
                    )
                  }
                >
                  ×
                </button>
              </div>
              {field.schema?.map((col, j) => (
                <label key={col.key}>
                  {columnNames[col.key] || col.key}
                  <input
                    value={row[j] || ""}
                    onChange={(e) =>
                      onChange(
                        field.key,
                        rows.map((r, n) =>
                          n === i
                            ? r.map((c, k) =>
                                k === j
                                  ? e.target.value.replace(/[;|]/g, "")
                                  : c,
                              )
                            : r,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          ))}
          <button
            className="secondary full"
            disabled={rows.length >= (field.max || 30)}
            onClick={() =>
              onChange(field.key, [...rows, field.schema!.map(() => "")])
            }
          >
            ＋ Agregar fila
          </button>
        </div>
      );
    }
    if (field.type === "textlist")
      return (
        <>
          <textarea
            id={id}
            rows={4}
            value={(value as string[]).join("\n")}
            onChange={(e) =>
              onChange(
                field.key,
                e.target.value
                  .replace(/;/g, "")
                  .split("\n")
                  .slice(0, textListLimit(resource))
                  .map((line) => field.max ? line.slice(0, field.max) : line),
              )
            }
          />
          <p className="field-note">
            Un mensaje por línea
            {` · máximo ${textListLimit(resource)}`}{field.max ? ` · ${field.max} caracteres por línea` : ""}.
          </p>
        </>
      );
    if (field.type === "textarea")
      return (
        <textarea
          id={id}
          rows={3}
          value={String(value)}
          maxLength={field.max}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      );
    if (field.type === "number")
      return (
        <NumberField
          id={id}
          field={field}
          value={value}
          onCommit={(n) => onChange(field.key, n)}
        />
      );
    if (field.type === "datetime")
      return (
        <input
          id={id}
          type="datetime-local"
          value={String(value)}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      );
    return (
      <>
        <input
          id={id}
          type="text"
          value={String(value)}
          maxLength={field.max}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
        {field.key === "logo" && (
          <p className="field-note">
            Usa una URL de imagen o una ruta del paquete. La carga de archivos
            se incorporará en otra etapa.
          </p>
        )}
      </>
    );
  }
  if (!resource.fields.length)
    return (
      <div className="empty-fields">
        <span>◇</span>
        <h3>Listo para reproducir</h3>
        <p>
          Esta pieza no tiene textos editables. Revisa sus opciones en Estilo.
        </p>
      </div>
    );
  return (
    <>
      {resource.fields.map((field) => (
        <div className="field" key={field.key}>
          <label htmlFor={`field-${field.key}`}>
            {field.label}
            {field.optional && <span>Opcional</span>}
            {field.unit && <span>{field.unit}</span>}
          </label>
          {control(field)}
          {field.max && ["text", "textarea"].includes(field.type) && (
            <small className="counter">
              {String(values[field.key] ?? "").length} / {field.max}
            </small>
          )}
        </div>
      ))}
    </>
  );
}

function NumberField({
  id,
  field,
  value,
  onCommit,
}: {
  id: string;
  field: Field;
  value: FieldValue;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const candidate =
      draft.trim() === "" ? Number(field.default || 0) : Number(draft);
    const next = Math.min(
      field.max ?? Infinity,
      Math.max(
        field.min ?? -Infinity,
        Number.isFinite(candidate)
          ? Math.round(candidate)
          : Number(field.default || 0),
      ),
    );
    setDraft(String(next));
    onCommit(next);
  }
  return (
    <>
      <input
        id={id}
        type="number"
        min={field.min}
        max={field.max}
        step="1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <p className="field-note">Presiona Enter o sal del campo para aplicar.</p>
    </>
  );
}
