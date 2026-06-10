import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import QRCode from 'qrcode';
import { PantallaEmpleados } from './PantallaEmpleados';
import * as servicioSedes from '../sedes/servicioSedes';
import * as servicioEmpleados from './servicioEmpleados';
import type { Empleado, EmpleadoCreado } from './tipos';
import type { Sede } from '../sedes/tipos';

// QRCode.toDataURL se mockea con factory explícita (módulo CJS) para controlar
// el éxito/fallo del dibujo local de la imagen.
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn() },
}));
vi.mock('../sedes/servicioSedes');
vi.mock('./servicioEmpleados');
// El LayoutPrincipal real usa useAuth (ContextoAuth); la pantalla bajo prueba no lo
// necesita, así que se sustituye por un passthrough para no montar ese contexto.
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
// Resultado del alta simulada (con qrToken: rama de EmpleadoCreado en manejarGuardado).
const empleadoCreado = vi.hoisted(() => ({
  id: 'e9',
  numero: 'E009',
  nombre: 'Nuevo Empleado',
  sedeId: 'sa',
  salarioFijo: 900,
  turnoId: null,
  activo: true,
  tieneFoto: false,
  roles: [],
  qrToken: 'tok-alta-e9',
}));
// Sustituye el formulario real por un disparador de onGuardado, para aislar el
// comportamiento de manejarGuardado sin teclear todo el alta.
vi.mock('./FormularioEmpleado', () => ({
  FormularioEmpleado: ({ onGuardado }: { onGuardado: (r: EmpleadoCreado) => void }) => (
    <button type="button" onClick={() => onGuardado(empleadoCreado)}>simular-alta</button>
  ),
}));

const sedeA: Sede = {
  id: 'sa', nombre: 'Sede A', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01',
};
const empleadoMaria: Empleado = {
  id: 'e1',
  numero: 'E001',
  nombre: 'María Pérez',
  sedeId: 'sa',
  salarioFijo: 1000,
  turnoId: null,
  activo: true,
  tieneFoto: false,
  roles: [{ id: 'rc', clave: 'cajera', nombre: 'Cajera' }],
};

beforeEach(() => {
  // Limpia el historial de llamadas entre tests (la config del proyecto no activa clearMocks).
  vi.clearAllMocks();
  vi.mocked(servicioSedes.obtenerSedes).mockResolvedValue([sedeA]);
  vi.mocked(servicioEmpleados.obtenerEmpleados).mockResolvedValue([empleadoMaria]);
  vi.mocked(servicioEmpleados.obtenerQr).mockResolvedValue({ qrToken: 'tok-1' });
  // `as never`: toDataURL es sobrecargada y vi.mocked no resuelve la variante Promise.
  vi.mocked(QRCode.toDataURL).mockResolvedValue('data:image/png;base64,QRDEMO' as never);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaEmpleados />
    </MemoryRouter>,
  );
}

describe('PantallaEmpleados — el fallo al dibujar el QR no deja "Generando…" eterno (A5/H7)', () => {
  it('si toDataURL falla, el modal muestra el fallo con Reintentar (token visible, Imprimir off); el reintento redibuja sin rotar', async () => {
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    montar();

    await user.click(await screen.findByRole('button', { name: 'QR' }));

    // Estado de fallo explícito: ni imagen ni "Generando…" perpetuo.
    await screen.findByText('No se pudo generar la imagen del QR.');
    expect(screen.queryByText('Generando…')).toBeNull();
    expect(screen.getByText('tok-1')).toBeTruthy(); // el token en texto sigue visible
    const imprimir = screen.getByRole('button', { name: /imprimir/i }) as HTMLButtonElement;
    expect(imprimir.disabled).toBe(true); // sin imagen no se imprime

    // Reintentar redibuja el MISMO token (el mock por defecto ya resuelve)…
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    await screen.findByRole('img', { name: 'QR de María Pérez' });
    expect(screen.queryByText('No se pudo generar la imagen del QR.')).toBeNull();
    // …sin pasar por regenerarQr: reintentar el dibujo NO rota el secreto.
    expect(vi.mocked(servicioEmpleados.regenerarQr)).not.toHaveBeenCalled();
  });
});

describe('PantallaEmpleados — Regenerar no deja en pantalla el QR anterior, ya revocado (subproducto A5/H7)', () => {
  it('al pulsar "Regenerar QR" con la imagen dibujada, la vieja desaparece de inmediato ("Generando…") y luego aparece la nueva', async () => {
    vi.mocked(servicioEmpleados.regenerarQr).mockResolvedValue({ qrToken: 'tok-2' });
    const user = userEvent.setup();
    montar();

    await user.click(await screen.findByRole('button', { name: 'QR' }));
    await screen.findByRole('img', { name: 'QR de María Pérez' }); // primera imagen dibujada

    // El redibujado del token nuevo queda PENDIENTE para poder observar el estado intermedio.
    let resolverRedibujo!: (dataUrl: string) => void;
    vi.mocked(QRCode.toDataURL).mockImplementationOnce(
      (() => new Promise<string>((res) => { resolverRedibujo = res; })) as never,
    );

    await user.click(screen.getByRole('button', { name: 'Regenerar QR' }));

    // La imagen del token revocado desaparece de inmediato, sin esperar al dibujo nuevo.
    // Si generarImagen no reseteara qrImagen al empezar, la imagen vieja seguiría visible
    // y "Generando…" no aparecería: este findByText fallaría.
    await screen.findByText('Generando…');
    expect(screen.queryByRole('img')).toBeNull();

    await act(async () => { resolverRedibujo('data:image/png;base64,QR2'); });
    await screen.findByRole('img', { name: 'QR de María Pérez' });
    expect(screen.getByText('tok-2')).toBeTruthy(); // el modal ya muestra el token rotado
  });
});

describe('PantallaEmpleados — alta con recarga fallida avisa del éxito sin abrir el QR (H16)', () => {
  it('si la recarga tras el alta falla, el aviso de éxito convive con el error; al reintentar con éxito desaparece', async () => {
    // Cola de cargas: 1ª (montaje) ok y vacía → 2ª (tras el alta) falla → resto ok con la fila nueva.
    vi.mocked(servicioEmpleados.obtenerEmpleados)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('fallo de red'))
      .mockResolvedValue([empleadoCreado]);
    const user = userEvent.setup();
    montar();

    await screen.findByText(/no hay empleados registrados/i);

    await user.click(screen.getByRole('button', { name: /registrar empleado/i }));
    await user.click(screen.getByRole('button', { name: 'simular-alta' }));

    // El aviso de éxito y el error de recarga conviven; el modal QR NO se abre (A1 intacto).
    await screen.findByText(/el empleado se creó correctamente/i);
    expect(screen.getByText('fallo de red')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    // Reintentar: la lista carga, aparece la fila nueva y el aviso deja de hacer falta.
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    await screen.findByText('Nuevo Empleado');
    expect(screen.queryByText(/el empleado se creó correctamente/i)).toBeNull();
  });
});
