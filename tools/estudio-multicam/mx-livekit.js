// ============================================================
// ESTUDIO MULTICAM — Helper LiveKit (Fase 4b)
// ============================================================
// Expone window.MXLK con lo común a las páginas *-lk.html:
//   - client        : el global del SDK (LivekitClient)
//   - fetchToken()  : pide un JWT a la Edge Function livekit-token
//   - connect()     : pide token + conecta a la sala, devuelve el Room
// ============================================================
(function (global) {
  const CFG = global.MX_CONFIG || {};

  function client() {
    const G = global.LivekitClient;
    if (!G) throw new Error('SDK de LiveKit no cargado (revisa el <script> del CDN)');
    return G;
  }

  // Pide { token, url } a la Edge Function. role: 'cam' | 'estudio' | 'program'.
  async function fetchToken({ room, identity, name, role }) {
    const endpoint = CFG.LIVEKIT_TOKEN_URL;
    if (!endpoint) throw new Error('Falta LIVEKIT_TOKEN_URL en config.js');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room, identity, name, role }),
    });
    if (!res.ok) throw new Error('Token endpoint ' + res.status + ': ' + (await res.text()));
    const data = await res.json();
    if (!data.token || !data.url) throw new Error('Respuesta de token inválida: ' + JSON.stringify(data));
    return data; // { token, url }
  }

  // Pide token y conecta. Devuelve el Room ya conectado.
  // connectOptions permite p.ej. { autoSubscribe:false } (el muro no recibe
  // video hasta que el moderador lo apruebe).
  async function connect({ room, identity, name, role, roomOptions, connectOptions }) {
    const G = client();
    const { token, url } = await fetchToken({ room, identity, name, role });
    const lkRoom = new G.Room(roomOptions || { adaptiveStream: true, dynacast: true });
    await lkRoom.connect(url, token, connectOptions);
    return lkRoom;
  }

  global.MXLK = { get client() { return global.LivekitClient; }, fetchToken, connect };
})(window);
