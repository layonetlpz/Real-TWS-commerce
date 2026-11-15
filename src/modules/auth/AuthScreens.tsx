import { useState } from 'react';
import { KeyRound, Lock, Mail, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import {
  requestPasswordRecovery,
  updateAuthenticatedUserPassword
} from '../../services/authService';

type AuthMode = 'LOGIN' | 'RECOVERY' | 'UPDATE_PASSWORD';

interface AuthPortalCardProps {
  initialMode?: AuthMode;
}

export function AuthPortalCard({ initialMode = 'LOGIN' }: AuthPortalCardProps) {
  const { signIn, isSupabaseReady } = useAuth();
  const { notify } = useNotifications();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);
    setSubmitting(true);

    const { error } = await signIn(email, password);
    setSubmitting(false);

    if (error) {
      setErrorMessage(error);
      notify('error', 'Autenticación Rechazada', error);
      return;
    }

    notify(
      'success',
      'Sesión Iniciada',
      'Autenticación verificada mediante Supabase Auth y perfil RLS.'
    );
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);
    setSubmitting(true);

    const { error } = await requestPasswordRecovery(email);
    setSubmitting(false);

    if (error) {
      setErrorMessage(error);
      notify('error', 'Error en Recuperación', error);
      return;
    }

    const msg =
      'Se ha enviado el enlace de recuperación de contraseña al correo indicado mediante Supabase Auth.';
    setFeedbackMessage(msg);
    notify('info', 'Correo de Recuperación Enviado', msg);
  };

  const handleUpdatePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);
    setSubmitting(true);

    const { error } = await updateAuthenticatedUserPassword(newPassword);
    setSubmitting(false);

    if (error) {
      setErrorMessage(error);
      notify('error', 'No se pudo actualizar la contraseña', error);
      return;
    }

    const msg = 'Contraseña actualizada correctamente en Supabase Auth.';
    setFeedbackMessage(msg);
    setNewPassword('');
    notify('success', 'Contraseña Actualizada', msg);
  };

  return (
    <div
      className="rtw-card rtw-card-gold-top"
      style={{ maxWidth: '540px', margin: '0 auto' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={22} color="#d4af37" />
          <h2 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#111827' }}>
            {mode === 'LOGIN' && 'Acceso Oficial — REAL TWS Supabase Auth'}
            {mode === 'RECOVERY' && 'Recuperación de Contraseña'}
            {mode === 'UPDATE_PASSWORD' && 'Actualizar Contraseña de Seguridad'}
          </h2>
        </div>

        <span
          className={`rtw-badge ${
            isSupabaseReady ? 'rtw-badge-success' : 'rtw-badge-warning'
          }`}
        >
          {isSupabaseReady
            ? 'Supabase Auth Conectado'
            : 'Pendiente .env.local (Sin claves en código)'}
        </span>
      </div>

      <p style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '14px' }}>
        Seguridad estricta: <strong>Cero usuarios o contraseñas ficticias en producción</strong> y{' '}
        <strong>cero llaves secretas en el código fuente</strong>. Toda sesión valida su rol en{' '}
        <code>public.profiles</code> mediante Row Level Security (RLS).
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`rtw-btn ${mode === 'LOGIN' ? 'rtw-btn-primary' : 'rtw-btn-outline'}`}
          onClick={() => {
            setMode('LOGIN');
            setErrorMessage(null);
            setFeedbackMessage(null);
          }}
        >
          <Lock size={14} />
          Iniciar Sesión
        </button>
        <button
          type="button"
          className={`rtw-btn ${mode === 'RECOVERY' ? 'rtw-btn-primary' : 'rtw-btn-outline'}`}
          onClick={() => {
            setMode('RECOVERY');
            setErrorMessage(null);
            setFeedbackMessage(null);
          }}
        >
          <Mail size={14} />
          Recuperar Contraseña
        </button>
        <button
          type="button"
          className={`rtw-btn ${mode === 'UPDATE_PASSWORD' ? 'rtw-btn-primary' : 'rtw-btn-outline'}`}
          onClick={() => {
            setMode('UPDATE_PASSWORD');
            setErrorMessage(null);
            setFeedbackMessage(null);
          }}
        >
          <KeyRound size={14} />
          Cambiar Contraseña
        </button>
      </div>

      {mode === 'LOGIN' && (
        <form onSubmit={handleLoginSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="rtw-field">
              <label className="rtw-label" htmlFor="auth-login-email">
                Correo Electrónico Corporativo *
              </label>
              <input
                id="auth-login-email"
                type="email"
                className="rtw-input"
                placeholder="usuario@realtws.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="rtw-field">
              <label className="rtw-label" htmlFor="auth-login-password">
                Contraseña *
              </label>
              <input
                id="auth-login-password"
                type="password"
                className="rtw-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="rtw-btn rtw-btn-primary"
              disabled={submitting}
            >
              <Lock size={15} />
              {submitting ? 'Autenticando en Supabase...' : 'Iniciar Sesión Persistente'}
            </button>
          </div>
        </form>
      )}

      {mode === 'RECOVERY' && (
        <form onSubmit={handleRecoverySubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="rtw-field">
              <label className="rtw-label" htmlFor="auth-recovery-email">
                Correo Electrónico Registrado *
              </label>
              <input
                id="auth-recovery-email"
                type="email"
                className="rtw-input"
                placeholder="usuario@realtws.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="rtw-btn rtw-btn-primary"
              disabled={submitting}
            >
              <Mail size={15} />
              {submitting
                ? 'Enviando enlace...'
                : 'Enviar Enlace de Recuperación (Supabase Auth)'}
            </button>
          </div>
        </form>
      )}

      {mode === 'UPDATE_PASSWORD' && (
        <form onSubmit={handleUpdatePasswordSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="rtw-field">
              <label className="rtw-label" htmlFor="auth-new-password">
                Nueva Contraseña (Mínimo 8 caracteres) *
              </label>
              <input
                id="auth-new-password"
                type="password"
                className="rtw-input"
                placeholder="Nueva contraseña segura"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="rtw-btn rtw-btn-primary"
              disabled={submitting}
            >
              <KeyRound size={15} />
              {submitting ? 'Actualizando...' : 'Confirmar Nueva Contraseña'}
            </button>
          </div>
        </form>
      )}

      {errorMessage && (
        <div
          style={{
            marginTop: '14px',
            padding: '10px 12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            fontSize: '0.8rem',
            fontWeight: 600
          }}
        >
          {errorMessage}
        </div>
      )}

      {feedbackMessage && (
        <div
          style={{
            marginTop: '14px',
            padding: '10px 12px',
            backgroundColor: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '6px',
            color: '#166534',
            fontSize: '0.8rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <CheckCircle2 size={16} />
          {feedbackMessage}
        </div>
      )}
    </div>
  );
}
