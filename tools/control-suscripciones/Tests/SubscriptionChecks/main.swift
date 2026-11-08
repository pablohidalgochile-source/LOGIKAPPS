import Foundation
import SubscriptionCore
import Darwin

var count = 0
func check(_ name: String, _ body: () throws -> Void) {
    do { try body(); count += 1; print("PASS \(name)") } catch { fputs("FAIL \(name): \(error)\n",stderr); exit(1) }
}
func expect(_ value: @autoclosure () throws -> Bool) throws { if try !value() { throw SubError.message("Comprobación no satisfecha") } }
func rejects(_ body: () throws -> Void) throws { do { try body() } catch { return }; throw SubError.message("Se esperaba rechazo") }
func message(_ id: String = "aabbcc001122", _ text: String = "Ha pagado $12,95 USD a Servicio", date: String = "2026-10-13") -> Mail {
    Mail(id:id,from:"PayPal service@intl.paypal.com",subject:"Recibo de su pago a Servicio",date:date,snippet:text)
}
func audit(_ messages: [Mail], account: String = "example@gmail.com") -> Audit {
    Audit(account:account,reviewedOn:"2026-10-20",query:"subject:receipt",complete:false,limitation:"Prueba sintética",messages:messages)
}
func fixture() throws -> State { var s=State();try s.merge(audit([message()]));return s }
func active() -> Review {
    var r=Review();r.status="Activa confirmada";r.amount="120";r.currency="USD";r.cadence="Anual";r.verifiedOn="2026-10-20";r.evidence="Portal de prueba";return r
}
check("Importar no confirma una suscripción ni suma sus cobros") {
    let s=try fixture();try expect(Engine.entries(s).count == 1);try expect(Engine.totals(s).isEmpty)
}
check("Importes USD decimales y CLP con miles") {
    try expect(Engine.decimal("12,95",currency:"USD") == Decimal(string:"12.95"))
    try expect(Engine.decimal("22.990",currency:"CLP") == 22990)
    try expect(Engine.decimal("1.234,56",currency:"EUR") == Decimal(string:"1234.56"))
    try expect(Engine.decimal("-2",currency:"USD") == nil && Engine.decimal("NaN",currency:"USD") == nil)
}
check("Extrae el importe del correo con moneda explícita") {
    let e=Engine.entries(try fixture())[0]
    try expect(e.amount == Decimal(string:"12.95") && e.currency == "USD" && e.cadence == "Sin confirmar")
}
check("Símbolo dólar sin moneda no se convierte a USD o CLP") {
    var s=State();try s.merge(audit([message("aabbcc22","Ha pagado $12.000 a Servicio")]))
    try expect(Engine.entries(s)[0].amount == nil)
}
check("La última evidencia sin precio no hereda el importe antiguo") {
    var s=try fixture();try s.merge(audit([message("aabbcc33","Su plan ha cambiado",date:"2026-10-14")]))
    try expect(Engine.entries(s)[0].amount == nil)
}
check("Reimportar no duplica mensajes y conserva decisiones") {
    var s=try fixture();let id=Engine.entries(s)[0].id;s.reviews[id]=active()
    try s.merge(audit([message()]));try expect(Engine.entries(s)[0].evidence.count == 1 && s.reviews[id]?.currency == "USD")
}
check("Mismo correo en consultas distintas se cuenta una sola vez") {
    var s=try fixture();var a=audit([message()]);a.query="from:paypal";try s.merge(a)
    try expect(Engine.entries(s)[0].evidence.count == 1)
}
check("Texto completo prevalece sobre fragmento posterior") {
    var s=State();var m=message();m.detail="Ha pagado $99,00 USD a Servicio";try s.merge(audit([m]));try s.merge(audit([message()]))
    try expect(Engine.entries(s)[0].amount == 99)
}
check("Cuentas de familiares permanecen separadas") {
    var a=message("aa110000");a.from="Apple no_reply@email.apple.com";a.subject="Tu recibo de Apple";a.snippet="Cuenta de Apple: family@example.com iCloud+ con 2 TB (mensual)"
    var b=a;b.id="bb220000";b.snippet="Cuenta de Apple: owner@example.com iCloud+ con 2 TB (mensual)"
    var s=State();try s.merge(audit([a,b]));try expect(Engine.entries(s).count == 2)
}
check("No mezcla evidencia de dos buzones al abrir Gmail") {
    var s=try fixture();try s.merge(audit([message()],account:"other@gmail.com"));try expect(Engine.entries(s).count == 2)
}
check("Boletín no es un gasto de suscripción") {
    var m=message();m.from="marketing@example.com";m.subject="Please confirm subscription";m.snippet="Newsletter / Product Registration"
    var s=State();try s.merge(audit([m]));try expect(Engine.entries(s).isEmpty)
}
check("Varias apps en un recibo no se atribuyen a la primera") {
    var m=message();m.from="Apple no_reply@email.apple.com";m.snippet="Cuenta de Apple: demo@example.com YouTube (mensual) PictureThis (anual)"
    var s=State();try s.merge(audit([m]));try expect(Engine.entries(s)[0].incomplete && Engine.entries(s)[0].service.contains("varios"))
}
check("Renovación extraída sin inventar el próximo periodo") {
    var m=message();m.from="Apple no_reply@email.apple.com";m.snippet="Cuenta de Apple: demo@example.com iCloud+ con 2 TB (mensual) Se renovará el 12 de septiembre de 2026"
    var s=State();try s.merge(audit([m]));try expect(Engine.entries(s)[0].renewal == "2026-09-12")
}
check("Fechas imposibles rechazadas") {
    try expect(Engine.date("2026-02-30") == nil && Engine.date("2026-2-3") == nil)
    var a=audit([message()]);a.reviewedOn="mañana";try rejects{try Engine.validate(a)}
}
check("Confirmar estado exige fecha y evidencia") {
    var r=active();r.evidence="";try rejects{try Engine.validate(r)}
    r.evidence="Portal";r.verifiedOn="";try rejects{try Engine.validate(r)}
}
check("Mensualización y monedas se mantienen separadas") {
    var s=try fixture();try s.merge(audit([message()],account:"other@gmail.com"));let es=Engine.entries(s)
    s.reviews[es[0].id]=active();var r=active();r.currency="CLP";r.amount="12.000";r.cadence="Mensual";s.reviews[es[1].id]=r
    try expect(Engine.totals(s)["USD"] == 10 && Engine.totals(s)["CLP"] == 12000)
}
check("Canceladas, variables y pagos únicos quedan fuera del gasto recurrente") {
    var r=active();r.status="Cancelada";try expect(Engine.monthly(r) == nil)
    r.status="Activa confirmada";r.cadence="Variable";try expect(Engine.monthly(r) == nil)
    r.cadence="Único";try expect(Engine.monthly(r) == nil)
}
check("Ahorro solo cuenta propuestas con gasto confirmado") {
    var s=try fixture();let id=Engine.entries(s)[0].id;s.reviews[id]=active()
    try expect(Engine.totals(s,savingsOnly:true).isEmpty)
    s.reviews[id]?.decision="No renovar";try expect(Engine.totals(s,savingsOnly:true)["USD"] == 10)
}
check("Enlace de Gmail se construye sin confiar en URL del mensaje") {
    var m=message();m.url="file:///etc/passwd"
    try expect(Engine.gmailURL(m,account:"example@gmail.com")?.host == "mail.google.com")
    m.id="../evil";try expect(Engine.gmailURL(m,account:"example@gmail.com") == nil)
}
check("Exportación evita fórmulas de hoja de cálculo") {
    var s=try fixture();let id=Engine.entries(s)[0].id;var r=Review();r.notes="=HYPERLINK(\"bad\")";s.reviews[id]=r
    try expect(Engine.csv(s).contains("'=HYPERLINK"))
}
let temp=FileManager.default.temporaryDirectory.appendingPathComponent("subscription-tests-"+UUID().uuidString)
try FileManager.default.createDirectory(at:temp,withIntermediateDirectories:true)
defer { try? FileManager.default.removeItem(at:temp) }
check("Persistencia y copia anterior antes de guardar") {
    let path=temp.appendingPathComponent("data/state.json");let s=try fixture();try Storage.save(s,path);try Storage.save(s,path)
    try expect(try Storage.load(path).audits.count == 1)
    try expect(try FileManager.default.contentsOfDirectory(atPath:temp.appendingPathComponent("data/Copias de seguridad").path).count == 1)
}
check("Datos corruptos no se reinician ni sobrescriben al cargar") {
    let p=temp.appendingPathComponent("corrupt.json");try Data("bad".utf8).write(to:p);try rejects{_ = try Storage.load(p)}
    try expect(try String(contentsOf:p) == "bad")
}
check("Symlink de datos rechazado") {
    let target=temp.appendingPathComponent("target.json");try Storage.save(try fixture(),target)
    let link=temp.appendingPathComponent("link.json");try FileManager.default.createSymbolicLink(at:link,withDestinationURL:target)
    try rejects{_ = try Storage.load(link)}
}
check("JSON futuro rechazado sin perder revisión actual") {
    var s=try fixture();var a=audit([]);a.schema=2;try rejects{try s.merge(a)}
    try expect(s.audits[0].messages.count == 1)
}
print("\(count) comprobaciones aprobadas. Datos sintéticos; sin acceso a cuentas.")
if CommandLine.arguments.contains("--make-demo"),let flag=CommandLine.arguments.firstIndex(of:"--make-demo"),flag+1<CommandLine.arguments.count {
    let m=Mail(id:"aa1122334455",from:"PayPal service@intl.paypal.com",subject:"Recibo de su pago a Servicio de muestra",date:"2026-10-20",snippet:"Ha pagado $12,95 USD a Servicio de muestra")
    let a=audit([m],account:"demostracion@example.com")
    let encoder=JSONEncoder();encoder.outputFormatting=[.prettyPrinted,.sortedKeys]
    try encoder.encode(a).write(to:URL(fileURLWithPath:CommandLine.arguments[flag+1]))
}
