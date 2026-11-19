import test from 'node:test';
import assert from 'node:assert/strict';
import { setupNodeBrowserSandbox } from './testHelpers';

setupNodeBrowserSandbox();

import { parseCsvUtf8Text } from '../src/utils/spreadsheetParser';
import {
  analyzeWorkbookForImport,
  commitImportBatch,
  buildImportRowStorageKey,
  computeSystemStateSummary,
  type PersistedImportState
} from '../src/services/excelImportEngine';
import {
  getInventoryPurchaseState,
  registerOrUpdateSupplier,
  runInventoryPurchaseTestSuite,
  saveInventoryPurchaseState,
  syncOwnersIntoInventoryStore,
  txCreatePurchaseOrder,
  txReceivePurchaseOrderLine,
  type ProductVariantCatalogItem
} from '../src/services/inventoryPurchaseService';
import {
  authorizeSkuCommercialPricing,
  buildOwnerAccountStatements,
  configureOwnerCommercialAgreement,
  getFinancialAccountingState,
  runFinancialAccountingTestSuite,
  txCreateConciliatedSettlement,
  txMarkSettlementPaid,
  txRecordMultiOwnerDispatchedSale,
  txRegisterAndAllocateExpense
} from '../src/services/financialAccountingService';
import {
  calculateOrderProfitability,
  getSalesOrdersCrmState,
  maskProtectedAddress,
  maskProtectedPhone,
  registerOrValidateCustomer,
  txCancelSalesOrder,
  txCreateSalesOrder,
  txDispatchSalesOrder,
  txRegisterOrderPayment,
  txReturnSalesOrderAllocation
} from '../src/services/salesOrdersCrmService';

function ensureCatalogSku(sku: string, productName: string, category = 'Audio'): void {
  const inv = getInventoryPurchaseState();
  if (!inv.catalog[sku]) {
    const item: ProductVariantCatalogItem = {
      productId: `PROD-${sku}`,
      variantId: `VAR-${sku}`,
      legacyExcelRowId: null,
      productCode: sku.replace(/-[A-Z0-9]+$/, ''),
      sku,
      category,
      productName,
      brand: 'REAL TWS',
      model: sku,
      variantName: 'Negro',
      color: 'Negro',
      manufacturerRef: '',
      supplierRef: '',
      description: 'Producto sintético QA',
      verifiedFeatures: 'Audio QA verificado',
      unitOfMeasure: 'Unidad',
      photoUrls: [],
      status: 'active',
      excelOriginalStatus: 'ACTIVO',
      approvedSalePriceCop: null,
      originalNotes: '',
      createdAt: '2026-11-18T00:00:00.000Z',
      updatedAt: '2026-11-18T00:00:00.000Z',
      historyEvents: []
    };
    inv.catalog[sku] = item;
    saveInventoryPurchaseState(inv);
  }
}

test('integration:inventory — batería completa (9 escenarios) y aislamiento multipropietario', () => {
  const results = runInventoryPurchaseTestSuite('qa-inv@realtws.local');
  assert.equal(results.length, 9);
  for (const r of results) {
    assert.equal(r.passed, true, `Fallo inventario (${r.testId}): ${r.details.join(' | ')}`);
  }
});

