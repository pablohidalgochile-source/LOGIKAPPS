export function wavPCM(samples, rate) {
  if (![44100, 48000].includes(rate) || samples.length < rate * 3 || samples.length > rate * 12) throw new Error('Duración de fragmento inválida.');
  const bytes = new ArrayBuffer(44 + samples.length * 2), v = new DataView(bytes);
  const text = (n, s) => [...s].forEach((c, i) => v.setUint8(n + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i] || 0)); v.setInt16(44 + i * 2, x * (x < 0 ? 32768 : 32767), true); }
  return bytes;
}
export function videoID(url) { try { const u = new URL(url); return u.origin === 'https://www.youtube.com' && u.pathname === '/watch' && /^[\w-]{11}$/.test(u.searchParams.get('v') || '') ? u.searchParams.get('v') : null; } catch { return null; } }
