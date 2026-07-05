import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListaEmpresas } from './ListaEmpresas';
import type { EmpresaListada } from './tipos';

// Componente presentacional: se prueba por props. i18n cae a español sin proveedor.
const EMPRESAS: EmpresaListada[] = [
  {
    id: 'e1',
    nombre: 'Acme Panamá',
    slug: 'acme-panama',
    activo: true,
    creadoEn: '2026-06-30T00:00:00.000Z',
    adminEmail: 'ana@acme.com',
  },
  {
    id: 'e2',
    nombre: 'Beta SA',
    slug: 'beta-sa',
    activo: false,
    creadoEn: '2026-06-29T00:00:00.000Z',
    adminEmail: 'bob@beta.com',
  },
];

describe('ListaEmpresas', () => {
  it('con datos: renderiza las empresas y el email de su admin', () => {
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={vi.fn()}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={vi.fn()}
      />,
    );
    expect(screen.getByText('Acme Panamá')).toBeTruthy();
    expect(screen.getByText('acme-panama')).toBeTruthy();
    expect(screen.getByText('ana@acme.com')).toBeTruthy();
    expect(screen.getByText('Beta SA')).toBeTruthy();
    expect(screen.getByText('bob@beta.com')).toBeTruthy();
  });

  it('cargando (sin datos aún): muestra el indicador de carga', () => {
    render(
      <ListaEmpresas
        empresas={null}
        cargando={true}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={vi.fn()}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={vi.fn()}
      />,
    );
    expect(screen.getByText('Cargando…')).toBeTruthy();
  });

  it('error: muestra el mensaje de error', () => {
    render(
      <ListaEmpresas
        empresas={null}
        cargando={false}
        error="Falló la carga"
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={vi.fn()}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={vi.fn()}
      />,
    );
    expect(screen.getByText('Falló la carga')).toBeTruthy();
  });

  it('vacío: muestra el estado vacío', () => {
    render(
      <ListaEmpresas
        empresas={[]}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={vi.fn()}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={vi.fn()}
      />,
    );
    expect(screen.getByText('Aún no hay empresas. Crea la primera arriba.')).toBeTruthy();
  });

  it('"Entrar" en una empresa activa llama a onEntrar con su id', async () => {
    const onEntrar = vi.fn();
    const user = userEvent.setup();
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={onEntrar}
        onAlternarActivo={vi.fn()}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={vi.fn()}
      />,
    );

    const botones = screen.getAllByRole('button', { name: 'Entrar' });
    expect(botones).toHaveLength(2); // uno por fila
    await user.click(botones[0]!);
    expect(onEntrar).toHaveBeenCalledWith('e1');
  });

  it('"Entrar" está deshabilitado para una empresa dada de baja', () => {
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={vi.fn()}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={vi.fn()}
      />,
    );
    const botones = screen.getAllByRole('button', { name: 'Entrar' }) as HTMLButtonElement[];
    expect(botones[0]!.disabled).toBe(false); // Acme: activa
    expect(botones[1]!.disabled).toBe(true); // Beta: inactiva
  });

  it('mientras hay un "Entrar" en curso, TODOS los botones quedan deshabilitados', () => {
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={vi.fn()}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={vi.fn()}
        entrandoId="e1"
      />,
    );
    const botones = screen.getAllByRole('button', { name: 'Entrar' }) as HTMLButtonElement[];
    expect(botones.every((b) => b.disabled)).toBe(true);
    // La acción de estado también queda congelada (un solo slot en el padre).
    const estado = screen.getAllByRole('button', {
      name: /Desactivar|Reactivar/,
    }) as HTMLButtonElement[];
    expect(estado.every((b) => b.disabled)).toBe(true);
    // Y el botón de membresía: TODA la tabla se congela con una acción en vuelo.
    const membresia = screen.getAllByRole('button', {
      name: 'Añadir membresía',
    }) as HTMLButtonElement[];
    expect(membresia.every((b) => b.disabled)).toBe(true);
  });

  it('"Desactivar" exige DOS clics (armar → confirmar); "Reactivar" es directo', async () => {
    const onAlternarActivo = vi.fn();
    const user = userEvent.setup();
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={onAlternarActivo}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={vi.fn()}
      />,
    );
    // Primer clic en Desactivar (Acme, activa): solo ARMA — un misclic junto a
    // "Entrar" no debe dar de baja un tenant completo.
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    expect(onAlternarActivo).not.toHaveBeenCalled();
    // Segundo clic (el botón ahora pide confirmación): ejecuta.
    await user.click(screen.getByRole('button', { name: '¿Confirmar baja?' }));
    expect(onAlternarActivo).toHaveBeenCalledWith(EMPRESAS[0]);
    // Reactivar (Beta, inactiva): directo, restaurar acceso no es destructivo.
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));
    expect(onAlternarActivo).toHaveBeenCalledWith(EMPRESAS[1]);
  });

  it('"Añadir membresía" llama a onAnadirMembresia con la empresa; deshabilitado en una inactiva', async () => {
    const onAnadirMembresia = vi.fn();
    const user = userEvent.setup();
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={vi.fn()}
        onAnadirMembresia={onAnadirMembresia}
        onRestablecerAdmin={vi.fn()}
      />,
    );
    const botones = screen.getAllByRole('button', {
      name: 'Añadir membresía',
    }) as HTMLButtonElement[];
    expect(botones).toHaveLength(2); // uno por fila
    // Beta está dada de baja: el backend respondería 409, el botón ni se ofrece.
    expect(botones[0]!.disabled).toBe(false);
    expect(botones[1]!.disabled).toBe(true);
    await user.click(botones[0]!);
    expect(onAnadirMembresia).toHaveBeenCalledWith(EMPRESAS[0]);
  });

  it('mientras un cambio de estado está en curso, TODAS las acciones quedan deshabilitadas', () => {
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={vi.fn()}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={vi.fn()}
        actualizandoId="e2"
      />,
    );
    const entrar = screen.getAllByRole('button', { name: 'Entrar' }) as HTMLButtonElement[];
    expect(entrar.every((b) => b.disabled)).toBe(true);
    const estado = screen.getAllByRole('button', {
      name: /Desactivar|Reactivar/,
    }) as HTMLButtonElement[];
    expect(estado.every((b) => b.disabled)).toBe(true);
    const membresia = screen.getAllByRole('button', {
      name: 'Añadir membresía',
    }) as HTMLButtonElement[];
    expect(membresia.every((b) => b.disabled)).toBe(true);
    const resetAdmin = screen.getAllByRole('button', {
      name: 'Restablecer contraseña del admin',
    }) as HTMLButtonElement[];
    expect(resetAdmin.every((b) => b.disabled)).toBe(true);
  });

  it('"Restablecer contraseña del admin" llama a onRestablecerAdmin con la empresa; deshabilitado en una inactiva', async () => {
    const onRestablecerAdmin = vi.fn();
    const user = userEvent.setup();
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={vi.fn()}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={onRestablecerAdmin}
      />,
    );
    const botones = screen.getAllByRole('button', {
      name: 'Restablecer contraseña del admin',
    }) as HTMLButtonElement[];
    expect(botones).toHaveLength(2); // uno por fila
    // Beta está dada de baja: el backend respondería 409, el botón ni se ofrece.
    expect(botones[0]!.disabled).toBe(false);
    expect(botones[1]!.disabled).toBe(true);
    await user.click(botones[0]!);
    expect(onRestablecerAdmin).toHaveBeenCalledWith(EMPRESAS[0]);
  });

  it('abrir "Restablecer contraseña del admin" DESARMA una baja pendiente', async () => {
    const onAlternarActivo = vi.fn();
    const onRestablecerAdmin = vi.fn();
    const user = userEvent.setup();
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={onAlternarActivo}
        onAnadirMembresia={vi.fn()}
        onRestablecerAdmin={onRestablecerAdmin}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    expect(screen.getByRole('button', { name: '¿Confirmar baja?' })).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Restablecer contraseña del admin' })[0]!);
    expect(onRestablecerAdmin).toHaveBeenCalledWith(EMPRESAS[0]);
    expect(screen.queryByRole('button', { name: '¿Confirmar baja?' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    expect(onAlternarActivo).not.toHaveBeenCalled();
  });

  it('abrir "Añadir membresía" DESARMA una baja pendiente (no queda un clic-a-un-paso de desactivar)', async () => {
    const onAlternarActivo = vi.fn();
    const onAnadirMembresia = vi.fn();
    const user = userEvent.setup();
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={onAlternarActivo}
        onAnadirMembresia={onAnadirMembresia}
        onRestablecerAdmin={vi.fn()}
      />,
    );
    // Armar la baja de Acme (primer clic: pasa a "¿Confirmar baja?").
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    expect(screen.getByRole('button', { name: '¿Confirmar baja?' })).toBeTruthy();
    // Abrir el diálogo de membresía en la misma fila: DEBE desarmar.
    await user.click(screen.getAllByRole('button', { name: 'Añadir membresía' })[0]!);
    expect(onAnadirMembresia).toHaveBeenCalledWith(EMPRESAS[0]);
    // El botón volvió a "Desactivar": un clic ya NO da de baja (vuelve a armar).
    expect(screen.queryByRole('button', { name: '¿Confirmar baja?' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    expect(onAlternarActivo).not.toHaveBeenCalled();
  });
});
