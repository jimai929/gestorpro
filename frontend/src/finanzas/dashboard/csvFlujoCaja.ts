/**
 * Exportación del flujo de caja a CSV, sin dependencias.
 * UTF-8 con BOM y separador `;`. Incluye el criterio del reporte, el rango, el
 * resumen, la tendencia diaria, los métodos de ingreso y TODOS los movimientos
 * (con monto original, vigente, estado y motivo). Si hay un saldo inicial manual,
 * se marca como "valor manual, no verificado".
 */

import type { RespuestaFlujoCaja } from './flujo-caja-tipos';

function celda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return `"${String(valor).replace(/"/g, '""')}"`;
}
function importe(valor: number): string {
  return valor.toFixed(2);
}

export function nombreArchivoCsv(desde: string, hasta: string): string {
  return `flujo-caja-${desde}-a-${hasta}.csv`;
}

export function construirCsvFlujoCaja(
  datos: RespuestaFlujoCaja,
  rango: { desde: string; hasta: string },
  saldoInicialManual: number | null,
  t: (clave: string) => string,
): string {
  const filas: string[] = [];
  const linea = (...celdas: Array<string | number | null>) => filas.push(celdas.join(';'));
  const r = datos.resumen;

  // Criterio y rango.
  linea(celda(t('fin.flujo.titulo')));
  linea(celda(t('fin.flujo.avisoCsv')));
  linea(celda(t('fin.flujo.periodo')), celda(`${rango.desde} / ${rango.hasta}`));
  linea('');

  // Saldo inicial manual (si lo hay), marcado como simulación.
  if (saldoInicialManual !== null) {
    linea(celda(t('fin.flujo.saldoInicialManual')), celda(importe(saldoInicialManual)), celda(t('fin.flujo.marcaManual')));
    linea(celda(t('fin.flujo.saldoFinalProyectado')), celda(importe(saldoInicialManual + r.flujoNeto)), celda(t('fin.flujo.marcaManual')));
    linea('');
  }

  // Resumen.
  linea(celda(t('fin.flujo.resIngresos')), celda(importe(r.totalIngresos)));
  linea(celda(t('fin.flujo.resGastos')), celda(importe(r.totalGastos)));
  linea(celda(t('fin.flujo.resPagos')), celda(importe(r.totalPagosProveedores)));
  linea(celda(t('fin.flujo.resSalidas')), celda(importe(r.totalSalidas)));
  linea(celda(t('fin.flujo.resNeto')), celda(importe(r.flujoNeto)));
  linea('');

  // Métodos de ingreso.
  linea(celda(t('fin.flujo.csvMetodos')));
  linea(celda(t('fin.flujo.thMetodo')), celda(t('fin.flujo.thMonto')), celda('%'), celda(t('fin.flujo.thRegistros')));
  for (const m of datos.porMetodoIngreso) {
    linea(celda(t(`fin.arqueo.${m.metodo}`)), celda(importe(m.monto)), celda(m.porcentaje), celda(m.registros));
  }
  linea('');

  // Tendencia diaria.
  linea(celda(t('fin.flujo.csvDias')));
  linea(
    celda(t('fin.flujo.thFecha')), celda(t('fin.flujo.resIngresos')), celda(t('fin.flujo.resGastos')),
    celda(t('fin.flujo.resPagos')), celda(t('fin.flujo.resSalidas')), celda(t('fin.flujo.resNeto')), celda(t('fin.flujo.thAcumulado')),
  );
  for (const d of datos.porDia) {
    linea(celda(d.fecha), celda(importe(d.ingresos)), celda(importe(d.gastos)), celda(importe(d.pagosProveedores)), celda(importe(d.salidas)), celda(importe(d.flujoNeto)), celda(importe(d.acumuladoDesdeInicioPeriodo)));
  }
  linea('');

  // Movimientos.
  linea(celda(t('fin.flujo.csvMovimientos')));
  linea(
    celda(t('fin.flujo.thFecha')), celda(t('fin.flujo.thTipo')), celda(t('fin.flujo.thObjeto')),
    celda(t('fin.flujo.thOriginal')), celda(t('fin.flujo.thVigente')), celda(t('fin.flujo.thEstado')),
    celda(t('fin.flujo.thMotivo')), celda(t('fin.flujo.thUsuario')),
  );
  for (const m of datos.movimientos) {
    linea(
      celda(m.fecha), celda(t(`fin.flujo.tipo.${m.tipo}`)), celda(m.descripcion),
      celda(importe(m.montoOriginal)), celda(importe(m.montoVigente)),
      celda(t(`fin.corr.estado${m.estado[0]!.toUpperCase()}${m.estado.slice(1)}`)),
      celda(m.motivoCorreccion), celda(m.registradoPor),
    );
  }

  return filas.join('\r\n');
}

export function descargarCsvFlujoCaja(
  datos: RespuestaFlujoCaja,
  rango: { desde: string; hasta: string },
  saldoInicialManual: number | null,
  t: (clave: string) => string,
): void {
  const contenido = construirCsvFlujoCaja(datos, rango, saldoInicialManual, t);
  const blob = new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivoCsv(rango.desde, rango.hasta);
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
