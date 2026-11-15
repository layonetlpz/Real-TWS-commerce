-- =============================================================================
-- MIGRACIÓN 0005: GASTOS DIRECTOS Y COMPARTIDOS, DISTRIBUCIÓN DE GASTOS
--                 Y LIQUIDACIONES A PROPIETARIOS
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre entidades:
--  14. Expenses (public.expenses)
--  15. Expense allocations (public.expense_allocations)
--  25. Owner settlements (public.owner_settlements)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.expenses (Entidad #14 — Gastos Operativos y Directos)
--    Regla Financiera: Separa gastos directos por propietario, gastos
--    compartidos multipropietario y gastos internos absorbidos por la tienda.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT PRIMARY KEY CHECK (id ~ '^EXP-[0-9]{4,}$'),
  expense_date DATE NOT NULL,
  expense_scope TEXT NOT NULL CHECK (
    expense_scope IN ('direct_owner', 'shared_multi_owner', 'store_internal')
  ),
  category TEXT NOT NULL CHECK (btrim(category) <> ''),
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  total_amount_cop NUMERIC(14,2) NOT NULL CHECK (total_amount_cop > 0),
  allocation_policy TEXT NOT NULL CHECK (
    allocation_policy IN (
      'single_owner_direct',
      'manual_explicit',
      'proportional_net_sales',
      'proportional_cogs',
      'proportional_units_sold',
      'store_absorbed'
    )
  ),
  allocation_period_start DATE,
  allocation_period_end DATE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  private_receipt_storage_path TEXT,
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (
    approval_status IN ('draft', 'approved', 'cancelled')
  ),
  recorded_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_expense_scope_policy CHECK (
    (expense_scope = 'direct_owner' AND allocation_policy = 'single_owner_direct')
    OR (expense_scope = 'store_internal' AND allocation_policy = 'store_absorbed')
    OR (
      expense_scope = 'shared_multi_owner'
      AND allocation_policy IN (
        'manual_explicit',
        'proportional_net_sales',
        'proportional_cogs',
        'proportional_units_sold'
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_scope ON public.expenses(expense_scope);

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.expense_allocations (Entidad #15 — Prorrateo / Asignación de Gastos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id TEXT NOT NULL REFERENCES public.expenses(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  allocated_amount_cop NUMERIC(14,2) NOT NULL CHECK (allocated_amount_cop >= 0),
  allocation_percentage NUMERIC(7,4) CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100),
  calculation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  justification_note TEXT NOT NULL CHECK (btrim(justification_note) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_expense_owner_allocation UNIQUE (expense_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_allocations_owner ON public.expense_allocations(owner_id);

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.owner_settlements (Entidad #25 — Liquidaciones de Ganancias)
--    Regla crítica: Prohibido liquidar sin acuerdo configurado ('active') o con
--    utilidad disponible <= 0.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.owner_settlements (
  id TEXT PRIMARY KEY CHECK (id ~ '^LIQ-[0-9]{4,}$'),
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  agreement_id TEXT NOT NULL REFERENCES public.owner_agreements(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_sales_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gross_sales_period_cop >= 0),
  returns_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (returns_period_cop >= 0),
  net_sales_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (net_sales_period_cop >= 0),
  cogs_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cogs_period_cop >= 0),
  direct_expenses_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (direct_expenses_period_cop >= 0),
  shared_expenses_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (shared_expenses_period_cop >= 0),
  store_commission_period_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (store_commission_period_cop >= 0),
  attributable_profit_before_cop NUMERIC(14,2) NOT NULL CHECK (attributable_profit_before_cop > 0),
  amount_settled_cop NUMERIC(14,2) NOT NULL CHECK (
    amount_settled_cop > 0 AND amount_settled_cop <= attributable_profit_before_cop
  ),
  pending_balance_after_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    attributable_profit_before_cop - amount_settled_cop
  ) STORED,
  payment_method TEXT NOT NULL CHECK (btrim(payment_method) <> ''),
  voucher_reference TEXT NOT NULL CHECK (btrim(voucher_reference) <> ''),
  private_voucher_storage_path TEXT,
  settlement_status TEXT NOT NULL DEFAULT 'paid' CHECK (
    settlement_status IN ('draft', 'approved', 'paid', 'annulled')
  ),
  authorized_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_settlement_period_dates CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_owner_settlements_owner ON public.owner_settlements(owner_id, settlement_date DESC);

DROP TRIGGER IF EXISTS trg_owner_settlements_updated_at ON public.owner_settlements;
CREATE TRIGGER trg_owner_settlements_updated_at
  BEFORE UPDATE ON public.owner_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

COMMIT;
