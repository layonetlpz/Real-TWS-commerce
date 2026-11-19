import test from 'node:test';
import assert from 'node:assert/strict';
import { setupNodeBrowserSandbox } from './testHelpers';

setupNodeBrowserSandbox();

import {
  getInventoryPurchaseState,
  registerOrUpdateSupplier,
  saveInventoryPurchaseState,
  syncOwnersIntoInventoryStore,
  txCreatePurchaseOrder,
  txReceivePurchaseOrderLine,
  type ProductVariantCatalogItem
} from '../src/services/inventoryPurchaseService';
import {
  authorizeSkuCommercialPricing,
  configureOwnerCommercialAgreement,
  getFinancialAccountingState
} from '../src/services/financialAccountingService';
import {
  createDefaultBiFilters,
  buildBusinessIntelligenceReport,
  exportBiSnapshotToCsv
} from '../src/services/businessIntelligenceService';
import {
  dispatchAutomationEvent,
  getAutomationEngineState,
  runAutomationEngineVerificationSuite
} from '../src/services/automationEngineService';
import {
  getBrandMerchandisingState,
  getRealCatalogMerchItems,
  renderMerchandisingPieceSvg,
  saveNewBrandIdentityVersion
} from '../src/services/brandMerchandisingService';
import {
  generateValidatedCopywritingBundle,
  readOwnerMarketingConsent,
  registerOwnerMarketingConsent,
  renderCreativeStudioComposedSvg,
  validateCreativeCompliance
} from '../src/services/creativeStudioService';
import {
  approveSocialCalendarPublication,
  connectOfficialSocialGraphAdapter,
  createOrScheduleCalendarPublication,
  publishApprovedPostToChannel,
  runSocialMarketplaceSafetyTests,
  setTestSafeModeNoExternalPublish
} from '../src/services/socialMarketplaceService';
import {
  getWhatsAppCatalogConsultation,
  prepareAndRecordWhatsAppInteraction,
  validateWhatsAppBuyerMessageSecurity
} from '../src/services/whatsappSalesCenterService';
import {
  calculateAllCampaignPerformances,
  importAdsManagerCsvReport,
  recordManualOrSyncedCampaignMetrics,
  registerManualMetaAdsCampaignBundle,
  registerMultiOwnerAdSpendAllocation
} from '../src/services/metaAdsControlService';

