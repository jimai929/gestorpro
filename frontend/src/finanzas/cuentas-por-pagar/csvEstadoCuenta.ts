/**
 * Exportación del estado de cuenta a CSV, sin dependencias.
 *
 * - **UTF-8 con BOM**: sin él, Excel en español abre las tildes y la Ñ como mojibake.
 * - Separador `;`: es el que espera Excel con configuración regional española/latina
 *   (con `,` metería toda la fila en una sola celda).
 * - Importes con 2 decimales y punto decimal (estable y parseable); el texto se
 *   entrecomilla y las comillas internas se duplican (RFC 4180).
 */

import type { EstadoCuentaProveedor } from './tipos';

/** Escapa un valor de texto para CSV. */
function celda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Importe estable para hoja de cálculo: 2 decimales, punto decimal, sin símbolo. */
function importe(valor: number): string {
  return valor.toFixed(2);
}

/** Nombre de archivo: proveedor + rango, sin caracteres problemáticos. */
export function nombreArchivoCsv(estado: EstadoCuentaProveedor): string {
  const proveedor = estado.proveedor.nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // sin tildes
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `estado-cuenta-${proveedor}-${estado.periodo.desde}-a-${estado.periodo.hasta}.csv`;
}

/**
 * Construye el CSV COMPLETO del estado de cuenta ya generado: cabecera (empresa,
 * proveedor, período), saldo inicial, TODOS los movimientos y el saldo final.
 * Nunca exporta "solo lo visible": recibe el estado completo que devolvió el backend.
 */
export function construirCsvEstadoCuenta(
  estado: EstadoCuentaProveedor,
  t: (clave: string, valores?: Record<string, string | number>) => string,
): string {
  const filas: string[] = [];
  const linea = (...celdas: Array<string | number | null>) => filas.push(celdas.join(';'));

  // Cabecera del documento
  linea(celda(t('fin.ec.titulo')));
  if (estado.empresa) linea(celda(t('fin.ec.empresa')), celda(estado.empresa.nombre));
  linea(celda(t('fin.ec.proveedor')), celda(estado.proveedor.nombre));
  if (estado.proveedor.identificacionFiscal) {
    linea(celda(t('fin.prov.idFiscal')), celda(estado.proveedor.identificacionFiscal));
  }
  if (estado.proveedor.telefono) {
    linea(celda(t('fin.prov.telefono')), celda(estado.proveedor.telefono));
  }
  linea(celda(t('fin.ec.periodo')), celda(`${estado.periodo.desde} / ${estado.periodo.hasta}`));
  linea('');

  // Saldos y totales
  linea(celda(t('fin.ec.saldoInicial')), celda(importe(estado.saldoInicial)));
  linea(celda(t('fin.ec.resCompras')), celda(importe(estado.resumen.compras)));
  linea(celda(t('fin.ec.resPagos')), celda(importe(estado.resumen.pagos)));
  linea(
    celda(t('fin.ec.resCorrecciones')),
    celda(importe(estado.resumen.correccionesAnulaciones)),
  );
  linea(celda(t('fin.ec.saldoFinal')), celda(importe(estado.saldoFinal)));
  linea('');

  // Movimientos
  linea(
    celda(t('fin.ec.thFecha')),
    celda(t('fin.ec.thDocumento')),
    celda(t('fin.ec.thConcepto')),
    celda(t('fin.corr.thEstado')),
    celda(t('fin.ec.thMotivo')),
    celda(t('fin.pagos.thRegistradoPor')),
    celda(t('fin.ec.thDebito')),
    celda(t('fin.ec.thCredito')),
    celda(t('fin.ec.thSaldo')),
  );
  linea(
    celda(estado.periodo.desde),
    '',
    celda(t('fin.ec.saldoInicial')),
    '',
    '',
    '',
    '',
    '',
    celda(importe(estado.saldoInicial)),
  );
  for (const m of estado.movimientos) {
    linea(
      celda(m.fecha),
      celda(m.documento),
      celda(m.concepto),
      celda(m.estado ? t(`fin.corr.estado${m.estado[0]!.toUpperCase()}${m.estado.slice(1)}`) : ''),
      celda(m.motivoCorreccion),
      celda(m.registradoPor),
      celda(m.debito ? importe(m.debito) : ''),
      celda(m.credito ? importe(m.credito) : ''),
      celda(importe(m.saldo)),
    );
  }
  linea(
    celda(estado.periodo.hasta),
    '',
    celda(t('fin.ec.saldoFinal')),
    '',
    '',
    '',
    '',
    '',
    celda(importe(estado.saldoFinal)),
  );

  return filas.join('\r\n');
}

/** Dispara la descarga del CSV (BOM incluido). Sin dependencias externas. */
export function descargarCsvEstadoCuenta(
  estado: EstadoCuentaProveedor,
  t: (clave: string, valores?: Record<string, string | number>) => string,
): void {
  const contenido = construirCsvEstadoCuenta(estado, t);
  // ﻿ = BOM: Excel en español necesita la marca para leer UTF-8 sin mojibake.
  const blob = new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivoCsv(estado);
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
