import SwiftUI
import AppKit
import AVKit
import UniformTypeIdentifiers

struct VideoInfo: Codable {
    let width: Int
    let height: Int
    let duration: Double
    let fps: Double
    let audio_tracks: Int
    let hdr: Bool
    let interlaced: Bool
    let variable_hint: Bool
}
struct VideoJob: Codable, Identifiable {
    var id = UUID().uuidString
    var input: String
    var output: String
    var mode: String
    var preset: String
    var custom: Int
    var format: String
    var start: Double
    var duration: Double
    var preview: Bool
    var state = "En cola"
    var progress = 0.0
    var message = ""
    var eta: Double?
}

@MainActor final class VideoStudio: ObservableObject {
    @Published var input: URL?
    @Published var info: VideoInfo?
    @Published var jobs: [VideoJob] = []
    @Published var inspecting = false
    @Published var mode = "faithful"
    @Published var preset = "2x"
    @Published var custom = "10000"
    @Published var format = "mp4"
    @Published var previewStart = "0"
    @Published var previewDuration = "3"
    @Published var error: String?
    @Published var activeID: String?
    @Published var autoRun = false
    @Published var player: AVPlayer?
    @Published var playerLabel = "Original"
    @Published var selectedJob: String?
    @Published var estimateText = ""
    private var process: Process?
    private var pausing = false
    private var inspectionID = UUID()
    private var lastPersist = Date.distantPast
    var root: URL {
        if let override = ProcessInfo.processInfo.environment["ELEPHANT_DATA_DIR"] { return URL(fileURLWithPath:override) }
        return FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("Elephant/Video")
    }
    var script: String { Bundle.main.path(forResource:"video_worker",ofType:"py")! }
    var python: String { ["/Library/Frameworks/Python.framework/Versions/3.13/bin/python3","/opt/homebrew/bin/python3","/usr/bin/python3"].first{FileManager.default.isExecutableFile(atPath:$0)} ?? "/usr/bin/python3" }
    var ready: Bool { FileManager.default.isExecutableFile(atPath:"/opt/homebrew/bin/ffmpeg") || FileManager.default.isExecutableFile(atPath:"/usr/local/bin/ffmpeg") }
    var aiReady: Bool { FileManager.default.isExecutableFile(atPath:NSHomeDirectory()+"/AI-UPSCALER/realesrgan-ncnn-vulkan") }
    init() {
        do {
            try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
            let file=root.appendingPathComponent("queue.json")
            if FileManager.default.fileExists(atPath:file.path) {
                jobs=try JSONDecoder().decode([VideoJob].self,from:Data(contentsOf:file))
                guard jobs.allSatisfy({UUID(uuidString:$0.id) != nil}) else { jobs=[];error="La cola contiene identificadores inválidos.";return }
                for i in jobs.indices where jobs[i].state == "Procesando" {
                    jobs[i].state="Pausado";jobs[i].message="Interrumpido; listo para recuperar."
                }
            }
        } catch { self.error="No se pudo leer la cola guardada: \(error.localizedDescription)" }
    }
    var dimensions: (Int,Int) {
        guard let info else { return (0,0) }
        let factor: Double
        switch preset {
        case "2x":factor=2
        case "4x":factor=4
        case "4K":factor=3840/Double(max(info.width,info.height))
        case "8K":factor=7680/Double(max(info.width,info.height))
        default:factor=Double(Int(custom) ?? 0)/Double(max(info.width,info.height))
        }
        guard factor>0,factor<100000 else { return (0,0) }
        let w=Int((Double(info.width)*factor).rounded()),h=Int((Double(info.height)*factor).rounded())
        return (w+w%2,h+h%2)
    }
    var validation: String? {
        guard ready else { return "Faltan FFmpeg o sus herramientas locales." }
        guard let info else { return "Elige un video para empezar." }
        if info.hdr { return "Video HDR: convierte una copia a SDR antes de ampliarla." }
        if info.interlaced { return "Video entrelazado: desentrelaza una copia antes de ampliarla." }
        if mode == "ai" && !aiReady { return "No se encontró el motor IA local." }
        let (w,h)=dimensions
        if w<=info.width && h<=info.height { return "Elige un tamaño mayor que el original." }
        if w<2 || h<2 || max(w,h)>16384 || Double(w)*Double(h)>80_000_000 { return "Máximo: 80 megapíxeles y 16.384 px por lado." }
        return nil
    }
    func persist() {
        do { try JSONEncoder().encode(jobs).write(to:root.appendingPathComponent("queue.json"),options:.atomic) }
        catch { self.error="No se pudo guardar la cola: \(error.localizedDescription)";autoRun=false }
    }
    func choose() {
        let panel=NSOpenPanel();panel.allowedContentTypes=[.movie,.video,.mpeg4Movie,.quickTimeMovie]
        panel.allowsMultipleSelection=false
        if panel.runModal() == .OK,let url=panel.url { load(url) }
    }
    func load(_ url: URL) {
        let token=UUID();inspectionID=token;inspecting=true;info=nil;input=url;estimateText=""
        player?.pause();player=AVPlayer(url:url);playerLabel="Original"
        let executable=python,path=script
        Task {
            let response: (Data,Int32) = await Task.detached {
                let p=Process();p.executableURL=URL(fileURLWithPath:executable);p.arguments=[path,"--inspect",url.path]
                let pipe=Pipe();p.standardOutput=pipe;p.standardError=FileHandle.nullDevice
                do { try p.run();let data=pipe.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit();return(data,p.terminationStatus) }
                catch { return(Data(),1) }
            }.value
            guard inspectionID==token else { return }
            inspecting=false
            do {
                let obj=try JSONSerialization.jsonObject(with:response.0) as? [String:Any]
                if let e=obj?["error"] as? String { error=e;return }
                guard let value=obj?["info"] else { error="No se pudo leer el video.";return }
                info=try JSONDecoder().decode(VideoInfo.self,from:JSONSerialization.data(withJSONObject:value))
            } catch { self.error="No se pudo inspeccionar el video." }
        }
    }
    func add(preview: Bool) {
        guard validation==nil,let input,let info else { return }
        let start=preview ? (Double(previewStart) ?? -1) : 0
        let duration=preview ? (Double(previewDuration) ?? -1) : 0
        if start<0 || start>=info.duration || (preview && (duration<=0 || duration>15)) {
            error="La muestra debe durar entre 0 y 15 segundos y comenzar dentro del video.";return
        }
        let id=UUID().uuidString
        let ext=format == "prores" ? "mov" : "mp4"
        let output: URL
        if preview {
            output=root.appendingPathComponent(id).appendingPathComponent("Muestra.\(ext)")
            do { try FileManager.default.createDirectory(at:output.deletingLastPathComponent(),withIntermediateDirectories:true) }
            catch { self.error=error.localizedDescription;return }
        } else {
            let panel=NSSavePanel();panel.allowedContentTypes=format == "prores" ? [.quickTimeMovie] : [.mpeg4Movie]
            panel.nameFieldStringValue=input.deletingPathExtension().lastPathComponent+"_Elephant.\(ext)"
            panel.message="Elige un nombre nuevo. La salida conservará todas las pistas de audio."
            guard panel.runModal() == .OK,let url=panel.url else { return }
            guard !FileManager.default.fileExists(atPath:url.path) else { error="Elige un nombre nuevo para conservar los archivos existentes.";return }
            output=url
        }
        var job=VideoJob(input:input.path,output:output.path,mode:mode,preset:preset,custom:Int(custom) ?? 0,format:format,start:start,duration:duration,preview:preview)
        job.id=id;jobs.append(job);selectedJob=id;persist()
        if preview && activeID==nil { autoRun=false;launch(job) }
    }
    func beginQueue() { autoRun=true;next() }
    func next() {
        guard autoRun,activeID==nil,let job=jobs.first(where:{$0.state=="En cola"}) else { return }
        launch(job)
    }
    func resume(_ id:String) {
        guard activeID==nil,let i=jobs.firstIndex(where:{$0.id==id}) else { return }
        jobs[i].state="En cola";jobs[i].message="";persist();autoRun=true;launch(jobs[i])
    }
    func launch(_ job:VideoJob) {
        guard let i=jobs.firstIndex(where:{$0.id==job.id}) else { return }
        activeID=job.id;selectedJob=job.id;pausing=false
        jobs[i].state="Procesando";jobs[i].message="Preparando video…";persist()
        let p=Process();p.executableURL=URL(fileURLWithPath:python)
        p.arguments=[script,"--input",job.input,"--output",job.output,"--work",root.appendingPathComponent(job.id).path,
                     "--mode",job.mode,"--format",job.format,"--preset",job.preset,"--custom",String(job.custom),"--start",String(job.start),"--duration",String(job.duration)]
        let pipe=Pipe();p.standardOutput=pipe;p.standardError=FileHandle.nullDevice
        process=p
        do { try p.run() }
        catch { jobs[i].state="Error";jobs[i].message=error.localizedDescription;activeID=nil;process=nil;autoRun=false;persist();return }
        Task.detached { [weak self] in
            var buffer=Data()
            while true {
                let data=pipe.fileHandleForReading.availableData
                if data.isEmpty { break }
                buffer.append(data)
                while let n=buffer.firstIndex(of:10) {
                    let line=Data(buffer.prefix(upTo:n));buffer.removeSubrange(...n)
                    await self?.receive(line,job.id)
                }
            }
            p.waitUntilExit()
            await self?.finished(job.id,p.terminationStatus)
        }
    }
    func receive(_ data:Data,_ id:String) {
        guard let i=jobs.firstIndex(where:{$0.id==id}),let event=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] else { return }
        if let progress=event["progress"] as? Double { jobs[i].progress=progress }
        if let text=event["message"] as? String { jobs[i].message=text }
        if let eta=event["eta_seconds"] as? Double,eta.isFinite { jobs[i].eta=eta }
        if jobs[i].preview,let elapsed=event["processing_seconds"] as? Double,let duration=event["duration"] as? Double,let info, duration>0 {
            estimateText=String(format:"Muestra lista. Video completo: aprox. %.1f min con estos ajustes; puede variar.",elapsed*info.duration/duration/60)
        }
        if let e=event["error"] as? String { jobs[i].message=e;jobs[i].state="Error" }
        if Date().timeIntervalSince(lastPersist)>2 { persist();lastPersist=Date() }
    }
    func finished(_ id:String,_ code:Int32) {
        guard let i=jobs.firstIndex(where:{$0.id==id}) else { return }
        if code==0,FileManager.default.fileExists(atPath:jobs[i].output) {
            jobs[i].state="Terminado";jobs[i].progress=1;jobs[i].eta=nil
            if jobs[i].preview { show(jobs[i]) }
        } else if pausing || code==130 {
            jobs[i].state="Pausado";jobs[i].message=jobs[i].mode=="ai" ? "Fotogramas y bloques guardados para reanudar." : "Al reanudar, el modo Fiel reinicia la exportación."
        } else {
            jobs[i].state="Error";if jobs[i].message.isEmpty { jobs[i].message="No se pudo terminar. Puedes reintentar." };autoRun=false
        }
        activeID=nil;process=nil;persist();next()
    }
    func pause() { autoRun=false;pausing=true;process?.terminate() }
    func show(_ job:VideoJob) {
        selectedJob=job.id;player?.pause();player=AVPlayer(url:URL(fileURLWithPath:job.output));playerLabel=job.preview ? "Muestra ampliada" : "Video ampliado"
    }
    func showOriginal() { guard let input else{return};player?.pause();player=AVPlayer(url:input);playerLabel="Original" }
    func reveal(_ job:VideoJob) { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath:job.output)]) }
    func remove(_ id:String) {
        guard activeID != id,let i=jobs.firstIndex(where:{$0.id==id}) else { return }
        // Exports are retained; only job-owned checkpoints and previews are removed.
        let directory=root.appendingPathComponent(id)
        do { if FileManager.default.fileExists(atPath:directory.path) { try FileManager.default.removeItem(at:directory) };jobs.remove(at:i);persist() }
        catch { self.error=error.localizedDescription }
    }
    func shutdown() { autoRun=false;pause();persist();player?.pause() }
    func smokeTest(_ source:URL) {
        guard ProcessInfo.processInfo.environment["ELEPHANT_DATA_DIR"] != nil else { print("Smoke test requires isolated data directory");exit(2) }
        load(source)
        Task {
            for _ in 0..<200 { if !inspecting { break };try? await Task.sleep(nanoseconds:50_000_000) }
            guard info != nil,validation==nil else { print("Inspection failed: \(error ?? "unknown")");exit(3) }
            previewDuration="0.5";add(preview:true);add(preview:true);beginQueue()
            for _ in 0..<1200 {
                if jobs.count==2 && jobs.allSatisfy({$0.state=="Terminado"}) {
                    let recovered=VideoStudio()
                    guard recovered.jobs.count==2 else {exit(5)}
                    print("VIDEO_UI_SMOKE_OK: inspect, preview, queue, playback result, persistence")
                    shutdown();exit(0)
                }
                if jobs.contains(where:{$0.state=="Error"}) { print(jobs.map{$0.message});exit(4) }
                try? await Task.sleep(nanoseconds:50_000_000)
            }
            print("UI smoke timeout");exit(6)
        }
    }
    var storageEstimate: String {
        guard let info else { return "" }
        let pixels=Double(dimensions.0)*Double(dimensions.1)
        let bytes=pixels*info.fps*info.duration*(format=="mp4" ? 0.12 : 0.7)
        let scratch=mode=="ai" ? pixels*3*48*2 : 0
        return String(format:"Reserva para video completo: %.1f GB. El tamaño real depende del contenido.",(bytes*3+scratch+536870912)/1073741824)
    }
}

