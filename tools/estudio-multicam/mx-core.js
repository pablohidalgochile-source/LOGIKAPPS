// ============================================================
// ESTUDIO MULTICAM — Núcleo compartido (estudio + cam)
// ============================================================
// Expone window.MX con lo común a las dos páginas:
//   - sb            : cliente Supabase (señalización)
//   - ICE           : configuración de servidores ICE
//   - canal(sala)   : abre el canal broadcast de una sala
//   - esc(s)        : escape de HTML
//   - wakeOn/off    : Wake Lock (que no se duerma la pantalla del iPhone)
//   - bitrateProbe  : medidor de kbps por PeerConnection (getStats)
// ============================================================
(function (global) {
  const CFG = global.MX_CONFIG || {};

  const sb = (global.supabase && CFG.SUPABASE_URL)
    ? global.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON)
    : null;

  const ICE = { iceServers: CFG.ICE_SERVERS || [{ urls: 'stun:stun.l.google.com:19302' }] };
  // Test de TURN: fuerza que todo pase por relay (ver config.FORCE_RELAY).
  if (CFG.FORCE_RELAY) ICE.iceTransportPolicy = 'relay';

  const esc = s => String(s == null ? '' : s)
    .replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  // Canal broadcast de la sala. self:false para no recibir los eventos propios.
  function canal(sala) {
    if (!sb) throw new Error('Supabase no configurado (revisa config.js)');
    return sb.channel('mx-' + sala, { config: { broadcast: { self: false } } });
  }

  // ── Wake Lock ────────────────────────────────────────────────
  // Mantiene la pantalla encendida y la re-adquiere al volver a foco
  // (iOS suelta el lock al bloquear/cambiar de app). Requiere iOS 16.4+.
  let _wl = null, _wlWanted = false;
  async function wakeOn() {
    _wlWanted = true;
    try {
      if ('wakeLock' in navigator) {
        _wl = await navigator.wakeLock.request('screen');
        _wl.addEventListener('release', () => { _wl = null; });
        return true;
      }
    } catch (e) { /* denegado o no soportado */ }
    return false;
  }
  function wakeOff() {
    _wlWanted = false;
    try { _wl && _wl.release(); } catch (e) {}
    _wl = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (_wlWanted && !_wl && document.visibilityState === 'visible') wakeOn();
  });

  // ── Medidor de bitrate/resolución por PeerConnection ─────────
  // Devuelve una función poll() que entrega {kbps, w, h, fps} en cada llamada.
  function bitrateProbe(pc, kind = 'video') {
    let prevBytes = 0, prevTs = 0;
    return async function poll() {
      if (!pc) return null;
      let out = { kbps: 0, w: 0, h: 0, fps: 0 };
      try {
        const stats = await pc.getStats();
        stats.forEach(r => {
          if (r.type === 'inbound-rtp' && r.kind === kind) {
            if (prevTs) {
              const dt = (r.timestamp - prevTs) / 1000;
              if (dt > 0) out.kbps = Math.round(((r.bytesReceived - prevBytes) * 8) / dt / 1000);
            }
            prevBytes = r.bytesReceived; prevTs = r.timestamp;
            if (r.frameWidth) out.w = r.frameWidth;
            if (r.frameHeight) out.h = r.frameHeight;
            if (r.framesPerSecond) out.fps = Math.round(r.framesPerSecond);
          }
        });
      } catch (e) {}
      return out;
    };
  }

  const badState = st => st === 'failed' || st === 'closed' || st === 'disconnected';

  // ── Diagnóstico de ICE (STUN/TURN) ───────────────────────────
  // Recolecta candidatos y cuenta por tipo: host (LAN), srflx (STUN funciona),
  // relay (TURN funciona). Úsalo tras pegar tus credenciales TURN:
  //   MX.gatherCandidates({ relayOnly:true }).then(r => console.log(r))
  // Si con relayOnly ves relay>0, tu TURN está OK y cruzarás redes.
  function gatherCandidates(opts = {}) {
    return new Promise(resolve => {
      const cfg = { iceServers: opts.iceServers || ICE.iceServers };
      if (opts.relayOnly) cfg.iceTransportPolicy = 'relay';
      let pc, finished = false;
      const types = { host: 0, srflx: 0, relay: 0, prflx: 0 };
      const done = () => { if (finished) return; finished = true; try { pc.close(); } catch (e) {} resolve({ types, ok: types.relay > 0 || types.srflx > 0 || types.host > 0 }); };
      try { pc = new RTCPeerConnection(cfg); } catch (e) { return resolve({ error: String(e), types }); }
      pc.onicecandidate = e => {
        if (!e.candidate) return done();
        const m = /typ (\w+)/.exec(e.candidate.candidate || '');
        if (m && types[m[1]] != null) types[m[1]]++;
      };
      try { pc.createDataChannel('probe'); pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => {}); } catch (e) {}
      setTimeout(done, opts.timeout || 5000);
    });
  }

  global.MX = { sb, ICE, canal, esc, wakeOn, wakeOff, bitrateProbe, badState, gatherCandidates };
})(window);
