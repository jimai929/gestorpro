import { inject } from 'vitest';

// Antes de cada archivo de test: apuntar el cliente Prisma de la APP a la base
// efímera, con el rol `gestorpro_app` (NOBYPASSRLS) → SUJETO A RLS, como en
// producción (Fase 5 Seg 2). Así los tests ejercitan la frontera real: una lectura
// sin contexto de tenant da 0 filas. Los fixtures se siembran con el cliente
// `semilla` (rol owner/superusuario, bypass) de test/helpers/db.ts; el código bajo
// prueba corre bajo `comoEmpresa(empresaId, ...)` o, en tests HTTP, vía el token.
process.env.DATABASE_URL = inject('databaseUrlApp');
