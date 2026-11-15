import { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  Tag,
  Receipt,
  Users,
  Landmark,
  ShieldCheck,
  AlertTriangle,
  Play,
  Download,
  CheckCircle2,
  Sliders
} from 'lucide-react';
import {
  type FinancialAccountingStoreState,
  type FinancialTestScenarioResult,
  type SharedExpensePolicyCriterion,
  type DistributionModelType,
  getFinancialAccountingState,
  buildAllLotsCostBreakdowns,
  updateLotAcquisitionAndDirectCosts,
  authorizeSkuCommercialPricing,
  simulatePricingAndBreakEven,
  configureOwnerCommercialAgreement,
  txRegisterAndAllocateExpense,
  buildOwnerAccountStatements,
  txCreateConciliatedSettlement,
  runFinancialAccountingTestSuite
} from '../../services/financialAccountingService';
import { ensureExcelBaselineLoadedInInventory } from '../../services/inventoryPurchaseService';
import { exportRowsToCsvUtf8 } from '../../utils/spreadsheetParser';
import { formatCOP } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import { useOwnerScope } from '../../hooks/useOwnerScope';
import { useNotifications } from '../../hooks/useNotifications';
import { ModuleHeader, SegmentedTabs, StatCard } from '../../components/glass';

export type FinanceSectionTab =
  | 'COSTS'
  | 'PRICES_SIMULATOR'
  | 'EXPENSES'
  | 'OWNERS_AGREEMENTS_STATEMENT'
  | 'SETTLEMENTS'
  | 'TESTS_8';

interface FinancialAccountingModuleProps {
  initialTab?: FinanceSectionTab;
}

