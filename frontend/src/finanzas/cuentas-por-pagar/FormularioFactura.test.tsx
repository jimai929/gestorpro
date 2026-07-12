import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioFactura } from './FormularioFactura';
import * as servicioCuentas from './servicioCuentas';
import type { Proveedor, Sede } from './tipos';

vi.mock('./servicioCuentas');

const proveedor: Proveedor = {
  id: 'p1',
  nombre: 'Proveedor A',
  identificacionFiscal: null,
  telefono: null,
  personaContacto: null,
  activo: true,
  creadoEn: '2026-01-01',
  deudaTotal: 0,
};
const sede: Sede = {
  id: 's1', nombre: 'Sede A', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(servicioCuentas.obtenerProveedores).mockResolvedValue([proveedor]);
  vi.mocked(servicioCuentas.obtenerSedes).mockResolvedValue([sede]);
});

/** Enfoca `el` y dispara Enter (con opciones: shiftKey, isComposing, etc.). */
function enterEn(el: HTMLElement, opciones: Partial<KeyboardEventInit> = {}) {
  el.focus();
  fireEvent.keyDown(el, { key: 'Enter', ...opciones });
}

async function montar() {
  render(<FormularioFactura onRegistrada={() => {}} />);
  await screen.findByRole('option', { name: /Proveedor A/ });
}

async function abrirProveedorAnidado() {
  await montar();
  fireEvent.click(screen.getByRole('button', { name: '+ Nuevo' }));
  return {
    nombre: screen.getByLabelText('Nombre *'),
    idFiscal: screen.getByLabelText('Identificación fiscal'),
    telefono: screen.getByLabelText('Teléfono'),
    contacto: screen.getByLabelText('Persona de contacto'),
    crearProveedor: screen.getByRole('button', { name: 'Crear proveedor' }),
  };
}

describe('FormularioFactura + FormularioProveedor (real, anidado) — navegación con Enter', () => {
  it('Enter en los campos EXTERNOS se mueve en orden DOM (incluye el <select> nativo de proveedor)', async () => {
    await montar();
    const [proveedorSelect, sedeSelect] = screen.getAllByRole('combobox');
    enterEn(proveedorSelect!);
    expect(document.activeElement).toBe(sedeSelect);
    enterEn(sedeSelect!);
    expect(document.activeElement).toBe(screen.getByLabelText('Número de factura *'));
  });

  it('al abrir el proveedor anidado, Enter navega SOLO dentro del sub-formulario', async () => {
    const { nombre, idFiscal, telefono, contacto } = await abrirProveedorAnidado();
    enterEn(nombre);
    expect(document.activeElement).toBe(idFiscal);
    enterEn(idFiscal);
    expect(document.activeElement).toBe(telefono);
    enterEn(telefono);
    expect(document.activeElement).toBe(contacto);
  });

  it('en el ÚLTIMO campo del Proveedor anidado, Enter enfoca SU botón "Crear proveedor" — NO el de Factura', async () => {
    const { nombre, contacto, crearProveedor } = await abrirProveedorAnidado();
    fireEvent.change(nombre, { target: { value: 'Proveedor Nuevo' } }); // habilita el botón (disabled sin nombre)
    enterEn(contacto);
    expect(document.activeElement).toBe(crearProveedor);
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Registrar factura' }));
  });

  it('navegar con Enter dentro del Proveedor anidado NO dispara el envío de Factura', async () => {
    const { nombre, idFiscal, telefono, contacto } = await abrirProveedorAnidado();
    fireEvent.change(nombre, { target: { value: 'Proveedor Nuevo' } });
    enterEn(nombre);
    enterEn(idFiscal);
    enterEn(telefono);
    enterEn(contacto); // llega al botón Crear proveedor, sin tocar Factura
    expect(vi.mocked(servicioCuentas.crearCompra)).not.toHaveBeenCalled();
  });

  it('al cerrar el Proveedor anidado, la navegación de Factura se recalcula (vuelve a ser directa)', async () => {
    vi.mocked(servicioCuentas.crearProveedor).mockResolvedValue({
      ...proveedor, id: 'p2', nombre: 'Proveedor Nuevo',
    });
    const user = userEvent.setup();
    const { nombre, crearProveedor } = await abrirProveedorAnidado();
    await user.type(nombre, 'Proveedor Nuevo');
    await user.click(crearProveedor);
    await waitFor(() => expect(vi.mocked(servicioCuentas.crearProveedor)).toHaveBeenCalled());

    // El sub-formulario se desmontó tras crear (manejarProveedorCreado cierra mostrarFormProveedor).
    expect(screen.queryByLabelText('Nombre *')).toBeNull();

    // Factura vuelve a navegar directo proveedor → sede, como si el sub nunca hubiera existido.
    const [proveedorSelect, sedeSelect] = screen.getAllByRole('combobox');
    enterEn(proveedorSelect!);
    expect(document.activeElement).toBe(sedeSelect);
  });

  it('cerrar el Proveedor anidado con "Cancelar" (sin crear) también recalcula la navegación de Factura', async () => {
    await abrirProveedorAnidado();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('Nombre *')).toBeNull();
    expect(vi.mocked(servicioCuentas.crearProveedor)).not.toHaveBeenCalled();

    const [proveedorSelect, sedeSelect] = screen.getAllByRole('combobox');
    enterEn(proveedorSelect!);
    expect(document.activeElement).toBe(sedeSelect);
  });

  it('durante composición IME, Enter en un campo real de Factura NO navega (deja escribir el caracter)', async () => {
    await montar();
    const numero = screen.getByLabelText('Número de factura *');
    enterEn(numero, { isComposing: true });
    expect(document.activeElement).toBe(numero); // no se movió
  });
});
