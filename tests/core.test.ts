import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatCOP, formatInteger, formatDateDDMMYYYY } from '../src/utils/formatters';
import { validateReceptionDraft } from '../src/utils/validations';
import { evaluateRouteAccess } from '../src/lib/permissions';
import { parseXlsxBuffer, parseCsvUtf8Text } from '../src/utils/spreadsheetParser';
import {
  analyzeWorkbookForImport,
  commitImportBatch,
  type PersistedImportState
} from '../src/services/excelImportEngine';
import type { UserProfile } from '../src/types/domain';

function makeProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    id: 'user-1',
    email: 'test@realtws.co',
    fullName: 'Usuario Test',
    role: 'ADMIN',
    linkedOwnerId: null,
    ownerPortalEnabled: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

test('formatters: formatea COP, enteros y fechas DD/MM/YYYY correctamente', () => {
  assert.match(formatCOP(366700), /366\.700.*COP/);
  assert.equal(formatCOP(null), 'PENDIENTE DE INFORMACIÓN');
  assert.equal(formatInteger(1250), '1.250');
  assert.equal(formatDateDDMMYYYY('2026-11-14T15:00:00Z'), '14/11/2026');
});

test('validations: exige propietario explícito y cuadre exacto de cantidades físicas', () => {
  const missingOwner = validateReceptionDraft({
    sku: 'AUD-TWS-001-NEG',
    lotId: 'LOT-01',
    ownerId: '',
    qtyPhysical: 5,
    qtyGood: 5,
    qtyDefective: 0,
    qtyPending: 0
  });
  assert.equal(missingOwner.valid, false);
  assert.ok(missingOwner.errors.ownerId);

  const mismatched = validateReceptionDraft({
    sku: 'AUD-TWS-001-NEG',
    lotId: 'LOT-01',
    ownerId: 'OWN-0001',
    qtyPhysical: 5,
    qtyGood: 2,
    qtyDefective: 1,
    qtyPending: 1
  });
  assert.equal(mismatched.valid, false);
  assert.ok(mismatched.errors.reconciliation);

  const valid = validateReceptionDraft({
    sku: 'AUD-TWS-001-NEG',
    lotId: 'LOT-01',
    ownerId: 'OWN-0001',
    qtyPhysical: 5,
    qtyGood: 2,
    qtyDefective: 1,
    qtyPending: 2
  });
  assert.equal(valid.valid, true);
});

test('permissions: valida RBAC estricto para ADMIN, SALES_OPERATOR y OWNER', () => {
  const unauth = evaluateRouteAccess(null, '/', false);
  assert.equal(unauth.allowed, false);

  const expired = evaluateRouteAccess(makeProfile({ role: 'ADMIN' }), '/', true);
  assert.equal(expired.allowed, false);

  const owner = makeProfile({
    role: 'OWNER',
    linkedOwnerId: 'OWN-0001',
    ownerPortalEnabled: true
  });
  assert.equal(evaluateRouteAccess(owner, '/', false).allowed, true);
  assert.equal(evaluateRouteAccess(owner, '/operaciones/inventario', false).allowed, true);
  assert.equal(evaluateRouteAccess(owner, '/gestion/configuracion', false).allowed, false);
  assert.equal(evaluateRouteAccess(owner, '/gestion/auditoria', false).allowed, false);
  assert.equal(evaluateRouteAccess(owner, '/operaciones/importacion', false).allowed, false);

  const sales = makeProfile({ role: 'SALES_OPERATOR' });
  assert.equal(evaluateRouteAccess(sales, '/comercial/pedidos', false).allowed, true);
  assert.equal(evaluateRouteAccess(sales, '/finanzas/costos', false).allowed, false);
  assert.equal(evaluateRouteAccess(sales, '/gestion/configuracion', false).allowed, false);

  const admin = makeProfile({ role: 'ADMIN' });
  assert.equal(evaluateRouteAccess(admin, '/gestion/configuracion', false).allowed, true);
  assert.equal(evaluateRouteAccess(admin, '/operaciones/importacion', false).allowed, true);
});

