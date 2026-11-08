/* El mismo reloj de servidor alimenta todas las fuentes de un canal. */
(() => {
  const query = new URLSearchParams(location.search);
  const channel = query.get("channel") || "programa";
  const resource = document.documentElement.dataset.liveResource;
  let state = null,
    receivedAt = 0,
    connected = false,
    resourceReady = false,
    preparing = false;
  const interval =
    window.__fratvNativeSetInterval || window.setInterval.bind(window);
  function currentValue() {
    if (!state) return 0;
    const elapsed = state.running ? performance.now() - receivedAt : 0;
    return Math.max(
      0,
      state.valueMs + (state.mode === "elapsed" ? elapsed : -elapsed),
    );
  }
  function draw() {
    if (!state) return;
    const ms = currentValue(),
      seconds = state.mode === "countdown" ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const long = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
    const short = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
    document.body.style.visibility =
      (state.visible || query.get("snapshot") === "1") && connected && resourceReady
        ? "visible"
        : "hidden";
    if (resourceReady) document.documentElement.dataset.liveReady = "1";
    document
      .querySelectorAll('[data-field="reloj"], [data-field="clock"]')
      .forEach((el) => {
        if (el.dataset.clockFormat === "short") {
          const hours = Math.floor(seconds / 3600);
          el.textContent = (hours ? pad(hours) + ":" : "") +
            pad(Math.floor(seconds / 60) % 60) + ":" + pad(seconds % 60);
        } else el.textContent =
          resource === "countdown" && !el.closest(".largo") ? short : long;
      });
    if (resource === "countdown") {
      const bar = document.querySelector(".riel i");
      if (bar)
        bar.style.width = `${Math.max(0, Math.min(100, 100 - (ms / Math.max(1, state.durationMs)) * 100))}%`;
    }
  }
  async function poll() {
    try {
      const response = await fetch(`/api/live/${encodeURIComponent(channel)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("sin conexión");
      const next = await response.json();
      state = next;
      receivedAt = performance.now();
      connected = true;
      if (!preparing && window.FRATV) {
        preparing = true;
        // Fuentes e imágenes deben estar listas antes de mostrar la gráfica.
        // Pausar el reloj no detiene su animación; una instantánea usa seek.
        window.FRATV.ready.then(() => {
          resourceReady = true;
          if (query.get("snapshot") !== "1") window.FRATV.play();
          draw();
        }).catch(() => { preparing = false; resourceReady = false; });
      }
      draw();
    } catch {
      // Se oculta al perder el control, evitando emitir un reloj que parece sincronizado.
      connected = false;
      document.body.style.visibility = "hidden";
    }
  }
  poll();
  interval(poll, 500);
  interval(draw, 100);
})();
