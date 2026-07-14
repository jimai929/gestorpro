/**
 * Diccionario i18n del área de PLATAFORMA (super-admin). Claves `plataforma.*`,
 * más las entradas de inicio/nav de la tarjeta de plataforma.
 * El valor `es` debe ser idéntico al texto español original.
 */
export const plataforma: Record<'es' | 'en' | 'zh', Record<string, string>> = {
  es: {
    // Tarjeta de inicio + navegación (solo super-admin)
    'inicio.plataforma': 'Plataforma',
    'inicio.plataformaDesc': 'Crear empresas (clientes) y su primer administrador.',
    'nav.plataforma': 'Plataforma',
    // Barra superior: etiqueta de contexto para super-admin (sin empresa activa)
    'plataforma.badge': 'Plataforma',

    // Pantalla de plataforma
    'plataforma.titulo': 'Crear empresa',
    'plataforma.subtitulo': 'Alta de un nuevo cliente (empresa) con su primer administrador.',

    // Formulario
    'plataforma.nombre': 'Nombre de la empresa',
    'plataforma.slug': 'Identificador (slug)',
    'plataforma.slugAyuda': 'Solo minúsculas, números y guiones. Ej.: acme-panama',
    'plataforma.adminNombre': 'Nombre del administrador',
    'plataforma.adminEmail': 'Correo del administrador',
    'plataforma.adminPassword': 'Contraseña inicial',
    'plataforma.passwordAyuda':
      'Mínimo 8 caracteres. El administrador deberá cambiarla en su primer ingreso.',
    'plataforma.crear': 'Crear empresa',

    // Errores de validación de cliente (refuerzo de UX; la frontera real es el backend)
    'plataforma.errCamposObligatorios': 'Completa el nombre de la empresa y del administrador.',
    'plataforma.errSlug': 'El identificador solo admite minúsculas, números y guiones.',
    'plataforma.errEmail': 'Ingresa un correo electrónico válido.',
    'plataforma.errPassword': 'La contraseña inicial debe tener al menos 8 caracteres.',
    'plataforma.errGenerico': 'No se pudo crear la empresa. Intenta de nuevo.',

    // Éxito
    'plataforma.exitoTitulo': 'Empresa creada',
    'plataforma.empresa': 'Empresa',
    'plataforma.exitoAviso':
      'La contraseña inicial quedó configurada. El administrador deberá cambiarla la primera vez que inicie sesión.',
    'plataforma.crearOtra': 'Crear otra empresa',

    // Listado de empresas (tabla)
    'plataforma.listaTitulo': 'Empresas',
    'plataforma.listaVacia': 'Aún no hay empresas. Crea la primera arriba.',
    'plataforma.listaError': 'No se pudo cargar la lista de empresas.',
    'plataforma.colNombre': 'Empresa',
    'plataforma.colSlug': 'Identificador',
    'plataforma.colAdmin': 'Administrador',
    'plataforma.colCreada': 'Creada',
    'plataforma.colEstado': 'Estado',
    'plataforma.colAcciones': 'Acciones',
    'plataforma.estadoActiva': 'Activa',
    'plataforma.estadoSuspendida': 'Suspendida',
    'plataforma.estadoCancelada': 'Cancelada',

    // Entrar a una empresa (cambiar-empresa) y volver a la plataforma
    'plataforma.entrar': 'Entrar',
    'plataforma.errEntrar': 'No se pudo entrar a la empresa.',
    'plataforma.volver': 'Volver a plataforma',
    'plataforma.errVolver': 'No se pudo volver a la plataforma.',

    // Transiciones de estado del tenant (B3): suspender ↔ reactivar; cancelar es TERMINAL.
    'plataforma.suspender': 'Suspender',
    'plataforma.confirmarSuspension': '¿Confirmar suspensión?',
    'plataforma.reactivar': 'Reactivar',
    'plataforma.cancelarEmpresa': 'Cancelar empresa',
    'plataforma.confirmarCancelacion': '¿Cancelar DEFINITIVAMENTE?',
    'plataforma.errActualizar': 'No se pudo actualizar la empresa.',

    // Añadir membresía (usuario existente, multi-empresa)
    'plataforma.anadirMembresia': 'Añadir membresía',
    'plataforma.am.titulo': 'Añadir membresía en {empresa}',
    'plataforma.am.intro':
      'Da acceso a esta empresa a un usuario que YA existe en otra, con el rol elegido. Su contraseña y su empresa predeterminada no cambian.',
    'plataforma.am.email': 'Correo del usuario',
    'plataforma.am.emailAyuda': 'El correo exacto con el que el usuario inicia sesión.',
    'plataforma.am.rol': 'Rol en esta empresa',
    'plataforma.am.anadir': 'Añadir',
    'plataforma.am.errGenerico': 'No se pudo añadir la membresía.',
    'plataforma.am.exitoTitulo': 'Membresía añadida',
    'plataforma.am.exitoMensaje':
      '{email} ya puede entrar a {empresa}. La verá en su selector de empresa al volver a iniciar sesión.',

    // Restablecer contraseña del admin principal (plataforma, sin entrar al tenant)
    'plataforma.restablecerAdmin': 'Restablecer contraseña del admin',
    'plataforma.ra.titulo': 'Restablecer contraseña del admin de {empresa}',
    'plataforma.ra.intro':
      'Se generará una contraseña temporal nueva para el administrador principal, se cerrarán sus sesiones activas y deberá cambiarla en su primer inicio de sesión. Esta acción no se puede deshacer.',
    'plataforma.ra.confirmar': 'Restablecer contraseña',
    'plataforma.ra.errGenerico': 'No se pudo restablecer la contraseña del admin.',
    'plataforma.ra.exitoTitulo': 'Contraseña restablecida',
    'plataforma.ra.exitoIntro': 'Comunica esta contraseña temporal al administrador de {empresa}:',
    'plataforma.ra.copiar': 'Copiar',
    'plataforma.ra.copiada': 'Copiada',
    'plataforma.ra.copiarError': 'No se pudo copiar al portapapeles. Copia la contraseña manualmente antes de cerrar.',
    'plataforma.ra.avisoCambio':
      'El administrador DEBE cambiar esta contraseña en su primer inicio de sesión.',
  },
  en: {
    'inicio.plataforma': 'Platform',
    'inicio.plataformaDesc': 'Create companies (customers) and their first administrator.',
    'nav.plataforma': 'Platform',
    'plataforma.badge': 'Platform',

    'plataforma.titulo': 'Create company',
    'plataforma.subtitulo': 'Register a new customer (company) with its first administrator.',

    'plataforma.nombre': 'Company name',
    'plataforma.slug': 'Identifier (slug)',
    'plataforma.slugAyuda': 'Lowercase letters, numbers and hyphens only. E.g.: acme-panama',
    'plataforma.adminNombre': 'Administrator name',
    'plataforma.adminEmail': 'Administrator email',
    'plataforma.adminPassword': 'Initial password',
    'plataforma.passwordAyuda':
      'At least 8 characters. The administrator must change it on first sign-in.',
    'plataforma.crear': 'Create company',

    'plataforma.errCamposObligatorios': 'Fill in the company and administrator names.',
    'plataforma.errSlug': 'The identifier accepts only lowercase letters, numbers and hyphens.',
    'plataforma.errEmail': 'Enter a valid email address.',
    'plataforma.errPassword': 'The initial password must be at least 8 characters.',
    'plataforma.errGenerico': 'Could not create the company. Please try again.',

    'plataforma.exitoTitulo': 'Company created',
    'plataforma.empresa': 'Company',
    'plataforma.exitoAviso':
      'The initial password is set. The administrator will be asked to change it on first sign-in.',
    'plataforma.crearOtra': 'Create another company',

    'plataforma.listaTitulo': 'Companies',
    'plataforma.listaVacia': 'No companies yet. Create the first one above.',
    'plataforma.listaError': 'Could not load the company list.',
    'plataforma.colNombre': 'Company',
    'plataforma.colSlug': 'Identifier',
    'plataforma.colAdmin': 'Administrator',
    'plataforma.colCreada': 'Created',
    'plataforma.colEstado': 'Status',
    'plataforma.colAcciones': 'Actions',
    'plataforma.estadoActiva': 'Active',
    'plataforma.estadoSuspendida': 'Suspended',
    'plataforma.estadoCancelada': 'Canceled',

    'plataforma.entrar': 'Enter',
    'plataforma.errEntrar': 'Could not enter the company.',
    'plataforma.volver': 'Back to platform',
    'plataforma.errVolver': 'Could not return to the platform.',

    'plataforma.suspender': 'Suspend',
    'plataforma.confirmarSuspension': 'Confirm suspension?',
    'plataforma.reactivar': 'Reactivate',
    'plataforma.cancelarEmpresa': 'Cancel company',
    'plataforma.confirmarCancelacion': 'Cancel PERMANENTLY?',
    'plataforma.errActualizar': 'Could not update the company.',

    'plataforma.anadirMembresia': 'Add membership',
    'plataforma.am.titulo': 'Add membership in {empresa}',
    'plataforma.am.intro':
      'Grant access to this company to a user who ALREADY exists in another one, with the chosen role. Their password and default company do not change.',
    'plataforma.am.email': 'User email',
    'plataforma.am.emailAyuda': 'The exact email the user signs in with.',
    'plataforma.am.rol': 'Role in this company',
    'plataforma.am.anadir': 'Add',
    'plataforma.am.errGenerico': 'Could not add the membership.',
    'plataforma.am.exitoTitulo': 'Membership added',
    'plataforma.am.exitoMensaje':
      '{email} can now enter {empresa}. It will appear in their company selector on their next sign-in.',

    'plataforma.restablecerAdmin': 'Reset admin password',
    'plataforma.ra.titulo': 'Reset the admin password for {empresa}',
    'plataforma.ra.intro':
      'A new temporary password will be generated for the primary administrator, their active sessions will be closed, and they must change it on their first sign-in. This action cannot be undone.',
    'plataforma.ra.confirmar': 'Reset password',
    'plataforma.ra.errGenerico': 'Could not reset the admin password.',
    'plataforma.ra.exitoTitulo': 'Password reset',
    'plataforma.ra.exitoIntro': 'Share this temporary password with the administrator of {empresa}:',
    'plataforma.ra.copiar': 'Copy',
    'plataforma.ra.copiada': 'Copied',
    'plataforma.ra.copiarError': 'Could not copy to the clipboard. Copy the password manually before closing.',
    'plataforma.ra.avisoCambio':
      'The administrator MUST change this password on their first sign-in.',
  },
  zh: {
    'inicio.plataforma': '平台',
    'inicio.plataformaDesc': '创建公司（客户）及其首位管理员。',
    'nav.plataforma': '平台',
    'plataforma.badge': '平台',

    'plataforma.titulo': '创建公司',
    'plataforma.subtitulo': '新增一个客户（公司）及其首位管理员。',

    'plataforma.nombre': '公司名称',
    'plataforma.slug': '标识符（slug）',
    'plataforma.slugAyuda': '仅限小写字母、数字和连字符。例如：acme-panama',
    'plataforma.adminNombre': '管理员姓名',
    'plataforma.adminEmail': '管理员邮箱',
    'plataforma.adminPassword': '初始密码',
    'plataforma.passwordAyuda': '至少 8 个字符。管理员首次登录时必须修改。',
    'plataforma.crear': '创建公司',

    'plataforma.errCamposObligatorios': '请填写公司名称和管理员姓名。',
    'plataforma.errSlug': '标识符仅允许小写字母、数字和连字符。',
    'plataforma.errEmail': '请输入有效的邮箱地址。',
    'plataforma.errPassword': '初始密码至少需要 8 个字符。',
    'plataforma.errGenerico': '无法创建公司，请重试。',

    'plataforma.exitoTitulo': '公司已创建',
    'plataforma.empresa': '公司',
    'plataforma.exitoAviso': '初始密码已设置。管理员首次登录时将被要求修改密码。',
    'plataforma.crearOtra': '再创建一家公司',

    'plataforma.listaTitulo': '公司',
    'plataforma.listaVacia': '还没有公司。在上方创建第一家。',
    'plataforma.listaError': '无法加载公司列表。',
    'plataforma.colNombre': '公司',
    'plataforma.colSlug': '标识符',
    'plataforma.colAdmin': '管理员',
    'plataforma.colCreada': '创建时间',
    'plataforma.colEstado': '状态',
    'plataforma.colAcciones': '操作',
    'plataforma.estadoActiva': '启用',
    'plataforma.estadoSuspendida': '已暂停',
    'plataforma.estadoCancelada': '已取消',

    'plataforma.entrar': '进入',
    'plataforma.errEntrar': '无法进入该公司。',
    'plataforma.volver': '返回平台',
    'plataforma.errVolver': '无法返回平台。',

    'plataforma.suspender': '暂停',
    'plataforma.confirmarSuspension': '确认暂停？',
    'plataforma.reactivar': '重新启用',
    'plataforma.cancelarEmpresa': '取消公司',
    'plataforma.confirmarCancelacion': '确认永久取消？',
    'plataforma.errActualizar': '无法更新公司。',

    'plataforma.anadirMembresia': '添加成员',
    'plataforma.am.titulo': '在 {empresa} 中添加成员',
    'plataforma.am.intro': '将已存在于其他公司的用户加入本公司，并指定角色。其密码和默认公司不会改变。',
    'plataforma.am.email': '用户邮箱',
    'plataforma.am.emailAyuda': '该用户登录时使用的准确邮箱。',
    'plataforma.am.rol': '在本公司的角色',
    'plataforma.am.anadir': '添加',
    'plataforma.am.errGenerico': '无法添加成员。',
    'plataforma.am.exitoTitulo': '成员已添加',
    'plataforma.am.exitoMensaje': '{email} 现在可以进入 {empresa}。下次登录时将出现在其公司选择器中。',

    'plataforma.restablecerAdmin': '重置 admin 密码',
    'plataforma.ra.titulo': '重置 {empresa} 的 admin 密码',
    'plataforma.ra.intro':
      '将为主管理员生成一个新的临时密码，其活动会话将被关闭，并且他必须在首次登录时修改密码。此操作无法撤销。',
    'plataforma.ra.confirmar': '重置密码',
    'plataforma.ra.errGenerico': '无法重置 admin 密码。',
    'plataforma.ra.exitoTitulo': '密码已重置',
    'plataforma.ra.exitoIntro': '请将此临时密码转达给 {empresa} 的管理员：',
    'plataforma.ra.copiar': '复制',
    'plataforma.ra.copiada': '已复制',
    'plataforma.ra.copiarError': '无法复制到剪贴板。关闭前请手动复制该密码。',
    'plataforma.ra.avisoCambio': '管理员必须在首次登录时修改此密码。',
  },
};
