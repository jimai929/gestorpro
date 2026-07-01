/**
 * Tipos del dominio de plataforma (super-admin). Coinciden con el contrato de
 * POST /empresas del backend (core/empresa).
 */

/** Body de POST /empresas. Todos los campos son obligatorios. */
export interface DatosNuevaEmpresa {
  nombre: string;
  /** URL-safe: minúsculas, dígitos y guiones (subdominio futuro acme.gestorpro.app). */
  slug: string;
  adminNombre: string;
  adminEmail: string;
  /** Contraseña temporal del primer admin: nacerá con debeCambiarContrasena=true. */
  adminPassword: string;
}

/** Respuesta 201 de POST /empresas. */
export interface EmpresaCreada {
  id: string;
  nombre: string;
  slug: string;
  adminId: string;
}

/** Fila de GET /empresas (listado de tenants). `creadoEn` ISO; `adminEmail` puede ser null. */
export interface EmpresaListada {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  creadoEn: string;
  adminEmail: string | null;
}
