import { test, expect } from '@playwright/test';
import { sonUrlsEscribibles, writesAllowed, urlsEscribibles, env } from '../helpers/env';

/**
 * Barrera de escritura (@smoke @readonly — sin navegador, puro): fija el contrato de
 * `sonUrlsEscribibles` y el invariante global. Corre en TODA corrida (dev y smoke de
 * producción): si alguien debilita la barrera, esto falla antes de que un @full pueda
 * escribir donde no debe.
 */

test.describe('@smoke @readonly — barrera de escritura fail-closed por URL', () => {
  test('hosts locales son escribibles; producción y desconocidos NO', () => {
    const sin: string[] = [];
    // Locales (dev): permitido.
    expect(sonUrlsEscribibles('http://localhost:5173', 'http://localhost:3000', sin)).toBe(true);
    expect(sonUrlsEscribibles('http://127.0.0.1:5173', 'http://127.0.0.1:3000', sin)).toBe(true);
    expect(sonUrlsEscribibles('http://app.localhost:5173', 'http://api.localhost:3000', sin)).toBe(true);
    // Producción real: bloqueado aunque E2E_MODE mienta.
    expect(sonUrlsEscribibles('https://app.gestorpro.us', 'https://api.gestorpro.us', sin)).toBe(false);
    // MEZCLA (front local, api remota o viceversa): bloqueado — ambas deben ser locales.
    expect(sonUrlsEscribibles('http://localhost:5173', 'https://api.gestorpro.us', sin)).toBe(false);
    expect(sonUrlsEscribibles('https://app.gestorpro.us', 'http://localhost:3000', sin)).toBe(false);
    // URL malformada: bloqueado (fail-closed), no lanzado.
    expect(sonUrlsEscribibles('no-es-una-url', 'http://localhost:3000', sin)).toBe(false);
    // Trampa de sufijo: "gestorpro.us.localhost" sí es local, "notlocalhost" no.
    expect(sonUrlsEscribibles('http://notlocalhost:5173', 'http://localhost:3000', sin)).toBe(false);
  });

  test('la allowlist E2E_WRITE_HOSTS habilita staging EXPLÍCITO y nada más', () => {
    const allowlist = ['staging.gestorpro.us', 'api-staging.gestorpro.us'];
    expect(
      sonUrlsEscribibles('https://staging.gestorpro.us', 'https://api-staging.gestorpro.us', allowlist),
    ).toBe(true);
    // Producción NO entra por la allowlist de staging.
    expect(
      sonUrlsEscribibles('https://app.gestorpro.us', 'https://api-staging.gestorpro.us', allowlist),
    ).toBe(false);
  });

  test('invariante de la corrida ACTUAL: URLs no escribibles ⇒ escritura bloqueada', () => {
    // Cualquiera que sea la combinación de flags de esta corrida, jamás puede darse
    // writesAllowed=true con URLs no escribibles. Detecta regresiones en env.ts.
    if (!urlsEscribibles) {
      expect(writesAllowed, `writesAllowed debe ser false con baseURL=${env.baseURL}`).toBe(false);
    }
    expect(true).toBe(true); // el test siempre ejecuta al menos una aserción
  });
});
