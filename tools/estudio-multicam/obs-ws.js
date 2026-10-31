// ============================================================
// Cliente mínimo de obs-websocket v5 (para el switcher → OBS)
// ============================================================
// OBS 28+ trae el WebSocket integrado: Herramientas → Configuración de WebSocket.
// Solo funciona si el switcher corre en la MISMA máquina que OBS (loopback):
// un dock dentro de OBS, o Chrome en ese mismo PC. (ws:// a localhost sí se
// permite desde https por ser loopback.)
// ============================================================
(function (global) {
  async function sha256b64(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  class OBSWS {
    constructor() { this.ws = null; this.rpc = {}; this.id = 0; this.onstate = () => {}; }

    connect(url, password) {
      return new Promise((resolve, reject) => {
        let ws; try { ws = new WebSocket(url); } catch (e) { return reject(new Error('URL inválida')); }
        this.ws = ws;
        let done = false; const fail = e => { if (!done) { done = true; reject(e); } };
        ws.onerror = () => fail(new Error('No se pudo conectar (¿OBS abierto? ¿WebSocket activo? ¿puerto?)'));
        ws.onclose = () => { this.onstate('closed'); fail(new Error('Conexión cerrada')); };
        ws.onmessage = async (ev) => {
          let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
          if (msg.op === 0) { // Hello
            const d = msg.d; const ident = { op: 1, d: { rpcVersion: d.rpcVersion || 1 } };
            if (d.authentication) {
              if (!password) return fail(new Error('OBS pide contraseña'));
              const secret = await sha256b64(password + d.authentication.salt);
              ident.d.authentication = await sha256b64(secret + d.authentication.challenge);
            }
            ws.send(JSON.stringify(ident));
          } else if (msg.op === 2) { // Identified
            done = true; this.onstate('connected'); resolve();
          } else if (msg.op === 7) { // RequestResponse
            const r = this.rpc[msg.d.requestId];
            if (r) {
              delete this.rpc[msg.d.requestId];
              if (msg.d.requestStatus && msg.d.requestStatus.result) r.resolve(msg.d.responseData || {});
              else r.reject(new Error((msg.d.requestStatus && msg.d.requestStatus.comment) || 'request falló'));
            }
          }
        };
        setTimeout(() => fail(new Error('timeout conectando a OBS')), 6000);
      });
    }

    req(type, data) {
      return new Promise((resolve, reject) => {
        if (!this.ws || this.ws.readyState !== 1) return reject(new Error('OBS no conectado'));
        const id = 'r' + (++this.id); this.rpc[id] = { resolve, reject };
        this.ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
        setTimeout(() => { if (this.rpc[id]) { delete this.rpc[id]; reject(new Error('timeout')); } }, 5000);
      });
    }

    getScenes() { return this.req('GetSceneList').then(d => ({ scenes: (d.scenes || []).map(s => s.sceneName), current: d.currentProgramSceneName })); }
    getStudioMode() { return this.req('GetStudioModeEnabled').then(d => !!d.studioModeEnabled).catch(() => false); }
    setProgramScene(name) { return this.req('SetCurrentProgramScene', { sceneName: name }); }
    setPreviewScene(name) { return this.req('SetCurrentPreviewScene', { sceneName: name }); }
    studioTransition() { return this.req('TriggerStudioModeTransition'); }
    close() { try { this.ws && this.ws.close(); } catch (e) {} this.ws = null; }
    get connected() { return this.ws && this.ws.readyState === 1; }
  }

  global.OBSWS = OBSWS;
})(window);