export function FinancialAccountingModule({
  initialTab = 'COSTS'
}: FinancialAccountingModuleProps) {
  const { userProfile } = useAuth();
  const { selectedOwnerScope } = useOwnerScope();
  const { notify } = useNotifications();
  const actorEmail = userProfile?.email || 'admin@realtws.co';

  const [activeTab, setActiveTab] = useState<FinanceSectionTab>(initialTab);
  const [finState, setFinState] = useState<FinancialAccountingStoreState>(() =>
    getFinancialAccountingState()
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const sync = () => setFinState(getFinancialAccountingState());
    window.addEventListener('rtw-financial-state-updated', sync);
    window.addEventListener('rtw-inventory-purchase-updated', sync);

    ensureExcelBaselineLoadedInInventory(actorEmail)
      .then(() => setFinState(getFinancialAccountingState()))
      .catch(() => {});

    return () => {
      window.removeEventListener('rtw-financial-state-updated', sync);
      window.removeEventListener('rtw-inventory-purchase-updated', sync);
    };
  }, [actorEmail]);

  const lotBreakdowns = useMemo(
    () => buildAllLotsCostBreakdowns(finState, selectedOwnerScope),
    [finState, selectedOwnerScope]
  );

  const ownerStatements = useMemo(
    () => buildOwnerAccountStatements(finState),
    [finState]
  );

  const activeOwnerStatement =
    ownerStatements.find(
      (s) => selectedOwnerScope === 'ALL' || s.ownerId === selectedOwnerScope
    ) || ownerStatements[0];

  // ================= 1. LOT COST FORM =================
  const [selectedLotAllocId, setSelectedLotAllocId] = useState<string>('');
  const [lotCostForm, setLotCostForm] = useState({
    purchaseUnitCostCop: '',
    inboundShippingUnitCostCop: 0,
    otherAcquisitionUnitCostCop: 0,
    packagingUnitCostCop: 0,
    attributableAdvertisingUnitCop: 0
  });

  useEffect(() => {
    if (!selectedLotAllocId && lotBreakdowns.length > 0) {
      const first = lotBreakdowns[0];
      setSelectedLotAllocId(first.lotAllocationId);
      setLotCostForm({
        purchaseUnitCostCop:
          first.purchaseUnitCostCop === null ? '' : String(first.purchaseUnitCostCop),
        inboundShippingUnitCostCop: first.inboundShippingUnitCostCop,
        otherAcquisitionUnitCostCop: first.otherAcquisitionUnitCostCop,
        packagingUnitCostCop: first.packagingUnitCostCop,
        attributableAdvertisingUnitCop: first.attributableAdvertisingUnitCop
      });
    }
  }, [lotBreakdowns, selectedLotAllocId]);

  // ================= 2. PRICING & SIMULATOR FORM =================
  const skuPricingList = useMemo(
    () => Object.values(finState.skuPricing),
    [finState.skuPricing]
  );
  const [selectedSkuForPrice, setSelectedSkuForPrice] = useState<string>('AUD-TWS-001-NEG');
  const [priceAuthForm, setPriceAuthForm] = useState({
    normalSalePriceCop: 35000,
    promotionalPriceCop: '',
    minimumAllowedPriceCop: 25000,
    maxDiscountPct: 10,
    changeReason: 'Autorización manual inicial de lista comercial verificada'
  });

  const [simInput, setSimInput] = useState({
    baseAcquisitionCostCop: 11500,
    inboundFreightAndOtherCop: 500,
    packagingUnitCostCop: 800,
    attributableAdUnitCostCop: 1200,
    storeCommissionPct: 10,
    normalPriceCop: 35000,
    discountAppliedPct: 5,
    minimumAllowedPriceCop: 25000,
    fixedExpensesPeriodCop: 150000
  });

  const simulationResult = useMemo(
    () => simulatePricingAndBreakEven(simInput),
    [simInput]
  );

  // ================= 3. EXPENSE FORM =================
  const [expForm, setExpForm] = useState({
    expenseCode: 'EXP-2026-0001',
    expenseDate: '2026-11-13',
    expenseScope: 'direct_owner' as 'direct_owner' | 'shared_multi_owner' | 'store_internal',
    category: 'Empaque y Embalaje' as
      | 'Transporte de Entrada'
      | 'Empaque y Embalaje'
      | 'Publicidad Atribuible'
      | 'Comisión Pasarela / Logística'
      | 'Operación Compartida Bodega'
      | 'Otro Gasto Operativo',
    description: '',
    totalAmountCop: 10000,
    allocationCriterion: 'single_owner_direct' as
      | 'single_owner_direct'
      | 'proportional_net_sales'
      | 'proportional_cogs'
      | 'proportional_units_sold'
      | 'manual_explicit'
      | 'store_absorbed',
    approvalStatus: 'approved' as 'draft_unapproved' | 'approved' | 'rejected',
    directOwnerId: 'OWN-0001',
    notes: ''
  });

  // ================= 4. OWNER AGREEMENT FORM =================
  const [agrForm, setAgrForm] = useState({
    ownerId: 'OWN-0001',
    ownerName: 'Eberto',
    status: 'pending_configuration' as 'pending_configuration' | 'active',
    distributionModel: 'profit_split_pct' as DistributionModelType,
    storeCommissionPct: '',
    ownerSharePct: '',
    minimumPriceGuardPct: '15',
    maxDiscountAllowedPct: '10',
    commercialAuthorizationMode: 'explicit_owner_approval' as
      | 'explicit_owner_approval'
      | 'store_delegated_within_limits'
      | 'admin_joint_signature',
    settlementMethod: 'conciliated_period_cutoff' as
      | 'conciliated_period_cutoff'
      | 'per_collected_order'
      | 'monthly_conciliated',
    advertisingResponsibility: 'owner_100_direct' as
      | 'owner_100_direct'
      | 'store_100_assumed'
      | 'shared_by_agreement_pct'
      | 'per_campaign_explicit',
    sharedExpensePolicy: 'proportional_net_sales' as SharedExpensePolicyCriterion,
    notes: ''
  });

  // ================= 5. SETTLEMENT FORM =================
  const [liqForm, setLiqForm] = useState({
    settlementCode: 'LIQ-2026-0001',
    ownerId: 'OWN-0001',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    amountToSettleCop: 20000,
    voucherReference: '',
    isConciliatedConfirmed: false,
    notes: ''
  });

  // ================= 6. TESTS =================
  const [testResults, setTestResults] = useState<FinancialTestScenarioResult[]>([]);

  // ================= HANDLERS =================
  const handleSaveLotCosts = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLotAllocId) return;
    try {
      const updated = updateLotAcquisitionAndDirectCosts(selectedLotAllocId, {
        purchaseUnitCostCop:
          lotCostForm.purchaseUnitCostCop.trim() === ''
            ? null
            : Number(lotCostForm.purchaseUnitCostCop),
        inboundShippingUnitCostCop: Number(lotCostForm.inboundShippingUnitCostCop),
        otherAcquisitionUnitCostCop: Number(lotCostForm.otherAcquisitionUnitCostCop),
        packagingUnitCostCop: Number(lotCostForm.packagingUnitCostCop),
        attributableAdvertisingUnitCop: Number(lotCostForm.attributableAdvertisingUnitCop)
      });
      setFinState(getFinancialAccountingState());
      notify(
        'success',
        `Costo de lote actualizado (${updated.sku})`,
        `Costo unitario real de adquisición: ${formatCOP(updated.realUnitAcquisitionCostCop)} · Total directo con empaque/publicidad: ${formatCOP(updated.totalDirectUnitCostCop)}.`
      );
    } catch (err) {
      notify('error', 'Error al guardar costos', err instanceof Error ? err.message : '');
    }
  };

  const handleAuthorizeSkuPrice = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const rec = authorizeSkuCommercialPricing(
        {
          sku: selectedSkuForPrice,
          normalSalePriceCop: Number(priceAuthForm.normalSalePriceCop),
          promotionalPriceCop:
            priceAuthForm.promotionalPriceCop.trim() === ''
              ? null
              : Number(priceAuthForm.promotionalPriceCop),
          minimumAllowedPriceCop: Number(priceAuthForm.minimumAllowedPriceCop),
          maxDiscountPct: Number(priceAuthForm.maxDiscountPct),
          changeReason: priceAuthForm.changeReason
        },
        actorEmail
      );
      setFinState(getFinancialAccountingState());
      notify(
        'success',
        `Precio autorizado para ${rec.sku}`,
        `Normal: ${formatCOP(rec.newNormalPriceCop)} · Mínimo: ${formatCOP(rec.minimumAllowedPriceCop)} · Margen: ${rec.grossMarginPct ?? 0}%.`
      );
    } catch (err) {
      notify('error', 'Autorización de precio rechazada', err instanceof Error ? err.message : '');
    }
  };

  const handleRegisterExpense = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const exp = txRegisterAndAllocateExpense(
        {
          expenseCode: expForm.expenseCode,
          expenseDate: expForm.expenseDate,
          expenseScope: expForm.expenseScope,
          category: expForm.category,
          description: expForm.description,
          totalAmountCop: Number(expForm.totalAmountCop),
          allocationCriterion:
            expForm.expenseScope === 'direct_owner'
              ? 'single_owner_direct'
              : expForm.expenseScope === 'store_internal'
                ? 'store_absorbed'
                : expForm.allocationCriterion,
          approvalStatus: expForm.approvalStatus,
          directOwnerId: expForm.directOwnerId,
          notes: expForm.notes
        },
        actorEmail
      );
      setFinState(getFinancialAccountingState());
      notify(
        'success',
        `Gasto ${exp.expenseCode} registrado y prorrateado`,
        `Distribuido en ${exp.slices.length} asignación(es) bajo criterio aprobado "${exp.allocationCriterion}".`
      );
    } catch (err) {
      notify(
        'error',
        'Gasto bloqueado por regla contable',
        err instanceof Error ? err.message : ''
      );
    }
  };

  const handleSaveAgreement = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saved = configureOwnerCommercialAgreement(
        {
          ownerId: agrForm.ownerId,
          ownerName: agrForm.ownerName,
          status: agrForm.status,
          distributionModel:
            agrForm.status === 'active' ? agrForm.distributionModel : null,
          storeCommissionPct:
            agrForm.storeCommissionPct.trim() === ''
              ? null
              : Number(agrForm.storeCommissionPct),
          ownerSharePct:
            agrForm.ownerSharePct.trim() === ''
              ? null
              : Number(agrForm.ownerSharePct),
          minimumPriceGuardPct:
            agrForm.minimumPriceGuardPct.trim() === ''
              ? null
              : Number(agrForm.minimumPriceGuardPct),
          maxDiscountAllowedPct:
            agrForm.maxDiscountAllowedPct.trim() === ''
              ? null
              : Number(agrForm.maxDiscountAllowedPct),
          commercialAuthorizationMode: agrForm.commercialAuthorizationMode,
          settlementMethod: agrForm.status === 'active' ? agrForm.settlementMethod : null,
          advertisingResponsibility:
            agrForm.status === 'active' ? agrForm.advertisingResponsibility : null,
          sharedExpensePolicy:
            agrForm.status === 'active' ? agrForm.sharedExpensePolicy : null,
          notes: agrForm.notes
        },
        actorEmail
      );
      setFinState(getFinancialAccountingState());
      notify(
        saved.status === 'active' ? 'success' : 'warning',
        `Acuerdo ${saved.agreementCode} actualizado`,
        saved.status === 'active'
          ? `Acuerdo ACTIVO (${saved.storeCommissionPct}% comisión REAL TWS / ${saved.ownerSharePct}% propietario).`
          : 'Acuerdo marcado como PENDIENTE DE CONFIGURAR.'
      );
    } catch (err) {
      notify('error', 'Acuerdo comercial rechazado', err instanceof Error ? err.message : '');
    }
  };

  const handleCreateSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = txCreateConciliatedSettlement(
        {
          settlementCode: liqForm.settlementCode,
          ownerId: liqForm.ownerId,
          periodStart: liqForm.periodStart,
          periodEnd: liqForm.periodEnd,
          amountToSettleCop: Number(liqForm.amountToSettleCop),
          voucherReference: liqForm.voucherReference,
          isConciliatedConfirmed: liqForm.isConciliatedConfirmed,
          notes: liqForm.notes
        },
        actorEmail
      );
      setFinState(getFinancialAccountingState());
      notify(
        'success',
        `Liquidación ${created.settlementCode} aprobada bajo conciliación`,
        `Monto aprobado: ${formatCOP(created.amountApprovedToSettleCop)} · Saldo remanente: ${formatCOP(created.finalRemainingBalanceCop)} (Sin pago automático).`
      );
    } catch (err) {
      notify(
        'error',
        'Liquidación bloqueada por reglas financieras',
        err instanceof Error ? err.message : ''
      );
    }
  };

  const handleExportStatementsCsv = () => {
    exportRowsToCsvUtf8(
      'REAL_TWS_ESTADO_CUENTA_PROPIETARIOS.csv',
      [
        'ID_Propietario',
        'Nombre',
        'Estado_Acuerdo',
        'SKUs',
        'Unid_Vendidas_Netas',
        'Ventas_Brutas_COP',
        'Descuentos_COP',
        'Devoluciones_COP',
        'Ventas_Netas_COP',
        'COGS_Costo_Vendido_COP',
        'Gastos_Directos_COP',
        'Gastos_Compartidos_COP',
        'Publicidad_Atribuible_COP',
        'Comision_REAL_TWS_COP',
        'Utilidad_Atribuible_Devengada_COP',
        'Dinero_Cobrado_Ventas_COP',
        'Cartera_Por_Cobrar_COP',
        'Pagos_Anteriores_COP',
        'Saldo_Final_Conciliado_COP'
      ],
      ownerStatements.map((s) => [
        s.ownerId,
        s.ownerName,
        s.agreementIsPending ? 'PENDIENTE DE CONFIGURAR' : s.agreement.status,
        s.associatedSkusCount,
        s.netUnitsSold,
        s.grossSalesCop,
        s.discountsProratedCop,
        s.returnsProratedCop,
        s.netSalesCop,
        s.cogsSoldCop,
        s.directOwnerExpensesCop + s.packagingAndDirectSaleExpensesCop,
        s.sharedAllocatedExpensesCop,
        s.attributableAdvertisingCop,
        s.storeCommissionCop === null ? 'PENDIENTE DE CONFIGURAR' : s.storeCommissionCop,
        s.attributableNetProfitCop,
        s.collectedCashFromSalesCop,
        s.uncollectedReceivablesCop,
        s.previousSettledPaymentsCop,
        s.finalConciliatedBalanceCop
      ])
    );
  };

  return (
    <div className="module-container">
      {/* BANNER SUPERIOR DE ALERTA CUANDO FALTA ACUERDO CONFIGURADO */}
      {activeOwnerStatement?.agreementIsPending && (
        <div
          className="rtw-card"
          style={{
            background: 'var(--rtw-warning-bg)',
            border: '1px solid var(--rtw-warning-border)',
            borderLeft: '4px solid var(--rtw-gold-primary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="var(--rtw-warning-text)" />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--rtw-warning-text)', fontSize: '0.92rem' }}>
                Acuerdo pendiente de configurar ({activeOwnerStatement.ownerId} · {activeOwnerStatement.ownerName})
              </div>
              <div style={{ fontSize: '0.8rem', color: '#78350f' }}>
                Define el porcentaje de distribución antes de registrar liquidaciones para este propietario.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="rtw-btn rtw-btn-primary btn-sm"
            onClick={() => setActiveTab('OWNERS_AGREEMENTS_STATEMENT')}
          >
            Configurar acuerdo
          </button>
        </div>
      )}

      {/* CABECERA EJECUTIVA Y NAVEGADOR FINANCIERO */}
      <ModuleHeader
        variant="dark"
        eyebrow="FINANZAS · CONTABILIDAD MULTIPROPIETARIO"
        title="Costos, Precios, Propietarios y Liquidaciones"
        subtitle="Control de costos por lote, márgenes comerciales, gastos y estados de cuenta por propietario."
        actions={
          <button
            type="button"
            className="rtw-btn rtw-btn-gold btn-sm"
            onClick={handleExportStatementsCsv}
          >
            <Download size={14} /> Exportar CSV
          </button>
        }
        bottomSlot={
          <SegmentedTabs<FinanceSectionTab>
            variant="dark"
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { id: 'COSTS', label: 'Costos', icon: <Calculator size={14} /> },
              { id: 'PRICES_SIMULATOR', label: 'Precios', icon: <Tag size={14} /> },
              {
                id: 'EXPENSES',
                label: 'Gastos',
                icon: <Receipt size={14} />,
                count: finState.expenses.length
              },
              { id: 'OWNERS_AGREEMENTS_STATEMENT', label: 'Propietarios', icon: <Users size={14} /> },
              {
                id: 'SETTLEMENTS',
                label: 'Liquidaciones',
                icon: <Landmark size={14} />,
                count: finState.settlements.length
              },
              { id: 'TESTS_8', label: 'Diagnóstico', icon: <ShieldCheck size={14} /> }
            ]}
          />
        }
      />

      {/* KPIS FINANCIEROS MULTIPROPIETARIO */}
      {activeOwnerStatement && (
        <section className="rtw-kpi-grid">
          <StatCard
            staggerIndex={1}
            label="Ventas Netas"
            value={formatCOP(activeOwnerStatement.netSalesCop)}
            sub={`${activeOwnerStatement.netUnitsSold} u. (${activeOwnerStatement.ownerId})`}
            icon={<Tag size={16} />}
          />
          <StatCard
            staggerIndex={2}
            label="Costo Vendido (COGS)"
            value={formatCOP(activeOwnerStatement.cogsSoldCop)}
            sub={`Utilidad bruta: ${formatCOP(activeOwnerStatement.grossProfitCop)}`}
            icon={<Calculator size={16} />}
          />
          <StatCard
            staggerIndex={3}
            tone="warning"
            label="Comisión REAL TWS"
            value={
              activeOwnerStatement.storeCommissionCop === null
                ? 'Por configurar'
                : formatCOP(activeOwnerStatement.storeCommissionCop)
            }
            sub={`Gastos asignados: ${formatCOP(activeOwnerStatement.totalExpensesCop)}`}
            icon={<Receipt size={16} />}
          />
          <StatCard
            staggerIndex={4}
            tone="success"
            label="Utilidad Neta"
            value={formatCOP(activeOwnerStatement.attributableNetProfitCop)}
            sub={`Cobrado: ${formatCOP(activeOwnerStatement.collectedCashFromSalesCop)} · Cartera: ${formatCOP(activeOwnerStatement.uncollectedReceivablesCop)}`}
            icon={<CheckCircle2 size={16} />}
          />
          <StatCard
            staggerIndex={5}
            tone={activeOwnerStatement.finalConciliatedBalanceCop < 0 ? 'danger' : 'gold'}
            label="Saldo Conciliado"
            value={formatCOP(activeOwnerStatement.finalConciliatedBalanceCop)}
            sub={`Pagos previos: ${formatCOP(activeOwnerStatement.previousSettledPaymentsCop)}`}
            icon={<Landmark size={16} />}
          />
        </section>
      )}

      {/* =====================================================================
          PESTAÑA 1: COSTOS POR LOTE (COMPRA, TRANSPORTE, OTROS, EMPAQUE, PUBLICIDAD)
         ===================================================================== */}
      {activeTab === 'COSTS' && (
        <div className="rtw-split-grid">
          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '6px' }}>
              Estructura Completa de Costos por Lote y Propietario ({lotBreakdowns.length})
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '12px' }}>
              Costo Unitario Real de Adquisición = Costo Compra Lote + Transporte de Entrada + Otros Costos de Adquisición. Incluye Empaque Directo y Publicidad Atribuible.
            </p>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.76rem' }}>
                <thead>
                  <tr>
                    <th>Lote / Propietario</th>
                    <th>SKU / Producto</th>
                    <th>Unid.</th>
                    <th>Compra Unit.</th>
                    <th>Transp. Entrada</th>
                    <th>Otros Adq.</th>
                    <th>Costo Real Adq.</th>
                    <th>Empaque</th>
                    <th>Publicidad</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lotBreakdowns.map((b) => (
                    <tr
                      key={b.lotAllocationId}
                      onClick={() => {
                        setSelectedLotAllocId(b.lotAllocationId);
                        setLotCostForm({
                          purchaseUnitCostCop:
                            b.purchaseUnitCostCop === null ? '' : String(b.purchaseUnitCostCop),
                          inboundShippingUnitCostCop: b.inboundShippingUnitCostCop,
                          otherAcquisitionUnitCostCop: b.otherAcquisitionUnitCostCop,
                          packagingUnitCostCop: b.packagingUnitCostCop,
                          attributableAdvertisingUnitCop: b.attributableAdvertisingUnitCop
                        });
                      }}
                      style={{
                        cursor: 'pointer',
                        background:
                          selectedLotAllocId === b.lotAllocationId
                            ? 'rgba(212, 175, 55, 0.16)'
                            : undefined
                      }}
                    >
                      <td>
                        <code>{b.lotId}</code>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{b.ownerId}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800 }}>{b.sku}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          {b.productName}
                        </div>
                      </td>
                      <td style={{ fontWeight: 800 }}>{b.qtyPhysical}</td>
                      <td>
                        {b.purchaseUnitCostCop === null
                          ? 'PENDING_COST'
                          : formatCOP(b.purchaseUnitCostCop)}
                      </td>
                      <td>{formatCOP(b.inboundShippingUnitCostCop)}</td>
                      <td>{formatCOP(b.otherAcquisitionUnitCostCop)}</td>
                      <td style={{ fontWeight: 800, color: '#166534' }}>
                        {b.realUnitAcquisitionCostCop === null
                          ? 'PENDING_COST'
                          : formatCOP(b.realUnitAcquisitionCostCop)}
                      </td>
                      <td>{formatCOP(b.packagingUnitCostCop)}</td>
                      <td>{formatCOP(b.attributableAdvertisingUnitCop)}</td>
                      <td>
                        <span className="rtw-badge rtw-badge-gold">{b.costStatus}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '8px' }}>
              Conciliar / Actualizar Costos del Lote Seleccionado
            </h3>
            <form onSubmit={handleSaveLotCosts} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
                Costo Unitario de Compra (COP — vacío si sigue en PENDING_COST):
                <input
                  type="number"
                  min={0}
                  value={lotCostForm.purchaseUnitCostCop}
                  onChange={(e) =>
                    setLotCostForm({ ...lotCostForm, purchaseUnitCostCop: e.target.value })
                  }
                  style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>
              <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
                Transporte de Entrada Unitario (COP):
                <input
                  type="number"
                  min={0}
                  value={lotCostForm.inboundShippingUnitCostCop}
                  onChange={(e) =>
                    setLotCostForm({
                      ...lotCostForm,
                      inboundShippingUnitCostCop: Number(e.target.value)
                    })
                  }
                  style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>
              <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
                Otros Costos de Adquisición Unitarios (COP):
                <input
                  type="number"
                  min={0}
                  value={lotCostForm.otherAcquisitionUnitCostCop}
                  onChange={(e) =>
                    setLotCostForm({
                      ...lotCostForm,
                      otherAcquisitionUnitCostCop: Number(e.target.value)
                    })
                  }
                  style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>
              <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
                Costo Unitario de Empaque Directo (COP):
                <input
                  type="number"
                  min={0}
                  value={lotCostForm.packagingUnitCostCop}
                  onChange={(e) =>
                    setLotCostForm({
                      ...lotCostForm,
                      packagingUnitCostCop: Number(e.target.value)
                    })
                  }
                  style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>
              <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
                Publicidad Atribuible Unitaria (COP):
                <input
                  type="number"
                  min={0}
                  value={lotCostForm.attributableAdvertisingUnitCop}
                  onChange={(e) =>
                    setLotCostForm({
                      ...lotCostForm,
                      attributableAdvertisingUnitCop: Number(e.target.value)
                    })
                  }
                  style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>
              <button type="submit" className="rtw-btn rtw-btn-primary">
                Actualizar Costo Unitario Real del Lote
              </button>
            </form>
          </section>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: PRECIOS, HISTORIAL INMUTABLE Y SIMULADOR FINANCIERO
         ===================================================================== */}
      {activeTab === 'PRICES_SIMULATOR' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
            {/* SIMULADOR DE PRECIOS, MARGEN, MARKUP, CONTRIBUCIÓN Y PUNTO DE EQUILIBRIO */}
            <section className="rtw-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Sliders size={18} color="#d4af37" />
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                  Simulador Financiero: Margen, Markup, Contribución y Punto de Equilibrio
                </h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <label style={{ fontSize: '0.73rem', fontWeight: 700 }}>
                  Costo Compra (COP):
                  <input
                    type="number"
                    value={simInput.baseAcquisitionCostCop}
                    onChange={(e) =>
                      setSimInput({ ...simInput, baseAcquisitionCostCop: Number(e.target.value) })
                    }
                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ fontSize: '0.73rem', fontWeight: 700 }}>
                  Transporte + Otros (COP):
                  <input
                    type="number"
                    value={simInput.inboundFreightAndOtherCop}
                    onChange={(e) =>
                      setSimInput({
                        ...simInput,
                        inboundFreightAndOtherCop: Number(e.target.value)
                      })
                    }
                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ fontSize: '0.73rem', fontWeight: 700 }}>
                  Empaque Unitario (COP):
                  <input
                    type="number"
                    value={simInput.packagingUnitCostCop}
                    onChange={(e) =>
                      setSimInput({ ...simInput, packagingUnitCostCop: Number(e.target.value) })
                    }
                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ fontSize: '0.73rem', fontWeight: 700 }}>
                  Publicidad Unit. (COP):
                  <input
                    type="number"
                    value={simInput.attributableAdUnitCostCop}
                    onChange={(e) =>
                      setSimInput({
                        ...simInput,
                        attributableAdUnitCostCop: Number(e.target.value)
                      })
                    }
                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ fontSize: '0.73rem', fontWeight: 700 }}>
                  Comisión REAL TWS (%):
                  <input
                    type="number"
                    value={simInput.storeCommissionPct}
                    onChange={(e) =>
                      setSimInput({ ...simInput, storeCommissionPct: Number(e.target.value) })
                    }
                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ fontSize: '0.73rem', fontWeight: 700 }}>
                  Precio Normal (COP):
                  <input
                    type="number"
                    value={simInput.normalPriceCop}
                    onChange={(e) =>
                      setSimInput({ ...simInput, normalPriceCop: Number(e.target.value) })
                    }
                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ fontSize: '0.73rem', fontWeight: 700 }}>
                  Descuento Aplicado (%):
                  <input
                    type="number"
                    value={simInput.discountAppliedPct}
                    onChange={(e) =>
                      setSimInput({ ...simInput, discountAppliedPct: Number(e.target.value) })
                    }
                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ fontSize: '0.73rem', fontWeight: 700 }}>
                  Precio Mínimo (COP):
                  <input
                    type="number"
                    value={simInput.minimumAllowedPriceCop}
                    onChange={(e) =>
                      setSimInput({
                        ...simInput,
                        minimumAllowedPriceCop: Number(e.target.value)
                      })
                    }
                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ fontSize: '0.73rem', fontWeight: 700 }}>
                  Costos Fijos Periodo (COP):
                  <input
                    type="number"
                    value={simInput.fixedExpensesPeriodCop}
                    onChange={(e) =>
                      setSimInput({
                        ...simInput,
                        fixedExpensesPeriodCop: Number(e.target.value)
                      })
                    }
                    style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
              </div>

              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: simulationResult.isBelowMinimumPrice ? '#fef2f2' : '#f8fafc',
                  border: simulationResult.isBelowMinimumPrice
                    ? '1px solid #fca5a5'
                    : '1px solid #cbd5e1',
                  fontSize: '0.78rem'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                  <div>
                    <strong>Precio Neto Efectivo:</strong>{' '}
                    {formatCOP(simulationResult.effectiveNetSalePriceCop)}
                  </div>
                  <div>
                    <strong>Costo Real Adquisición:</strong>{' '}
                    {formatCOP(simulationResult.realUnitAcquisitionCostCop)}
                  </div>
                  <div>
                    <strong>Margen Bruto %:</strong>{' '}
                    <span style={{ color: '#166534', fontWeight: 800 }}>
                      {simulationResult.grossMarginPct}% ({formatCOP(simulationResult.grossMarginCop)})
                    </span>
                  </div>
                  <div>
                    <strong>Markup % (s/Costo):</strong>{' '}
                    <span style={{ fontWeight: 800 }}>{simulationResult.markupPct}%</span>
                  </div>
                  <div>
                    <strong>Contribución Unitaria:</strong>{' '}
                    <span style={{ color: '#166534', fontWeight: 800 }}>
                      {formatCOP(simulationResult.unitContributionMarginCop)} ({simulationResult.contributionMarginPct}%)
                    </span>
                  </div>
                  <div>
                    <strong>Punto de Equilibrio:</strong>{' '}
                    {simulationResult.breakEvenUnits !== null
                      ? `${simulationResult.breakEvenUnits} unid. (${formatCOP(simulationResult.breakEvenRevenueCop)})`
                      : 'No alcanzable'}
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                  <strong>Verificación Matemática de Fórmulas:</strong>
                  <ul style={{ paddingLeft: '16px', margin: '4px 0 0' }}>
                    {simulationResult.formulaVerificationLog.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* AUTORIZACIÓN MANUAL DE PRECIOS POR SKU */}
            <section className="rtw-card">
              <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '8px' }}>
                Autorización Manual de Precios por SKU
              </h3>
              <form onSubmit={handleAuthorizeSkuPrice} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <select
                  value={selectedSkuForPrice}
                  onChange={(e) => setSelectedSkuForPrice(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                >
                  {skuPricingList.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.sku} — {p.productName} (Costo base: {formatCOP(p.referenceLotCostCop)})
                    </option>
                  ))}
                </select>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Precio Normal (COP):
                    <input
                      type="number"
                      min={1}
                      value={priceAuthForm.normalSalePriceCop}
                      onChange={(e) =>
                        setPriceAuthForm({
                          ...priceAuthForm,
                          normalSalePriceCop: Number(e.target.value)
                        })
                      }
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Precio Promocional (COP — opcional):
                    <input
                      type="number"
                      min={0}
                      value={priceAuthForm.promotionalPriceCop}
                      onChange={(e) =>
                        setPriceAuthForm({
                          ...priceAuthForm,
                          promotionalPriceCop: e.target.value
                        })
                      }
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Precio Mínimo Autorizado (COP):
                    <input
                      type="number"
                      min={1}
                      value={priceAuthForm.minimumAllowedPriceCop}
                      onChange={(e) =>
                        setPriceAuthForm({
                          ...priceAuthForm,
                          minimumAllowedPriceCop: Number(e.target.value)
                        })
                      }
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Descuento Máximo Permitido (%):
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={priceAuthForm.maxDiscountPct}
                      onChange={(e) =>
                        setPriceAuthForm({
                          ...priceAuthForm,
                          maxDiscountPct: Number(e.target.value)
                        })
                      }
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </label>
                </div>

                <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  Motivo de Autorización (Obligatorio para Historial Inmutable):
                  <input
                    type="text"
                    value={priceAuthForm.changeReason}
                    onChange={(e) =>
                      setPriceAuthForm({ ...priceAuthForm, changeReason: e.target.value })
                    }
                    required
                    style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>

                <button type="submit" className="rtw-btn rtw-btn-primary">
                  Autorizar Precio y Registrar en price_history Inmutable
                </button>
              </form>

              <div style={{ marginTop: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: '6px' }}>
                  Historial Inmutable de Precios ({finState.priceHistory.length})
                </h4>
                {finState.priceHistory.length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    0 precios inventados. Autorice manualmente un precio comercial arriba para registrarlo en el historial inmutable.
                  </p>
                ) : (
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <table className="rtw-table" style={{ width: '100%', fontSize: '0.74rem' }}>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Normal</th>
                          <th>Promo</th>
                          <th>Mínimo</th>
                          <th>Margen / Markup</th>
                          <th>Autorizado Por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finState.priceHistory.map((ph) => (
                          <tr key={ph.id}>
                            <td style={{ fontWeight: 800 }}>{ph.sku}</td>
                            <td>{formatCOP(ph.newNormalPriceCop)}</td>
                            <td>
                              {ph.promotionalPriceCop === null
                                ? '—'
                                : formatCOP(ph.promotionalPriceCop)}
                            </td>
                            <td>{formatCOP(ph.minimumAllowedPriceCop)}</td>
                            <td>
                              {ph.grossMarginPct ?? 0}% / {ph.markupPct ?? 0}%
                            </td>
                            <td>{ph.approvedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: GASTOS DIRECTOS Y COMPARTIDOS MULTICRITERIO
         ===================================================================== */}
      {activeTab === 'EXPENSES' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '16px' }}>
          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '8px' }}>
              Registrar Gasto Directo o Compartido (Bloqueo de Criterios No Aprobados)
            </h3>
            <form onSubmit={handleRegisterExpense} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Código Gasto (ej. EXP-2026-0001)"
                  value={expForm.expenseCode}
                  onChange={(e) => setExpForm({ ...expForm, expenseCode: e.target.value })}
                  required
                  style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
                <input
                  type="date"
                  value={expForm.expenseDate}
                  onChange={(e) => setExpForm({ ...expForm, expenseDate: e.target.value })}
                  required
                  style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <select
                value={expForm.expenseScope}
                onChange={(e) =>
                  setExpForm({
                    ...expForm,
                    expenseScope: e.target.value as typeof expForm.expenseScope,
                    allocationCriterion:
                      e.target.value === 'direct_owner'
                        ? 'single_owner_direct'
                        : 'proportional_net_sales'
                  })
                }
                style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700 }}
              >
                <option value="direct_owner">1. Gasto Directo de un Propietario (direct_owner)</option>
                <option value="shared_multi_owner">
                  2. Gasto Compartido Multipropietario (shared_multi_owner)
                </option>
                <option value="store_internal">
                  3. Gasto Interno Absorbido por Tienda (store_internal)
                </option>
              </select>

              <select
                value={expForm.category}
                onChange={(e) =>
                  setExpForm({
                    ...expForm,
                    category: e.target.value as typeof expForm.category
                  })
                }
                style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="Empaque y Embalaje">Empaque y Embalaje</option>
                <option value="Publicidad Atribuible">Publicidad Atribuible</option>
                <option value="Transporte de Entrada">Transporte de Entrada</option>
                <option value="Comisión Pasarela / Logística">Comisión Pasarela / Logística</option>
                <option value="Operación Compartida Bodega">Operación Compartida Bodega</option>
                <option value="Otro Gasto Operativo">Otro Gasto Operativo</option>
              </select>

              {expForm.expenseScope === 'direct_owner' && (
                <select
                  value={expForm.directOwnerId}
                  onChange={(e) => setExpForm({ ...expForm, directOwnerId: e.target.value })}
                  style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  {Object.values(finState.agreements).map((a) => (
                    <option key={a.ownerId} value={a.ownerId}>
                      Propietario Afectado: {a.ownerId} — {a.ownerName}
                    </option>
                  ))}
                </select>
              )}

              {expForm.expenseScope === 'shared_multi_owner' && (
                <select
                  value={expForm.allocationCriterion}
                  onChange={(e) =>
                    setExpForm({
                      ...expForm,
                      allocationCriterion: e.target.value as typeof expForm.allocationCriterion
                    })
                  }
                  style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                >
                  <option value="proportional_net_sales">
                    Criterio 1: Proporcional a Ventas Netas (proportional_net_sales)
                  </option>
                  <option value="proportional_cogs">
                    Criterio 2: Proporcional al Costo Vendido COGS (proportional_cogs)
                  </option>
                  <option value="proportional_units_sold">
                    Criterio 3: Proporcional a Unidades Vendidas (proportional_units_sold)
                  </option>
                </select>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  Valor Total Gasto (COP):
                  <input
                    type="number"
                    min={1}
                    value={expForm.totalAmountCop}
                    onChange={(e) =>
                      setExpForm({ ...expForm, totalAmountCop: Number(e.target.value) })
                    }
                    style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                  Estado de Aprobación del Criterio:
                  <select
                    value={expForm.approvalStatus}
                    onChange={(e) =>
                      setExpForm({
                        ...expForm,
                        approvalStatus: e.target.value as typeof expForm.approvalStatus
                      })
                    }
                    style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="approved">Aprobado (Permitir aplicación)</option>
                    <option value="draft_unapproved">
                      Borrador No Aprobado (Probar bloqueo)
                    </option>
                  </select>
                </label>
              </div>

              <input
                type="text"
                placeholder="Descripción detallada y soporte del gasto"
                value={expForm.description}
                onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
                required
                style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />

              <button type="submit" className="rtw-btn rtw-btn-primary">
                Registrar y Prorratear Gasto Auditado
              </button>
            </form>
          </section>

          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '10px' }}>
              Libro Inmutable de Gastos y Prorrateo por Propietario ({finState.expenses.length})
            </h3>
            {finState.expenses.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                No se han registrado gastos operativos adicionales aún.
              </p>
            ) : (
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Fecha</th>
                    <th>Alcance / Categoría</th>
                    <th>Total COP</th>
                    <th>Criterio Aprobado</th>
                    <th>Asignación por Propietario</th>
                  </tr>
                </thead>
                <tbody>
                  {finState.expenses.map((ex) => (
                    <tr key={ex.id}>
                      <td style={{ fontWeight: 800 }}>{ex.expenseCode}</td>
                      <td>{ex.expenseDate}</td>
                      <td>
                        <div>{ex.category}</div>
                        <code style={{ fontSize: '0.7rem' }}>{ex.expenseScope}</code>
                      </td>
                      <td style={{ fontWeight: 800 }}>{formatCOP(ex.totalAmountCop)}</td>
                      <td>
                        <code>{ex.allocationCriterion}</code>
                      </td>
                      <td style={{ fontSize: '0.74rem' }}>
                        {ex.slices.map((sl) => (
                          <div key={sl.ownerId}>
                            <strong>{sl.ownerId}:</strong> {formatCOP(sl.allocatedAmountCop)} (
                            {sl.allocationPercentage}%)
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 4: PROPIETARIOS, ACUERDOS Y ESTADO DE CUENTA INDIVIDUAL
         ===================================================================== */}
      {activeTab === 'OWNERS_AGREEMENTS_STATEMENT' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '16px' }}>
            {/* CONFIGURADOR DE ACUERDO COMERCIAL */}
            <section className="rtw-card">
              <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '8px' }}>
                Configurar Acuerdo Comercial Multipropietario
              </h3>
              <form onSubmit={handleSaveAgreement} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    value={agrForm.ownerId}
                    onChange={(e) => setAgrForm({ ...agrForm, ownerId: e.target.value })}
                    placeholder="ID Propietario (ej. OWN-0001)"
                    required
                    style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                  <select
                    value={agrForm.status}
                    onChange={(e) =>
                      setAgrForm({
                        ...agrForm,
                        status: e.target.value as 'pending_configuration' | 'active'
                      })
                    }
                    style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                  >
                    <option value="pending_configuration">
                      PENDIENTE DE CONFIGURAR (Bloquea liquidación)
                    </option>
                    <option value="active">ACTIVO APROBADO</option>
                  </select>
                </div>

                <select
                  value={agrForm.distributionModel}
                  onChange={(e) =>
                    setAgrForm({
                      ...agrForm,
                      distributionModel: e.target.value as DistributionModelType
                    })
                  }
                  style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="profit_split_pct">
                    Participación sobre Utilidad Bruta (profit_split_pct)
                  </option>
                  <option value="store_commission_pct">
                    Comisión Fija sobre Venta Neta (store_commission_pct)
                  </option>
                  <option value="attributable_profit">
                    100% Utilidad Directa al Propietario (attributable_profit)
                  </option>
                </select>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                    Comisión REAL TWS (%):
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Sin inventar"
                      value={agrForm.storeCommissionPct}
                      onChange={(e) =>
                        setAgrForm({ ...agrForm, storeCommissionPct: e.target.value })
                      }
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                    Participación Propietario (%):
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Sin inventar"
                      value={agrForm.ownerSharePct}
                      onChange={(e) =>
                        setAgrForm({ ...agrForm, ownerSharePct: e.target.value })
                      }
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                    Protección Precio Mínimo (%):
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={agrForm.minimumPriceGuardPct}
                      onChange={(e) =>
                        setAgrForm({ ...agrForm, minimumPriceGuardPct: e.target.value })
                      }
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                    Descuento Máximo (%):
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={agrForm.maxDiscountAllowedPct}
                      onChange={(e) =>
                        setAgrForm({ ...agrForm, maxDiscountAllowedPct: e.target.value })
                      }
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                    Responsable de Publicidad:
                    <select
                      value={agrForm.advertisingResponsibility}
                      onChange={(e) =>
                        setAgrForm({
                          ...agrForm,
                          advertisingResponsibility: e.target
                            .value as typeof agrForm.advertisingResponsibility
                        })
                      }
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    >
                      <option value="owner_100_direct">100% Propietario (owner_100_direct)</option>
                      <option value="store_100_assumed">100% REAL TWS (store_100_assumed)</option>
                      <option value="shared_by_agreement_pct">
                        Compartido según % acuerdo (shared_by_agreement_pct)
                      </option>
                    </select>
                  </label>

                  <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                    Política Gastos Compartidos:
                    <select
                      value={agrForm.sharedExpensePolicy}
                      onChange={(e) =>
                        setAgrForm({
                          ...agrForm,
                          sharedExpensePolicy: e.target.value as SharedExpensePolicyCriterion
                        })
                      }
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    >
                      <option value="proportional_net_sales">Proporcional Ventas Netas</option>
                      <option value="proportional_cogs">Proporcional Costo Vendido (COGS)</option>
                      <option value="proportional_units_sold">Proporcional Unidades Vendidas</option>
                      <option value="manual_explicit">Manual Explícito Aprobado</option>
                    </select>
                  </label>
                </div>

                <button type="submit" className="rtw-btn rtw-btn-primary">
                  Guardar Configuración de Acuerdo Comercial
                </button>
              </form>
            </section>

            {/* ESTADO DE CUENTA INDIVIDUAL Y GENERAL */}
            <section className="rtw-card">
              <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '10px' }}>
                Estado de Cuenta Individual por Propietario y Consolidado General
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="rtw-table" style={{ width: '100%', fontSize: '0.76rem' }}>
                  <thead>
                    <tr>
                      <th>Propietario</th>
                      <th>Estado Acuerdo</th>
                      <th>Ventas Netas</th>
                      <th>Costo Vendido (COGS)</th>
                      <th>Gastos Totales</th>
                      <th>Comisión REAL TWS</th>
                      <th>Utilidad Devengada</th>
                      <th>Dinero Cobrado</th>
                      <th>Pagos Anteriores</th>
                      <th>Saldo Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownerStatements.map((st) => (
                      <tr key={st.ownerId}>
                        <td style={{ fontWeight: 800 }}>
                          {st.ownerId} ({st.ownerName})
                        </td>
                        <td>
                          {st.agreementIsPending ? (
                            <span className="rtw-badge rtw-badge-warning">
                              PENDIENTE DE CONFIGURAR
                            </span>
                          ) : (
                            <span className="rtw-badge rtw-badge-success">
                              ACTIVO ({st.agreement.storeCommissionPct}% / {st.agreement.ownerSharePct}%)
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: 700 }}>{formatCOP(st.netSalesCop)}</td>
                        <td>{formatCOP(st.cogsSoldCop)}</td>
                        <td>{formatCOP(st.totalExpensesCop)}</td>
                        <td style={{ fontWeight: 700, color: '#b45309' }}>
                          {st.storeCommissionCop === null
                            ? 'PENDIENTE DE CONFIGURAR'
                            : formatCOP(st.storeCommissionCop)}
                        </td>
                        <td style={{ fontWeight: 800, color: '#166534' }}>
                          {formatCOP(st.attributableNetProfitCop)}
                        </td>
                        <td>{formatCOP(st.collectedCashFromSalesCop)}</td>
                        <td>{formatCOP(st.previousSettledPaymentsCop)}</td>
                        <td
                          style={{
                            fontWeight: 800,
                            color: st.finalConciliatedBalanceCop < 0 ? '#b91c1c' : '#0f172a'
                          }}
                        >
                          {formatCOP(st.finalConciliatedBalanceCop)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* DETALLE DE VENTAS DESPACHADAS ATRIBUIDAS POR LOTE Y PROPIETARIO */}
          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '10px' }}>
              Descomposición Inmutable de Ventas Despachadas por Lote y Propietario ({finState.salesAllocations.length})
            </h3>
            <table className="rtw-table" style={{ width: '100%', fontSize: '0.77rem' }}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Pedido / Fecha</th>
                  <th>SKU / Lote</th>
                  <th>Propietario</th>
                  <th>Unid. Netas</th>
                  <th>Venta Neta</th>
                  <th>COGS Lote</th>
                  <th>Comisión REAL TWS</th>
                  <th>Utilidad Propietario</th>
                  <th>Cobrado en Caja</th>
                  <th>Documentación Prorrateo</th>
                </tr>
              </thead>
              <tbody>
                {finState.salesAllocations.map((sa) => (
                  <tr key={sa.id}>
                    <td>
                      <code>{sa.allocationSaleCode}</code>
                    </td>
                    <td>
                      {sa.orderNumber} · {sa.saleDate}
                    </td>
                    <td>
                      <strong>{sa.sku}</strong>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{sa.lotId}</div>
                    </td>
                    <td>
                      <span className="rtw-badge rtw-badge-gold">{sa.ownerId}</span>
                    </td>
                    <td style={{ fontWeight: 800 }}>{sa.netQtySold}</td>
                    <td>{formatCOP(sa.netRevenueCop)}</td>
                    <td>{formatCOP(sa.cogsTotalCop)}</td>
                    <td>
                      {sa.storeCommissionCop === null
                        ? 'PENDIENTE DE CONFIGURAR'
                        : formatCOP(sa.storeCommissionCop)}
                    </td>
                    <td style={{ fontWeight: 800, color: '#166534' }}>
                      {formatCOP(sa.attributableOwnerProfitCop)}
                    </td>
                    <td>{formatCOP(sa.collectedCashCop)}</td>
                    <td style={{ fontSize: '0.72rem', color: '#475569' }}>
                      {sa.prorationDocumentation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 5: LIQUIDACIONES BAJO CONCILIACIÓN MANUAL
         ===================================================================== */}
      {activeTab === 'SETTLEMENTS' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.45fr', gap: '16px' }}>
          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '6px' }}>
              Aprobar Liquidación Conciliada (Sin Liquidación ni Pago Automático)
            </h3>
            <p style={{ fontSize: '0.76rem', color: '#64748b', marginBottom: '10px' }}>
              Bloquea automáticamente si falta acuerdo configurado (<strong>PENDIENTE DE CONFIGURAR</strong>), si el saldo es negativo o si no se confirma la conciliación.
            </p>
            <form onSubmit={handleCreateSettlement} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                placeholder="Código Liquidación (ej. LIQ-2026-0001)"
                value={liqForm.settlementCode}
                onChange={(e) => setLiqForm({ ...liqForm, settlementCode: e.target.value })}
                required
                style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
              <select
                value={liqForm.ownerId}
                onChange={(e) => setLiqForm({ ...liqForm, ownerId: e.target.value })}
                style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700 }}
              >
                {ownerStatements.map((st) => (
                  <option key={st.ownerId} value={st.ownerId}>
                    {st.ownerId} ({st.ownerName}) — Saldo: {formatCOP(st.finalConciliatedBalanceCop)}{' '}
                    {st.agreementIsPending ? '[PENDIENTE DE CONFIGURAR]' : '[ACUERDO ACTIVO]'}
                  </option>
                ))}
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                  Inicio Periodo:
                  <input
                    type="date"
                    value={liqForm.periodStart}
                    onChange={(e) => setLiqForm({ ...liqForm, periodStart: e.target.value })}
                    style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
                <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                  Fin Periodo:
                  <input
                    type="date"
                    value={liqForm.periodEnd}
                    onChange={(e) => setLiqForm({ ...liqForm, periodEnd: e.target.value })}
                    style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
              </div>

              <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                Monto Aprobado a Liquidar (COP — permite liquidación parcial o total):
                <input
                  type="number"
                  min={1}
                  value={liqForm.amountToSettleCop}
                  onChange={(e) =>
                    setLiqForm({ ...liqForm, amountToSettleCop: Number(e.target.value) })
                  }
                  style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>

              <input
                type="text"
                placeholder="Referencia de Comprobante / Acta de Conciliación"
                value={liqForm.voucherReference}
                onChange={(e) => setLiqForm({ ...liqForm, voucherReference: e.target.value })}
                required
                style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.77rem',
                  fontWeight: 700,
                  padding: '8px',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1'
                }}
              >
                <input
                  type="checkbox"
                  checked={liqForm.isConciliatedConfirmed}
                  onChange={(e) =>
                    setLiqForm({ ...liqForm, isConciliatedConfirmed: e.target.checked })
                  }
                />
                Confirmo conciliación física y contable previa antes de aprobar
              </label>

              <button type="submit" className="rtw-btn rtw-btn-primary">
                <CheckCircle2 size={15} /> Aprobar Liquidación Conciliada (Sin Pago Automático)
              </button>
            </form>
          </section>

          <section className="rtw-card">
            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '10px' }}>
              Historial Inmutable de Liquidaciones ({finState.settlements.length})
            </h3>
            {finState.settlements.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                No se han emitido liquidaciones en producción todavía (el acuerdo inicial de OWN-0001 Eberto inicia en estado PENDIENTE DE CONFIGURAR).
              </p>
            ) : (
              <table className="rtw-table" style={{ width: '100%', fontSize: '0.76rem' }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Periodo</th>
                    <th>Propietario</th>
                    <th>Ventas Netas</th>
                    <th>COGS / Gastos</th>
                    <th>Comisión</th>
                    <th>Saldo Ant. / Pagos Ant.</th>
                    <th>Liquidado</th>
                    <th>Saldo Final</th>
                    <th>Comprobante / Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {finState.settlements.map((st) => (
                    <tr key={st.id}>
                      <td style={{ fontWeight: 800 }}>{st.settlementCode}</td>
                      <td>
                        {st.periodStart} a {st.periodEnd}
                      </td>
                      <td>{st.ownerId}</td>
                      <td>{formatCOP(st.netSalesPeriodCop)}</td>
                      <td>
                        {formatCOP(st.cogsPeriodCop)} /{' '}
                        {formatCOP(
                          st.directExpensesPeriodCop +
                            st.sharedExpensesPeriodCop +
                            st.attributableAdPeriodCop
                        )}
                      </td>
                      <td>{formatCOP(st.storeCommissionPeriodCop)}</td>
                      <td>
                        {formatCOP(st.previousBalanceCop)} / {formatCOP(st.previousPaymentsCop)}
                      </td>
                      <td style={{ fontWeight: 800, color: '#166534' }}>
                        {formatCOP(st.amountApprovedToSettleCop)}
                      </td>
                      <td style={{ fontWeight: 800 }}>{formatCOP(st.finalRemainingBalanceCop)}</td>
                      <td>
                        <div>{st.voucherReference}</div>
                        <span className="rtw-badge rtw-badge-gold">{st.approvalState}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 6: BATERÍA DE LAS 8 PRUEBAS OBLIGATORIAS EN SANDBOX
         ===================================================================== */}
      {activeTab === 'TESTS_8' && (
        <section className="rtw-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '14px'
            }}
          >
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
                Batería Automatizada de las 8 Pruebas Financieras y Multipropietario (Sandbox Aislado)
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Verifica: 1. Ventas de un propietario · 2. Ventas repartidas entre dos propietarios · 3. Devoluciones · 4. Gastos directos · 5. Gastos comunes · 6. Liquidación parcial · 7. Saldo negativo · 8. Acuerdo no configurado.
              </p>
            </div>
            <button
              type="button"
              className="rtw-btn rtw-btn-primary"
              onClick={() => {
                const res = runFinancialAccountingTestSuite(actorEmail);
                setTestResults(res);
                const passed = res.filter((r) => r.passed).length;
                notify(
                  passed === res.length ? 'success' : 'error',
                  `Suite Financiera Ejecutada (${passed}/${res.length} Aprobadas)`,
                  'Todas las fórmulas y reglas multipropietario fueron verificadas en sandbox aislado.'
                );
              }}
            >
              <Play size={15} /> Ejecutar las 8 Pruebas Financieras Obligatorias
            </button>
          </div>

          {testResults.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
              Haga clic en "Ejecutar las 8 Pruebas Financieras Obligatorias" para verificar todas las fórmulas y bloqueos.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '12px' }}>
              {testResults.map((tr) => (
                <div
                  key={tr.testId}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: tr.passed ? '1px solid #86efac' : '1px solid #fca5a5',
                    background: tr.passed ? '#f0fdf4' : '#fef2f2'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0f172a' }}>
                      {tr.title}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        background: tr.passed ? '#166534' : '#b91c1c',
                        color: '#ffffff'
                      }}
                    >
                      {tr.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#334155', marginBottom: '5px' }}>
                    {tr.scenario}
                  </p>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    Resultado: {tr.actual}
                  </div>
                  <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '0.72rem', color: '#475569' }}>
                    {tr.details.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
