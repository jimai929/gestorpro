/**
 * Backfill de directorios/config por defecto para empresas (tenants) YA existentes que
 * nacieron ANTES de que `crearEmpresa` sembrara sus defaults (bug de onboarding). Solo
 * COMPLETA lo que falta; nunca toca lo ya presente.
 *
 * SEGURIDAD / OPERACIÓN:
 *  - DRY-RUN por defecto. Requiere `--apply` explícito para escribir.
 *  - Idempotente: correrlo dos veces da el mismo resultado (los sembradores son upsert /
 *    find-or-create por la clave única por empresa).
 *  - Corre como `gestorpro_migrador` (BYPASSRLS), igual que el seed (MIGRATOR_DATABASE_URL).
 *  - Reutiliza `sembrarDirectoriosEmpresa` (misma fuente que seed y `crearEmpresa`).
 *
 * PRODUCCIÓN: ver `docs/EMPRESA_DEFAULTS_BACKFILL.md`. Antes de `--apply` en prod:
 * backup → dry-run → revisión humana → apply → post-check. Esta tarea NO lo ejecuta en prod.
 *
 * Uso:
 *   npm run backfill:directorios -- --dry-run   # (por defecto) solo reporta
 *   npm run backfill:directorios -- --apply      # completa lo faltante
 */
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import type { ClienteTx } from '../../src/core/prisma.js';
import {
  CATEGORIAS_GASTO_DEFAULT,
  ROLES_OPERATIVOS_DEFAULT,
  sembrarDirectoriosEmpresa,
} from '../../src/core/empresa/directorios-defaults.js';

/** Lo que falta (y si se sembró) para una empresa concreta. */
export interface ReporteEmpresaBackfill {
  empresaId: string;
  slug: string;
  nombre: string;
  categoriasFaltantes: string[];
  rolesFaltantes: string[];
  configFaltante: boolean;
  /** true solo si `apply` estaba activo y se ejecutó el sembrado. */
  sembrado: boolean;
}

/**
 * Recorre TODAS las empresas y, por cada una a la que le FALTE algún default, lo reporta
 * (y lo completa si `apply`). Devuelve SOLO las empresas con algo faltante (una empresa
 * completa no aparece). `cliente` debe ignorar RLS (migrador/owner): consulta cross-tenant.
 */
export async function backfillDirectoriosEmpresa(
  cliente: ClienteTx,
  opciones: { apply: boolean },
): Promise<ReporteEmpresaBackfill[]> {
  const nombresCat = CATEGORIAS_GASTO_DEFAULT.map((c) => c.nombre);
  const clavesRol = ROLES_OPERATIVOS_DEFAULT.map((r) => r.clave);

  const empresas = await cliente.empresa.findMany({
    select: { id: true, slug: true, nombre: true },
    orderBy: { creadoEn: 'asc' },
  });

  const reporte: ReporteEmpresaBackfill[] = [];
  for (const empresa of empresas) {
    const [cats, roles, configCount] = await Promise.all([
      cliente.categoriaGasto.findMany({
        where: { empresaId: empresa.id, nombre: { in: nombresCat } },
        select: { nombre: true },
      }),
      cliente.rolOperativo.findMany({
        where: { empresaId: empresa.id, clave: { in: clavesRol } },
        select: { clave: true },
      }),
      cliente.configuracionCobro.count({ where: { empresaId: empresa.id } }),
    ]);

    const categoriasFaltantes = nombresCat.filter((n) => !cats.some((c) => c.nombre === n));
    const rolesFaltantes = clavesRol.filter((k) => !roles.some((r) => r.clave === k));
    const configFaltante = configCount === 0;

    // Empresa completa: no se toca ni se reporta.
    if (categoriasFaltantes.length === 0 && rolesFaltantes.length === 0 && !configFaltante) {
      continue;
    }

    let sembrado = false;
    if (opciones.apply) {
      // Idempotente: completa SOLO lo que falta (upsert/find-or-create no duplican).
      await sembrarDirectoriosEmpresa(cliente, empresa.id);
      sembrado = true;
    }

    reporte.push({
      empresaId: empresa.id,
      slug: empresa.slug,
      nombre: empresa.nombre,
      categoriasFaltantes,
      rolesFaltantes,
      configFaltante,
      sembrado,
    });
  }
  return reporte;
}

/** Punto de entrada CLI. Crea el cliente migrador (BYPASSRLS) tras cargar el entorno. */
async function main(): Promise<void> {
  await import('../../src/core/entorno.js'); // carga .env (DATABASE_URL / MIGRATOR_DATABASE_URL)
  const { PrismaClient } = await import('../../src/generated/prisma/client.js');
  const { PrismaPg } = await import('@prisma/adapter-pg');

  const apply = argv.includes('--apply');
  const modo = apply ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)';
  console.log(`Backfill de directorios de empresa — modo: ${modo}\n`);

  const cliente = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL,
    }),
  });
  try {
    // Guardia: el backfill DEBE correr con un rol que ignore RLS (gestorpro_migrador con
    // BYPASSRLS, o superusuario). Con el rol app (sujeto a RLS) y sin GUC de tenant, las
    // lecturas verían 0 filas → dry-run ENGAÑOSO (reportaría todo faltante) y un --apply
    // fallaría en el WITH CHECK. Fail-loud ANTES de reportar nada.
    const rol = await cliente.$queryRaw<Array<{ ok: boolean }>>`
      SELECT (rolbypassrls OR rolsuper) AS ok FROM pg_roles WHERE rolname = current_user`;
    if (!rol[0]?.ok) {
      console.error(
        'ABORTADO: el backfill debe correr como gestorpro_migrador (BYPASSRLS). El rol actual ' +
          'está sujeto a RLS → el reporte sería engañoso. Exporta MIGRATOR_DATABASE_URL y reintenta.',
      );
      process.exitCode = 1;
      return;
    }
    const reporte = await backfillDirectoriosEmpresa(cliente as unknown as ClienteTx, { apply });
    if (reporte.length === 0) {
      console.log('Todas las empresas ya tienen sus directorios por defecto. Nada que hacer.');
      return;
    }
    for (const r of reporte) {
      console.log(`• ${r.slug} (${r.nombre})`);
      console.log(`    categorías faltantes: ${r.categoriasFaltantes.join(', ') || '—'}`);
      console.log(`    roles faltantes:      ${r.rolesFaltantes.join(', ') || '—'}`);
      console.log(`    config faltante:      ${r.configFaltante ? 'sí' : 'no'}`);
      console.log(`    ${r.sembrado ? '→ COMPLETADO' : '→ (dry-run, sin cambios)'}`);
    }
    console.log(
      `\n${reporte.length} empresa(s) con faltantes. ${
        apply ? 'Completadas.' : 'Ejecuta con --apply para completarlas.'
      }`,
    );
  } finally {
    await cliente.$disconnect();
  }
}

// Solo corre como CLI (no al importarse desde un test).
const ejecutadoDirecto = argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href;
if (ejecutadoDirecto) {
  void main();
}
