import { isSupabaseConfigured } from '../lib/supabase';
import type { OwnerRecord } from '../types/domain';

export interface AuditedBaselineSummary {
  sourceWorkbook: string;
  dbConnectionState: 'CONECTADO' | 'PENDIENTE_FASE_2';
  owners: OwnerRecord[];
  categoryBreakdown: Array<{
    category: string;
    skus: number;
    physicalUnits: number;
    availableUnits: number;
  }>;
  incidencesCount: number;
  registeredPurchaseCostCop: number;
  historicalSalesNetCop: number;
  historicalGrossProfitCop: number;
}

/**
 * Devuelve la línea base real auditada del archivo oficial
 * REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx sin inventar productos ni ventas.
 * En la Fase 2 se conectará directamente a PostgreSQL en Supabase.
 */
export function getSystemBaselineSummary(): AuditedBaselineSummary {
  return {
    sourceWorkbook: 'REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx',
    dbConnectionState: isSupabaseConfigured ? 'CONECTADO' : 'PENDIENTE_FASE_2',
    owners: [
      {
        id: 'OWN-0001',
        internalCode: 'OWN-0001',
        name: 'Eberto',
        status: 'Activo',
        associatedSkus: 40,
        physicalUnits: 38,
        availableUnits: 0,
        pendingInspectionUnits: 38,
        historicalSoldUnits: 2
      }
    ],
    categoryBreakdown: [
      { category: 'Relojería (Moda / Dep. / Dama)', skus: 10, physicalUnits: 10, availableUnits: 0 },
      { category: 'Audio / Auriculares TWS', skus: 6, physicalUnits: 5, availableUnits: 0 },
      { category: 'Motocicletas (Ilum. / Acc.)', skus: 6, physicalUnits: 7, availableUnits: 0 },
      { category: 'Electrónica (RF / Relé / DIY)', skus: 7, physicalUnits: 7, availableUnits: 0 },
      { category: 'Hogar / Control de Plagas', skus: 4, physicalUnits: 4, availableUnits: 0 },
      { category: 'Herramientas / Otros Acc.', skus: 7, physicalUnits: 5, availableUnits: 0 }
    ],
    incidencesCount: 7,
    registeredPurchaseCostCop: 366700,
    historicalSalesNetCop: 65000,
    historicalGrossProfitCop: 43300
  };
}
