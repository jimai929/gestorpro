# DESIGN_SYSTEM.md — GestorPro

Sistema de diseño de la UI. **Lectura obligatoria antes de escribir UI nueva o cambiar
estilos.** Los tokens viven en `frontend/src/estilos/global.css` (`:root`). Regla dura:
color, tamaño de fuente, espaciado y radio **siempre por variable**; nunca hexadecimales
nuevos en componentes; **nunca emoji como icono de UI**.

Estética objetivo: back-office sobrio (azul marino tinta + gris neutro), jerarquía plana,
mucho aire, líneas finas. Nada de colores saturados ni pesos de fuente gruesos.

---

## Color

Azul marino tinta como primario + grises neutros + colores semánticos solo para estado.

| Uso | Variable | Valor |
|---|---|---|
| Primario (botones/enlaces/énfasis) | `--color-primary` | `#1E3A5F` |
| Primario hover | `--color-primary-hover` | `#162B47` |
| Primario fondo (badge/selección) | `--color-primary-bg` | `#EAF0F6` |
| Primario texto (sobre fondo claro) | `--color-primary-text` | `#1E3A5F` |
| Fondo de página | `--color-bg` | `#F7F8FA` |
| Fondo de tarjeta | `--color-surface` | `#FFFFFF` |
| Borde (línea fina 0.5px) | `--color-border` | `#E3E6EA` |
| Borde fuerte (hover/separador) | `--color-border-strong` | `#CBD1D8` |
| Texto principal | `--color-text` | `#1A1D21` |
| Texto secundario | `--color-text-secondary` | `#5A6472` |
| Texto tenue (placeholder/pista) | `--color-text-muted` | `#8A929E` |
| Éxito | `--color-success` | `#1D7A5A` |
| Éxito fondo | `--color-success-bg` | `#E6F2EE` |
| Peligro (borrar/error) | `--color-danger` | `#B23B3B` |
| Peligro fondo | `--color-danger-bg` | `#FBECEC` |
| Aviso (pendiente/adelanto) | `--color-warning` | `#B8791A` |
| Aviso fondo | `--color-warning-bg` | `#FBF1E0` |

## Tipografía

Tres niveles de jerarquía, **no más**. Solo dos pesos: **400** (`--fw-regular`) y **500**
(`--fw-medium`). No usar 600/700 (en un back-office el peso grueso se ve barato).

| Variable | Tamaño / peso | Uso |
|---|---|---|
| `--fs-title` | 20px / 500 | Título de página |
| `--fs-heading` | 15px / 500 | Título de tarjeta o de sección |
| `--fs-body` | 14px / 400 | Texto, valores de formulario |
| `--fs-label` | 13px / 400 | Etiqueta de campo, descripción |
| `--fs-caption` | 12px / 400 | Badge, pill, pista |

## Espaciado y radios

| Variable | Valor | | Variable | Valor |
|---|---|---|---|---|
| `--space-xs` | 4px | | `--radius` | 8px (controles) |
| `--space-sm` | 8px | | `--radius-card` | 12px (tarjetas) |
| `--space-md` | 12px | | `--radius-pill` | 999px (badges) |
| `--space-lg` | 16px | | | |
| `--space-xl` | 24px | | | |

## Iconos

`lucide-react`, línea uniforme (mismo `strokeWidth`, tamaño coherente por contexto).
**Prohibido usar emoji como icono de UI.** Mapeo habitual:

| Concepto | Icono lucide |
|---|---|
| Finanzas | `Wallet` |
| Administración | `Building2` |
| Asistencia | `Clock` |
| Empleados | `Users` |
| Sedes / tienda | `Store` |
| Kiosco (dispositivo) | `MonitorSmartphone` |
| Borrar | `Trash2` |
| Editar | `Pencil` |

## Reglas de emparejamiento (evitar mezclas de color incorrectas)

1. **Badge/pill de fondo claro**: fondo con la variable `-bg` y texto con el mismo tono
   (`-text` o el color primario). **Nunca** texto negro o gris sobre un fondo de color.
   Ej.: fondo `--color-success-bg` + texto `--color-success`.
2. **Botón sólido (primario)**: fondo `--color-primary` + texto blanco.
3. **Un solo botón sólido primario por página** (la acción principal). El resto, botones
   con borde (`--color-border`/`--color-border-strong`) y texto/`--color-text`.
4. **Colores de estado** (`success`/`danger`/`warning`) **solo para estado**, jamás como
   decoración o acento arbitrario.

## Cómo aplicar

