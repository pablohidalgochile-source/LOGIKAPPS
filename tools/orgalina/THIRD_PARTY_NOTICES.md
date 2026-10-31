# Componentes reutilizados

Orgalina 0.1.0 adapta módulos concretos. No integra completos los productos Actual Budget ni Spliit. Los archivos `upstream-*` son referencias de procedencia y no forman parte de la ejecución.

## Actual Budget

- Repositorio: https://github.com/actualbudget/actual
- Commit: `9e80790d6813de89304dad3a7452d7ee31dea816`
- Archivo: `packages/loot-core/src/server/budget/envelope.ts`
- Original conservado: `vendor/actual/upstream-envelope.ts`
- Adaptación ejecutada: `vendor/actual/envelope.mjs`
- Copyright James Long. Licencia MIT: `vendor/actual/LICENSE.txt`.

Se extrae la aritmética de saldo de categoría, arrastre y cálculo disponible de `createCategory`/`createSummary`, separada de sus dependencias de hoja de cálculo. En Orgalina se usan pesos enteros y ahorro reservado explícito. El ahorro no reproduce el mecanismo completo de ingresos retenidos/liberados de Actual. No se incorporan HyperFormula, CRDT, servidor, importadores, sincronización ni identidad de Actual.

## Spliit

- Repositorio: https://github.com/spliit-app/spliit
- Commit: `73478ed2f67a59e83866948caeece6bf2ecb985e`
- Archivos: `src/lib/shares.ts` y `src/lib/balances.ts`.
- Originales conservados: `vendor/spliit/upstream-shares.ts` y `vendor/spliit/upstream-balances.ts`.
- Adaptaciones ejecutadas: `vendor/spliit/shares.mjs` y `vendor/spliit/balances.mjs`.
- Copyright (c) 2023 Sebastien Castiel. Licencia MIT: `vendor/spliit/LICENSE`.

Se conservan el reparto por restos mayores, orden estable de participantes y rotación del desempate a partir del identificador del gasto. Se eliminan TypeScript, Prisma y ts-pattern del módulo extraído. Los balances consumen el reparto entero guardado en cada gasto. Se omiten sus reembolsos registrados, recurrencias, OCR, acceso por enlace y persistencia del producto original.

## Dependencias de la interfaz

React, React DOM y Vite se fijan en `package-lock.json`, con sus avisos distribuidos en sus respectivos paquetes. React/React DOM tienen licencia MIT; Vite tiene licencia MIT y avisos de sus dependencias. Las licencias de Actual y Spliit se mantienen en la entrega del código y en `public/licenses/` para la distribución compilada.

## PDF.js

Lectura local de PDF mediante `pdfjs-dist` 6.4.299, proyecto Mozilla PDF.js, licencia Apache-2.0. Se usa en el servidor; no envía documentos a Mozilla. Licencia incluida en `public/licenses/pdfjs-Apache-2.0.txt`. Fuentes: https://github.com/mozilla/pdf.js y https://www.npmjs.com/package/pdfjs-dist.
