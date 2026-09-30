export async function makeAudioClip(file: File, start: number): Promise<Blob> {
  if (file.size > 25 * 1024 * 1024) throw new Error("Elige un archivo de hasta 25 MB o recorta un fragmento primero.");
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (!Number.isFinite(start) || start < 0 || start >= decoded.duration) throw new Error("El inicio del fragmento debe estar dentro de la canción.");
    const seconds = Math.min(12, decoded.duration - start);
    if (seconds < 3) throw new Error("Elige una parte con al menos 3 segundos de audio.");
    const offline = new OfflineAudioContext(1, Math.floor(seconds * 16000), 16000);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start(0, start, seconds);
    const samples = (await offline.startRendering()).getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2); const view = new DataView(buffer);
    const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
    text(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) { const sample = Math.max(-1, Math.min(1, samples[i])); view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); }
    return new Blob([buffer], { type: "audio/wav" });
  } catch (error) { if (error instanceof DOMException) throw new Error("El navegador no pudo leer este audio. Prueba MP3, WAV o M4A."); throw error; }
  finally { await context.close(); }
}
