# Design System: Jornada

Especificación vinculante extraída del set aprobado en Stitch Canvas ([proyecto `4562017147504546864`](https://stitch.google.com/projects/4562017147504546864)). Cualquier pantalla nueva se genera y se implementa respetando este documento.

## 1. Visual Theme & Atmosphere

Herramienta personal de fichaje, usada de pie y con prisa. La referencia emocional es **una app bancaria bien hecha**: superficie clara casi blanca, tarjetas blancas con borde de un píxel, sombras apenas perceptibles, mucho aire y jerarquía tipográfica fuerte. Sin degradados, sin ilustraciones, sin imágenes decorativas, sin 3D, sin glassmorphism.

La disciplina cromática es deliberada: **el color escasea y por eso informa**. El azul está reservado a la acción y la navegación; el resto de colores aparecen solo en las dos o tres cifras que deciden algo. El resultado debe poder leerse en cinco segundos a plena luz.

## 2. Color Palette & Roles

### Primary Foundation

- **Azul Fichaje (`#2563EB`)**: acción primaria (botón de fichar), progreso, pestaña activa, foco de inputs. Es el único color de marca.
- **Azul Hundido (`#1D4ED8`)**: estado `:active` del botón primario.
- **Lienzo (`#F8FAFC`)**: fondo de la aplicación.
- **Superficie (`#FFFFFF`)**: tarjetas, listas y hojas modales.
- **Hairline (`#E2E8F0`)**: bordes de un píxel y separadores de lista. Estructural, nunca decorativo.
- **Superficie Hundida (`#F1F5F9`)**: relleno de chips e inputs inactivos.

### Typography & Text Hierarchy

- **Tinta (`#0F172A`)**: texto primario y cifras principales.
- **Tinta Secundaria (`#475569`)**: etiquetas, subtítulos y texto de apoyo.
- **Tinta Apagada (`#556275`)**: etiquetas de pestañas inactivas, iconos de acción secundarios, días de descanso. Es más oscura que el apagado habitual a propósito: `#94A3B8` se quedaba en 2,56:1 sobre blanco, muy por debajo del mínimo AA.

### Functional States

Solo se aplican a cifras clave y chips pequeños; siempre apagados, nunca fluorescentes. Cada estado lleva **texto explícito**, nunca solo color.

**Contraste:** todo el texto cumple WCAG AA (4,5:1) y los elementos gráficos que transmiten información, 3:1. El zoom del navegador no se bloquea (WCAG 1.4.4).

- **En objetivo — Verde (`#15803D` sobre `#F0FDF4`)**: vas en tus horas.
- **Aviso — Ámbar (`#B45309` sobre `#FEF3C7`)**: te acercas al límite, o hay un olvido o una copia pendiente.
- **Excedido — Rojo (`#B91C1C` sobre `#FEE2E2`)**: te has pasado.
- **Neutro — Gris (`#556275` sobre `#F1F5F9`, 5,65:1)**: festivo, descanso, dato no computable.

## 3. Typography Rules

- **Inter** (autoalojada vía `@fontsource-variable/inter`; nunca desde CDN, la app funciona sin conexión): titulares, cuerpo, etiquetas y cifras.
- **Cifras siempre tabulares** (`font-variant-numeric: tabular-nums`) en contadores en vivo, totales y horas. Sin esto el contador "baila" al cambiar de segundo.
- Escala:

| Nivel                        | Tamaño / Interlineado | Peso  | Tracking  |
| ---------------------------- | --------------------- | ----- | --------- |
| `display` (contador en vivo) | `56px / 60px`         | `700` | `-0.03em` |
| `metric` (cifra héroe)       | `40px / 44px`         | `700` | `-0.02em` |
| `h1` (título de pantalla)    | `24px / 32px`         | `600` | `-0.01em` |
| `h2` (título de sección)     | `18px / 26px`         | `600` | `0`       |
| `body`                       | `16px / 24px`         | `400` | `0`       |
| `label` (mayúsculas)         | `12px / 16px`         | `600` | `0.06em`  |
| `caption`                    | `13px / 20px`         | `400` | `0`       |

Nota de implementación: el design system declara `IBM Plex Sans` para etiquetas; se descarta para no cargar una segunda familia en un bundle offline. Las etiquetas usan Inter en mayúsculas con `label`.

## 4. Component Stylings

- **Botón primario de fichar**: ancho completo, altura mínima `88px`, radio `12px`, relleno azul, texto blanco `18px/600`. Objetivo táctil sobredimensionado a propósito: se pulsa de pie y con prisa.
- **Botón secundario (ghost)**: ancho completo, altura mínima `52px`, radio `12px`, fondo blanco, borde `1px` hairline, texto tinta secundaria.
- **Tarjetas**: superficie blanca, borde `1px` hairline, radio `12px`, relleno `16px`–`20px`, sombra `0 1px 2px rgba(15,23,42,0.04)`. Nunca sombras altas ni flotantes.
- **Chips de estado**: radio completo (pastilla), relleno `4px 10px`, tipografía `label`, fondo y texto del estado correspondiente. Siempre con texto, nunca solo un punto de color.
- **Filas de lista**: altura mínima `56px`, separador hairline a sangre, chevron a la derecha si navega. La fecha manda a la izquierda y la cifra a la derecha.
- **Campos de hora (editor)**: dos campos por tramo separados por un guion, con icono de reloj, cifras tabulares y radio `12px`.
- **Barra de progreso**: altura `6px`, radio completo, pista en superficie hundida y relleno azul. Al desbordar el objetivo, el exceso se marca en rojo sobre el final de la barra.
- **Barra de pestañas inferior**: cinco destinos fijos — Hoy, Semana, Historial, Exportar, Ajustes — con icono de línea y etiqueta, activo en azul. Respeta `env(safe-area-inset-bottom)`.
- **Diálogo modal (editor)**: recibe el foco al abrirse, lo atrapa mientras está abierto y lo devuelve al cerrarse. Con el teclado, `Escape` cierra.

## 5. Layout Principles

- **Rejilla**: base de `8px`, subrejilla de `4px` para filas densas y tablas.
- **Márgenes**: `16px` laterales en móvil; contenido en una sola columna.
- **Ritmo vertical**: `16px` entre tarjetas, `24px`–`32px` entre secciones, `8px` entre etiqueta y cifra.
- **Táctil**: mínimo `48x48px` para cualquier control; el botón principal, `88px`.
- **Zona de pulgar**: las acciones frecuentes viven en el tercio inferior de la pantalla.
- **Responsive**: diseño móvil primero y única fuente de verdad. En pantallas anchas el contenido se centra con ancho máximo de `480px`; no se diseña una disposición de escritorio distinta.
- **Instalada en iOS**: modo `standalone` con `viewport-fit=cover`, área segura respetada arriba y abajo, sin rebote de fondo, sin destello al pulsar y con pantallas de arranque por dispositivo para que no aparezca un blanco al abrir.

## 6. Design System Notes for Stitch Generation

- **Atmosphere keywords**: sober banking-app clarity, near-white canvas, hairline-bordered white cards, whisper-soft elevation, generous whitespace, restrained single blue accent, muted semantic states, tabular figures.
- **Canonical colour names**: Azul Jornada `#2563EB`, Lienzo `#F8FAFC`, Hairline `#E2E8F0`, Tinta `#0F172A`, Tinta Secundaria `#475569`, Verde `#15803D`, Ámbar `#B45309`, Rojo `#B91C1C`, Neutro `#556275`.
- **Component prompts**:
  - "Pantalla móvil en español con una tarjeta de estado a pantalla completa sobre fondo casi blanco, una etiqueta en mayúsculas, una cifra enorme en Inter con cifras tabulares y debajo un botón primario azul de 88 píxeles de alto con esquinas de 12 píxeles."
  - "Lista de días agrupada por semana con separadores hairline, la fecha a la izquierda, una cifra tabular a la derecha, chips de estado en pastilla con texto explícito y puntos de color apagados."
  - "Hoja de ajustes en columnas agrupadas con cabeceras en mayúsculas de 12 píxeles, filas de 56 píxeles, steppers discretos a la derecha y sin ningún elemento decorativo."
