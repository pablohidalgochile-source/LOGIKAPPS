# Estado del editor local · 0.1.0

Fecha: 31 de octubre de 2026 (America/Santiago).
Fuente: autorización del usuario en este chat para construir la primera etapa del editor local, proponer diseño y mantener las pruebas pasando. No autoriza etapas posteriores ni publicación.

## Producto comprobado

Código en `editor/`. Editor local funcional en React + TypeScript + Vite. Biblioteca de 18 recursos con miniaturas del catálogo aprobado, búsqueda y filtro; inspector de campos, temas y tipografías; cuatro formatos según cada recurso; área segura, fondos y transporte a 60 fps. Diseño oscuro con acento rojo y distribución adaptable a móvil.

Los contenidos se mantienen por recurso en memoria durante la sesión. No hay persistencia al recargar. El editor carga los HTML originales; no se modificó `handoff/resources/`, el manifiesto ni las referencias.

## Validación realizada

- `scripts/npm test`: diez casos del lint, contrato de los 18 recursos y coincidencia de cuatro formatos, correctos.
- `scripts/npm run test:regresion`: las 17 piezas deterministas idénticas en 16:9 y 9:16. Countdown se omite por reloj real, como antes.
- `editor/npm test`: seis pruebas del adaptador de contenido y tiempo, correctas.
- `editor/npm run build`: TypeScript y compilación de producción correctos.
- `editor/npm run test:browser`: 17 comprobaciones de interacción correctas, sin errores JavaScript ni peticiones locales fallidas. Capturas revisadas en 1440×1000 y 390×844, sin desborde horizontal.
- Descarga real de Instrument Sans verificada antes de dar la tipografía por lista.
- Recursos activos, edición rápida seguida de borrado y entrada numérica de varios dígitos cubiertos: los bloqueos detectados durante desarrollo quedaron corregidos.

## Límites y próximos pasos

Sin guardado permanente, exportación integrada, multiusuario, carga de archivos, edición por capas, efectos ni audio. La exportación del estudio previo sigue disponible; no se volvió a certificar en esta etapa. 1:1 y 4:5 siguen pendientes de revisión visual pieza por pieza. Las fuentes requieren internet.

Los presets tipográficos usan las familias definidas por el runtime; el editor carga las fuentes correspondientes. La velocidad de créditos se muestra como límite de duración fija de 22 s; el recurso no implementa ese ajuste. Relojes en vivo siguen corriendo al pausar la animación.

El siguiente bloque propuesto es guardado de proyectos y conexión con las exportaciones existentes, sujeto a autorización. Las nueve vulnerabilidades reportadas antes en las dependencias de `scripts/` no se modificaron en este bloque. Las dependencias nuevas del editor se instalaron con cero vulnerabilidades reportadas por npm.
