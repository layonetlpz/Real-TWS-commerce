-- =============================================================================
-- MIGRACIÓN 0004: CLIENTES, LEADS (CRM), PEDIDOS DE VENTA, LÍNEAS DE PEDIDO,
--                 ATRIBUCIÓN MULTIPROPIETARIO, PAGOS, DEVOLUCIONES Y DESPACHOS
-- Proyecto: REAL TWS COMMERCE SYSTEM
-- Cubre entidades:
--  16. Customers (public.customers)
--  17. Leads (public.leads)
--  18. Sales orders (public.sales_orders)
--  19. Sales order items (public.sales_order_items)
--  20. Sales item allocations (public.sales_item_allocations)
--  21. Payments (public.payments)
--  22. Returns (public.returns)
--  23. Shipments (public.shipments)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TABLA: public.customers (Entidad #16 — Clientes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT NOT NULL UNIQUE CHECK (btrim(customer_code) <> ''),
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  document_type TEXT,
  document_number TEXT,
  phone_whatsapp TEXT,
  email TEXT,
  city TEXT,
  department TEXT,
  shipping_address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone_whatsapp);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.leads (Entidad #17 — Prospectos y Seguimiento CRM)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_code TEXT NOT NULL UNIQUE CHECK (btrim(lead_code) <> ''),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  phone_whatsapp TEXT,
  email TEXT,
  source_channel TEXT NOT NULL CHECK (
    source_channel IN ('whatsapp', 'instagram', 'facebook', 'marketplace', 'walk_in', 'referral', 'other')
  ),
  interested_sku TEXT REFERENCES public.product_variants(sku) ON DELETE SET NULL,
  lead_stage TEXT NOT NULL DEFAULT 'new' CHECK (
    lead_stage IN ('new', 'contacted', 'quoted', 'negotiation', 'won', 'lost')
  ),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  next_followup_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(lead_stage);
CREATE INDEX IF NOT EXISTS idx_leads_sku ON public.leads(interested_sku);

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. TABLA: public.sales_orders (Entidad #18 — Encabezado de Pedidos de Venta)
--    Regla crítica: allocation_policy_used obliga política explícita; nunca
--    elige propietarios al azar.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE CHECK (btrim(order_number) <> ''),
  order_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  sales_channel TEXT NOT NULL DEFAULT 'store_direct' CHECK (
    sales_channel IN ('store_direct', 'whatsapp', 'instagram', 'facebook', 'marketplace', 'web')
  ),
  allocation_policy_used TEXT NOT NULL DEFAULT 'explicit_manual_selection' CHECK (
    allocation_policy_used IN ('explicit_manual_selection', 'approved_fifo_policy')
  ),
  order_status TEXT NOT NULL DEFAULT 'draft' CHECK (
    order_status IN (
      'draft',
      'reserved',
      'confirmed',
      'dispatched',
      'delivered',
      'partially_returned',
      'returned',
      'cancelled'
    )
  ),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'partial', 'paid', 'refunded')
  ),
  subtotal_gross_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_gross_cop >= 0),
  discount_total_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_total_cop >= 0),
  shipping_charged_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (shipping_charged_cop >= 0),
  returned_total_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (returned_total_cop >= 0),
  net_order_total_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    (subtotal_gross_cop - discount_total_cop - returned_total_cop) + shipping_charged_cop
  ) STORED,
  total_collected_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_collected_cop >= 0),
  seller_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON public.sales_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON public.sales_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON public.sales_orders(customer_id);