struct NativeVideoPlayer: NSViewRepresentable {
    let player: AVPlayer
    func makeNSView(context: Context) -> AVPlayerView {
        let view=AVPlayerView();view.controlsStyle = .inline;view.videoGravity = .resizeAspect
        return view
    }
    func updateNSView(_ view: AVPlayerView,context: Context) {
        if view.player !== player { view.player=player }
    }
}

struct VideoStudioView: View {
    @ObservedObject var studio:VideoStudio
    @State private var targeted=false
    @State private var removal: String?
    var body:some View {
        HStack(spacing:0) {
            ScrollView {
                VStack(alignment:.leading,spacing:18) {
                    Text("Elephant / Video").font(.system(size:24,weight:.bold))
                    Text("HAZ CRECER EL MOVIMIENTO").font(.system(size:9,design:.monospaced)).tracking(1.4).foregroundStyle(accent)
                    Button("Elegir video…",systemImage:"film") { studio.choose() }.frame(maxWidth:.infinity)
                    if studio.inspecting { ProgressView("Leyendo video…") }
                    if let input=studio.input { Text(input.lastPathComponent).font(.caption).lineLimit(2) }
                    if let info=studio.info {
                        Text("\(info.width) × \(info.height) · \(info.fps,specifier:"%.3f") fps\n\(info.duration,specifier:"%.1f") s · \(info.audio_tracks) pistas de audio").font(.caption).foregroundStyle(.secondary)
                    }
                    Divider()
                    Text("TAMAÑO DE SALIDA").font(.caption2).foregroundStyle(.secondary)
                    Picker("Tamaño",selection:$studio.preset) {
                        Text("2×").tag("2x");Text("4×").tag("4x");Text("4K").tag("4K");Text("8K").tag("8K");Text("A medida").tag("custom")
                    }.labelsHidden()
                    if studio.preset=="custom" { TextField("Lado mayor en píxeles",text:$studio.custom).textFieldStyle(.roundedBorder) }
                    if studio.info != nil { Text("\(studio.dimensions.0) × \(studio.dimensions.1) px").foregroundStyle(accent).font(.caption) }
                    Text("4K y 8K indican el lado mayor. Se agrega como máximo 1 px de borde para codificar.").font(.caption2).foregroundStyle(.secondary)
                    Picker("Método",selection:$studio.mode) { Text("Fiel").tag("faithful");Text("IA").tag("ai") }.pickerStyle(.segmented)
                    Text(studio.mode=="ai" ? "Reconstruye cada fotograma. Puede haber parpadeo o cambios de textura; comprueba una muestra. Requiere cadencia constante." : "Amplía sin generar detalles nuevos y conserva la cadencia variable.").font(.caption).foregroundStyle(.secondary)
                    Picker("Formato",selection:$studio.format) { Text("MP4 · H.264").tag("mp4");Text("MOV · ProRes HQ").tag("prores") }
                    Text("Audio conservado: AAC en MP4, PCM en ProRes. Salida SDR.").font(.caption2).foregroundStyle(.secondary)
                    Divider()
                    Text("PRUEBA UN FRAGMENTO").font(.caption2).foregroundStyle(.secondary)
                    HStack { Text("Inicio (s)");TextField("0",text:$studio.previewStart).frame(width:65) }.font(.caption)
                    HStack { Text("Duración (s)");TextField("3",text:$studio.previewDuration).frame(width:65) }.font(.caption)
                    Button("Crear muestra",systemImage:"play.rectangle") { studio.add(preview:true) }.disabled(studio.validation != nil || studio.inspecting)
                    Text(studio.storageEstimate).font(.caption2).foregroundStyle(.secondary)
                    if let validation=studio.validation,studio.input != nil { Text(validation).font(.caption).foregroundStyle(.orange) }
                    Button { studio.add(preview:false) } label: { Label("Añadir video completo a la cola",systemImage:"plus").frame(maxWidth:.infinity).padding(.vertical,8) }.buttonStyle(.borderedProminent).tint(accent).foregroundStyle(ink).disabled(studio.validation != nil || studio.inspecting)
                    Text("LOCAL · v0.2.0").font(.system(size:10,design:.monospaced)).foregroundStyle(.secondary)
                }.padding(24)
            }.frame(width:310).background(Color.white.opacity(0.025))
            Divider()
            VStack(alignment:.leading,spacing:16) {
                HStack {
                    VStack(alignment:.leading,spacing:6) {
                        Text("Más grande. También en movimiento.").font(.system(size:25,weight:.semibold))
                        Text("Prueba un fragmento, compara y exporta.").foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName:"lock.shield").foregroundStyle(accent)
                }
                ZStack {
                    RoundedRectangle(cornerRadius:16).fill(Color.white.opacity(0.04))
                    if let player=studio.player { NativeVideoPlayer(player:player).clipShape(RoundedRectangle(cornerRadius:16)) }
                    else { VStack(spacing:15) { Image(systemName:"film.stack").font(.system(size:46,weight:.ultraLight)).foregroundStyle(accent);Text("Arrastra un video aquí").font(.title2);Text("MP4, MOV y otros formatos compatibles con FFmpeg").font(.caption).foregroundStyle(.secondary) } }
                }.frame(minHeight:220,maxHeight:.infinity)
                .onDrop(of:[UTType.fileURL],isTargeted:$targeted) { providers in
                    guard let p=providers.first else{return false}
                    _=p.loadObject(ofClass:URL.self) { url,_ in if let url { Task { @MainActor in studio.load(url) } } };return true
                }
                HStack {
                    Text(studio.playerLabel).font(.caption).foregroundStyle(accent)
                    Spacer()
                    Button("Ver original") { studio.showOriginal() }.disabled(studio.input==nil)
                    if let id=studio.selectedJob,let job=studio.jobs.first(where:{$0.id==id && $0.state=="Terminado"}) { Button("Ver resultado") { studio.show(job) } }
                }
                if !studio.estimateText.isEmpty { Text(studio.estimateText).font(.caption).foregroundStyle(.secondary) }
                HStack {
                    Text("COLA DE VIDEOS").font(.system(size:11,weight:.semibold,design:.monospaced)).tracking(1)
                    Spacer()
                    if studio.activeID != nil { Button("Pausar cola",systemImage:"pause") { studio.pause() } }
                    else { Button("Procesar cola",systemImage:"play.fill") { studio.beginQueue() }.disabled(!studio.jobs.contains(where:{$0.state=="En cola"})) }
                }
                ScrollView {
                    LazyVStack(spacing:8) {
                        if studio.jobs.isEmpty { Text("Los trabajos se guardan en este Mac. Añade videos con sus propios ajustes.").font(.caption).foregroundStyle(.secondary).padding(20) }
                        ForEach(studio.jobs) { job in jobRow(job) }
                    }
                }.frame(height:185)
            }.padding(28)
        }.background(ink).foregroundStyle(Color.white.opacity(0.94)).preferredColorScheme(.dark).frame(minWidth:1050,minHeight:800)
        .onChange(of:studio.mode) { _,_ in studio.estimateText="" }
        .onChange(of:studio.preset) { _,_ in studio.estimateText="" }
        .onChange(of:studio.format) { _,_ in studio.estimateText="" }
        .onChange(of:studio.custom) { _,_ in studio.estimateText="" }
        .alert("Elephant Video",isPresented:Binding(get:{studio.error != nil},set:{if !$0 {studio.error=nil}})) { Button("Entendido") {studio.error=nil} } message: { Text(studio.error ?? "") }
        .confirmationDialog("¿Quitar el trabajo y sus archivos temporales? Las exportaciones completas se conservan.",isPresented:Binding(get:{removal != nil},set:{if !$0 {removal=nil}}),titleVisibility:.visible) { Button("Quitar trabajo",role:.destructive) { if let id=removal {studio.remove(id)};removal=nil } }
    }
    func jobRow(_ job:VideoJob)->some View {
        VStack(alignment:.leading,spacing:7) {
            HStack {
                Text(URL(fileURLWithPath:job.input).lastPathComponent).font(.system(size:12,weight:.semibold)).lineLimit(1)
                if job.preview { Text("MUESTRA").font(.system(size:8,weight:.bold)).foregroundStyle(accent) }
                Spacer()
                Text(job.state).font(.caption).foregroundStyle(job.state=="Error" ? Color.orange : Color.secondary)
            }
            HStack {
                Text("\(job.preset) · \(job.mode=="ai" ? "IA" : "Fiel") · \(job.format=="prores" ? "ProRes" : "MP4")").font(.caption2).foregroundStyle(.secondary)
                Spacer()
                if job.state=="Pausado" || job.state=="Error" { Button("Reanudar") { studio.resume(job.id) }.disabled(studio.activeID != nil) }
                if job.state=="Terminado" { Button("Ver") {studio.show(job)};Button("Finder") {studio.reveal(job)} }
                if job.state != "Procesando" { Button {removal=job.id} label: {Image(systemName:"trash")}.help("Quitar trabajo") }
            }
            if job.state=="Procesando" { ProgressView(value:job.progress).tint(accent);if let eta=job.eta { Text("\(Int(job.progress*100))% · aprox. \(Int(eta/60)) min \(Int(eta)%60) s restantes").font(.caption2).foregroundStyle(.secondary) } }
            if !job.message.isEmpty { Text(job.message).font(.caption2).foregroundStyle(.secondary).lineLimit(3).textSelection(.enabled) }
        }.padding(12).background(Color.white.opacity(0.04),in:RoundedRectangle(cornerRadius:10))
    }
}
