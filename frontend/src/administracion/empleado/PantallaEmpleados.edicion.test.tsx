/**
 * Regresión del formulario de EDICIÓN con el FormularioEmpleado REAL (el archivo
 * hermano PantallaEmpleados.test.tsx lo mockea entero, así que no puede cubrir
 * esto): sin `key`, pasar de Editar A a Editar B reutilizaba la instancia y los
 * campos conservaban los datos de A; Guardar los habría escrito sobre B.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaEmpleados } from './PantallaEmpleados';
import * as servicioSedes from '../sedes/servicioSedes';
import * as servicioEmpleados from './servicioEmpleados';
import type { Empleado } from './tipos';
import type { Sede } from '../sedes/tipos';

vi.mock('../sedes/servicioSedes');
vi.mock('./servicioEmpleados');
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: { rol: 'administrador', empresaId: 'e1' } }),
}));

const sedeA: Sede = {
  id: 'sa', nombre: 'Sede A', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01',
};
const maria: Empleado = {
  id: 'e1', numero: 'E001', nombre: 'María Pérez', sedeId: 'sa', salarioFijo: 1000,
  turnoId: null, activo: true, tieneFoto: false, roles: [],
};
const pedro: Empleado = {
  id: 'e2', numero: 'E002', nombre: 'Pedro Gómez', sedeId: 'sa', salarioFijo: 800,
  turnoId: null, activo: true, tieneFoto: false, roles: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(servicioSedes.obtenerSedes).mockResolvedValue([sedeA]);
  vi.mocked(servicioEmpleados.obtenerEmpleados).mockResolvedValue([maria, pedro]);
  vi.mocked(servicioEmpleados.obtenerRolesOperativos).mockResolvedValue([]);
});

describe('PantallaEmpleados — cambiar de empleado en edición remonta el formulario', () => {
  it('Editar María y luego Editar Pedro muestra los datos de Pedro (no los de María)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PantallaEmpleados />
      </MemoryRouter>,
    );
    await screen.findByText('María Pérez');

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    expect(await screen.findByDisplayValue('María Pérez')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[1]);
    expect(await screen.findByDisplayValue('Pedro Gómez')).toBeTruthy();
    expect(screen.queryByDisplayValue('María Pérez')).toBeNull();
    expect(screen.queryByDisplayValue('E001')).toBeNull(); // ni el número de María
  });
});
