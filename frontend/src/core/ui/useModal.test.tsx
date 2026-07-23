import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useModal } from './useModal';

/** Diálogo mínimo de prueba con dos controles y un botón externo (el "fondo"). */
function Dialogo({ onCerrar }: { onCerrar: () => void }) {
  const refModal = useModal<HTMLDivElement>(onCerrar);
  return (
    <div ref={refModal} role="dialog" aria-modal="true" aria-label="Diálogo de prueba">
      <input placeholder="campo" />
      <button type="button">Aceptar</button>
    </div>
  );
}

function Pantalla() {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir
      </button>
      {abierto && <Dialogo onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

describe('useModal — comportamiento accesible compartido de los modales', () => {
  it('al abrir enfoca el primer control del diálogo', async () => {
    const user = userEvent.setup();
    render(<Pantalla />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByPlaceholderText('campo')).toBe(document.activeElement);
  });

  it('Escape cierra el diálogo', async () => {
    const user = userEvent.setup();
    render(<Pantalla />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Tab cicla DENTRO del diálogo (trampa de foco en ambos sentidos)', async () => {
    const user = userEvent.setup();
    render(<Pantalla />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    const campo = screen.getByPlaceholderText('campo');
    const aceptar = screen.getByRole('button', { name: 'Aceptar' });

    // campo → Aceptar → (wrap) campo
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(aceptar);
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(campo);
    // Shift+Tab desde el primero envuelve al último.
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(aceptar);
  });

  it('al cerrar devuelve el foco al elemento que lo abrió', async () => {
    const user = userEvent.setup();
    render(<Pantalla />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    await user.click(abrir);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(abrir);
  });

  it('respeta un autoFocus del contenido (no lo pisa)', async () => {
    function DialogoConAutofocus({ onCerrar }: { onCerrar: () => void }) {
      const refModal = useModal<HTMLDivElement>(onCerrar);
      return (
        <div ref={refModal} role="dialog" aria-modal="true" aria-label="Con autofocus">
          <input placeholder="primero" />
          <input placeholder="segundo" autoFocus />
        </div>
      );
    }
    render(<DialogoConAutofocus onCerrar={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByPlaceholderText('segundo'));
  });

  it('modo INLINE (param activo): se engancha al ABRIR y Escape cierra', async () => {
    function PantallaInline() {
      const [abierto, setAbierto] = useState(false);
      const refModal = useModal<HTMLDivElement>(() => setAbierto(false), abierto);
      return (
        <div>
          <button type="button" onClick={() => setAbierto(true)}>
            Abrir inline
          </button>
          {abierto && (
            <div ref={refModal} role="dialog" aria-modal="true" aria-label="Inline">
              <button type="button">Dentro</button>
            </div>
          )}
        </div>
      );
    }
    const user = userEvent.setup();
    render(<PantallaInline />);
    const abrir = screen.getByRole('button', { name: 'Abrir inline' });
    await user.click(abrir);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dentro' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(abrir); // foco devuelto
  });

  it('el onCerrar VIGENTE es el que se invoca (closures actualizadas entre renders)', async () => {
    const primera = vi.fn();
    const segunda = vi.fn();
    function Cambiante() {
      const [fase, setFase] = useState<'a' | 'b'>('a');
      const refModal = useModal<HTMLDivElement>(fase === 'a' ? primera : segunda);
      return (
        <div ref={refModal} role="dialog" aria-modal="true" aria-label="Cambiante">
          <button type="button" onClick={() => setFase('b')}>
            cambiar
          </button>
        </div>
      );
    }
    const user = userEvent.setup();
    render(<Cambiante />);
    await user.click(screen.getByRole('button', { name: 'cambiar' }));
    await user.keyboard('{Escape}');
    expect(primera).not.toHaveBeenCalled();
    expect(segunda).toHaveBeenCalledTimes(1);
  });
});
