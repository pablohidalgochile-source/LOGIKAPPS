import AppKit
import SwiftUI
import ScanCore

@main
struct TrackHuntApp: App {
    @StateObject private var model = ScanModel()
    @State private var bridge: LocalBridge?
    var body: some Scene {
        WindowGroup("Track Hunt · Asistente Mac") {
            AssistantView(model: model)
                .task {
                    guard bridge == nil else { return }
                    let local = LocalBridge(model: model)
                    do { try local.start(); bridge = local }
                    catch { model.connectionMessage = "La conexión local está ocupada. Cierra otra copia del asistente." }
                }
                .onOpenURL { url in
                    if url.scheme == "trackhunt-assistant", url.host == "open" { NSApp.activate(ignoringOtherApps: true) }
                }
        }.defaultSize(width: 630, height: 510)
    }
}

struct AssistantView: View {
    @ObservedObject var model: ScanModel
    @State private var step = 60.0
    @State private var problem = ""
    private let acid = Color(red: 0.78, green: 1, blue: 0.21)
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack { Text("TRACK HUNT").font(.title.bold()); Spacer(); Text("ASISTENTE MAC").font(.caption.monospaced()).foregroundStyle(acid) }
            Text("Archivos o YouTube por fragmentos, sin salida de audio.").foregroundStyle(.secondary)
            Label(model.connectionMessage, systemImage: "desktopcomputer").font(.callout)
            if !model.ready {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Motor ShazamIO no disponible").font(.headline)
                    Text("Vuelve a descargar el asistente completo. El motor viene incluido; no necesitas Python ni Apple Developer.").font(.callout)
                    Link("Descargar asistente actualizado", destination: URL(string: BridgePolicy.production + "/sets")!)
                }.padding().background(Color.orange.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 8))
            }
            Text("SHAZAMIO · GRATIS · INTEGRACIÓN NO OFICIAL").font(.caption.monospaced()).foregroundStyle(acid)
            if !model.snapshot.fileName.isEmpty {
                Text(model.snapshot.fileName).font(.headline).lineLimit(2)
                ProgressView(value: Double(model.snapshot.completed), total: Double(max(1, model.snapshot.total))).tint(acid)
                Text("\(model.snapshot.completed) / \(model.snapshot.total) fragmentos · \(model.snapshot.tracks.count) apariciones · \(model.snapshot.unknown.count) fragmentos sin coincidencia").font(.callout)
                Text(model.snapshot.saveError ?? "Guardado automático en este Mac").font(.caption).foregroundStyle(.secondary)
                Text(model.snapshot.message).font(.callout).foregroundStyle(.secondary)
            }
            Picker("Profundidad", selection: $step) {
                Text("Equilibrado · cada 60 s").tag(60.0)
                Text("Detallado · cada 30 s").tag(30.0)
            }.disabled(model.active || model.picking)
            HStack {
                Button(model.picking ? "Eligiendo archivo…" : "Seleccionar set") {
                    Task { do { try await model.pickAndStart(step: step); problem = "" } catch { problem = error.localizedDescription } }
                }.disabled(!model.ready || model.active || model.picking)
                if model.active {
                    if model.snapshot.status == "scanning" { Button("Pausar") { model.pause() } }
                    else { Button("Reanudar") { model.resume() } }
                    Button("Cancelar") { model.cancel() }
                }
                Spacer()
                Button("Abrir Track Hunt") { NSWorkspace.shared.open(URL(string: BridgePolicy.production + "/sets")!) }
            }
            if !problem.isEmpty { Text(problem).foregroundStyle(.orange).font(.callout) }
            Spacer(minLength: 0)
            Text("Usa Seleccionar set para archivos o la extensión de Chrome para YouTube. Shazam recibe huellas acústicas; Track Hunt recibe títulos y tiempos. Mantén abierto el asistente.").font(.caption).foregroundStyle(.secondary)
        }.onChange(of: model.snapshot.step) { step = $0 }.padding(26).frame(minWidth: 560, minHeight: 470).preferredColorScheme(.dark)
    }
}