test('integration:finance — batería completa (8 escenarios) y reglas de acuerdos/gastos/liquidaciones', () => {
  const results = runFinancialAccountingTestSuite('qa-fin@realtws.local');
  assert.equal(results.length, 8);
  for (const r of results) {
    assert.equal(r.passed, true, `Fallo finanzas (${r.testId}): ${r.details.join(' | ')}`);
  }

  syncOwnersIntoInventoryStore([
    { id: 'OWN-0001', fullName: 'Propietario Uno', status: 'active' },
    { id: 'OWN-0002', fullName: 'Propietario Dos', status: 'active' }
  ]);
  ensureCatalogSku('SKU-QA-FIN-01', 'Cargador QA', 'Energía');
  const supFin = registerOrUpdateSupplier(
    {
      supplierCode: 'SUP-QA-FIN',
      legalName: 'Proveedor QA Finanzas S.A.S.',
      contactName: 'Contacto Fin QA',
      taxId: '900000002-1',
      phone: '+57 300 000 0002',
      email: 'sup-fin@realtws.local',
      city: 'Barranquilla',
      address: 'Calle Fin # 1-1',
      referenceCodes: [],
      notes: 'Proveedor sintético Finanzas'
    },
    'qa-fin@realtws.local'
  );

  const po = txCreatePurchaseOrder(
    {
      orderNumber: 'OC-QA-FIN-001',
      orderDate: '2026-11-18',
      supplierId: supFin.id,
      invoiceReference: 'FACT-QA-FIN-01',
      inboundShippingCop: 0,
      documentUrls: [],
      notes: 'Compra QA Finanzas',
      lines: [
        {
          sku: 'SKU-QA-FIN-01',
          ownerId: 'OWN-0002',
          qtyOrdered: 5,
          unitPurchaseCostCop: 20000
        }
      ]
    },
    'qa-fin@realtws.local'
  );

  txReceivePurchaseOrderLine(
    {
      idempotencyKey: 'QA-FIN-REC-001',
      orderNumber: po.orderNumber,
      lineNumber: 1,
      lotId: 'LOT-QA-FIN-001',
      ownerId: 'OWN-0002',
      storageBin: 'A-10',
      qtyReceivedNow: 5,
      qtyGood: 5,
      qtyDefective: 0,
      qtyPendingInspection: 0,
      unitPurchaseCostCop: 20000,
      inspectorName: 'QA Inspector',
      notes: 'Recepción QA'
    },
    'qa-fin@realtws.local'
  );

  const finState = getFinancialAccountingState();

  // Autorizar precio comercial y verificar sincronización al catálogo maestro
  authorizeSkuCommercialPricing(
    {
      sku: 'SKU-QA-FIN-01',
      normalSalePriceCop: 60000,
      promotionalPriceCop: null,
      minimumAllowedPriceCop: 45000,
      maxDiscountPct: 20,
      changeReason: 'Autorización QA inicial'
    },
    'qa-fin@realtws.local'
  );
  assert.equal(getInventoryPurchaseState().catalog['SKU-QA-FIN-01'].approvedSalePriceCop, 60000);

  configureOwnerCommercialAgreement(
    {
      ownerId: 'OWN-0002',
      ownerName: 'Propietario Dos',
      status: 'active',
      distributionModel: 'attributable_profit',
      storeCommissionPct: null,
      ownerSharePct: null,
      minimumPriceGuardPct: 10,
      maxDiscountAllowedPct: 10,
      commercialAuthorizationMode: 'explicit_owner_approval',
      settlementMethod: 'conciliated_period_cutoff',
      advertisingResponsibility: 'owner_100_direct',
      sharedExpensePolicy: 'excluded_from_shared',
      notes: 'Acuerdo attributable_profit válido'
    },
    'qa-fin@realtws.local'
  );

  const alloc = getInventoryPurchaseState().allocations.find(
    (a) => a.sku === 'SKU-QA-FIN-01' && a.ownerId === 'OWN-0002'
  )!;
  const [sale] = txRecordMultiOwnerDispatchedSale(
    {
      orderNumber: 'PED-QA-IMM-001',
      saleDate: '2026-11-18',
      sku: 'SKU-QA-FIN-01',
      productName: 'Cargador QA',
      unitSalePriceCop: 60000,
      totalOrderLineDiscountCop: 0,
      collectedRatioPct: 100,
      slices: [
        {
          lotAllocationId: alloc.id,
          lotId: alloc.lotId,
          ownerId: 'OWN-0002',
          ownerName: 'Propietario Dos',
          qtyDispatched: 2,
          unitAcquisitionCostCop: 20000
        }
      ]
    }
  );
  assert.equal(sale.immutable, true);
  const originalProfit = sale.attributableOwnerProfitCop;

  // Cambiar acuerdo posterior NO debe alterar retroactivamente la venta inmutable ya contabilizada
  configureOwnerCommercialAgreement(
    {
      ownerId: 'OWN-0002',
      ownerName: 'Propietario Dos',
      status: 'active',
      distributionModel: 'profit_split_pct',
      storeCommissionPct: 50,
      ownerSharePct: 50,
      minimumPriceGuardPct: 10,
      maxDiscountAllowedPct: 10,
      commercialAuthorizationMode: 'explicit_owner_approval',
      settlementMethod: 'conciliated_period_cutoff',
      advertisingResponsibility: 'owner_100_direct',
      sharedExpensePolicy: 'excluded_from_shared',
      notes: 'Cambio futuro sin efecto retroactivo'
    },
    'qa-fin@realtws.local'
  );
  assert.equal(sale.attributableOwnerProfitCop, originalProfit);

  // Gasto duplicado bloqueado
  txRegisterAndAllocateExpense(
    {
      expenseCode: 'GAS-QA-UNICO',
      expenseDate: '2026-11-18',
      expenseScope: 'direct_owner',
      category: 'Empaque y Embalaje',
      description: 'Empaque QA',
      totalAmountCop: 10000,
      allocationCriterion: 'single_owner_direct',
      approvalStatus: 'approved',
      directOwnerId: 'OWN-0002',
      notes: 'Directo'
    },
    'qa-fin@realtws.local'
  );
  assert.throws(() =>
    txRegisterAndAllocateExpense(
      {
        expenseCode: 'GAS-QA-UNICO',
        expenseDate: '2026-11-18',
        expenseScope: 'direct_owner',
        category: 'Empaque y Embalaje',
        description: 'Duplicado',
        totalAmountCop: 10000,
        allocationCriterion: 'single_owner_direct',
        approvalStatus: 'approved',
        directOwnerId: 'OWN-0002',
        notes: 'Dup'
      },
      'qa-fin@realtws.local'
    )
  );

  // Liquidación en approved_pending_payment vs paid_documented separadas en estado de cuenta
  const stl = txCreateConciliatedSettlement(
    {
      settlementCode: 'LIQ-QA-001',
      ownerId: 'OWN-0002',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      amountToSettleCop: 20000,
      voucherReference: 'REF-QA-001',
      isConciliatedConfirmed: true,
      notes: 'Corte QA'
    },
    'qa-fin@realtws.local'
  );
  assert.equal(stl.approvalState, 'approved_pending_payment');

  const statementsBeforePay = buildOwnerAccountStatements(getFinancialAccountingState()).find((s) => s.ownerId === 'OWN-0002')!;
  assert.equal(statementsBeforePay.pendingPaymentSettlementsCop, 20000);
  assert.equal(statementsBeforePay.previousSettledPaymentsCop, 0);

  txMarkSettlementPaid(
    { settlementId: stl.id, paymentVoucherReference: 'COMP-BANCO-999' },
    'qa-fin@realtws.local'
  );
  const statementsAfterPay = buildOwnerAccountStatements(getFinancialAccountingState()).find((s) => s.ownerId === 'OWN-0002')!;
  assert.equal(statementsAfterPay.pendingPaymentSettlementsCop, 0);
  assert.equal(statementsAfterPay.previousSettledPaymentsCop, 20000);
});

