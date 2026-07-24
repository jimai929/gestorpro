/**
 * Genera los PNG fuente para @capacitor/assets (iconos + splash de Android)
 * renderizando con Chromium (Playwright): tipografía y colores EXACTOS del
 * sistema de diseño (docs/DESIGN_SYSTEM.md, tema Grafito cálido):
 *   - primario ámbar  #D9954F   (--color-primary dark)
 *   - texto sobre él  #151413   (--on-primary dark)
 *   - fondo grafito   #1A1917   (--color-bg dark)
 *
 * Salidas en frontend/assets/ (fuentes de @capacitor/assets):
 *   icon-only.png        1024×1024  (ámbar redondeado + GP)
 *   icon-foreground.png  1024×1024  (GP transparente, contenido en zona segura ~55%)
 *   icon-background.png  1024×1024  (ámbar sólido)
 *   splash.png           2732×2732  (grafito + insignia GP centrada)
 *   splash-dark.png      2732×2732  (idéntico: la app es siempre oscura)
 *
 * Uso: node scripts/generar-assets-android.mjs   (luego: npx capacitor-assets generate --android)
 */

import { chromium } from '@playwright/test';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const SALIDA = join(process.cwd(), 'assets');
mkdirSync(SALIDA, { recursive: true });

const AMBAR = '#D9954F';
const TINTA = '#151413';
const GRAFITO = '#1A1917';
const FUENTE = `-apple-system, 'Segoe UI', Roboto, sans-serif`;

/** Insignia GP: cuadrado redondeado ámbar con las letras en tinta. */
function insignia(lado, radio, fuentePx) {
  return `<div style="width:${lado}px;height:${lado}px;background:${AMBAR};border-radius:${radio}px;
    display:flex;align-items:center;justify-content:center;">
    <span style="font-family:${FUENTE};font-weight:800;font-size:${fuentePx}px;color:${TINTA};
      letter-spacing:-0.02em;">GP</span></div>`;
}

const LIENZOS = [
  {
    archivo: 'icon-only.png', lado: 1024, transparente: false,
    html: insignia(1024, 240, 460),
  },
  {
    // Foreground adaptativo: el launcher recorta ~66% central → contenido chico.
    archivo: 'icon-foreground.png', lado: 1024, transparente: true,
    html: `<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center;">
      <span style="font-family:${FUENTE};font-weight:800;font-size:400px;color:${TINTA};
        letter-spacing:-0.02em;">GP</span></div>`,
  },
  {
    archivo: 'icon-background.png', lado: 1024, transparente: false,
    html: `<div style="width:1024px;height:1024px;background:${AMBAR};"></div>`,
  },
  {
    archivo: 'splash.png', lado: 2732, transparente: false,
    html: `<div style="width:2732px;height:2732px;background:${GRAFITO};
      display:flex;align-items:center;justify-content:center;">${insignia(560, 132, 252)}</div>`,
  },
];

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
for (const { archivo, lado, transparente, html } of LIENZOS) {
  await pagina.setViewportSize({ width: lado, height: lado });
  await pagina.setContent(
    `<style>html,body{margin:0;padding:0;${transparente ? 'background:transparent;' : ''}}</style>${html}`,
  );
  await pagina.screenshot({
    path: join(SALIDA, archivo),
    omitBackground: transparente,
  });
  console.log('generado:', archivo);
}
await navegador.close();

// La app es SIEMPRE oscura: el splash oscuro es el mismo.
copyFileSync(join(SALIDA, 'splash.png'), join(SALIDA, 'splash-dark.png'));
console.log('generado: splash-dark.png (copia)');