DROP TRIGGER IF EXISTS trg_sales_orders_updated_at ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_updated_at
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. TABLA: public.sales_order_items (Entidad #19 — Líneas Comerciales del Pedido)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  qty_ordered INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_returned INTEGER NOT NULL DEFAULT 0 CHECK (qty_returned >= 0 AND qty_returned <= qty_ordered),
  unit_sale_price_cop NUMERIC(12,2) NOT NULL CHECK (unit_sale_price_cop >= 0),
  line_discount_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (line_discount_cop >= 0),
  line_gross_total_cop NUMERIC(14,2) GENERATED ALWAYS AS (qty_ordered * unit_sale_price_cop) STORED,
  line_net_total_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    (qty_ordered * unit_sale_price_cop) - line_discount_cop
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sales_order_item_line UNIQUE (sales_order_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON public.sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_sku ON public.sales_order_items(sku);

-- -----------------------------------------------------------------------------
-- 5. TABLA: public.sales_item_allocations (Entidad #20 — Descomposición Multipropietario
--           Propietario + Lote + Cantidad + Costo + Ingreso + Comisión + Utilidad)
--    Regla crítica: Toda venta se descompone en asignaciones exactas sin doble
--    conteo y sin asumir porcentajes de comisión no configurados.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_item_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_sale_code TEXT NOT NULL UNIQUE CHECK (btrim(allocation_sale_code) <> ''),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  sales_order_item_id UUID NOT NULL REFERENCES public.sales_order_items(id) ON DELETE RESTRICT,
  lot_allocation_id UUID NOT NULL REFERENCES public.lot_owner_allocations(id) ON DELETE RESTRICT,
  lot_id TEXT NOT NULL REFERENCES public.stock_lots(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  agreement_id TEXT REFERENCES public.owner_agreements(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  qty_allocated INTEGER NOT NULL CHECK (qty_allocated > 0),
  qty_returned INTEGER NOT NULL DEFAULT 0 CHECK (qty_returned >= 0 AND qty_returned <= qty_allocated),
  unit_sale_price_cop NUMERIC(12,2) NOT NULL CHECK (unit_sale_price_cop >= 0),
  discount_allocated_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_allocated_cop >= 0),
  return_amount_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (return_amount_cop >= 0),
  gross_revenue_cop NUMERIC(14,2) GENERATED ALWAYS AS (qty_allocated * unit_sale_price_cop) STORED,
  net_revenue_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    (qty_allocated * unit_sale_price_cop) - discount_allocated_cop - return_amount_cop
  ) STORED,
  unit_cost_cop NUMERIC(12,2) NOT NULL CHECK (unit_cost_cop >= 0),
  cogs_total_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    (qty_allocated - qty_returned) * unit_cost_cop
  ) STORED,
  direct_selling_expense_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (direct_selling_expense_cop >= 0),
  gross_profit_cop NUMERIC(14,2) GENERATED ALWAYS AS (
    ((qty_allocated * unit_sale_price_cop) - discount_allocated_cop - return_amount_cop)
    - ((qty_allocated - qty_returned) * unit_cost_cop)
    - direct_selling_expense_cop
  ) STORED,
  store_commission_cop NUMERIC(14,2) CHECK (store_commission_cop >= 0),
  attributable_owner_profit_cop NUMERIC(14,2),
  commission_calculation_status TEXT NOT NULL DEFAULT 'pending_agreement' CHECK (
    commission_calculation_status IN (
      'pending_agreement',
      'calculated_by_agreement',
      'direct_100_owner'
    )
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_allocations_owner ON public.sales_item_allocations(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_allocations_order_item ON public.sales_item_allocations(sales_order_item_id);
CREATE INDEX IF NOT EXISTS idx_sales_allocations_lot_alloc ON public.sales_item_allocations(lot_allocation_id);

DROP TRIGGER IF EXISTS trg_sales_item_allocations_updated_at ON public.sales_item_allocations;
CREATE TRIGGER trg_sales_item_allocations_updated_at
  BEFORE UPDATE ON public.sales_item_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. TABLA: public.payments (Entidad #21 — Recaudos y Pagos de Clientes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_code TEXT NOT NULL UNIQUE CHECK (btrim(payment_code) <> ''),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_method TEXT NOT NULL CHECK (
    payment_method IN ('cash', 'nequi', 'daviplata', 'bank_transfer', 'card', 'cod_carrier')
  ),
  amount_cop NUMERIC(14,2) NOT NULL CHECK (amount_cop > 0),
  payment_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (
    payment_status IN ('pending', 'confirmed', 'voided', 'refunded')
  ),
  external_reference TEXT,
  private_voucher_storage_path TEXT,
  received_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(sales_order_id);

-- -----------------------------------------------------------------------------
-- 7. TABLA: public.returns (Entidad #22 — Devoluciones y Garantías sobre Ventas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_code TEXT NOT NULL UNIQUE CHECK (btrim(return_code) <> ''),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  sales_order_item_id UUID NOT NULL REFERENCES public.sales_order_items(id) ON DELETE RESTRICT,
  sales_item_allocation_id UUID NOT NULL REFERENCES public.sales_item_allocations(id) ON DELETE RESTRICT,
  lot_allocation_id UUID NOT NULL REFERENCES public.lot_owner_allocations(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL REFERENCES public.product_variants(sku) ON DELETE RESTRICT,
  return_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  qty_returned INTEGER NOT NULL CHECK (qty_returned > 0),
  item_condition TEXT NOT NULL CHECK (
    item_condition IN ('good_restock', 'defective_warranty', 'pending_inspection')
  ),
  refund_amount_cop NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (refund_amount_cop >= 0),
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  return_status TEXT NOT NULL DEFAULT 'completed' CHECK (
    return_status IN ('requested', 'approved', 'completed', 'rejected')
  ),
  processed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_returns_owner ON public.returns(owner_id);
CREATE INDEX IF NOT EXISTS idx_returns_order ON public.returns(sales_order_id);

-- -----------------------------------------------------------------------------
-- 8. TABLA: public.shipments (Entidad #23 — Despachos y Logística de Entrega)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_code TEXT NOT NULL UNIQUE CHECK (btrim(shipment_code) <> ''),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  carrier_name TEXT NOT NULL CHECK (btrim(carrier_name) <> ''),
  tracking_number TEXT,
  recipient_name TEXT NOT NULL CHECK (btrim(recipient_name) <> ''),
  recipient_phone TEXT NOT NULL CHECK (btrim(recipient_phone) <> ''),
  destination_city TEXT NOT NULL CHECK (btrim(destination_city) <> ''),
  destination_address TEXT NOT NULL CHECK (btrim(destination_address) <> ''),
  shipping_cost_cop NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_cost_cop >= 0),
  shipment_status TEXT NOT NULL DEFAULT 'preparing' CHECK (
    shipment_status IN (
      'preparing',
      'dispatched',
      'in_transit',
      'delivered',
      'returned_by_carrier',
      'cancelled'
    )
  ),
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  private_guide_storage_path TEXT,
  dispatched_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipments_order ON public.shipments(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.shipments(shipment_status);

DROP TRIGGER IF EXISTS trg_shipments_updated_at ON public.shipments;
CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

COMMIT;
