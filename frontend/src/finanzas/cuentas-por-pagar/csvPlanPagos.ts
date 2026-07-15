/**
 * Exportación del plan de pagos a CSV, sin dependencias.
 * UTF-8 con BOM y separador `;`. Incluye la cabecera del plan, el resumen por
 * proveedor y TODAS las asignaciones (saldo pendiente, pago planificado, saldo
 * proyectado). El nombre lleva la fecha y la estrategia.
 */

import type { RespuestaPlan } from './plan-pagos-tipos';

function celda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return `"${String(valor).replace(/"/g, '""')}"`;
}
function importe(valor: number): string {
  return valor.toFixed(2);
}

export function nombreArchivoCsv(estrategia: string): string {
  const hoy = new Date().toISOString().slice(0, 10);
  return `plan-pagos-${hoy}-${estrategia}.csv`;
}

export function construirCsvPlanPagos(plan: RespuestaPlan, t: (clave: string) => string): string {
  const filas: string[] = [];
  const linea = (...celdas: Array<string | number | null>) => filas.push(celdas.join(';'));

  // Cabecera del plan.
  linea(celda(t('fin.plan.titulo')));
  linea(celda(t('fin.plan.estrategia')), celda(t(`fin.plan.est.${plan.cabecera.estrategia}`)));
  linea(celda(t('fin.plan.presupuesto')), celda(importe(plan.cabecera.presupuestoDisponible)));
  linea(celda(t('fin.plan.planificado')), celda(importe(plan.cabecera.montoPlanificado)));
  linea(celda(t('fin.plan.noUsado')), celda(importe(plan.cabecera.presupuestoNoUsado)));
  linea(celda(t('fin.plan.deudaProyectada')), celda(importe(plan.cabecera.deudaProyectada)));
  linea('');

  // Resumen por proveedor.
  linea(celda(t('fin.plan.csvProveedores')));
  linea(
    celda(t('fin.plan.thProveedor')),
    celda(t('fin.plan.thDeudaActual')),
    celda(t('fin.plan.thPlanificado')),
    celda(t('fin.plan.thDeudaProyectada')),
    celda(t('fin.plan.thIncluidas')),
    celda(t('fin.plan.thCompletadas')),
  );
  for (const p of plan.resumenPorProveedor) {
    linea(
      celda(p.nombre),
      celda(importe(p.deudaActual)),
      celda(importe(p.montoPlanificado)),
      celda(importe(p.deudaProyectada)),
      celda(p.cantidadFacturasIncluidas),
      celda(p.cantidadFacturasCompletadas),
    );
  }
  linea('');

  // Asignaciones.
  linea(celda(t('fin.plan.csvAsignaciones')));
  linea(
    celda(t('fin.plan.thFecha')),
    celda(t('fin.plan.thFactura')),
    celda(t('fin.plan.thProveedor')),
    celda(t('fin.plan.thDias')),
    celda(t('fin.plan.thSaldo')),
    celda(t('fin.plan.thPago')),
    celda(t('fin.plan.thSaldoProyectado')),
    celda(t('fin.plan.thResultado')),
  );
  for (const a of plan.asignaciones) {
    linea(
      celda(a.fechaCompra),
      celda(a.numeroFactura),
      celda(a.proveedorNombre),
      celda(a.diasAntiguedad),
      celda(importe(a.saldoPendiente)),
      celda(importe(a.montoPlanificado)),
      celda(importe(a.saldoProyectado)),
      celda(t(`fin.plan.resultado.${a.tipoResultado}`)),
    );
  }

  return filas.join('\r\n');
}

export function descargarCsvPlanPagos(plan: RespuestaPlan, t: (clave: string) => string): void {
  const contenido = construirCsvPlanPagos(plan, t);
  const blob = new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivoCsv(plan.cabecera.estrategia);
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
