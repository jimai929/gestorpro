/**
 * Punto de entrada de la aplicación React.
 * Define el árbol de rutas y envuelve todo en el proveedor de sesión.
 */

import { createBrowserRouter, RouterProvider } from 'react-router';
import { ProveedorAuth } from './core/auth/ContextoAuth';
import { RutaProtegida } from './core/auth/RutaProtegida';
import { PantallaLogin } from './core/auth/PantallaLogin';
import { PantallaInicio } from './PantallaInicio';
import { PantallaCuentasPorPagar, PantallaProveedores } from './finanzas/cuentas-por-pagar';
import { PantallaSedes } from './administracion/sedes';
import { PantallaGastos } from './finanzas/gastos';
import { PantallaDashboard } from './finanzas/dashboard';
import { PantallaKiosco } from './asistencia/kiosco/PantallaKiosco';
import { PantallaRevision } from './asistencia/revision/PantallaRevision';
import { PantallaJornadas } from './asistencia/jornada/PantallaJornadas';
import { PantallaCobros } from './asistencia/cobro/PantallaCobros';

/**
 * Configuración del router.
 *
 * Árbol de rutas:
 *   /login                 → Pantalla de login (pública)
 *   /kiosco                → Kiosco de fichaje (PÚBLICA — no requiere sesión)
 *   /                      → Guard → PantallaInicio (protegida)
 *   /cuentas-por-pagar     → Módulo de cuentas por pagar (protegida)
 *   /proveedores           → Gestión de proveedores (protegida)
 *   /gastos                → Módulo de gastos (protegida)
 *   /dashboard             → Dashboard de ganancias (protegida)
 *   /sedes                 → Administración de sedes (protegida — admin para escribir)
 *   /asistencia/revision   → Cola de revisión de fichajes (protegida — supervisor/admin)
 *   /asistencia/jornadas   → Consulta y corrección de jornadas (protegida — supervisor/admin)
 *   /asistencia/cobros     → Cobro anticipado de horas extra (protegida)
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
        path: '/proveedores',
        element: <PantallaProveedores />,
      },
      {
        path: '/gastos',
        element: <PantallaGastos />,
      },
      {
        path: '/dashboard',
        element: <PantallaDashboard />,
      },
      // ── Administración ──
      {
        path: '/sedes',
        element: <PantallaSedes />,
      },
      // ── Asistencia (Fases 4-6) ──
      {
        path: '/asistencia/revision',
        element: <PantallaRevision />,
      },
      {
        path: '/asistencia/jornadas',
        element: <PantallaJornadas />,
      },
      {
        path: '/asistencia/cobros',
        element: <PantallaCobros />,
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
