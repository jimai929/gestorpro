---
name: gestorpro-ui-audit
description: Auditoría de solo lectura de una pantalla o flujo del frontend de GestorPro — tema oscuro por variable (docs/DESIGN_SYSTEM.md), contraste, eficiencia de formularios, teclado/focus-visible, estados loading/empty/error/success, visibilidad por rol y mobile. No modifica código. Usar antes de dar por cerrado un cambio visual o al auditar una pantalla existente.
---

# gestorpro-ui-audit

## Cuándo usar

Auditar una pantalla o flujo de UI existente, o antes de dar por cerrado un
cambio visual.

## Entrada requerida

- Pantalla o flujo a auditar (ruta/componente).

## Pasos

1. **Tema oscuro**: colores/tamaños/espaciado por variable de
   `frontend/src/estilos/global.css` — cero hex crudo nuevo
   (`docs/DESIGN_SYSTEM.md`).
2. **Contraste**: texto sobre fondo legible en ambos temas si aplica.
3. **Eficiencia de formularios**: Tab/Enter funcionan como se espera, sin
   envíos accidentales.
4. **Teclado**: `focus-visible` presente, navegable sin mouse.
5. **Estados**: loading, empty, error y success existen y son distinguibles
   (no silenciosos).
6. **Visibilidad por rol**: lo que un rol no debe ver, no se renderiza (no
   solo se oculta con CSS).
7. **Mobile**: viewport angosto sin overflow horizontal, controles usables.

## Prohibido

- Modificar código durante la auditoría (es solo-lectura; si el usuario pide
  arreglar, eso es `gestorpro-implementar` después).
- Inventar que se probó en mobile/teclado sin haberlo hecho.

## Salida estándar

Hallazgos agrupados por categoría (tema/contraste/formulario/teclado/
estados/permisos/mobile), cada uno con archivo:línea o componente,
comportamiento esperado vs actual, severidad.

## Punto de parada

Entregar los hallazgos. No implementa el fix.
