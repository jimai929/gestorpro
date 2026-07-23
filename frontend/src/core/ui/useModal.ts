/**
 * Comportamiento accesible COMPARTIDO de los diálogos modales (aria-modal):
 *
 *  - Escape cierra (llama a `onCerrar`; el llamador decide si puede cerrar,
 *    p. ej. ignorando el cierre mientras un envío está en vuelo).
 *  - Trampa de foco: Tab / Shift+Tab ciclan DENTRO del diálogo (aria-modal
 *    promete que el fondo no es alcanzable; sin trampa, Tab se salía).
 *  - Al abrir: enfoca el primer elemento enfocable del diálogo, salvo que el
 *    diálogo ya contenga el foco (p. ej. un input con autoFocus ganó primero).
 *  - Al cerrar/desmontar: devuelve el foco al elemento que lo tenía antes.
 *
 * Uso (diálogo como COMPONENTE propio, montado solo cuando está abierto):
 *   const refModal = useModal<HTMLDivElement>(onCerrar);
 *   return <div ref={refModal} role="dialog" aria-modal="true" ...>
 *
 * Uso (modal INLINE en la pantalla, renderizado condicional en el JSX del
 * padre): pasar el estado de apertura como `activo`, para que el efecto se
 * enganche al ABRIR (con el ref ya montado) y se limpie al cerrar:
 *   const refModal = useModal<HTMLDivElement>(cerrar, seleccionado !== null);
 *
 * El ref va en el elemento con role="dialog" (o su contenedor de overlay).
 */

import { useEffect, useRef, type RefObject } from 'react';

const SELECTOR_ENFOCABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useModal<T extends HTMLElement>(
  onCerrar: () => void,
  activo = true,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  // El handler puede cambiar entre renders (closures sobre estado); se lee
  // siempre la versión vigente sin re-suscribir el listener.
  const onCerrarVigente = useRef(onCerrar);
  onCerrarVigente.current = onCerrar;

  useEffect(() => {
    if (!activo) return;
    const dialogo = ref.current;
    if (!dialogo) return;

    const focoPrevio = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const enfocables = (): HTMLElement[] =>
      Array.from(dialogo.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE));

    // Foco inicial (si un autoFocus del contenido no lo tomó ya).
    if (!dialogo.contains(document.activeElement)) {
      const primero = enfocables()[0];
      if (primero) {
        primero.focus();
      } else {
        dialogo.tabIndex = -1;
        dialogo.focus();
      }
    }

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCerrarVigente.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const lista = enfocables();
      if (lista.length === 0) {
        e.preventDefault();
        return;
      }
      const primero = lista[0]!;
      const ultimo = lista[lista.length - 1]!;
      const activo = document.activeElement;
      // Fuera del diálogo (no debería pasar con aria-modal, pero es la red de
      // seguridad) o en el borde del ciclo: se envuelve al otro extremo.
      if (e.shiftKey) {
        if (activo === primero || !dialogo.contains(activo)) {
          e.preventDefault();
          ultimo.focus();
        }
      } else if (activo === ultimo || !dialogo.contains(activo)) {
        e.preventDefault();
        primero.focus();
      }
    };

    // En document y en captura: el overlay entero (fondo incluido) responde,
    // gane quien gane el foco en cada momento.
    document.addEventListener('keydown', alTeclear, true);
    return () => {
      document.removeEventListener('keydown', alTeclear, true);
      focoPrevio?.focus();
    };
  }, [activo]);

  return ref;
}
