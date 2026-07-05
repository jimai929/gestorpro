import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import pg from 'pg';

const { Client } = pg;

/**
 * `auditoria_plataforma` — bitácora APPEND-ONLY de operaciones de plataforma, a NIVEL
 * DE ROL de Postgres (igual que `auditoria`, pero SIN RLS: es tabla de plataforma).
 *
 * La garantía real en producción es que `gestorpro_app` (no dueño) tiene REVOCADOS
 * UPDATE/DELETE/TRUNCATE (post-migrate.sql). Los demás tests conectan con el rol owner
 * del contenedor (superusuario), que IGNORA esos REVOKE; aquí se usa el rol restringido
 * que crea `global-setup` replicando el contrato, para que romper el REVOKE salga rojo.
 *
 * A diferencia de `auditoria`, esta tabla NO exige contexto de tenant (está en la
 * allowlist de RLS): el rol app inserta y lee sin fijar `app.empresa_id`.
 */
describe('auditoria_plataforma — append-only a nivel de rol (gestorpro_app)', () => {
  let app: pg.Client;

  beforeAll(async () => {
    app = new Client({ connectionString: inject('databaseUrlApp') });
    await app.connect();
  });

  afterAll(async () => {
    await app.end();
  });

  // Deja una fila INMUTABLE en la base compartida (por el propio append-only no se
  // puede borrar). Inocua: los demás tests filtran por empresaAfectadaId/accion; esta
  // fila usa empresa_afectada_id NULL y una accion propia, sin colisión.
  it('permite INSERT y SELECT sin contexto de tenant; empresa_afectada_id puede ser NULL', async () => {
    const insert = await app.query(
      `INSERT INTO auditoria_plataforma (id, actor_usuario_id, empresa_afectada_id, accion, detalle)
       VALUES (gen_random_uuid(), gen_random_uuid(), NULL, $1, $2::jsonb)
       RETURNING id`,
      ['PruebaAppendOnlyPlataforma', JSON.stringify({ prueba: true })],
    );
    expect(insert.rowCount).toBe(1);
    const id = insert.rows[0].id as string;

    const sel = await app.query(
      'SELECT id, empresa_afectada_id FROM auditoria_plataforma WHERE id = $1',
      [id],
    );
    expect(sel.rowCount).toBe(1);
    expect(sel.rows[0].empresa_afectada_id).toBeNull(); // acción de plataforma sin empresa
  });

  // La regex acepta es/en porque deploy.sh puede emitir el mensaje en cualquiera de
  // los dos según lc_messages (mismo criterio que el test de auditoria).
  it('rechaza UPDATE con permission denied', async () => {
    await expect(
      app.query(`UPDATE auditoria_plataforma SET accion = 'alterado'`),
    ).rejects.toThrow(/permission denied|permiso denegado/i);
  });

  it('rechaza DELETE con permission denied', async () => {
    await expect(app.query('DELETE FROM auditoria_plataforma')).rejects.toThrow(
      /permission denied|permiso denegado/i,
    );
  });

  it('rechaza TRUNCATE con permission denied', async () => {
    await expect(app.query('TRUNCATE auditoria_plataforma')).rejects.toThrow(
      /permission denied|permiso denegado/i,
    );
  });
});
