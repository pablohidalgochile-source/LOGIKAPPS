import { useEffect, useLayoutEffect, useRef, useState } from "react";
interface Runtime {
  ready: Promise<unknown>;
  seek: (t: number) => void;
}
type FrameWindow = Window & { FRATV?: Runtime };
interface Props {
  url: string;
  live?: boolean;
  selfManagedFonts?: boolean;
  width: number;
  height: number;
  time: number;
  font: string;
  background: string;
  safe: boolean;
  areas: { top: string; bottom: string; x: string };
  onReady: (ready: boolean) => void;
}
const fontUrls: Record<string, string> = {
  editorial:
    "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;700&display=swap",
  neutro:
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;700&display=swap",
};
export default function Preview({
  url,
  live = false,
  selfManagedFonts = false,
  width,
  height,
  time,
  font,
  background,
  safe,
  areas,
  onReady,
}: Props) {
  const holder = useRef<HTMLDivElement>(null),
    iframe = useRef<HTMLIFrameElement>(null);
  const currentTime = useRef(time),
    generation = useRef(0);
  currentTime.current = time;
  const [size, setSize] = useState({ w: 640, h: 360 });
  const [source, setSource] = useState({ url, revision: 0 });
  const [status, setStatus] = useState("Cargando recurso…");
  const [loaded, setLoaded] = useState(false);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    generation.current++;
    setLoaded(false);
    onReady(false);
    setStatus("Actualizando vista previa…");
    const revision = generation.current;
    const timer = setTimeout(() => setSource({ url, revision }), 180);
    return () => clearTimeout(timer);
  }, [url, onReady]);
  useEffect(() => {
    if (loaded && !live)
      (iframe.current?.contentWindow as FrameWindow)?.FRATV?.seek(time);
  }, [time, loaded, live]);
  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(
      () =>
        setStatus(
          "La carga está tardando. Revisa tu conexión y vuelve a elegir el recurso.",
        ),
      18000,
    );
    return () => clearTimeout(timer);
  }, [source, loaded]);
  async function initialize() {
    const ticket = generation.current;
    const frame = iframe.current;
    const win = frame?.contentWindow as FrameWindow | null;
    if (!win?.FRATV || source.url !== url) return;
    try {
      await win.FRATV.ready;
      if (fontUrls[font] && !selfManagedFonts) {
        const doc = win.document;
        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = fontUrls[font];
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("fuentes")), 12000);
          link.onload = () => {
            clearTimeout(timeout);
            resolve();
          };
          link.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("fuentes"));
          };
          doc.head.append(link);
        });
        // Provoca el cálculo de estilos antes de esperar las fuentes recién añadidas.
        void doc.body.offsetWidth;
        await doc.fonts.ready;
      }
      if (ticket !== generation.current || frame !== iframe.current) return;
      if (!live) win.FRATV.seek(currentTime.current);
      setLoaded(true);
      onReady(true);
      setStatus("");
    } catch {
      if (ticket === generation.current)
        setStatus(
          "No se pudo cargar la tipografía. Revisa tu conexión o elige la identidad oficial.",
        );
    }
  }
  const scale = Math.max(0.01, Math.min(size.w / width, size.h / height));
  return (
    <div className="preview-fit" ref={holder}>
      <div
        className={`frame-board ${background}`}
        style={{ width: width * scale, height: height * scale }}
      >
        <iframe
          key={source.revision}
          ref={iframe}
          title="Vista previa del recurso"
          src={source.url}
          onLoad={initialize}
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            opacity: loaded ? 1 : 0,
          }}
        />
        {safe && (
          <div
            className="safe-guide"
            style={{
              top: areas.top,
              bottom: areas.bottom,
              left: areas.x,
              right: areas.x,
            }}
          >
            <span>ÁREA SEGURA</span>
          </div>
        )}
        {!loaded && (
          <div className="preview-status" role="status">
            <span className="loading-dot" />
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
