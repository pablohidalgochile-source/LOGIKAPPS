import Cocoa
import WebKit

extension AppDelegate {
    var entryURL: URL { webDirectory.appendingPathComponent("index.html") }
    var isStartupTest: Bool { CommandLine.arguments.contains("--ui-startup-error-test") }
    var diagnostic: String {
        #if arch(arm64)
        let architecture = "Apple Silicon"
        #else
        let architecture = "Intel"
        #endif
        return "LOGIKAPPS \(StateStore.version)\n\(ProcessInfo.processInfo.operatingSystemVersionString)\n\(architecture)\nCarga: \(embeddedStartup ? "integrada" : "archivos locales")\nEstado: \(startupStatus)\nEventos: \(startupEvents.joined(separator: ", "))\nNo incluye biblioteca, rutas ni cuentas personales."
    }

    func configureStartupView() {
        let container = NSView()
        window.contentView = container
        startupPanel = NSView()
        startupPanel.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(startupPanel)
        NSLayoutConstraint.activate([
            startupPanel.leadingAnchor.constraint(equalTo: container.leadingAnchor), startupPanel.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            startupPanel.topAnchor.constraint(equalTo: container.topAnchor), startupPanel.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        ])
        startupTitle = NSTextField(labelWithString: "Preparando LOGIKAPPS…")
        startupTitle.font = .boldSystemFont(ofSize: 25)
        startupTitle.textColor = NSColor(srgbRed: 203/255, green: 248/255, blue: 117/255, alpha: 1)
        startupDetail = NSTextField(wrappingLabelWithString: "Cargando tus herramientas en este Mac.")
        startupDetail.alignment = .center
        startupDetail.font = .systemFont(ofSize: 15)
        startupRetry = NSButton(title: "Volver a abrir", target: self, action: #selector(retryStartup))
        startupCopy = NSButton(title: "Copiar diagnóstico", target: self, action: #selector(copyStartupDiagnostic))
        for button in [startupRetry!, startupCopy!] {
            button.bezelStyle = .rounded
            button.appearance = NSAppearance(named: .aqua)
            button.contentTintColor = .black
        }
        let buttons = NSStackView(views: [startupRetry, startupCopy]); buttons.orientation = .horizontal; buttons.spacing = 12
        let stack = NSStackView(views: [startupTitle, startupDetail, buttons]); stack.orientation = .vertical; stack.spacing = 22; stack.alignment = .centerX
        stack.translatesAutoresizingMaskIntoConstraints = false
        startupPanel.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: startupPanel.centerXAnchor), stack.centerYAnchor.constraint(equalTo: startupPanel.centerYAnchor),
            stack.widthAnchor.constraint(equalToConstant: 580), startupDetail.widthAnchor.constraint(equalTo: stack.widthAnchor)
        ])
    }

    func isTrustedDocument(_ url: URL?) -> Bool {
        BundledPage.sameDocument(url, as: entryURL) || (embeddedStartup && url?.absoluteString == "about:blank")
    }

    func beginStartup(embedded: Bool = false) {
        startupTimer?.invalidate()
        embeddedStartup = embedded
        startupReady = false
        startupStatus = "cargando"
        startupTitle.stringValue = "Preparando LOGIKAPPS…"
        startupDetail.stringValue = embedded ? "Probando una forma alternativa de abrir la interfaz. Tu biblioteca se conserva." : "Cargando tus herramientas en este Mac."
        startupRetry.isHidden = true; startupCopy.isHidden = true
        startupPanel.isHidden = false
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
        webView?.stopLoading()
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "logikapps")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "startup")
        webView?.removeFromSuperview()
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "logikapps")
        config.userContentController.add(self, name: "startup")
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self; webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isHidden = true
        let container = window.contentView!
        container.addSubview(webView, positioned: .below, relativeTo: startupPanel)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor), webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.topAnchor.constraint(equalTo: container.topAnchor), webView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        ])
        startupTimer = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in self?.startupFailed("tiempo-de-carga") }
        if embedded {
            do { webView.loadHTMLString(try BundledPage.embeddedHTML(in: webDirectory, nonce: UUID().uuidString), baseURL: entryURL) }
            catch { startupFailed("recursos-incompletos") }
        } else if CommandLine.arguments.contains("--ui-smoke-test") && CommandLine.arguments.contains("--simulate-file-load-failure") {
            self.webView(webView, didFailProvisionalNavigation: nil, withError: NSError(domain: NSURLErrorDomain, code: NSURLErrorNoPermissionsToReadFile))
        } else {
            webView.loadFileURL(entryURL, allowingReadAccessTo: webDirectory)
        }
    }

    func completeStartup() {
        guard !startupReady else { return }
        startupReady = true; startupStatus = "lista"
        startupTimer?.invalidate(); startupTimer = nil
        webView.isHidden = false; startupPanel.isHidden = true
        if CommandLine.arguments.contains("--ui-smoke-test") { runWebKitSmokeTest(self) }
    }

    func startupFailed(_ event: String) {
        startupTimer?.invalidate(); startupTimer = nil
        startupEvents.append(event)
        if startupEvents.count > 12 { startupEvents.removeFirst() }
        if !embeddedStartup && !startupReady { beginStartup(embedded: true); return }
        startupReady = false; startupStatus = "no-se-pudo-abrir"
        webView?.isHidden = true; startupPanel.isHidden = false
        startupTitle.stringValue = "No pudimos mostrar LOGIKAPPS"
        startupDetail.stringValue = "Tu biblioteca sigue guardada. Pulsa Volver a abrir. Si el problema continúa, copia el diagnóstico y compártelo en el chat de soporte."
        startupRetry.isHidden = false; startupCopy.isHidden = false
        if isStartupTest {
            let content = window.contentView!
            content.layoutSubtreeIfNeeded()
            if let bitmap = content.bitmapImageRepForCachingDisplay(in: content.bounds) {
                content.effectiveAppearance.performAsCurrentDrawingAppearance {
                    content.cacheDisplay(in: content.bounds, to: bitmap)
                }
                try? bitmap.representation(using: .png, properties: [:])?.write(to: store.directory.appendingPathComponent("recovery.png"))
            }
            let ok = !startupPanel.isHidden && !startupRetry.isHidden && !startupCopy.isHidden && !diagnostic.contains(store.directory.path)
            let result: [String: Any] = ["ok": ok, "test": "startup-error", "fallbackAttempted": embeddedStartup, "nativeRecoveryVisible": !startupPanel.isHidden, "diagnosticHasNoPersonalPath": !diagnostic.contains(store.directory.path)]
            FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]))
            print(""); exit(ok ? 0 : 1)
        }
    }

    @objc func retryStartup() { beginStartup(embedded: true) }
    @objc func copyStartupDiagnostic() {
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(diagnostic, forType: .string)
        startupCopy.title = "Diagnóstico copiado"
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard webView === self.webView else { return }
        startupFailed("navegacion-\((error as NSError).code)")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard webView === self.webView else { return }
        startupFailed("carga-\((error as NSError).code)")
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === self.webView else { return }
        startupFailed("proceso-de-interfaz-interrumpido")
    }
}
