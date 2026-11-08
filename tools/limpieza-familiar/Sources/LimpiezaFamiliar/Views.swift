import SwiftUI
import AppKit
import ImageIO
import AVKit
import CoreImage
import ArchiveCore

private let lime = Color(red: 0.80, green: 0.97, blue: 0.46)
private let panel = Color(red: 0.105, green: 0.12, blue: 0.105)
private let muted = Color(red: 0.64, green: 0.68, blue: 0.62)

struct RootView: View {
    @ObservedObject var model: AppModel
    @ObservedObject var devices: DeviceService
    @State private var showIssues = false

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            VStack(spacing: 0) {
                topbar
                ScrollView {
                    VStack(alignment: .leading, spacing: 23) {
                        if model.demo { note("Modo de prueba · Solo contiene archivos de muestra generados. Ningún iPhone real ha sido analizado.", icon: "testtube.2") }
                        heading
                        content
                        if !model.notice.isEmpty { note(model.notice, icon: "checkmark.shield") }
                        if !model.issues.isEmpty {
                            DisclosureGroup(isExpanded: $showIssues) {
                                ForEach(Array(model.issues.prefix(100).enumerated()), id: \.offset) { _, issue in Text(issue).font(.system(size: 12)).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled) }
                                if model.issues.count > 100 { Text("Se muestran las primeras 100 incidencias.") }
                            } label: { Label("\(model.issues.count) incidencias para revisar", systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }.padding(16).background(panel).cornerRadius(12)
                        }
                        Text("LOGIKAPPS / LIMPIEZA FAMILIAR      ·      PRIVADO, EN TU MAC      ·      VERSIÓN 0.4.8")
                            .font(.system(size: 9, weight: .medium)).tracking(1.1).foregroundStyle(muted).padding(.top, 8)
                    }.padding(30).frame(maxWidth: 1400, alignment: .leading).frame(maxWidth: .infinity)
                }
                if model.busy || devices.importing { progressBar }
            }
        }
        .background(Color(red: 0.065, green: 0.075, blue: 0.065))
        .foregroundColor(Color(red: 0.94, green: 0.96, blue: 0.91))
        .preferredColorScheme(.dark).tint(lime)
        .frame(minWidth: 1050, minHeight: 700)
        .onChange(of: model.selected) { _ in model.cleanupReview = nil }
        .sheet(item: $model.preview) { file in MediaPreview(file: file) }
        .alert("Revisa este detalle", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) { Button("Entendido", role: .cancel) { model.error = nil } } message: { Text(model.error ?? "") }
    }
    private var locked: Bool { model.busy || devices.importing }
    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "square.stack.3d.up.fill").font(.system(size: 29)).foregroundStyle(lime)
                VStack(alignment: .leading, spacing: 3) { Text("LOGIKAPPS").font(.system(size: 17, weight: .bold)).tracking(0.7); Text("Tu espacio digital").font(.system(size: 11)).foregroundStyle(muted) }
            }.padding(.bottom, 43)
            Text("LIMPIEZA FAMILIAR").font(.system(size: 9, weight: .semibold)).tracking(1.6).foregroundStyle(muted).padding(.bottom, 16)
            ForEach(Section.allCases.filter { $0 != .safeCleanup && $0 != .photoRemoval }, id: \.self) { section in
                let selected = model.section == section || (section == .storage && [.safeCleanup, .photoRemoval].contains(model.section))
                Button { model.section = section } label: {
                    HStack(spacing: 12) { Image(systemName: section.symbol).frame(width: 20); Text(section.rawValue).font(.system(size: 13, weight: selected ? .semibold : .regular)); Spacer() }
                        .padding(.horizontal, 13).padding(.vertical, 12).background(selected ? lime.opacity(0.12) : .clear).cornerRadius(9)
                        .foregroundStyle(selected ? lime : Color.white.opacity(0.74))
                }.buttonStyle(.plain).padding(.bottom, 5)
            }
            Spacer()
            VStack(alignment: .leading, spacing: 9) {
                Label("Cada recuerdo cuenta", systemImage: "heart").font(.system(size: 12, weight: .medium)).foregroundStyle(lime)
                Text("Primero conservar.\nDespués hacer espacio.").font(.system(size: 12)).lineSpacing(5).foregroundStyle(muted)
            }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(panel).cornerRadius(12)
            Label("Sin cuentas · Sin nube", systemImage: "lock.shield").font(.system(size: 10)).foregroundStyle(muted).padding(.top, 22)
        }.padding(.horizontal, 20).padding(.vertical, 29).frame(width: 225).background(Color(red: 0.08, green: 0.095, blue: 0.075))
    }
    private var topbar: some View {
        HStack {
            Text("Biblioteca personal  /  \(model.section.rawValue)").font(.system(size: 12)).foregroundStyle(muted)
            Spacer()
            if !model.preferences.profiles.isEmpty {
                Picker("Dispositivo", selection: $model.profileID) { ForEach(model.preferences.profiles) { profile in Text("\(profile.owner) · \(profile.device)").tag(profile.id) } }.frame(maxWidth: 270).disabled(locked)
            }
            Label("Local", systemImage: "circle.fill").font(.system(size: 10)).foregroundStyle(lime).padding(.leading, 12)
        }.padding(.horizontal, 30).padding(.vertical, 18).background(panel.opacity(0.35))
    }
    private var heading: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(eyebrow).font(.system(size: 10, weight: .medium)).tracking(2).foregroundStyle(lime)
            Text(title).font(.system(size: 32, weight: .semibold)).tracking(-0.9)
            Text(subtitle).font(.system(size: 14)).foregroundStyle(muted).lineSpacing(4)
        }
    }
    private var eyebrow: String { model.section == .home ? "MENOS DESORDEN. MÁS ESPACIO." : "TU ARCHIVO, BAJO CONTROL" }
    private var title: String {
        switch model.section { case .home: return "Un lugar para lo que importa."; case .device: return "Tu iPhone, conectado."; case .storage: return "Qué puedo limpiar"; case .safeCleanup: return "Limpiar sin tocar Fotos ni WhatsApp"; case .photoRemoval: return "Revisar fotos respaldadas"; case .library: return model.viewingArchive ? "Tu archivo organizado." : model.libraryTitle; case .whatsapp: return "Conversaciones que se quedan."; case .backup: return "Antes de borrar, respalda."; case .history: return "Todo lo que has conservado."; case .guide: return "Haz espacio con confianza." }
    }
    private var subtitle: String {
        switch model.section { case .home: return "Organiza los teléfonos de tu familia y conserva sus archivos en tu Mac o disco externo."; case .device: return "Conecta por cable, desbloquea y acepta «Confiar en este ordenador» en el teléfono."; case .storage, .safeCleanup: return "Recomendaciones de solo lectura para liberar espacio y conservar tus fotos y chats."; case .photoRemoval: return "Elige una foto con copia verificada y comprueba su contenido antes de confirmar la selección."; case .library: return "Revisa el contenido accesible, encuentra copias exactas y prepara un archivo verificado."; case .whatsapp: return "Lee un chat exportado y archiva su carpeta de adjuntos. Todo permanece en este Mac."; case .backup: return "Un archivo de fotos y un respaldo restaurable cumplen funciones diferentes."; case .history: return "Abre los archivos de cada persona y vuelve a comprobar que las copias están intactas."; case .guide: return "Revisa la selección, sus copias y los pasos pendientes. No se ejecutan eliminaciones." }
    }
    @ViewBuilder private var content: some View {
        switch model.section {
        case .home: home
        case .device: device
        case .storage, .safeCleanup: storage
        case .photoRemoval: photoRemoval
        case .library: library
        case .whatsapp: whatsapp
        case .backup: backup
        case .history: history
        case .guide: guide
        }
    }
    private var libraryShortcuts: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(model.preferences.usbSessions ?? []) { session in
                card {
                    HStack {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(model.libraryName(session)).font(.title3).fontWeight(.semibold)
                            Text("Fotos y vídeos guardados en este computador").font(.caption).foregroundStyle(muted)
                        }
                        Spacer()
                        primary("Abrir biblioteca", symbol: "photo.on.rectangle") { model.openLibrary(session) }.disabled(locked)
                        secondary("Qué puedo limpiar", symbol: "sparkle.magnifyingglass") { model.openStorage(session) }.disabled(locked || session.ownerName == nil)
                        secondary("Mostrar carpeta", symbol: "folder") { model.reveal(URL(fileURLWithPath: session.folder)) }.disabled(locked)
                    }
                }
            }
        }
    }
    private var home: some View {
        VStack(alignment: .leading, spacing: 22) {
            libraryShortcuts
            HStack(spacing: 20) {
                VStack(alignment: .leading, spacing: 17) {
                    Label("EMPIEZA AQUÍ", systemImage: "sparkle").font(.system(size: 10, weight: .semibold)).tracking(1.2).foregroundStyle(lime)
                    Text("Del teléfono al archivo.\nSin perder el hilo.").font(.system(size: 26, weight: .medium)).tracking(-0.6).lineSpacing(4)
                    Text("Conecta un iPhone o empieza con una carpeta de fotos que ya tengas en tu computador.").font(.system(size: 13)).foregroundStyle(muted).lineSpacing(5).fixedSize(horizontal: false, vertical: true)
                    HStack { primary("Conectar iPhone", symbol: "cable.connector") { model.section = .device; devices.start() }; secondary("Analizar carpeta", symbol: "folder") { model.chooseSource() } }.disabled(locked)
                }.frame(maxWidth: .infinity, alignment: .leading)
                ZStack {
                    Circle().fill(lime.opacity(0.055)).frame(width: 205, height: 205)
                    Circle().stroke(lime.opacity(0.16), style: StrokeStyle(lineWidth: 1, dash: [4, 6])).frame(width: 177, height: 177)
                    Image(systemName: "iphone").font(.system(size: 104, weight: .ultraLight)).foregroundStyle(lime)
                    Image(systemName: "checkmark.shield.fill").font(.system(size: 39)).foregroundStyle(lime).padding(12).background(panel).cornerRadius(18).offset(x: 51, y: 44)
                }.frame(width: 230)
            }.padding(27).background(LinearGradient(colors: [Color(red: 0.14, green: 0.19, blue: 0.11), panel], startPoint: .topLeading, endPoint: .bottomTrailing)).cornerRadius(18).overlay(RoundedRectangle(cornerRadius: 18).stroke(lime.opacity(0.18)))
            HStack(spacing: 14) {
                stat("Dispositivos registrados", value: "\(model.preferences.profiles.count)", symbol: "person.2")
                stat("Sesiones de archivo", value: "\(model.preferences.history.count)", symbol: "externaldrive")
                stat("Eliminaciones automáticas", value: "0", symbol: "hand.raised")
            }
            HStack(alignment: .top, spacing: 18) {
                card {
                    Text("Tu familia").font(.system(size: 17, weight: .semibold))
                    if model.preferences.profiles.isEmpty { Text("Registra a la primera persona para separar sus archivos de los demás.").font(.system(size: 13)).foregroundStyle(muted).lineSpacing(4) }
                    ForEach(model.preferences.profiles) { profile in
                        Button { model.profileID = profile.id } label: {
                            HStack { Image(systemName: "iphone").foregroundStyle(lime); VStack(alignment: .leading) { Text(profile.owner).font(.system(size: 13, weight: .medium)); Text(profile.device).font(.system(size: 11)).foregroundStyle(muted) }; Spacer(); if model.profileID == profile.id { Image(systemName: "checkmark.circle.fill").foregroundStyle(lime) } }.padding(11).background(Color.white.opacity(0.035)).cornerRadius(8)
                        }.buttonStyle(.plain).disabled(locked)
                    }
                    TextField("Persona · por ejemplo, Ana", text: $model.ownerDraft).textFieldStyle(.roundedBorder)
                    TextField("Dispositivo · por ejemplo, iPhone 13", text: $model.deviceDraft).textFieldStyle(.roundedBorder)
                    secondary("Agregar dispositivo", symbol: "plus") { model.addProfile() }.disabled(locked || model.loadFailed)
                }
                card {
                    Text("Un proceso sencillo").font(.system(size: 17, weight: .semibold))
                    step("01", "Analizar", "Entiende qué tienes y qué merece una revisión.")
                    step("02", "Conservar", "Copia los originales y comprueba su integridad.")
                    step("03", "Liberar", "Revisa el plan y limpia desde el teléfono.")
                }
            }
        }
    }
    private var device: some View {
        VStack(alignment: .leading, spacing: 18) {
            card {
                HStack { Image(systemName: "cable.connector").font(.system(size: 35)).foregroundStyle(lime); VStack(alignment: .leading, spacing: 7) { Text("Conexión por cable").font(.headline); Text(devices.status).font(.system(size: 13)).foregroundStyle(muted).fixedSize(horizontal: false, vertical: true) }; Spacer(); secondary("Buscar dispositivos", symbol: "arrow.clockwise") { devices.start() }.disabled(locked) }
                ForEach(Array(devices.cameras.enumerated()), id: \.offset) { _, camera in
                    HStack { Label(camera.name ?? "Dispositivo multimedia", systemImage: "iphone"); Spacer(); secondary("Leer catálogo", symbol: "list.bullet") { devices.connect(camera) }.disabled(locked) }.padding(.vertical, 10)
                }
                if devices.selected != nil {
                    Text(devices.connectionDetails).font(.caption).foregroundStyle(muted).textSelection(.enabled)
                    if let enabled = devices.currentICloudPhotos {
                        Text(enabled ? "Fotos en iCloud: activo según este iPhone." : "Fotos en iCloud: desactivado según este iPhone.")
                            .font(.caption).foregroundStyle(muted)
                    }
                    secondary("Reconectar", symbol: "arrow.triangle.2.circlepath") { devices.reconnect() }.disabled(locked)
                }
                if devices.cameras.isEmpty { note("Si no aparece: prueba otro cable de datos, desbloquea el teléfono y comprueba que Finder lo reconoce. La app no necesita tu contraseña de Apple.", icon: "info.circle") }
            }
            if !(model.preferences.usbSessions ?? []).isEmpty {
                card {
                    Text("Retoma un respaldo guardado").font(.headline)
                    Text("El avance se conserva aunque cierres la app o se desconecte el cable. Primero comprobaremos lo copiado y después continuaremos con lo pendiente.").font(.system(size: 13)).foregroundStyle(muted).fixedSize(horizontal: false, vertical: true)
                    ForEach(model.preferences.usbSessions ?? []) { session in
                        VStack(alignment: .leading, spacing: 7) {
                            Text(session.deviceName).font(.system(size: 14, weight: .semibold))
                            Text(session.folder).font(.caption).foregroundStyle(muted).lineLimit(2).textSelection(.enabled)
                            primary("Reanudar respaldo", symbol: "play.circle") { model.resumeSaved(session) }.disabled(locked || !devices.ready || session.deviceID != devices.deviceIdentity)
                        }.padding(.vertical, 6)
                    }
                    if !devices.ready { Text("Conecta el iPhone y pulsa Leer catálogo para continuar.").font(.caption).foregroundStyle(muted) }
                }
            }
            card {
                Text("Elige el tamaño del primer paso").font(.headline)
                Picker("Qué copiar", selection: $devices.scope) {
                    ForEach(ImportScope.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }.pickerStyle(.segmented).disabled(locked)
                Text(devices.scope == .sample ? "Prueba con los 20 grupos más pequeños. Se incluyen sus componentes con el mismo nombre base, por lo que puede haber más de 20 archivos." : "Copia todo el catálogo multimedia que el iPhone permite leer en esta sesión.").font(.system(size: 13)).foregroundStyle(muted).fixedSize(horizontal: false, vertical: true)
                if let plan = devices.plan, !plan.items.isEmpty {
                    HStack(spacing: 14) {
                        stat("Archivos del lote", value: "\(plan.items.count) de \(devices.files.count)", symbol: "photo")
                        stat("Tamaño anunciado", value: sizeText(plan.knownBytes), symbol: "internaldrive")
                    }
                    if plan.unknownSizes > 0 { Text("\(plan.unknownSizes) archivos sin tamaño conocido. El total real será mayor.").font(.caption).foregroundStyle(muted) }
                }
                secondary("Elegir otra copia para reanudar", symbol: "arrow.triangle.2.circlepath") { model.prepareResume() }.disabled(!devices.ready || locked)
                primary("Elegir destino e importar", symbol: "square.and.arrow.down") { model.importDevice() }.disabled(!devices.ready || devices.files.isEmpty || locked)
                Text("Antes de copiar verás la persona, el teléfono, el destino y el espacio libre. La importación conserva los originales en el iPhone.").font(.system(size: 13)).foregroundStyle(muted).fixedSize(horizontal: false, vertical: true)
            }
            note("Fotos en iCloud: puede haber originales que no estén descargados en el teléfono. Revisa la opción «Conservar originales» de transferencia del iPhone si quieres evitar conversiones. La app no puede certificar por USB que toda tu fototeca esté aquí.", icon: "icloud")
            note("Compatibilidad pendiente de prueba física con los iPhone de tu familia. Esta conexión accede a multimedia; no al contenido privado de todas las apps.", icon: "wrench.and.screwdriver")
        }
    }
    private var storage: some View {
        VStack(alignment: .leading, spacing: 18) {
            if model.section == .storage {
                ViewThatFits(in: .horizontal) {
                    HStack { cleanupButtons }
                    VStack(alignment: .leading) { cleanupButtons }
                }.disabled(locked)
            } else {
                secondary("Volver a opciones", symbol: "chevron.left") { model.section = .storage }.disabled(locked)
            }
            if let profile = model.profile {
                Label("\(profile.owner) · \(profile.device)", systemImage: "iphone").font(.headline)
            }
            if model.storageLoading {
                ProgressView("Preparando recomendaciones…")
            } else if let advice = model.storageAdvice {
                if let observation = advice.observation, let free = observation.availableBytes, free >= 0 {
                    note("\(sizeText(free)) disponibles según Finder · \(observation.observedAt.formatted(date: .abbreviated, time: .shortened)).", icon: "internaldrive")
                }
                card {
                    Text("Por dónde empezar · acciones en el iPhone").font(.title3.weight(.semibold))
                    ForEach(Array(advice.suggestions.enumerated()), id: \.element.id) { index, suggestion in
                        step(String(format: "%02d", index + 1), suggestion.title, suggestion.detail)
                    }
                    Text("Por cable no hay acceso a estas cachés o descargas. Cada acción se confirma en su propia app. El espacio recuperable depende de lo que haya descargado.")
                        .font(.caption).foregroundStyle(muted)
                }
                card {
                    Text("Conservar").font(.title3.weight(.semibold))
                    if let chat = advice.observation?.whatsapp {
                        let status = chat.neverBackedUp ? "Última copia indicada: Nunca." : "Revisa la fecha de la copia de chats."
                        step("01", "WhatsApp · \(sizeText(chat.dataBytes)) de documentos y datos",
                             "\(status) Dato informado el \(chat.observedAt.formatted(date: .abbreviated, time: .omitted)). Conserva la app y sus datos hasta verificar una copia de chats.")
                    } else {
                        step("01", "WhatsApp", "Conserva la app y sus datos hasta comprobar su copia de chats. El catálogo por cable no incluye las conversaciones.")
                    }
                    if let count = advice.registeredCount {
                        let missing = advice.itemCount - count
                        let examples = advice.unregisteredExamples.joined(separator: ", ")
                        step("02", "Fotos y vídeos · \(count) de \(advice.itemCount) registrados",
                             missing == 0
                                 ? "El registro cubre el catálogo disponible por cable. Conserva la fototeca hasta revisar una segunda copia y el alcance de Fotos en iCloud."
                                 : "\(missing) sin copia registrada que coincida: \(examples). Conserva la fototeca. Esta cifra compara el catálogo con el registro del Mac.")
                    } else {
                        step("02", "Fotos y vídeos", "Conserva la fototeca hasta cotejarla con un respaldo.")
                    }
                }
                if let date = advice.catalogueDate {
                    HStack(spacing: 14) {
                        stat("Vídeos del catálogo USB", value: sizeText(advice.videoBytes), symbol: "film")
                        stat("Fotos del catálogo USB", value: sizeText(advice.photoBytes), symbol: "photo")
                    }
                    Text("Catálogo del \(date.formatted(date: .abbreviated, time: .shortened)). Son tamaños de archivos accesibles, no una estimación de espacio recuperable.")
                        .font(.caption).foregroundStyle(muted)
                }
                note("El catálogo USB muestra archivos multimedia. Los tamaños por app y el espacio de cada caché se consultan en Almacenamiento del iPhone.", icon: "info.circle")
                if !model.storageNote.isEmpty { note(model.storageNote, icon: "exclamationmark.triangle") }
                HStack {
                    secondary("Actualizar recomendaciones", symbol: "arrow.clockwise") { model.refreshStorage() }.disabled(locked)
                    secondary("Conectar iPhone", symbol: "cable.connector") { model.section = .device; devices.start() }.disabled(locked)
                }
            } else {
                empty("Selecciona un iPhone de tu familia", detail: "Puedes registrar un dispositivo desde Mi familia.", symbol: "iphone")
            }
        }
        .task(id: model.profileID) { model.refreshStorage() }
        .onChange(of: devices.ready) { _ in model.refreshStorage() }
        .onChange(of: devices.catalogID) { _ in model.refreshStorage() }
    }
    @ViewBuilder private var cleanupButtons: some View {
        primary("Limpiar sin tocar Fotos ni WhatsApp", symbol: "checkmark.shield") { model.section = .safeCleanup }
        secondary("Revisar fotos respaldadas", symbol: "photo.on.rectangle") {
            model.resetPhotoReview(); model.section = .photoRemoval
        }
    }
    private var photoRemoval: some View {
        VStack(alignment: .leading, spacing: 18) {
            secondary("Volver a opciones", symbol: "chevron.left") { model.section = .storage }.disabled(locked)
            if let profile = model.profile {
                Label("\(profile.owner) · \(profile.device)", systemImage: "iphone").font(.headline)
            }
            if model.canFindVerifiedPhotos {
                if let enabled = devices.currentICloudPhotos {
                    note(enabled ? "Fotos en iCloud está activo. Cualquier borrado de una foto sincronizada puede propagarse a otros dispositivos." : "Fotos en iCloud está desactivado según el iPhone conectado.", icon: "icloud")
                }
                if model.canRecordPhotoTestBaseline { disposablePhotoTrial }
                card {
                    HStack {
                        TextField("Buscar por nombre de archivo", text: $model.photoSearch)
                            .textFieldStyle(.roundedBorder)
                            .onChange(of: model.photoSearch) { _ in model.resetPhotoReview() }
                        primary("Comprobar copias", symbol: "checkmark.shield") { model.findVerifiedPhotos() }
                    }.disabled(locked)
                    Text("Hasta 24 fotos individuales por búsqueda. Las Live Photos, las ediciones y las copias que no se pueden verificar quedan fuera.")
                        .font(.caption).foregroundStyle(muted)
                }
            } else {
                note("Conecta el iPhone que corresponde a este respaldo, desbloquéalo y lee su catálogo para comprobar las fotos.", icon: "iphone")
                secondary("Conectar iPhone", symbol: "cable.connector") { model.section = .device; devices.start() }.disabled(locked)
            }
            if model.photoOptionsCurrent {
                if let photo = model.photoReviewed {
                    card {
                        HStack(alignment: .top, spacing: 14) {
                            Thumbnail(path: photo.backup.path, kind: .photo, width: 110, height: 90)
                            VStack(alignment: .leading, spacing: 7) {
                                Text(photo.name).font(.headline)
                                Label("Coincide byte por byte con el iPhone", systemImage: "checkmark.shield").foregroundStyle(lime)
                                if let date = photo.remote.created {
                                    Text(date.formatted(date: .long, time: .shortened)).foregroundStyle(muted)
                                }
                                Text(photo.backup.path).font(.caption).textSelection(.enabled)
                            }
                        }
                        if model.photoHandoff {
                            Text("Selección confirmada. Usa la miniatura y la fecha para localizar esta foto en Fotos del iPhone. Confirma allí si decides eliminarla. Si hay duda sobre cuál es, conserva la foto.").fixedSize(horizontal: false, vertical: true)
                        } else {
                            HStack {
                                primary("Preparar esta foto en Fotos", symbol: "checklist") { model.confirmPhotoHandoff() }
                                if model.canRemoveReviewedPhoto {
                                    secondary("Verificar segunda copia y borrar…", symbol: "trash") { model.confirmPhotoRemoval() }
                                }
                            }.disabled(locked)
                        }
                    }
                }
                if !model.photoOptions.isEmpty {
                    card {
                        Text("Copias verificadas en el Mac").font(.headline)
                        ForEach(model.photoOptions) { photo in
                            HStack(spacing: 12) {
                                Thumbnail(path: photo.backup.path, kind: .photo)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(photo.name).fontWeight(.medium)
                                    Text(sizeText(photo.remote.bytes)).font(.caption).foregroundStyle(muted)
                                }
                                Spacer()
                                secondary("Cotejar esta foto", symbol: "arrow.left.arrow.right") { model.reviewPhoto(photo) }
                                    .accessibilityLabel("Cotejar \(photo.name) con el iPhone")
                            }.padding(.vertical, 3)
                        }
                    }.disabled(locked)
                }
            }
            note("Las fotos de la biblioteca siguen protegidas contra el borrado directo por cable. La excepción de prueba solo admite una foto nueva con su código único y dos copias verificadas.", icon: "lock.shield")
        }
        .onChange(of: model.profileID) { _ in model.resetPhotoReview() }
        .onChange(of: devices.catalogID) { _ in model.resetPhotoReview() }
        .onChange(of: devices.ready) { ready in if !ready { model.resetPhotoReview() } }
    }
    private var disposablePhotoTrial: some View {
        card {
            Text("Prueba de una sola foto · Usuario de prueba").font(.title3.weight(.semibold))
            if model.hasSavedDisposableTrial {
                secondary("Cotejar por USB la foto recibida por AirDrop", symbol: "arrow.left.arrow.right") {
                    model.compareAirDropPhotoWithUSB()
                }.disabled(locked)
            }
            if model.canSimulateAirDropCancellation {
                secondary("Probar Cancelar sin borrar", symbol: "checkmark.shield") {
                    model.simulateAirDropCancellation()
                }.disabled(locked)
            }
            if let diagnostic = model.airDropDeletionDiagnostic {
                note(diagnostic, icon: "info.circle")
            }
            if let verified = model.disposableVerified {
                HStack(alignment: .top, spacing: 14) {
                    Thumbnail(path: verified.permission.photo.backup.path, kind: .photo, width: 110, height: 95)
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Dos copias verificadas · \(verified.permission.photo.name)", systemImage: "checkmark.shield")
                            .foregroundStyle(lime)
                        Text(verified.permission.photo.backup.path).font(.caption).textSelection(.enabled)
                        Text(verified.permission.secondCopy.path).font(.caption).textSelection(.enabled)
                    }
                }
                if model.canConfirmDisposableTrial {
                    if model.disposableCancelChecked {
                        Text("Cancelar comprobado. La foto de prueba sigue en el iPhone.").font(.caption).foregroundStyle(lime)
                        secondary("Revisar borrado de la foto de prueba…", symbol: "trash") { model.confirmDisposableTrial(simulateCancel: false) }
                            .disabled(locked)
                    } else {
                        secondary("Probar Cancelar", symbol: "checkmark.shield") { model.confirmDisposableTrial(simulateCancel: true) }.disabled(locked)
                    }
                } else {
                    Text("La sesión, el disco o la capacidad del iPhone no permiten confirmar el borrado de prueba. Las copias siguen disponibles.")
                        .font(.caption).foregroundStyle(muted)
                }
            } else if let trial = model.disposableTrial, model.disposableTrialOnCurrentPhone,
                      let qr = testMarker(trial.marker) {
                Text("Toma ahora una sola foto de este código con la cámara del iPhone, en modo Foto y con Live Photo desactivado.")
                    .fixedSize(horizontal: false, vertical: true)
                Image(nsImage: qr).interpolation(.none).resizable().frame(width: 220, height: 220)
                    .padding(16).background(Color.white)
                    .accessibilityLabel("Código QR único de la foto de prueba")
                Text("Catálogo inicial guardado · \(trial.catalogue.count) elementos · \(trial.recordedAt.formatted(date: .omitted, time: .standard))")
                    .font(.caption).foregroundStyle(muted)
                HStack {
                    primary("Verificar y guardar las dos copias", symbol: "checkmark.shield") { model.verifyDisposableTrial() }
                    secondary("Volver a leer el iPhone", symbol: "arrow.clockwise") { model.section = .device; devices.reconnect() }
                }.disabled(locked)
            } else {
                Text("Registra primero el catálogo. Solo se aceptará una foto nueva que contenga el código de esta prueba.")
                    .font(.caption).foregroundStyle(muted)
                HStack {
                    if model.hasSavedDisposableTrial {
                        primary("Recuperar prueba iniciada", symbol: "arrow.counterclockwise") { model.restoreDisposableTrial() }
                    }
                    secondary("Preparar código de prueba", symbol: "qrcode") { model.recordPhotoTestBaseline() }
                }.disabled(locked)
            }
        }
    }
    private func testMarker(_ marker: String) -> NSImage? {
        let filter = CIFilter(name: "CIQRCodeGenerator", parameters: ["inputMessage": Data(marker.utf8)])
        guard let output = filter?.outputImage, let image = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return NSImage(cgImage: image, size: NSSize(width: image.width, height: image.height))
    }
    private var library: some View {
        VStack(alignment: .leading, spacing: 18) {
            if model.scan == nil { libraryShortcuts }
            if let scan = model.scan {
                HStack {
                    secondary("Verificar copias", symbol: "checkmark.shield") { model.verifyLibrary() }
                    secondary("Mostrar carpeta", symbol: "folder") { model.reveal(scan.root) }
                    secondary("Recuperar selección", symbol: "clock.arrow.circlepath") { model.loadCleanupSelection() }.disabled(!FileManager.default.fileExists(atPath: scan.root.appendingPathComponent(".revision-borrado.json").path))
                    Spacer()
                    primary("Preparar revisión de borrado", symbol: "checklist") { model.prepareCleanupReview() }.disabled(model.selected.isEmpty)
                }.disabled(locked)
                Text("Selecciona las fotos o vídeos que quieras revisar. Preparar una revisión no elimina archivos.").font(.caption).foregroundStyle(muted)
            }
            if model.scan == nil || model.viewingArchive {
                HStack { primary("Analizar carpeta", symbol: "folder.badge.plus") { model.chooseSource() }; secondary("Abrir archivo", symbol: "externaldrive") { model.openArchive() }; Spacer(); if model.archiveFolder != nil { secondary("Verificar", symbol: "checkmark.shield") { model.verifyArchive() } } }.disabled(locked)
            }
            if let scan = model.scan {
                HStack {
                    Picker("Vista", selection: $model.gallery) { Text("Galería por fecha").tag(true); Text("Lista").tag(false) }.pickerStyle(.segmented).frame(width: 300).onChange(of: model.gallery) { _ in model.page = 0 }
                    Spacer()
                    secondary("Cotejar con iPhone", symbol: "iphone") { model.compareLibrary() }.disabled(!devices.ready || locked)
                }
                note(model.comparisonSummary + (devices.ready ? "" : " · iPhone sin catálogo activo; los estados anteriores son históricos."), icon: "arrow.left.arrow.right")
                if model.canResume {
                    primary("Continuar solo lo pendiente", symbol: "arrow.down.circle") { model.continueResume() }.disabled(!model.canResume)
                }
                HStack(spacing: 24) {
                    Label("\(scan.files.count) archivos, incluidos componentes asociados", systemImage: "photo.stack")
                    Label(sizeText(scan.totalBytes), systemImage: "internaldrive")
                    Spacer()
                }.font(.system(size: 13)).foregroundStyle(muted)
                DisclosureGroup("Ubicación de los originales") { Text(scan.root.path).font(.caption).foregroundStyle(muted).textSelection(.enabled) }
                HStack {
                    Picker("Mes", selection: $model.month) {
                        Text("Todos los meses").tag("Todos los meses")
                        ForEach(model.months, id: \.self) { Text($0).tag($0) }
                    }.frame(width: 180).onChange(of: model.month) { _ in model.page = 0 }
                    Image(systemName: "magnifyingglass").foregroundStyle(muted)
                    TextField("Buscar por nombre o carpeta…", text: $model.query).textFieldStyle(.plain).onChange(of: model.query) { _ in model.page = 0 }
                    Picker("Mostrar", selection: $model.filter) { ForEach(["Fotos y videos", "Todos", "Fotos", "Videos", "Audios", "Documentos", "Complementos", "Otros", "Duplicados", "Grandes"], id: \.self) { Text($0).tag($0) } }.frame(width: 170).onChange(of: model.filter) { _ in model.page = 0 }
                }.padding(12).background(panel).cornerRadius(10)
                HStack { Text("\(model.visibleFiles.count) resultados · \(model.selected.count) seleccionados").font(.system(size: 11)).foregroundStyle(muted); Spacer(); Button("Seleccionar resultados") { model.selected.formUnion(model.visibleFiles.map(\.id)) }; Button("Quitar selección") { model.selected = [] } }.font(.system(size: 11)).disabled(locked)
                Toggle("Mostrar solo mi selección", isOn: $model.onlyReviewSelection).font(.caption).onChange(of: model.onlyReviewSelection) { _ in model.page = 0 }
                if model.gallery { galleryGrid }
                else {
                VStack(spacing: 0) {
                    HStack { Text("ARCHIVO"); Spacer(); Text("TIPO").frame(width: 95); Text("TAMAÑO").frame(width: 82, alignment: .trailing); Text("").frame(width: 28) }.font(.system(size: 9, weight: .semibold)).tracking(1.3).foregroundStyle(muted).padding(14)
                    ForEach(Array(model.visibleFiles.dropFirst(model.page * 50).prefix(50))) { file in fileRow(file).disabled(locked) }
                    if model.visibleFiles.isEmpty { Text("No hay archivos con este filtro.").foregroundStyle(muted).padding(35) }
                }.background(panel).cornerRadius(12)
                }
                if model.visibleFiles.count > 50 {
                    HStack { Button("Anterior") { model.page = max(0, model.page - 1) }.disabled(model.page == 0); Text("Página \(model.page + 1) de \((model.visibleFiles.count + 49) / 50)").font(.caption); Button("Siguiente") { model.page += 1 }.disabled((model.page + 1) * 50 >= model.visibleFiles.count) }.disabled(locked)
                }
                card {
                    HStack { VStack(alignment: .leading, spacing: 5) { Text("\(model.selected.count) archivos · \(sizeText(model.selectedFiles.reduce(0) { $0 + $1.bytes }))").font(.headline); Text(model.destination?.path ?? "Elige un destino para el archivo organizado.").font(.system(size: 11)).foregroundStyle(muted).lineLimit(2) }; Spacer(); if !model.viewingArchive { secondary("Elegir destino", symbol: "externaldrive") { model.chooseDestination() } } }
                    HStack { if !model.viewingArchive { primary("Archivar y verificar", symbol: "checkmark.shield") { model.archiveSelection() }.disabled(model.selected.isEmpty || model.destination == nil || model.profile == nil) }; secondary("Exportar plan", symbol: "checklist") { model.exportPlan() }.disabled(model.selected.isEmpty); Spacer(); Text("Los originales se conservan").font(.system(size: 11)).foregroundStyle(lime) }.disabled(locked)
                    if model.profile == nil { Text("Registra una persona en Mi familia para habilitar el archivo.").font(.caption).foregroundStyle(.orange) }
                }.disabled(locked)
                note("Los duplicados se comparan por contenido exacto. No se seleccionan ni borran automáticamente. Las fechas sin EXIF usan la fecha del archivo; revisa las agrupaciones antes de limpiar. Los GB mostrados no equivalen al espacio que se liberará en el teléfono.", icon: "info.circle")
            } else { empty("Tu primera revisión empieza aquí", detail: "Selecciona una carpeta de fotos, una importación del iPhone o una exportación de WhatsApp descomprimida. Verás resultados reales después del análisis.", symbol: "photo.stack") }
        }
    }
    private var galleryGrid: some View {
        let files = Array(model.visibleFiles.dropFirst(model.page * 50).prefix(50))
        let groups = Dictionary(grouping: files) { file in
            let f = DateFormatter(); f.dateFormat = "yyyy-MM"; return f.string(from: file.date)
        }
        return VStack(alignment: .leading, spacing: 18) {
            ForEach(groups.keys.sorted(by: >), id: \.self) { month in
                Text(month).font(.title3).foregroundStyle(lime)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 170, maximum: 240), spacing: 14)], spacing: 14) {
                    ForEach(groups[month] ?? []) { file in
                        VStack(alignment: .leading, spacing: 8) {
                            Button { model.preview = file } label: { Thumbnail(path: file.sourcePath, kind: file.kind, width: 170, height: 132) }.buttonStyle(.plain).help("Ver \(file.name)")
                            Toggle(file.name, isOn: Binding(get: { model.selected.contains(file.id) }, set: { if $0 { model.selected.insert(file.id) } else { model.selected.remove(file.id) } })).toggleStyle(.checkbox).lineLimit(1).font(.caption).disabled(locked)
                            Text(file.date.formatted(date: .abbreviated, time: .omitted)).font(.caption).foregroundStyle(muted)
                            Text("\(file.kind.rawValue) · \(sizeText(file.bytes))").font(.caption2).foregroundStyle(muted)
                            Text(model.comparison[file.relativePath] ?? "Copia local · iPhone sin comparar").font(.caption2).foregroundStyle(lime).fixedSize(horizontal: false, vertical: true)
                        }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(panel).cornerRadius(12)
                    }
                }
            }
            if files.isEmpty { Text("No hay archivos con este filtro.").foregroundStyle(muted) }
        }
    }
    private func fileRow(_ file: MediaFile) -> some View {
        HStack(spacing: 12) {
            Toggle("Seleccionar \(file.name)", isOn: Binding(get: { model.selected.contains(file.id) }, set: { if $0 { model.selected.insert(file.id) } else { model.selected.remove(file.id) } })).labelsHidden().toggleStyle(.checkbox)
            Thumbnail(path: file.sourcePath, kind: file.kind)
            VStack(alignment: .leading, spacing: 4) { Text(file.name).font(.system(size: 12, weight: .medium)).lineLimit(1); Text(file.relativePath).font(.system(size: 10)).foregroundStyle(muted).lineLimit(1) }.frame(maxWidth: .infinity, alignment: .leading)
            Text(file.kind.rawValue).font(.system(size: 11)).foregroundStyle(muted).frame(width: 95)
            Text(sizeText(file.bytes)).font(.system(size: 11, design: .monospaced)).frame(width: 82, alignment: .trailing)
            Button { model.reveal(URL(fileURLWithPath: file.sourcePath)) } label: { Image(systemName: "folder").foregroundStyle(muted) }.buttonStyle(.plain).help("Mostrar en Finder").frame(width: 28)
        }.padding(.horizontal, 14).padding(.vertical, 10).overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1) }
    }
    private var whatsapp: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack { primary("Abrir chat .txt", symbol: "bubble.left") { model.openChat() }; secondary("Analizar carpeta con adjuntos", symbol: "folder") { model.chooseSource() } }.disabled(locked)
            note("En WhatsApp: abre el chat → toca su nombre → Exportar chat → incluye archivos si los necesitas. Guarda la exportación y descomprime el ZIP en Finder. Analiza la carpeta completa para conservar también fotos, audios y documentos.", icon: "square.and.arrow.up")
            note("Una exportación puede ser parcial y NO se puede reimportar como historial de WhatsApp. El visor muestra únicamente lo que hay en el TXT; conserva un respaldo de WhatsApp antes de borrar chats.", icon: "exclamationmark.bubble")
            if let chat = model.chat {
                HStack(spacing: 14) { stat("Mensajes reconocidos", value: "\(chat.messages.count)", symbol: "bubble.left.and.bubble.right"); stat("Participantes", value: "\(chat.participants.count)", symbol: "person.2") }
                Text(model.chatURL?.lastPathComponent ?? "Chat").font(.headline)
                TextField("Buscar en esta conversación…", text: $model.chatQuery).textFieldStyle(.roundedBorder)
                let matches = chat.messages.filter { model.chatQuery.isEmpty || $0.text.localizedCaseInsensitiveContains(model.chatQuery) || $0.sender.localizedCaseInsensitiveContains(model.chatQuery) }
                Text("\(matches.count) coincidencias. Se muestran hasta 200; escribe para acotar la búsqueda. Las fechas conservan el formato de la exportación.").font(.caption).foregroundStyle(muted)
                if chat.limited { note("Vista limitada a los primeros 50.000 mensajes. El TXT original se conserva completo.", icon: "info.circle") }
                if !chat.preamble.isEmpty { Text(chat.preamble).font(.caption).foregroundStyle(muted).textSelection(.enabled) }
                LazyVStack(alignment: .leading, spacing: 10) { ForEach(Array(matches.prefix(200))) { message in
                    VStack(alignment: .leading, spacing: 8) { HStack { Text(message.sender).foregroundStyle(lime).font(.system(size: 12, weight: .semibold)); Spacer(); Text(message.timestamp).font(.system(size: 10)).foregroundStyle(muted) }; Text(message.text).font(.system(size: 13)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }.padding(16).background(panel).cornerRadius(10)
                } }
            } else { empty("Conserva el contexto, además de los archivos", detail: "Abre una conversación exportada para leerla y buscar mensajes. La lectura directa del respaldo interno de WhatsApp queda fuera de esta primera versión.", symbol: "text.bubble") }
        }
    }
    private var backup: some View {
        VStack(alignment: .leading, spacing: 18) {
            card {
                Text("Prepara un respaldo con Finder").font(.headline)
                step("01", "Conecta y confía", "Conecta el iPhone y selecciónalo en la barra lateral de Finder.")
                step("02", "Respalda en este Mac", "En General, selecciona respaldar los datos en este Mac. Activa el cifrado y guarda la contraseña de forma segura.")
                step("03", "Espera y comprueba", "Pulsa Realizar respaldo ahora. Revisa la fecha al terminar. En Gestionar respaldos puedes mostrar su carpeta en Finder.")
                secondary("Inspeccionar respaldo existente", symbol: "externaldrive.badge.questionmark") { model.inspectBackup() }.disabled(locked)
            }
            if let info = model.backupInfo {
                card {
                    Text(info.name).font(.headline)
                    Text("iOS \(info.version) · \(info.date?.formatted(date: .abbreviated, time: .shortened) ?? "Sin fecha")").foregroundStyle(muted)
                    Label(info.encrypted ? "Respaldo cifrado" : "Respaldo sin cifrar", systemImage: info.encrypted ? "lock" : "lock.open")
                    Label(info.finished ? "Finder registra una copia finalizada" : "No figura como finalizada", systemImage: info.finished ? "checkmark.circle" : "exclamationmark.triangle").foregroundStyle(info.finished ? lime : .orange)
                    Text("Solo se leyeron metadatos. No se ha descifrado, comprobado cada archivo ni probado una restauración. La inspección no garantiza recuperación completa.").font(.system(size: 12)).foregroundStyle(muted)
                }
            }
            note("Fotos y mensajes sincronizados con iCloud pueden quedar fuera del respaldo del ordenador. Comprueba los originales de la nube y el respaldo propio de WhatsApp por separado.", icon: "icloud")
        }
    }
    private var history: some View {
        VStack(alignment: .leading, spacing: 15) {
            secondary("Abrir archivo existente", symbol: "folder") { model.openArchive() }.disabled(locked)
            if model.preferences.history.isEmpty { empty("Todavía no hay sesiones de archivo", detail: "Después de copiar y verificar, encontrarás aquí el destino y el resultado de cada sesión.", symbol: "clock.arrow.circlepath") }
            ForEach(model.preferences.history) { entry in
                card {
                    HStack { Text("\(entry.owner) · \(entry.device)").font(.headline); Spacer(); Text(entry.date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(muted) }
                    Text("\(entry.copied) copias nuevas · \(entry.reused) ya archivadas").font(.system(size: 13))
                    Text(entry.folder).font(.system(size: 10, design: .monospaced)).foregroundStyle(muted).textSelection(.enabled)
                    HStack { secondary("Consultar", symbol: "photo.stack") { model.openArchive(URL(fileURLWithPath: entry.folder)) }; secondary("Mostrar en Finder", symbol: "folder") { model.reveal(URL(fileURLWithPath: entry.folder)) } }.disabled(locked)
                }
            }
        }
    }
    private var guide: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let review = model.cleanupReview {
                card {
                    Text("Selección pendiente de tu revisión").font(.title2)
                    Text("\(review.items.count) archivos · \(sizeText(review.bytes)) seleccionados · \(review.items.filter { !$0.issues.isEmpty }.count) requieren comprobaciones adicionales").font(.headline)
                    Text("Preparada el \(review.createdAt.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(muted)
                    ForEach(review.notices, id: \.self) { Text($0).font(.system(size: 13)).foregroundStyle(muted) }
                    HStack {
                        secondary("Guardar selección para revisar", symbol: "square.and.arrow.down") { model.saveCleanupReview() }
                        secondary("Volver a la galería", symbol: "photo") { model.section = .library }
                    }
                    Text("Borrado no habilitado. Esta pantalla no envía órdenes al iPhone.").foregroundStyle(.orange).font(.headline)
                }
                ForEach(Array(review.items.dropFirst(model.reviewPage * 50).prefix(50))) { item in
                    card {
                        HStack(alignment: .top, spacing: 15) {
                            Button { model.preview = item.file } label: { Thumbnail(path: item.file.sourcePath, kind: item.file.kind, width: 100, height: 75) }.buttonStyle(.plain)
                            VStack(alignment: .leading, spacing: 6) {
                                Text(item.file.name).font(.headline)
                                Text("\(sizeText(item.file.bytes)) · " + (item.addedCompanion ? "Componente asociado añadido a la revisión" : "Seleccionado por ti")).font(.caption).foregroundStyle(muted)
                                Text(item.file.relativePath).font(.caption).foregroundStyle(muted)
                                Text(item.issues.isEmpty ? "Huella local coincidente. Aún pendiente de tu revisión y de las comprobaciones previas al borrado." : item.issues.joined(separator: "\n")).font(.system(size: 12)).foregroundStyle(item.issues.isEmpty ? muted : .orange)
                            }
                        }
                    }
                }
                HStack {
                    Button("Anterior") { model.reviewPage -= 1 }.disabled(model.reviewPage == 0)
                    Text("Página \(model.reviewPage + 1) de \(max(1, (review.items.count + 49) / 50))").font(.caption)
                    Button("Siguiente") { model.reviewPage += 1 }.disabled((model.reviewPage + 1) * 50 >= review.items.count)
                }
            } else {
                note("Selecciona archivos en la galería y pulsa Preparar revisión de borrado. Aquí verás la lista y sus comprobaciones, sin eliminar nada.", icon: "checklist")
            }
            card {
                step("01", "Conserva dos copias de lo irremplazable", "Antes de borrar el teléfono, mantén copias verificadas en dos soportes independientes. Un archivo organizado no sustituye el respaldo restaurable.")
                step("02", "Comprueba el archivo", "Abre fotos, reproduce videos y revisa adjuntos. Usa Verificar para detectar copias ausentes o modificadas. Revisa las incidencias.")
                step("03", "Revisa Fotos en iCloud", "Eliminar una foto sincronizada también la elimina de iCloud y de otros dispositivos sincronizados. Para ahorrar solo espacio local, considera Optimizar almacenamiento.")
                step("04", "Limpia WhatsApp desde WhatsApp", "En Configuración → Almacenamiento y datos → Administrar almacenamiento, revisa archivos grandes y conversaciones. Retira únicamente material que hayas decidido conservar fuera o descartar.")
                step("05", "Revisa aplicaciones y descargas", "En Ajustes → General → Almacenamiento del iPhone, revisa recomendaciones y descargas. No elimines una app con datos locales importantes sin comprobar su respaldo.")
                step("06", "Mide el resultado en el teléfono", "Comprueba el espacio disponible en Ajustes después de la limpieza. El contenido de Eliminado recientemente puede seguir ocupando espacio; vaciarlo elimina una vía de recuperación.")
            }
            note("Esta versión no ejecuta borrados, no modifica respaldos ni limpia cachés internas. Prepara una selección desde Biblioteca para llevar una lista de lo que quieres revisar.", icon: "hand.raised")
        }
    }
    private var progressBar: some View {
        HStack(spacing: 15) {
            ProgressView().controlSize(.small)
            VStack(alignment: .leading, spacing: 6) { Text(devices.importing ? devices.status : model.progressText).font(.system(size: 12)).lineLimit(1); ProgressView(value: devices.importing ? Double(devices.completed) / Double(max(1, devices.total)) : model.progress).tint(lime) }
            Button(devices.importing ? "Pausar respaldo" : "Detener") { if devices.importing { devices.stop() } else { model.stop() } }
        }.padding(18).background(panel)
    }
}