- Referenciar SIEMPRE por variable: `color: var(--color-text)`, `padding: var(--space-md)`,
  `border-radius: var(--radius-card)`, `font-size: var(--fs-body)`.
- NO escribir hexadecimales nuevos en componentes ni en CSS modules.
- Migración COMPLETADA (2026-07-21): los tokens legados en español (`--color-primario`,
  `--radio-base`…) fueron retirados de `global.css`; ninguna hoja los referencia.
  `body` y `a` usan los tokens del sistema, así que heredan bien bajo `data-theme="dark"`.
- Página de referencia / plantilla: `PantallaInicio.tsx` (primer patrón aplicado).

---

# Tema Oscuro Grafito Cálido

Dirección visual FINAL de GestorPro: UI oscura de grafito cálido + barra lateral fija a la
izquierda + acento ámbar cálido. **Estado: M0 — SOLO documentación.** Estos valores todavía
NO están en `global.css`; el tema vigente sigue siendo el claro marino. Este apartado fija
los tokens para las fases siguientes (esqueleto → validación de una página → despliegue por
páginas). Cuando se apliquen, se **definirán los tokens oscuros bajo `:root[data-theme="dark"]`,
manteniendo `:root` (claro) como default** (decisión M1/paso 1,打法 B): tema oscuro OPT-IN por
scope, NO reemplazo global de `:root` — evita romper las 37 hojas con hex crudo durante el
despliegue gradual; cada página se activa en oscuro solo cuando ya está tokenizada.

## Superficies (4 niveles de profundidad)

| Token | Valor | Uso |
|---|---|---|
| `--color-sidebar` | `#151413` | barra lateral (ancla visual, la superficie más oscura) |
| `--color-bg` | `#1A1917` | fondo de página |
| `--color-surface` | `#232120` | tarjetas / paneles |
| `--color-surface-raised` | `#2A2724` | hover / popover / seleccionado |
| `--color-border` | `#34312E` | borde fino |
| `--color-border-strong` | `#413D39` | hover / divisor |

## Color primario (ámbar cálido)

| Token | Valor | Uso |
|---|---|---|
| `--color-primary` | `#D9954F` | botones / enlaces / selección |
| `--color-primary-hover` | `#E0A96A` | hover del primario |
| `--color-primary-bg` | `#2E2724` | fondo de pill / badge ámbar |
| `--color-primary-text` | `#E0A96A` | texto ámbar sobre fondo oscuro |
| `--on-primary` | `#151413` | texto sobre botón ámbar sólido |

## Texto (sobre fondo oscuro)

| Token | Valor | Uso |
|---|---|---|
| `--color-text` | `#F0EBE4` | texto principal |
| `--color-text-secondary` | `#A79E92` | texto secundario |
| `--color-text-muted` | `#8A8175` | placeholder / pista (aclarado desde `#7A7268`; pasa AA vs bg pero NO vs surface — ver contraste) |

## Semánticos (versión oscura, RE-CALIBRADOS para grafito — NO son los claros invertidos)

| Token | Valor | Fondo -bg |
|---|---|---|
| `--color-success` | `#5FBE8A` | `#1C2E25` |
| `--color-danger` | `#E8756B` | `#2E1F1D` |
| `--color-warning` | `#E0A94F` | `#2E2820` |

## Finanzas (negocio núcleo)

| Token | Valor |
|---|---|
| `--color-amount-positive` | `#5FBE8A` |
| `--color-amount-negative` | `#E8756B` |
| `--color-amount-neutral` | `#F0EBE4` |
| `--color-table-stripe` | `#1F1D1B` |
| `--color-table-header` | `#2A2724` |

## Estados de navegación (barra lateral)

| Estado | Fondo | Texto |
|---|---|---|
| default | transparente | `#A79E92` (`--color-text-secondary`) |
| hover | `#232120` (`--color-surface`) | `#F0EBE4` (`--color-text`) |
| seleccionado | `#2A2724` (`--color-surface-raised`) | `#E0A96A` (`--color-primary-text`) |

## Contraste WCAG (REAL, calculado)

Ratios calculados con la fórmula de luminancia relativa de WCAG 2.1 (sRGB: canal linealizado
`c<=0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`; `L = 0.2126R + 0.7152G + 0.0722B`;
`contraste = (Lmax+0.05)/(Lmin+0.05)`). Umbral **AA texto normal = 4.5:1**; UI/texto grande = 3.0:1.

**Contra `--color-bg` `#1A1917`:**

