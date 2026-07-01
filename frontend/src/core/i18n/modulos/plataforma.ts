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
  },
};
