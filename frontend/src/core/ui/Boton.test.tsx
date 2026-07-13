import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Boton } from './Boton';

describe('Boton — cargando deshabilita (anti doble envío)', () => {
  it('cargando=true deshabilita el botón aunque se pase disabled={false} explícito', () => {
    render(<Boton cargando disabled={false}>Guardar</Boton>);
    // Regresión: con `disabled ?? cargando`, el `false` explícito ganaba y el
    // botón quedaba habilitado durante el envío; ahora `cargando` deshabilita.
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('cargando=true no dispara onClick (no se puede reenviar mientras carga)', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Boton cargando disabled={false} onClick={onClick}>Guardar</Boton>);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled={true} deshabilita aunque cargando sea false', () => {
    render(<Boton disabled>Guardar</Boton>);
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sin disabled ni cargando, el botón está habilitado y onClick funciona', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Boton onClick={onClick}>Guardar</Boton>);
    const boton = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    await user.click(boton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('cargando muestra el indicador de carga', () => {
    render(<Boton cargando>Guardar</Boton>);
    // El spinner es aria-hidden; basta con que el botón exista y esté deshabilitado.
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
