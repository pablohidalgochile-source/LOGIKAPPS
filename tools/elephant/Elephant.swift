import SwiftUI
import AppKit
import UniformTypeIdentifiers

let accent = Color(red: 0.83, green: 0.96, blue: 0.39)
let ink = Color(red: 0.055, green: 0.075, blue: 0.067)

@MainActor final class Studio: ObservableObject {
    @Published var input: URL?
    @Published var before: NSImage?
    @Published var after: NSImage?
    @Published var width = 0
    @Published var height = 0
    @Published var preset = "2x"
    @Published var custom = "10000"
    @Published var mode = "faithful"
    @Published var running = false
    @Published var progress = 0.0
    @Published var status = "Todo sucede en tu Mac."
    @Published var error: String?
    @Published var ai = false
    @Published var ready = false
    @Published var result: URL?
    @Published var resultSize = ""
    @Published var split = 0.5
    private var process: Process?
    private var jobDirectory: URL?
    private var buffer = Data()
    private var cancelled = false
    var python: String { ["/Library/Frameworks/Python.framework/Versions/3.13/bin/python3", "/opt/homebrew/bin/python3", "/usr/bin/python3"].first { FileManager.default.isExecutableFile(atPath: $0) } ?? "/usr/bin/python3" }
    var worker: String { Bundle.main.path(forResource: "worker", ofType: "py")! }
    var target: (Int, Int) {
        guard width > 0, height > 0 else { return (0,0) }
        let longest = max(width,height)
        let factor: Double
        switch preset {
        case "2x": factor = 2
        case "4x": factor = 4
        case "4K": factor = 3840 / Double(longest)
        case "8K": factor = 7680 / Double(longest)
        default: factor = Double(Int(custom) ?? 0) / Double(longest)
        }
        guard factor.isFinite, factor > 0, factor < 100000 else { return (0,0) }
        return (max(1,Int((Double(width)*factor).rounded())),max(1,Int((Double(height)*factor).rounded())))
    }
    var validation: String? {
        guard input != nil else { return nil }
        let (w,h) = target
        if w <= 0 || h <= 0 { return "Escribe un tamaño válido." }
        if max(w,h) <= max(width,height) { return "Elige un tamaño mayor que el original." }
        if Double(w)*Double(h) > 80_000_000 || max(w,h)>16384 { return "Máximo: 80 megapíxeles y 16.384 px por lado." }
        return nil
    }
    init() { check() }
    func check() {
        let p = Process(); p.executableURL = URL(fileURLWithPath: python)
        p.arguments = [worker,"--check"]
        let pipe = Pipe(); p.standardOutput = pipe
        do {
            try p.run(); p.waitUntilExit()
            if let data = try JSONSerialization.jsonObject(with: pipe.fileHandleForReading.readDataToEndOfFile()) as? [String:Any] {
                ai = data["ai"] as? Bool ?? false
                ready = data["magick"] as? String != nil
            }
        } catch { self.error = error.localizedDescription }
    }
    func choose() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.png,.jpeg,.tiff,.heic,.webP,.bmp]
        panel.allowsMultipleSelection = false; panel.canChooseDirectories = false
        panel.message = "Elige la imagen que quieres hacer crecer."
        if panel.runModal() == .OK, let url = panel.url { load(url) }
    }
    func load(_ url: URL) {
        guard !running else { return }
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],
              let w = properties[kCGImagePropertyPixelWidth] as? Int,
              let h = properties[kCGImagePropertyPixelHeight] as? Int else {
            error = "No pudimos abrir esa imagen. Prueba con JPG, PNG, HEIC, TIFF o WebP."; return
        }
        guard Double(w)*Double(h) <= 100_000_000 else { error = "La imagen de entrada supera los 100 megapíxeles."; return }
        let opts: [CFString:Any] = [kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:2400]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source,0,opts as CFDictionary) else { error = "No se pudo crear la vista previa."; return }
        cleanup()
        let orientation = properties[kCGImagePropertyOrientation] as? Int ?? 1
        width = orientation >= 5 ? h : w; height = orientation >= 5 ? w : h
        input = url; before = NSImage(cgImage: thumbnail, size: .zero)
        after = nil; result = nil; error = nil; progress = 0; status = "Lista para crecer."; split = 0.5
    }
    func start() {
        guard let input, ready, validation == nil, !running else { return }
        cleanup(); error = nil; after = nil; result = nil; running = true; cancelled = false; buffer = Data(); progress = 0
        status = "Preparando la imagen…"
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("Elephant-"+UUID().uuidString)
        do { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories:true) }
        catch { running = false; self.error = error.localizedDescription; return }
        jobDirectory = dir
        let output = dir.appendingPathComponent("resultado.png")
        let p = Process(); p.executableURL = URL(fileURLWithPath:python)
        p.arguments = [worker,"--input",input.path,"--output",output.path,"--mode",mode,"--preset",preset,"--custom",String(Int(custom) ?? 0)]
        let pipe = Pipe(); p.standardOutput = pipe; p.standardError = Pipe()
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            Task { @MainActor [weak self] in self?.consume(data) }
        }
        p.terminationHandler = { [weak self] proc in
            Task { @MainActor [weak self] in
                guard let self else { return }
                // Output file, rather than callback ordering, determines success.
                self.running = false; self.process = nil
                if self.cancelled {
                    self.status = "Ampliación cancelada."; self.progress = 0; self.cleanup()
                } else if proc.terminationStatus == 0, FileManager.default.fileExists(atPath:output.path) {
                    self.result = output; self.after = self.preview(output); self.progress = 1
                    if let source = CGImageSourceCreateWithURL(output as CFURL,nil), let props = CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any] {
                        self.resultSize = "\(props[kCGImagePropertyPixelWidth] ?? "") × \(props[kCGImagePropertyPixelHeight] ?? "") px"
                    }
                    self.status = "Tu imagen ya creció."
                } else if self.error == nil { self.error = "El motor no pudo terminar la ampliación." }
            }
        }
        process = p
        do { try p.run() } catch { running = false; process = nil; self.error = error.localizedDescription }
    }
    func preview(_ url: URL) -> NSImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL,nil), let cg = CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceThumbnailMaxPixelSize:2400] as CFDictionary) else { return nil }
        return NSImage(cgImage:cg,size:.zero)
    }
    func consume(_ data: Data) {
        buffer.append(data)
        while let newline = buffer.firstIndex(of:10) {
            let line = buffer.prefix(upTo:newline); buffer.removeSubrange(...newline)
            guard let event = try? JSONSerialization.jsonObject(with:line) as? [String:Any], !cancelled else { continue }
            if let p = event["progress"] as? Double { progress = p }
            if let s = event["message"] as? String { status = s }
            if let e = event["error"] as? String { error = e }
        }
    }
    func cancel() { cancelled = true; status = "Cancelando…"; process?.terminate() }
    func cleanup() {
        if let dir = jobDirectory { try? FileManager.default.removeItem(at:dir) }
        jobDirectory = nil
    }
    func save() {
        guard let result, let input else { return }
        let panel = NSSavePanel(); panel.allowedContentTypes = [.png]
        panel.nameFieldStringValue = input.deletingPathExtension().lastPathComponent + "_Elephant.png"
        panel.message = "Guarda tu ampliación como una nueva imagen PNG."
        guard panel.runModal() == .OK, let destination = panel.url else { return }
        guard destination.standardizedFileURL.resolvingSymlinksInPath() != input.standardizedFileURL.resolvingSymlinksInPath() else { error = "Elige otro nombre para conservar tu imagen original."; return }
        do {
            // Atomic write; replacement has been explicitly confirmed by NSSavePanel.
            try Data(contentsOf:result,options:.mappedIfSafe).write(to:destination,options:.atomic)
            status = "Copia guardada: \(destination.lastPathComponent)"
            NSWorkspace.shared.activateFileViewerSelecting([destination])
        } catch { self.error = error.localizedDescription }
    }
    func shutdown() { cancel(); if process == nil { cleanup() } }
}

