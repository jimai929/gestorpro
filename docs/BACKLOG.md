# BACKLOG — GestorPro

Puntos MEDIUM / LOW detectados durante el cierre local de **v1.0**. NO son
bloqueos de release (no hay BLOCKER/HIGH abiertos). Se registran aquí para no
perderlos y se abordan en una tarea posterior con su propio alcance. No tocar
como "de paso": cada uno merece su commit.

## MEDIUM

- **Diferencia de criterio de caja entre Flujo de caja y Dashboard (compras de
  contado).** El Dashboard agrega en su salida de proveedores también las
  compras de contado; el workbench de Flujo de caja lista solo movimientos con
  registro de pago (`PagoProveedor`), por lo que una compra de contado no
  aparece como movimiento individual (no genera fila de pago). Es el resultado
  honesto de una vista movimiento-a-movimiento, y el aviso de criterio ya lo
  explica ("solo movimientos de dinero ya registrados"), pero un usuario
  acostumbrado al total del Dashboard puede notar el desajuste. Si se quisiera
  alinear al 100 %, habría que introducir la compra de contado como un
  movimiento sintético en el DTO de Flujo de caja (hoy `entidad` no lo
  contempla). Juicio de release: **no es BLOCKER/HIGH** —口径 documentado y
  consistente. Reevaluar en una tarea de "conciliación de criterios".

## LOW

- **Bundle del frontend > 500 kB tras minificar (aviso de Vite).** El chunk
  `index-*.js` supera el umbral de aviso de Vite (≈764 kB / 212 kB gzip). Es un
  aviso informativo preexistente, no un error de build. Posible mejora futura:
  `manualChunks` o `import()` dinámico para code-splitting. Sin impacto
  funcional; no es bloqueo de release.
