import Cocoa
import Foundation

if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--run-trackhunt" {
    ManagedLauncher.runHelper(root: CommandLine.arguments[2])
}

if CommandLine.arguments.contains("--self-test") {
    do { try runStoreTests(); exit(0) }
    catch { fputs("FAIL: \(error.localizedDescription)\n", stderr); exit(1) }
}

let app = NSApplication.shared
do {
    guard let resources = Bundle.main.resourceURL else { throw LogikError.message("No encontramos los archivos de LOGIKAPPS.") }
    let directory: URL
    if let custom = ProcessInfo.processInfo.environment["LOGIKAPPS_DATA_DIR"] {
        directory = URL(fileURLWithPath: custom, isDirectory: true)
    } else {
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("LOGIKAPPS", isDirectory: true)
    }
    if CommandLine.arguments.contains("--ui-smoke-test") {
        guard ProcessInfo.processInfo.environment["LOGIKAPPS_DATA_DIR"] != nil,
              StateStore.isTemporaryTestDirectory(directory) else {
            fputs("El test de interfaz requiere LOGIKAPPS_DATA_DIR en una subcarpeta temporal. No se modificaron datos.\n", stderr)
            exit(1)
        }
    }
    let catalog = resources.appendingPathComponent("catalog.json")
    let store = try StateStore(directory: directory, catalog: catalog)
    let delegate = AppDelegate(store: store, webDirectory: resources.appendingPathComponent("web", isDirectory: true), catalog: catalog)
    app.delegate = delegate
    withExtendedLifetime(delegate) { app.run() }
} catch {
    app.setActivationPolicy(.regular)
    app.activate(ignoringOtherApps: true)
    let alert = NSAlert(); alert.messageText = "No pudimos abrir LOGIKAPPS"; alert.informativeText = error.localizedDescription
    alert.addButton(withTitle: "Cerrar"); alert.runModal()
    exit(1)
}
