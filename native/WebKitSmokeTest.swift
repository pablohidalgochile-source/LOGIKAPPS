import Cocoa
import WebKit

// Runs only against an explicit temporary directory, validated before StateStore init.
// All fixtures are removed, including when an assertion or timeout fails.
func runWebKitSmokeTest(_ delegate: AppDelegate) {
    guard CommandLine.arguments.contains("--ui-smoke-test") else { return }
    let original = delegate.store.state
    var completed = false
    let finish: ([String: Any], Int32) -> Void = { report, code in
        guard !completed else { return }
        completed = true
        var result = report
        var exitCode = code
        do { try delegate.store.persist(original); result["temporaryStateRestored"] = true }
        catch { result["ok"] = false; result["restoreError"] = error.localizedDescription; exitCode = 1 }
        let data = (try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])) ?? Data("{\"ok\":false}".utf8)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
        exit(exitCode)
    }
    guard StateStore.isTemporaryTestDirectory(delegate.store.directory) else {
        fputs("El test solo modifica una subcarpeta temporal dedicada.\n", stderr)
        exit(1)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
        finish(["ok": false, "test": "webkit-smoke", "error": "Tiempo agotado: 30 segundos."], 1)
    }
    let javascript = #"""
    const checks = [];
    const assert = (value, message) => { if (!value) throw new Error(message); };
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const wait = async (condition, message) => {
      const deadline = Date.now() + 5000;
      while (!condition()) { if (Date.now() > deadline) throw new Error(message); await delay(40); }
    };
    await wait(() => document.querySelector('#add-app-button')?.disabled === false && document.querySelector('.discover-card'), 'No se mostró el catálogo de Explorar.');
    assert(typeof window.logikappsReply === 'function', 'Falta el receptor del puente nativo.');
    assert(Boolean(window.webkit?.messageHandlers?.logikapps), 'Falta el puente WKWebView.');
    const sharedCards = [...document.querySelectorAll('.discover-card')];
    assert(sharedCards.length > 0, 'Explorar no contiene herramientas compartidas.');
    for (const card of sharedCards) {
      const links = [...card.querySelectorAll('a[href]')];
      assert(links.length > 0, 'Una herramienta compartida no tiene enlace.');
      for (const link of links) {
        const url = new URL(link.href);
        assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'Hay un enlace incompatible en Explorar.');
        assert(!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'El catálogo compartido contiene un enlace local.');
      }
    }
    checks.push('Explorar muestra catálogo y enlaces HTTP(S) sin abrirlos');
    const previousReply = window.logikappsReply;
    const pending = new Map();
    let sequence = 0;
    window.logikappsReply = reply => {
      const entry = pending.get(reply?.id);
      if (!entry) { previousReply(reply); return; }
      pending.delete(reply.id); clearTimeout(entry.timer);
      if (reply.ok) entry.resolve(reply.result);
      else entry.reject(new Error(String(reply.error || 'Error del puente nativo.')));
    };
    const request = (action, payload = {}) => new Promise((resolve, reject) => {
      const id = 'webkit-smoke-' + (++sequence);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Sin respuesta: ' + action)); }, 2000);
      pending.set(id, { resolve, reject, timer });
      window.webkit.messageHandlers.logikapps.postMessage({ id, action, payload });
    });
    const click = selector => { const element = document.querySelector(selector); assert(element, 'Falta ' + selector); element.click(); };
    const field = (form, name, value) => { const input = document.querySelector(form).elements.namedItem(name); assert(input, 'Falta campo ' + name); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); };
    const saveForm = async selector => { document.querySelector(selector).requestSubmit(); await wait(() => !document.querySelector('#editor-dialog').open, 'El formulario no se guardó: ' + (document.querySelector('#form-error')?.textContent || selector)); };
    try {
      const initial = await request('getState');
      assert(initial.environment?.native && initial.apps.length === 0 && initial.ideas.length === 0, 'Explorar debe estar separado de la biblioteca temporal vacía.');
      click('[data-view="apps"]');
      await wait(() => document.querySelector('.empty-state') && document.querySelectorAll('.app-card').length === 0, 'Mis apps no mostró biblioteca vacía.');
      const personal = await request('getState');
      assert(personal.apps.length === 0 && personal.ideas.length === 0, 'Consultar el catálogo modificó la biblioteca personal.');
      checks.push('Mis apps vacía: el catálogo no crea accesos personales');
      click('#add-app-button');
      await wait(() => document.querySelector('#app-form'), 'No se abrió agregar app.');
      field('#app-form', 'name', 'Prueba WebKit 🌱');
      field('#app-form', 'target', 'https://example.com');
      field('#app-form', 'description', 'Texto <script> & prueba segura');
      await saveForm('#app-form');
      await wait(() => document.querySelectorAll('.app-card').length === 1, 'No apareció la app creada.');
      let saved = await request('getState');
      const appID = saved.apps[0].id;
      assert(saved.apps[0].target.startsWith('https://example.com'), 'No se guardó el enlace.');
      assert(document.querySelector('.app-card').textContent.includes('<script>'), 'El texto no se preservó como texto.');
      checks.push('crear app desde formulario sin abrir enlace');
      click('[data-action="favorite"][data-id="' + appID + '"]');
      await wait(() => document.querySelector('.favorite-button')?.getAttribute('aria-pressed') === 'true', 'No cambió favorito.');
      assert((await request('getState')).apps[0].favorite === true, 'No se persistió favorito.');
      const search = document.querySelector('#search');
      search.value = 'sin-coincidencias-9876'; search.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(() => document.querySelectorAll('.app-card').length === 0, 'La búsqueda no filtró.');
      search.value = 'webkit'; search.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(() => document.querySelectorAll('.app-card').length === 1, 'La búsqueda no recuperó la app.');
      click('[data-action="clear-search"]');
      click('[data-action="edit-app"][data-id="' + appID + '"]');
      field('#app-form', 'name', 'App editada');
      await saveForm('#app-form');
      assert((await request('getState')).apps[0].name === 'App editada', 'Edición no persistida.');
      checks.push('favorito, búsqueda y edición desde interfaz');
      click('[data-action="new-idea"]');
      field('#idea-form', 'title', 'Idea de interfaz');
      field('#idea-form', 'description', 'Creada y vinculada desde el formulario.');
      field('#idea-form', 'appId', appID);
      await saveForm('#idea-form');
      saved = await request('getState');
      const ideaID = saved.ideas[0].id;
      assert(saved.ideas[0].appId === appID, 'La idea no quedó vinculada.');
      await request('saveIdea', { idea: { id: 'smoke-bridge', title: 'Idea del puente', description: 'Prueba temporal', status: 'development' } });
      assert((await request('getState')).ideas.length === 2, 'El puente no creó la segunda idea.');
      await request('deleteIdea', { id: 'smoke-bridge' });
      checks.push('idea desde interfaz y crear/borrar desde puente');
      click('[data-action="edit-app"][data-id="' + appID + '"]');
      click('[data-action="ask-delete-app"]');
      click('[data-action="delete-app"]');
      await wait(() => !document.querySelector('#editor-dialog').open, 'No se quitó la app.');
      saved = await request('getState');
      assert(saved.apps.length === 0 && saved.ideas.length === 1 && !saved.ideas[0].appId, 'Quitar acceso no desvinculó conservando idea.');
      click('[data-view="ideas"]');
      click('[data-action="edit-idea"][data-id="' + ideaID + '"]');
      field('#idea-form', 'title', 'Idea editada');
      field('#idea-form', 'status', 'ready');
      await saveForm('#idea-form');
      saved = await request('getState');
      assert(saved.ideas[0].title === 'Idea editada' && saved.ideas[0].status === 'ready', 'No se editó idea.');
      click('[data-action="edit-idea"][data-id="' + ideaID + '"]');
      click('[data-action="ask-delete-idea"]');
      click('[data-action="delete-idea"]');
      await wait(() => !document.querySelector('#editor-dialog').open, 'No se eliminó idea.');
      const restored = await request('getState');
      assert(restored.apps.length === 0 && restored.ideas.length === 0, 'Quedaron datos de prueba.');
      click('[data-view="apps"]');
      assert(document.querySelectorAll('.app-card').length === 0, 'Quedaron tarjetas de prueba.');
      checks.push('quitar acceso, conservar idea, editar y borrar idea desde interfaz');
      return { ok: true, test: 'webkit-smoke', checks, cards: 0, sharedCards: sharedCards.length, native: restored.environment.native };
    } finally {
      window.logikappsReply = previousReply;
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
    }
    """#
    let runChecks = {
      delegate.webView.callAsyncJavaScript(javascript, arguments: [:], in: nil, in: .page) { result in
        switch result {
        case .success(let value):
            guard let report = value as? [String: Any], report["ok"] as? Bool == true else {
                finish(["ok": false, "test": "webkit-smoke", "error": "El script no devolvió un resultado válido."], 1)
                return
            }
            finish(report, 0)
        case .failure(let error):
            let detail = error as NSError
            finish(["ok": false, "test": "webkit-smoke", "error": detail.localizedDescription,
                    "detail": detail.userInfo["WKJavaScriptExceptionMessage"] as? String ?? ""], 1)
        }
    }
    }
    let ready = #"""
      const deadline = Date.now() + 5000;
      while (!(document.querySelector('#add-app-button')?.disabled === false && document.querySelector('.discover-card'))) {
        if (Date.now() > deadline) throw new Error('No se mostró Explorar para la captura.');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return true;
    """#
    delegate.webView.callAsyncJavaScript(ready, arguments: [:], in: nil, in: .page) { result in
        if case .failure(let error) = result {
            finish(["ok": false, "test": "webkit-smoke", "error": error.localizedDescription], 1)
            return
        }
        delegate.webView.takeSnapshot(with: nil) { image, error in
            do {
                if let error = error { throw error }
                guard let tiff = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
                      let png = bitmap.representation(using: .png, properties: [:]) else {
                    throw LogikError.message("No pudimos capturar Explorar al iniciar.")
                }
                try png.write(to: delegate.store.directory.appendingPathComponent("onboarding.png"), options: .atomic)
                runChecks()
            } catch { finish(["ok": false, "test": "webkit-smoke", "error": error.localizedDescription], 1) }
        }
    }
}