private struct Thumbnail: View {
    let path: String
    let kind: FileKind
    var width: CGFloat = 44
    var height: CGFloat = 36
    @State private var image: NSImage?
    var body: some View {
        Group { if let image = image { Image(nsImage: image).resizable().scaledToFill() } else { Image(systemName: kind == .video ? "play.rectangle" : kind == .audio ? "waveform" : kind == .photo ? "photo" : "doc.text").foregroundStyle(lime.opacity(0.7)).frame(maxWidth: .infinity, maxHeight: .infinity).background(lime.opacity(0.055)) } }
            .frame(width: width, height: height).clipped().cornerRadius(6)
            .task(id: path) {
                guard kind == .photo || kind == .video else { return }
                let filePath = path, isVideo = kind == .video
                let thumb = await Task.detached(priority: .utility) { () -> CGImage? in
                    if isVideo {
                        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: URL(fileURLWithPath: filePath)))
                        generator.appliesPreferredTrackTransform = true; generator.maximumSize = CGSize(width: 400, height: 300)
                        return try? generator.copyCGImage(at: .zero, actualTime: nil)
                    }
                    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: filePath) as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
                    return CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 400, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary)
                }.value
                if let thumb = thumb { image = NSImage(cgImage: thumb, size: NSSize(width: thumb.width, height: thumb.height)) }
            }
    }
}