test('excelImportEngine: concilia el Excel oficial real y bloquea reimportación/duplicados/propietarios inválidos', async () => {
  const excelPath = path.resolve('INVENTARIO_REAL_TWS/REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx');
  assert.equal(fs.existsSync(excelPath), true, 'El archivo original en INVENTARIO_REAL_TWS debe existir');

  const buf = fs.readFileSync(excelPath);
  const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const workbook = await parseXlsxBuffer(arrayBuf, 'REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx');

  const sandboxState: PersistedImportState = {
    registeredOwners: [{ id: 'OWN-0001', fullName: 'Eberto', status: 'active' }],
    importedRowsByKey: {},
    openingMovements: [],
    batchesHistory: []
  };

  const analysis = analyzeWorkbookForImport(workbook, sandboxState);
  assert.equal(analysis.errors.length, 0);
  assert.equal(analysis.rows.length, 40);

  const commit1 = await commitImportBatch(analysis, 'admin@realtws.co', {
    dryRunInMemoryState: sandboxState
  });
  assert.equal(commit1.success, true);
  assert.equal(commit1.batchRecord.totalSkusImported, 40);
  assert.equal(commit1.batchRecord.totalOpeningUnits, 38);
  assert.equal(commit1.batchRecord.totalPendingUnits, 38);
  assert.equal(commit1.batchRecord.pendingCostCount, 2);
  assert.equal(commit1.batchRecord.totalConfirmedCostCop, 345000);
  assert.equal(sandboxState.openingMovements.length, 37);

  // Reimportación duplicada debe bloquearse
  const analysisDup = analyzeWorkbookForImport(workbook, sandboxState);
  assert.equal(
    analysisDup.errors.some((e) => e.code === 'BATCH_ALREADY_IMPORTED'),
    true
  );

  // Propietario vacío o inexistente bloqueado
  const unknownOwnerCsv = [
    'product_code,sku,owner_id,product_name,category,lot_id,qty_physical,qty_good,qty_defective,qty_pending_inspection,unit_cost_cop',
    'ACC-01,ACC-01-NEG,OWN-9999,Producto Prueba,General,LOT-1,1,1,0,0,10000',
    'ACC-02,ACC-02-NEG,,Producto Sin Propietario,General,LOT-1,1,1,0,0,10000'
  ].join('\n');
  const unknownWb = await parseCsvUtf8Text(unknownOwnerCsv, 'unknown_owner.csv');
  const unknownAnalysis = analyzeWorkbookForImport(unknownWb, sandboxState);
  assert.equal(unknownAnalysis.errors.some((e) => e.code === 'UNKNOWN_OWNER'), true);
  assert.equal(unknownAnalysis.errors.some((e) => e.code === 'MISSING_OWNER'), true);

  // Descuadre de cantidades bloqueado
  const mismatchCsv = [
    'product_code,sku,owner_id,product_name,category,lot_id,qty_physical,qty_good,qty_defective,qty_pending_inspection,unit_cost_cop',
    'ACC-03,ACC-03-NEG,OWN-0001,Producto Descuadrado,General,LOT-1,5,2,1,0,10000'
  ].join('\n');
  const mismatchWb = await parseCsvUtf8Text(mismatchCsv, 'mismatch.csv');
  const mismatchAnalysis = analyzeWorkbookForImport(mismatchWb, sandboxState);
  assert.equal(mismatchAnalysis.errors.some((e) => e.code === 'QUANTITY_MISMATCH'), true);
});

test('security & deployment artifacts: sin Excel confidencial en public/samples y archivos Cloudflare/SQL presentes', () => {
  assert.equal(
    fs.existsSync(path.resolve('public/samples/REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx')),
    false
  );
  assert.equal(fs.existsSync(path.resolve('wrangler.jsonc')), true);
  assert.equal(fs.existsSync(path.resolve('public/_redirects')), true);
  assert.equal(fs.existsSync(path.resolve('public/_headers')), true);
  assert.equal(
    fs.existsSync(path.resolve('supabase/migrations/0023_ui_alignment_and_indexes.sql')),
    true
  );
  assert.equal(
    fs.existsSync(path.resolve('supabase/sql/IMPORT_INVENTARIO_HISTORICO_REAL_TWS.sql')),
    true
  );
});
