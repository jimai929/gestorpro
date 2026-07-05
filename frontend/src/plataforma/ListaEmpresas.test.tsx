import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListaEmpresas } from './ListaEmpresas';
import type { EmpresaListada } from './tipos';

// Componente presentacional: se prueba por props. i18n cae a español sin proveedor.
// B3: una fila por estado — activa (Acme), suspendida (Beta), cancelada (Gama).
const EMPRESAS: EmpresaListada[] = [
  {
    id: 'e1',
    nombre: 'Acme Panamá',
    slug: 'acme-panama',
    estado: 'activa',
    creadoEn: '2026-06-30T00:00:00.000Z',
    adminEmail: 'ana@acme.com',
  },
  {
    id: 'e2',
    nombre: 'Beta SA',
    slug: 'beta-sa',
    estado: 'suspendida',
    creadoEn: '2026-06-29T00:00:00.000Z',
    adminEmail: 'bob@beta.com',
  },
  {
    id: 'e3',
    nombre: 'Gama Corp',
    slug: 'gama-corp',
    estado: 'cancelada',
    creadoEn: '2026-06-28T00:00:00.000Z',
    adminEmail: 'gis@gama.com',
  },
];

function montar(sobre: Partial<Parameters<typeof ListaEmpresas>[0]> = {}) {
  const props = {
    empresas: EMPRESAS,
    cargando: false,
    error: null,
    onReintentar: vi.fn(),
    onCambiarEstado: vi.fn(),
    onAnadirMembresia: vi.fn(),
    onRestablecerAdmin: vi.fn(),
    ...sobre,
  };
  render(<ListaEmpresas {...props} />);
  return props;
}

