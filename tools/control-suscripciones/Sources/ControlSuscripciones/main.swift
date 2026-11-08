import AppKit
import SwiftUI
import UniformTypeIdentifiers
import SubscriptionCore

final class Model: ObservableObject {
    @Published var state = SubscriptionCore.State()
    @Published var entries: [Entry] = []
    @Published var selected: String?
    @Published var section = "Inventario"
    @Published var query = ""
    @Published var draft = Review()
    @Published var error: String?
    @Published var notice = ""
    @Published var busy = false
    @Published var dirty = false
    @Published var filter = "Todos"
    let file: URL
    private var loadFailed = false
    init(folder: URL) {
        file = folder.appendingPathComponent("suscripciones.json")
        do { state = try Storage.load(file); rebuild() }
        catch { self.error = "Los datos existentes se conservaron: \(error.localizedDescription)"; loadFailed = true }
    }
    var current: Entry? { entries.first { $0.id == selected } }
    var visible: [Entry] {
        entries.filter { entry in
            let review = state.reviews[entry.id] ?? Review()
            return (query.isEmpty || [entry.service,entry.account,entry.mailbox].joined(separator:" ").localizedCaseInsensitiveContains(query)) &&
                (filter == "Todos" || (filter == "Por verificar" && review.status == "Sin verificar") || filter == review.use)
        }
    }
    var changed: Bool { draft != (state.reviews[selected ?? ""] ?? Review()) }
    func rebuild() {
        entries = Engine.entries(state)
        if selected == nil || !entries.contains(where: { $0.id == selected }) { selected = entries.first?.id }
        draft = state.reviews[selected ?? ""] ?? Review()
        dirty = false
    }
    func mayLeave() -> Bool {
        guard changed else { return true }
        let alert = NSAlert(); alert.messageText = "Hay una revisión sin guardar"
        alert.informativeText = "Guárdala para conservar tu clasificación, o descarta únicamente estos cambios."
        alert.addButton(withTitle:"Volver a la revisión"); alert.addButton(withTitle:"Descartar cambios")
        return alert.runModal() == .alertSecondButtonReturn
    }
    func select(_ id: String) {
        guard id != selected, mayLeave() else { return }
        selected = id; draft = state.reviews[id] ?? Review(); dirty = false
    }
    func commit(_ next: SubscriptionCore.State, message: String) {
        guard !loadFailed else { error = "Resuelve el error de lectura antes de guardar. Los datos no se sobrescribirán."; return }
        do { try Storage.save(next,file); state = next; rebuild(); notice = message }
        catch { self.error = error.localizedDescription }
    }
    func saveReview() {
        guard let id = selected else { return }
        do {
            try Engine.validate(draft)
            var next = state; next.reviews[id] = draft
            commit(next,message:"Revisión guardada. No se ha cambiado ni cancelado el servicio.")
        } catch { self.error = error.localizedDescription }
    }
    func importAudit(_ url: URL? = nil) {
        guard !busy, mayLeave() else { return }
        if let url = url {
            busy = true
            DispatchQueue.global(qos:.userInitiated).async {
                let result = Result { try Storage.read(Audit.self,url) }
                DispatchQueue.main.async {
                    defer { self.busy = false }
                    do {
                        let audit = try result.get()
                        var next = self.state; try next.merge(audit)
                        self.commit(next,message:"Revisión importada: \(audit.messages.count) mensajes. El estado actual de cada servicio requiere comprobación.")
                    } catch { self.error = error.localizedDescription }
                }
            }
            return
        }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.message = "Elige una revisión de Gmail preparada por Codex. Los datos se combinan; tus decisiones se conservan."
        if panel.runModal() == .OK, let url = panel.url { importAudit(url) }
    }
    func exportCSV() {
        let panel = NSSavePanel(); panel.allowedContentTypes = [.commaSeparatedText]; panel.nameFieldStringValue = "Suscripciones-revision.csv"
        if panel.runModal() == .OK, let url = panel.url {
            do { try Engine.csv(state).write(to:url,atomically:true,encoding:.utf8); notice = "Inventario exportado. Contiene datos privados de las cuentas revisadas." }
            catch { self.error = error.localizedDescription }
        }
    }
    func copyRequest() {
        let accounts = Array(Set(state.audits.map(\.account))).sorted().joined(separator:", ")
        let text = "Actualiza mi revisión de LOGIKAPPS Control de Suscripciones. Cuentas ya revisadas: \(accounts.isEmpty ? "por confirmar" : accounts). Comprueba primero qué cuenta de Gmail está conectada y reanuda las búsquedas pendientes. Busca recibos, renovaciones, cambios de plan y cancelaciones; separa titular de correo receptor, incluye evidencia y marca importes, monedas y fechas inciertos. Conserva mis decisiones locales. Prepara el JSON de revisión compatible e impórtalo en mi inventario. No canceles servicios ni modifiques correos."
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text,forType:.string)
        notice = "Pedido copiado. Pégalo en este chat para actualizar Gmail. No se envió ningún mensaje."
    }
}

