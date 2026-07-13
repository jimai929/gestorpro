import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioVenta } from './FormularioVenta';
import * as servicio from './servicioDashboard';
import type { VentaDiaria } from './tipos';

vi.mock('./servicioDashboard');
// Usuario actual fijo: solo importa para el fallback de "sin verificadores".
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: { nombre: 'Admin Uno', rol: 'administrador', empresaId: 'e1' } }),
}));

const sedeA = { id: 'sa', nombre: 'Sede A', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01' };
const sedeB = { id: 'sb', nombre: 'Sede B', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01' };

const rolCajera = { id: 'rc', clave: 'cajera', nombre: 'Cajera' };
const rolVerif = { id: 'rv', clave: 'verificador', nombre: 'Verificador' };

// María (sede A) es cajera y verificador; Ana (sede B) solo cajera; Carlos (sede A) solo verificador.
const maria = { id: 'e1', numero: 'E001', nombre: 'María Pérez', sedeId: 'sa', roles: [rolCajera, rolVerif] };
const ana = { id: 'e3', numero: 'E003', nombre: 'Ana Ruiz', sedeId: 'sb', roles: [rolCajera] };
const carlos = { id: 'e4', numero: 'E004', nombre: 'Carlos Méndez', sedeId: 'sa', roles: [rolVerif] };

// Ana (sede B) va primero a propósito, para comprobar que el orden la baja.
const cajeras = [ana, maria];
const verificadores = [maria, carlos];

beforeEach(() => {
  // resetAllMocks (no clearAllMocks): limpia historial E implementaciones, incluida la
  // cola `.mock*Once()` de registrarVenta, para que cada test quede aislado y una futura
  // regresión falle en su propia aserción (no acoplada al orden de ejecución).
  vi.resetAllMocks();
  vi.mocked(servicio.obtenerSedes).mockResolvedValue([sedeA, sedeB]);
  vi.mocked(servicio.obtenerEmpleadosPorRol).mockImplementation((rol: string) =>
    Promise.resolve(rol === 'cajera' ? cajeras : verificadores),
  );
});

/** Monta el formulario y espera a que carguen sedes y empleados. */
async function montar() {
  const user = userEvent.setup();
  render(<FormularioVenta onRegistrada={vi.fn()} />);
  await screen.findByRole('option', { name: 'Sede A' });
  await screen.findByRole('option', { name: /Ana Ruiz/ }); // cajeras cargadas
  await screen.findByRole('option', { name: /Carlos Méndez/ }); // verificadores cargados
  // Orden de los <select>: 0 Sede · 1 Turno · 2 Cajera · 3 Cerrado por.
  const combos = screen.getAllByRole('combobox');
  return { user, sedeSel: combos[0]!, cajeraSel: combos[2]!, verifSel: combos[3]! };
}

describe('FormularioVenta — selects de cajera y verificador', () => {
  it('Cajera muestra solo empleados con rol cajera; Cerrado por solo verificadores', async () => {
    const { user, sedeSel, cajeraSel, verifSel } = await montar();
    await user.selectOptions(sedeSel, 'sa');

    expect(within(cajeraSel).queryByRole('option', { name: /María Pérez/ })).toBeTruthy();
    expect(within(cajeraSel).queryByRole('option', { name: /Ana Ruiz/ })).toBeTruthy();
    expect(within(cajeraSel).queryByRole('option', { name: /Carlos Méndez/ })).toBeNull();

    expect(within(verifSel).queryByRole('option', { name: /María Pérez/ })).toBeTruthy();
    expect(within(verifSel).queryByRole('option', { name: /Carlos Méndez/ })).toBeTruthy();
    expect(within(verifSel).queryByRole('option', { name: /Ana Ruiz/ })).toBeNull();
  });

  it('ordena los de la sede del cierre primero y usa el snapshot "E001 - Nombre" como valor', async () => {
    const { user, sedeSel, cajeraSel } = await montar();
    await user.selectOptions(sedeSel, 'sa'); // sede A

    const opciones = within(cajeraSel).getAllByRole('option') as HTMLOptionElement[];
    // [0] placeholder · [1] María (sede A, va primero) · [2] Ana (otra sede)
    expect(opciones[1]!.textContent).toMatch(/María Pérez/);
    expect(opciones[2]!.textContent).toMatch(/Ana Ruiz/);
    expect(opciones[1]!.value).toBe('E001 - María Pérez');
  });

  it('al cambiar de sede RESETEA cajera y cerrado por', async () => {
    const { user, sedeSel, cajeraSel, verifSel } = await montar();
    await user.selectOptions(sedeSel, 'sa');
    await user.selectOptions(cajeraSel, 'E001 - María Pérez');
    await user.selectOptions(verifSel, 'E004 - Carlos Méndez');
    expect((cajeraSel as HTMLSelectElement).value).toBe('E001 - María Pérez');
    expect((verifSel as HTMLSelectElement).value).toBe('E004 - Carlos Méndez');

    await user.selectOptions(sedeSel, 'sb');
    expect((cajeraSel as HTMLSelectElement).value).toBe('');
    expect((verifSel as HTMLSelectElement).value).toBe('');
  });

  it('advierte (sin bloquear) si la cajera y quien verifica son la misma persona', async () => {
    const { user, sedeSel, cajeraSel, verifSel } = await montar();
    await user.selectOptions(sedeSel, 'sa');
    await user.selectOptions(cajeraSel, 'E001 - María Pérez');
    await user.selectOptions(verifSel, 'E001 - María Pérez');
    expect(screen.getByText(/misma persona/i)).toBeTruthy();
  });
});

describe('FormularioVenta — fallo de carga y reintento', () => {
  it('si las sedes fallan, el select queda "No disponible" y ofrece reintentar', async () => {
    vi.mocked(servicio.obtenerSedes).mockRejectedValueOnce(new Error('boom'));
    render(<FormularioVenta onRegistrada={vi.fn()} />);

    // Aparece el aviso con reintento (no se traga el error ni finge "Seleccionar sede").
    const reintentar = await screen.findByRole('button', { name: /reintentar/i });
    expect(reintentar).toBeTruthy();
    expect(screen.getByRole('option', { name: 'No disponible' })).toBeTruthy();
  });

  it('reintentar recupera las sedes tras un fallo transitorio', async () => {
    vi.mocked(servicio.obtenerSedes).mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<FormularioVenta onRegistrada={vi.fn()} />);

    const reintentar = await screen.findByRole('button', { name: /reintentar/i });
    await user.click(reintentar);

    // La segunda carga resuelve (mock por defecto): aparecen las sedes y se va el aviso.
    await screen.findByRole('option', { name: 'Sede A' });
    expect(screen.queryByRole('button', { name: /reintentar/i })).toBeNull();
  });

  it('si los empleados fallan, se muestra un único aviso de error con reintento', async () => {
    // Promise.all rechaza si cualquiera de los dos falla; basta con el primero.
    vi.mocked(servicio.obtenerEmpleadosPorRol).mockRejectedValueOnce(new Error('boom'));
    render(<FormularioVenta onRegistrada={vi.fn()} />);

    // El error de carga de empleados se renderiza UNA sola vez (no duplicado bajo cada select).
    const reintentos = await screen.findAllByRole('button', { name: /reintentar/i });
    expect(reintentos).toHaveLength(1);
  });
});

/**
 * Enfoca `el`, dispara Enter y devuelve `false` si algún handler llamó a
 * preventDefault (envío implícito bloqueado), `true` si no.
 */
function enterEn(el: HTMLElement, opciones: Partial<KeyboardEventInit> = {}): boolean {
  el.focus();
  return fireEvent.keyDown(el, { key: 'Enter', ...opciones });
}

/** Deja el formulario COMPLETO (habilita el botón Registrar): sede, turno, cajera, verificador y un arqueo > 0. */
async function llenarFormularioCompleto(user: ReturnType<typeof userEvent.setup>) {
  const combos = screen.getAllByRole('combobox');
  const [sedeSel, turnoSel, cajeraSel, verifSel] = combos;
  await user.selectOptions(sedeSel!, 'sa');
  await user.selectOptions(turnoSel!, 'manana');
  await user.selectOptions(cajeraSel!, 'E001 - María Pérez');
  await user.selectOptions(verifSel!, 'E004 - Carlos Méndez');
  const efectivo = screen.getAllByRole('spinbutton')[0]!; // primer arqueo: Efectivo
  await user.type(efectivo, '100');
  return { sedeSel: sedeSel!, efectivo };
}

/** El botón de envío (type=submit), sin depender del texto traducido. */
function botonRegistrar(): HTMLButtonElement {
  return screen.getAllByRole('button').find((b) => (b as HTMLButtonElement).type === 'submit') as HTMLButtonElement;
}

const ventaCreada: VentaDiaria = {
  id: 'v1', sedeId: 'sa', fechaOperacion: '2026-07-12', turno: 'manana',
  cajera: 'E001 - María Pérez', cerradoPor: 'E004 - Carlos Méndez',
  horaApertura: null, horaCierre: null, monto: 100, tipo: 'normal',
  detalles: [{ tipoArqueo: 'efectivo', monto: 100 }],
};

describe('FormularioVenta — Enter no registra el cierre por accidente', () => {
  it('Enter en un campo de arqueo bloquea el envío implícito del formulario (preventDefault)', async () => {
    await montar();
    const efectivo = screen.getAllByRole('spinbutton')[0]!;
    // El envío implícito del <form> queda cancelado: el cierre NO se puede guardar con Enter.
    expect(enterEn(efectivo)).toBe(false);
  });

  it('Enter en un <select> NO se bloquea (no rompe el teclado nativo del desplegable)', async () => {
    const { sedeSel } = await montar();
    // No hay preventDefault sobre el select: su navegación de teclado queda intacta y tampoco envía.
    expect(enterEn(sedeSel)).toBe(true);
  });

  it('durante composición IME, Enter en un campo NO se bloquea (deja escribir el carácter)', async () => {
    await montar();
    const efectivo = screen.getAllByRole('spinbutton')[0]!;
    expect(enterEn(efectivo, { isComposing: true })).toBe(true);
  });

  it('con el formulario COMPLETO, Enter SIGUE cancelando el envío implícito (preventDefault) y no registra', async () => {
    const user = userEvent.setup();
    render(<FormularioVenta onRegistrada={vi.fn()} />);
    await screen.findByRole('option', { name: 'Sede A' });
    await screen.findByRole('option', { name: /Carlos Méndez/ });
    const { efectivo } = await llenarFormularioCompleto(user);

    // Aunque el botón ya esté habilitado, el handler sigue haciendo preventDefault
    // sobre Enter en un input (si se quitara `bloquearEnvioImplicito` devolvería true
    // y este assert fallaría): jsdom no hace envío implícito, así que la prueba REAL
    // de que no hay registro accidental es que el evento queda cancelado.
    expect(enterEn(efectivo)).toBe(false);
    expect(enterEn(efectivo)).toBe(false); // varias pulsaciones seguidas: sigue bloqueado
    expect(vi.mocked(servicio.registrarVenta)).not.toHaveBeenCalled();
  });

  it('el clic explícito en "Registrar" SÍ envía, con el payload correcto', async () => {
    vi.mocked(servicio.registrarVenta).mockResolvedValue(ventaCreada);
    const onRegistrada = vi.fn();
    const user = userEvent.setup();
    render(<FormularioVenta onRegistrada={onRegistrada} />);
    await screen.findByRole('option', { name: 'Sede A' });
    await screen.findByRole('option', { name: /Carlos Méndez/ });
    await llenarFormularioCompleto(user);

    await user.click(botonRegistrar());

    await waitFor(() =>
      expect(vi.mocked(servicio.registrarVenta)).toHaveBeenCalledWith(
        expect.objectContaining({
          sedeId: 'sa',
          turno: 'manana',
          cajera: 'E001 - María Pérez',
          cerradoPor: 'E004 - Carlos Méndez',
          detalles: [{ tipoArqueo: 'efectivo', monto: 100 }],
        }),
      ),
    );
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith(ventaCreada));
  });

  it('con un envío en curso, un segundo clic NO vuelve a registrar (el botón se deshabilita mientras guarda)', async () => {
    // registrarVenta queda pendiente: el cierre sigue "guardando".
    vi.mocked(servicio.registrarVenta).mockReturnValue(new Promise<VentaDiaria>(() => {}));
    const user = userEvent.setup();
    render(<FormularioVenta onRegistrada={vi.fn()} />);
    await screen.findByRole('option', { name: 'Sede A' });
    await screen.findByRole('option', { name: /Carlos Méndez/ });
    await llenarFormularioCompleto(user);

    await user.click(botonRegistrar());
    await user.click(botonRegistrar()); // segundo intento: el botón ya está deshabilitado

    expect(vi.mocked(servicio.registrarVenta)).toHaveBeenCalledTimes(1);
  });

  it('dos submits en el MISMO tick (antes del re-render) NO doblan el registro: cerrojo síncrono enviandoRef', async () => {
    // registrarVenta pendiente: el primer envío se queda en vuelo.
    vi.mocked(servicio.registrarVenta).mockReturnValue(new Promise<VentaDiaria>(() => {}));
    const user = userEvent.setup();
    const { container } = render(<FormularioVenta onRegistrada={vi.fn()} />);
    await screen.findByRole('option', { name: 'Sede A' });
    await screen.findByRole('option', { name: /Carlos Méndez/ });
    await llenarFormularioCompleto(user);

    // Dos `submit` seguidos SIN esperar el re-render: el botón aún no se ha
    // deshabilitado, así que lo único que impide el doble registro es el cerrojo
    // síncrono `enviandoRef` (si se eliminara, el 2º submit llamaría de nuevo).
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(vi.mocked(servicio.registrarVenta)).toHaveBeenCalledTimes(1);
  });

  it('Enter en un <select> ya elegido no altera su valor (no rompe la selección previa)', async () => {
    const { user, sedeSel, cajeraSel } = await montar();
    await user.selectOptions(sedeSel, 'sa');
    await user.selectOptions(cajeraSel, 'E001 - María Pérez');
    enterEn(cajeraSel);
    expect((cajeraSel as HTMLSelectElement).value).toBe('E001 - María Pérez');
  });
});

