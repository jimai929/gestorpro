import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaCobros } from './PantallaCobros';
import * as servicio from './servicioCobro';
import type { EmpleadoResumido } from './tipos';

vi.mock('./servicioCobro');
// LayoutPrincipal real usa useAuth/router; passthrough para aislar la pantalla.
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
// useAuth controlable: admin para que se rendericen todas las secciones.
const usuarioMock = vi.hoisted(() => ({
  actual: { rol: 'administrador', empresaId: 'e1' } as { rol: string; empresaId: string | null },
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: usuarioMock.actual }),
}));

const empleado: EmpleadoResumido = { id: 'emp1', numero: 'E1', nombre: 'Juan Pérez', sedeId: 's1' };

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.actual = { rol: 'administrador', empresaId: 'e1' };
  // Defaults "todo sano"; cada test degrada solo lo que quiere probar.
  vi.mocked(servicio.obtenerEmpleados).mockResolvedValue([empleado]);
  vi.mocked(servicio.obtenerCobros).mockResolvedValue([]);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaCobros />
    </MemoryRouter>,
  );
}

describe('PantallaCobros — carga de empleados con fallo visible (antes se tragaba)', () => {
  it('si la carga inicial falla, muestra un error visible y un botón Reintentar (no lo traga)', async () => {
    // Rechazo NO-Error → se usa el texto i18n de respaldo (verifica la clave nueva).
    vi.mocked(servicio.obtenerEmpleados).mockRejectedValue('caída sin Error');
    montar();

    expect(await screen.findByText('Error al cargar los empleados.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    // El selector NO contiene al empleado.
    expect(screen.queryByText('E1 — Juan Pérez')).toBeNull();
  });

  it('si el error trae mensaje, se muestra el mensaje real del backend', async () => {
    vi.mocked(servicio.obtenerEmpleados).mockRejectedValue(new Error('Backend 500'));
    montar();
    expect(await screen.findByText('Backend 500')).toBeTruthy();
  });

  it('el botón Reintentar vuelve a llamar a obtenerEmpleados', async () => {
    vi.mocked(servicio.obtenerEmpleados).mockRejectedValueOnce(new Error('caída'));
    const user = userEvent.setup();
    montar();

    await screen.findByText('caída');
    expect(servicio.obtenerEmpleados).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(servicio.obtenerEmpleados).toHaveBeenCalledTimes(2));
  });

  it('tras un reintento exitoso, el error desaparece y aparece el empleado', async () => {
    // 1ª llamada falla; la 2ª cae al default resuelto del beforeEach.
    vi.mocked(servicio.obtenerEmpleados).mockRejectedValueOnce(new Error('caída'));
    const user = userEvent.setup();
    montar();

    await screen.findByText('caída');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('E1 — Juan Pérez')).toBeTruthy(); // empleado recuperado
    expect(screen.queryByText('caída')).toBeNull(); // error limpiado
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it('el fallo de empleados NO afecta a cobros ni dispara saldo/solicitud', async () => {
    vi.mocked(servicio.obtenerEmpleados).mockRejectedValue(new Error('caída'));
    montar();

    await screen.findByText('caída'); // error de empleados visible…
    // …pero la sección de cobros se cargó de forma independiente y muestra su estado.
    await waitFor(() => expect(servicio.obtenerCobros).toHaveBeenCalled());
    expect(await screen.findByText('No hay solicitudes.')).toBeTruthy();
    expect(screen.queryByText('Error al cargar las solicitudes.')).toBeNull();
    // Sin empleado seleccionable, el flujo de solicitud/saldo no se dispara.
    expect(screen.queryByText('Solicitar adelanto')).toBeNull();
    expect(servicio.obtenerSaldo).not.toHaveBeenCalled();
  });
});
