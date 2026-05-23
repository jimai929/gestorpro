/**
 * Errores de dominio comunes. Las rutas los traducen a códigos HTTP; el resto
 * del código lanza estos en lugar de objetos genéricos, para que el manejo de
 * errores sea explícito y uniforme.
 */

/** Credenciales inválidas o sesión no válida. Las rutas lo mapean a 401. */
export class ErrorAutenticacion extends Error {
  constructor(mensaje = 'Credenciales inválidas.') {
    super(mensaje);
    this.name = 'ErrorAutenticacion';
  }
}

/** Acceso denegado por rol insuficiente. Las rutas lo mapean a 403. */
export class ErrorAutorizacion extends Error {
  constructor(mensaje = 'No tiene permiso para esta operación.') {
    super(mensaje);
    this.name = 'ErrorAutorizacion';
  }
}
