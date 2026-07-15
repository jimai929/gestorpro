/**
 * Exportación de la antigüedad de cuentas por pagar a CSV, sin dependencias.
 * UTF-8 con BOM y separador `;` (Excel en español). Exporta el conjunto COMPLETO
 * filtrado (resumen por proveedor + todas las facturas pendientes), no una página.
 */

import type { ProveedorAntiguedad, FacturaAntiguedad } from './antiguedad-tipos';

function celda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return `"${String(valor).replace(/"/g, '""')}"`;
}
function importe(valor: number): string {
  return valor.toFixed(2);
}

export function nombreArchivoCsv(tramo: string): string {
  const hoy = new Date().toISOString().slice(0, 10);
  const sufijo = tramo && tramo !== 'todos' ? `-${tramo}` : '';
  return `antiguedad-cuentas-por-pagar-${hoy}${sufijo}.csv`;
}

export function construirCsvAntiguedad(
  proveedores: ProveedorAntiguedad[],
  facturas: FacturaAntiguedad[],
  t: (clave: string) => string,
): string {
  const filas: string[] = [];
  const linea = (...celdas: Array<string | number | null>) => filas.push(celdas.join(';'));

  // Bloque 1: resumen por proveedor.
  linea(celda(t('fin.ant.csvProveedores')));
  linea(
    celda(t('fin.ant.thProveedor')),
    celda(t('fin.prov.idFiscal')),
    celda(t('fin.ant.thDeuda')),
    celda(t('fin.ant.thFacturas')),
    celda(t('fin.ant.tramo0a30')),
    celda(t('fin.ant.tramo31a60')),
    celda(t('fin.ant.tramo61a90')),
    celda(t('fin.ant.tramo90Mas')),
    celda(t('fin.ant.thMasAntigua')),
  );
  for (const p of proveedores) {
    linea(
      celda(p.nombre),
      celda(p.identificacionFiscal),
      celda(importe(p.deudaTotal)),
      celda(p.cantidadFacturas),
      celda(importe(p.deuda0a30)),
      celda(importe(p.deuda31a60)),
      celda(importe(p.deuda61a90)),
      celda(importe(p.deuda90Mas)),
      celda(`${p.facturaMasAntiguaDias} (${p.facturaMasAntiguaFecha})`),
    );
  }

  linea('');

  // Bloque 2: facturas pendientes.
  linea(celda(t('fin.ant.csvFacturas')));
  linea(
    celda(t('fin.ant.thFecha')),
    celda(t('fin.ant.thFactura')),
    celda(t('fin.ant.thProveedor')),
    celda(t('fin.ant.thOriginal')),
    celda(t('fin.ant.thPagos')),
    celda(t('fin.ant.thSaldo')),
    celda(t('fin.ant.thDias')),
    celda(t('fin.ant.thTramo')),
    celda(t('fin.ant.thUltimoPago')),
  );
  for (const f of facturas) {
    linea(
      celda(f.fechaCompra),
      celda(f.numeroFactura),
      celda(f.proveedorNombre),
      celda(importe(f.montoOriginal)),
      celda(importe(f.pagosVigentes)),
      celda(importe(f.saldoPendiente)),
      celda(f.diasAntiguedad),
      celda(t(`fin.ant.${f.tramo}`)),
      celda(f.ultimoPago),
    );
  }

  return filas.join('\r\n');
}

export function descargarCsvAntiguedad(
  proveedores: ProveedorAntiguedad[],
  facturas: FacturaAntiguedad[],
  tramo: string,
  t: (clave: string) => string,
): void {
  const contenido = construirCsvAntiguedad(proveedores, facturas, t);
  const blob = new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivoCsv(tramo);
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
