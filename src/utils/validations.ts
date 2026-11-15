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

/**
 * Valida las reglas obligatorias 6, 8, 11 y 12:
 * - Todo nuevo registro exige propietario explícito (nunca preasignar Eberto automáticamente).
 * - Cantidad física total = apta + defectuosa + pendiente.
 * - No permitir cantidades negativas.
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
    input.qtyPhysical < 0 ||
    input.qtyGood < 0 ||
    input.qtyDefective < 0 ||
    input.qtyPending < 0
  ) {
    errors.quantities = 'No se permiten cantidades negativas en ningún estado de stock.';
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