test('integration:excelImport — mismo SKU en dos propietarios/lotes coexistentes y validación de costos negativos', async () => {
  const sandboxState: PersistedImportState = {
    registeredOwners: [
      { id: 'OWN-0001', fullName: 'Propietario A', status: 'active' },
      { id: 'OWN-0002', fullName: 'Propietario B', status: 'active' }
    ],
    importedRowsByKey: {},
    openingMovements: [],
    batchesHistory: []
  };

  const multiOwnerCsv = [
    'product_code,sku,owner_id,product_name,category,lot_id,qty_physical,qty_good,qty_defective,qty_pending_inspection,unit_cost_cop,approved_sale_price_cop',
    'AUD-MULTI,SKU-MULTI-01,OWN-0001,Audífono Compartido,Audio,LOT-A,4,4,0,0,25000,70000',
    'AUD-MULTI,SKU-MULTI-01,OWN-0002,Audífono Compartido,Audio,LOT-B,6,6,0,0,27000,70000'
  ].join('\n');

  const wb = await parseCsvUtf8Text(multiOwnerCsv, 'multi_owner.csv');
  const analysis = analyzeWorkbookForImport(wb, sandboxState);
  assert.equal(analysis.errors.length, 0);
  assert.equal(analysis.rows.length, 2);
  assert.notEqual(
    buildImportRowStorageKey(analysis.rows[0]),
    buildImportRowStorageKey(analysis.rows[1])
  );

  const commitRes = await commitImportBatch(analysis, 'qa-imp@realtws.local', {
    dryRunInMemoryState: sandboxState
  });
  assert.equal(commitRes.success, true);

  const summary = computeSystemStateSummary(sandboxState.importedRowsByKey, 2);
  assert.equal(summary.totalProducts, 1);
  assert.equal(summary.totalVariantsSku, 1);
  assert.equal(summary.totalPhysicalUnits, 10);

  // Rechazar costo o precio negativo en validación previa
  const badCostCsv = [
    'product_code,sku,owner_id,product_name,category,lot_id,qty_physical,qty_good,qty_defective,qty_pending_inspection,unit_cost_cop,approved_sale_price_cop',
    'ACC-BAD,SKU-BAD-COST,OWN-0001,Producto Mal Costo,Audio,LOT-BAD,2,2,0,0,-5000,-100'
  ].join('\n');
  const badWb = await parseCsvUtf8Text(badCostCsv, 'bad_cost.csv');
  const badAnalysis = analyzeWorkbookForImport(badWb, sandboxState);
  assert.equal(badAnalysis.errors.some((e) => e.code === 'NEGATIVE_COST'), true);
  assert.equal(badAnalysis.errors.some((e) => e.code === 'INVALID_PRICE'), true);
});

