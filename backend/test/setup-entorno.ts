import { inject } from 'vitest';

// Antes de cada archivo de test: apuntar el cliente Prisma a la base efímera
// que levantó el global-setup. Se ejecuta antes de evaluar el módulo de test,
// así que el cliente (que lee DATABASE_URL al importarse) ve la URL correcta.
process.env.DATABASE_URL = inject('databaseUrl');
