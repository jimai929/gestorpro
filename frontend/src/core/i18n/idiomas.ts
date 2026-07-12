/**
 * Catálogo de idiomas y diccionarios de traducción de la UI de GestorPro.
 *
 * Convención del proyecto: el idioma POR DEFECTO es español (los usuarios en
 * Panamá trabajan en español); inglés y chino son alternativas seleccionables.
 * Solo se traduce el texto de INTERFAZ — los datos (categorías, roles operativos,
 * nombres) y los mensajes del backend siguen en español.
 *
 * Las claves son planas con notación por puntos (p. ej. `login.entrar`). Mantener
 * la entrada `es` idéntica al texto que ya mostraba la UI: así los tests que
 * afirman cadenas en español siguen pasando (el idioma por defecto es `es`).
 */

import { finanzas } from './modulos/finanzas';
import { administracion } from './modulos/administracion';
import { asistencia } from './modulos/asistencia';
import { plataforma } from './modulos/plataforma';

export type Idioma = 'es' | 'en' | 'zh';

/** Idiomas disponibles, con su nombre en su propia lengua (no se traduce). */
export const IDIOMAS: { codigo: Idioma; etiqueta: string }[] = [
  { codigo: 'es', etiqueta: 'Español' },
  { codigo: 'en', etiqueta: 'English' },
  { codigo: 'zh', etiqueta: '中文' },
];

type Diccionario = Record<string, string>;

const es: Diccionario = {
  // Común / chrome
  'comun.cerrarSesion': 'Cerrar sesión',
  'comun.idioma': 'Idioma',
  'comun.cancelar': 'Cancelar',
  'comun.guardar': 'Guardar',
  'comun.guardando': 'Guardando…',
  'comun.cargando': 'Cargando…',
  'comun.cerrar': 'Cerrar',
  'comun.editar': 'Editar',
  'comun.eliminar': 'Eliminar',
  'comun.volver': 'Volver',
  'comun.continuar': 'Continuar',
  'comun.filtrar': 'Filtrar',
  'comun.actualizar': 'Actualizar',
  'comun.opcional': 'opcional',
  'comun.todos': 'Todos',
  'comun.si': 'Sí',
  'comun.no': 'No',
  'comun.desde': 'Desde',
  'comun.hasta': 'Hasta',
  'comun.errorGenerico': 'Ocurrió un error. Intenta de nuevo.',
  'rol.empleado': 'Empleado',
  'rol.supervisor': 'Supervisor',
  'rol.administrador': 'Administrador',

  // Login
  'login.subtitulo': 'Administración empresarial',
  'login.correo': 'Correo electrónico',
  'login.contrasena': 'Contraseña',
  'login.entrar': 'Iniciar sesión',
  'login.entrando': 'Entrando…',
  'login.pie': 'Solo personal autorizado. Contacta al administrador para obtener acceso.',
  'login.errorCorreo': 'El correo electrónico es obligatorio.',
  'login.errorContrasena': 'La contraseña es obligatoria.',
  'login.errorGenerico': 'Error al iniciar sesión. Intenta de nuevo.',

  // Cuenta / cambio de contraseña
  'cuenta.cambiarContrasena': 'Cambiar contraseña',
  'cuenta.cambiarEmpresa': 'Cambiar de empresa',
  'cuenta.cc.actual': 'Contraseña actual',
  'cuenta.cc.nueva': 'Nueva contraseña',
  'cuenta.cc.confirmar': 'Confirmar nueva contraseña',
  'cuenta.cc.ayudaNueva': 'Mínimo 8 caracteres.',
  'cuenta.cc.errActual': 'Ingresa tu contraseña actual.',
  'cuenta.cc.errNuevaCorta': 'La nueva contraseña debe tener al menos 8 caracteres.',
  'cuenta.cc.errIgual': 'La nueva contraseña debe ser distinta de la actual.',
  'cuenta.cc.errConfirmar': 'Las contraseñas no coinciden.',
  'cuenta.cc.errGenerico': 'No se pudo cambiar la contraseña. Intenta de nuevo.',
  'cuenta.cc.err429': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  'cuenta.cc.forzadoIntro': 'Tu contraseña es temporal. Debes cambiarla para continuar.',
  'cuenta.cc.exitoTitulo': 'Contraseña actualizada',
  'cuenta.cc.exitoMensaje':
    'Por seguridad cerramos todas tus sesiones. Vuelve a iniciar sesión con tu nueva contraseña.',
  'cuenta.cc.irLogin': 'Ir a iniciar sesión',

  // Inicio
  'inicio.bienvenido': 'Bienvenido, {nombre}',
  'inicio.sesionActivaComo': 'Sesión activa como',
  'inicio.finanzas': 'Finanzas',
  'inicio.finanzasDesc': 'Cuentas por pagar, gastos y dashboard de ganancias.',
  'inicio.administracion': 'Administración',
  'inicio.administracionDesc': 'Sedes, empleados (con sus roles operativos) y kioscos.',
  'inicio.asistencia': 'Asistencia',
  'inicio.asistenciaDesc': 'Fichaje, jornadas y cobro anticipado de horas extra.',

  // Navegación (enlaces de módulo)
  'nav.cuentasPorPagar': 'Cuentas por pagar',
  'nav.gastos': 'Gastos',
  'nav.dashboard': 'Dashboard',
  'nav.sedes': 'Sedes',
  'nav.empleados': 'Empleados',
  'nav.kioscos': 'Kioscos',
  'nav.usuarios': 'Usuarios',
  'nav.colaRevision': 'Cola de revisión',
  'nav.jornadas': 'Jornadas',
  'nav.cobros': 'Cobros',
  'nav.kiosco': 'Kiosco',
};

