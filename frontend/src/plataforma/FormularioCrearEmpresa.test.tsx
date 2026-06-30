import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioCrearEmpresa } from './FormularioCrearEmpresa';
import { ErrorHttp } from '../core/api';
import type { EmpresaCreada } from './tipos';
import * as servicio from './servicioPlataforma';

// i18n cae a español sin proveedor → etiquetas/errores en español. Se mockea el
// servicio (la llamada POST /empresas) para no tocar la red.
vi.mock('./servicioPlataforma');

const VALIDO = {
  nombre: 'Acme Panamá',
  slug: 'acme-panama',
  adminNombre: 'Ana Admin',
  adminEmail: 'ana@acme.com',
  adminPassword: 'Inicial123*',
};

const CREADA: EmpresaCreada = { id: 'e1', nombre: 'Acme Panamá', slug: 'acme-panama', adminId: 'a1' };

/** Rellena los 5 campos (con overrides) y pulsa "Crear empresa". */
async function llenar(over: Partial<typeof VALIDO> = {}) {
  const datos = { ...VALIDO, ...over };
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Nombre de la empresa'), datos.nombre);
  await user.type(screen.getByLabelText('Identificador (slug)'), datos.slug);
  await user.type(screen.getByLabelText('Nombre del administrador'), datos.adminNombre);
  await user.type(screen.getByLabelText('Correo del administrador'), datos.adminEmail);
  await user.type(screen.getByLabelText('Contraseña inicial'), datos.adminPassword);
  await user.click(screen.getByRole('button', { name: 'Crear empresa' }));
  return user;
}

describe('FormularioCrearEmpresa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('slug inválido (mayúsculas/espacios) → error y NO llama al backend', async () => {
    render(<FormularioCrearEmpresa />);
    await llenar({ slug: 'ACME PANAMA' });
    expect(
      await screen.findByText('El identificador solo admite minúsculas, números y guiones.'),
    ).toBeTruthy();
    expect(servicio.crearEmpresaApi).not.toHaveBeenCalled();
  });

  it('email inválido → error y NO llama al backend (refuerza el minLength:3 del backend)', async () => {
    render(<FormularioCrearEmpresa />);
    await llenar({ adminEmail: 'no-es-email' });
    expect(await screen.findByText('Ingresa un correo electrónico válido.')).toBeTruthy();
    expect(servicio.crearEmpresaApi).not.toHaveBeenCalled();
  });

  it('contraseña corta (<8) → error y NO llama al backend', async () => {
    render(<FormularioCrearEmpresa />);
    await llenar({ adminPassword: 'corta' });
    expect(
      await screen.findByText('La contraseña inicial debe tener al menos 8 caracteres.'),
    ).toBeTruthy();
    expect(servicio.crearEmpresaApi).not.toHaveBeenCalled();
  });

  it('éxito → llama al backend con el body y muestra el resultado (empresa + correo del admin)', async () => {
    vi.mocked(servicio.crearEmpresaApi).mockResolvedValue(CREADA);
    render(<FormularioCrearEmpresa />);
    await llenar();

    await waitFor(() =>
      expect(servicio.crearEmpresaApi).toHaveBeenCalledWith({
        nombre: 'Acme Panamá',
        slug: 'acme-panama',
        adminNombre: 'Ana Admin',
        adminEmail: 'ana@acme.com',
        adminPassword: 'Inicial123*',
      }),
    );
    expect(await screen.findByText('Empresa creada')).toBeTruthy();
    expect(screen.getByText('Acme Panamá')).toBeTruthy(); // empresa creada visible
    expect(screen.getByText('ana@acme.com')).toBeTruthy(); // correo del admin visible
  });

  it('error 409 (slug/email duplicado) → muestra el mensaje del backend ({ mensaje })', async () => {
    vi.mocked(servicio.crearEmpresaApi).mockRejectedValue(
      new ErrorHttp(409, 'El slug de la empresa o el email del admin ya están en uso.'),
    );
    render(<FormularioCrearEmpresa />);
    await llenar();
    expect(
      await screen.findByText('El slug de la empresa o el email del admin ya están en uso.'),
    ).toBeTruthy();
    // No marca éxito: el formulario sigue visible (no muestra "Empresa creada").
    expect(screen.queryByText('Empresa creada')).toBeNull();
  });

  it('error 400 (validación de schema del backend) → muestra el message ({ message })', async () => {
    vi.mocked(servicio.crearEmpresaApi).mockRejectedValue(
      new ErrorHttp(400, 'body/slug must match pattern "^[a-z0-9-]+$"'),
    );
    render(<FormularioCrearEmpresa />);
    await llenar();
    expect(
      await screen.findByText('body/slug must match pattern "^[a-z0-9-]+$"'),
    ).toBeTruthy();
  });

  it('mientras envía: deshabilita el botón y los campos (estado de carga)', async () => {
    let resolver: (v: EmpresaCreada) => void = () => {};
    vi.mocked(servicio.crearEmpresaApi).mockReturnValue(
      new Promise<EmpresaCreada>((res) => {
        resolver = res;
      }),
    );
    render(<FormularioCrearEmpresa />);
    await llenar();

    // En vuelo: el botón de envío y los campos quedan deshabilitados.
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Crear empresa' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect((screen.getByLabelText('Nombre de la empresa') as HTMLInputElement).disabled).toBe(true);

    // Al resolver, pasa al estado de éxito.
    resolver(CREADA);
    expect(await screen.findByText('Empresa creada')).toBeTruthy();
  });
});
