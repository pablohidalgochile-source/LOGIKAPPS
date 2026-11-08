# Verificación de LOGIKAPPS 0.7.0 beta

Comprobaciones realizadas el 8 de noviembre de 2026 sobre la distribución preparada, con datos temporales.

- 49 pruebas frontend y 81 de almacenamiento/arranque nativo aprobadas.
- WKWebView: apertura normal, carga integrada, recuperación ante fallo de archivos y aviso nativo de error. Ocho packs, 37 fichas, 60 entradas en Explorar; 13 pendientes visibles sin prometer descarga. Creación, edición, favoritos e ideas sobre una biblioteca temporal; biblioteca personal sin cambios.
- LOGIKAPPS compilada universal arm64/x86_64 para macOS 13+, firma ad-hoc verificada. DMG y hashes comprobados; sin notarización Apple.
- Limpieza Familiar: 64 comprobaciones con archivos sintéticos, incluido QR fuera del aislamiento del sistema. Edición pública con prueba experimental de borrado deshabilitada. Control de Suscripciones: 24 comprobaciones. Ambas apps y Letra Local compiladas arm64 y firmadas ad-hoc.
- TRACKHUNT portable 0.3.0: compilación y 142 pruebas. Asistente Mac 0.4.2 entregado como fuentes, con guía para compilarlo; extensión Chrome 0.3.1 descomprimida. No se afirma que su binario esté incluido.
- BINAURAL SYSTEM 0.1.0: se copió la nueva app independiente del proyecto activo, no el ZIP inicial. Diez pruebas y compilación aprobadas. Desde el pack extraído se comprobaron HTML, JS/CSS y restricciones del servidor local. No se repitió escucha real.
- NANOOK HIT MAKER: 69 pruebas Python y 15 Node. Contrapista: cinco pruebas de MIDI, persistencia, silencio y continuidad de audio; sin descargar o ejecutar modelos de IA.
- VITRINA: arranque desde pack limpio, biblioteca vacía, guardado de perfil y rechazo de peticiones ajenas, con datos ficticios.
- FRATV Studio: 23 pruebas del editor, siete de servidor y compilación; regresión visual contra las referencias aprobadas correcta. Verificador del pack extraído comprueba 222 archivos, siete medios y colecciones de 14/4 escenas. No modifica OBS del destinatario.
- Ocho packs: integridad ZIP, permisos de lanzadores, guías, nombres de descarga, SHA-256 y revisión de aplicaciones anidadas. Pruebas de NANOOKEY sintético y siete rutas de Multicam aprobadas.

## Límites

No se certifica el hardware de otro Mac ni todas las funciones de cada herramienta. Letra Local requiere preparar modelos; Contrapista y NANOOK HIT MAKER conservan integraciones opcionales y requisitos de Ableton. BINAURAL SYSTEM no incluye IA ni voces remotas; su WAV exporta síntesis, no todas las capas de audio. Las webs privadas requieren cuentas e invitaciones propias. Los logos pendientes continúan identificados como tales.

Los proyectos sin distribución comprobada permanecen en preparación. No se publican datos de bibliotecas, sesiones, cuentas ni credenciales del creador. Cada herramienta conserva sus requisitos y su estado de beta/prototipo.

La compilación remota Apple Silicon/Intel se consulta en [Actions](https://github.com/pablohidalgochile-source/LOGIKAPPS/actions/workflows/check.yml). La entrega corresponde a [0.7.0 beta](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/tag/v0.7.0-beta.1); la descarga pública y sus hashes se comprueban después de publicar.
