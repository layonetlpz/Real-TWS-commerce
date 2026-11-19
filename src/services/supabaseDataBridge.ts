import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Database } from '../types/database.types';

// =============================================================================
// REAL TWS — PUENTE DE DATOS EN VIVO HACIA SUPABASE (TABLAS, VISTAS Y RPCS)
// =============================================================================

export type DbOwnerRow = Database['public']['Tables']['owners']['Row'];
export type DbAvailableInventoryRow = Database['public']['Views']['v_available_inventory']['Row'];
export type DbBusinessSettingsRow = Database['public']['Tables']['business_settings']['Row'];
export type DbCategoryRow = Database['public']['Tables']['categories']['Row'];
export type DbNotificationRow = Database['public']['Tables']['notifications']['Row'];
export type DbSalesSummaryRow = Database['public']['Views']['v_sales_summary']['Row'];
export type DbOwnerFinancialPnlRow = Database['public']['Views']['v_owner_financial_pnl']['Row'];

export interface DbInventoryIncidenceRow {
  id: string;
  severity: 'ALTA' | 'MEDIA' | 'INFO';
  affected_module: string;
  sku_or_owner_ref: string;
  owner_id: string | null;
  description: string;
  required_action: string;
  status: 'Pendiente Revisión' | 'En Proceso' | 'Resuelto';
  resolved_at: string | null;
  created_at: string;
}

export interface DbAuditLogRow {
  id: string;
  audit_seq: number;
  actor_user_id: string | null;
  actor_role: string | null;
  action_type: string;
  table_name: string;
  record_pk: string;
  owner_id_affected: string | null;
  previous_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface DashboardLiveSnapshot {
  connected: boolean;
  owners: DbOwnerRow[];
  inventoryRows: DbAvailableInventoryRow[];
  incidences: DbInventoryIncidenceRow[];
  salesRows: DbSalesSummaryRow[];
  ownerPnlRows: DbOwnerFinancialPnlRow[];
  categoriesCount: number;
  totals: {
    uniqueSkus: number;
    physicalUnits: number;
    availableUnits: number;
    pendingInspectionUnits: number;
    defectiveUnits: number;
    reservedUnits: number;
    inventoryCostCop: number;
    netSalesCop: number;
    cogsCop: number;
    attributableProfitCop: number;
    openIncidencesCount: number;
  };
  errors: string[];
}

export async function fetchLiveOwnersFromSupabase(): Promise<{
  data: DbOwnerRow[];
  error: string | null;
}> {
  if (!supabase || !isSupabaseConfigured) {
    return { data: [], error: 'Supabase no configurado en el cliente.' };
  }
  const { data, error } = await supabase
    .from('owners')
    .select('*')
    .order('internal_code', { ascending: true });
  return { data: (data ?? []) as DbOwnerRow[], error: error?.message ?? null };
}

export async function fetchLiveAvailableInventoryFromSupabase(
  ownerIdFilter?: string
): Promise<{
  data: DbAvailableInventoryRow[];
  error: string | null;
}> {
  if (!supabase || !isSupabaseConfigured) {
    return { data: [], error: 'Supabase no configurado en el cliente.' };
  }
  let query = supabase.from('v_available_inventory').select('*');
  if (ownerIdFilter && ownerIdFilter !== 'ALL') {
    query = query.eq('owner_id', ownerIdFilter);
  }
  const { data, error } = await query;
  return { data: (data ?? []) as DbAvailableInventoryRow[], error: error?.message ?? null };
}

export async function fetchLiveBusinessSettings(): Promise<{
  data: DbBusinessSettingsRow | null;
  error: string | null;
}> {
  if (!supabase || !isSupabaseConfigured) {
    return { data: null, error: 'Supabase no configurado en el cliente.' };
  }
  const { data, error } = await supabase
    .from('business_settings')
    .select('*')
    .eq('id', 'REAL_TWS_DEFAULT')
    .maybeSingle();
  return { data: (data as DbBusinessSettingsRow | null) ?? null, error: error?.message ?? null };
}

export async function saveLiveBusinessSettings(
  updates: Partial<Omit<DbBusinessSettingsRow, 'id' | 'created_at' | 'updated_at'>>,
  updatedByUserId?: string
): Promise<{ data: DbBusinessSettingsRow | null; error: string | null }> {
  if (!supabase || !isSupabaseConfigured) {
    return { data: null, error: 'Supabase no configurado en el cliente.' };
  }
  const payload = {
    id: 'REAL_TWS_DEFAULT',
    ...updates,
    updated_by: updatedByUserId ?? null,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from('business_settings')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();
  return { data: (data as DbBusinessSettingsRow | null) ?? null, error: error?.message ?? null };
}

export async function fetchLiveCategories(): Promise<{
  data: DbCategoryRow[];
  error: string | null;
}> {
  if (!supabase || !isSupabaseConfigured) {
    return { data: [], error: 'Supabase no configurado en el cliente.' };
  }
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });
  return { data: (data ?? []) as DbCategoryRow[], error: error?.message ?? null };
}

