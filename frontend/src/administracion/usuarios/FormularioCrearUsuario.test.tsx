import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioCrearUsuario } from './FormularioCrearUsuario';
import { ErrorHttp } from '../../core/api';
import type { UsuarioCreado } from './tipos';
import * as servicio from './servicioUsuarios';

// i18n cae a español sin proveedor → etiquetas/errores en español. Se mockea el
// servicio (la llamada POST /usuarios) para no tocar la red.
vi.mock('./servicioUsuarios');

const VALIDO = {
  nombre: 'Ana Empleada',
  email: 'ana@acme.com',
  password: 'Temporal123*',
};

const CREADO: UsuarioCreado = {
  id: 'u1',
  nombre: 'Ana Empleada',
  email: 'ana@acme.com',
  rol: 'empleado',
};

/** Rellena los campos de texto (con overrides) y pulsa "Crear usuario". */
async function llenar(over: Partial<typeof VALIDO> = {}) {
  const datos = { ...VALIDO, ...over };
  const user = userEvent.setup();
  if (datos.nombre) await user.type(screen.getByLabelText('Nombre *'), datos.nombre);
  if (datos.email) await user.type(screen.getByLabelText('Correo electrónico *'), datos.email);
  if (datos.password) {
    await user.type(screen.getByLabelText('Contraseña temporal *'), datos.password);
  }
  await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
  return user;
}

describe('FormularioCrearUsuario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('campos vacíos → error y NO llama al backend', async () => {
    render(<FormularioCrearUsuario />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(await screen.findByText('Nombre, correo y contraseña son obligatorios.')).toBeTruthy();
    expect(servicio.crearUsuarioApi).not.toHaveBeenCalled();
  });

  it('email inválido → error y NO llama al backend', async () => {
    render(<FormularioCrearUsuario />);
    await llenar({ email: 'no-es-email' });
    expect(await screen.findByText('El correo electrónico no es válido.')).toBeTruthy();
    expect(servicio.crearUsuarioApi).not.toHaveBeenCalled();
  });

  it('contraseña corta (<8) → error y NO llama al backend', async () => {
    render(<FormularioCrearUsuario />);
    await llenar({ password: 'corta' });
    expect(
      await screen.findByText('La contraseña temporal debe tener al menos 8 caracteres.'),
    ).toBeTruthy();
    expect(servicio.crearUsuarioApi).not.toHaveBeenCalled();
  });

  it('éxito → llama al backend (rol empleado por defecto), muestra el resultado y avisa de la temporal', async () => {
    const onCreado = vi.fn();
    vi.mocked(servicio.crearUsuarioApi).mockResolvedValue(CREADO);
    render(<FormularioCrearUsuario onCreado={onCreado} />);
    await llenar();

    await waitFor(() =>
      expect(servicio.crearUsuarioApi).toHaveBeenCalledWith({
        nombre: 'Ana Empleada',
        email: 'ana@acme.com',
        password: 'Temporal123*',
        rol: 'empleado',
      }),
    );
    expect(await screen.findByText('Usuario creado')).toBeTruthy();
    expect(screen.getByText('ana@acme.com')).toBeTruthy(); // correo creado visible
    expect(
      screen.getByText(
        'Comunica la contraseña temporal al usuario: deberá cambiarla en su primer ingreso.',
      ),
    ).toBeTruthy();
    expect(onCreado).toHaveBeenCalled(); // el contenedor refresca la lista
  });

  it('permite elegir el rol administrador (lista blanca del backend)', async () => {
    vi.mocked(servicio.crearUsuarioApi).mockResolvedValue({ ...CREADO, rol: 'administrador' });
    render(<FormularioCrearUsuario />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Rol *'), 'administrador');
    await llenar();
    await waitFor(() =>
      expect(servicio.crearUsuarioApi).toHaveBeenCalledWith(
        expect.objectContaining({ rol: 'administrador' }),
      ),
    );
  });

  it('error 409 (email en uso) → muestra el mensaje del backend y NO marca éxito', async () => {
    vi.mocked(servicio.crearUsuarioApi).mockRejectedValue(
      new ErrorHttp(409, 'El email ya está en uso.'),
    );
    render(<FormularioCrearUsuario />);
    await llenar();
    expect(await screen.findByText('El email ya está en uso.')).toBeTruthy();
    expect(screen.queryByText('Usuario creado')).toBeNull();
  });

  it('mientras envía: deshabilita el botón y los campos (estado de carga)', async () => {
    let resolver: (v: UsuarioCreado) => void = () => {};
    vi.mocked(servicio.crearUsuarioApi).mockReturnValue(
      new Promise<UsuarioCreado>((res) => {
        resolver = res;
      }),
    );
    render(<FormularioCrearUsuario />);
    await llenar();

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Crear usuario' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect((screen.getByLabelText('Nombre *') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Rol *') as HTMLSelectElement).disabled).toBe(true);

    resolver(CREADO);
    expect(await screen.findByText('Usuario creado')).toBeTruthy();
  });
});
