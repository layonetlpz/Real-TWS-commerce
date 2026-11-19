import type { ValidationResult } from '../types/domain';

export interface ReceptionDraftInput {
  sku: string;
  lotId: string;
  ownerId: string;
  qtyPhysical: number;
  qtyGood: number;
  qtyDefective: number;
  qtyPending: number;
}

export function isValidPositiveInt(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

export function isValidNonNegativeInt(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

export function isValidNonNegativeAmount(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Valida las reglas obligatorias 6, 8, 11 y 12:
 * - Todo nuevo registro exige propietario explícito (nunca preasignar Eberto automáticamente).
 * - Cantidad física total = apta + defectuosa + pendiente (enteros no negativos).
 * - No permitir cantidades negativas, decimales ni NaN.
 */
export function validateReceptionDraft(input: ReceptionDraftInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.sku.trim()) {
    errors.sku = 'El código SKU es obligatorio.';
  }
  if (!input.lotId.trim()) {
    errors.lotId = 'El identificador de lote es obligatorio para la trazabilidad.';
  }
  if (!input.ownerId.trim()) {
    errors.ownerId = 'Debe seleccionar explícitamente un propietario activo.';
  }
  if (
    !isValidNonNegativeInt(input.qtyPhysical) ||
    !isValidNonNegativeInt(input.qtyGood) ||
    !isValidNonNegativeInt(input.qtyDefective) ||
    !isValidNonNegativeInt(input.qtyPending)
  ) {
    errors.quantities = 'Todas las cantidades deben ser números enteros mayores o iguales a cero.';
  } else {
    const sumBreakdown = input.qtyGood + input.qtyDefective + input.qtyPending;
    if (input.qtyPhysical !== sumBreakdown) {
      errors.reconciliation = `Descuadre de conciliación: Física (${input.qtyPhysical}) ≠ Apta (${input.qtyGood}) + Defectuosa (${input.qtyDefective}) + Pendiente (${input.qtyPending}). Diferencia: ${input.qtyPhysical - sumBreakdown}.`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
