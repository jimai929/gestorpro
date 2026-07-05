import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogoAnadirMembresia } from './DialogoAnadirMembresia';
import { ErrorHttp } from '../core/api';
import type { EmpresaListada } from './tipos';
import * as servicio from './servicioPlataforma';

// i18n cae a español sin proveedor. Se mockea el servicio para no tocar la red.
vi.mock('./servicioPlataforma');

const EMPRESA: EmpresaListada = {
  id: 'e1',
  nombre: 'Acme Panamá',
  slug: 'acme-panama',
  estado: 'activa',
  creadoEn: '2026-06-30T00:00:00.000Z',
  adminEmail: 'ana@acme.com',
};

function montar(props: { onCerrar?: () => void; onExito?: () => void } = {}) {
  return render(
    <DialogoAnadirMembresia
      empresa={EMPRESA}
      onCerrar={props.onCerrar ?? vi.fn()}
      onExito={props.onExito ?? vi.fn()}
    />,
  );
}

/** Escribe el email, elige el rol (si se pide) y pulsa "Añadir". */
async function enviar(email: string, rol?: 'administrador' | 'empleado') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Correo del usuario'), email);
  if (rol) {
    await user.selectOptions(screen.getByLabelText('Rol en esta empresa'), rol);
  }
  await user.click(screen.getByRole('button', { name: 'Añadir' }));
  return user;
}

describe('DialogoAnadirMembresia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el título con la empresa destino y el rol por defecto (empleado)', () => {
    montar();
    expect(screen.getByText('Añadir membresía en Acme Panamá')).toBeTruthy();
    expect((screen.getByLabelText('Rol en esta empresa') as HTMLSelectElement).value).toBe(
      'empleado',
    );
  });

  it('email sin forma válida → error y NO llama al backend', async () => {
    montar();
    await enviar('no-es-email');
    expect(await screen.findByText('Ingresa un correo electrónico válido.')).toBeTruthy();
    expect(servicio.crearMembresiaApi).not.toHaveBeenCalled();
  });

  it('éxito (201) → aviso de membresía añadida y "Cerrar" invoca onExito; envía el rol elegido', async () => {
    const onExito = vi.fn();
    vi.mocked(servicio.crearMembresiaApi).mockResolvedValue({
      id: 'm1',
      usuarioId: 'u1',
      empresaId: 'e1',
      email: 'bob@beta.com',
      rol: 'administrador',
    });
    montar({ onExito });
    const user = await enviar('bob@beta.com', 'administrador');

    await waitFor(() =>
      expect(servicio.crearMembresiaApi).toHaveBeenCalledWith('e1', 'bob@beta.com', 'administrador'),
    );
    expect(await screen.findByText('Membresía añadida')).toBeTruthy();
    expect(
      screen.getByText(
        'bob@beta.com ya puede entrar a Acme Panamá. La verá en su selector de empresa al volver a iniciar sesión.',
      ),
    ).toBeTruthy();
    // Aún no se cerró: onExito solo al pulsar "Cerrar".
    expect(onExito).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onExito).toHaveBeenCalled();
  });

  it('error del backend (409 ya es miembro) → mensaje visible, NO se cierra ni marca éxito', async () => {
    const onExito = vi.fn();
    vi.mocked(servicio.crearMembresiaApi).mockRejectedValue(
      new ErrorHttp(409, 'El usuario ya tiene membresía en esta empresa.'),
    );
    montar({ onExito });
    await enviar('bob@beta.com');

    expect(await screen.findByText('El usuario ya tiene membresía en esta empresa.')).toBeTruthy();
    expect(screen.queryByText('Membresía añadida')).toBeNull();
    expect(onExito).not.toHaveBeenCalled();
    // El formulario sigue usable para reintentar.
    expect(screen.getByRole('button', { name: 'Añadir' })).toBeTruthy();
  });

  it('"Cancelar" y "×" invocan onCerrar (sin llamar al backend)', async () => {
    const onCerrar = vi.fn();
    const user = userEvent.setup();
    montar({ onCerrar });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar' })); // aria-label del ×
    expect(onCerrar).toHaveBeenCalledTimes(2);
    expect(servicio.crearMembresiaApi).not.toHaveBeenCalled();
  });

  it('mientras envía: deshabilita campos y botones (estado de carga)', async () => {
    let resolver: () => void = () => {};
    vi.mocked(servicio.crearMembresiaApi).mockReturnValue(
      new Promise((res) => {
        resolver = () =>
          res({ id: 'm1', usuarioId: 'u1', empresaId: 'e1', email: 'bob@beta.com', rol: 'empleado' });
      }),
    );
    montar();
    await enviar('bob@beta.com');

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Añadir' }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    );
    expect((screen.getByLabelText('Correo del usuario') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Rol en esta empresa') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    resolver();
    expect(await screen.findByText('Membresía añadida')).toBeTruthy();
  });
});
