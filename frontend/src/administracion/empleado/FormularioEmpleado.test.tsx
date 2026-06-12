import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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
  // Limpia el historial de llamadas entre tests: los asserts sobre mock.calls[0] no
  // deben depender del orden de los casos del archivo (la config del proyecto no activa clearMocks).
  vi.clearAllMocks();
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
    // En edición editar salario/sede no depende del catálogo de roles, así que errorRoles NO debe
    // bloquear (solo gatea el alta); al guardar con errorRoles se omite rolesOperativos (ver caso N4).
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

describe('FormularioEmpleado — edición con roles caídos omite rolesOperativos (N4)', () => {
  it('en EDICIÓN, si el catálogo de roles falla, al guardar NO se envía rolesOperativos (el backend conserva los actuales)', async () => {
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
    vi.mocked(servicioEmpleados.editarEmpleado).mockResolvedValue(empleado);
    const onGuardado = vi.fn();
    const user = userEvent.setup();
    render(<FormularioEmpleado empleado={empleado} onGuardado={onGuardado} onCancelar={vi.fn()} />);

    await screen.findByText(/no se pudieron cargar los roles/i); // errorRoles activo

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled()); // el guardado completó

    // editarEmpleado se llamó SIN rolesOperativos (campo omitido → el backend conserva los actuales).
    // Si la rama de edición siguiera enviando rolesOperativos: rolesIds, este assert fallaría.
    const [, body] = vi.mocked(servicioEmpleados.editarEmpleado).mock.calls[0]!;
    // Ancla positiva: con errorRoles se omite SOLO rolesOperativos, el resto del body va
    // íntegro (distingue "campo omitido adrede" de "body vaciado por una regresión").
    expect(body).toMatchObject({ numero: 'E001', nombre: 'María Pérez', sedeId: 'sa', salarioFijo: 1000 });
    expect(body.rolesOperativos).toBeUndefined();
  });
});

describe('FormularioEmpleado — edición con catálogo OK SÍ envía rolesOperativos (brazo feliz de N4)', () => {
  it('en EDICIÓN sin errorRoles, al guardar el body lleva rolesOperativos con la selección actual', async () => {
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
    vi.mocked(servicioEmpleados.editarEmpleado).mockResolvedValue(empleado);
    const onGuardado = vi.fn();
    const user = userEvent.setup();
    render(<FormularioEmpleado empleado={empleado} onGuardado={onGuardado} onCancelar={vi.fn()} />);

    await screen.findByText('Cajera'); // catálogo cargado: checkboxes renderizados, sin errorRoles

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled()); // el guardado completó

    // El brazo sin error de la bifurcación de N4: rolesOperativos viaja con la selección.
    // Si una regresión omitiera el campo SIEMPRE (spread invertido o quitado), fallaría aquí.
    const [, body] = vi.mocked(servicioEmpleados.editarEmpleado).mock.calls[0]!;
    expect(body.rolesOperativos).toEqual(['rc']);
  });
});

describe('FormularioEmpleado — edición no guarda durante la carga del catálogo (D2)', () => {
  it('con los roles aún cargando, "Guardar cambios" está deshabilitado; al resolver se habilita', async () => {
    // La carga del catálogo queda PENDIENTE para poder observar la ventana en vuelo.
    let resolverRoles!: (roles: RolOperativo[]) => void;
    vi.mocked(servicioEmpleados.obtenerRolesOperativos).mockImplementationOnce(
      () => new Promise<RolOperativo[]>((res) => { resolverRoles = res; }),
    );
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

    await screen.findByText('Cargando roles…');
    const guardar = screen.getByRole('button', { name: /guardar cambios/i }) as HTMLButtonElement;
    // En vuelo errorRoles aún es null: sin esta guarda el body llevaría el snapshot a ciegas.
    expect(guardar.disabled).toBe(true);

    await act(async () => { resolverRoles([rolCajera]); });
    await screen.findByText('Cajera'); // catálogo cargado: checkboxes renderizados
    expect(guardar.disabled).toBe(false);
  });
});
