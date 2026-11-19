import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupNodeBrowserSandbox } from './testHelpers';

setupNodeBrowserSandbox();

import {
  formatCOP,
  formatInteger,
  formatDateDDMMYYYY,
  escapeHtml
} from '../src/utils/formatters';
import {
  isValidPositiveInt,
  isValidNonNegativeInt,
  isValidNonNegativeAmount,
  isValidEmailFormat,
  validateReceptionDraft
} from '../src/utils/validations';
import {
  parseCsvRecords,
  parseCsvUtf8Text,
  parseXlsxBuffer
} from '../src/utils/spreadsheetParser';
import {
  ALL_USER_ROLES,
  evaluateRouteAccess,
  evaluateSensitiveOperation,
  ROUTE_PERMISSIONS
} from '../src/lib/permissions';
import { runMandatorySecurityTests } from '../src/services/authService';
import {
  GLASS_SURFACE_LEVELS,
  GRAY_SCALE_DARK,
  GRAY_SCALE_LIGHT,
  MOTION_TOKENS,
  REAL_TWS_BRAND_IDENTITY,
  YELLOW_GOLD_SCALE
} from '../src/design-system/tokens/designTokens';
import { THEME_STORAGE_KEY } from '../src/design-system/themes/ThemeContext';
import type { UserProfile } from '../src/types/domain';

function makeProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    id: 'qa-user-1',
    email: 'qa@realtws.local',
    fullName: 'QA Verifier',
    role: 'VIEWER',
    linkedOwnerId: null,
    ownerPortalEnabled: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

test('unit:formatters — COP, enteros, zona horaria Bogotá (UTC-5) y escapeHtml XSS', () => {
  assert.match(formatCOP(150000), /150\.000.*COP/);
  assert.equal(formatCOP(undefined), 'PENDIENTE DE INFORMACIÓN');
  assert.equal(formatInteger(9876), '9.876');

  // Medianoche en Colombia ('2026-11-15T03:00:00Z' === 22:00 del 14/11/2026 COT)
  assert.equal(formatDateDDMMYYYY('2026-11-15T03:00:00Z'), '14/11/2026');
  // Fecha pura YYYY-MM-DD debe preservar día exacto sin desfase UTC
  assert.equal(formatDateDDMMYYYY('2026-11-14'), '14/11/2026');

  const escaped = escapeHtml('<img src=x onerror="alert(1)"> & \'quote\'');
  assert.equal(escaped.includes('<'), false);
  assert.equal(escaped.includes('>'), false);
  assert.ok(escaped.includes('&lt;img'));
  assert.ok(escaped.includes('&amp;'));
  assert.ok(escaped.includes('&quot;'));
});

test('unit:validations — enteros, montos finitos, email y recepción física', () => {
  assert.equal(isValidPositiveInt(1), true);
  assert.equal(isValidPositiveInt(0), false);
  assert.equal(isValidPositiveInt(1.5), false);
  assert.equal(isValidPositiveInt(Number.NaN), false);

  assert.equal(isValidNonNegativeInt(0), true);
  assert.equal(isValidNonNegativeInt(-1), false);

  assert.equal(isValidNonNegativeAmount(0), true);
  assert.equal(isValidNonNegativeAmount(42500.5), true);
  assert.equal(isValidNonNegativeAmount(-10), false);
  assert.equal(isValidNonNegativeAmount(Infinity), false);

  assert.equal(isValidEmailFormat('admin@realtws.com'), true);
  assert.equal(isValidEmailFormat('bad-email'), false);

  const negativePhys = validateReceptionDraft({
    sku: 'SKU-1',
    lotId: 'LOT-1',
    ownerId: 'OWN-0001',
    qtyPhysical: -1,
    qtyGood: 0,
    qtyDefective: 0,
    qtyPending: 0
  });
  assert.equal(negativePhys.valid, false);
  assert.ok(negativePhys.errors.quantities);
});

test('unit:spreadsheetParser — CSV RFC-4180 comillas, saltos multilínea y delimitador ;', async () => {
  const csvWithQuotes = [
    '\uFEFF"SKU";"Nombre";"Notas";"Precio"',
    '"AUD-1";"Audífono, Pro";"Línea 1\nLínea 2 con ""comillas""";"50000"',
    '"ACC-2";"Cable USB";"Normal";"15000"'
  ].join('\r\n');

  const rows = parseCsvRecords(csvWithQuotes);
  assert.equal(rows.length, 3);
  assert.equal(rows[0][0], 'SKU');
  assert.equal(rows[1][1], 'Audífono, Pro');
  assert.equal(rows[1][2], 'Línea 1\nLínea 2 con "comillas"');
  assert.equal(rows[2][3], '15000');

  const parsedWb = await parseCsvUtf8Text(csvWithQuotes, 'test.csv');
  assert.equal(parsedWb.sheetNames.length, 1);
  assert.equal(parsedWb.sheets[parsedWb.sheetNames[0]].totalDataRows, 2);
});

