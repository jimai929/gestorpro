import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioGasto } from './FormularioGasto';
import * as servicioGastos from './servicioGastos';
import type { CategoriaGasto, Sede } from './tipos';

vi.mock('./servicioGastos');
// useAuth controlable: cada test fija el rol antes de montar.
const usuarioMock = vi.hoisted(() => ({
  actual: { rol: 'administrador', empresaId: 'e1' } as { rol: string; empresaId: string | null },
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: usuarioMock.actual }),
}));

const cat: CategoriaGasto = {
  id: 'c1', nombre: 'Alquiler', esPagoEmpleado: false, activo: true, creadoEn: '2026-01-01',
};
const sede: Sede = {
  id: 's1', nombre: 'Sede A', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.actual = { rol: 'administrador', empresaId: 'e1' };
  vi.mocked(servicioGastos.obtenerCategoriasGasto).mockResolvedValue([cat]);
  vi.mocked(servicioGastos.obtenerSedes).mockResolvedValue([sede]);
});

function montar() {
  render(<FormularioGasto onRegistrado={() => {}} />);
}

describe('FormularioGasto — crear categoría inline', () => {
  it('admin ve el enlace "+ Nueva categoría"', async () => {
    montar();
    await screen.findByRole('option', { name: 'Alquiler' });
    expect(screen.getByRole('button', { name: /nueva categoría/i })).toBeTruthy();
  });

  it('empleado NO ve el enlace de crear categoría inline', async () => {
    usuarioMock.actual = { rol: 'empleado', empresaId: 'e1' };
    montar();
    await screen.findByRole('option', { name: 'Alquiler' });
    expect(screen.queryByRole('button', { name: /nueva categoría/i })).toBeNull();
  });

  it('crear inline llama a crearCategoria y AUTO-SELECCIONA la nueva (sin perder el formulario)', async () => {
    vi.mocked(servicioGastos.crearCategoria).mockResolvedValue({
      id: 'c2', nombre: 'Publicidad', esPagoEmpleado: false, activo: true, creadoEn: '2026-01-02', reactivada: false,
    });
    const user = userEvent.setup();
    montar();
    await screen.findByRole('option', { name: 'Alquiler' });

    await user.click(screen.getByRole('button', { name: /nueva categoría/i }));
    await user.type(screen.getByLabelText('Nombre'), 'Publicidad');
    await user.click(screen.getByRole('button', { name: /crear categoría/i }));

    await waitFor(() =>
      expect(vi.mocked(servicioGastos.crearCategoria)).toHaveBeenCalledWith({
        nombre: 'Publicidad',
        esPagoEmpleado: false,
      }),
    );
    // La nueva aparece como opción y el select de categoría queda con su id.
    await screen.findByRole('option', { name: 'Publicidad' });
    const selects = screen.getAllByRole('combobox');
    expect((selects[0] as HTMLSelectElement).value).toBe('c2');
  });

  it('crear inline con nombre de una INACTIVA → reactivada: aviso + auto-selección', async () => {
    vi.mocked(servicioGastos.crearCategoria).mockResolvedValue({
      id: 'c3', nombre: 'Vieja', esPagoEmpleado: false, activo: true, creadoEn: '2026-01-02', reactivada: true,
    });
    const user = userEvent.setup();
    montar();
    await screen.findByRole('option', { name: 'Alquiler' });

    await user.click(screen.getByRole('button', { name: /nueva categoría/i }));
    await user.type(screen.getByLabelText('Nombre'), 'Vieja');
    await user.click(screen.getByRole('button', { name: /crear categoría/i }));

    await screen.findByText(/reactivada/i); // aviso de reactivación
    const selects = screen.getAllByRole('combobox');
    expect((selects[0] as HTMLSelectElement).value).toBe('c3');
  });
});

/** Enfoca `el` y dispara Enter (con opciones: shiftKey, etc.), como en useNavegacionEnter.test.tsx. */
function enterEn(el: HTMLElement, opciones: Partial<KeyboardEventInit> = {}) {
  el.focus();
  fireEvent.keyDown(el, { key: 'Enter', ...opciones });
}

