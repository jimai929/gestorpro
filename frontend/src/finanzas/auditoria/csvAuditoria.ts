/**
 * Exportación del centro de auditoría a CSV, sin dependencias.
 * UTF-8 con BOM y separador `;` (Excel en español). Exporta el conjunto COMPLETO
 * filtrado que recibe, no una página.
 */

import type { RegistroAuditoria } from './tipos';

function celda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return `"${String(valor).replace(/"/g, '""')}"`;
}

function importe(valor: number): string {
  return valor.toFixed(2);
}

/** Nombre de archivo con el rango (o "todo" si no hay filtro de fechas). */
export function nombreArchivoCsv(desde: string, hasta: string): string {
  const rango = desde || hasta ? `${desde || 'inicio'}-a-${hasta || 'hoy'}` : 'todo';
  return `auditoria-correcciones-${rango}.csv`;
}

/**
 * CSV de todo el conjunto filtrado. `t` traduce las cabeceras; los datos van en
 * crudo (el CSV es para hoja de cálculo, no una vista traducida por celda).
 */
export function construirCsvAuditoria(
  registros: RegistroAuditoria[],
  t: (clave: string) => string,
): string {
  const filas: string[] = [];
  const linea = (...celdas: Array<string | number | null>) => filas.push(celdas.join(';'));

  linea(
    celda(t('fin.aud.thFecha')),
    celda(t('fin.aud.thModulo')),
    celda(t('fin.aud.thAccion')),
    celda(t('fin.aud.thObjeto')),
    celda(t('fin.aud.thOriginal')),
    celda(t('fin.aud.thVigente')),
    celda(t('fin.aud.thDiferencia')),
    celda(t('fin.aud.thMotivo')),
    celda(t('fin.aud.thUsuario')),
    celda(t('fin.aud.thRegistroOriginal')),
    celda(t('fin.aud.thReverso')),
    celda(t('fin.aud.thCorreccion')),
  );

  for (const r of registros) {
    linea(
      celda(r.fechaCorreccion.slice(0, 10)),
      celda(t(`fin.aud.entidad.${r.entidad}`)),
      celda(t(`fin.aud.accion.${r.accion}`)),
      celda(r.descripcion),
      celda(importe(r.montoOriginal)),
      celda(importe(r.montoVigente)),
      celda(importe(r.diferencia)),
      celda(r.motivo),
      celda(r.registradoPor.nombre),
      celda(r.registroOriginalId),
      celda(r.reversoId),
      celda(r.correccionId),
    );
  }

  return filas.join('\r\n');
}

/** Dispara la descarga del CSV (BOM incluido). */
export function descargarCsvAuditoria(
  registros: RegistroAuditoria[],
  desde: string,
  hasta: string,
  t: (clave: string) => string,
): void {
  const contenido = construirCsvAuditoria(registros, t);
  const blob = new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivoCsv(desde, hasta);
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
