---
name: gestorpro-release
description: Gate de release de GestorPro hacia el VPS de producción — árbol limpio, backup verificado, push y deploy con autorización independiente cada uno, post-check de salud y comparación de hash entre local/origin/VPS. Nunca ejecuta push/deploy/SSH sin autorización explícita para ese paso concreto. Usar cuando el usuario pide desplegar.
---

# gestorpro-release

## Cuándo usar

Cuando el usuario pide desplegar a producción (VPS de GestorPro; ver
`CLAUDE.md` para el destino real).

## Entrada requerida

- Commit/rama objetivo, ya revisado y con tests verdes.
- Autorización explícita de Jim para ESTE despliegue (no vale una
  autorización de una tarea anterior).

## Pasos

1. **Git gate**: working tree limpio, rama correcta, commit objetivo
   confirmado, diff revisado.
2. **Backup**: verificar que el script de backup del VPS corre y produce un
   dump válido (`pg_restore -l` sobre el dump) antes de tocar nada.
3. **Push** — parar aquí y pedir autorización explícita si no se dio ya para
   esta tarea.
4. **Deploy** — parar aquí y pedir autorización explícita, aparte de la de
   push. Usar `bash deploy.sh` en el VPS; nunca migrar a mano.
5. **Post-check**: `/health`, una pantalla clave (login/app), y comparar hash
   de HEAD en local / `origin/main` / VPS — los tres deben coincidir.

## Prohibido

- Ejecutar push o deploy sin la autorización de ESTE paso específico (no
  basta con "puedes seguir" de una tarea anterior).
- `CONFIRMAR_SIN_BACKUP=1` por decisión propia.
- Migrar producción a mano fuera de `deploy.sh`.
- Continuar si el backup no se pudo verificar.

## Salida estándar

Checklist con cada paso y su resultado real (no marcar hecho lo que no se
corrió), hashes de los tres entornos, resultado de `/health`.

## Punto de parada

Antes de push (pedir autorización) y de nuevo antes de deploy (pedir
autorización, independiente de la de push). Si algo falla a mitad de camino,
parar y reportar el estado exacto — no reintentar automáticamente.
