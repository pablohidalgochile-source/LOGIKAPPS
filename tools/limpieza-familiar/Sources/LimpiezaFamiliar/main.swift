import AppKit
import SwiftUI
import ArchiveCore

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var model: AppModel!
    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        func option(_ name: String) -> String? { guard let i = args.firstIndex(of: name), args.count > i + 1 else { return nil }; return args[i + 1] }
        let demo = args.contains("--demo")
        let root = option("--state-root").map { URL(fileURLWithPath: $0).standardizedFileURL.resolvingSymlinksInPath() }
        if (demo || option("--snapshot") != nil), root == nil { fputs("Los modos de prueba requieren --state-root con una carpeta temporal.\n", stderr); exit(2) }
        model = AppModel(stateRoot: root, demo: demo)
        let menu = NSMenu()
        let appItem = NSMenuItem(); let appMenu = NSMenu(); appItem.submenu = appMenu; menu.addItem(appItem)
        appMenu.addItem(withTitle: "Acerca de Limpieza Familiar", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator()); appMenu.addItem(withTitle: "Salir de Limpieza Familiar", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let edit = NSMenuItem(); edit.title = "Edición"; let editMenu = NSMenu(title: "Edición"); edit.submenu = editMenu; menu.addItem(edit)
        for (title, selector, key) in [("Deshacer", "undo:", "z"), ("Cortar", "cut:", "x"), ("Copiar", "copy:", "c"), ("Pegar", "paste:", "v"), ("Seleccionar todo", "selectAll:", "a")] { editMenu.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key) }
        NSApp.mainMenu = menu
        let host = NSHostingView(rootView: RootView(model: model, devices: model.devices))
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1360, height: 920), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Limpieza Familiar · LOGIKAPPS"; window.minSize = NSSize(width: 1050, height: 720)
        window.contentView = host; window.delegate = self; window.center(); window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if demo, let root = root {
            do {
                let source = try makeDemo(root.appendingPathComponent("Muestras"))
                if model.preferences.profiles.isEmpty { model.preferences.profiles = [FamilyProfile(owner: "Familia · ejemplo", device: "iPhone de muestra")]; model.profileID = model.preferences.profiles[0].id; model.save() }
                if args.contains("--demo-library") { model.analyze(source) }
            } catch { model.error = error.localizedDescription }
        }
        if let name = option("--section"), let section = Section.allCases.first(where: { $0.rawValue == name }) { model.section = section }
        if let snapshot = option("--snapshot") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.snapshot(path: snapshot) }
        }
    }
    func snapshot(path: String) {
        if model.busy { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.snapshot(path: path) }; return }
        guard let view = window.contentView, let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { exit(3) }
        view.cacheDisplay(in: view.bounds, to: rep)
        do { try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path)); print("Interfaz renderizada: \(path)"); exit(0) } catch { fputs("\(error)\n", stderr); exit(3) }
    }
    @objc func about() { NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "Limpieza Familiar", .applicationVersion: "0.4.8", .credits: NSAttributedString(string: "Una herramienta privada de LOGIKAPPS.\nArchivo verificado y limpieza guiada.\nPrueba de borrado limitada a una foto nueva con dos copias verificadas.")]) }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard model.busy || model.devices.importing else { return .terminateNow }
        model.error = "Hay una operación en curso. Pulsa Pausar respaldo (o Detener durante un análisis) y espera a que finalice antes de cerrar."; return .terminateCancel
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard !model.busy, !model.devices.importing else { model.error = "Pulsa Pausar respaldo (o Detener durante un análisis) y espera a que termine la operación antes de cerrar."; return false }; return true
    }
}

func makeDemo(_ folder: URL) throws -> URL {
    try SafeFiles.makeDirectory(folder)
    let photos = folder.appendingPathComponent("Fotos de muestra"); try SafeFiles.makeDirectory(photos)
    for index in 1...6 {
        let url = photos.appendingPathComponent("Paisaje de prueba \(index).png")
        guard !FileManager.default.fileExists(atPath: url.path) else { continue }
        let image = NSImage(size: NSSize(width: 640, height: 420)); image.lockFocus()
        NSGradient(starting: NSColor(calibratedHue: CGFloat(index) / 8, saturation: 0.38, brightness: 0.65, alpha: 1), ending: .black)?.draw(in: NSRect(x: 0, y: 0, width: 640, height: 420), angle: 90)
        NSColor(calibratedWhite: 1, alpha: 0.3).setFill(); NSBezierPath(ovalIn: NSRect(x: 400, y: 230, width: 100, height: 100)).fill()
        let mountain = NSBezierPath(); mountain.move(to: .zero); mountain.line(to: NSPoint(x: 240, y: 275)); mountain.line(to: NSPoint(x: 640, y: 0)); mountain.close(); NSColor(calibratedWhite: 0.1, alpha: 0.7).setFill(); mountain.fill()
        ("MUESTRA \(index)" as NSString).draw(at: NSPoint(x: 35, y: 35), withAttributes: [.font: NSFont.systemFont(ofSize: 24, weight: .medium), .foregroundColor: NSColor.white]); image.unlockFocus()
        let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
        try rep.representation(using: .png, properties: [:])!.write(to: url)
    }
    let duplicate = photos.appendingPathComponent("Paisaje repetido.png")
    if !FileManager.default.fileExists(atPath: duplicate.path) { try FileManager.default.copyItem(at: photos.appendingPathComponent("Paisaje de prueba 1.png"), to: duplicate) }
    let chat = folder.appendingPathComponent("WhatsApp - ejemplo"); try SafeFiles.makeDirectory(chat)
    try "[10/10/26, 10:00:00] Sistema: Conversación ficticia para probar el visor.\n[10/10/26, 10:01:00] Ana: ¿Guardamos las fotos del paseo?\n[10/10/26, 10:02:00] Luis: Sí, en el archivo familiar.\n[10/10/26, 10:03:00] Ana: Perfecto. Primero verificamos las copias.\nEste mensaje ocupa dos líneas.\n".write(to: chat.appendingPathComponent("_chat.txt"), atomically: true, encoding: .utf8)
    try "Archivo de prueba. Ningún dato personal real.\n".write(to: folder.appendingPathComponent("LEEME - muestra.txt"), atomically: true, encoding: .utf8)
    return folder
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate(); app.delegate = delegate
withExtendedLifetime(delegate) { app.run() }
