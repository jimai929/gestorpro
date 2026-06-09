import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioEmpleado } from './FormularioEmpleado';
import * as servicioSedes from '../sedes/servicioSedes';
import * as servicioEmpleados from './servicioEmpleados';
import type { Sede } from '../sedes/tipos';
import type { Empleado, RolOperativo } from './tipos';

vi.mock('../sedes/servicioSedes');
vi.mock('./servicioEmpleados');

const sedeA: Sede = {
  id: 'sa',
  nombre: 'Sede A',
  activo: true,
  modoExcepcion: 'pin',
  creadoEn: '2026-01-01',
};
const rolCajera: RolOperativo = { id: 'rc', clave: 'cajera', nombre: 'Cajera', activo: true };

beforeEach(() => {
  vi.mocked(servicioSedes.obtenerSedes).mockResolvedValue([sedeA]);
  vi.mocked(servicioEmpleados.obtenerRolesOperativos).mockResolvedValue([rolCajera]);
});

/** Rellena número, nombre, sede, salario y PIN: deja el alta "completa" salvo por los roles. */
async function rellenarCamposObligatorios(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/número/i), 'E099');
  await user.type(screen.getByLabelText(/nombre/i), 'Nuevo Empleado');
  await user.selectOptions(screen.getByRole('combobox'), 'sa'); // único select: Sede
  await user.type(screen.getByLabelText(/salario/i), '1000');
  await user.type(screen.getByLabelText(/pin/i), '1357');
}

describe('FormularioEmpleado — gating del alta cuando los roles no cargan (H1)', () => {
  it('con los roles caídos, "Crear empleado" queda deshabilitado aunque el resto esté completo; al reintentar se habilita', async () => {
    // El catálogo de roles falla en la primera carga (el reintento usa el mock por defecto, que resuelve).
    vi.mocked(servicioEmpleados.obtenerRolesOperativos).mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<FormularioEmpleado onGuardado={vi.fn()} onCancelar={vi.fn()} />);

    await screen.findByRole('option', { name: 'Sede A' }); // sedes sí cargaron
    await screen.findByText(/no se pudieron cargar los roles/i); // errorRoles activo

    await rellenarCamposObligatorios(user);

    const crear = screen.getByRole('button', { name: /crear empleado/i }) as HTMLButtonElement;
    // Todo lo demás está completo: lo único que lo bloquea es que la lista de roles falló.
    expect(crear.disabled).toBe(true);

    // Reintentar: la segunda carga de roles resuelve y desaparece el bloqueo.
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    await screen.findByText('Cajera'); // checkbox del rol ya renderizado

    expect(crear.disabled).toBe(false);
  });
});

describe('FormularioEmpleado — edición NO se bloquea por errorRoles (N1)', () => {
  it('en EDICIÓN, si el catálogo de roles falla, "Guardar cambios" sigue habilitado (los roles ya vienen precargados)', async () => {
    // En edición los roles ya vienen del empleado y editarEmpleado los reenvía intactos; editar
    // salario/sede no depende del catálogo, así que errorRoles NO debe bloquear (solo gatea el alta).
    vi.mocked(servicioEmpleados.obtenerRolesOperativos).mockRejectedValueOnce(new Error('boom'));
    const empleado: Empleado = {
      id: 'e1',
      numero: 'E001',
      nombre: 'María Pérez',
      sedeId: 'sa',
      salarioFijo: 1000,
      turnoId: null,
      activo: true,
      tieneFoto: false,
      roles: [{ id: 'rc', clave: 'cajera', nombre: 'Cajera' }],
    };
    render(<FormularioEmpleado empleado={empleado} onGuardado={vi.fn()} onCancelar={vi.fn()} />);

    await screen.findByText(/no se pudieron cargar los roles/i); // errorRoles activo

    const guardar = screen.getByRole('button', { name: /guardar cambios/i }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(false);
  });
});
