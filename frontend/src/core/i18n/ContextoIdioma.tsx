/**
 * Contexto de idioma (i18n) de GestorPro.
 *
 * Provee `t(clave, params?)` para traducir texto de UI y `cambiarIdioma`. El
 * idioma elegido se guarda en localStorage; el valor POR DEFECTO es español.
 *
 * El contexto tiene un valor por defecto en español, así que `useTraduccion()`
 * funciona aunque NO haya proveedor (p. ej. en tests que montan un componente
 * suelto): devuelve el texto en español y los tests que afirman cadenas en
 * español siguen pasando sin cambios.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { traducciones, type Idioma } from './idiomas';

const CLAVE_ALMACEN = 'gestorpro.idioma';

function esIdioma(valor: unknown): valor is Idioma {
  return valor === 'es' || valor === 'en' || valor === 'zh';
}

function idiomaInicial(): Idioma {
  try {
    const guardado = localStorage.getItem(CLAVE_ALMACEN);
    if (esIdioma(guardado)) return guardado;
  } catch {
    // localStorage no disponible: usar el defecto.
  }
  return 'es';
}

/** Reemplaza marcadores {clave} en la plantilla por los valores de `params`. */
function interpolar(plantilla: string, params?: Record<string, string | number>): string {
  if (!params) return plantilla;
  return plantilla.replace(/\{(\w+)\}/g, (coincidencia, clave: string) =>
    clave in params ? String(params[clave]) : coincidencia,
  );
}

interface ValorContextoIdioma {
  idioma: Idioma;
  /** Traduce una clave; si falta, cae a español y, si tampoco está, devuelve la clave. */
  t: (clave: string, params?: Record<string, string | number>) => string;
  cambiarIdioma: (idioma: Idioma) => void;
}

function traducir(
  idioma: Idioma,
  clave: string,
  params?: Record<string, string | number>,
): string {
  const texto = traducciones[idioma][clave] ?? traducciones.es[clave] ?? clave;
  return interpolar(texto, params);
}

const ContextoIdioma = createContext<ValorContextoIdioma>({
  idioma: 'es',
  t: (clave, params) => traducir('es', clave, params),
  cambiarIdioma: () => {},
});

export function ProveedorIdioma({ children }: { children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>(idiomaInicial);

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  const cambiarIdioma = useCallback((nuevo: Idioma) => {
    setIdioma(nuevo);
    try {
      localStorage.setItem(CLAVE_ALMACEN, nuevo);
    } catch {
      // Si no se puede persistir, el cambio vale solo para esta sesión.
    }
  }, []);

  const t = useCallback(
    (clave: string, params?: Record<string, string | number>) =>
      traducir(idioma, clave, params),
    [idioma],
  );

  return (
    <ContextoIdioma.Provider value={{ idioma, t, cambiarIdioma }}>
      {children}
    </ContextoIdioma.Provider>
  );
}

/** Hook para traducir y cambiar el idioma. Funciona con o sin proveedor (defecto es). */
export function useTraduccion(): ValorContextoIdioma {
  return useContext(ContextoIdioma);
}
