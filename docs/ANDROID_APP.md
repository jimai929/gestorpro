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

## Próximos pasos (Fase 2+ — release / Play Store)

- Instalar Android Studio + SDK; construir y probar el APK debug en equipo real.
- Añadir `https://localhost` (u origen del WebView) a `CORS_ORIGEN` del VPS, o migrar las
  llamadas a `@capacitor/http` (nativo, sin CORS).
- Generar iconos + splash (`npx @capacitor/assets generate`).
- Crear keystore, firmar **release**, generar **AAB** (`gradlew bundleRelease`).
- Configurar ficha de Google Play (permisos, política de privacidad, screenshots).
- CI opcional para builds firmados.
