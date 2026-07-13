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

  it('si el reintento vuelve a fallar, "Crear empleado" sigue deshabilitado y el error reaparece (N3)', async () => {
    // Cola de DOS rechazos: la carga inicial y el reintento fallan; el default del beforeEach queda detrás.
    vi.mocked(servicioEmpleados.obtenerRolesOperativos)
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<FormularioEmpleado onGuardado={vi.fn()} onCancelar={vi.fn()} />);

    await screen.findByText(/no se pudieron cargar los roles/i);
    await rellenarCamposObligatorios(user);

    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    // Tras el reintento fallido el botón queda (de nuevo) bloqueado y el error visible.
    await waitFor(() => {
      const crear = screen.getByRole('button', { name: /crear empleado/i }) as HTMLButtonElement;
      expect(crear.disabled).toBe(true);
    });
    expect(screen.getByText(/no se pudieron cargar los roles/i)).toBeTruthy();
  });

  it('catálogo vacío SIN error: el alta no se bloquea y se informa que no hay roles (N3)', async () => {
    vi.mocked(servicioEmpleados.obtenerRolesOperativos).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<FormularioEmpleado onGuardado={vi.fn()} onCancelar={vi.fn()} />);

    await screen.findByText('No hay roles operativos disponibles.');
    await rellenarCamposObligatorios(user);

    // Vacío legítimo ≠ fallo de carga: H1 solo gatea el error, no la ausencia de roles.
    const crear = screen.getByRole('button', { name: /crear empleado/i }) as HTMLButtonElement;
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

describe('FormularioEmpleado — en edición, vaciar un campo obligatorio bloquea Guardar (N5)', () => {
  it('vaciar salario o sede deshabilita "Guardar cambios"; al restaurar se rehabilita', async () => {
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
    const user = userEvent.setup();
    render(<FormularioEmpleado empleado={empleado} onGuardado={vi.fn()} onCancelar={vi.fn()} />);

    await screen.findByText('Cajera'); // catálogo cargado
    const guardar = screen.getByRole('button', { name: /guardar cambios/i }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(false);

    // El resto de subpredicados de `completo` también gatean en edición (gemelo de N3).
    const salario = screen.getByLabelText(/salario/i);
    await user.clear(salario);
    expect(guardar.disabled).toBe(true);
    await user.type(salario, '1200');
    expect(guardar.disabled).toBe(false);

    await user.selectOptions(screen.getByRole('combobox'), ''); // Sede al placeholder
    expect(guardar.disabled).toBe(true);
    await user.selectOptions(screen.getByRole('combobox'), 'sa');
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

describe('FormularioEmpleado — navegación por Enter (integración real del hook)', () => {
  it('Enter cancela el evento y avanza al siguiente campo; Shift+Enter retrocede', async () => {
    render(<FormularioEmpleado onGuardado={vi.fn()} onCancelar={vi.fn()} />);
    await screen.findByRole('option', { name: 'Sede A' }); // el formulario terminó de montar

    // "número" y "nombre" son los dos primeros campos navegables del formulario (ambos <input> de texto).
    const numero = screen.getByLabelText(/número/i);
    const nombre = screen.getByLabelText(/nombre/i);

    // Enter sobre "número": el hook está cableado REALMENTE en el <div ref={refFormulario}
    // onKeyDown={onKeyDown}> del formulario (no se mockea useNavegacionEnter). El hook cancela
    // el evento (preventDefault) y mueve el foco al siguiente campo navegable ("nombre").
    // dispatchEvent devuelve false ⇔ hubo preventDefault. Sin el cableado del hook este test falla.
    numero.focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const noSuprimido = numero.dispatchEvent(enter);
    expect(noSuprimido).toBe(false);
    expect(enter.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(nombre);

    // Shift+Enter sobre "nombre": retrocede a "número".
    const shiftEnter = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    nombre.dispatchEvent(shiftEnter);
    expect(document.activeElement).toBe(numero);
  });
});
