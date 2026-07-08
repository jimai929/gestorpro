import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gestorpro.app',
  appName: 'GestorPro',
  webDir: 'dist',
  plugins: {
    // Enruta fetch/XHR por HTTP NATIVO en Android/iOS, evitando el CORS del WebView
    // (origen https://localhost) al llamar al API de producción por URL absoluta.
    // Solo afecta a plataformas nativas: el build de navegador usa fetch normal. La app
    // autentica por header (Bearer) + body, sin cookies, así que no depende del manejo
    // de cookies del WebView. No se toca server/hostname ni CORS del backend.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
