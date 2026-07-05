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
    'plataforma.estadoInactiva': 'Inactiva',

    // Entrar a una empresa (cambiar-empresa) y volver a la plataforma
    'plataforma.entrar': 'Entrar',
    'plataforma.errEntrar': 'No se pudo entrar a la empresa.',
    'plataforma.volver': 'Volver a plataforma',
    'plataforma.errVolver': 'No se pudo volver a la plataforma.',

    // Baja / reactivación lógica del tenant
    'plataforma.desactivar': 'Desactivar',
    'plataforma.confirmarBaja': '¿Confirmar baja?',
    'plataforma.reactivar': 'Reactivar',
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
    'plataforma.estadoInactiva': 'Inactive',

    'plataforma.entrar': 'Enter',
    'plataforma.errEntrar': 'Could not enter the company.',
    'plataforma.volver': 'Back to platform',
    'plataforma.errVolver': 'Could not return to the platform.',

    'plataforma.desactivar': 'Deactivate',
    'plataforma.confirmarBaja': 'Confirm deactivation?',
    'plataforma.reactivar': 'Reactivate',
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
    'plataforma.estadoInactiva': '停用',

    'plataforma.entrar': '进入',
    'plataforma.errEntrar': '无法进入该公司。',
    'plataforma.volver': '返回平台',
    'plataforma.errVolver': '无法返回平台。',

    'plataforma.desactivar': '停用',
    'plataforma.confirmarBaja': '确认停用？',
    'plataforma.reactivar': '重新启用',
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
  },
};
