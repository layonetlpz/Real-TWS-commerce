// =============================================================================
// REAL TWS COMMERCE SYSTEM — TIPOS TYPESCRIPT DEL ESQUEMA SUPABASE
// Alineado con migraciones 0001..0023 y REAL_TWS_MASTER_DATABASE_CORREGIDO.sql
// =============================================================================

export type AppRoleDb =
  | 'ADMIN'
  | 'INVENTORY_OPERATOR'
  | 'SALES_OPERATOR'
  | 'MARKETING_OPERATOR'
  | 'OWNER'
  | 'VIEWER';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string;
          role: AppRoleDb;
          linked_owner_id: string | null;
          owner_portal_enabled: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & {
          id: string;
          full_name: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      owners: {
        Row: {
          id: string;
          internal_code: string;
          full_name: string;
          document_type: string | null;
          document_number: string | null;
          phone: string | null;
          email: string | null;
          status: string;
          portal_access_enabled: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['owners']['Row']> & {
          id: string;
          internal_code: string;
          full_name: string;
        };
        Update: Partial<Database['public']['Tables']['owners']['Row']>;
        Relationships: [];
      };
      business_settings: {
        Row: {
          id: string;
          business_name: string;
          legal_name: string;
          currency_code: string;
          timezone: string;
          default_low_stock_threshold: number;
          ai_provider_enabled: boolean;
          meta_api_enabled: boolean;
          whatsapp_cloud_enabled: boolean;
          auto_publish_blocked: boolean;
          auto_settlement_blocked: boolean;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['business_settings']['Row']>;
        Update: Partial<Database['public']['Tables']['business_settings']['Row']>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['categories']['Row']> & {
          code: string;
          name: string;
        };
        Update: Partial<Database['public']['Tables']['categories']['Row']>;
        Relationships: [];
      };
      lot_owner_allocations: {
        Row: {
          id: string;
          allocation_code: string;
          lot_id: string;
          variant_id: string;
          sku: string;
          owner_id: string;
          storage_bin: string;
          qty_initial_assigned: number | null;
          qty_physical: number | null;
          qty_good: number;
          qty_defective: number;
          qty_pending_inspection: number;
          qty_reserved: number;
          qty_available: number;
          purchase_unit_cost_cop: number | null;
          inbound_shipping_unit_cost_cop: number;
          other_unit_cost_cop: number;
          effective_unit_cost_cop: number | null;
          is_bonus_zero_cost: boolean;
          reconciliation_state: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['lot_owner_allocations']['Row']>;
        Update: Partial<Database['public']['Tables']['lot_owner_allocations']['Row']>;
        Relationships: [];
      };
      inventory_incidences: {
        Row: {
          id: string;
          severity: 'ALTA' | 'MEDIA' | 'INFO';
          affected_module: string;
          sku_or_owner_ref: string;
          owner_id: string | null;
          description: string;
          required_action: string;
          status: 'Pendiente Revisión' | 'En Proceso' | 'Resuelto';
          resolved_at: string | null;
          resolved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['inventory_incidences']['Row']> & {
          id: string;
          severity: 'ALTA' | 'MEDIA' | 'INFO';
          affected_module: string;
          sku_or_owner_ref: string;
          description: string;
          required_action: string;
        };
        Update: Partial<Database['public']['Tables']['inventory_incidences']['Row']>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          audit_seq: number;
          actor_user_id: string | null;
          actor_role: string | null;
          action_type: string;
          table_name: string;
          record_pk: string;
          owner_id_affected: string | null;
          previous_data: Record<string, unknown> | null;
          new_data: Record<string, unknown> | null;
          reason: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['audit_logs']['Row']> & {
          action_type: string;
          table_name: string;
          record_pk: string;
        };
        Update: Partial<Database['public']['Tables']['audit_logs']['Row']>;
        Relationships: [];
      };
      sales_orders: {
        Row: {
          id: string;
          order_number: string;
          order_date: string;
          customer_id: string | null;
          lead_id: string | null;
          sales_channel: string;
          allocation_policy_used: string;
          order_status: string;
          payment_status: string;
          shipping_charged_cop: number;
          shipping_real_cost_cop: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['sales_orders']['Row']>;
        Update: Partial<Database['public']['Tables']['sales_orders']['Row']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          notification_code: string;
          target_user_id: string | null;
          target_role: AppRoleDb | null;
          owner_id: string | null;
          severity: 'info' | 'warning' | 'critical';
          title: string;
          message: string;
          source_event: string | null;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['notifications']['Row']> & {
          notification_code: string;
          title: string;
          message: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Row']>;
        Relationships: [];
      };
    };
    Views: {
      v_available_inventory: {
        Row: {
          sku: string;
          product_id: string;
          product_name: string;
          owner_id: string;
          owner_name: string;
          lot_id: string;
          qty_physical: number;
          qty_good: number;
          qty_defective: number;
          qty_pending_inspection: number;
          qty_reserved: number;
          qty_available: number;
          effective_unit_cost_cop: number | null;
        };
        Relationships: [];
      };
      v_owner_financial_pnl: {
        Row: {
          owner_id: string;
          internal_code: string;
          owner_name: string;
          owner_status: string;
          agreement_status: string;
          distribution_model: string | null;
          associated_skus: number;
          physical_units: number;
          available_units: number;
          pending_inspection_units: number;
          net_units_sold: number;
          gross_sales_cop: number;
          discounts_cop: number;
          returns_cop: number;
          net_sales_cop: number;
          total_cogs_cop: number;
          gross_profit_cop: number;
          allocated_direct_expenses_cop: number;
          allocated_shared_expenses_cop: number;
          store_commission_cop: number;
          net_attributable_profit_cop: number;
          total_settled_cop: number;
          pending_settlement_balance_cop: number;
        };
        Relationships: [];
      };
      v_sales_summary: {
        Row: {
          sales_order_id: string;
          order_number: string;
          order_date: string;
          status: string;
          sales_channel: string;
          payment_status: string;
          allocation_count: number;
          net_units_sold: number;
          net_revenue_cop: number;
          cogs_cop: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      fn_admin_update_user_role_and_access: {
        Args: {
          p_target_user_id: string;
          p_new_role: AppRoleDb;
          p_linked_owner_id: string | null;
          p_owner_portal_enabled: boolean;
          p_is_active: boolean;
          p_reason?: string;
        };
        Returns: unknown;
      };
      fn_log_security_event: {
        Args: {
          p_event_type: string;
          p_target_resource: string;
          p_reason: string;
          p_metadata?: Record<string, unknown>;
        };
        Returns: unknown;
      };
      fn_authorize_private_document_access: {
        Args: {
          p_storage_path: string;
          p_document_owner_id: string | null;
        };
        Returns: unknown;
      };
      fn_execute_opening_inventory_import_batch: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
      fn_dispatch_idempotent_automation_event: {
        Args: {
          p_idempotency_key: string;
          p_event_type: string;
          p_reference_entity: string;
          p_reference_id: string;
          p_sku: string;
          p_owner_id: string;
          p_payload: Record<string, unknown>;
          p_triggered_by?: string;
        };
        Returns: unknown;
      };
    };
    Enums: {
      app_role: AppRoleDb;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