private struct MediaPreview: View {
    let file: MediaFile
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?
    @State private var image: NSImage?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Text(file.name).font(.headline); Spacer(); Button("Cerrar") { dismiss() } }
            if file.kind == .video { VideoPlayer(player: player) }
            else if let image = image { Image(nsImage: image).resizable().scaledToFit().frame(maxWidth: .infinity, maxHeight: .infinity) }
            else { Text("Vista previa no disponible para este archivo.").foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity) }
            Text(file.date.formatted() + " · " + file.dateSource).font(.caption).foregroundStyle(.secondary)
            Text(file.relativePath).font(.caption).textSelection(.enabled)
        }.padding(20).frame(width: 850, height: 620)
        .task {
            if file.kind == .video { player = AVPlayer(url: URL(fileURLWithPath: file.sourcePath)) }
            else if file.kind == .photo {
                let path = file.sourcePath
                let cg = await Task.detached(priority: .userInitiated) { () -> CGImage? in
                    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
                    return CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 1600, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary)
                }.value
                if let cg = cg { image = NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height)) }
            }
        }.onDisappear { player?.pause() }
    }
}

private func primary(_ text: String, symbol: String, action: @escaping () -> Void) -> some View {
    Button(action: action) { Label(text, systemImage: symbol).font(.system(size: 12, weight: .semibold)).padding(.horizontal, 16).padding(.vertical, 11).foregroundColor(Color(red: 0.09, green: 0.14, blue: 0.04)).background(lime).cornerRadius(8) }.buttonStyle(.plain)
}
private func secondary(_ text: String, symbol: String, action: @escaping () -> Void) -> some View {
    Button(action: action) { Label(text, systemImage: symbol).font(.system(size: 12)).padding(.horizontal, 13).padding(.vertical, 10).background(Color.white.opacity(0.04)).cornerRadius(8).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.13))) }.buttonStyle(.plain)
}
private func stat(_ title: String, value: String, symbol: String) -> some View {
    VStack(alignment: .leading, spacing: 12) { HStack { Text(title).font(.system(size: 11)).foregroundStyle(muted); Spacer(); Image(systemName: symbol).foregroundStyle(muted) }; Text(value).font(.system(size: 27, weight: .medium)).tracking(-0.6) }.padding(20).frame(maxWidth: .infinity, alignment: .leading).background(panel).cornerRadius(12)
}
private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 16, content: content).padding(22).frame(maxWidth: .infinity, alignment: .leading).background(panel).cornerRadius(13)
}
private func note(_ text: String, icon: String) -> some View {
    HStack(alignment: .top, spacing: 12) { Image(systemName: icon).foregroundStyle(lime).frame(width: 20); Text(text).font(.system(size: 12)).lineSpacing(4).fixedSize(horizontal: false, vertical: true).foregroundStyle(muted) }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(lime.opacity(0.045)).cornerRadius(10)
}
private func step(_ number: String, _ title: String, _ detail: String) -> some View {
    HStack(alignment: .top, spacing: 15) { Text(number).font(.system(size: 11, weight: .medium, design: .monospaced)).foregroundStyle(lime).frame(width: 31, height: 31).background(lime.opacity(0.09)).cornerRadius(8); VStack(alignment: .leading, spacing: 6) { Text(title).font(.system(size: 13, weight: .semibold)); Text(detail).font(.system(size: 12)).foregroundStyle(muted).lineSpacing(4).fixedSize(horizontal: false, vertical: true) } }.padding(.vertical, 5)
}
private func empty(_ title: String, detail: String, symbol: String) -> some View {
    VStack(spacing: 15) { Image(systemName: symbol).font(.system(size: 38, weight: .light)).foregroundStyle(lime); Text(title).font(.system(size: 18, weight: .medium)); Text(detail).font(.system(size: 13)).foregroundStyle(muted).multilineTextAlignment(.center).lineSpacing(4).frame(maxWidth: 500) }.padding(50).frame(maxWidth: .infinity).background(panel).cornerRadius(16)
}
