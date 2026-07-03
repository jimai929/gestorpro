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

  it('mientras un cambio de estado está en curso, TODAS las acciones quedan deshabilitadas', () => {
    render(
      <ListaEmpresas
        empresas={EMPRESAS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onEntrar={vi.fn()}
        onAlternarActivo={vi.fn()}
        actualizandoId="e2"
      />,
    );
    const entrar = screen.getAllByRole('button', { name: 'Entrar' }) as HTMLButtonElement[];
    expect(entrar.every((b) => b.disabled)).toBe(true);
    const estado = screen.getAllByRole('button', {
      name: /Desactivar|Reactivar/,
    }) as HTMLButtonElement[];
    expect(estado.every((b) => b.disabled)).toBe(true);
  });
});
