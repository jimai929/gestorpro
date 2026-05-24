/** Resultado de una verificación facial 1:1 con liveness. */
export interface ResultadoVerificacionFacial {
  coincide: boolean;
  liveness: boolean;
  confianza: number;
}

/**
 * Verificador facial: comprueba 1:1 que la cara capturada corresponde a la foto
 * de referencia del empleado, con detección de vida. Es una interfaz ENCHUFABLE:
 * el resto del código depende solo de este contrato, no de un proveedor concreto.
 */
export interface VerificadorFacial {
  verificar(entrada: {
    fotoReferencia: string | null;
    fotoCaptura: string;
  }): Promise<ResultadoVerificacionFacial>;
}

/**
 * Implementación SIMULADA (no usa biometría real). Permite construir y demostrar
 * todo el flujo de fichaje sin un proveedor biométrico; se reemplaza por una
 * implementación real (servicio en la nube o librería) conectándola en su lugar,
 * sin tocar el resto del código.
 *
 * Convención de `fotoCaptura` en simulación:
 *  - 'sim:nomatch' → no coincide.
 *  - 'sim:nolive'  → coincide pero sin vida (falla liveness).
 *  - cualquier otro valor → coincide y con vida.
 */
export const verificadorFacialSimulado: VerificadorFacial = {
  async verificar({ fotoCaptura }) {
    if (fotoCaptura === 'sim:nomatch') {
      return { coincide: false, liveness: true, confianza: 0.12 };
    }
    if (fotoCaptura === 'sim:nolive') {
      return { coincide: true, liveness: false, confianza: 0.95 };
    }
    return { coincide: true, liveness: true, confianza: 0.99 };
  },
};

/** La verificación facial es exitosa solo si coincide Y hay vida. */
export function facialExitosa(resultado: ResultadoVerificacionFacial): boolean {
  return resultado.coincide && resultado.liveness;
}