| Color | Hex | Ratio | AA 4.5 | UI/grande 3.0 |
|---|---|---|---|---|
| text | `#F0EBE4` | **14.81:1** | ✅ PASS | ✅ |
| text-secondary | `#A79E92` | **6.65:1** | ✅ PASS | ✅ |
| **text-muted** | `#8A8175` | **4.58:1** | ✅ PASS | ✅ |
| primary | `#D9954F` | **7.00:1** | ✅ PASS | ✅ |
| primary-text / hover | `#E0A96A` | **8.41:1** | ✅ PASS | ✅ |
| success / amount-positive | `#5FBE8A` | **7.71:1** | ✅ PASS | ✅ |
| danger / amount-negative | `#E8756B` | **6.01:1** | ✅ PASS | ✅ |
| warning | `#E0A94F` | **8.33:1** | ✅ PASS | ✅ |
| amount-neutral | `#F0EBE4` | **14.81:1** | ✅ PASS | ✅ |

**Contextos alternativos (fondo distinto):**

| Par | Ratio | AA 4.5 |
|---|---|---|
| `--on-primary` `#151413` sobre botón `--color-primary` `#D9954F` | **7.33:1** | ✅ PASS (texto legible en botón ámbar) |
| text `#F0EBE4` sobre surface `#232120` | **13.52:1** | ✅ PASS |
| text-secondary `#A79E92` sobre surface `#232120` | **6.07:1** | ✅ PASS |
| **text-muted `#8A8175` sobre surface `#232120`** | **4.18:1** | ❌ **FAIL** (mejoró desde 3.39, pero sigue < 4.5) |

### ⚠ Hallazgo de accesibilidad (NO silenciado)

`--color-text-muted` se **aclaró de `#7A7268` a `#8A8175`** (decisión de Jim, M0). Con eso:
**pasa AA sobre el fondo de página** (`#1A1917`, **4.58:1**), pero **sigue SIN pasar AA sobre
surface** (`#232120`, **4.18:1** < 4.5:1) — mejoró desde 3.39:1 pero no lo cierra. Como el
muted se usa mayormente en tarjetas (surface), **la regla de uso se mantiene:** limitar
`--color-text-muted` a placeholders, pistas no esenciales y texto grande; **NUNCA** para
contenido de lectura esencial (valores, importes, etiquetas). Para texto secundario legible
usar `--color-text-secondary` (`#A79E92`, 6.65:1 vs bg / 6.07:1 vs surface, pasa AA en ambos).
Si en el paso 1 se necesita muted legible SOBRE tarjetas, habrá que aclararlo más (p. ej.
~`#9A9184`) — pendiente de revisar al aplicar. Todos los demás colores de texto y semánticos
pasan AA (vs bg y vs surface).

## Regla de desambiguación: warning vs primary (mismo tono ámbar)

`--color-warning` (`#E0A94F`) y `--color-primary` (`#D9954F`) comparten tono ámbar y son
casi idénticos. Para que el usuario no confunda "estado de aviso" con "control interactivo":

- **`--color-primary` SOLO en controles interactivos**: botones, enlaces, selección, foco.
- **`--color-warning` SOLO en etiquetas de ESTADO** (pendiente / adelanto / anomalía),
  **siempre acompañado de icono y/o texto** (nunca solo el color como señal).
- Nunca usar el ámbar primario como decoración de estado ni el warning como acento de un control.

## Páginas / componentes afectados por el cambio de tema

- **LayoutPrincipal** — cambio estructural mayor: la barra superior (`topbar`) pasa a **barra
  lateral fija a la izquierda** (`--color-sidebar`), con los estados default/hover/seleccionado
  de arriba. Es el cambio de más impacto (afecta el marco de toda la app autenticada).
- **finanzas** (dashboard, cuentas por pagar, gastos, proveedores) — **tablas** (stripe/header)
  y **montos** (positive/negative/neutral) sobre fondo grafito; núcleo del negocio.
- **kiosco** (`PantallaKiosco`) — ya es oscuro; recalibrar su fondo/acento a estos tokens
  (hoy usa `#0f172a` + acento marino → grafito `--color-bg` + ámbar).
- **administracion** (empleados, usuarios, sedes, kioscos) — listas + formularios + badges.
- **PantallaInicio** — plantilla; re-migrar del marino claro al grafito oscuro.
- **auth** (login, cambio forzado, diálogos) — superficies y campos sobre fondo oscuro.
- Transversal: badges/pills, inputs, focus rings — todos re-tematizados por token.
