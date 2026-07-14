/**
 * Punto de entrada de la aplicación React.
 * Define el árbol de rutas y envuelve todo en el proveedor de sesión.
 */

import { createBrowserRouter, RouterProvider } from 'react-router';
import { ProveedorIdioma } from './core/i18n/ContextoIdioma';
import { ProveedorAuth } from './core/auth/ContextoAuth';
import { RutaProtegida } from './core/auth/RutaProtegida';
import { RutaSoloPlataforma } from './core/auth/RutaSoloPlataforma';
import { RutaNegocio } from './core/auth/RutaNegocio';
import { PantallaLogin } from './core/auth/PantallaLogin';
import { PantallaInicio } from './PantallaInicio';
import { PantallaPlataforma } from './plataforma';
import {
  PantallaCuentasPorPagar,
  PantallaProveedores,
  PantallaPagos,
  PantallaEstadoCuenta,
} from './finanzas/cuentas-por-pagar';
import { PantallaSedes } from './administracion/sedes';
import { PantallaEmpleados } from './administracion/empleado';
import { PantallaKioscos } from './administracion/kioscos';
import { PantallaUsuarios } from './administracion/usuarios';
import { PantallaGastos, PantallaCategorias } from './finanzas/gastos';
import { PantallaAuditoria } from './finanzas/auditoria';
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
 *   /pagos                 → Historial de pagos a proveedor + corrección (protegida)
 *   /estado-cuenta         → Estado de cuenta de proveedor (imprimible / CSV) (protegida)
 *   /proveedores           → Gestión de proveedores (protegida)
 *   /gastos                → Módulo de gastos (protegida)
 *   /dashboard             → Dashboard de ganancias (protegida)
 *   /auditoria-financiera  → Centro de auditoría de correcciones (protegida — admin/supervisor)
 *   /sedes                 → Administración de sedes (protegida — admin para escribir)
 *   /empleados             → Administración de empleados (protegida — admin para escribir)
 *   /usuarios              → Gestión de usuarios del tenant (protegida — solo admin, lo refuerza el backend)
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
      // ── Negocio (tenant): el super-admin NO entra aquí (B4) → RutaNegocio lo
      //    redirige a /plataforma. El usuario normal opera con normalidad. ──
      {
        element: <RutaNegocio />,
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
            path: '/pagos',
            element: <PantallaPagos />,
          },
          {
            path: '/estado-cuenta',
            element: <PantallaEstadoCuenta />,
          },
          {
            path: '/gastos',
            element: <PantallaGastos />,
          },
          {
            path: '/categorias-gasto',
            element: <PantallaCategorias />,
          },
          {
            path: '/dashboard',
            element: <PantallaDashboard />,
          },
          {
            path: '/auditoria-financiera',
            element: <PantallaAuditoria />,
          },
          // ── Administración ──
          {
            path: '/sedes',
            element: <PantallaSedes />,
          },
          {
            path: '/empleados',
            element: <PantallaEmpleados />,
          },
          {
            path: '/kioscos',
            element: <PantallaKioscos />,
          },
          {
            path: '/usuarios',
            element: <PantallaUsuarios />,
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
      // ── Plataforma (solo super-admin; el backend lo refuerza con soloPlataforma) ──
      {
        element: <RutaSoloPlataforma />,
        children: [
          {
            path: '/plataforma',
            element: <PantallaPlataforma />,
          },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <ProveedorIdioma>
      <ProveedorAuth>
        <RouterProvider router={router} />
      </ProveedorAuth>
    </ProveedorIdioma>
  );
}
