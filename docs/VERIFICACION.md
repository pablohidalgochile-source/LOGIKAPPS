# Verificación de LOGIKAPPS 0.6.0 beta

Revisión local del 31 de octubre de 2026.

- 48 pruebas de interfaz/FRATV y 81 pruebas nativas aprobadas.
- TRACKHUNT: 110; INGESTA: 33; Orgalina: 25; Club Santa Cruz: 20; Mi Talla: 11, todas aprobadas.
- Elephant: 10 pruebas seleccionadas con imágenes y videos sintéticos; tamaños, transparencia, protección de originales, MP4, ProRes y audio. No se ejercitó el motor opcional IA en esta entrega.
- Compilación de TRACKHUNT, Orgalina, Mi Talla, Club Santa Cruz, FRATE FLYER STUDIO y Subtitle Translator Pro. Este último conserva chequeo TypeScript, sin lint autónomo configurado.
- Diez lanzadores probados desde ZIPs extraídos en carpetas temporales: INGESTA, TRACKHUNT, Mi Talla, Club Santa Cruz, Jacinta, Studio, Estudio Multicam, NANOOKEY, Orgalina y Subtitle Translator Pro. Para los tres servidores que necesitan compilación se reutilizaron las dependencias y salidas preparadas localmente; no se distribuyen node_modules.
- VJ/LAB y Hit Lab pasan sus pruebas de copia portable, recursos HTTP y restricción de acceso local.
- Interfaz WKWebView: seis packs y 25 fichas; 37 entradas en Explorar; logo de Elephant cargado; creación, edición, favoritos, ideas y borrado de accesos sobre datos temporales.
- Apertura normal, interfaz integrada, denegación de lectura provocada y recuperación nativa por recursos ausentes. El DMG se montó y su app extraída pasó la recuperación real sin utilizar la biblioteca personal.
- Firma ad-hoc, arquitecturas arm64/x86_64, macOS 13+, biblioteca incluida vacía, manifiestos, hashes y listas de publicación comprobados.

## Límites de la comprobación

Esta beta no tiene notarización de Apple. Falta probarla físicamente en el otro Mac que reportó la pantalla negra. No se han comprobado permisos de cuentas ajenas, conexiones de negocio, proveedores de IA, captura multicámara, fabricación ni traducciones facturadas. Estudio Multicam y las otras fichas de Laboratorio mantienen sus requisitos y estado de desarrollo. Las webs privadas necesitan acceso propio. Los modelos y credenciales no están incluidos.

El resultado de la compilación en Apple Silicon e Intel se consulta en [Actions](https://github.com/pablohidalgochile-source/LOGIKAPPS/actions/workflows/check.yml). La [release 0.6.0](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/tag/v0.6.0-beta.1) incluye los archivos y sus SHA-256. La descarga pública se vuelve a comprobar después de publicarlos.