describe('ListaEmpresas (B3 — tres estados)', () => {
  it('con datos: renderiza las empresas, su admin y la etiqueta de su ESTADO', () => {
    montar();
    expect(screen.getByText('Acme Panamá')).toBeTruthy();
    expect(screen.getByText('ana@acme.com')).toBeTruthy();
    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByText('Beta SA')).toBeTruthy();
    expect(screen.getByText('Suspendida')).toBeTruthy();
    expect(screen.getByText('Gama Corp')).toBeTruthy();
    expect(screen.getByText('Cancelada')).toBeTruthy();
  });

  it('cargando (sin datos aún): muestra el indicador de carga', () => {
    montar({ empresas: null, cargando: true });
    expect(screen.getByText('Cargando…')).toBeTruthy();
  });

  it('error: muestra el mensaje de error', () => {
    montar({ empresas: null, error: 'Falló la carga' });
    expect(screen.getByText('Falló la carga')).toBeTruthy();
  });

  it('vacío: muestra el estado vacío', () => {
    montar({ empresas: [] });
    expect(screen.getByText('Aún no hay empresas. Crea la primera arriba.')).toBeTruthy();
  });

  it('acciones por estado: activa=Suspender+Cancelar; suspendida=Reactivar+Cancelar; cancelada=NINGUNA transición', () => {
    montar();
    // Suspender: solo la activa (Acme).
    expect(screen.getAllByRole('button', { name: 'Suspender' })).toHaveLength(1);
    // Reactivar: solo la suspendida (Beta) — cancelada NO ofrece reactivar (terminal).
    expect(screen.getAllByRole('button', { name: 'Reactivar' })).toHaveLength(1);
    // Cancelar: activa y suspendida; la cancelada no ofrece NINGÚN botón de estado.
    expect(screen.getAllByRole('button', { name: 'Cancelar empresa' })).toHaveLength(2);
  });

  it('"Suspender" exige DOS clics (armar → confirmar); "Reactivar" es directo', async () => {
    const user = userEvent.setup();
    const props = montar();
    // Primer clic: solo ARMA — un misclic no debe tumbar un tenant completo.
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(props.onCambiarEstado).not.toHaveBeenCalled();
    // Segundo clic (pide confirmación): ejecuta la transición a suspendida.
    await user.click(screen.getByRole('button', { name: '¿Confirmar suspensión?' }));
    expect(props.onCambiarEstado).toHaveBeenCalledWith(EMPRESAS[0], 'suspendida');
    // Reactivar (Beta, suspendida): directo — restaurar acceso no es destructivo.
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));
    expect(props.onCambiarEstado).toHaveBeenCalledWith(EMPRESAS[1], 'activa');
  });

  it('"Cancelar empresa" exige DOS clics y transiciona a cancelada; armar cancelar DESARMA un suspender pendiente (un solo slot)', async () => {
    const user = userEvent.setup();
    const props = montar();
    // Armar suspender en Acme…
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(screen.getByRole('button', { name: '¿Confirmar suspensión?' })).toBeTruthy();
    // …y armar cancelar: el slot único desarma el suspender (nunca dos armadas).
    await user.click(screen.getAllByRole('button', { name: 'Cancelar empresa' })[0]!);
    expect(screen.queryByRole('button', { name: '¿Confirmar suspensión?' })).toBeNull();
    expect(props.onCambiarEstado).not.toHaveBeenCalled();
    // Confirmar la cancelación.
    await user.click(screen.getByRole('button', { name: '¿Cancelar DEFINITIVAMENTE?' }));
    expect(props.onCambiarEstado).toHaveBeenCalledWith(EMPRESAS[0], 'cancelada');
  });

  it('"Añadir membresía" y "Restablecer contraseña del admin": SOLO habilitados sobre la ACTIVA (suspendida y cancelada → disabled)', async () => {
    const user = userEvent.setup();
    const props = montar();
    for (const nombre of ['Añadir membresía', 'Restablecer contraseña del admin']) {
      const botones = screen.getAllByRole('button', { name: nombre }) as HTMLButtonElement[];
      expect(botones).toHaveLength(3); // uno por fila
      expect(botones[0]!.disabled).toBe(false); // activa
      expect(botones[1]!.disabled).toBe(true); // suspendida: el backend daría 409
      expect(botones[2]!.disabled).toBe(true); // cancelada: terminal
    }
    await user.click(screen.getAllByRole('button', { name: 'Añadir membresía' })[0]!);
    expect(props.onAnadirMembresia).toHaveBeenCalledWith(EMPRESAS[0]);
    await user.click(screen.getAllByRole('button', { name: 'Restablecer contraseña del admin' })[0]!);
    expect(props.onRestablecerAdmin).toHaveBeenCalledWith(EMPRESAS[0]);
  });

  it('mientras un cambio de estado está en curso, TODAS las acciones quedan deshabilitadas', () => {
    montar({ actualizandoId: 'e2' });
    const botones = screen.getAllByRole('button', {
      name: /Suspender|Reactivar|Cancelar empresa|Añadir membresía|Restablecer contraseña del admin/,
    }) as HTMLButtonElement[];
    expect(botones.length).toBeGreaterThan(0);
    expect(botones.every((b) => b.disabled)).toBe(true);
  });

  it('"Reactivar" (acción directa en otra fila) DESARMA una transición pendiente', async () => {
    const user = userEvent.setup();
    const props = montar();
    // Armar cancelar en Acme (activa)…
    await user.click(screen.getAllByRole('button', { name: 'Cancelar empresa' })[0]!);
    expect(screen.getByRole('button', { name: '¿Cancelar DEFINITIVAMENTE?' })).toBeTruthy();
    // …y reactivar Beta: ejecuta SU acción y desarma el cancelar de Acme.
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));
    expect(props.onCambiarEstado).toHaveBeenCalledTimes(1);
    expect(props.onCambiarEstado).toHaveBeenCalledWith(EMPRESAS[1], 'activa');
    expect(screen.queryByRole('button', { name: '¿Cancelar DEFINITIVAMENTE?' })).toBeNull();
    // El siguiente clic en Acme solo vuelve a ARMAR (no cancela de un paso).
    await user.click(screen.getAllByRole('button', { name: 'Cancelar empresa' })[0]!);
    expect(props.onCambiarEstado).toHaveBeenCalledTimes(1);
  });

  it('una recarga de la lista (datos nuevos por props) DESARMA una transición pendiente', async () => {
    const user = userEvent.setup();
    const props = {
      empresas: EMPRESAS,
      cargando: false,
      error: null,
      onReintentar: vi.fn(),
      onCambiarEstado: vi.fn(),
      onAnadirMembresia: vi.fn(),
      onRestablecerAdmin: vi.fn(),
    };
    const { rerender } = render(<ListaEmpresas {...props} />);
    await user.click(screen.getAllByRole('button', { name: 'Cancelar empresa' })[0]!);
    expect(screen.getByRole('button', { name: '¿Cancelar DEFINITIVAMENTE?' })).toBeTruthy();
    // Llegan datos nuevos (referencia nueva, p. ej. tras recargar): el armado NO sobrevive.
    rerender(<ListaEmpresas {...props} empresas={[...EMPRESAS]} />);
    expect(screen.queryByRole('button', { name: '¿Cancelar DEFINITIVAMENTE?' })).toBeNull();
    expect(props.onCambiarEstado).not.toHaveBeenCalled();
  });

  it('abrir "Restablecer contraseña del admin" o "Añadir membresía" DESARMA una transición pendiente', async () => {
    const user = userEvent.setup();
    const props = montar();
    // Armar suspender → abrir reset: desarma.
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(screen.getByRole('button', { name: '¿Confirmar suspensión?' })).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Restablecer contraseña del admin' })[0]!);
    expect(props.onRestablecerAdmin).toHaveBeenCalledWith(EMPRESAS[0]);
    expect(screen.queryByRole('button', { name: '¿Confirmar suspensión?' })).toBeNull();
    // Armar cancelar → abrir membresía: desarma (un clic posterior NO cancela).
    await user.click(screen.getAllByRole('button', { name: 'Cancelar empresa' })[0]!);
    expect(screen.getByRole('button', { name: '¿Cancelar DEFINITIVAMENTE?' })).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Añadir membresía' })[0]!);
    expect(props.onAnadirMembresia).toHaveBeenCalledWith(EMPRESAS[0]);
    expect(screen.queryByRole('button', { name: '¿Cancelar DEFINITIVAMENTE?' })).toBeNull();
    expect(props.onCambiarEstado).not.toHaveBeenCalled();
  });
});
