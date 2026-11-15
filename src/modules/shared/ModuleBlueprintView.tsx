import { useState, useEffect, useMemo } from 'react';
import { Database, ShieldCheck, Layers } from 'lucide-react';
import type { NavItemConfig, TableColumn } from '../../types/domain';
import { PendingModuleBanner } from '../../components/StatusStates';
import { FilterBar } from '../../components/FilterBar';
import { DataTable } from '../../components/DataTable';
import { useOwnerScope } from '../../hooks/useOwnerScope';
import { ExcelImportModule } from '../import/ExcelImportModule';
import {
  getCurrentImportState,
  type NormalizedImportRow
} from '../../services/excelImportEngine';
import { formatCOP } from '../../utils/formatters';

interface ModuleBlueprintViewProps {
  moduleConfig: NavItemConfig;
}

export function ModuleBlueprintView({ moduleConfig }: ModuleBlueprintViewProps) {
  const { selectedOwnerScope } = useOwnerScope();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [importState, setImportState] = useState(() => getCurrentImportState());

  useEffect(() => {
    const onImportUpdated = () => {
      setImportState(getCurrentImportState());
    };
    window.addEventListener('rtw-import-state-updated', onImportUpdated);
    return () => window.removeEventListener('rtw-import-state-updated', onImportUpdated);
  }, []);

  const showImportEngineHere =
    moduleConfig.id === 'recepciones-compras' || moduleConfig.id === 'inventario';

  const importedRows = useMemo<NormalizedImportRow[]>(() => {
    const all = Object.values(importState.importedRowsByKey);
    return all.filter((r) => {
      if (selectedOwnerScope !== 'ALL' && r.ownerId !== selectedOwnerScope) {
        return false;
      }
      if (statusFilter === 'ACTIVE' && r.qtyPhysical === 0) {
        return false;
      }
      if (
        statusFilter === 'PENDING' &&
        r.costStatus !== 'PENDING_COST' &&
        r.qtyPendingInspection === 0
      ) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          r.sku.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.lotId.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [importState.importedRowsByKey, selectedOwnerScope, statusFilter, searchQuery]);

  const moduleSupportsImportedData = [
    'productos',
    'inventario',
    'recepciones-compras',
    'costos'
  ].includes(moduleConfig.id);

  const dynamicColumns = useMemo<TableColumn<NormalizedImportRow>[]>(() => {
    if (moduleConfig.id === 'productos') {
      return [
        { key: 'code', header: 'Código Producto', render: (r) => <code>{r.productCode}</code> },
        { key: 'sku', header: 'SKU Único', render: (r) => <strong>{r.sku}</strong> },
        { key: 'cat', header: 'Categoría', render: (r) => r.category },
        { key: 'name', header: 'Nombre del Producto', render: (r) => r.productName },
        { key: 'brand', header: 'Marca', render: (r) => r.brand || 'Genérico' },
        { key: 'model', header: 'Modelo', render: (r) => r.model || 'Estándar' },
        { key: 'color', header: 'Variante / Color', render: (r) => r.color },
        { key: 'status', header: 'Estado', render: (r) => r.excelStatus }
      ];
    }
    if (moduleConfig.id === 'inventario') {
      return [
        { key: 'lot', header: 'ID Lote', render: (r) => <code>{r.lotId}</code> },
        { key: 'sku', header: 'SKU', render: (r) => <strong>{r.sku}</strong> },
        { key: 'owner', header: 'Propietario', render: (r) => `${r.ownerId} (${r.ownerName})` },
        { key: 'bin', header: 'Ubicación', render: (r) => r.storageBin },
        { key: 'phys', header: 'Cant. Física', align: 'right', render: (r) => r.qtyPhysical },
        { key: 'good', header: 'Cant. Apta', align: 'right', render: (r) => r.qtyGood },
        { key: 'res', header: 'Reservada', align: 'right', render: (r) => r.qtyReserved },
        { key: 'pend', header: 'Pend. Revisión', align: 'right', render: (r) => r.qtyPendingInspection },
        { key: 'avail', header: 'Disponible', align: 'right', render: (r) => r.qtyAvailable }
      ];
    }
    if (moduleConfig.id === 'costos') {
      return [
        { key: 'lot', header: 'ID Lote', render: (r) => <code>{r.lotId}</code> },
        { key: 'owner', header: 'Propietario', render: (r) => `${r.ownerId} (${r.ownerName})` },
        { key: 'sku', header: 'SKU', render: (r) => <strong>{r.sku}</strong> },
        { key: 'qty', header: 'Cant. Fís.', align: 'right', render: (r) => r.qtyPhysical },
        {
          key: 'cost',
          header: 'Costo Compra COP',
          align: 'right',
          render: (r) => (r.unitCostCop === null ? 'PENDING_COST' : formatCOP(r.unitCostCop))
        },
        { key: 'ship', header: 'Transporte COP', align: 'right', render: () => '$0 COP' },
        {
          key: 'final',
          header: 'Costo Unitario Final COP',
          align: 'right',
          render: (r) => (r.unitCostCop === null ? 'PENDING_COST' : formatCOP(r.unitCostCop))
        },
        { key: 'status', header: 'Estado Costo', render: (r) => r.costStatus }
      ];
    }
    return moduleConfig.plannedColumns.map((colHeader, idx) => ({
      key: `col-${idx}`,
      header: colHeader,
      render: (r: NormalizedImportRow) => {
        if (idx === 0) return r.allocationCode;
        if (idx === 1) return r.lotId;
        if (idx === 2) return 'IMPORTACIÓN INICIAL';
        if (idx === 3) return r.supplierName;
        if (idx === 4) return r.ownerId;
        if (idx === 5) return r.sku;
        if (idx === 6) return String(r.qtyPhysical);
        return r.costStatus;
      }
    }));
  }, [moduleConfig]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {showImportEngineHere && <ExcelImportModule />}

      {!showImportEngineHere && (
        <PendingModuleBanner
          phaseNumber={moduleConfig.phaseNumber}
          moduleLabel={moduleConfig.label}
          summary={moduleConfig.summary}
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px'
        }}
      >
        <section className="rtw-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px'
            }}
          >
            <Database size={18} color="#d4af37" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>
              Tablas Objetivo en Supabase (Fase {moduleConfig.phaseNumber})
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {moduleConfig.supabaseTables.map((table) => (
              <span key={table} className="rtw-badge rtw-badge-gold">
                public.{table}
              </span>
            ))}
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '10px' }}>
            Alcance Multipropietario activo en cabecera:{' '}
            <strong>
              {selectedOwnerScope === 'ALL'
                ? 'Consolidado (Todos los propietarios)'
                : `${selectedOwnerScope} (Eberto)`}
            </strong>
          </p>
        </section>

        <section className="rtw-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px'
            }}
          >
            <ShieldCheck size={18} color="#166534" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>
              Reglas de Negocio Obligatorias en este Módulo
            </h3>
          </div>
          <ul
            style={{
              paddingLeft: '18px',
              fontSize: '0.83rem',
              color: '#334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            {moduleConfig.enforcedRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rtw-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px'
          }}
        >
          <Layers size={18} color="#171e29" />
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>
              Estructura Oficial de Tabla — {moduleConfig.label}
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
              {moduleSupportsImportedData && importedRows.length > 0
                ? `Mostrando ${importedRows.length} registros reales importados por el EXCEL IMPORT ENGINE.`
                : `Esquema preparado para conexión con Supabase en la Fase ${moduleConfig.phaseNumber}. No se muestran registros ficticios.`}
            </p>
          </div>
        </div>

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={[
            { value: 'ALL', label: 'Todos los registros reales' },
            { value: 'ACTIVE', label: 'Con stock físico (> 0)' },
            { value: 'PENDING', label: 'Pendientes de revisión / PENDING_COST' }
          ]}
          onReset={() => {
            setSearchQuery('');
            setStatusFilter('ALL');
          }}
        />

        <DataTable
          columns={dynamicColumns}
          data={moduleSupportsImportedData ? importedRows : []}
          rowKey={(row, idx) => row.sku || `empty-${idx}`}
          emptyTitle={
            moduleSupportsImportedData
              ? `Sin registros importados aún en "${moduleConfig.label}"`
              : `Módulo "${moduleConfig.label}" pendiente de implementación en Fase ${moduleConfig.phaseNumber}`
          }
          emptyDescription={
            moduleSupportsImportedData
              ? 'Utilice el Motor de Importación Excel (EXCEL IMPORT ENGINE) en Inventario o Recepciones y Compras para importar el archivo multipropietario real.'
              : 'Cumpliendo la Regla 5 del proyecto, esta tabla permanece libre de datos comerciales ficticios.'
          }
        />
      </section>
    </div>
  );
}
