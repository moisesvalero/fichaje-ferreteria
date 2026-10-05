# Decisiones del proyecto

Este documento recoge las decisiones que se cerraron **antes de escribir una línea de código**, en una entrevista de 13 preguntas. Está aquí porque casi todas ellas explican una parte del código que, sin contexto, parece arbitraria.

## El problema

Cuando empecé a trabajar quería controlar que hacía mis **8 h al día y 40 h a la semana, ni más ni menos**. Nada de nómina ni de reclamaciones: quería saber cuánto hacía de más y tener constancia.

## Decisiones funcionales

| #   | Tema                 | Decisión                                                                     | Por qué                                                                                   |
| --- | -------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Qué es "extra"       | **Semanal**: solo lo que supere el objetivo de esa semana                    | Si un día haces 9 h y otro 7 h, la semana cuadra. Lo que importa es el cómputo semanal    |
| 2   | Saldo de extras      | **Solo constancia**: no se compensa ni se cobra                              | El objetivo es autocontrol, no reclamar                                                   |
| 3   | Jornada              | Partida en **tramos**; el parón de comer **no computa**                      | Es una jornada partida: mañana, parón, tarde                                              |
| 4   | Objetivo semanal     | Se **prorratea** a los días que de verdad computan                           | Un festivo baja el objetivo a 32 h; si no, la app diría que vas -8 h y el número mentiría |
| 5   | Aviso                | **Dentro de la app**, muy visible, sin permisos                              | Una PWA sin servidor no puede despertarse con la app cerrada; prometerlo sería mentir     |
| 6   | Olvidos              | La app **pregunta**, nunca inventa horas                                     | Si el sistema autocierra a una hora inventada, el dato deja de ser tuyo                   |
| 7   | Precisión            | Minutos exactos; el aviso, con **margen de tolerancia**                      | Así el saldo es verdad y el aviso no salta por salir a las 17:02                          |
| 8   | Registros corregidos | Se **marcan**                                                                | Distinguir lo fichado en directo de lo arreglado a mano                                   |
| 9   | Límites              | **Configurables**: horas/día, horas/semana, margen y días laborables         | Petición explícita                                                                        |
| 10  | Exportación          | **PDF** personal (sin datos de empresa) y **CSV**                            | Para consultarlo y abrirlo en una hoja de cálculo                                         |
| 11  | Copia                | **JSON** exportable e importable, manual, con recordatorio                   | Sin nube, la única garantía real de no perder el historial                                |
| 12  | Datos                | **Revisada**: en **Appwrite** (UE) y con login; ver el cambio razonado abajo | Sobrevive a perder el móvil; a cambio, para fichar hace falta conexión                    |

## Decisiones técnicas

| Decisión                          | Alternativa descartada             | Por qué                                                                                                |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Svelte 5 + Vite**               | React, SvelteKit, Next             | No hay backend ni SEO: el SSR solo añade piezas móviles. Svelte da un arranque de 59 kB gzip           |
| **Appwrite (UE)**                 | Dexie sobre IndexedDB, SQLite WASM | Base de datos, cuentas y login sin montar backend. Dexie se descartó al pasar a la nube (decisión 12)  |
| **Sin router**                    | SvelteKit, svelte-spa-router       | Cinco pestañas y una hoja modal no justifican una dependencia de enrutado                              |
| **PDF diferido**                  | Importar jsPDF arriba              | jsPDF arrastra `html2canvas` y `dompurify`: 200 kB que no deben cargarse para ver un reloj             |
| **CSS propio con tokens**         | Tailwind                           | Seis pantallas con una jerarquía muy marcada: las variables CSS dan control exacto y cero dependencias |
| **Reglas en un módulo puro**      | Lógica en los componentes          | El motor de cálculo es lo único que puede mentir; aislado y con 116 tests, es verificable              |
| **La nube simulada en los tests** | Probar solo lo puro                | La cola de escritura y el candado de reentrada del botón de fichar son donde estaban los bugs reales   |

## Cambio de la decisión 12: de local a la nube

La decisión original era **todo en el dispositivo, sin cuentas ni nube**. Se cambió, y conviene dejar por qué.

**Qué la motivó:** con los datos solo en el móvil, perderlo o borrar los datos del navegador era perder el historial entero. La copia a un archivo dependía de acordarse de hacerla.

**Qué se gana:** el historial sobrevive al móvil, y se puede consultar desde otro dispositivo.

**Qué se pierde, y es real:** para fichar hace falta conexión. Antes la app abría y funcionaba en un sótano sin cobertura; ahora no. Es la contrapartida que se aceptó a cambio de no poder perder el historial, y la app lo dice en pantalla en vez de fingir que ha guardado.

**Cómo se protege:** login con Google, y cada documento con permisos solo para su dueño. Comprobado con dos usuarios reales: uno veía un documento del otro cuando el permiso de lectura estaba en la colección, y dejó de verlo al moverlo al documento. Appwrite suma los permisos de colección a los de documento, así que la colección concede únicamente `create`.

**Alternativa que se descartó:** sincronización local-first (seguir funcionando sin conexión y subir después). Es mejor para el uso real, pero exige resolver conflictos entre dispositivos. Si algún día molesta la falta de cobertura, ese es el camino, y no hay que rehacer el motor: `calculo.ts` es puro y no sabe de dónde vienen los datos.

## Lo que queda fuera de alcance (a propósito)

- Cobrar o reclamar horas
- Varios usuarios o sincronización entre dispositivos
- Notificaciones con la app cerrada
- Geolocalización
- Integración con nómina

## Una nota sobre horas/día y horas/semana

Son dos ajustes que pueden contradecirse: 6 h al día × 5 días son 30 h, no 40. En lugar de elegir por ti, la app usa **horas/semana** para el objetivo semanal (prorrateado a los días computables) y **horas/día** para el objetivo diario, y en Ajustes te avisa si los dos números no cuadran. La alternativa —que uno pisara al otro en silencio— es exactamente el tipo de detalle que hace que dejes de fiarte de una app de horas.
