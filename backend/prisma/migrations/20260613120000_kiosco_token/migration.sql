-- Token de dispositivo del kiosco: endurece la superficie pública de fichaje.
-- POST /fichajes pasa a exigir el token en el header x-kiosco-token (ver
-- DESPLIEGUE.md §4.2). Se guarda solo el HASH (argon2), nunca el token en claro.
-- Nullable y additive-only: los kioscos existentes quedan SIN token y no podrán
-- fichar hasta que un administrador genere uno (POST /kioscos/:id/token).
ALTER TABLE "kiosco" ADD COLUMN "token_hash" TEXT;
