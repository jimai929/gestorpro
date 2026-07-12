---
name: gestorpro-incidente
description: Investigación de solo lectura ante un incidente en producción de GestorPro — logs, /health, último deploy, alcance real (qué tenant/usuario/flujo). Prioriza contener y preservar evidencia antes de cualquier acción correctiva; nunca modifica la base de datos de producción directamente. Usar ante un error 500 inesperado, dato incorrecto visible, o alerta real.
---

# gestorpro-incidente

## Cuándo usar

Producción se comporta mal: error 500 inesperado, dato incorrecto visible,
alerta de `/health`, reporte de un usuario real.

## Entrada requerida

- Síntoma reportado (qué se vio, cuándo, quién lo reportó).
- Alcance sospechado si se conoce (una empresa, todas, un flujo).

## Pasos

1. **Investigación de solo lectura primero**: logs (`docker logs`), `/health`,
   último deploy/commit en el VPS, migraciones aplicadas recientemente. No
   tocar nada todavía.
2. **Contener sin modificar datos**: si el síntoma apunta a un deploy
   reciente, identificar si un rollback es la opción correcta —
   recomendarlo, no ejecutarlo sin autorización.
3. **Preservar evidencia**: capturar logs/queries de solo lectura relevantes
   antes de que roten o cambien.
4. **Evaluar alcance real**: ¿una empresa o todas? ¿un usuario o el sistema?
   ¿hay dinero/datos inmutables involucrados?

## Prohibido

- Modificar la base de datos de producción directamente (UPDATE/DELETE
  manual).
- Ejecutar un rollback o cualquier acción correctiva sin autorización
  explícita de Jim.
- Borrar o sobrescribir logs/evidencia.
- Especular como si fuera hecho: distinguir siempre "confirmado" de
  "sospecha".

## Salida estándar

- Cronología (qué pasó, cuándo, evidencia).
- Causa probable (o varias, con nivel de confianza).
- Alcance real: tenants/usuarios/flujos afectados.
- Recomendación: rollback / hotfix / solo monitorear — y por qué.
- Evidencia recolectada (referencias, no pegar secretos/tokens).

## Punto de parada

Antes de cualquier acción correctiva sobre producción. Entregar el
diagnóstico y esperar decisión de Jim.
