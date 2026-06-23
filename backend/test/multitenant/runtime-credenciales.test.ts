import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';

/**
 * (cred) El runtime de la app NUNCA porta credenciales del migrador (regla
 * NIVEL-HIERRO §0.bis.1/③). El cliente Prisma compartido (src/core/prisma) es el
 * MISMO que sirve toda la app; tras `setup-entorno` conecta con `databaseUrlApp`
 * (rol `gestorpro_app`, NOBYPASSRLS), igual que en producción. Si algún día el
 * runtime resolviera al rol migrador (BYPASSRLS), TODO el aislamiento RLS se
 * caería en silencio. Este test lo cierra: el usuario efectivo de la conexión NO
 * es el migrador y NO tiene BYPASSRLS.
 */
describe('Fase 8 (cred) — el runtime conecta como gestorpro_app, nunca como migrador', () => {
  it('current_user = gestorpro_app y NO tiene BYPASSRLS', async () => {
    const filas = await prisma.$queryRaw<
      Array<{ usuario: string; bypass: boolean }>
    >`SELECT current_user AS usuario,
             (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`;
    const { usuario, bypass } = filas[0]!;

    expect(usuario).not.toBe('gestorpro_migrador'); // jamás el rol que ignora RLS
    expect(usuario).toBe('gestorpro_app');
    expect(bypass).toBe(false); // NOBYPASSRLS: la app queda sujeta a las policies
  });
});
