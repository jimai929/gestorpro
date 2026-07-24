# GestorPro — App Android (Capacitor)

Empaquetado de la app Android de GestorPro. **Fase 1: solo debug / prueba en equipo
propio.** No es release, no está firmada para Play Store, no toca el backend ni el VPS.

## Ruta técnica

**React + Vite (frontend existente) + Capacitor Android.** NO es React Native: se
reutiliza tal cual el frontend web. Capacitor empaqueta el web bundle DENTRO del APK
(assets locales) y la app llama al **API de producción por URL absoluta**.

- `appName`: **GestorPro**
- `appId`: **com.gestorpro.app**
- `webDir`: **dist** (salida de Vite)
- Config: `frontend/capacitor.config.ts`
- Capacitor: `@capacitor/core` + `@capacitor/cli` + `@capacitor/android` (v8.x)

## Configuración del API URL

El frontend usa `import.meta.env.VITE_API_URL` (URL **absoluta**; default local
`http://localhost:3000`). En la app Android no sirve `localhost`, así que el build de
Android inyecta la URL de **producción**.

- Modo de build de Android: `vite build --mode android` → carga `frontend/.env.android`.
- `frontend/.env.android` (gitignored — recréalo con esta plantilla; **no es secreto**,
  es la URL pública del backend):

  ```
  VITE_API_URL=https://api.gestorpro.us
  ```

- El backend de producción vive en **`api.gestorpro.us`** (subdominio propio, no
  `app.gestorpro.us/api`).
- El build de **navegador** (`npm run build`) NO se afecta: usa su propia config.

## Comandos

Desde `frontend/`:

```bash
# 1. (una vez) crear .env.android con la URL de prod (ver arriba)
# 2. build del web con la URL de prod + sync al proyecto nativo:
npm run cap:sync            # = build:android + npx cap sync android
#   equivale a:
#   npm run build:android    # tsc -b && vite build --mode android
#   npx cap sync android

# add del proyecto nativo (ya hecho; solo si no existe android/):
npx cap add android

# abrir en Android Studio:
npx cap open android
```

## Build del APK debug

**Requiere JDK 21 y Android SDK (vía Android Studio).** Capacitor 8 compila con Java 21;
un JDK 17 falla con `invalid source release: 21`. En Windows, se recomienda usar el JBR
incluido con Android Studio como JAVA_HOME (`C:\Program Files\Android\Android Studio\jbr`,
que es JDK 21). Con el toolchain instalado:

```bash
cd frontend/android
./gradlew assembleDebug          # Linux/Mac
gradlew.bat assembleDebug        # Windows
```

APK resultante:

```
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

## Instalación en equipo real (debug)

Con `adb` disponible y el teléfono conectado (depuración USB activada):

```bash
adb devices
adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

## Estado actual (Fase 1)

- ✅ Capacitor instalado; `capacitor.config.ts` creado (GestorPro / com.gestorpro.app / dist).
- ✅ `android/` generado; web bundle con URL de prod embebido en
  `android/app/src/main/assets/public`.
- ✅ `npm run build` (navegador) y `npm test` intactos (135/135).
- ✅ **APK debug construido** (`app-debug.apk`, ~4.13 MB) con el toolchain instalado:
  Android Studio 2026.1 (JBR = JDK 21), Android SDK 36, Gradle 8.14.3. `minSdk=26`,
  `target/compile=36` (solo Android moderno).

## Limitaciones conocidas / pendientes

1. **CORS (BLOQUEANTE para que la app hable con prod).** El WebView de Capacitor Android
   tiene origen `https://localhost`. El backend permite orígenes según `CORS_ORIGEN`
   (`backend/src/app.ts`), que en el VPS apunta a `app.gestorpro.us`. **Hasta que
   `CORS_ORIGEN` del VPS incluya `https://localhost`, las llamadas al API desde la app
   fallarán por CORS.** Es un cambio de env del VPS (fuera del alcance de esta fase; no se
   tocó backend/deploy). Alternativa sin tocar CORS: usar plugin HTTP nativo de Capacitor
   (`@capacitor/http`/community) para evitar el chequeo CORS del WebView.
