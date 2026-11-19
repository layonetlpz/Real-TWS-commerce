import type { ReactNode } from 'react';

export type NavGroupId =
  | 'OPERACIONES'
  | 'FINANZAS'
  | 'COMERCIAL'
  | 'MARKETING'
  | 'GESTIÓN';

export type UserRole =
  | 'ADMIN'
  | 'INVENTORY_OPERATOR'
  | 'SALES_OPERATOR'
  | 'MARKETING_OPERATOR'
  | 'OWNER'
  | 'VIEWER';

export type ModuleStatus = 'BASE_ACTIVA' | 'PENDIENTE_FASE_2' | 'PENDIENTE_FASE_3_8';

export interface NavItemConfig {
  id: string;
  group: NavGroupId;
  label: string;
  path: string;
  iconName: string;
  phaseNumber: number;
  status: ModuleStatus;
  summary: string;
  supabaseTables: string[];
  enforcedRules: string[];
  plannedColumns: string[];
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  linkedOwnerId: string | null;
  ownerPortalEnabled: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AuthStatus =
  | 'LOADING'
  | 'AUTHENTICATED'
  | 'UNAUTHENTICATED'
  | 'PASSWORD_RECOVERY'
  | 'SESSION_EXPIRED';

export type SensitiveOperation =
  | 'MODIFY_COSTS'
  | 'CHANGE_LOT_OWNER'
  | 'EXECUTE_SETTLEMENT'
  | 'READ_OWNER_INVENTORY'
  | 'ACCESS_PRIVATE_DOCUMENT'
  | 'MANAGE_USERS_AND_ROLES'
  | 'SELF_ASSIGN_ROLE'
  | 'MANAGE_INVENTORY_OPERATIONS'
  | 'MANAGE_SALES_OPERATIONS'
  | 'MANAGE_MARKETING_OPERATIONS';

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actorRole: UserRole | 'UNAUTHENTICATED' | 'EXPIRED_SESSION';
  eventType: string;
  targetResource: string;
  outcome: 'ALLOWED' | 'BLOCKED';
  reason: string;
  dbEnforcementLayer: string;
}

export interface SecurityTestScenarioResult {
  id: string;
  title: string;
  category:
    | 'UNAUTHORIZED_ACCESS'
    | 'CROSS_OWNER_READ'
    | 'COST_MODIFICATION'
    | 'OWNER_TRANSFER'
    | 'SETTLEMENT_GUARD'
    | 'PRIVATE_DOCUMENT'
    | 'EXPIRED_SESSION';
  simulatedActor: string;
  attemptedAction: string;
  expectedOutcome: 'BLOCKED';
  actualOutcome: 'BLOCKED' | 'ALLOWED';
  passed: boolean;
  clientGuardResult: string;
  dbRlsAndRpcResult: string;
  auditLogRecorded: boolean;
}

export interface OwnerRecord {
  id: string;
  internalCode: string;
  name: string;
  status: 'Activo' | 'Inactivo';
  associatedSkus: number;
  physicalUnits: number;
  availableUnits: number;
  pendingInspectionUnits: number;
  historicalSoldUnits: number;
}

export type OwnerScope = 'ALL' | string;

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description: string;
  timestamp: string;
}

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  sortValue?: (row: T) => string | number | null | undefined;
  hideOnMobile?: boolean;
  render: (row: T) => ReactNode;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}
