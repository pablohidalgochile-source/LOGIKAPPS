# Prompt para continuar en el Mac de transmisión

Copia este texto en el agente que tenga acceso a la carpeta del kit:

> Vas a instalar y comprobar la integración FRATV/Fraternidad para OBS en este
> Mac Apple Silicon, usando el kit existente. No es un plugin nativo nuevo:
> son fuentes de navegador, dock y editor/servidor local.
>
> Lee LEEME-PRIMERO.md completo, manifest.json, app/AGENTS.md y el estado actual
> en app/handoff/ESTADO-EDITOR.md. Distingue antecedentes de autorización actual.
> El alcance es preparar este kit y verificarlo en OBS conservando mis escenas;
> no construir la nueva app de los otros handoffs.
>
> Primero comprueba arquitectura, macOS, OBS y herramientas. La versión probada
> OBS 33.0.1 requiere macOS 13+. No instales ni actualices a ciegas. Verifica los
> hashes con VERIFICAR.command y ejecuta DIAGNOSTICO.command. No mates procesos
> que ocupen puertos. No cambies referencias visuales para hacer pasar pruebas.
>
> Respalda privadamente la configuración propia de este Mac con OBS cerrado,
> fuera del kit. No copies credenciales, perfiles o configuración de otro equipo.
> Instala solo dependencias necesarias mediante lockfiles después de revisar lo
> detectado. Usa Node 24 LTS arm64 y verifica qué binario resuelve PATH. Compila el editor y corre las pruebas pertinentes de la guía.
>
> Prepara colecciones con PREPARAR-COLECCIONES.command: este paso no modifica OBS.
> Importa primero la colección nueva de cuatro relojes, con nombre único. Mantén
> mis colecciones previas intactas. La maestra es opcional y requiere reasignar
> dispositivos; no asumas que ATEM/audio existen o que sus identificadores sirven.
> Agrega Fraternidad · Relojes como dock con la URL de la guía. Mantén servidor y
> fuentes en el mismo origen y con los cuatro canales declarados.
>
> Ejecuta herramientas/comprobar-obs.mjs . --comprobar primero: solo lee. Con
> salidas inactivas y relojes pausados en su punto de reinicio, revisa y ejecuta
> --ejecutar para la prueba nativa reproducible. Usa el informe del equipo actual,
> separado de evidencia-origen. No declares listo por build/puertos, ni por capturas
> tomadas en el otro Mac. Revisa las cifras de las capturas y opera el dock nativo.
>
> Prueba en OBS las cuatro imágenes reales y todos los controles, aislamiento,
> recarga, cambio de escena/foco, permanencia a 65 segundos y dos ciclos de apertura.
> No inicies una transmisión. Si usas WebSocket, usa autorización local del destino
> sin mostrarla ni guardarla en scripts/informes. Haz un ensayo local prolongado
> y reporta FPS/GPU/frames perdidos antes de afirmar que está listo para producción.
>
> Entrega capturas, resultados, rutas de respaldo y recuperación. Si algo falla,
> conserva evidencia y distingue causas probadas de hipótesis. No prometas offline:
> las fuentes web y logos externos siguen requiriendo red. Hay una exportación
> revisada «Mi programa» con cero piezas si el manifiesto la incluye; no inventes
> otros proyectos recuperados ni accedas directamente al almacenamiento del navegador.
>
> Todo en español de Chile, tuteando. No modifiques el diseño aprobado ni los
> proyectos de los nuevos handoffs. No publiques, emitas ni configures acceso remoto.