export async function upsertLiveCategory(input: {
  id?: string;
  code: string;
  name: string;
  description?: string;
  is_active?: boolean;
}): Promise<{ data: DbCategoryRow | null; error: string | null }> {
  if (!supabase || !isSupabaseConfigured) {
    return { data: null, error: 'Supabase no configurado en el cliente.' };
  }
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from('categories')
    .upsert(payload, { onConflict: 'code' })
    .select('*')
    .single();
  return { data: (data as DbCategoryRow | null) ?? null, error: error?.message ?? null };
}

export async function fetchLiveIncidencesFromSupabase(
  ownerIdFilter?: string
): Promise<{
  data: DbInventoryIncidenceRow[];
  error: string | null;
}> {
  if (!supabase || !isSupabaseConfigured) {
    return { data: [], error: 'Supabase no configurado en el cliente.' };
  }
  let query = supabase
    .from('inventory_incidences')
    .select('*')
    .order('created_at', { ascending: false });
  if (ownerIdFilter && ownerIdFilter !== 'ALL') {
    query = query.eq('owner_id', ownerIdFilter);
  }
  const { data, error } = await query;
  return { data: (data ?? []) as DbInventoryIncidenceRow[], error: error?.message ?? null };
}

export async function fetchLiveAuditLogsFromSupabase(
  limit = 100
): Promise<{
  data: DbAuditLogRow[];
  error: string | null;
}> {
  if (!supabase || !isSupabaseConfigured) {
    return { data: [], error: 'Supabase no configurado en el cliente.' };
  }
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: (data ?? []) as DbAuditLogRow[], error: error?.message ?? null };
}

export async function fetchLiveNotifications(): Promise<{
  data: DbNotificationRow[];
  error: string | null;
}> {
  if (!supabase || !isSupabaseConfigured) {
    return { data: [], error: 'Supabase no configurado en el cliente.' };
  }
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  return { data: (data ?? []) as DbNotificationRow[], error: error?.message ?? null };
}

export async function dispatchLiveAutomationEventRpc(input: {
  idempotencyKey: string;
  eventType: string;
  referenceEntity: string;
  referenceId: string;
  sku: string;
  ownerId: string;
  payload?: Record<string, unknown>;
  triggeredBy?: string;
}): Promise<{ ok: boolean; error: string | null }> {
  if (!supabase || !isSupabaseConfigured) {
    return { ok: false, error: 'Supabase no configurado en el cliente.' };
  }
  const { error } = await supabase.rpc('fn_dispatch_idempotent_automation_event', {
    p_idempotency_key: input.idempotencyKey,
    p_event_type: input.eventType,
    p_reference_entity: input.referenceEntity,
    p_reference_id: input.referenceId,
    p_sku: input.sku,
    p_owner_id: input.ownerId,
    p_payload: input.payload ?? {},
    p_triggered_by: input.triggeredBy ?? 'client_rpc'
  } as never);
  return { ok: !error, error: error?.message ?? null };
}

