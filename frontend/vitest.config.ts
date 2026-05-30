import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Config de tests del frontend (componentes con React Testing Library + jsdom).
// Separada de vite.config.ts para no mezclar la config del bundler con la de tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