struct ContentView: View {
    @ObservedObject var studio: Studio
    @State private var hovering = false
    var body: some View {
        HStack(spacing:0) {
            sidebar.frame(width:290)
            Rectangle().fill(Color.white.opacity(0.09)).frame(width:1)
            VStack(alignment:.leading,spacing:22) {
                HStack {
                    VStack(alignment:.leading,spacing:7) {
                        Text("Dale espacio a tus imágenes.").font(.system(size:27,weight:.semibold))
                        Text("Más tamaño. Todo en tu Mac.").foregroundStyle(.secondary)
                    }
                    Spacer()
                    Label("100% LOCAL",systemImage:"lock.shield").font(.system(size:10,weight:.bold,design:.monospaced)).foregroundStyle(accent)
                }
                canvas
                if studio.after != nil {
                    HStack {
                        Text("Original").font(.caption).foregroundStyle(.secondary)
                        Slider(value:$studio.split,in:0...1).tint(accent).accessibilityLabel("Comparación antes y después")
                        Text("Elephant").font(.caption).foregroundStyle(accent)
                    }
                    Text("Comparación ajustada a la ventana · abre la copia exportada para revisar al 100%.").font(.caption2).foregroundStyle(.secondary)
                }
                HStack {
                    VStack(alignment:.leading,spacing:6) {
                        Text(studio.status).font(.system(size:13,weight:.medium)).lineLimit(2)
                        if studio.running { ProgressView(value:studio.progress).tint(accent).frame(width:240) }
                        else if studio.result != nil { Text(studio.resultSize + " · PNG").font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    if studio.running {
                        Text("\(Int(studio.progress*100))% ").monospacedDigit().foregroundStyle(.secondary)
                        Button("Cancelar") { studio.cancel() }
                    } else if studio.result != nil {
                        Button { studio.save() } label: { Label("Guardar copia",systemImage:"square.and.arrow.down").padding(.horizontal,12).padding(.vertical,7) }.buttonStyle(.borderedProminent).tint(accent).foregroundStyle(ink)
                    }
                }.frame(minHeight:45)
            }.padding(32)
        }
        .background(ink).foregroundStyle(Color.white.opacity(0.94))
        .preferredColorScheme(.dark)
        .frame(minWidth:960,minHeight:690)
        .alert("Elephant",isPresented:Binding(get:{ studio.error != nil },set:{ if !$0 { studio.error = nil } })) {
            Button("Entendido",role:.cancel) { studio.error = nil }
        } message: { Text(studio.error ?? "") }
    }
    var sidebar: some View {
        VStack(alignment:.leading,spacing:24) {
            HStack(spacing:10) {
                if let path = Bundle.main.path(forResource:"mark",ofType:"png"), let logo = NSImage(contentsOfFile:path) {
                    Image(nsImage:logo).resizable().scaledToFit().frame(width:46,height:46).cornerRadius(10)
                }
                VStack(alignment:.leading,spacing:3) {
                    Text("Elephant").font(.system(size:26,weight:.bold))
                    Text("BY LOGIKAPPS").font(.system(size:9,weight:.semibold,design:.monospaced)).tracking(2).foregroundStyle(.secondary)
                }
            }
            Rectangle().fill(Color.white.opacity(0.1)).frame(height:1)
            VStack(alignment:.leading,spacing:12) {
                eyebrow("01 / TU IMAGEN")
                Button { studio.choose() } label: { Label(studio.input == nil ? "Elegir imagen" : "Cambiar imagen",systemImage:"plus").frame(maxWidth:.infinity).padding(.vertical,8) }.disabled(studio.running)
                if let input = studio.input {
                    Text(input.lastPathComponent).font(.caption).lineLimit(2).textSelection(.enabled)
                    Text("\(studio.width) × \(studio.height) px").font(.caption).foregroundStyle(.secondary)
                } else { Text("JPG, PNG, HEIC, TIFF y WebP").font(.caption2).foregroundStyle(.secondary) }
            }
            VStack(alignment:.leading,spacing:12) {
                eyebrow("02 / CUÁNTO CRECE")
                Picker("Tamaño",selection:$studio.preset) {
                    Text("2×").tag("2x"); Text("4×").tag("4x"); Text("4K").tag("4K"); Text("8K").tag("8K"); Text("A medida").tag("custom")
                }.labelsHidden()
                if studio.preset == "custom" { TextField("Lado mayor en píxeles",text:$studio.custom).textFieldStyle(.roundedBorder) }
                Text(studio.input == nil ? "Conserva las proporciones." : "Salida: \(studio.target.0) × \(studio.target.1) px").font(.caption).foregroundStyle(accent)
                if studio.preset == "4K" || studio.preset == "8K" || studio.preset == "custom" { Text("El tamaño corresponde al lado mayor.").font(.caption2).foregroundStyle(.secondary) }
                if let validation = studio.validation { Text(validation).font(.caption).foregroundStyle(.orange) }
            }.disabled(studio.running)
            VStack(alignment:.leading,spacing:12) {
                eyebrow("03 / CÓMO CRECE")
                Picker("Método",selection:$studio.mode) {
                    Text("Fiel").tag("faithful"); Text("Mejorar con IA").tag("ai")
                }.pickerStyle(.segmented).labelsHidden()
                Text(studio.mode == "faithful" ? "Ampliación suave, sin generar detalles nuevos. Ideal para logos y gráficos." : "Real-ESRGAN reconstruye detalles. Puede modificar texturas, rostros y letras.").font(.caption).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
                if studio.mode == "ai" && !studio.ai { Text("Motor IA no disponible en este Mac.").font(.caption).foregroundStyle(.orange) }
            }.disabled(studio.running)
            Spacer(minLength:0)
            Button { studio.start() } label: {
                HStack { Text("Ampliar imagen"); Spacer(); Image(systemName:"arrow.up.right") }.font(.system(size:14,weight:.semibold)).padding(12).foregroundStyle(ink).background(accent).cornerRadius(12)
            }.buttonStyle(.plain).disabled(studio.input == nil || studio.running || !studio.ready || studio.validation != nil || (studio.mode == "ai" && !studio.ai)).opacity(studio.input == nil || studio.running ? 0.45 : 1)
            Text(studio.ready ? "●  Motor local listo · v0.1.1" : "ImageMagick no está disponible").font(.system(size:10)).foregroundStyle(studio.ready ? Color.secondary : Color.orange)
        }.padding(24).background(Color.white.opacity(0.025))
    }
    func eyebrow(_ text: String) -> some View { Text(text).font(.system(size:10,weight:.semibold,design:.monospaced)).tracking(1.3).foregroundStyle(.secondary) }
    var canvas: some View {
        GeometryReader { geometry in
            ZStack {
                RoundedRectangle(cornerRadius:18).fill(Color.white.opacity(0.035))
                if let before = studio.before {
                    let ratio = CGFloat(studio.width)/CGFloat(max(1,studio.height))
                    let w = min(geometry.size.width-30,(geometry.size.height-30)*ratio)
                    let h = w/ratio
                    ZStack(alignment:.leading) {
                        Image(nsImage:before).resizable().interpolation(.high).frame(width:w,height:h)
                        if let after = studio.after {
                            Image(nsImage:after).resizable().interpolation(.high).frame(width:w,height:h)
                                .mask(alignment:.trailing) { Rectangle().frame(width:w*(1-studio.split)) }
                            Rectangle().fill(accent).frame(width:2,height:h).offset(x:w*studio.split)
                            Image(systemName:"arrow.left.and.right").font(.system(size:10,weight:.bold)).foregroundStyle(ink).padding(9).background(accent,in:Circle()).offset(x:w*studio.split-15)
                        }
                    }.frame(width:w,height:h).clipped()
                } else {
                    VStack(spacing:18) {
                        Image(systemName:"arrow.up.left.and.arrow.down.right").font(.system(size:42,weight:.ultraLight)).foregroundStyle(accent)
                        Text("Pequeña imagen.\nGrandes posibilidades.").font(.system(size:31,weight:.medium)).multilineTextAlignment(.center)
                        Text("Arrastra tu foto aquí para empezar").font(.system(size:14)).foregroundStyle(.secondary)
                        Button("o elige un archivo") { studio.choose() }.buttonStyle(.link).tint(accent)
                    }
                }
                RoundedRectangle(cornerRadius:18).stroke(hovering ? accent : Color.white.opacity(0.10),style:StrokeStyle(lineWidth:1,dash:studio.input == nil ? [6,6] : []))
            }
        }.frame(maxWidth:.infinity,maxHeight:.infinity)
        .onDrop(of:[UTType.fileURL],isTargeted:$hovering) { providers in
            guard !studio.running, let provider = providers.first else { return false }
            _ = provider.loadObject(ofClass:URL.self) { url, _ in
                if let url { Task { @MainActor in studio.load(url) } }
            }
            return true
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var studio: Studio?
    var video: VideoStudio?
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool { true }
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {
        guard let studio else { return .terminateNow }
        if studio.running || video?.activeID != nil {
            let alert = NSAlert(); alert.messageText = "¿Cancelar la ampliación y cerrar?"; alert.addButton(withTitle:"Seguir trabajando"); alert.addButton(withTitle:"Cancelar y cerrar")
            if alert.runModal() == .alertFirstButtonReturn { return .terminateCancel }
        }
        studio.shutdown(); video?.shutdown(); return .terminateNow
    }
}

@main struct ElephantApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject var studio = Studio()
    @StateObject var video = VideoStudio()
    @State private var selectedTab = 0
    @State private var didStart = false
    var body: some Scene {
        WindowGroup("Elephant") {
            TabView(selection:$selectedTab) {
                ContentView(studio:studio).tabItem { Label("Fotos",systemImage:"photo") }.tag(0)
                VideoStudioView(studio:video).tabItem { Label("Video",systemImage:"film") }.tag(1)
            }.onAppear {
                guard !didStart else { return };didStart=true
                delegate.video = video
                if let index=CommandLine.arguments.firstIndex(of:"--video-smoke-test"),CommandLine.arguments.count>index+1 {
                    selectedTab=1
                    video.smokeTest(URL(fileURLWithPath:CommandLine.arguments[index+1]))
                }
                delegate.studio = studio
                NSApp.setActivationPolicy(.regular); NSApp.activate(ignoringOtherApps:true)
            }
        }.defaultSize(width:1150,height:860)
        .commands {
            CommandGroup(replacing:.newItem) { Button("Abrir archivo…") { if selectedTab==1 { video.choose() } else {studio.choose()} }.keyboardShortcut("o").disabled(selectedTab==0 && studio.running) }
            CommandGroup(replacing:.saveItem) { Button("Guardar copia…") { studio.save() }.keyboardShortcut("s").disabled(selectedTab==1 || studio.result == nil || studio.running) }
        }
    }
}
