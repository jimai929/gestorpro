import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListaUsuarios } from './ListaUsuarios';
import type { UsuarioListado } from './tipos';

// Componente presentacional: se prueba por props. i18n cae a español sin proveedor.
const USUARIOS: UsuarioListado[] = [
  {
    id: 'u1',
    nombre: 'Ana Empleada',
    email: 'ana@acme.com',
    rol: 'empleado',
    activo: true,
    debeCambiarContrasena: true,
    creadoEn: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'u2',
    nombre: 'Berta Admin',
    email: 'berta@acme.com',
    rol: 'administrador',
    activo: true,
    debeCambiarContrasena: false,
    creadoEn: '2026-06-29T00:00:00.000Z',
  },
  {
    id: 'u3',
    nombre: 'Carlos Baja',
    email: 'carlos@acme.com',
    rol: 'empleado',
    activo: false,
    debeCambiarContrasena: false,
    creadoEn: '2026-06-28T00:00:00.000Z',
  },
];

describe('ListaUsuarios', () => {
  it('con datos: renderiza nombre, correo, rol traducido y el badge de temporal pendiente', () => {
    render(
      <ListaUsuarios
        usuarios={USUARIOS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onRestablecer={vi.fn()}
        onAlternarActivo={vi.fn()}
        idActual={null}
      />,
    );
    expect(screen.getByText('Ana Empleada')).toBeTruthy();
    expect(screen.getByText('ana@acme.com')).toBeTruthy();
    expect(screen.getAllByText('Empleado')).toHaveLength(2); // rol de la membresía, traducido
    expect(screen.getByText('Administrador')).toBeTruthy();
    // Solo Ana tiene la contraseña temporal pendiente de rotar.
    expect(screen.getAllByText('Temporal pendiente')).toHaveLength(1);
    // Estado de la cuenta visible: solo Carlos está dado de baja.
    expect(screen.getAllByText('Activo')).toHaveLength(2);
    expect(screen.getAllByText('Inactivo')).toHaveLength(1);
  });

  it('cargando (sin datos aún): muestra el indicador de carga', () => {
    render(
      <ListaUsuarios
        usuarios={null}
        cargando={true}
        error={null}
        onReintentar={vi.fn()}
        onRestablecer={vi.fn()}
        onAlternarActivo={vi.fn()}
        idActual={null}
      />,
    );
    expect(screen.getByText('Cargando usuarios…')).toBeTruthy();
  });

  it('error: muestra el mensaje y el botón de reintentar', async () => {
    const onReintentar = vi.fn();
    const user = userEvent.setup();
    render(
      <ListaUsuarios
        usuarios={null}
        cargando={false}
        error="Falló la carga"
        onReintentar={onReintentar}
        onRestablecer={vi.fn()}
        onAlternarActivo={vi.fn()}
        idActual={null}
      />,
    );
    expect(screen.getByText('Falló la carga')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalled();
  });

  it('vacío: muestra el estado vacío', () => {
    render(
      <ListaUsuarios
        usuarios={[]}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onRestablecer={vi.fn()}
        onAlternarActivo={vi.fn()}
        idActual={null}
      />,
    );
    expect(screen.getByText('No hay usuarios registrados todavía.')).toBeTruthy();
  });

  it('"Restablecer contraseña" llama a onRestablecer con el usuario de la fila', async () => {
    const onRestablecer = vi.fn();
    const user = userEvent.setup();
    render(
      <ListaUsuarios
        usuarios={USUARIOS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onRestablecer={onRestablecer}
        onAlternarActivo={vi.fn()}
        idActual={null}
      />,
    );
    const botones = screen.getAllByRole('button', {
      name: 'Restablecer contraseña',
    }) as HTMLButtonElement[];
    expect(botones).toHaveLength(3); // uno por fila (nadie es la sesión actual)
    await user.click(botones[0]!);
    expect(onRestablecer).toHaveBeenCalledWith(USUARIOS[0]);
    // La cuenta desactivada NO se puede restablecer (el login la rechazaría igual:
    // el 204 sería un "éxito" engañoso).
    expect(botones[2]!.disabled).toBe(true);
    expect(botones[0]!.disabled).toBe(false);
  });

  it('la fila del PROPIO usuario no ofrece "Restablecer" (va por el autoservicio)', () => {
    render(
      <ListaUsuarios
        usuarios={USUARIOS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onRestablecer={vi.fn()}
        onAlternarActivo={vi.fn()}
        idActual="u2"
      />,
    );
    // Las filas ajenas tienen el botón; la propia muestra la marca "Tu cuenta".
    expect(screen.getAllByRole('button', { name: 'Restablecer contraseña' })).toHaveLength(2);
    expect(screen.getByText('Tu cuenta')).toBeTruthy();
  });

  it('"Desactivar" en fila activa y "Reactivar" en fila inactiva llaman a onAlternarActivo', async () => {
    const onAlternarActivo = vi.fn();
    const user = userEvent.setup();
    render(
      <ListaUsuarios
        usuarios={USUARIOS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onRestablecer={vi.fn()}
        onAlternarActivo={onAlternarActivo}
        idActual={null}
      />,
    );
    // Filas activas (Ana, Berta) ofrecen "Desactivar"; la inactiva (Carlos), "Reactivar".
    expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(2);
    const reactivar = screen.getByRole('button', { name: 'Reactivar' });
    await user.click(reactivar);
    expect(onAlternarActivo).toHaveBeenCalledWith(USUARIOS[2]);
    await user.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]!);
    expect(onAlternarActivo).toHaveBeenCalledWith(USUARIOS[0]);
  });

  it('mientras una fila se actualiza, TODAS las acciones quedan deshabilitadas', () => {
    render(
      <ListaUsuarios
        usuarios={USUARIOS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onRestablecer={vi.fn()}
        onAlternarActivo={vi.fn()}
        actualizandoId="u1"
        idActual={null}
      />,
    );
    // Un solo slot de actualizandoId/errorAccion: mutaciones concurrentes se pisarían
    // (botones rehabilitados en vuelo, errores silenciados). Se congela TODA la tabla.
    const desactivar = screen.getAllByRole('button', { name: 'Desactivar' }) as HTMLButtonElement[];
    expect(desactivar.every((b) => b.disabled)).toBe(true);
    const restablecer = screen.getAllByRole('button', {
      name: 'Restablecer contraseña',
    }) as HTMLButtonElement[];
    expect(restablecer.every((b) => b.disabled)).toBe(true);
    expect((screen.getByRole('button', { name: 'Reactivar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('la fila del PROPIO usuario tampoco ofrece Desactivar/Reactivar', () => {
    render(
      <ListaUsuarios
        usuarios={USUARIOS}
        cargando={false}
        error={null}
        onReintentar={vi.fn()}
        onRestablecer={vi.fn()}
        onAlternarActivo={vi.fn()}
        idActual="u2"
      />,
    );
    // Solo Ana (activa, ajena) ofrece Desactivar; la propia fila muestra "Tu cuenta".
    expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(1);
    expect(screen.getByText('Tu cuenta')).toBeTruthy();
  });

  it('error con datos YA cargados: banner visible y la tabla NO desaparece', () => {
    render(
      <ListaUsuarios
        usuarios={USUARIOS}
        cargando={false}
        error="Falló el refresh"
        onReintentar={vi.fn()}
        onRestablecer={vi.fn()}
        onAlternarActivo={vi.fn()}
        idActual={null}
      />,
    );
    // Mismo criterio que ListaEmpresas: un refresh fallido tras crear/restablecer no
    // debe ocultar el listado que ya se tenía (el admin sigue viendo los datos).
    expect(screen.getByText('Falló el refresh')).toBeTruthy();
    expect(screen.getByText('Ana Empleada')).toBeTruthy();
  });
});
