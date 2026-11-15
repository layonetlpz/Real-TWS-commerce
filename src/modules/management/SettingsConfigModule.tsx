import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  FolderTree,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import {
  fetchLiveBusinessSettings,
  fetchLiveCategories,
  saveLiveBusinessSettings,
  upsertLiveCategory,
  type DbBusinessSettingsRow,
  type DbCategoryRow
} from '../../services/supabaseDataBridge';
import { DataTable } from '../../components/DataTable';
import { LoadingState, ErrorState } from '../../components/StatusStates';
import type { TableColumn } from '../../types/domain';

interface SettingsFormState {
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
}

const DEFAULT_SETTINGS_FORM: SettingsFormState = {
  business_name: 'REAL TWS',
  legal_name: 'REAL TWS COMMERCE SYSTEM',
  currency_code: 'COP',
  timezone: 'America/Bogota',
  default_low_stock_threshold: 3,
  ai_provider_enabled: false,
  meta_api_enabled: false,
  whatsapp_cloud_enabled: false,
  auto_publish_blocked: true,
  auto_settlement_blocked: true
};

function mapSettingsToForm(row: DbBusinessSettingsRow | null): SettingsFormState {
  if (!row) return DEFAULT_SETTINGS_FORM;
  return {
    business_name: row.business_name,
    legal_name: row.legal_name,
    currency_code: row.currency_code,
    timezone: row.timezone,
    default_low_stock_threshold: row.default_low_stock_threshold,
    ai_provider_enabled: row.ai_provider_enabled,
    meta_api_enabled: row.meta_api_enabled,
    whatsapp_cloud_enabled: row.whatsapp_cloud_enabled,
    auto_publish_blocked: row.auto_publish_blocked,
    auto_settlement_blocked: row.auto_settlement_blocked
  };
}

