import type { SensitiveOperation, UserProfile, UserRole } from '../types/domain';

export interface RoleMetadata {
  role: UserRole;
  label: string;
  shortBadge: string;
  description: string;
  rlsHelperFunction: string;
  scopeRule: string;
}

export const ALL_USER_ROLES: UserRole[] = [
  'ADMIN',
  'INVENTORY_OPERATOR',
  'SALES_OPERATOR',
  'MARKETING_OPERATOR',
  'OWNER',
  'VIEWER'
];

export const ROLES_CATALOG: Record<UserRole, RoleMetadata> = {
  ADMIN: {
    role: 'ADMIN',
    label: 'Administrador General (ADMIN)',
    shortBadge: 'ADMIN',
    description:
      'Acceso completo a todos los módulos, configuración de acuerdos, costos, transferencias de propiedad, liquidaciones, usuarios y auditoría.',
    rlsHelperFunction: 'public.fn_is_admin()',
    scopeRule: 'Negocio completo (Todos los propietarios y operaciones)'
  },
  INVENTORY_OPERATOR: {
    role: 'INVENTORY_OPERATOR',
    label: 'Operador de Inventario (INVENTORY_OPERATOR)',
    shortBadge: 'INVENTARIO',
    description:
      'Operaciones autorizadas de catálogo, recepciones de compra, conteo físico por lote, inspecciones de calidad y preparación de despachos.',
    rlsHelperFunction: 'public.fn_is_operator_or_admin()',
    scopeRule: 'Operaciones físicas de bodega (Sin permiso para modificar costos históricos, cambiar dueños ni liquidar)'
  },
  SALES_OPERATOR: {
    role: 'SALES_OPERATOR',
    label: 'Operador de Ventas (SALES_OPERATOR)',
    shortBadge: 'VENTAS',
    description:
      'Gestión de clientes, prospectos CRM, creación de pedidos, reservas sobre stock disponible, registro de pagos, devoluciones y despachos.',
    rlsHelperFunction: 'public.fn_can_manage_sales()',
    scopeRule: 'Área comercial (Lectura de stock disponible; sin acceso a costos de compra ni liquidaciones)'
  },
  MARKETING_OPERATOR: {
    role: 'MARKETING_OPERATOR',
    label: 'Operador de Marketing (MARKETING_OPERATOR)',
    shortBadge: 'MARKETING',
    description:
      'Gestión de branding, merchandising, Creative Studio, calendario editorial y borradores de publicaciones para SKUs con stock disponible.',
    rlsHelperFunction: 'public.fn_can_manage_marketing()',
    scopeRule: 'Área de marketing (No puede publicar ni activar pauta sin aprobación ADMIN)'
  },
  OWNER: {
    role: 'OWNER',
    label: 'Propietario de Mercancía (OWNER)',
    shortBadge: 'PROPIETARIO',
    description:
      'Acceso exclusivamente de lectura a sus propios lotes, movimientos, ventas atribuidas, gastos asignados, acuerdos y liquidaciones cuando se le habilita.',
    rlsHelperFunction: 'public.fn_can_owner_view(owner_id)',
    scopeRule: 'Exclusivamente registros propios (linked_owner_id = owner_id AND owner_portal_enabled = true)'
  },
  VIEWER: {
    role: 'VIEWER',
    label: 'Observador de Solo Lectura (VIEWER)',
    shortBadge: 'LECTURA',
    description:
      'Acceso de solo lectura limitado a perfil propio y catálogo público autorizado, sin permisos de escritura ni acceso a costos o liquidaciones.',
    rlsHelperFunction: "public.fn_has_any_role(ARRAY['VIEWER'])",
    scopeRule: 'Solo lectura de catálogo autorizado y perfil propio (sin mutaciones)'
  }
};

export interface RoutePermissionRule {
  path: string;
  moduleId: string;
  allowedReadRoles: UserRole[];
  allowedWriteRoles: UserRole[];
  ownerScopedOnlyForOwnerRole: boolean;
}

