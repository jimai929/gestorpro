import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import pg from 'pg';

const { Client } = pg;

/**
 * Append-only de `auditoria` a NIVEL DE ROL de Postgres.
 *
 * La garantía real en producción es que el rol de la app (`gestorpro_app`, NO
 * dueño de las tablas) tiene REVOCADOS UPDATE/DELETE/TRUNCATE sobre `auditoria`
 * (ver `deploy/postgres/post-migrate.sql`). Los demás tests conectan con el rol
 * owner del contenedor (superusuario), que IGNORA esos REVOKE, así que no pueden
 * comprobarlo. Aquí conectamos con el rol restringido que crea `global-setup`
 * replicando ese contrato, para que un cambio que rompa el REVOKE salga en rojo.
 */
describe('auditoria — append-only a nivel de rol (gestorpro_app)', () => {
  let app: pg.Client;

  beforeAll(async () => {
    app = new Client({ connectionString: inject('databaseUrlApp') });
    await app.connect();
  });

  afterAll(async () => {
    await app.end();
  });

  // OJO: este INSERT deja una fila INMUTABLE ('PruebaAppendOnly') en la base
  // compartida del contenedor; por el propio append-only no se puede borrar.
  // Es inocua mientras NINGÚN otro test cuente filas de auditoria sin filtrar
  // (hoy se filtra siempre por entidadId/accion). Un test futuro de dashboard o
  // paginación que cuente filas globales NO debe asumir que auditoria está vacía.
  it('permite INSERT y SELECT (no se rompió la operación legítima de la app)', async () => {
    const insert = await app.query(
      `INSERT INTO auditoria (id, entidad, entidad_id, accion, usuario_id, detalle)
       VALUES (gen_random_uuid(), $1, $2, $3, gen_random_uuid(), $4::jsonb)
       RETURNING id`,
      ['PruebaAppendOnly', 'x-1', 'crear', JSON.stringify({ prueba: true })],
    );
    expect(insert.rowCount).toBe(1);
    const id = insert.rows[0].id as string;

    const sel = await app.query('SELECT id FROM auditoria WHERE id = $1', [id]);
    expect(sel.rowCount).toBe(1);
  });

  // La regex acepta es/en porque deploy.sh hace la MISMA verificación y postgres
  // puede emitir el mensaje en cualquiera de los dos según lc_messages.
  it('rechaza UPDATE con permission denied', async () => {
    await expect(
      app.query(`UPDATE auditoria SET accion = 'alterado'`),
    ).rejects.toThrow(/permission denied|permiso denegado/i);
  });

  it('rechaza DELETE con permission denied', async () => {
    await expect(app.query('DELETE FROM auditoria')).rejects.toThrow(
      /permission denied|permiso denegado/i,
    );
  });

  // El REVOKE de producción cubre UPDATE, DELETE y TRUNCATE (post-migrate.sql);
  // se verifican los tres para que quitar cualquiera del REVOKE salga en rojo.
  it('rechaza TRUNCATE con permission denied', async () => {
    await expect(app.query('TRUNCATE auditoria')).rejects.toThrow(
      /permission denied|permiso denegado/i,
    );
  });
});
