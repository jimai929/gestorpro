import { describe, it, expect } from 'vitest';
import {
  demoHabilitado,
  resolverPasswordAdmin,
  PASSWORD_ADMIN_DEV,
  resolverPasswordSuperAdmin,
  PASSWORD_SUPER_ADMIN_DEV,
} from '../prisma/seed-opciones.js';

// Funciones puras: no tocan la base ni process.env (reciben el entorno).

describe('seed-opciones — gate de datos demo', () => {
  it('SEED_DEMO explícito manda sobre el NODE_ENV', () => {
    expect(demoHabilitado({ SEED_DEMO: 'true', NODE_ENV: 'production' })).toBe(true);
    expect(demoHabilitado({ SEED_DEMO: 'false', NODE_ENV: 'development' })).toBe(false);
  });

  it('sin SEED_DEMO se infiere del entorno: sí en dev, NO en producción', () => {
    expect(demoHabilitado({ NODE_ENV: 'production' })).toBe(false);
    expect(demoHabilitado({ NODE_ENV: 'development' })).toBe(true);
    expect(demoHabilitado({})).toBe(true); // sin NODE_ENV = desarrollo
  });

  it('SEED_DEMO solo cuenta como activado con el literal "true"', () => {
    expect(demoHabilitado({ SEED_DEMO: '1' })).toBe(false);
    expect(demoHabilitado({ SEED_DEMO: 'TRUE' })).toBe(false);
  });
});

describe('seed-opciones — contraseña del admin inicial', () => {
  it('usa ADMIN_PASSWORD si está definida (en cualquier modo)', () => {
    expect(resolverPasswordAdmin({ ADMIN_PASSWORD: 'Secreto-Fuerte-1' }, false)).toBe('Secreto-Fuerte-1');
    expect(resolverPasswordAdmin({ ADMIN_PASSWORD: 'Secreto-Fuerte-1' }, true)).toBe('Secreto-Fuerte-1');
  });

  it('en dev/demo sin ADMIN_PASSWORD cae a la contraseña por defecto', () => {
    expect(resolverPasswordAdmin({}, true)).toBe(PASSWORD_ADMIN_DEV);
  });

  it('en producción sin ADMIN_PASSWORD lanza (no usa un default débil)', () => {
    expect(() => resolverPasswordAdmin({}, false)).toThrow(/ADMIN_PASSWORD/);
  });
});

describe('seed-opciones — contraseña del super-admin de plataforma (4c.7)', () => {
  it('usa SUPER_ADMIN_PASSWORD si está definida (en cualquier modo)', () => {
    expect(resolverPasswordSuperAdmin({ SUPER_ADMIN_PASSWORD: 'Otra-Fuerte-9' }, false)).toBe('Otra-Fuerte-9');
    expect(resolverPasswordSuperAdmin({ SUPER_ADMIN_PASSWORD: 'Otra-Fuerte-9' }, true)).toBe('Otra-Fuerte-9');
  });

  it('en dev/demo sin SUPER_ADMIN_PASSWORD cae a la contraseña por defecto', () => {
    expect(resolverPasswordSuperAdmin({}, true)).toBe(PASSWORD_SUPER_ADMIN_DEV);
  });

  it('en producción sin SUPER_ADMIN_PASSWORD lanza (no usa un default débil)', () => {
    expect(() => resolverPasswordSuperAdmin({}, false)).toThrow(/SUPER_ADMIN_PASSWORD/);
  });
});