export function SettingsConfigModule() {
  const { userProfile, activeEffectiveRole } = useAuth();
  const { notify } = useNotifications();
  const canEditSettings = activeEffectiveRole === 'ADMIN';
  const canEditCategories =
    activeEffectiveRole === 'ADMIN' || activeEffectiveRole === 'INVENTORY_OPERATOR';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsRow, setSettingsRow] = useState<DbBusinessSettingsRow | null>(null);
  const [form, setForm] = useState<SettingsFormState>(DEFAULT_SETTINGS_FORM);
  const [categories, setCategories] = useState<DbCategoryRow[]>([]);

  const [catCode, setCatCode] = useState('');
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [settingsRes, categoriesRes] = await Promise.all([
      fetchLiveBusinessSettings(),
      fetchLiveCategories()
    ]);

    if (settingsRes.error && categoriesRes.error) {
      setError(`${settingsRes.error} | ${categoriesRes.error}`);
    } else {
      setSettingsRow(settingsRes.data);
      setForm(mapSettingsToForm(settingsRes.data));
      setCategories(categoriesRes.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEditSettings) return;
    if (!form.business_name.trim() || !form.legal_name.trim()) {
      notify('error', 'Campos obligatorios', 'Indica el nombre comercial y la razón social.');
      return;
    }
    if (form.default_low_stock_threshold < 0) {
      notify('error', 'Umbral inválido', 'El umbral de stock bajo debe ser mayor o igual a 0.');
      return;
    }

    setSavingSettings(true);
    const { data, error: saveErr } = await saveLiveBusinessSettings(
      {
        business_name: form.business_name.trim(),
        legal_name: form.legal_name.trim(),
        currency_code: form.currency_code.trim() || 'COP',
        timezone: form.timezone.trim() || 'America/Bogota',
        default_low_stock_threshold: Number(form.default_low_stock_threshold) || 0,
        ai_provider_enabled: form.ai_provider_enabled,
        meta_api_enabled: form.meta_api_enabled,
        whatsapp_cloud_enabled: form.whatsapp_cloud_enabled,
        auto_publish_blocked: form.auto_publish_blocked,
        auto_settlement_blocked: form.auto_settlement_blocked
      },
      userProfile?.id
    );
    setSavingSettings(false);

    if (saveErr || !data) {
      notify('error', 'No se pudo guardar la configuración', saveErr ?? 'Error inesperado en Supabase.');
      return;
    }

    setSettingsRow(data);
    setForm(mapSettingsToForm(data));
    notify('success', 'Configuración actualizada', 'Los parámetros del negocio se guardaron en Supabase.');
  };

  const handleCreateOrUpdateCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEditCategories) return;
    if (!catCode.trim() || !catName.trim()) {
      notify('error', 'Campos obligatorios', 'Ingresa el código y el nombre de la categoría.');
      return;
    }

    setSavingCategory(true);
    const { data, error: catErr } = await upsertLiveCategory({
      code: catCode,
      name: catName,
      description: catDesc,
      is_active: true
    });
    setSavingCategory(false);

    if (catErr || !data) {
      notify('error', 'Error guardando categoría', catErr ?? 'No se pudo guardar la categoría.');
      return;
    }

    setCatCode('');
    setCatName('');
    setCatDesc('');
    await loadData();
    notify('success', 'Categoría guardada', `${data.code} — ${data.name} registrada correctamente.`);
  };

  const handleToggleCategory = useCallback(
    async (row: DbCategoryRow) => {
      if (!canEditCategories) return;
      const { error: toggleErr } = await upsertLiveCategory({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description ?? '',
        is_active: !row.is_active
      });
      if (toggleErr) {
        notify('error', 'Error actualizando categoría', toggleErr);
        return;
      }
      await loadData();
      notify(
        'info',
        row.is_active ? 'Categoría desactivada' : 'Categoría activada',
        `${row.code} — ${row.name}`
      );
    },
    [canEditCategories, loadData, notify]
  );

  const categoryColumns = useMemo<TableColumn<DbCategoryRow>[]>(
    () => [
      {
        key: 'code',
        header: 'Código',
        sortValue: (row) => row.code,
        render: (row) => <strong className="rtw-mono">{row.code}</strong>
      },
      {
        key: 'name',
        header: 'Nombre de Categoría',
        sortValue: (row) => row.name,
        render: (row) => row.name
      },
      {
        key: 'description',
        header: 'Descripción',
        render: (row) => (
          <span style={{ color: '#475569', fontSize: '0.82rem' }}>
            {row.description || 'Sin descripción'}
          </span>
        )
      },
      {
        key: 'status',
        header: 'Estado',
        sortValue: (row) => (row.is_active ? 1 : 0),
        render: (row) => (
          <span className={`rtw-badge ${row.is_active ? 'rtw-badge-success' : 'rtw-badge-neutral'}`}>
            {row.is_active ? 'Activa' : 'Inactiva'}
          </span>
        )
      },
      {
        key: 'actions',
        header: 'Acción',
        align: 'right',
        hideOnMobile: !canEditCategories,
        render: (row) =>
          canEditCategories ? (
            <button
              type="button"
              className="rtw-btn rtw-btn-outline btn-sm"
              onClick={() => void handleToggleCategory(row)}
            >
              {row.is_active ? 'Desactivar' : 'Activar'}
            </button>
          ) : (
            <span style={{ color: '#64748b', fontSize: '0.78rem' }}>Solo lectura</span>
          )
      }
    ],
    [canEditCategories, handleToggleCategory]
  );

  if (loading) {
    return <LoadingState label="Cargando configuración corporativa y categorías..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadData()} />;
  }

  return (
    <div className="module-container">
      <div
        className="rtw-card rtw-card-gold-top"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: 0 }}
      >
        <div>
          <h2 style={{ fontSize: '1.12rem', fontWeight: 800, color: '#0f172a' }}>
            Configuración General y Catálogo de Categorías
          </h2>
          <p style={{ fontSize: '0.84rem', color: '#475569' }}>
            Parámetros generales del negocio, controles de seguridad operativa e integraciones externas.
          </p>
        </div>

        <button
          type="button"
          className="rtw-btn rtw-btn-outline btn-sm"
          onClick={() => void loadData()}
        >
          <RefreshCw size={14} />
          Actualizar desde Supabase
        </button>
      </div>

      {!canEditSettings && (
        <div
          className="rtw-card"
          style={{
            borderLeft: '4px solid #d4af37',
            backgroundColor: '#fefce8',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: 0
          }}
        >
          <ShieldAlert size={18} color="#92400e" />
          <span style={{ fontSize: '0.84rem', color: '#78350f' }}>
            Estás en modo solo lectura sobre los parámetros globales. Solo un Administrador puede modificar estos valores.
          </span>
        </div>
      )}

      <form onSubmit={(e) => void handleSaveSettings(e)} className="rtw-card" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Settings size={18} color="#d4af37" />
          <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
            Identidad Comercial, Moneda y Controles de Operación
          </h3>
        </div>

        <div className="rtw-form-grid" style={{ marginBottom: '18px' }}>
          <div className="rtw-field">
            <label className="rtw-label" htmlFor="cfg-business-name">
              Nombre Comercial
            </label>
            <input
              id="cfg-business-name"
              type="text"
              className="rtw-input"
              disabled={!canEditSettings}
              value={form.business_name}
              onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
              required
            />
          </div>

          <div className="rtw-field">
            <label className="rtw-label" htmlFor="cfg-legal-name">
              Razón Social
            </label>
            <input
              id="cfg-legal-name"
              type="text"
              className="rtw-input"
              disabled={!canEditSettings}
              value={form.legal_name}
              onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
              required
            />
          </div>

          <div className="rtw-field">
            <label className="rtw-label" htmlFor="cfg-currency">
              Moneda Base
            </label>
            <input
              id="cfg-currency"
              type="text"
              className="rtw-input"
              disabled={!canEditSettings}
              value={form.currency_code}
              onChange={(e) => setForm((f) => ({ ...f, currency_code: e.target.value.toUpperCase() }))}
            />
          </div>

          <div className="rtw-field">
            <label className="rtw-label" htmlFor="cfg-timezone">
              Zona Horaria
            </label>
            <input
              id="cfg-timezone"
              type="text"
              className="rtw-input"
              disabled={!canEditSettings}
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            />
          </div>

          <div className="rtw-field">
            <label className="rtw-label" htmlFor="cfg-low-stock">
              Umbral Global de Stock Bajo (Unidades)
            </label>
            <input
              id="cfg-low-stock"
              type="number"
              min={0}
              className="rtw-input"
              disabled={!canEditSettings}
              value={form.default_low_stock_threshold}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  default_low_stock_threshold: Math.max(0, Number(e.target.value) || 0)
                }))
              }
            />
            <span className="rtw-field-hint">
              Dispara alertas preventivas cuando la disponibilidad caiga a este nivel.
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '12px',
            marginBottom: '18px'
          }}
        >
          {[
            {
              key: 'auto_publish_blocked' as const,
              title: 'Bloquear publicación automática',
              desc: 'Exige confirmación manual antes de publicar en redes o marketplace.'
            },
            {
              key: 'auto_settlement_blocked' as const,
              title: 'Bloquear liquidaciones automáticas',
              desc: 'Exige revisión administrativa antes de aprobar cortes de propietarios.'
            },
            {
              key: 'ai_provider_enabled' as const,
              title: 'Integración de proveedor IA',
              desc: 'Habilita o apaga funciones asistidas de contenido en Creative Studio.'
            },
            {
              key: 'meta_api_enabled' as const,
              title: 'Integración Meta Graph API',
              desc: 'Controla lectura y sincronización oficial de campañas Meta.'
            },
            {
              key: 'whatsapp_cloud_enabled' as const,
              title: 'Integración WhatsApp Cloud',
              desc: 'Activa envío o recepción conectada cuando existan credenciales.'
            }
          ].map((item) => (
            <label
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
                cursor: canEditSettings ? 'pointer' : 'not-allowed'
              }}
            >
              <input
                type="checkbox"
                checked={form[item.key]}
                disabled={!canEditSettings}
                onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.checked }))}
                style={{ marginTop: '3px', width: '16px', height: '16px' }}
              />
              <span>
                <strong style={{ display: 'block', fontSize: '0.84rem', color: '#0f172a' }}>
                  {item.title}
                </strong>
                <span style={{ fontSize: '0.76rem', color: '#64748b' }}>{item.desc}</span>
              </span>
            </label>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '14px'
          }}
        >
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {settingsRow?.updated_at
              ? `Última actualización registrada: ${new Date(settingsRow.updated_at).toLocaleString('es-CO')}`
              : 'Sin cambios personalizados guardados aún.'}
          </span>

          {canEditSettings && (
            <button
              type="submit"
              className="rtw-btn rtw-btn-primary"
              disabled={savingSettings}
            >
              <Save size={15} />
              {savingSettings ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          )}
        </div>
      </form>

      <section className="rtw-card" style={{ marginBottom: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderTree size={18} color="#d4af37" />
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>
                Catálogo Maestro de Categorías ({categories.length})
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Clasificación oficial utilizada en productos, inventario y reportes financieros.
              </p>
            </div>
          </div>
          <span className="rtw-badge rtw-badge-success">
            <CheckCircle2 size={13} />
            {categories.filter((c) => c.is_active).length} activas
          </span>
        </div>

        {canEditCategories && (
          <form
            onSubmit={(e) => void handleCreateOrUpdateCategory(e)}
            className="rtw-filter-bar"
            style={{ marginBottom: '16px' }}
          >
            <div className="rtw-field" style={{ flex: '0 1 160px' }}>
              <label className="rtw-label" htmlFor="cat-code-input">
                Código
              </label>
              <input
                id="cat-code-input"
                type="text"
                className="rtw-input"
                placeholder="Ej. AUDIO"
                value={catCode}
                onChange={(e) => setCatCode(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className="rtw-field" style={{ flex: '1 1 220px' }}>
              <label className="rtw-label" htmlFor="cat-name-input">
                Nombre de Categoría
              </label>
              <input
                id="cat-name-input"
                type="text"
                className="rtw-input"
                placeholder="Ej. Audio / Auriculares TWS"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                required
              />
            </div>

            <div className="rtw-field" style={{ flex: '1 1 240px' }}>
              <label className="rtw-label" htmlFor="cat-desc-input">
                Descripción (opcional)
              </label>
              <input
                id="cat-desc-input"
                type="text"
                className="rtw-input"
                placeholder="Detalle operativo de la línea"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="rtw-btn rtw-btn-primary"
              disabled={savingCategory}
            >
              <Plus size={15} />
              {savingCategory ? 'Guardando...' : 'Agregar / Actualizar'}
            </button>
          </form>
        )}

        <DataTable
          columns={categoryColumns}
          data={categories}
          rowKey={(row) => row.id}
          pageSize={10}
          mobileTitle={(row) => `${row.code} — ${row.name}`}
          emptyTitle="Sin categorías registradas"
          emptyDescription="Crea la primera categoría desde el formulario superior para clasificar tus productos."
        />
      </section>
    </div>
  );
}
