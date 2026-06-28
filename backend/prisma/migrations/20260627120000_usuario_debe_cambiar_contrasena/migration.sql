-- Fuerza el cambio de la contraseña INICIAL en el primer login. Las cuentas creadas por
-- un TERCERO con contraseña temporal —POST /empresas (primer admin del tenant) y
-- POST /usuarios (usuario/empleado dentro del tenant)— nacen con debe_cambiar_contrasena
-- = true y deben rotarla; el autoservicio de cambio de contraseña la pone en false.
--
-- ADDITIVE PURO: columna nueva NOT NULL con DEFAULT false. Las filas existentes (cuentas
-- cuyo dueño ya eligió su clave: admin/super-admin del seed) quedan en false, sin ventana
-- ni backfill. `usuario` está EXCLUIDA de RLS (allowlist): no requiere policy.

ALTER TABLE "usuario" ADD COLUMN "debe_cambiar_contrasena" BOOLEAN NOT NULL DEFAULT false;
