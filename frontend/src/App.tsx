/**
 * Punto de entrada de la aplicación React.
 * Define el árbol de rutas y envuelve todo en el proveedor de sesión.
 */

import { createBrowserRouter, RouterProvider } from 'react-router';
import { ProveedorAuth } from './core/auth/ContextoAuth';
import { RutaProtegida } from './core/auth/RutaProtegida';
import { PantallaLogin } from './core/auth/PantallaLogin';
import { PantallaInicio } from './PantallaInicio';
import { PantallaCuentasPorPagar } from './finanzas/cuentas-por-pagar';
import { PantallaGastos } from './finanzas/gastos';
import { PantallaDashboard } from './finanzas/dashboard';
import { PantallaKiosco } from './asistencia/kiosco/PantallaKiosco';
import { PantallaRevision } from './asistencia/revision/PantallaRevision';

/**
 * Configuración del router.
 *
 * Árbol de rutas:
 *   /login                → Pantalla de login (pública)
 *   /kiosco               → Kiosco de fichaje (PÚBLICA — no requiere sesión)
 *   /                     → Guard → PantallaInicio (protegida)
 *   /cuentas-por-pagar    → Módulo de cuentas por pagar (protegida)
 *   /gastos               → Módulo de gastos (protegida)
 *   /dashboard            → Dashboard de ganancias (protegida)
 *   /asistencia/revision  → Cola de revisión de fichajes (protegida — supervisor/admin)
 */
const router = createBrowserRouter([
  {
    path: '/login',
    element: <PantallaLogin />,
  },
  {
    // Ruta pública del kiosco — fuera de RutaProtegida
    path: '/kiosco',
    element: <PantallaKiosco />,
  },
  {
    element: <RutaProtegida />,
    children: [
      {
        path: '/',
        element: <PantallaInicio />,
      },
      {
        path: '/cuentas-por-pagar',
        element: <PantallaCuentasPorPagar />,
      },
      {
        path: '/gastos',
        element: <PantallaGastos />,
      },
      {
        path: '/dashboard',
        element: <PantallaDashboard />,
      },
      // ── Asistencia (Fases 4-6) ──
      {
        path: '/asistencia/revision',
        element: <PantallaRevision />,
      },
    ],
  },
]);

export function App() {
  return (
    <ProveedorAuth>
      <RouterProvider router={router} />
    </ProveedorAuth>
  );
}
