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
- Migración GRADUAL: los tokens legados en español (`--color-primario`, `--radio-base`…)
  siguen en uso; se retiran solo cuando ninguna página los referencie. Al tocar una página
  (p. ej. en la fase responsive M2), migrarla a estos tokens de paso.
- Página de referencia / plantilla: `PantallaInicio.tsx` (primer patrón aplicado).
