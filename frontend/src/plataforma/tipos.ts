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

/** Respuesta de PATCH /empresas/:id (baja/reactivación lógica del tenant). */
export interface EmpresaEstado {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
}

/** Rol asignable en una membresía (misma lista blanca que el backend). */
export type RolMembresia = 'administrador' | 'empleado';

/** Respuesta 201 de POST /empresas/:id/membresias (alta multi-empresa). */
export interface MembresiaCreada {
  id: string;
  usuarioId: string;
  empresaId: string;
  email: string;
  rol: RolMembresia;
}

/**
 * Respuesta 200 de POST /empresas/:id/restablecer-admin. Superficie MÍNIMA, IDÉNTICA al
 * contrato del backend: SOLO la temporal (en claro, se muestra UNA vez) y el flag. NO trae
 * `usuarioId` ni `email` (la identidad del admin solo se registra en AuditoriaPlataforma).
 */
export interface AdminRestablecido {
  contrasenaTemporal: string;
  debeCambiarContrasena: true;
}