private let lime = Color(red:0.80,green:0.96,blue:0.51)
private let appBackground = Color(red:0.065,green:0.08,blue:0.065)
private let surface = Color(red:0.11,green:0.13,blue:0.10)

struct Content: View {
    @ObservedObject var model: Model
    var body: some View {
        HStack(spacing:0) {
            VStack(alignment:.leading,spacing:24) {
                Label("LOGIKAPPS",systemImage:"square.stack.3d.up.fill").font(.title2.bold()).foregroundStyle(lime)
                Text("CONTROL DE\nSUSCRIPCIONES").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                ForEach(["Inventario","Renovaciones","Decisiones","Correos y cobertura"],id:\.self) { section in
                    Button { model.section = section } label: {
                        Text(section).frame(maxWidth:.infinity,alignment:.leading).padding(12)
                            .foregroundStyle(model.section == section ? lime : .white)
                            .background(model.section == section ? lime.opacity(0.12) : .clear).cornerRadius(9)
                    }.buttonStyle(.plain)
                }
                Spacer()
                Text("Primero comprobar.\nDespués decidir.").foregroundStyle(.secondary)
                Text("Versión 0.1 · Local").font(.caption).foregroundStyle(.secondary)
            }.padding(24).frame(width:230).background(surface)
            VStack(alignment:.leading,spacing:16) {
                HStack {
                    Text(model.section).font(.largeTitle.weight(.semibold))
                    Spacer()
                    Button("Importar revisión Gmail") { model.importAudit() }.disabled(model.busy)
                    Button("Exportar CSV") { model.exportCSV() }.disabled(model.entries.isEmpty || model.busy)
                }
                Text("Evidencia de correos ≠ suscripción activa. Comprueba el estado en el proveedor.").foregroundStyle(.secondary)
                if model.busy { ProgressView("Importando revisión…") }
                if !model.notice.isEmpty { Text(model.notice).foregroundStyle(lime).font(.callout).textSelection(.enabled) }
                switch model.section {
                case "Correos y cobertura": sources
                case "Renovaciones": renewals
                case "Decisiones": decisions
                default: inventory
                }
            }.padding(24).frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading)
        }.background(appBackground).foregroundStyle(.white).preferredColorScheme(.dark)
            .alert("Revisar",isPresented:Binding(get:{model.error != nil},set:{if !$0 {model.error=nil}})) { Button("Aceptar"){model.error=nil} } message: { Text(model.error ?? "") }
    }
    var inventory: some View {
        VStack(alignment:.leading,spacing:12) {
            HStack {
                TextField("Buscar servicio o cuenta",text:$model.query).textFieldStyle(.roundedBorder)
                Picker("Mostrar",selection:$model.filter) {
                    ForEach(["Todos","Por verificar","Personal","Empresa","Mixto","Familiar"],id:\.self){Text($0)}
                }.frame(width:230)
            }
            Text("\(model.visible.count) registros · \(model.entries.filter{$0.incomplete}.count) con identificación incompleta").font(.caption).foregroundStyle(.secondary)
            if model.entries.isEmpty {
                VStack(alignment:.leading,spacing:16) {
                    Text("Tu primera revisión empieza con los correos.").font(.title2)
                    Text("Importa la revisión preparada en este chat. Cada servicio conservará los recibos que lo explican; los importes sin confirmar quedan fuera de los totales.")
                    Button("Ver cómo coordinar Gmail") { model.section = "Correos y cobertura" }
                }.padding(26).background(surface).cornerRadius(12)
                Spacer()
            } else {
                HSplitView {
                    ScrollView {
                        LazyVStack(spacing:8) {
                            ForEach(model.visible) { e in
                                Button { model.select(e.id) } label: {
                                    VStack(alignment:.leading,spacing:6) {
                                        Text(e.service).font(.headline)
                                        Text(e.account).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                        HStack { Text(e.channel); Spacer(); Text("\(e.evidence.count) correos") }.font(.caption).foregroundStyle(.secondary)
                                        Text(model.state.reviews[e.id]?.status ?? "Sin verificar").font(.caption).foregroundStyle(lime)
                                    }.padding(13).frame(maxWidth:.infinity,alignment:.leading)
                                        .background(model.selected == e.id ? lime.opacity(0.12) : surface).cornerRadius(10)
                                }.buttonStyle(.plain)
                            }
                        }
                    }.frame(minWidth:230,idealWidth:280,maxWidth:340)
                    if let e = model.current {
                        ScrollView {
                            VStack(alignment:.leading,spacing:18) {
                                Text(e.service).font(.title2.weight(.semibold))
                                field("Titular según correo",e.account)
                                field("Correo receptor",e.mailbox)
                                field("Última evidencia",e.lastSeen)
                                if e.incomplete { Text("Identificación incompleta. Este registro puede contener recibos de servicios distintos; revisa su detalle.").foregroundStyle(.orange) }
                                if let amount = e.amount, let currency = e.currency {
                                    field("Importe del último correo",Engine.money(amount,currency) + " · no confirma periodicidad ni coste actual")
                                } else { field("Importe / moneda","Sin confirmar; revisar comprobante") }
                                field("Frecuencia anunciada",e.cadence)
                                if let renewal = e.renewal { field("Renovación anunciada",renewal + " · según correo, sin comprobar en proveedor") }
                                if let url = e.portal {
                                    Button("Abrir \(e.channel == "Directo" ? e.service : e.channel) para comprobar") { NSWorkspace.shared.open(url) }
                                }
                                GroupBox("Mi revisión") {
                                    VStack(alignment:.leading,spacing:12) {
                                        pick("Uso",value:$model.draft.use,options:["Por clasificar","Personal","Empresa","Mixto","Familiar"])
                                        pick("Estado",value:$model.draft.status,options:["Sin verificar","Activa confirmada","Cancelada","Histórica","No es suscripción"])
                                        pick("Decisión",value:$model.draft.decision,options:["Pendiente","Conservar","Reducir plan","Revisar baja","No renovar"])
                                        HStack {
                                            TextField("Importe, p. ej. 12,95",text:$model.draft.amount)
                                            Picker("Moneda",selection:$model.draft.currency) {
                                                Text("Sin confirmar").tag("")
                                                ForEach(["CLP","USD","EUR","GBP","UF"],id:\.self){Text($0)}
                                            }.frame(width:180)
                                        }
                                        pick("Cobro",value:$model.draft.cadence,options:["Sin confirmar","Mensual","Anual","Trimestral","Semestral","Semanal","Variable","Único"])
                                        TextField("Compromiso: mensual, anual cobrado por mes…",text:$model.draft.commitment)
                                        TextField("Próxima renovación confirmada · AAAA-MM-DD",text:$model.draft.renewal)
                                        TextField("Fecha de comprobación · AAAA-MM-DD",text:$model.draft.verifiedOn)
                                        TextField("Evidencia: dónde comprobaste el estado y plan",text:$model.draft.evidence,axis:.vertical)
                                        TextField("Notas: uso real, dependencias, posibles alternativas…",text:$model.draft.notes,axis:.vertical)
                                        Button("Guardar revisión") { model.saveReview() }.buttonStyle(.borderedProminent).tint(lime).foregroundStyle(.black)
                                        Text("Guardar no cancela ni modifica la cuenta. Los totales usan solo importes que confirmes.").font(.caption).foregroundStyle(.secondary)
                                    }.padding(10).textFieldStyle(.roundedBorder)
                                }
                                GroupBox("Evidencia de Gmail") {
                                    VStack(alignment:.leading,spacing:14) {
                                        ForEach(e.evidence.prefix(30)) { mail in
                                            VStack(alignment:.leading,spacing:5) {
                                                HStack {
                                                    Text(String(mail.date.prefix(10))).foregroundStyle(.secondary)
                                                    Spacer()
                                                    if let url = Engine.gmailURL(mail,account:e.mailbox) { Button("Ver correo") { NSWorkspace.shared.open(url) } }
                                                }
                                                Text(mail.subject).font(.headline)
                                                Text(mail.text).font(.caption).textSelection(.enabled)
                                                Text(mail.detail == nil ? "Fragmento de búsqueda: puede estar incompleto." : "Texto extraído del correo: comprobar documento original.").font(.caption).foregroundStyle(.secondary)
                                            }.padding(10)
                                            Divider()
                                        }
                                        if e.evidence.count > 30 { Text("Se muestran los 30 correos más recientes. La revisión conserva todos los importados.").font(.caption) }
                                    }
                                }
                            }.padding(.leading,20).frame(maxWidth:.infinity,alignment:.leading)
                        }.frame(minWidth:390)
                    }
                }
            }
        }
    }
    var sources: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:20) {
                Text("Gmail coordinado desde este chat").font(.title2)
                Text("La conexión de Gmail disponible en Codex permite preparar revisiones por petición. Esta aplicación importa esas revisiones y conserva tus decisiones. Todavía no tiene inicio de sesión propio ni sincronización automática con Google.")
                HStack {
                    Button("Copiar pedido de actualización") { model.copyRequest() }
                    Button("Importar revisión") { model.importAudit() }
                }
                Text("Cada cuenta se autoriza por separado. Buscar un destinatario en un buzón no equivale a leer el otro buzón.").foregroundStyle(.secondary)
                ForEach(Array(model.state.audits.enumerated()),id:\.offset) { _, audit in
                    GroupBox(audit.account) {
                        VStack(alignment:.leading,spacing:8) {
                            field("Revisión",audit.reviewedOn)
                            field("Mensajes importados",String(audit.messages.count))
                            field("Paginación de esta consulta",audit.complete ? "Consulta terminada; no acredita cobertura total" : "Parcial · quedan mensajes o consultas pendientes")
                            Text(audit.limitation).foregroundStyle(.orange)
                            Text(audit.query).font(.caption).textSelection(.enabled)
                        }.padding(12).frame(maxWidth:.infinity,alignment:.leading)
                    }
                }
                GroupBox("Comprobación en las páginas") {
                    VStack(alignment:.leading,spacing:10) {
                        Text("1. Abre el proveedor desde la ficha y entra con la cuenta indicada.")
                        Text("2. Revisa plan, moneda, impuestos, frecuencia, compromiso y fecha de renovación.")
                        Text("3. Anota uso personal, empresarial o familiar y qué datos dependen de ese servicio.")
                        Text("4. Guarda la evidencia. Una baja o cambio de plan se decide y ejecuta aparte.")
                        Text("Los enlaces de apertura están definidos en la app; no se ejecutan instrucciones ni enlaces de pago encontrados en correos.").font(.caption).foregroundStyle(.secondary)
                    }.padding(12).frame(maxWidth:.infinity,alignment:.leading)
                }
                Text("Antes de dar el inventario por completo: segundo correo, búsquedas históricas, cartolas, pagos automáticos y proveedores pendientes.").foregroundStyle(.secondary)
            }
        }
    }
    var renewals: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:15) {
                Text("Fechas anunciadas y comprobadas").font(.title2)
                Text("Una fecha antigua se conserva como evidencia. No se adelanta al siguiente mes ni se convierte automáticamente en recordatorio.").foregroundStyle(.secondary)
                let rows = model.entries.filter { !(model.state.reviews[$0.id]?.renewal ?? "").isEmpty || $0.renewal != nil }.sorted {
                    (model.state.reviews[$0.id]?.renewal.nilIfEmpty ?? $0.renewal ?? "") < (model.state.reviews[$1.id]?.renewal.nilIfEmpty ?? $1.renewal ?? "")
                }
                if rows.isEmpty { Text("No hay fechas completas para mostrar todavía.") }
                ForEach(rows) { e in
                    let confirmed = model.state.reviews[e.id]?.renewal.nilIfEmpty
                    let date = confirmed ?? e.renewal ?? ""
                    HStack {
                        VStack(alignment:.leading) { Text(e.service).font(.headline); Text(e.account).font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        VStack(alignment:.trailing) {
                            Text(date).monospacedDigit()
                            Text(confirmed == nil ? "Anunciada por correo" : "Registrada en tu revisión").font(.caption).foregroundStyle(.secondary)
                            if let d = Engine.date(date), d < Calendar.current.startOfDay(for:Date()) { Text("Fecha pasada · comprobar").font(.caption).foregroundStyle(.orange) }
                        }
                        Button("Revisar") { model.select(e.id); model.section = "Inventario" }
                    }.padding(18).background(surface).cornerRadius(10)
                }
            }
        }
    }
    var decisions: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:18) {
                Text("Gasto confirmado y propuestas").font(.title2)
                Text("Las monedas se mantienen separadas. El equivalente mensual distribuye los pagos anuales; no es lo que se cobrará este mes.").foregroundStyle(.secondary)
                let totals = Engine.totals(model.state)
                if totals.isEmpty { Text("Sin total confirmado: falta comprobar importes, monedas y frecuencia. No equivale a gasto cero.").foregroundStyle(lime) }
                ForEach(totals.keys.sorted(),id:\.self) { currency in
                    GroupBox(currency) {
                        VStack(alignment:.leading,spacing:8) {
                            Text("Mensual equivalente: \(Engine.money(totals[currency]!,currency))").font(.title3)
                            Text("Anual equivalente: \(Engine.money(totals[currency]! * 12,currency))")
                            let savings = Engine.totals(model.state,savingsOnly:true)[currency] ?? 0
                            Text("Propuestas de baja / no renovación: \(Engine.money(savings * 12,currency)) al año")
                            Text("Potencial una vez efectivas; no es ahorro logrado ni devolución.").font(.caption).foregroundStyle(.secondary)
                        }.padding(12).frame(maxWidth:.infinity,alignment:.leading)
                    }
                }
                Text("\(model.entries.filter { Engine.monthly(model.state.reviews[$0.id] ?? Review()) == nil }.count) registros excluidos del total: estado, precio o frecuencia no confirmados / no recurrentes.").foregroundStyle(.secondary)
                ForEach(model.entries.filter{ (model.state.reviews[$0.id]?.decision ?? "Pendiente") != "Pendiente" }) { e in
                    HStack { Text(e.service); Spacer(); Text(model.state.reviews[e.id]?.decision ?? ""); Button("Abrir revisión") { model.select(e.id); model.section = "Inventario" } }.padding(14).background(surface).cornerRadius(8)
                }
            }
        }
    }
    func field(_ label: String, _ value: String) -> some View {
        VStack(alignment:.leading,spacing:3) { Text(label).font(.caption).foregroundStyle(.secondary); Text(value).textSelection(.enabled) }
    }
    func pick(_ label: String, value: Binding<String>, options: [String]) -> some View {
        Picker(label,selection:value){ForEach(options,id:\.self){Text($0)}}.frame(maxWidth:.infinity,alignment:.leading)
    }
}
extension String { var nilIfEmpty: String? { isEmpty ? nil : self } }