test('unit:permissions — matriz RBAC completa para los 6 roles, VIEWER, OWNER y expiración', () => {
  assert.equal(ALL_USER_ROLES.length, 6);

  const viewer = makeProfile({ role: 'VIEWER' });
  assert.equal(evaluateRouteAccess(viewer, '/', false).allowed, false);
  assert.equal(evaluateRouteAccess(viewer, '/finanzas/liquidaciones', false).allowed, false);
  assert.equal(evaluateRouteAccess(viewer, '/operaciones/inventario', false).allowed, false);
  assert.equal(evaluateRouteAccess(viewer, '/operaciones/productos', false).allowed, true);
  assert.equal(evaluateRouteAccess(viewer, '/marketing/branding', false).allowed, false);

  const marketing = makeProfile({ role: 'MARKETING_OPERATOR' });
  assert.equal(evaluateRouteAccess(marketing, '/marketing/meta-ads', false).allowed, true);
  assert.equal(
    ROUTE_PERMISSIONS['/marketing/meta-ads'].allowedWriteRoles.includes('MARKETING_OPERATOR'),
    false
  );

  const ownerDisabled = makeProfile({
    role: 'OWNER',
    linkedOwnerId: 'OWN-0001',
    ownerPortalEnabled: false
  });
  assert.equal(evaluateRouteAccess(ownerDisabled, '/', false).allowed, false);
  assert.equal(evaluateRouteAccess(ownerDisabled, '/finanzas/liquidaciones', false).allowed, false);

  const ownerEnabled = makeProfile({
    role: 'OWNER',
    linkedOwnerId: 'OWN-0001',
    ownerPortalEnabled: true
  });
  assert.equal(evaluateRouteAccess(ownerEnabled, '/finanzas/liquidaciones', false).allowed, true);
  assert.equal(
    evaluateSensitiveOperation(ownerEnabled, 'READ_OWNER_INVENTORY', { targetOwnerId: 'OWN-0002' }).allowed,
    false
  );
  assert.equal(
    evaluateSensitiveOperation(ownerEnabled, 'READ_OWNER_INVENTORY', { targetOwnerId: 'OWN-0001' }).allowed,
    true
  );

  const admin = makeProfile({ role: 'ADMIN' });
  for (const route of Object.keys(ROUTE_PERMISSIONS)) {
    assert.equal(evaluateRouteAccess(admin, route, false).allowed, true);
    assert.equal(evaluateRouteAccess(admin, route, true).allowed, false);
  }
});

test('unit:authService — batería de seguridad obligatoria (7/7 escenarios pasan)', () => {
  const { results } = runMandatorySecurityTests();
  assert.equal(results.length, 7);
  for (const res of results) {
    assert.equal(res.passed, true, `Escenario fallido (${res.id}): ${res.details}`);
  }
});

test('unit:xlsx-and-deploy-artifacts — Excel maestro legible y SQL 0024 + Cloudflare presentes', async () => {
  const excelPath = path.resolve('INVENTARIO_REAL_TWS/REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx');
  assert.equal(fs.existsSync(excelPath), true);
  const buf = fs.readFileSync(excelPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const wb = await parseXlsxBuffer(ab, 'REAL_TWS_INVENTARIO_MULTIPROPIETARIO.xlsx');
  assert.ok(wb.sheetNames.length >= 1);

  assert.equal(fs.existsSync(path.resolve('supabase/migrations/0024_qa_audit_fixes.sql')), true);
  assert.equal(fs.existsSync(path.resolve('wrangler.jsonc')), true);
  assert.equal(fs.existsSync(path.resolve('public/_headers')), true);
  assert.equal(fs.existsSync(path.resolve('public/_redirects')), true);
  assert.equal(fs.existsSync(path.resolve('public/sw.js')), true);
});

test('unit:design-system — tokens Liquid Glass, 4 niveles de superficie y activos de marca REAL TWS', () => {
  assert.equal(REAL_TWS_BRAND_IDENTITY.brandName, 'REAL TWS');
  assert.equal(REAL_TWS_BRAND_IDENTITY.tagline, 'AURICULARES PREMIUM');
  assert.equal(REAL_TWS_BRAND_IDENTITY.monogram, 'Rws');
  assert.equal(REAL_TWS_BRAND_IDENTITY.officialWhatsappDisplay, '320 698 8013');
  assert.equal(REAL_TWS_BRAND_IDENTITY.officialWhatsappRaw, '3206988013');
  assert.equal(THEME_STORAGE_KEY, 'rtw_theme_preference_v1');

  assert.equal(Object.keys(YELLOW_GOLD_SCALE).length, 11);
  assert.equal(Object.keys(GRAY_SCALE_DARK).length, 9);
  assert.equal(Object.keys(GRAY_SCALE_LIGHT).length, 8);
  assert.equal(Object.keys(GLASS_SURFACE_LEVELS).length, 4);
  assert.equal(GLASS_SURFACE_LEVELS[3].blurPx, 26);
  assert.equal(MOTION_TOKENS.durations.normal, '260ms');

  assert.equal(fs.existsSync(path.resolve('public/brand/real-tws-plaque-gold.jpg')), true);
  assert.equal(fs.existsSync(path.resolve('public/brand/real-tws-monogram-rws.jpg')), true);
  assert.equal(fs.existsSync(path.resolve('public/icons/real-tws-icon.svg')), true);
});
