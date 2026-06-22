import { PrismaPg } from '@prisma/adapter-pg';
import { inject } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { conContextoTenant } from '../../src/core/tenant/contexto.js';

/**
 * Infraestructura de tests bajo RLS (Fase 5, Segmento 2).
 *
 * Tras el flip de `setup-entorno`, el cliente `prisma` de la app (src/core) conecta
 * como `gestorpro_app` (NOBYPASSRLS) → sujeto a RLS. Eso obliga a separar, igual que
 * en producción (migrador siembra, app sirve):
 *
 *  - `semilla`: cliente con el rol OWNER/superusuario del contenedor (databaseUrl),
 *    que IGNORA RLS. Se usa para CREAR fixtures y para RE-LEER sin filtro en las
 *    aserciones ("god view"). En fixtures de tablas directas hay que pasar
 *    `empresaId` explícito (NOT NULL); las "hereda" lo derivan por su FK.
 *
 *  - `comoEmpresa(empresaId, fn)`: fija el contexto de tenant en la ALS para que el
 *    código bajo prueba (servicios → `txEmpresa`) lea ese `empresaId` y fije el GUC
 *    de RLS. Los tests a NIVEL SERVICIO (que llaman funciones directamente, sin HTTP)
 *    deben envolver las llamadas aquí. Los tests HTTP (`app.inject`) NO lo necesitan:
 *    el preHandler puebla la ALS desde el token.
 *
 * REGLA: si un test falla por 0 filas tras el flip, es RLS bloqueando por falta de
 * contexto → se arregla aportando el GUC (comoEmpresa / token), NUNCA debilitando RLS.
 */

let _semilla: PrismaClient | undefined;

/** Cliente de SIEMBRA (bypass de RLS, rol owner/superusuario del contenedor). */
export function semilla(): PrismaClient {
  if (!_semilla) {
    _semilla = new PrismaClient({
      adapter: new PrismaPg({ connectionString: inject('databaseUrl') }),
    });
  }
  return _semilla;
}

/** Cierra el cliente de siembra (afterAll de los suites que lo usan). */
export async function cerrarSemilla(): Promise<void> {
  if (_semilla) {
    await _semilla.$disconnect();
    _semilla = undefined;
  }
}

interface OpcionesComoEmpresa {
  esSuperAdmin?: boolean;
}

/** Ejecuta `fn` con el contexto de tenant fijado en la ALS (tests a nivel servicio). */
export function comoEmpresa<T>(
  empresaId: string | null,
  fn: () => Promise<T>,
  opc: OpcionesComoEmpresa = {},
): Promise<T> {
  return conContextoTenant(
    { empresaId, esSuperAdmin: opc.esSuperAdmin ?? false },
    fn,
  );
}

/** Crea una empresa de prueba (vía semilla, bypass RLS) y devuelve su id. */
export async function crearEmpresa(nombre = 'Empresa Test'): Promise<string> {
  const e = await semilla().empresa.create({
    data: { nombre, slug: `test-${crypto.randomUUID()}` },
  });
  return e.id;
}
