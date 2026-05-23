/**
 * Punto de entrada de la aplicación React.
 * Define el árbol de rutas y envuelve todo en el proveedor de sesión.
 */

import { createBrowserRouter, RouterProvider } from 'react-router';
import { ProveedorAuth } from './core/auth/ContextoAuth';
import { RutaProtegida } from './core/auth/RutaProtegida';
import { PantallaLogin } from './core/auth/PantallaLogin';
import { PantallaInicio } from './PantallaInicio';

/**
 * Configuración del router.
 *
 * Árbol de rutas:
 *   /login          → Pantalla de login (pública)
 *   /               → Guard → PantallaInicio (protegida)
 *
 * Las rutas de finanzas y asistencia se agregan aquí cuando estén listas
 * (Fases 1-6), anidadas bajo el elemento <RutaProtegida />.
 */
const router = createBrowserRouter([
  {
    path: '/login',
    element: <PantallaLogin />,
  },
  {
    element: <RutaProtegida />,
    children: [
      {
        path: '/',
        element: <PantallaInicio />,
      },
      // Aquí se agregarán las rutas de finanzas (Fases 1-3) y asistencia (Fases 4-6)
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
