import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavegacionEnter } from './useNavegacionEnter';

/** Formulario de prueba que ejercita todas las reglas del hook. */
function Formulario({
  onSubmit,
  conError = false,
  conExtra = false,
}: {
  onSubmit?: () => void;
  conError?: boolean;
  conExtra?: boolean;
}) {
  const { ref, onKeyDown } = useNavegacionEnter<HTMLFormElement>();
  return (
    <form ref={ref} onKeyDown={onKeyDown} onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
      <input aria-label="uno" />
      <input aria-label="dos" aria-invalid={conError || undefined} />
      <input aria-label="off" disabled />
      <input aria-label="ro" readOnly />
      <input aria-label="oculto" style={{ display: 'none' }} />
      <input aria-label="skip" data-enter-skip />
      {conExtra && <input aria-label="extra" />}
      <input aria-label="tres" />
      <textarea aria-label="notas" />
      <input type="checkbox" aria-label="chk" />
      <input aria-label="combo" aria-expanded="true" />
      <input aria-label="ultimo" />
      <button type="button">Cancelar</button>
      <button type="submit" data-enter-submit>Guardar</button>
    </form>
  );
}

/** Enfoca `el` y dispara Enter (con opciones: shiftKey, isComposing, etc.). */
function enterEn(el: HTMLElement, opciones: Partial<KeyboardEventInit> = {}) {
  el.focus();
  fireEvent.keyDown(el, { key: 'Enter', ...opciones });
}

describe('useNavegacionEnter — navegación con Enter', () => {
  it('Enter mueve el foco al SIGUIENTE campo', () => {
    render(<Formulario />);
    enterEn(screen.getByLabelText('uno'));
    expect(document.activeElement).toBe(screen.getByLabelText('dos'));
  });

  it('Shift+Enter mueve el foco al campo ANTERIOR', () => {
    render(<Formulario />);
    enterEn(screen.getByLabelText('dos'), { shiftKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText('uno'));
  });

  it('salta campos disabled / readonly / display:none / data-enter-skip', () => {
    render(<Formulario />);
    enterEn(screen.getByLabelText('dos'));
    // dos → (off, ro, oculto, skip omitidos) → tres
    expect(document.activeElement).toBe(screen.getByLabelText('tres'));
  });

  it('Enter en un campo readonly NO envía el formulario ni salta', () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);
    const ro = screen.getByLabelText('ro');
    enterEn(ro);
    expect(onSubmit).not.toHaveBeenCalled(); // preventDefault bloquea el submit implícito
    expect(document.activeElement).toBe(ro); // readonly no navega
  });

  it('en un textarea, Enter NO navega (deja el salto de línea)', () => {
    render(<Formulario />);
    const notas = screen.getByLabelText('notas');
    enterEn(notas);
    expect(document.activeElement).toBe(notas); // sigue en el textarea
  });

  it('en un checkbox, Enter avanza y NO cambia el valor (Space lo alterna)', () => {
    render(<Formulario />);
    const chk = screen.getByLabelText('chk') as HTMLInputElement;
    expect(chk.checked).toBe(false);
    enterEn(chk);
    expect(chk.checked).toBe(false); // el valor no cambió
    expect(document.activeElement).toBe(screen.getByLabelText('combo')); // avanzó
  });

  it('en un combobox ABIERTO (aria-expanded="true"), Enter NO navega (confirma la opción)', () => {
    render(<Formulario />);
    const combo = screen.getByLabelText('combo');
    enterEn(combo);
    expect(document.activeElement).toBe(combo); // no se movió
  });

  it('si el campo tiene error visible (aria-invalid), Enter NO avanza', () => {
    render(<Formulario conError />);
    const dos = screen.getByLabelText('dos');
    enterEn(dos);
    expect(document.activeElement).toBe(dos); // el foco se queda
  });

  it('en el ÚLTIMO campo, Enter enfoca el botón de envío (no envía)', () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);
    enterEn(screen.getByLabelText('ultimo'));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).not.toHaveBeenCalled(); // no hay envío accidental
  });

  it('Enter en un campo intermedio NO envía el formulario (evita guardado accidental)', () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);
    enterEn(screen.getByLabelText('uno'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('durante composición IME (isComposing) Enter NO navega', () => {
    render(<Formulario />);
    const uno = screen.getByLabelText('uno');
    enterEn(uno, { isComposing: true });
    expect(document.activeElement).toBe(uno); // no saltó (chino/japonés en curso)
  });

  it('Enter con Ctrl/Meta NO navega (se reserva para atajos)', () => {
    render(<Formulario />);
    const uno = screen.getByLabelText('uno');
    enterEn(uno, { ctrlKey: true });
    expect(document.activeElement).toBe(uno);
  });

  it('recalcula el orden cuando aparece un campo dinámico', () => {
    const { rerender } = render(<Formulario />);
    enterEn(screen.getByLabelText('dos'));
    expect(document.activeElement).toBe(screen.getByLabelText('tres'));
    rerender(<Formulario conExtra />);
    enterEn(screen.getByLabelText('dos'));
    expect(document.activeElement).toBe(screen.getByLabelText('extra')); // el nuevo campo entra en la secuencia
  });

  it('DOS formularios no se cruzan el foco (cada uno navega dentro de su contenedor)', () => {
    render(
      <>
        <div data-testid="f1"><Formulario /></div>
        <div data-testid="f2"><Formulario /></div>
      </>,
    );
    const f1 = within(screen.getByTestId('f1'));
    const f2 = within(screen.getByTestId('f2'));
    enterEn(f1.getByLabelText('uno'));
    expect(document.activeElement).toBe(f1.getByLabelText('dos'));
    expect(document.activeElement).not.toBe(f2.getByLabelText('dos'));
  });

  it('Tab conserva su comportamiento nativo (el hook solo actúa con Enter)', async () => {
    const user = userEvent.setup();
    render(<Formulario />);
    screen.getByLabelText('uno').focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('dos'));
  });
});