export const ROUTE_PERMISSIONS: Record<string, RoutePermissionRule> = {
  '/': {
    path: '/',
    moduleId: 'dashboard',
    allowedReadRoles: ['ADMIN', 'INVENTORY_OPERATOR', 'SALES_OPERATOR', 'MARKETING_OPERATOR', 'OWNER'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: true
  },
  '/operaciones/productos': {
    path: '/operaciones/productos',
    moduleId: 'productos',
    allowedReadRoles: ['ADMIN', 'INVENTORY_OPERATOR', 'SALES_OPERATOR', 'MARKETING_OPERATOR', 'OWNER', 'VIEWER'],
    allowedWriteRoles: ['ADMIN', 'INVENTORY_OPERATOR'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/operaciones/inventario': {
    path: '/operaciones/inventario',
    moduleId: 'inventario',
    allowedReadRoles: ['ADMIN', 'INVENTORY_OPERATOR', 'SALES_OPERATOR', 'OWNER'],
    allowedWriteRoles: ['ADMIN', 'INVENTORY_OPERATOR'],
    ownerScopedOnlyForOwnerRole: true
  },
  '/operaciones/recepciones-compras': {
    path: '/operaciones/recepciones-compras',
    moduleId: 'recepciones-compras',
    allowedReadRoles: ['ADMIN', 'INVENTORY_OPERATOR', 'OWNER'],
    allowedWriteRoles: ['ADMIN', 'INVENTORY_OPERATOR'],
    ownerScopedOnlyForOwnerRole: true
  },
  '/operaciones/importacion': {
    path: '/operaciones/importacion',
    moduleId: 'importacion',
    allowedReadRoles: ['ADMIN', 'INVENTORY_OPERATOR'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/finanzas/costos': {
    path: '/finanzas/costos',
    moduleId: 'costos',
    allowedReadRoles: ['ADMIN', 'INVENTORY_OPERATOR', 'OWNER'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: true
  },
  '/finanzas/precios': {
    path: '/finanzas/precios',
    moduleId: 'precios',
    allowedReadRoles: ['ADMIN', 'INVENTORY_OPERATOR', 'SALES_OPERATOR'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/finanzas/gastos': {
    path: '/finanzas/gastos',
    moduleId: 'gastos',
    allowedReadRoles: ['ADMIN', 'OWNER'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: true
  },
  '/finanzas/propietarios': {
    path: '/finanzas/propietarios',
    moduleId: 'propietarios',
    allowedReadRoles: ['ADMIN', 'OWNER'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: true
  },
  '/finanzas/liquidaciones': {
    path: '/finanzas/liquidaciones',
    moduleId: 'liquidaciones',
    allowedReadRoles: ['ADMIN', 'OWNER'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: true
  },
  '/comercial/pedidos': {
    path: '/comercial/pedidos',
    moduleId: 'pedidos',
    allowedReadRoles: ['ADMIN', 'SALES_OPERATOR', 'OWNER'],
    allowedWriteRoles: ['ADMIN', 'SALES_OPERATOR'],
    ownerScopedOnlyForOwnerRole: true
  },
  '/comercial/clientes': {
    path: '/comercial/clientes',
    moduleId: 'clientes',
    allowedReadRoles: ['ADMIN', 'SALES_OPERATOR'],
    allowedWriteRoles: ['ADMIN', 'SALES_OPERATOR'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/comercial/crm': {
    path: '/comercial/crm',
    moduleId: 'crm',
    allowedReadRoles: ['ADMIN', 'SALES_OPERATOR'],
    allowedWriteRoles: ['ADMIN', 'SALES_OPERATOR'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/comercial/despachos': {
    path: '/comercial/despachos',
    moduleId: 'despachos',
    allowedReadRoles: ['ADMIN', 'INVENTORY_OPERATOR', 'SALES_OPERATOR'],
    allowedWriteRoles: ['ADMIN', 'INVENTORY_OPERATOR', 'SALES_OPERATOR'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/marketing/branding': {
    path: '/marketing/branding',
    moduleId: 'branding',
    allowedReadRoles: ['ADMIN', 'MARKETING_OPERATOR'],
    allowedWriteRoles: ['ADMIN', 'MARKETING_OPERATOR'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/marketing/merchandising': {
    path: '/marketing/merchandising',
    moduleId: 'merchandising',
    allowedReadRoles: ['ADMIN', 'MARKETING_OPERATOR', 'INVENTORY_OPERATOR'],
    allowedWriteRoles: ['ADMIN', 'MARKETING_OPERATOR'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/marketing/creative-studio': {
    path: '/marketing/creative-studio',
    moduleId: 'creative-studio',
    allowedReadRoles: ['ADMIN', 'MARKETING_OPERATOR'],
    allowedWriteRoles: ['ADMIN', 'MARKETING_OPERATOR'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/marketing/marketplace': {
    path: '/marketing/marketplace',
    moduleId: 'marketplace',
    allowedReadRoles: ['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR'],
    allowedWriteRoles: ['ADMIN', 'MARKETING_OPERATOR'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/marketing/social-publisher': {
    path: '/marketing/social-publisher',
    moduleId: 'social-publisher',
    allowedReadRoles: ['ADMIN', 'MARKETING_OPERATOR'],
    allowedWriteRoles: ['ADMIN', 'MARKETING_OPERATOR'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/marketing/whatsapp': {
    path: '/marketing/whatsapp',
    moduleId: 'whatsapp',
    allowedReadRoles: ['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR'],
    allowedWriteRoles: ['ADMIN', 'MARKETING_OPERATOR', 'SALES_OPERATOR'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/marketing/meta-ads': {
    path: '/marketing/meta-ads',
    moduleId: 'meta-ads',
    allowedReadRoles: ['ADMIN', 'MARKETING_OPERATOR'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/gestion/automatizaciones': {
    path: '/gestion/automatizaciones',
    moduleId: 'automatizaciones',
    allowedReadRoles: ['ADMIN'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/gestion/analitica': {
    path: '/gestion/analitica',
    moduleId: 'analitica',
    allowedReadRoles: ['ADMIN', 'OWNER'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: true
  },
  '/gestion/configuracion': {
    path: '/gestion/configuracion',
    moduleId: 'configuracion',
    allowedReadRoles: ['ADMIN'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: false
  },
  '/gestion/usuarios': {
    path: '/gestion/usuarios',
    moduleId: 'usuarios',
    // Todos los usuarios autenticados pueden entrar a ver su propio Perfil de Seguridad;
    // solo ADMIN puede gestionar cuentas y roles de terceros.
    allowedReadRoles: ['ADMIN', 'INVENTORY_OPERATOR', 'SALES_OPERATOR', 'MARKETING_OPERATOR', 'OWNER', 'VIEWER'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: true
  },
  '/gestion/auditoria': {
    path: '/gestion/auditoria',
    moduleId: 'auditoria',
    allowedReadRoles: ['ADMIN'],
    allowedWriteRoles: ['ADMIN'],
    ownerScopedOnlyForOwnerRole: false
  }
};

export interface PermissionEvaluation {
  allowed: boolean;
  reason: string;
  dbLayerCheck: string;
}

/**
 * Evalúa si un perfil tiene permiso de lectura sobre una ruta de módulo.
 */
export function evaluateRouteAccess(
  profile: UserProfile | null,
  path: string,
  sessionExpired = false
): PermissionEvaluation {
  if (sessionExpired) {
    return {
      allowed: false,
      reason: 'Sesión expirada. Debe autenticarse nuevamente para continuar.',
      dbLayerCheck: 'JWT exp < now() rechazado por PostgREST / Supabase Auth'
    };
  }

  if (!profile) {
    return {
      allowed: false,
      reason: 'Usuario no autenticado.',
      dbLayerCheck: 'auth.uid() IS NULL bloqueado por políticas TO authenticated'
    };
  }

  if (!profile.isActive) {
    return {
      allowed: false,
      reason: 'La cuenta se encuentra inactiva y pendiente de autorización por ADMIN.',
      dbLayerCheck: 'public.fn_current_user_role() filtra is_active = true'
    };
  }

  if (profile.role === 'OWNER') {
    if (!profile.linkedOwnerId || !profile.ownerPortalEnabled) {
      // Permitir únicamente acceso a /gestion/usuarios para ver su perfil básico
      if (path === '/gestion/usuarios') {
        return {
          allowed: true,
          reason: 'Acceso permitido únicamente a vista de perfil propio.',
          dbLayerCheck: 'pol_profiles_select (id = auth.uid())'
        };
      }
      return {
        allowed: false,
        reason:
          'El rol OWNER no tiene habilitado el acceso al portal de propietario (owner_portal_enabled = false) o carece de propietario vinculado.',
        dbLayerCheck: 'public.fn_can_owner_view(owner_id) devuelve FALSE'
      };
    }
  }

  const rule = ROUTE_PERMISSIONS[path];
  if (!rule) {
    return {
      allowed: profile.role === 'ADMIN',
      reason:
        profile.role === 'ADMIN'
          ? 'Acceso concedido a ADMIN.'
          : 'Ruta no registrada para este rol.',
      dbLayerCheck: 'public.fn_is_admin()'
    };
  }

  if (!rule.allowedReadRoles.includes(profile.role)) {
    return {
      allowed: false,
      reason: `El rol ${profile.role} no tiene autorización para acceder al módulo ${path}.`,
      dbLayerCheck: `RLS bloquea SELECT en tablas del módulo para rol ${profile.role}`
    };
  }

  return {
    allowed: true,
    reason: `Acceso autorizado para el rol ${profile.role}.`,
    dbLayerCheck: ROLES_CATALOG[profile.role].rlsHelperFunction
  };
}

/**
 * Evalúa operaciones sensibles tanto en cliente como documentando la validación
 * exacta en PostgreSQL (RLS + Triggers + Funciones SECURITY DEFINER).
 */
export function evaluateSensitiveOperation(
  profile: UserProfile | null,
  operation: SensitiveOperation,
  options?: {
    targetOwnerId?: string;
    hasActiveAgreement?: boolean;
    sessionExpired?: boolean;
  }
): PermissionEvaluation {
  if (options?.sessionExpired) {
    return {
      allowed: false,
      reason: 'Operación rechazada: la sesión ha expirado (JWT inválido/vencido).',
      dbLayerCheck: 'Supabase Auth rechaza token expirado con HTTP 401 Unauthorized'
    };
  }

  if (!profile || !profile.isActive) {
    return {
      allowed: false,
      reason: 'Operación rechazada: sesión no autenticada o cuenta inactiva.',
      dbLayerCheck: 'public.fn_current_user_role() IS NULL'
    };
  }

  switch (operation) {
    case 'SELF_ASSIGN_ROLE':
      return {
        allowed: false,
        reason: 'Prohibida la autoasignación o escalación de roles por parte del usuario.',
        dbLayerCheck: 'Trigger BEFORE INSERT/UPDATE trg_prevent_profile_self_escalation en public.profiles'
      };

    case 'MODIFY_COSTS':
      if (profile.role !== 'ADMIN') {
        return {
          allowed: false,
          reason: `El rol ${profile.role} tiene prohibido crear o alterar registros de costo unitario.`,
          dbLayerCheck: 'Política RLS pol_cost_records_write exige public.fn_is_admin()'
        };
      }
      return {
        allowed: true,
        reason: 'Modificación auditada de costos permitida para ADMIN.',
        dbLayerCheck: 'pol_cost_records_write + trg_audit_lot_owner_allocations'
      };

    case 'CHANGE_LOT_OWNER':
      if (profile.role !== 'ADMIN') {
        return {
          allowed: false,
          reason: `El rol ${profile.role} no puede transferir propiedad de lotes entre dueños.`,
          dbLayerCheck: 'RPC public.fn_execute_ownership_transfer valida IF NOT public.fn_is_admin() THEN RAISE EXCEPTION'
        };
      }
      return {
        allowed: true,
        reason: 'Transferencia de propiedad autorizada para ADMIN.',
        dbLayerCheck: 'public.fn_execute_ownership_transfer + trg_audit_ownership_transfers'
      };

    case 'EXECUTE_SETTLEMENT':
      if (profile.role !== 'ADMIN') {
        return {
          allowed: false,
          reason: `El rol ${profile.role} no está autorizado para ejecutar liquidaciones financieras.`,
          dbLayerCheck: 'RPC public.fn_create_owner_settlement exige public.fn_is_admin()'
        };
      }
      if (options?.hasActiveAgreement === false) {
        return {
          allowed: false,
          reason: 'Bloqueo de Regla Multipropietario: No se puede liquidar sin un acuerdo ACTIVO configurado en owner_agreements.',
          dbLayerCheck: 'RPC public.fn_create_owner_settlement aborta si status <> active'
        };
      }
      return {
        allowed: true,
        reason: 'Liquidación autorizada para ADMIN con acuerdo activo verificado.',
        dbLayerCheck: 'public.fn_create_owner_settlement + trg_audit_owner_settlements'
      };

    case 'READ_OWNER_INVENTORY':
      if (
        profile.role === 'ADMIN' ||
        profile.role === 'INVENTORY_OPERATOR' ||
        profile.role === 'SALES_OPERATOR'
      ) {
        return {
          allowed: true,
          reason: `Lectura operativa autorizada para ${profile.role}.`,
          dbLayerCheck: 'pol_lot_allocations_select (fn_is_operator_or_admin() OR fn_can_manage_sales())'
        };
      }
      if (profile.role === 'OWNER') {
        if (
          profile.ownerPortalEnabled &&
          profile.linkedOwnerId &&
          options?.targetOwnerId === profile.linkedOwnerId
        ) {
          return {
            allowed: true,
            reason: `Lectura permitida al propietario sobre su propio lote (${profile.linkedOwnerId}).`,
            dbLayerCheck: `public.fn_can_owner_view('${profile.linkedOwnerId}') = true`
          };
        }
        return {
          allowed: false,
          reason: `Violación de aislamiento multipropietario: El propietario (${profile.linkedOwnerId ?? 'sin vínculo'}) intentó leer mercancía de otro dueño (${options?.targetOwnerId ?? 'desconocido'}).`,
          dbLayerCheck: `Política RLS pol_lot_allocations_select bloquea filas donde fn_can_owner_view('${options?.targetOwnerId ?? ''}') = false`
        };
      }
      return {
        allowed: false,
        reason: `El rol ${profile.role} no tiene permiso para consultar asignaciones de lote por propietario.`,
        dbLayerCheck: 'pol_lot_allocations_select rechaza rol MARKETING_OPERATOR'
      };

    case 'ACCESS_PRIVATE_DOCUMENT':
      if (profile.role === 'ADMIN') {
        return {
          allowed: true,
          reason: 'Acceso autorizado a documento privado en bucket private-documents para ADMIN.',
          dbLayerCheck: 'public.fn_authorize_private_document_access + pol_private_docs_admin_operator'
        };
      }
      if (
        profile.role === 'OWNER' &&
        profile.ownerPortalEnabled &&
        profile.linkedOwnerId &&
        options?.targetOwnerId === profile.linkedOwnerId
      ) {
        return {
          allowed: true,
          reason: 'Acceso autorizado a comprobante propio del propietario.',
          dbLayerCheck: 'public.fn_authorize_private_document_access valida fn_can_owner_view(owner_id)'
        };
      }
      return {
        allowed: false,
        reason: `Acceso denegado al bucket privado 'private-documents' para el rol ${profile.role}.`,
        dbLayerCheck: 'RPC public.fn_authorize_private_document_access registra PRIVATE_DOC_ACCESS_DENIED y lanza excepción'
      };

    case 'MANAGE_USERS_AND_ROLES':
      if (profile.role !== 'ADMIN') {
        return {
          allowed: false,
          reason: `El rol ${profile.role} no puede administrar usuarios ni modificar roles.`,
          dbLayerCheck: 'RPC public.fn_admin_update_user_role_and_access exige public.fn_is_admin()'
        };
      }
      return {
        allowed: true,
        reason: 'Gestión administrativa de usuarios permitida para ADMIN.',
        dbLayerCheck: 'public.fn_admin_update_user_role_and_access'
      };

    case 'MANAGE_INVENTORY_OPERATIONS':
      return {
        allowed: profile.role === 'ADMIN' || profile.role === 'INVENTORY_OPERATOR',
        reason:
          profile.role === 'ADMIN' || profile.role === 'INVENTORY_OPERATOR'
            ? 'Operación de inventario autorizada.'
            : `El rol ${profile.role} no tiene permisos de escritura en inventario.`,
        dbLayerCheck: 'public.fn_is_operator_or_admin()'
      };

    case 'MANAGE_SALES_OPERATIONS':
      return {
        allowed: profile.role === 'ADMIN' || profile.role === 'SALES_OPERATOR',
        reason:
          profile.role === 'ADMIN' || profile.role === 'SALES_OPERATOR'
            ? 'Operación comercial autorizada.'
            : `El rol ${profile.role} no tiene permisos de escritura en ventas.`,
        dbLayerCheck: 'public.fn_can_manage_sales()'
      };

    case 'MANAGE_MARKETING_OPERATIONS':
      return {
        allowed: profile.role === 'ADMIN' || profile.role === 'MARKETING_OPERATOR',
        reason:
          profile.role === 'ADMIN' || profile.role === 'MARKETING_OPERATOR'
            ? 'Operación de marketing autorizada.'
            : `El rol ${profile.role} no tiene permisos de escritura en marketing.`,
        dbLayerCheck: 'public.fn_can_manage_marketing()'
      };

    default:
      return {
        allowed: false,
        reason: `Operación sensible no reconocida (${String(operation)}). Denegada por defecto.`,
        dbLayerCheck: 'Fail-closed RBAC default guard'
      };
  }
}
