import Cocoa
import WebKit
import UniformTypeIdentifiers

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    let store: StateStore
    let webDirectory: URL
    let launcher: ManagedLauncher
    var window: NSWindow!
    var webView: WKWebView!

    init(store: StateStore, webDirectory: URL, catalog: URL) {
        self.store = store
        self.webDirectory = webDirectory
        launcher = ManagedLauncher(store: store)
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.appearance = NSAppearance(named: .darkAqua)
        let menu = NSMenu()
        let rootItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Acerca de LOGIKAPPS", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(withTitle: "Abrir carpeta de datos", action: #selector(openDataFolder), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Ocultar LOGIKAPPS", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Salir de LOGIKAPPS", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        rootItem.submenu = appMenu
        menu.addItem(rootItem)
        let edit = NSMenu(title: "Edición")
        for (title, selector, key) in [("Deshacer", "undo:", "z"), ("Cortar", "cut:", "x"), ("Copiar", "copy:", "c"), ("Pegar", "paste:", "v"), ("Seleccionar todo", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        let editItem = NSMenuItem(title: "Edición", action: nil, keyEquivalent: "")
        editItem.submenu = edit; menu.addItem(editItem)
        NSApp.mainMenu = menu
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "logikapps")
        config.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 880), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "LOGIKAPPS"
        window.minSize = NSSize(width: 1000, height: 680)
        window.backgroundColor = NSColor(srgbRed: 17/255, green: 19/255, blue: 17/255, alpha: 1)
        window.contentView = webView
        window.setFrameAutosaveName("LOGIKAPPSMainWindow")
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        webView.loadFileURL(webDirectory.appendingPathComponent("index.html"), allowingReadAccessTo: webDirectory)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil); return true
    }
    func applicationWillTerminate(_ notification: Notification) { launcher.stop() }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if CommandLine.arguments.contains("--ui-smoke-test") { runWebKitSmokeTest(self) }
    }
    @objc func openDataFolder() { NSWorkspace.shared.open(store.directory) }
    @objc func about() {
        NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "LOGIKAPPS", .applicationVersion: StateStore.version, .credits: NSAttributedString(string: "Tus herramientas, a un clic.\nBiblioteca e ideas guardadas en este Mac.")])
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.webView === webView,
              let url = message.frameInfo.request.url, url.isFileURL,
              url.standardizedFileURL.path == webDirectory.appendingPathComponent("index.html").path,
              let body = message.body as? [String: Any], let id = body["id"] as? String, id.count <= 100,
              let action = body["action"] as? String else { return }
        let payload = body["payload"] as? [String: Any] ?? [:]
        do {
            switch action {
            case "getState": reply(id, result: store.snapshot())
            case "saveApp", "deleteApp", "toggleFavorite", "saveIdea", "deleteIdea": reply(id, result: try store.change(action, payload: payload))
            case "launch":
                let appID = try StateStore.text(payload["id"], max: 100, required: true)
                try launch(appID, request: id)
            case "reveal":
                let app = try store.app(StateStore.text(payload["id"], max: 100, required: true))
                let path = app["sourcePath"] as? String ?? (app["kind"] as? String == "url" ? "" : app["target"] as? String ?? "")
                let target = try StateStore.localURL(path)
                guard FileManager.default.fileExists(atPath: target.path) else { throw LogikError.message("La carpeta ya no está en esa ubicación. Puedes editar el acceso.") }
                NSWorkspace.shared.activateFileViewerSelecting([target]); reply(id, result: ["message": "Ubicación abierta en Finder."])
            case "choosePath":
                let panel = NSOpenPanel(); panel.canChooseFiles = true; panel.canChooseDirectories = true
                panel.allowsMultipleSelection = false; panel.treatsFilePackagesAsDirectories = false
                panel.prompt = "Elegir"; panel.message = "Elige una aplicación, un lanzador .command o la carpeta de tu proyecto."
                panel.beginSheetModal(for: window) { response in
                    if response == .OK, let path = panel.url?.path { self.reply(id, result: ["path": path, "cancelled": false]) }
                    else { self.reply(id, result: ["cancelled": true]) }
                }
            case "exportData":
                let panel = NSSavePanel(); panel.allowedContentTypes = [.json]
                panel.nameFieldStringValue = "LOGIKAPPS-copia-\(ISO8601DateFormatter().string(from: Date()).prefix(10)).json"
                panel.beginSheetModal(for: window) { response in
                    guard response == .OK, let url = panel.url else { self.reply(id, result: ["cancelled": true]); return }
                    do { try self.store.exportFile(url); self.reply(id, result: ["path": url.path, "cancelled": false]) }
                    catch { self.reply(id, error: error) }
                }
            case "importData":
                let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false
                panel.message = "Restaura una copia de LOGIKAPPS. Se guardará una copia de tus datos actuales antes de reemplazarlos."
                panel.beginSheetModal(for: window) { response in
                    guard response == .OK, let url = panel.url else { self.reply(id, result: ["cancelled": true]); return }
                    do { self.reply(id, result: try self.store.importFile(url)) } catch { self.reply(id, error: error) }
                }
            case "openDataFolder": openDataFolder(); reply(id, result: ["message": "Carpeta abierta."])
            default: throw LogikError.message("Esta acción no está disponible.")
            }
        } catch { reply(id, error: error) }
    }

    func reply(_ id: String, result: Any? = nil, error: Error? = nil) {
        var value: [String: Any] = ["id": id, "ok": error == nil]
        if let error = error { value["error"] = error.localizedDescription } else { value["result"] = result ?? [:] }
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.logikappsReply(\(json))", completionHandler: nil)
    }

    private func launched(_ appID: String, request: String, message: String) {
        do { reply(request, result: ["message": message, "openedAt": try store.recordLaunch(appID)]) }
        catch { reply(request, error: error) }
    }

    func launch(_ id: String, request: String) throws {
        let app = try store.app(id)
        let kind = app["kind"] as! String
        let target = app["target"] as! String
        let name = app["name"] as! String
        if kind == "managed" {
            let root = try ManagedLauncher.projectRoot(for: app)
            approveExecution(name: name, detail: "Proyecto: \(root.path)\n\nSe ejecutará Node.js con node_modules/vinext/dist/cli.js para iniciar TRACKHUNT en este Mac.", request: request) {
                self.launcher.launch(root: root) { [weak self] result in
                    guard let self = self else { return }
                    switch result { case .success(let message): self.launched(id, request: request, message: message)
                    case .failure(let error): self.reply(request, error: error) }
                }
            }; return
        }
        if kind == "url" {
            guard NSWorkspace.shared.open(try StateStore.safeURL(target)) else { throw LogikError.message("No pudimos abrir el navegador.") }
            launched(id, request: request, message: "\(name) abierto en tu navegador."); return
        }
        let url = try StateStore.localURL(target)
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
            throw LogikError.message("No encontramos \(name) en su ubicación guardada. Edita el acceso para elegir la ruta actual.")
        }
        if kind == "app" {
            guard isDirectory.boolValue, url.pathExtension.lowercased() == "app" else { throw LogikError.message("La ruta no corresponde a una aplicación de Mac.") }
            NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration()) { _, error in
                DispatchQueue.main.async {
                    if let error = error { self.reply(request, error: error) }
                    else { self.launched(id, request: request, message: "\(name) abierto.") }
                }
            }
        } else if kind == "command" {
            guard !isDirectory.boolValue, url.pathExtension.lowercased() == "command", FileManager.default.isExecutableFile(atPath: url.path) else { throw LogikError.message("El lanzador no es un archivo .command ejecutable.") }
            let resolved = url.resolvingSymlinksInPath()
            approveExecution(name: name, detail: "Lanzador .command: \(url.path)" + (resolved.path == url.path ? "" : "\nDestino: \(resolved.path)") + "\n\nSe abrirá este archivo en Terminal para ejecutar sus instrucciones en tu Mac.", request: request) {
                guard NSWorkspace.shared.open(url) else { self.reply(request, error: LogikError.message("No pudimos abrir el lanzador.")); return }
                self.launched(id, request: request, message: "Lanzador de \(name) abierto. Su ventana mostrará el inicio.")
            }
        } else {
            guard isDirectory.boolValue else { throw LogikError.message("La ruta elegida no es una carpeta.") }
            // Finder selection never executes an application package mistaken for a folder.
            NSWorkspace.shared.activateFileViewerSelecting([url])
            launched(id, request: request, message: "Carpeta de \(name) mostrada en Finder.")
        }
    }

    // Approval belongs to this local launch, never to an imported/exported catalogue.
    private func approveExecution(name: String, detail: String, request: String, execute: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "¿Ejecutar \(name)?"
        alert.informativeText = detail
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Cancelar")
        alert.addButton(withTitle: "Ejecutar")
        alert.beginSheetModal(for: window) { response in
            if response == .alertSecondButtonReturn { execute() }
            else { self.reply(request, error: LogikError.message("Ejecución cancelada. No se inició el lanzador.")) }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, url.isFileURL,
           url.standardizedFileURL.path == webDirectory.appendingPathComponent("index.html").path {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url, (try? StateStore.safeURL(url.absoluteString)) != nil { NSWorkspace.shared.open(url) }
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: "Confirmar"); alert.addButton(withTitle: "Cancelar")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: "Aceptar")
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }
}
