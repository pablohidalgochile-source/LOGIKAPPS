/* FRATV — runtime compartido de recursos.
   Sin dependencias. Se carga con <script src="fratv-runtime.js"></script>. */
(function () {
  'use strict';

  var THEMES = {
    'fratv-oficial':     { accent:'#B72A3A', onAccent:'#F5F1E8', plate:'rgba(16,11,24,.94)', surface:'#100B18', text:'#F5F1E8', textDim:'rgba(245,241,232,.72)', hairline:'rgba(245,241,232,.18)' },
    'fratv-invertido':   { accent:'#B72A3A', onAccent:'#F5F1E8', plate:'rgba(245,241,232,.94)', surface:'#F5F1E8', text:'#100B18', textDim:'rgba(16,11,24,.72)', hairline:'rgba(16,11,24,.18)' },
    'fratv-mono-marfil': { accent:'#F5F1E8', onAccent:'#100B18', plate:'rgba(16,11,24,.94)', surface:'#100B18', text:'#F5F1E8', textDim:'rgba(245,241,232,.72)', hairline:'rgba(245,241,232,.18)' },
    'fratv-mono-negro':  { accent:'#100B18', onAccent:'#F5F1E8', plate:'rgba(245,241,232,.94)', surface:'#F5F1E8', text:'#100B18', textDim:'rgba(16,11,24,.72)', hairline:'rgba(16,11,24,.18)' }
  };

  var FONTS = {
    aprobado:  { display:"'Poppins',system-ui,sans-serif", mono:"'JetBrains Mono',ui-monospace,monospace", wordmark:"'Arial Rounded MT Bold','Poppins',sans-serif" },
    editorial: { display:"'Instrument Sans',system-ui,sans-serif", mono:"'IBM Plex Mono',ui-monospace,monospace", wordmark:"'Poppins',sans-serif" },
    neutro:    { display:"'Inter',system-ui,sans-serif", mono:"'Roboto Mono',ui-monospace,monospace", wordmark:"'Helvetica Rounded','Poppins',sans-serif" }
  };

  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

  function applyTokens(t) {
    if (!record(t)) return;
    var r = document.documentElement.style;
    Object.keys(t).forEach(function (k) {
      r.setProperty('--fr-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }), t[k]);
    });
  }

  function collectAnimations() {
    var out = [];
    document.querySelectorAll('*').forEach(function (el) {
      if (typeof el.getAnimations !== 'function') return;
      el.getAnimations().forEach(function (a) { out.push(a); });
    });
    return out;
  }

  function create(meta, hooks) {
    var anims = null;
    var api = {
      meta: meta,

      /* Determinista: el exportador llama seek(n * 1000/60) por cuadro. */
      seek: function (tMs) {
        if (typeof tMs !== 'number' || !Number.isFinite(tMs) || tMs < 0) return;
        if (!anims) { anims = collectAnimations(); anims.forEach(function (a) { a.pause(); }); }
        var d = meta.durationMs || 0;
        var t = meta.loop && d ? tMs % d : Math.min(tMs, d || tMs);
        anims.forEach(function (a) { try { a.currentTime = t; } catch (e) {} });
        if (hooks && hooks.onSeek) hooks.onSeek(t);
      },

      play:  function () { (anims || collectAnimations()).forEach(function (a) { a.play(); }); if (hooks && hooks.onPlay) hooks.onPlay(); },
      pause: function () { (anims || (anims = collectAnimations())).forEach(function (a) { a.pause(); }); if (hooks && hooks.onPause) hooks.onPause(); },

      setTokens: function (obj) {
        if (typeof obj === 'string') obj = THEMES[obj] || THEMES['fratv-oficial'];
        applyTokens(obj);
      },

      setFonts: function (preset) {
        var p = typeof preset === 'string' ? (FONTS[preset] || FONTS.aprobado) : preset;
        if (!record(p)) return;
        applyTokens({ fontDisplay: p.display, fontMono: p.mono, fontWordmark: p.wordmark });
      },

      setFields: function (obj) {
        if (!record(obj)) return;
        document.querySelectorAll('[data-field]').forEach(function (el) {
          var key = el.getAttribute('data-field');
          if (!Object.prototype.hasOwnProperty.call(obj, key)) return;
          var value = obj[key];
          if (value === '' || value == null) { el.hidden = true; return; }
          if (typeof value !== 'string' && typeof value !== 'number') return;
          el.hidden = false;
          el.textContent = String(value).replace(/\\n/g, '\n');
        });
        if (hooks && hooks.onFields) hooks.onFields(obj);
      },

      ready: (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
        return new Promise(function (res) { requestAnimationFrame(function () { res(true); }); });
      })
    };

    /* Estado inicial desde la URL. */
    var q = new URLSearchParams(location.search);
    api.setTokens(q.get('tema') || 'fratv-oficial');
    api.setFonts(q.get('tipo') || 'aprobado');

    var fields = Object.create(null);
    q.forEach(function (v, k) {
      if (['tema','tipo','autoplay','loop','duracion','safe'].indexOf(k) === -1) fields[k] = v;
    });
    if (Object.keys(fields).length) api.setFields(fields);

    var duration = Number(q.get('duracion'));
    if (q.get('duracion') && Number.isFinite(duration) && duration >= 0) meta.durationMs = duration;
    if (q.get('loop') !== null) meta.loop = q.get('loop') === '1';
    if (q.get('safe') === '1') document.documentElement.setAttribute('data-safe', '1');
    if (q.get('autoplay') === '0') api.ready.then(function () { api.seek(0); });

    /* Puente con el editor. */
    window.addEventListener('message', function (e) {
      // Only an embedding parent may control this resource; standalone OBS has no host.
      if (window.parent === window || e.source !== window.parent || !record(e.data)) return;
      var m = e.data;
      if (m.type === 'fratv:seek')   api.seek(m.t);
      if (m.type === 'fratv:tokens') api.setTokens(m.tokens);
      if (m.type === 'fratv:fonts')  api.setFonts(m.preset);
      if (m.type === 'fratv:fields') api.setFields(m.fields);
      if (m.type === 'fratv:play')   api.play();
      if (m.type === 'fratv:pause')  api.pause();
    });

    api.ready.then(function () {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'fratv:ready', meta: meta }, '*');
      }
    });

    window.FRATV = api;
    return api;
  }

  window.FRATVRuntime = { create: create, THEMES: THEMES, FONTS: FONTS };
})();