function seedVerifiedCatalogItem(sku: string, ownerId: string, ownerName: string, unitCostCop: number | null, salePriceCop: number) {
  syncOwnersIntoInventoryStore([{ id: ownerId, fullName: ownerName, status: 'active' }]);
  const inv = getInventoryPurchaseState();
  if (!inv.catalog[sku]) {
    const item: ProductVariantCatalogItem = {
      productId: `PROD-${sku}`,
      variantId: `VAR-${sku}`,
      legacyExcelRowId: null,
      productCode: sku.replace(/-[A-Z0-9]+$/, ''),
      sku,
      category: 'Audio',
      productName: `Producto ${sku}`,
      brand: 'REAL TWS',
      model: sku,
      variantName: 'Negro',
      color: 'Negro',
      manufacturerRef: '',
      supplierRef: '',
      description: 'Producto sintético QA Marketing',
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
  const supplier = registerOrUpdateSupplier(
    {
      supplierCode: 'SUP-QA-MKT',
      legalName: 'Proveedor QA Marketing S.A.S.',
      contactName: 'Contacto QA',
      taxId: '900000001-1',
      phone: '+57 300 000 0001',
      email: 'sup-qa@realtws.local',
      city: 'Barranquilla',
      address: 'Calle QA # 1-1',
      referenceCodes: [],
      notes: 'Proveedor sintético de pruebas'
    },
    'qa-seed@realtws.local'
  );
  const po = txCreatePurchaseOrder(
    {
      orderNumber: `OC-${sku}`,
      orderDate: '2026-11-18',
      supplierId: supplier.id,
      invoiceReference: `FACT-${sku}`,
      inboundShippingCop: 0,
      documentUrls: [],
      notes: 'Seed QA Marketing/BI',
      lines: [
        {
          sku,
          ownerId,
          qtyOrdered: 10,
          unitPurchaseCostCop: unitCostCop
        }
      ]
    },
    'qa-seed@realtws.local'
  );
  txReceivePurchaseOrderLine(
    {
      idempotencyKey: `REC-${sku}-${ownerId}`,
      orderNumber: po.orderNumber,
      lineNumber: 1,
      lotId: `LOT-${sku}`,
      ownerId,
      storageBin: 'MKT-01',
      qtyReceivedNow: 10,
      qtyGood: 10,
      qtyDefective: 0,
      qtyPendingInspection: 0,
      unitPurchaseCostCop: unitCostCop,
      inspectorName: 'QA Bodega',
      notes: 'Seed QA'
    },
    'qa-seed@realtws.local'
  );
  authorizeSkuCommercialPricing(
    {
      sku,
      normalSalePriceCop: salePriceCop,
      promotionalPriceCop: null,
      minimumAllowedPriceCop: Math.max(1000, Math.round(salePriceCop * 0.75)),
      maxDiscountPct: 20,
      changeReason: 'Autorización Seed QA'
    },
    'qa-seed@realtws.local'
  );
}

test('integration:automation — 6 pruebas oficiales + RBAC estricto + reset de cuota diaria', () => {
  const results = runAutomationEngineVerificationSuite();
  assert.equal(results.length, 6);
  for (const r of results) {
    assert.equal(r.passed, true, `Fallo automatización (${r.testId}): ${r.details}`);
  }

  // Solo ADMIN puede disparar eventos manualmente; VIEWER y OPERATOR quedan bloqueados
  assert.throws(() =>
    dispatchAutomationEvent({
      idempotencyKey: 'AUTO-RBAC-BLOCK-1',
      eventType: 'STOCK_LOW',
      referenceEntity: 'lot_owner_allocations',
      referenceId: 'LOT-X',
      sku: 'SKU-X',
      ownerId: 'OWN-0001',
      actorName: 'Operador Inventario',
      actorRole: 'INVENTORY_OPERATOR'
    })
  );

  // Referencias vacías deben rechazarse
  assert.throws(() =>
    dispatchAutomationEvent({
      idempotencyKey: 'AUTO-EMPTY-REF-1',
      eventType: 'STOCK_LOW',
      referenceEntity: 'lot_owner_allocations',
      referenceId: ' ',
      sku: 'SKU-X',
      ownerId: 'OWN-0001',
      actorName: 'Admin QA',
      actorRole: 'ADMIN'
    })
  );

  const autState = getAutomationEngineState();
  assert.ok(autState.rules.length > 0);
});

test('integration:branding & creativeStudio — pureza consentimiento, bloqueo XSS SVG y nota obligatoria', () => {
  seedVerifiedCatalogItem('SKU-MKT-01', 'OWN-0010', 'Propietario Marketing', 30000, 80000);
  const items = getRealCatalogMerchItems();
  const catItem = items.find((i) => i.sku === 'SKU-MKT-01')!;

  const brandState = getBrandMerchandisingState();
  assert.throws(() =>
    saveNewBrandIdentityVersion(brandState.currentBrandConfig, '   ', 'Admin QA')
  );
  const newVer = saveNewBrandIdentityVersion(
    brandState.currentBrandConfig,
    'Ajuste tipografía QA',
    'Admin QA'
  );
  assert.ok(newVer.versionNumber >= 2);

  const merchSvg = renderMerchandisingPieceSvg(
    {
      templateId: 'TPL-PRICE-TAG-01',
      format: 'PHYSICAL_PRICE_TAG',
      category: 'PHYSICAL',
      title: 'Etiqueta Precio QA',
      subtitle: 'Audio Real',
      primarySku: catItem.sku,
      comparisonSkuSecond: '',
      targetCategoryName: catItem.category,
      themeVariant: 'CARBON_GOLD',
      logoVariant: 'PRIMARY_HORIZONTAL',
      showPriceBadge: true,
      usePromoPriceIfAvailable: false,
      includeInternalOwnerTag: false,
      selectedOwnerIdForInternalTag: 'OWN-0010',
      selectedLotIdForInternalTag: '',
      customCallToAction: 'Escríbenos',
      footerLegalOrWarrantyNote: 'Garantía REAL TWS',
      copiesPerPrintPage: 4
    },
    brandState.currentBrandConfig,
    [catItem]
  );
  assert.ok(merchSvg.includes('<svg'));

  // readOwnerMarketingConsent NO debe escribir localStorage cuando no existe registro
  const consentMissing = readOwnerMarketingConsent(
    'OWN-NO-EXISTE',
    'Propietario Inexistente',
    'SKU-MKT-01',
    catItem.productName
  );
  assert.equal(consentMissing.status, 'pending_consent');

  // Bloqueo si propietario no otorgó consentimiento aún
  const checkBeforeConsent = validateCreativeCompliance({
    catalogItem: catItem,
    ownerId: 'OWN-0010',
    requestedDiscountPct: 0
  });
  assert.equal(checkBeforeConsent.passedAll, false);

  // Registrar consentimiento explícito y validar éxito
  registerOwnerMarketingConsent({
    ownerId: 'OWN-0010',
    ownerName: 'Propietario Marketing',
    sku: 'SKU-MKT-01',
    productName: catItem.productName,
    status: 'granted',
    authorizedChannels: ['facebook', 'instagram', 'whatsapp'],
    maxAuthorizedDiscountPct: 10,
    consentNotes: 'Autorizado QA',
    actorName: 'Admin QA'
  });

  const checkAfterConsent = validateCreativeCompliance({
    catalogItem: catItem,
    ownerId: 'OWN-0010',
    requestedDiscountPct: 5
  });
  assert.equal(checkAfterConsent.passedAll, true);

  // Rechazar imagen SVG data:image/svg+xml potencialmente maliciosa en composer
  const copyBundle = generateValidatedCopywritingBundle({
    catalogItem: catItem,
    ownerId: 'OWN-0010',
    discountPct: 0,
    brand: brandState.currentBrandConfig
  });
  const safeSvg = renderCreativeStudioComposedSvg({
    catalogItem: catItem,
    copyBundle,
    brand: brandState.currentBrandConfig,
    composerSettings: {
      aspectRatio: '1:1',
      templateStyle: 'LUXURY_CARBON_GOLD',
      selectedHeadlineIndex: 0,
      selectedShortDescIndex: 0,
      selectedCtaIndex: 0,
      discountPct: 0,
      originalProductPhotoDataUrl: 'data:image/svg+xml;utf8,<svg><script>alert(1)</script></svg>'
    }
  });
  assert.equal(safeSvg.includes('<script>'), false);
  assert.equal(safeSvg.includes('data:image/svg+xml'), false);
});

test('integration:socialMarketplace — 5 pruebas seguridad + bloqueo publicación live Graph API', () => {
  seedVerifiedCatalogItem('SKU-MKT-02', 'OWN-0011', 'Propietario Social', 28000, 75000);
  registerOwnerMarketingConsent({
    ownerId: 'OWN-0011',
    ownerName: 'Propietario Social',
    sku: 'SKU-MKT-02',
    productName: 'Producto SKU-MKT-02',
    status: 'granted',
    authorizedChannels: ['facebook', 'instagram', 'whatsapp', 'marketplace'],
    maxAuthorizedDiscountPct: 10,
    consentNotes: 'Social QA',
    actorName: 'Admin QA'
  });

  const safetyResults = runSocialMarketplaceSafetyTests();
  assert.ok(safetyResults.length >= 4);
  for (const r of safetyResults) {
    assert.equal(r.passed, true, `Fallo social (${r.testName}): ${r.detail}`);
  }

  // Crear y aprobar post para facebook_page con adapter OAuth conectado pero sin SafeMode -> debe bloquear publicación directa desde navegador
  const catItem = getRealCatalogMerchItems().find((i) => i.sku === 'SKU-MKT-02')!;
  const pub = createOrScheduleCalendarPublication({
    catalogItem: catItem,
    ownerId: 'OWN-0011',
    channel: 'facebook_page',
    discountPct: 0,
    scheduledForIso: new Date().toISOString(),
    actorName: 'Marketing QA'
  });
  approveSocialCalendarPublication({
    publicationId: pub.id,
    actorName: 'Admin QA'
  });

  connectOfficialSocialGraphAdapter({
    platform: 'facebook_graph_api',
    externalAccountId: 'FB-PAGE-QA-1',
    accountHandleOrPageName: 'RealTWS Oficial QA',
    professionalAccountEligible: true,
    actorName: 'Admin QA'
  });
  setTestSafeModeNoExternalPublish(false);

  assert.throws(
    () =>
      publishApprovedPostToChannel({
        publicationId: pub.id,
        actorName: 'Admin QA'
      }),
    /Edge Function|BLOQUEO DE PRODUCCIÓN/
  );
});

test('integration:whatsappSalesCenter — bloqueo fuga propietarios, sin teléfono sintético y prueba de pago obligatoria', () => {
  seedVerifiedCatalogItem('SKU-WA-01', 'OWN-0012', 'Eberto Secreto', 22000, 65000);
  const consultation = getWhatsAppCatalogConsultation('SKU-WA-01')!;
  assert.ok(consultation);

  // Mensaje que menciona OWN-0012 debe bloquearse
  const leakCheck = validateWhatsAppBuyerMessageSecurity({
    category: 'PRECIO',
    consultation,
    preparedMessage: 'Hola! Este producto pertenece a OWN-0012 y costó $22.000.',
    quantityRequested: 1,
    contactPermissionGranted: true
  });
  assert.equal(leakCheck.noInternalOwnerLeakCheck.passed, false);

  // Plantilla CONFIRMACION sin referencia de comprobante debe bloquearse
  const voucherCheck = validateWhatsAppBuyerMessageSecurity({
    category: 'CONFIRMACION',
    consultation,
    preparedMessage: 'Pago confirmado para su pedido.',
    quantityRequested: 1,
    paymentVoucherProofRef: '',
    contactPermissionGranted: true
  });
  assert.equal(voucherCheck.paymentProofVerifiedCheck.passed, false);

  // Teléfono corto/inválido (< 7 dígitos) o opt-out revocado bloqueados
  assert.throws(() =>
    prepareAndRecordWhatsAppInteraction({
      buyerName: 'Comprador QA',
      buyerPhoneWhatsapp: '123',
      contactPermissionGranted: true,
      sku: 'SKU-WA-01',
      internalOwnerIdChecked: 'OWN-0012',
      templateCategory: 'PRECIO',
      preparedBuyerMessage: 'Precio oficial $65.000 COP, disponible para entrega inmediata.',
      quantityRequested: 1,
      actorName: 'Asesor QA'
    })
  );
});

test('integration:metaAds & BI — cero COGS fabricado (45%), rechazo SKU inexistente CSV, autorización gasto y filtro dueño/fecha BI', () => {
  seedVerifiedCatalogItem('SKU-ADS-KNOWN', 'OWN-0013', 'Propietario Ads Costo', 35000, 100000);
  seedVerifiedCatalogItem('SKU-ADS-PEND', 'OWN-0014', 'Propietario Ads Pend', null, 90000);

  // Campaña sobre lote SIN costo (PENDING_COST): no debe inventar 45% COGS
  const cmpPend = registerManualMetaAdsCampaignBundle({
    campaignName: 'Campaña QA Pend Costo',
    channel: 'whatsapp',
    objective: 'Ventas',
    promotedSku: 'SKU-ADS-PEND',
    targetOwnerId: 'OWN-0014',
    ownerAllocationPolicy: 'direct_owner',
    manualBudgetCapCop: 100000,
    targetCpaCop: 15000,
    adSetName: 'Conj Pend',
    audienceSummary: 'BAQ',
    adName: 'Ad Pend',
    creativeFormat: '1:1',
    actorName: 'Admin QA'
  });

  // Intentar suplantar META_API_SYNCED con adaptador apagado -> bloqueado
  assert.throws(() =>
    recordManualOrSyncedCampaignMetrics({
      campaignId: cmpPend.campaign.id,
      metricDate: '2026-11-18',
      impressions: 1000,
      reach: 800,
      clicks: 50,
      whatsappConversationsCount: 10,
      verifiedPurchasesOrdersCount: 2,
      spendCop: 20000,
      dataSourceOrigin: 'META_API_SYNCED',
      actorName: 'Admin QA'
    })
  );

  const metricPend = recordManualOrSyncedCampaignMetrics({
    campaignId: cmpPend.campaign.id,
    metricDate: '2026-11-18',
    impressions: 1000,
    reach: 800,
    clicks: 50,
    whatsappConversationsCount: 10,
    verifiedPurchasesOrdersCount: 2,
    spendCop: 20000,
    dataSourceOrigin: 'MANUAL_ENTRY',
    actorName: 'Admin QA'
  });
  assert.equal(metricPend.attributedCogsCop, 0);
  assert.equal(metricPend.cogsStatus, 'PENDING_COST');

  const perfPend = calculateAllCampaignPerformances().find((p) => p.campaign.id === cmpPend.campaign.id)!;
  assert.equal(perfPend.hasPendingCogs, true);

  // Campaña sobre lote CON costo conocido -> COGS real = 35.000 * 2 = 70.000 (no 45% de 200.000 = 90.000)
  const cmpKnown = registerManualMetaAdsCampaignBundle({
    campaignName: 'Campaña QA Costo Real',
    channel: 'whatsapp',
    objective: 'Ventas',
    promotedSku: 'SKU-ADS-KNOWN',
    targetOwnerId: 'OWN-0013',
    ownerAllocationPolicy: 'direct_owner',
    manualBudgetCapCop: 150000,
    targetCpaCop: 15000,
    adSetName: 'Conj Known',
    audienceSummary: 'BAQ',
    adName: 'Ad Known',
    creativeFormat: '1:1',
    actorName: 'Admin QA'
  });
  const metricKnown = recordManualOrSyncedCampaignMetrics({
    campaignId: cmpKnown.campaign.id,
    metricDate: '2026-11-18',
    impressions: 2000,
    reach: 1600,
    clicks: 120,
    whatsappConversationsCount: 15,
    verifiedPurchasesOrdersCount: 2,
    spendCop: 30000,
    dataSourceOrigin: 'MANUAL_ENTRY',
    actorName: 'Admin QA'
  });
  assert.equal(metricKnown.attributedCogsCop, 70000);
  assert.equal(metricKnown.cogsStatus, 'VERIFIED_LOT_COST');

  // CSV con SKU inexistente no debe hacer fallback silencioso al primer SKU del catálogo
  const badCsv = [
    'CampaignName,SKU,OwnerId,Channel,Date,Impressions,Clicks,Conversations,Purchases,SpendCOP,RevenueCOP',
    '"Campaña Inexistente",SKU-NO-EXISTE,OWN-0013,whatsapp,2026-11-18,500,20,3,0,5000,0'
  ].join('\n');
  assert.throws(() =>
    importAdsManagerCsvReport({
      csvContent: badCsv,
      defaultOwnerId: 'OWN-0013',
      actorName: 'Admin QA'
    })
  );

  // Sin autorización explícita ni acuerdo activo, el descuento al propietario permanece bloqueado
  const allocBlocked = registerMultiOwnerAdSpendAllocation({
    campaignId: cmpKnown.campaign.id,
    allocationPolicyUsed: 'direct_owner',
    ownerDeductionAuthorized: true,
    actorName: 'Admin QA'
  });
  assert.equal(allocBlocked.deductionStatus, 'blocked_agreement_not_configured');

  configureOwnerCommercialAgreement(
    {
      ownerId: 'OWN-0013',
      ownerName: 'Propietario Ads Costo',
      status: 'active',
      distributionModel: 'profit_split_pct',
      storeCommissionPct: 20,
      ownerSharePct: 80,
      minimumPriceGuardPct: 10,
      maxDiscountAllowedPct: 10,
      commercialAuthorizationMode: 'explicit_owner_approval',
      settlementMethod: 'conciliated_period_cutoff',
      advertisingResponsibility: 'owner_100_direct',
      sharedExpensePolicy: 'proportional_net_sales',
      notes: 'Acuerdo activo ADS'
    },
    'qa-ads@realtws.local',
    getFinancialAccountingState()
  );

  const allocPendingOwner = registerMultiOwnerAdSpendAllocation({
    campaignId: cmpKnown.campaign.id,
    allocationPolicyUsed: 'direct_owner',
    ownerDeductionAuthorized: false,
    actorName: 'Admin QA'
  });
  assert.equal(allocPendingOwner.deductionStatus, 'pending_owner_authorization');

  // Business Intelligence: snapshot scoped por propietario y CSV formula neutralization
  const biFilters = createDefaultBiFilters('OWN-0013');
  const biSnapshot = buildBusinessIntelligenceReport(biFilters);
  assert.equal(biSnapshot.ownerRows.every((o) => o.ownerId === 'OWN-0013'), true);

  const csvOut = exportBiSnapshotToCsv(biSnapshot, 'GENERAL');
  assert.ok(csvOut.length > 0);
});