describe('FormularioGasto — navegación con Enter en el sub-flujo "crear categoría inline"', () => {
  async function abrirNuevaCategoria() {
    montar();
    await screen.findByRole('option', { name: 'Alquiler' });
    fireEvent.click(screen.getByRole('button', { name: /nueva categoría/i }));
    return {
      nombre: screen.getByLabelText('Nombre'),
      pagoEmpleado: screen.getByLabelText(/pago a empleado/i),
      crear: screen.getByRole('button', { name: /crear categoría/i }),
    };
  }

  it('Enter en el input de nombre de categoría NO salta a Sede: se queda dentro del sub-flujo', async () => {
    const { nombre, pagoEmpleado } = await abrirNuevaCategoria();
    enterEn(nombre);
    // Si se hubiera escapado al formulario principal, habría saltado a Sede;
    // en vez de eso avanza al siguiente campo PROPIO del sub-flujo (el checkbox).
    expect(document.activeElement).toBe(pagoEmpleado);
    expect(document.activeElement).not.toBe(screen.getAllByRole('combobox')[1]); // Sede
  });

  it('en el ÚLTIMO campo del sub-flujo (checkbox), Enter enfoca el botón "Crear categoría"', async () => {
    const { nombre, pagoEmpleado, crear } = await abrirNuevaCategoria();
    fireEvent.change(nombre, { target: { value: 'Publicidad' } }); // habilita el botón (disabled sin nombre)
    enterEn(pagoEmpleado);
    expect(document.activeElement).toBe(crear);
  });

  it('Enter dentro del sub-flujo de categoría NO envía el formulario principal de gasto', async () => {
    const { nombre, pagoEmpleado } = await abrirNuevaCategoria();
    fireEvent.change(nombre, { target: { value: 'Publicidad' } });
    enterEn(nombre);
    enterEn(pagoEmpleado); // llega al botón Crear, sin disparar el submit de gasto
    expect(vi.mocked(servicioGastos.registrarGasto)).not.toHaveBeenCalled();
    expect(vi.mocked(servicioGastos.crearCategoria)).not.toHaveBeenCalled(); // tampoco crea sin una 2ª pulsación real sobre el botón
  });

  it('tras crear la categoría, el sub-flujo se cierra y la navegación del formulario principal sigue funcionando', async () => {
    vi.mocked(servicioGastos.crearCategoria).mockResolvedValue({
      id: 'c2', nombre: 'Publicidad', esPagoEmpleado: false, activo: true, creadoEn: '2026-01-02', reactivada: false,
    });
    const user = userEvent.setup();
    const { nombre, crear } = await abrirNuevaCategoria();
    await user.type(nombre, 'Publicidad');
    await user.click(crear);
    await waitFor(() => expect(vi.mocked(servicioGastos.crearCategoria)).toHaveBeenCalled());

    // El sub-flujo se desmontó (mostrarNuevaCat vuelve a false).
    expect(screen.queryByLabelText('Nombre')).toBeNull();

    // El formulario principal sigue navegando con Enter con normalidad: la
    // categoría (ya auto-seleccionada) avanza a Sede.
    const selects = screen.getAllByRole('combobox');
    enterEn(selects[0]); // categoría
    expect(document.activeElement).toBe(selects[1]); // sede
  });

  it('cerrar el sub-flujo con "Cancelar" (sin crear) también recalcula la navegación del formulario principal', async () => {
    await abrirNuevaCategoria();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(vi.mocked(servicioGastos.crearCategoria)).not.toHaveBeenCalled();

    const selects = screen.getAllByRole('combobox');
    enterEn(selects[0]); // categoría
    expect(document.activeElement).toBe(selects[1]); // sede
  });

  it('el formulario principal (contenedor externo) IGNORA los campos del sub-flujo anidado: Enter en Categoría salta directo a Sede', async () => {
    await abrirNuevaCategoria();
    const selects = screen.getAllByRole('combobox');
    enterEn(selects[0]); // categoría, en el formulario principal
    // No entra al sub-flujo (nombre de la nueva categoría): va directo a Sede.
    expect(document.activeElement).toBe(selects[1]);
  });
});