describe('FormularioVenta — fallback de responsable sin verificadores', () => {
  it('sin verificadores, "cerrado por" cae al usuario actual (snapshot) y permite cerrar', async () => {
    // La empresa no tiene ningún empleado con rol Verificador.
    vi.mocked(servicio.obtenerEmpleadosPorRol).mockImplementation((rol: string) =>
      Promise.resolve(rol === 'cajera' ? cajeras : []),
    );
    const user = userEvent.setup();
    render(<FormularioVenta onRegistrada={vi.fn()} />);
    await screen.findByRole('option', { name: 'Sede A' });
    await screen.findByRole('option', { name: /Ana Ruiz/ }); // cajeras cargaron (verificadores vacío)

    const combos = screen.getAllByRole('combobox');
    const sedeSel = combos[0]!;
    const verifSel = combos[3]! as HTMLSelectElement;
    await user.selectOptions(sedeSel, 'sa');

    // La opción de fallback existe (con el nombre del usuario) y queda auto-seleccionada.
    expect(within(verifSel).queryByRole('option', { name: /Admin Uno/ })).toBeTruthy();
    expect(verifSel.value).toBe('Admin Uno');
    // Y se explica que no hay verificadores.
    expect(screen.getByText(/rol Verificador/i)).toBeTruthy();
  });
});

