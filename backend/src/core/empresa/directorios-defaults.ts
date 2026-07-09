import type { ClienteTx } from '../prisma.js';

/**
 * Directorios y configuración por DEFECTO de una empresa (tenant). FUENTE ÚNICA de
 * verdad reutilizada por:
 *   - el seed (empresa `default`),
 *   - `crearEmpresa` (alta de tenant de plataforma, en SU MISMA transacción), y
 *   - el script de backfill de tenants ya existentes.
 *
 * Motivación (bug de onboarding): `Gasto.categoriaId` es obligatorio y el formulario
 * solo permite ELEGIR una `CategoriaGasto` existente; sin categorías un tenant no puede
 * registrar gastos. Antes solo se sembraban para la empresa `default`, así que cada
 * empresa creada por plataforma nacía con 0 categorías / 0 roles / 0 config → dead-lock
 * (y el cobro de horas extra exige una categoría `esPagoEmpleado`).
 *
 * Reglas:
 *  - TODAS las funciones son IDEMPOTENTES (upsert / find-or-create por la clave única
 *    POR EMPRESA): correr dos veces no duplica; un tenant a medias se completa sin tocar
 *    lo ya existente.
 *  - Escriben SOLO para el `empresaId` indicado (con `empresa_id` EXPLÍCITO): nunca
 *    cruzan tenant.
 *  - Reciben un `ClienteTx`: el `tx` de una transacción (crearEmpresa) o un
 *    `PrismaClient` privilegiado que ignora RLS (seed/backfill como `gestorpro_migrador`).
 *
 * Nota RLS: dentro de `crearEmpresa` la transacción corre con `app.bypass_tenant='on'`
 * (bypass de plataforma, solo super-admin auditado), y la 2ª policy `bypass_plataforma`
 * de cada tabla tenant permite el `WITH CHECK` de estos INSERT. El seed y el backfill
 * corren como `gestorpro_migrador` (BYPASSRLS). En NINGÚN caso se relaja la RLS ni se
 * añade una policy nueva.
 */

/**
 * Categorías de gasto base. Incluye UNA de pago a empleado (`esPagoEmpleado=true`), que
 * es la que exige el pago de un cobro de horas extra (cobro.service). Catálogo extensible.
 */
export const CATEGORIAS_GASTO_DEFAULT: ReadonlyArray<{ nombre: string; esPagoEmpleado: boolean }> = [
  { nombre: 'Servicios públicos', esPagoEmpleado: false },
  { nombre: 'Alquiler', esPagoEmpleado: false },
  { nombre: 'Mantenimiento', esPagoEmpleado: false },
  { nombre: 'Pago a empleado', esPagoEmpleado: true },
];

/** Roles operativos base (funciones del empleado; NO permisos del sistema). */
export const ROLES_OPERATIVOS_DEFAULT: ReadonlyArray<{ clave: string; nombre: string }> = [
  { clave: 'cajera', nombre: 'Cajera' },
  { clave: 'verificador', nombre: 'Verificador' },
];

/** Categorías de gasto base (upsert por `@@unique([empresaId, nombre])`). */
export async function sembrarCategoriasGastoDefault(
  cliente: ClienteTx,
  empresaId: string,
): Promise<void> {
  for (const categoria of CATEGORIAS_GASTO_DEFAULT) {
    await cliente.categoriaGasto.upsert({
      where: { empresaId_nombre: { empresaId, nombre: categoria.nombre } },
      update: {},
      create: { ...categoria, empresaId },
    });
  }
}

/** Roles operativos base (upsert por `@@unique([empresaId, clave])`). */
export async function sembrarRolesOperativosDefault(
  cliente: ClienteTx,
  empresaId: string,
): Promise<void> {
  for (const rol of ROLES_OPERATIVOS_DEFAULT) {
    await cliente.rolOperativo.upsert({
      where: { empresaId_clave: { empresaId, clave: rol.clave } },
      update: {},
      create: { ...rol, empresaId },
    });
  }
}

/**
 * Configuración de cobro por defecto (80% cobrable, umbral B/. 100 — valores por
 * defecto del modelo). Find-or-create: la fila es ÚNICA por empresa (`@@unique([empresaId])`).
 */
export async function sembrarConfiguracionCobroDefault(
  cliente: ClienteTx,
  empresaId: string,
): Promise<void> {
  // upsert por el unique `@@unique([empresaId])` (schema): idempotente y sin race (a
  // diferencia de find-or-create); `update: {}` NO toca la configuración ya existente.
  await cliente.configuracionCobro.upsert({
    where: { empresaId },
    update: {},
    create: { empresaId },
  });
}

/**
 * Siembra TODOS los directorios/config por defecto de una empresa. Idempotente. Se llama
 * dentro de la transacción de alta del tenant (o desde el seed/backfill con un cliente
 * privilegiado). El orden no importa: son independientes.
 */
export async function sembrarDirectoriosEmpresa(
  cliente: ClienteTx,
  empresaId: string,
): Promise<void> {
  await sembrarCategoriasGastoDefault(cliente, empresaId);
  await sembrarRolesOperativosDefault(cliente, empresaId);
  await sembrarConfiguracionCobroDefault(cliente, empresaId);
}