const en: Diccionario = {
  'comun.cerrarSesion': 'Log out',
  'comun.idioma': 'Language',
  'comun.cancelar': 'Cancel',
  'comun.guardar': 'Save',
  'comun.guardando': 'Saving…',
  'comun.cargando': 'Loading…',
  'comun.cerrar': 'Close',
  'comun.editar': 'Edit',
  'comun.eliminar': 'Delete',
  'comun.volver': 'Back',
  'comun.continuar': 'Continue',
  'comun.filtrar': 'Filter',
  'comun.actualizar': 'Refresh',
  'comun.opcional': 'optional',
  'comun.todos': 'All',
  'comun.si': 'Yes',
  'comun.no': 'No',
  'comun.desde': 'From',
  'comun.hasta': 'To',
  'comun.errorGenerico': 'An error occurred. Please try again.',
  'rol.empleado': 'Employee',
  'rol.supervisor': 'Supervisor',
  'rol.administrador': 'Administrator',

  'login.subtitulo': 'Business administration',
  'login.correo': 'Email',
  'login.contrasena': 'Password',
  'login.entrar': 'Sign in',
  'login.entrando': 'Signing in…',
  'login.pie': 'Authorized personnel only. Contact the administrator to request access.',
  'login.errorCorreo': 'Email is required.',
  'login.errorContrasena': 'Password is required.',
  'login.errorGenerico': 'Sign-in failed. Please try again.',

  'cuenta.cambiarContrasena': 'Change password',
  'cuenta.cambiarEmpresa': 'Switch company',
  'cuenta.cc.actual': 'Current password',
  'cuenta.cc.nueva': 'New password',
  'cuenta.cc.confirmar': 'Confirm new password',
  'cuenta.cc.ayudaNueva': 'At least 8 characters.',
  'cuenta.cc.errActual': 'Enter your current password.',
  'cuenta.cc.errNuevaCorta': 'The new password must be at least 8 characters.',
  'cuenta.cc.errIgual': 'The new password must be different from the current one.',
  'cuenta.cc.errConfirmar': 'Passwords do not match.',
  'cuenta.cc.errGenerico': 'Could not change the password. Please try again.',
  'cuenta.cc.err429': 'Too many attempts. Please wait a moment and try again.',
  'cuenta.cc.forzadoIntro': 'Your password is temporary. You must change it to continue.',
  'cuenta.cc.exitoTitulo': 'Password updated',
  'cuenta.cc.exitoMensaje':
    'For your security we signed out all your sessions. Please sign in again with your new password.',
  'cuenta.cc.irLogin': 'Go to sign in',

  'inicio.bienvenido': 'Welcome, {nombre}',
  'inicio.sesionActivaComo': 'Signed in as',
  'inicio.finanzas': 'Finance',
  'inicio.finanzasDesc': 'Accounts payable, expenses and profit dashboard.',
  'inicio.administracion': 'Administration',
  'inicio.administracionDesc': 'Locations, employees (with their operational roles) and kiosks.',
  'inicio.asistencia': 'Attendance',
  'inicio.asistenciaDesc': 'Clock-in, work shifts and overtime advance payment.',

  'nav.cuentasPorPagar': 'Accounts payable',
  'nav.gastos': 'Expenses',
  'nav.dashboard': 'Dashboard',
  'nav.sedes': 'Locations',
  'nav.empleados': 'Employees',
  'nav.kioscos': 'Kiosks',
  'nav.usuarios': 'Users',
  'nav.colaRevision': 'Review queue',
  'nav.jornadas': 'Work shifts',
  'nav.cobros': 'Advances',
  'nav.kiosco': 'Kiosk',
};