final class Delegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var model: Model!
    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        func option(_ flag:String) -> String? { guard let i=args.firstIndex(of:flag),i+1<args.count else{return nil};return args[i+1] }
        let folder = option("--state-root").map{URL(fileURLWithPath:$0)} ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/LOGIKAPPS/Control de Suscripciones")
        if option("--snapshot") != nil && option("--state-root") == nil { fputs("La captura requiere un estado aislado.\n",stderr);exit(2) }
        model = Model(folder:folder)
        let menu = NSMenu(), item = NSMenuItem(), appMenu = NSMenu(); item.submenu = appMenu; menu.addItem(item)
        appMenu.addItem(withTitle:"Salir de Control de Suscripciones",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        let edit = NSMenuItem(), editMenu = NSMenu(title:"Edición");edit.title="Edición";edit.submenu=editMenu;menu.addItem(edit)
        for (title,action,key) in [("Cortar","cut:","x"),("Copiar","copy:","c"),("Pegar","paste:","v"),("Seleccionar todo","selectAll:","a")] { editMenu.addItem(withTitle:title,action:Selector(action),keyEquivalent:key) }
        NSApp.mainMenu=menu
        window = NSWindow(contentRect:NSRect(x:0,y:0,width:1380,height:900),styleMask:[.titled,.closable,.resizable,.miniaturizable],backing:.buffered,defer:false)
        window.title="Control de Suscripciones · LOGIKAPPS";window.minSize=NSSize(width:1050,height:720);window.delegate=self
        window.contentView=NSHostingView(rootView:Content(model:model));window.center();window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
        if let path=option("--import") { model.importAudit(URL(fileURLWithPath:path)) }
        if let section=option("--section") { model.section=section }
        if let path=option("--snapshot") { DispatchQueue.main.asyncAfter(deadline:.now()+3){self.snapshot(path)} }
    }
    func snapshot(_ path:String) {
        if model.busy { DispatchQueue.main.asyncAfter(deadline:.now()+0.5){self.snapshot(path)};return }
        guard let view=window.contentView,let rep=view.bitmapImageRepForCachingDisplay(in:view.bounds) else{exit(3)}
        view.cacheDisplay(in:view.bounds,to:rep)
        do {try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:path));exit(0)}catch{exit(3)}
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{true}
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {
        if model.busy{return .terminateCancel};return model.mayLeave() ? .terminateNow : .terminateCancel
    }
    func windowShouldClose(_ sender:NSWindow)->Bool{!model.busy && model.mayLeave()}
    func applicationSupportsSecureRestorableState(_ app:NSApplication)->Bool{true}
}
let app=NSApplication.shared;app.setActivationPolicy(.regular)
let delegate=Delegate();app.delegate=delegate
withExtendedLifetime(delegate){app.run()}