/** Subformulario div-based con navegación PROPIA (como Proveedor dentro de Factura). */
function SubDiv() {
  const { ref, onKeyDown } = useNavegacionEnter<HTMLDivElement>();
  return (
    <div ref={ref} onKeyDown={onKeyDown} data-testid="interno">
      <input aria-label="int-uno" />
      <input aria-label="int-ultimo" />
      <button type="button" data-enter-submit>Guardar interno</button>
    </div>
  );
}

/** Formulario externo que ANIDA el subformulario dentro de su propio <form>. */
function Externo() {
  const { ref, onKeyDown } = useNavegacionEnter<HTMLFormElement>();
  return (
    <form ref={ref} onKeyDown={onKeyDown} onSubmit={(e) => e.preventDefault()} data-testid="externo">
      <input aria-label="ext-uno" />
      <SubDiv />
      <input aria-label="ext-dos" />
      <button type="submit" data-enter-submit>Guardar externo</button>
    </form>
  );
}

describe('useNavegacionEnter — formularios ANIDADOS (subformulario dentro de otro)', () => {
  it('el subformulario navega DENTRO de sí mismo (no salta al externo)', () => {
    render(<Externo />);
    enterEn(screen.getByLabelText('int-uno'));
    expect(document.activeElement).toBe(screen.getByLabelText('int-ultimo'));
  });

  it('en el último campo del subformulario, Enter enfoca SU botón (no el del externo)', () => {
    render(<Externo />);
    enterEn(screen.getByLabelText('int-ultimo'));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Guardar interno' }));
  });

  it('el formulario externo IGNORA los campos del subformulario anidado', () => {
    render(<Externo />);
    enterEn(screen.getByLabelText('ext-uno'));
    expect(document.activeElement).toBe(screen.getByLabelText('ext-dos')); // salta el sub
  });
});

/**
 * Formulario externo cuyo subformulario se monta TARDE (tras la primera
 * renderización), como el sub-flujo "crear categoría inline" de
 * FormularioGasto: no existe hasta que el usuario lo abre.
 */
function ExternoConSubTardio() {
  const { ref, onKeyDown } = useNavegacionEnter<HTMLFormElement>();
  const [mostrarSub, setMostrarSub] = useState(false);
  return (
    <form ref={ref} onKeyDown={onKeyDown} onSubmit={(e) => e.preventDefault()} data-testid="externo">
      <input aria-label="ext-uno" />
      {!mostrarSub && (
        <button type="button" onClick={() => setMostrarSub(true)}>Mostrar sub</button>
      )}
      {mostrarSub && <SubDiv />}
      <input aria-label="ext-dos" />
      <button type="submit" data-enter-submit>Guardar externo</button>
    </form>
  );
}

describe('useNavegacionEnter — subformulario que se monta DESPUÉS del primer render (P0.5)', () => {
  it('el aislamiento de anidado funciona igual aunque el sub-contenedor no exista al montar el externo', async () => {
    const user = userEvent.setup();
    render(<ExternoConSubTardio />);
    await user.click(screen.getByRole('button', { name: 'Mostrar sub' }));

    // El externo sigue ignorando los campos del sub, igual que si hubiera
    // existido desde el inicio.
    enterEn(screen.getByLabelText('ext-uno'));
    expect(document.activeElement).toBe(screen.getByLabelText('ext-dos'));

    // Y el sub navega dentro de sí mismo, sin fugarse al externo.
    enterEn(screen.getByLabelText('int-uno'));
    expect(document.activeElement).toBe(screen.getByLabelText('int-ultimo'));
    enterEn(screen.getByLabelText('int-ultimo'));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Guardar interno' }));
  });
});
