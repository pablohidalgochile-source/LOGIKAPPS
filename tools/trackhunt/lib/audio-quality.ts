export const MAX_LOCAL_AUDIO_BYTES = 120 * 1024 * 1024;
export const MAX_LOCAL_AUDIO_SECONDS = 20 * 60;

export type AudioMeasurements = {
  fileName: string;
  extension: string;
  mimeType: string;
  bytes: number;
  duration: number;
  sampleRate: number;
  channels: number;
  estimatedKbps: number;
  peakDbfs: number;
  rmsDbfs: number;
  crestFactorDb: number;
  clippedPercent: number;
};

export type AudioQualityReport = AudioMeasurements & {
  score: number;
  grade: "Bajo potencial" | "Por mejorar" | "Adecuado" | "Alto potencial" | "Lossless por verificar";
  verdict: string;
  warnings: string[];
  measured: string[];
  estimated: string[];
};

const LOSSLESS_EXTENSIONS = new Set(["wav", "wave", "flac", "aif", "aiff", "alac"]);
const COMPRESSED_EXTENSIONS = new Set(["mp3", "aac", "m4a", "ogg", "opus", "wma"]);

export function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const db = (value: number) => value > 0 ? 20 * Math.log10(value) : -120;

export function assessAudioQuality(input: AudioMeasurements): AudioQualityReport {
  const losslessContainer = LOSSLESS_EXTENSIONS.has(input.extension);
  const compressed = COMPRESSED_EXTENSIONS.has(input.extension) || !losslessContainer;
  let score = losslessContainer ? 78 : input.estimatedKbps >= 300 ? 76 : input.estimatedKbps >= 240 ? 70 : input.estimatedKbps >= 190 ? 62 : input.estimatedKbps >= 128 ? 49 : 30;
  const warnings: string[] = ["Este perfil es preliminar: todavía no analiza espectro, master original ni posibles conversiones previas."];
  if (input.sampleRate < 44100) { score -= 14; warnings.push("La frecuencia de muestreo está por debajo de 44,1 kHz."); }
  if (input.channels === 1) warnings.push("El archivo es mono; confirma que la edición original también lo sea.");
  if (input.clippedPercent >= 0.1) { score -= 12; warnings.push("Hay indicios de clipping en las muestras analizadas."); }
  else if (input.clippedPercent > 0) warnings.push("Se encontraron algunas muestras al límite digital.");
  if (compressed && input.estimatedKbps > 360) warnings.push("El bitrate estimado es inusual para audio comprimido; podría incluir datos adicionales o una cabecera incorrecta.");
  if (losslessContainer) warnings.push("El contenedor es sin pérdida, pero eso no demuestra que la fuente original no haya sido un archivo con pérdida.");
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade: AudioQualityReport["grade"] = losslessContainer ? "Lossless por verificar" : score >= 74 ? "Alto potencial" : score >= 62 ? "Adecuado" : score >= 45 ? "Por mejorar" : "Bajo potencial";
  const verdict = losslessContainer
    ? "El contenedor admite audio sin pérdida, pero todavía falta comprobar espectro y procedencia para descartar una transcodificación."
    : score >= 74
      ? "El perfil técnico es prometedor. Aun así, compáralo con una fuente oficial si vas a archivar o pinchar en un sistema exigente."
      : score >= 64
        ? "Puede funcionar, pero vale la pena buscar la misma edición a 320 kbps o en formato lossless."
        : "Prioriza encontrar otra fuente de la misma versión antes de intentar restaurarla artificialmente.";
  return {
    ...input,
    score,
    grade,
    verdict,
    warnings,
    measured: ["duración", "frecuencia usada por el navegador", "canales", "pico muestreado", "RMS muestreado", "clipping muestreado"],
    estimated: ["bitrate medio por tamaño y duración", "diagnóstico general"],
  };
}

export async function mediaDuration(file: File) {
  const url = URL.createObjectURL(file);
  const media = document.createElement("audio");
  media.preload = "metadata";
  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("No se pudo leer la duración del archivo.")), 10_000);
      media.onloadedmetadata = () => { window.clearTimeout(timer); resolve(media.duration); };
      media.onerror = () => { window.clearTimeout(timer); reject(new Error("El navegador no pudo leer este formato.")); };
      media.src = url;
    });
  } finally {
    media.removeAttribute("src");
    media.load();
    URL.revokeObjectURL(url);
  }
}

export async function inspectAudioFile(file: File): Promise<AudioQualityReport> {
  if (!file.size || file.size > MAX_LOCAL_AUDIO_BYTES) throw new Error("Elige un archivo de audio de hasta 120 MB.");
  const reportedDuration = await mediaDuration(file);
  if (!Number.isFinite(reportedDuration) || reportedDuration <= 0) throw new Error("El archivo no contiene audio legible.");
  if (reportedDuration > MAX_LOCAL_AUDIO_SECONDS) throw new Error("Para proteger la memoria del navegador, analiza aquí canciones de hasta 20 minutos. Los mixes largos irán en Sets y en la aplicación Mac.");
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await file.arrayBuffer());
    if (!audio.duration || !audio.length) throw new Error("El archivo no contiene audio legible.");
    const stride = Math.max(1, Math.ceil(audio.length / 1_500_000));
    let peak = 0;
    let squares = 0;
    let samples = 0;
    let clipped = 0;
    for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
      const data = audio.getChannelData(channel);
      for (let index = 0; index < data.length; index += stride) {
        const absolute = Math.abs(data[index]);
        peak = Math.max(peak, absolute);
        squares += data[index] * data[index];
        if (absolute >= 0.999) clipped += 1;
        samples += 1;
      }
    }
    const rms = Math.sqrt(squares / Math.max(1, samples));
    const duration = finite(audio.duration);
    const input: AudioMeasurements = {
      fileName: file.name,
      extension: fileExtension(file.name),
      mimeType: file.type || "desconocido",
      bytes: file.size,
      duration,
      sampleRate: audio.sampleRate,
      channels: audio.numberOfChannels,
      estimatedKbps: Math.round((file.size * 8) / Math.max(1, duration) / 1000),
      peakDbfs: Number(db(peak).toFixed(2)),
      rmsDbfs: Number(db(rms).toFixed(2)),
      crestFactorDb: Number(Math.max(0, db(peak) - db(rms)).toFixed(2)),
      clippedPercent: Number(((clipped / Math.max(1, samples)) * 100).toFixed(4)),
    };
    return assessAudioQuality(input);
  } catch (error) {
    if (error instanceof Error && !/decode|encoding|operation/i.test(error.message)) throw error;
    throw new Error("El navegador no pudo analizar este formato. Prueba MP3, WAV, M4A o un FLAC compatible.");
  } finally {
    await context.close();
  }
}
