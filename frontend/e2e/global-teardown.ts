import { request } from '@playwright/test';
import { env, writesAllowed } from './helpers/env';

/**
 * TEARDOWN de datos e2e-* (dev-only, SEGURO). Se ejecuta al terminar la suite.
 *
 * Qué hace: da de BAJA LÓGICA (reversible, idempotente, NUNCA borrado físico) las cuentas
 * y empleados de prueba con prefijo `e2e-`, usando los endpoints de baja existentes:
 *   - usuarios:  PATCH /usuarios/:id  { activo:false }   (admin-only)
 *   - empleados: PUT   /empleados/:id { activo:false }   (admin-only)
 *
 * Barrera FAIL-SAFE (misma que los @full): solo actúa si `writesAllowed` (E2E_MODE!=production
 * Y E2E_ALLOW_WRITES=true) y hay credenciales de admin. En producción o sin permiso de
 * escritura NO hace NADA. Solo toca datos con prefijo `e2e-`; jamás datos reales.
 *
 * Alcance HONESTO (lo que NO limpia, por falta de API segura — ver docs §9):
 *   - Kioscos "E2E Kiosco ...": no hay endpoint de baja/borrado (solo rotación de token);
 *     quedan listados. Inertes sin dispositivo real. Residual aceptado en dev.
 *   - Fichajes / Jornadas / Cobros / Auditoría: inmutables / append-only por diseño; quedan
 *     como histórico dev. La limpieza TOTAL en dev es `npm run db:reset` (recrea toda la BD).
 *
 * Best-effort: cualquier error se ignora (un teardown NUNCA debe tumbar la corrida).
 */
export default async function globalTeardown(): Promise<void> {
  // Fail-safe: nunca en producción ni sin permiso de escritura ni sin credenciales.
  if (!writesAllowed || !env.adminEmail || !env.adminPassword) return;

  const ctx = await request.newContext({ baseURL: env.apiURL });
  try {
    const login = await ctx.post('/auth/login', {
      data: { email: env.adminEmail, password: env.adminPassword },
    });
    if (!login.ok()) return;
    const { accessToken } = (await login.json()) as { accessToken?: string };
    if (!accessToken) return;
    const headers = { Authorization: `Bearer ${accessToken}` };

    let usuarios = 0;
    const listaU = (await (await ctx.get('/usuarios', { headers })).json()) as Array<{
      id: string;
      email?: string;
      activo?: boolean;
    }>;
    for (const u of Array.isArray(listaU) ? listaU : []) {
      if (typeof u.email === 'string' && u.email.startsWith('e2e-') && u.activo) {
        const r = await ctx.patch(`/usuarios/${u.id}`, { headers, data: { activo: false } });
        if (r.ok()) usuarios += 1;
      }
    }

    let empleados = 0;
    const listaE = (await (await ctx.get('/empleados?incluirInactivos=true', { headers })).json()) as Array<{
      id: string;
      numero?: string;
      activo?: boolean;
    }>;
    for (const e of Array.isArray(listaE) ? listaE : []) {
      if (typeof e.numero === 'string' && e.numero.startsWith('e2e-') && e.activo) {
        const r = await ctx.put(`/empleados/${e.id}`, { headers, data: { activo: false } });
        if (r.ok()) empleados += 1;
      }
    }

    console.log(
      `[e2e teardown] baja lógica (reversible) de datos e2e-*: ${usuarios} usuarios, ${empleados} empleados. ` +
        'Residual dev sin API segura de retiro: kioscos "E2E Kiosco ..." + histórico inmutable ' +
        '(fichajes/jornadas/cobros). Limpieza total dev: npm run db:reset. Ver docs §9.',
    );
  } catch (err) {
    console.log(`[e2e teardown] best-effort, error ignorado: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await ctx.dispose();
  }
}