const zh: Diccionario = {
  'comun.cerrarSesion': '退出登录',
  'comun.idioma': '语言',
  'comun.cancelar': '取消',
  'comun.guardar': '保存',
  'comun.guardando': '保存中…',
  'comun.cargando': '加载中…',
  'comun.cerrar': '关闭',
  'comun.editar': '编辑',
  'comun.eliminar': '删除',
  'comun.volver': '返回',
  'comun.continuar': '继续',
  'comun.filtrar': '筛选',
  'comun.actualizar': '刷新',
  'comun.opcional': '可选',
  'comun.todos': '全部',
  'comun.si': '是',
  'comun.no': '否',
  'comun.desde': '起始',
  'comun.hasta': '截止',
  'comun.errorGenerico': '发生错误，请重试。',
  'rol.empleado': '员工',
  'rol.supervisor': '主管',
  'rol.administrador': '管理员',

  'login.subtitulo': '企业管理',
  'login.correo': '邮箱',
  'login.contrasena': '密码',
  'login.entrar': '登录',
  'login.entrando': '登录中…',
  'login.pie': '仅限授权人员。如需访问请联系管理员。',
  'login.errorCorreo': '邮箱为必填项。',
  'login.errorContrasena': '密码为必填项。',
  'login.errorGenerico': '登录失败，请重试。',

  'cuenta.cambiarContrasena': '修改密码',
  'cuenta.cambiarEmpresa': '切换公司',
  'cuenta.cc.actual': '当前密码',
  'cuenta.cc.nueva': '新密码',
  'cuenta.cc.confirmar': '确认新密码',
  'cuenta.cc.ayudaNueva': '至少 8 个字符。',
  'cuenta.cc.errActual': '请输入当前密码。',
  'cuenta.cc.errNuevaCorta': '新密码至少需要 8 个字符。',
  'cuenta.cc.errIgual': '新密码必须与当前密码不同。',
  'cuenta.cc.errConfirmar': '两次输入的密码不一致。',
  'cuenta.cc.errGenerico': '无法修改密码，请重试。',
  'cuenta.cc.err429': '尝试次数过多，请稍后再试。',
  'cuenta.cc.forzadoIntro': '你的密码是临时的，必须修改后才能继续。',
  'cuenta.cc.exitoTitulo': '密码已更新',
  'cuenta.cc.exitoMensaje': '出于安全考虑，我们已退出你的所有会话。请使用新密码重新登录。',
  'cuenta.cc.irLogin': '前往登录',

  'inicio.bienvenido': '欢迎，{nombre}',
  'inicio.sesionActivaComo': '当前登录身份',
  'inicio.finanzas': '财务',
  'inicio.finanzasDesc': '应付账款、支出和利润看板。',
  'inicio.administracion': '管理',
  'inicio.administracionDesc': '门店、员工（含操作角色）和打卡机。',
  'inicio.asistencia': '考勤',
  'inicio.asistenciaDesc': '打卡、工时和加班预支。',

  'nav.cuentasPorPagar': '应付账款',
  'nav.gastos': '支出',
  'nav.dashboard': '看板',
  'nav.sedes': '门店',
  'nav.empleados': '员工',
  'nav.kioscos': '打卡机',
  'nav.usuarios': '用户',
  'nav.colaRevision': '审核队列',
  'nav.jornadas': '工时',
  'nav.cobros': '预支',
  'nav.kiosco': '打卡机',
};

// Diccionario final: base (común/login/inicio/nav) + diccionarios por módulo.
export const traducciones: Record<Idioma, Diccionario> = {
  es: { ...es, ...finanzas.es, ...administracion.es, ...asistencia.es, ...plataforma.es },
  en: { ...en, ...finanzas.en, ...administracion.en, ...asistencia.en, ...plataforma.en },
  zh: { ...zh, ...finanzas.zh, ...administracion.zh, ...asistencia.zh, ...plataforma.zh },
};
