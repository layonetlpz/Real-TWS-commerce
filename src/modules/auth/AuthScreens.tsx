import { useState } from 'react';
import { KeyRound, Lock, Mail, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import {
  requestPasswordRecovery,
  updateAuthenticatedUserPassword
} from '../../services/authService';
import { SegmentedTabs } from '../../components/glass';

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
      notify('error', 'No se pudo iniciar sesión', error);
      return;
    }

    notify('success', 'Bienvenido a REAL TWS', 'Sesión iniciada correctamente.');
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
      notify('error', 'No se pudo enviar el enlace', error);
      return;
    }

    const msg = 'Te enviamos un enlace a tu correo para restablecer tu contraseña.';
    setFeedbackMessage(msg);
    notify('info', 'Enlace enviado', msg);
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

    const msg = 'Tu contraseña se actualizó correctamente.';
    setFeedbackMessage(msg);
    setNewPassword('');
    notify('success', 'Contraseña actualizada', msg);
  };

  return (
    <div className="rtw-card rtw-auth-card rtw-glass-elevated rtw-card-gold-top">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'linear-gradient(145deg, #161d29, #0b0f17)',
              border: '1px solid rgba(212, 175, 55, 0.45)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <ShieldCheck size={20} color="#e8c766" />
          </span>
          <div>
            <h2 style={{ fontSize: '1.14rem', fontWeight: 800, color: 'var(--rtw-text-primary)' }}>
              {mode === 'LOGIN' && 'Iniciar sesión'}
              {mode === 'RECOVERY' && 'Recuperar acceso'}
              {mode === 'UPDATE_PASSWORD' && 'Nueva contraseña'}
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--rtw-text-muted)' }}>
              {mode === 'LOGIN' && 'Accede a tu espacio de trabajo REAL TWS.'}
              {mode === 'RECOVERY' && 'Ingresa tu correo para recibir instrucciones.'}
              {mode === 'UPDATE_PASSWORD' && 'Elige una contraseña segura (mínimo 8 caracteres).'}
            </p>
          </div>
        </div>

        <span
          className={`rtw-badge ${isSupabaseReady ? 'rtw-badge-success' : 'rtw-badge-warning'}`}
        >
          {isSupabaseReady ? 'Listo' : 'Sin conexión'}
        </span>
      </div>

      <div style={{ marginBottom: '18px' }}>
        <SegmentedTabs<AuthMode>
          value={mode}
          onChange={(next) => {
            setMode(next);
            setErrorMessage(null);
            setFeedbackMessage(null);
          }}
          items={[
            { id: 'LOGIN', label: 'Entrar', icon: <Lock size={13} /> },
            { id: 'RECOVERY', label: 'Recuperar', icon: <Mail size={13} /> },
            { id: 'UPDATE_PASSWORD', label: 'Nueva clave', icon: <KeyRound size={13} /> }
          ]}
        />
      </div>

      {mode === 'LOGIN' && (
        <form onSubmit={handleLoginSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="rtw-field">
              <label className="rtw-label" htmlFor="auth-login-email">
                Correo electrónico
              </label>
              <input
                id="auth-login-email"
                type="email"
                className="rtw-input"
                placeholder="nombre@realtws.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="rtw-field">
              <label className="rtw-label" htmlFor="auth-login-password">
                Contraseña
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
              style={{ width: '100%', marginTop: '4px' }}
              disabled={submitting}
            >
              <Lock size={15} />
              {submitting ? 'Ingresando...' : 'Continuar'}
            </button>
          </div>
        </form>
      )}

      {mode === 'RECOVERY' && (
        <form onSubmit={handleRecoverySubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="rtw-field">
              <label className="rtw-label" htmlFor="auth-recovery-email">
                Correo registrado
              </label>
              <input
                id="auth-recovery-email"
                type="email"
                className="rtw-input"
                placeholder="nombre@realtws.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="rtw-btn rtw-btn-primary"
              style={{ width: '100%' }}
              disabled={submitting}
            >
              <Mail size={15} />
              {submitting ? 'Enviando...' : 'Enviar enlace'}
            </button>
          </div>
        </form>
      )}

      {mode === 'UPDATE_PASSWORD' && (
        <form onSubmit={handleUpdatePasswordSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="rtw-field">
              <label className="rtw-label" htmlFor="auth-new-password">
                Nueva contraseña
              </label>
              <input
                id="auth-new-password"
                type="password"
                className="rtw-input"
                placeholder="Mínimo 8 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="rtw-btn rtw-btn-primary"
              style={{ width: '100%' }}
              disabled={submitting}
            >
              <KeyRound size={15} />
              {submitting ? 'Guardando...' : 'Actualizar contraseña'}
            </button>
          </div>
        </form>
      )}

      {errorMessage && (
        <div
          style={{
            marginTop: '14px',
            padding: '10px 12px',
            backgroundColor: 'var(--rtw-danger-bg)',
            border: '1px solid var(--rtw-danger-border)',
            borderRadius: '10px',
            color: 'var(--rtw-danger-text)',
            fontSize: '0.82rem',
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
            backgroundColor: 'var(--rtw-success-bg)',
            border: '1px solid var(--rtw-success-border)',
            borderRadius: '10px',
            color: 'var(--rtw-success-text)',
            fontSize: '0.82rem',
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
