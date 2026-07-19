import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Configuración plana de ESLint (D3): la que `npm run lint` («eslint .») asumía
// y no existía. Mismo perfil que el scaffold de Vite react-ts.
export default tseslint.config(
  // `android` es el proyecto nativo generado por Capacitor (incluye la salida de
  // build de Gradle con bundles JS propios y sus eslint-disable): no es código
  // fuente que este lint deba revisar.
  { ignores: ['dist', 'android'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Reglas CLÁSICAS de react-hooks, no el preset recommended de v7: sus reglas
      // nuevas de la era del React Compiler (set-state-in-effect, etc.) condenan el
      // patrón establecido del proyecto (cargar datos en useEffect con setState en
      // callbacks), que es decisión cerrada. Revisar si algún día se adopta el Compiler.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