export async function fetchDashboardLiveSnapshot(
  ownerScope: string
): Promise<DashboardLiveSnapshot> {
  const emptyTotals = {
    uniqueSkus: 0,
    physicalUnits: 0,
    availableUnits: 0,
    pendingInspectionUnits: 0,
    defectiveUnits: 0,
    reservedUnits: 0,
    inventoryCostCop: 0,
    netSalesCop: 0,
    cogsCop: 0,
    attributableProfitCop: 0,
    openIncidencesCount: 0
  };

  if (!supabase || !isSupabaseConfigured) {
    return {
      connected: false,
      owners: [],
      inventoryRows: [],
      incidences: [],
      salesRows: [],
      ownerPnlRows: [],
      categoriesCount: 0,
      totals: emptyTotals,
      errors: ['Supabase no configurado.']
    };
  }

  const [ownersRes, invRes, incRes, salesRes, pnlRes, catRes] = await Promise.all([
    fetchLiveOwnersFromSupabase(),
    fetchLiveAvailableInventoryFromSupabase(ownerScope),
    fetchLiveIncidencesFromSupabase(ownerScope),
    supabase.from('v_sales_summary').select('*').order('order_date', { ascending: false }).limit(200),
    ownerScope && ownerScope !== 'ALL'
      ? supabase.from('v_owner_financial_pnl').select('*').eq('owner_id', ownerScope)
      : supabase.from('v_owner_financial_pnl').select('*'),
    supabase.from('categories').select('id', { count: 'exact', head: true })
  ]);

  const errors: string[] = [];
  if (ownersRes.error) errors.push(`Propietarios: ${ownersRes.error}`);
  if (invRes.error) errors.push(`Inventario: ${invRes.error}`);
  if (incRes.error) errors.push(`Incidencias: ${incRes.error}`);
  if (salesRes.error) errors.push(`Ventas: ${salesRes.error.message}`);
  if (pnlRes.error) errors.push(`Finanzas por propietario: ${pnlRes.error.message}`);
  if (catRes.error) errors.push(`Categorías: ${catRes.error.message}`);

  const inventoryRows = invRes.data;
  const incidences = incRes.data;
  const salesRows = (salesRes.data ?? []) as DbSalesSummaryRow[];
  const ownerPnlRows = (pnlRes.data ?? []) as DbOwnerFinancialPnlRow[];

  const uniqueSkus = new Set(inventoryRows.map((r) => r.sku)).size;
  const physicalUnits = inventoryRows.reduce((acc, r) => acc + Number(r.qty_physical || 0), 0);
  const availableUnits = inventoryRows.reduce((acc, r) => acc + Number(r.qty_available || 0), 0);
  const pendingInspectionUnits = inventoryRows.reduce(
    (acc, r) => acc + Number(r.qty_pending_inspection || 0),
    0
  );
  const defectiveUnits = inventoryRows.reduce((acc, r) => acc + Number(r.qty_defective || 0), 0);
  const reservedUnits = inventoryRows.reduce((acc, r) => acc + Number(r.qty_reserved || 0), 0);
  const inventoryCostCop = inventoryRows.reduce(
    (acc, r) => acc + Number(r.qty_physical || 0) * Number(r.effective_unit_cost_cop || 0),
    0
  );

  const netSalesCop = ownerPnlRows.reduce((acc, r) => acc + Number(r.net_sales_cop || 0), 0);
  const cogsCop = ownerPnlRows.reduce((acc, r) => acc + Number(r.total_cogs_cop || 0), 0);
  const attributableProfitCop = ownerPnlRows.reduce(
    (acc, r) => acc + Number(r.net_attributable_profit_cop || 0),
    0
  );
  const openIncidencesCount = incidences.filter((i) => i.status !== 'Resuelto').length;

  return {
    connected: true,
    owners: ownersRes.data,
    inventoryRows,
    incidences,
    salesRows,
    ownerPnlRows,
    categoriesCount: catRes.count ?? 0,
    totals: {
      uniqueSkus,
      physicalUnits,
      availableUnits,
      pendingInspectionUnits,
      defectiveUnits,
      reservedUnits,
      inventoryCostCop,
      netSalesCop,
      cogsCop,
      attributableProfitCop,
      openIncidencesCount
    },
    errors
  };
}
