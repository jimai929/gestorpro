import { describe, it, expect } from 'vitest';
import { traducciones, IDIOMAS } from './idiomas';

/**
 * Red de seguridad del i18n: las tres lenguas deben exponer EXACTAMENTE el mismo
 * conjunto de claves. Si se añade una clave a `es` y se olvida en `en`/`zh` (o al
 * revés), este test falla — la UI no caería al texto correcto en ese idioma.
 */
describe('i18n — paridad de claves entre idiomas', () => {
  const idiomas = ['es', 'en', 'zh'] as const;
  const clavesPorIdioma = Object.fromEntries(
    idiomas.map((i) => [i, Object.keys(traducciones[i]).sort()]),
  ) as Record<(typeof idiomas)[number], string[]>;

  it('en tiene exactamente las mismas claves que es', () => {
    expect(clavesPorIdioma.en).toEqual(clavesPorIdioma.es);
  });

  it('zh tiene exactamente las mismas claves que es', () => {
    expect(clavesPorIdioma.zh).toEqual(clavesPorIdioma.es);
  });

  it('ningún valor de traducción está vacío', () => {
    for (const idioma of idiomas) {
      for (const [clave, valor] of Object.entries(traducciones[idioma])) {
        expect(valor.trim(), `Traducción vacía: ${idioma} → ${clave}`).not.toBe('');
      }
    }
  });

  it('el catálogo IDIOMAS coincide con las lenguas del diccionario', () => {
    expect(IDIOMAS.map((i) => i.codigo).sort()).toEqual([...idiomas].sort());
  });
});