2. **JDK 21 obligatorio**: Capacitor 8 compila con Java 21 (un JDK 17 falla con `invalid
   source release: 21`). En Windows, usar el JBR de Android Studio como JAVA_HOME.
3. **Sin iconos/splash propios** todavía (solo `public/icono.svg`). Falta generar iconos
   Android (`@capacitor/assets`) y splash.
4. **Solo debug**: sin keystore/firma release ni AAB.
5. **Vulnerabilidades npm**: `npm install` reportó 3 (1 low, 2 high) de dependencias
   transitivas de Capacitor; no se corrieron `audit fix` (podría alterar el lockfile).
   Revisar con `npm audit` antes de release.

## Fase 2 — Firma de release (HECHA 2026-07-23)

- **Keystore de upload**: `C:\Users\jimfe\claves-android\gestorpro-upload.keystore`
  (RSA 4096, alias `gestorpro-upload`, validez 10 000 días, DN CN=GestorPro/C=PA).
  La contraseña vive SOLO en `C:\Users\jimfe\claves-android\gestorpro-keystore-pass.txt`
  y en `frontend/android/keystore.properties` (ambos FUERA de git; el segundo está
  gitignored junto con `*.keystore`/`*.jks`). **NUNCA commitear ni pegar en un chat.**
- **⚠ RESPALDAR el keystore + contraseña** (gestor de contraseñas / USB / offsite
  cifrado, misma práctica que PAS.txt): perderlo = no poder actualizar la app firmada.
  Recomendado: al primer subir a Play, inscribirse en **Play App Signing** (Google
  custodia la clave de firma; esta pasa a ser solo la de upload, reseteable).
- **Gradle**: `app/build.gradle` lee `android/keystore.properties` si existe
  (storeFile/storePassword/keyAlias/keyPassword); sin el archivo, release queda sin
  firmar (no rompe assembleDebug ni CI). Plantilla:

  ```properties
  storeFile=C:/Users/jimfe/claves-android/gestorpro-upload.keystore
  storePassword=...
  keyAlias=gestorpro-upload
  keyPassword=...
  ```

- **Builds** (desde `frontend/android`, con JAVA_HOME = JBR):

  ```bash
  gradlew.bat bundleRelease     # AAB → app/build/outputs/bundle/release/app-release.aab
  gradlew.bat assembleRelease   # APK release firmado (sideload) → outputs/apk/release/
  ```

  Verificados: `apksigner verify` (V2, cert CN=GestorPro) y `jarsigner -verify` (AAB)
  el 2026-07-23. AAB 3.26 MB, APK release 3.4 MB.
- `versionCode`/`versionName` en `app/build.gradle` (hoy 1 / "1.0"): **subir
  `versionCode` en cada upload a Play**.

## Fase 3 — Iconos y splash propios (HECHA 2026-07-23)

- Identidad: insignia **GP** con la paleta Grafito cálido del sistema de diseño
  (ámbar `#D9954F` + tinta `#151413`; splash sobre grafito `#1A1917`). El favicon
  `public/icono.svg` también se migró (usaba el azul legado `#1a56db`).
- Fuentes en `frontend/assets/` (icon-only / icon-foreground / icon-background /
  splash / splash-dark), generadas por `scripts/generar-assets-android.mjs`
  (renderiza con Chromium de Playwright — tipografía y colores exactos, sin
  depender de librsvg). Regenerar: `node scripts/generar-assets-android.mjs`.
- Recursos Android: `npx capacitor-assets generate --android` (74 archivos en
  `android/app/src/main/res/`: mipmaps adaptativos + splash port/land, claro y
  oscuro — idénticos: la app es siempre oscura). `@capacitor/assets` quedó como
  devDependency.
- AAB/APK regenerados y verificados con los iconos nuevos (2026-07-23).

## Próximos pasos (Play Store)

- Ficha de Google Play (permisos, política de privacidad, screenshots) + Play App Signing.
- `npm audit` antes del primer release público (avisos transitivos conocidos).
- CI opcional para builds firmados.
