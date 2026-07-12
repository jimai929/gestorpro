/**
 * Navegación por teclado con Enter para formularios de ESCRITORIO (opt-in).
 *
 * Reglas:
 *  - Enter → siguiente campo editable; en el ÚLTIMO campo → enfoca el botón de envío
 *    (NO envía: hay que pulsar Enter otra vez sobre el botón para confirmar).
 *  - Shift+Enter → campo anterior.
 *  - En un campo de formulario "normal" SIEMPRE se bloquea el envío implícito del
 *    `<form>` (preventDefault), aunque el campo no navegue (p. ej. readonly): así
 *    Enter nunca guarda por accidente.
 *  - Salta campos: disabled, readonly, hidden, no visibles (display:none/visibility),
 *    tabindex="-1" y los marcados con `data-enter-skip`. Un campo no renderizado
 *    (fuera del DOM) se salta solo.
 *  - NO intercepta (Enter conserva su función natural): textarea (salto de línea),
 *    contenteditable, botones, input file, combobox/listbox abierto (aria-expanded),
 *    composición IME (isComposing), y Enter con Ctrl/Alt/Meta.
 *  - `data-enter-skip`: el control gestiona su PROPIO Enter (no se navega ni se
 *    bloquea el submit). En un `<form>`, marcar así un input de texto puede reactivar
 *    el envío implícito: úsalo solo en controles que manejen Enter (p. ej. comboboxes).
 *  - Si el campo actual muestra un error visible (aria-invalid="true") NO avanza:
 *    mantiene el foco. No sustituye a la validación final del submit.
 *  - checkbox/radio: Enter avanza (no cambia el valor; Space sigue alternando).
 *  - Foco limitado al contenedor del `ref`: dos formularios (incluso ANIDADOS, p. ej.
 *    un subformulario dentro de otro) no se cruzan el foco — el Enter lo maneja SOLO
 *    el contenedor de navegación más interno.
 *
 * Uso:
 *   const { ref, onKeyDown } = useNavegacionEnter<HTMLFormElement>();
 *   <form ref={ref} onKeyDown={onKeyDown} onSubmit={...}>…</form>
 * El botón principal se marca con `data-enter-submit` (o es `button[type="submit"]`).
 * No usa listeners globales de `document`/`window`.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';

const SELECTOR_CAMPOS = 'input, select, textarea';
const MARCA = 'data-nav-enter';

/** ¿El campo participa en la navegación (visible y editable)? */
function esNavegable(el: HTMLElement): boolean {
  const campo = el as HTMLInputElement;
  if (campo.disabled || campo.readOnly) return false;
  const tipo = campo.type;
  if (tipo === 'hidden' || tipo === 'file') return false;
  if (el.getAttribute('tabindex') === '-1') return false;
  if (el.hasAttribute('data-enter-skip')) return false;
  const estilo = getComputedStyle(el);
  if (estilo.display === 'none' || estilo.visibility === 'hidden') return false;
  // offsetParent === null ⇒ oculto por un ancestro (display:none). Solo se aplica en
  // el navegador: en jsdom no hay layout (offsetParent siempre null) y descartaría
  // TODO; por eso se usa únicamente cuando el entorno calcula layout.
  const hayLayout = document.body.getClientRects().length > 0;
  if (hayLayout && el.offsetParent === null && estilo.position !== 'fixed') return false;
  return true;
}

/** True si `el` pertenece a ESTE contenedor de navegación y no a uno más interno. */
function esPropio(el: HTMLElement, cont: HTMLElement): boolean {
  return el.closest(`[${MARCA}]`) === cont;
}

/** Campos navegables PROPIOS del contenedor (excluye los de un nav anidado). */
function camposNavegables(cont: HTMLElement): HTMLElement[] {
  return Array.from(cont.querySelectorAll<HTMLElement>(SELECTOR_CAMPOS)).filter(
    (el) => esPropio(el, cont) && esNavegable(el),
  );
}

/** Botón de envío PROPIO del contenedor (no el de un formulario anidado). */
function botonEnvio(cont: HTMLElement): HTMLElement | null {
  const primeroPropio = (sel: string) =>
    Array.from(cont.querySelectorAll<HTMLElement>(sel)).find((b) => esPropio(b, cont));
  return (
    primeroPropio('[data-enter-submit]') ??
    primeroPropio('button[type="submit"]') ??
    Array.from(cont.querySelectorAll<HTMLElement>('button'))
      .filter((b) => esPropio(b, cont))
      .pop() ??
    null
  );
}

export function useNavegacionEnter<T extends HTMLElement = HTMLFormElement>() {
  const ref = useRef<T>(null);
  // Marca el contenedor: permite distinguir formularios ANIDADOS (el Enter dentro de
  // un subformulario con su propia navegación lo maneja SOLO el más interno).
  useEffect(() => {
    ref.current?.setAttribute(MARCA, '');
  }, []);

  function onKeyDown(evento: KeyboardEvent<T>) {
    if (evento.key !== 'Enter') return;
    const nativo = evento.nativeEvent;
    if (nativo.isComposing || nativo.keyCode === 229) return; // IME en composición
    if (evento.ctrlKey || evento.altKey || evento.metaKey) return; // atajos con modificador

    const objetivo = evento.target as HTMLElement;
    const etiqueta = objetivo.tagName;
    // Enter conserva su función natural (ni navega ni bloquea el envío):
    if (etiqueta === 'TEXTAREA' || objetivo.isContentEditable) return; // salto de línea
    if (etiqueta === 'BUTTON') return; // el botón/submit se activa (2ª pulsación)
    const tipoObjetivo = (objetivo as HTMLInputElement).type;
    if (tipoObjetivo === 'file' || tipoObjetivo === 'submit' || tipoObjetivo === 'button' || tipoObjetivo === 'reset') return;
    if (objetivo.getAttribute('aria-expanded') === 'true') return; // combobox/listbox abierto
    if (objetivo.hasAttribute('data-enter-skip')) return; // el control gestiona su Enter

    const cont = ref.current;
    if (!cont) return;
    // Evento nacido en un subformulario con navegación PROPIA (más interno) → que lo
    // maneje ESE; este contenedor externo no toca el foco ni bloquea nada.
    if (!esPropio(objetivo, cont)) return;

    // Campo de formulario normal de ESTE contenedor: bloquea SIEMPRE el envío
    // implícito del <form> al pulsar Enter (evita el guardado accidental).
    evento.preventDefault();

    const campos = camposNavegables(cont);
    const i = campos.indexOf(objetivo);
    if (i === -1) return; // no navegable (p. ej. readonly): sin submit y sin salto
    if (objetivo.getAttribute('aria-invalid') === 'true') return; // error visible: se queda

    if (evento.shiftKey) {
      campos[i - 1]?.focus();
      return;
    }
    const siguiente = campos[i + 1];
    if (siguiente) siguiente.focus();
    else botonEnvio(cont)?.focus(); // último campo → enfoca el botón (no envía aún)
  }

  return { ref, onKeyDown };
}