test('integration:salesCrm — atomicidad en despacho multi-línea, bloqueo PENDING_COST, sync pago a Finanzas y enmascaramiento PII', () => {
  syncOwnersIntoInventoryStore([{ id: 'OWN-0003', fullName: 'Propietario Ventas', status: 'active' }]);
  ensureCatalogSku('SKU-SALES-OK', 'Parlante BT QA');
  ensureCatalogSku('SKU-SALES-PEND', 'Audífono Costo Pendiente QA');

  const supSales = registerOrUpdateSupplier(
    {
      supplierCode: 'SUP-QA-SALES',
      legalName: 'Proveedor QA Ventas S.A.S.',
      contactName: 'Contacto Ventas QA',
      taxId: '900000003-1',
      phone: '+57 300 000 0003',
      email: 'sup-sales@realtws.local',
      city: 'Barranquilla',
      address: 'Calle Ventas # 1-1',
      referenceCodes: [],
      notes: 'Proveedor sintético Ventas'
    },
    'qa-sales@realtws.local'
  );

  // Compra 1: lote con costo conocido
  const poKnown = txCreatePurchaseOrder(
    {
      orderNumber: 'OC-QA-SALES-01',
      orderDate: '2026-11-18',
      supplierId: supSales.id,
      invoiceReference: 'FACT-QA-SL-01',
      inboundShippingCop: 0,
      documentUrls: [],
      notes: 'PO Con Costo',
      lines: [
        {
          sku: 'SKU-SALES-OK',
          ownerId: 'OWN-0003',
          qtyOrdered: 4,
          unitPurchaseCostCop: 30000
        }
      ]
    },
    'qa-sales@realtws.local'
  );
  txReceivePurchaseOrderLine(
    {
      idempotencyKey: 'REC-SALES-OK',
      orderNumber: poKnown.orderNumber,
      lineNumber: 1,
      lotId: 'LOT-SALES-OK',
      ownerId: 'OWN-0003',
      storageBin: 'S-01',
      qtyReceivedNow: 4,
      qtyGood: 4,
      qtyDefective: 0,
      qtyPendingInspection: 0,
      unitPurchaseCostCop: 30000,
      inspectorName: 'QA Bodega',
      notes: 'OK'
    },
    'qa-sales@realtws.local'
  );

  // Compra 2: lote PENDING_COST (costo null)
  const poPend = txCreatePurchaseOrder(
    {
      orderNumber: 'OC-QA-SALES-02',
      orderDate: '2026-11-18',
      supplierId: supSales.id,
      invoiceReference: 'FACT-QA-SL-02',
      inboundShippingCop: 0,
      documentUrls: [],
      notes: 'PO Sin Costo',
      lines: [
        {
          sku: 'SKU-SALES-PEND',
          ownerId: 'OWN-0003',
          qtyOrdered: 3,
          unitPurchaseCostCop: null
        }
      ]
    },
    'qa-sales@realtws.local'
  );
  txReceivePurchaseOrderLine(
    {
      idempotencyKey: 'REC-SALES-PEND',
      orderNumber: poPend.orderNumber,
      lineNumber: 1,
      lotId: 'LOT-SALES-PEND',
      ownerId: 'OWN-0003',
      storageBin: 'S-02',
      qtyReceivedNow: 3,
      qtyGood: 3,
      qtyDefective: 0,
      qtyPendingInspection: 0,
      unitPurchaseCostCop: null,
      inspectorName: 'QA Bodega',
      notes: 'Pendiente costo'
    },
    'qa-sales@realtws.local'
  );

  const finState = getFinancialAccountingState();
  authorizeSkuCommercialPricing(
    {
      sku: 'SKU-SALES-OK',
      normalSalePriceCop: 90000,
      promotionalPriceCop: null,
      minimumAllowedPriceCop: 70000,
      maxDiscountPct: 20,
      changeReason: 'Autorización Venta QA'
    },
    'qa-sales@realtws.local',
    finState
  );
  authorizeSkuCommercialPricing(
    {
      sku: 'SKU-SALES-PEND',
      normalSalePriceCop: 50000,
      promotionalPriceCop: null,
      minimumAllowedPriceCop: 40000,
      maxDiscountPct: 20,
      changeReason: 'Autorización Pendiente QA'
    },
    'qa-sales@realtws.local',
    finState
  );

  const { customer } = registerOrValidateCustomer({
    fullName: 'Cliente Prueba QA',
    phoneWhatsapp: '+57 315 999 8877',
    city: 'Barranquilla',
    shippingAddress: 'Calle 99 # 10-20',
    notes: 'Registro QA'
  });
  assert.notEqual(maskProtectedPhone(customer.phoneWhatsapp, false), customer.phoneWhatsapp);
  assert.notEqual(maskProtectedAddress(customer.shippingAddress, false), customer.shippingAddress);

  const okAlloc = getInventoryPurchaseState().allocations.find((a) => a.sku === 'SKU-SALES-OK')!;
  const pendAlloc = getInventoryPurchaseState().allocations.find((a) => a.sku === 'SKU-SALES-PEND')!;

  // Pedido con Línea 1 OK y Línea 2 PENDING_COST -> Despacho debe fallar ATÓMICAMENTE sin tocar stock Línea 1
  const multiLineOrder = txCreateSalesOrder({
    customerId: customer.id,
    salesChannel: 'whatsapp',
    shippingChargedCop: 10000,
    shippingRealCostCop: 8000,
    sellerName: 'Asesor QA',
    notes: 'Multi-línea prueba atomicidad',
    reserveImmediately: false,
    lines: [
      {
        sku: 'SKU-SALES-OK',
        qtyOrdered: 1,
        unitSalePriceCop: 90000,
        lineDiscountCop: 0,
        allocations: [{ lotAllocationId: okAlloc.id, qtyAllocated: 1 }]
      },
      {
        sku: 'SKU-SALES-PEND',
        qtyOrdered: 1,
        unitSalePriceCop: 50000,
        lineDiscountCop: 0,
        allocations: [{ lotAllocationId: pendAlloc.id, qtyAllocated: 1 }]
      }
    ]
  });

  const okPhysBefore = getInventoryPurchaseState().allocations.find((a) => a.id === okAlloc.id)!.qtyPhysical;
  assert.throws(
    () =>
      txDispatchSalesOrder({
        salesOrderId: multiLineOrder.id,
        carrierName: 'Coordinadora',
        trackingNumber: 'GUIA-BLOCKED',
        shippingRealCostCop: 8000,
        actorName: 'Bodega QA'
      }),
    /PENDING_COST/
  );
  const okPhysAfter = getInventoryPurchaseState().allocations.find((a) => a.id === okAlloc.id)!.qtyPhysical;
  assert.equal(okPhysAfter, okPhysBefore, 'Línea 1 no debe sufrir rebaja física ante fallo atómico de Línea 2');

  // Cancelar ese pedido debe poner netOrderTotalBilledCop = 0
  txCancelSalesOrder({
    salesOrderId: multiLineOrder.id,
    reason: 'Prueba cancelación QA',
    actorName: 'Asesor QA'
  });
  assert.equal(calculateOrderProfitability(multiLineOrder.id).netOrderTotalBilledCop, 0);

  // Pedido válido 100% con pago post-despacho sincronizado a Finanzas y devolución
  const validOrder = txCreateSalesOrder({
    customerId: customer.id,
    salesChannel: 'instagram',
    shippingChargedCop: 0,
    shippingRealCostCop: 6000,
    sellerName: 'Asesor QA',
    notes: 'Pedido completo QA',
    reserveImmediately: true,
    lines: [
      {
        sku: 'SKU-SALES-OK',
        qtyOrdered: 2,
        unitSalePriceCop: 90000,
        lineDiscountCop: 0,
        allocations: [{ lotAllocationId: okAlloc.id, qtyAllocated: 2 }]
      }
    ]
  });

  txDispatchSalesOrder({
    salesOrderId: validOrder.id,
    carrierName: 'Interrapidísimo',
    trackingNumber: 'GUIA-OK-001',
    shippingRealCostCop: 6000,
    actorName: 'Despacho QA'
  });

  const finSaleBeforePay = getFinancialAccountingState().salesAllocations.find(
    (s) => s.orderNumber === validOrder.orderNumber
  )!;
  assert.equal(finSaleBeforePay.collectedCashCop, 0);

  txRegisterOrderPayment({
    salesOrderId: validOrder.id,
    paymentMethod: 'nequi',
    amountCop: 180000,
    status: 'confirmed',
    referenceCode: 'NEQUI-QA-180',
    receivedBy: 'Tesorería QA',
    notes: 'Pago post-despacho'
  });

  const finSaleAfterPay = getFinancialAccountingState().salesAllocations.find(
    (s) => s.orderNumber === validOrder.orderNumber
  )!;
  assert.equal(finSaleAfterPay.collectedCashCop, 180000);
  assert.equal(finSaleAfterPay.uncollectedReceivableCop, 0);

  // Devolución parcial (1 unidad en buen estado al lote y propietario original)
  const orderUpdated = getSalesOrdersCrmState().orders.find((o) => o.id === validOrder.id)!;
  txReturnSalesOrderAllocation({
    salesOrderId: validOrder.id,
    orderAllocationId: orderUpdated.lines[0].allocations[0].id,
    qtyToReturn: 1,
    itemCondition: 'good_restock',
    reason: 'Cambio de referencia cliente QA',
    actorName: 'Postventa QA'
  });

  const allocAfterReturn = getInventoryPurchaseState().allocations.find((a) => a.id === okAlloc.id)!;
  assert.equal(allocAfterReturn.qtyAvailable, 3);
});