describe('FormularioVenta — reintento tras error de cierre (enviandoRef se libera)', () => {
  /** Monta el formulario COMPLETO (botón habilitado) y devuelve el callback de éxito espiado. */
  async function montarCompleto() {
    const onRegistrada = vi.fn();
    const user = userEvent.setup();
    render(<FormularioVenta onRegistrada={onRegistrada} />);
    await screen.findByRole('option', { name: 'Sede A' });
    await screen.findByRole('option', { name: /Carlos Méndez/ });
    await llenarFormularioCompleto(user);
    return { user, onRegistrada };
  }

  it('tras un 409 (ErrorCierreDuplicado) muestra el aviso de conflicto y permite reintentar con éxito', async () => {
    const mensajeConflicto = 'Ya existe un cierre normal para esa sede, fecha y turno';
    const err409 = new servicio.ErrorCierreDuplicado(mensajeConflicto);
    // El módulo está auto-mockeado: garantizamos el mensaje visible aunque el
    // constructor mockeado no ejecute `super(mensaje)`. El `instanceof` sí se cumple
    // (misma clase que importa el componente), así que se toma la rama 409.
    err409.message = mensajeConflicto;
    vi.mocked(servicio.registrarVenta)
      .mockRejectedValueOnce(err409)
      .mockResolvedValueOnce(ventaCreada);

    const { user, onRegistrada } = await montarCompleto();

    // 1er envío: el backend responde 409 -> aparece el aviso de conflicto (con su icono
    // ⚠), diferenciado del error de validación. No se registró nada aún.
    await user.click(botonRegistrar());
    await screen.findByText(mensajeConflicto);
    expect(screen.getByText('⚠')).toBeTruthy(); // rama de conflicto (no el <p> de error genérico)
    expect(vi.mocked(servicio.registrarVenta)).toHaveBeenCalledTimes(1);
    expect(onRegistrada).not.toHaveBeenCalled();

    // 2º envío: si `enviandoRef` NO se hubiera liberado en el `finally` tras el 409, este
    // clic quedaría bloqueado y no registraría nada. Que se registre prueba que el cerrojo
    // se soltó y el operador puede reintentar el cierre.
    await user.click(botonRegistrar());
    await waitFor(() => expect(vi.mocked(servicio.registrarVenta)).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith(ventaCreada));
  });

  it('tras un error genérico muestra el error y permite reintentar con éxito', async () => {
    const mensajeError = 'Fallo de red al registrar el cierre';
    vi.mocked(servicio.registrarVenta)
      .mockRejectedValueOnce(new Error(mensajeError))
      .mockResolvedValueOnce(ventaCreada);

    const { user, onRegistrada } = await montarCompleto();

    // 1er envío: error genérico -> se muestra el mensaje de error, sin el aviso de conflicto ⚠.
    await user.click(botonRegistrar());
    await screen.findByText(mensajeError);
    expect(screen.queryByText('⚠')).toBeNull(); // no es la rama 409
    expect(vi.mocked(servicio.registrarVenta)).toHaveBeenCalledTimes(1);
    expect(onRegistrada).not.toHaveBeenCalled();

    // 2º envío: el `finally` liberó `enviandoRef` aunque el 1º lanzara -> el reintento
    // registra con éxito. Prueba que el error genérico tampoco deja el formulario bloqueado.
    await user.click(botonRegistrar());
    await waitFor(() => expect(vi.mocked(servicio.registrarVenta)).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith(ventaCreada));
  });
});
