import { useEffect, useState } from 'react';
import { KeyRound, Lock, Mail, ShieldCheck, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import {
  requestPasswordRecovery,
  updateAuthenticatedUserPassword
} from '../../services/authService';
import { isValidEmailFormat } from '../../utils/validations';
import { SegmentedTabs } from '../../components/glass';
import { RealTwsPlaqueBanner } from '../../design-system/components/RealTwsBrandMark';

type AuthMode = 'LOGIN' | 'RECOVERY' | 'UPDATE_PASSWORD';

interface AuthPortalCardProps {
  initialMode?: AuthMode;
  authenticatedOnly?: boolean;
}

export function AuthPortalCard({
  initialMode = 'LOGIN',
  authenticatedOnly = false
}: AuthPortalCardProps) {
  const { authStatus, signIn, isSupabaseReady } = useAuth();
  const { notify } = useNotifications();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const allowPasswordUpdate =
    authenticatedOnly ||
    authStatus === 'AUTHENTICATED' ||
    authStatus === 'PASSWORD_RECOVERY';

  const visibleTabs = authenticatedOnly
    ? [{ id: 'UPDATE_PASSWORD' as const, label: 'Nueva clave', icon: <KeyRound size={13} /> }]
    : [
        { id: 'LOGIN' as const, label: 'Entrar', icon: <Lock size={13} /> },
        { id: 'RECOVERY' as const, label: 'Recuperar', icon: <Mail size={13} /> },
        ...(allowPasswordUpdate
          ? [{ id: 'UPDATE_PASSWORD' as const, label: 'Nueva clave', icon: <KeyRound size={13} /> }]
          : [])
      ];

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);
    if (!isValidEmailFormat(email)) {
      setErrorMessage('Ingresa un correo electrónico válido.');
      return;
    }
    if (!password) {
      setErrorMessage('Ingresa tu contraseña.');
      return;
    }
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
    if (!isValidEmailFormat(email)) {
      setErrorMessage('Ingresa un correo electrónico válido.');
      return;
    }
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
    if (newPassword.length < 8) {
      setErrorMessage('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Las contraseñas ingresadas no coinciden.');
      return;
    }
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
    setConfirmPassword('');
    notify('success', 'Contraseña actualizada', msg);
  };

  return (
    <div className="rtw-card rtw-auth-card rtw-glass-elevated rtw-card-gold-top">
      {!authenticatedOnly && (
        <div style={{ marginBottom: '16px' }}>
          <RealTwsPlaqueBanner compact />
        </div>
      )}
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
            <ShieldCheck size={20} color="#e8c766" aria-hidden="true" />
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.14rem', fontWeight: 800, color: 'var(--rtw-text-primary)' }}>
              {mode === 'LOGIN' && 'Iniciar sesión'}
              {mode === 'RECOVERY' && 'Recuperar acceso'}
              {mode === 'UPDATE_PASSWORD' && 'Nueva contraseña'}
            </h1>
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

      {visibleTabs.length > 1 && (
        <div style={{ marginBottom: '18px' }}>
          <SegmentedTabs<AuthMode>
            value={mode}
            onChange={(next) => {
              setMode(next);
              setErrorMessage(null);
              setFeedbackMessage(null);
            }}
            items={visibleTabs}
          />
        </div>
      )}

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
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="rtw-input"
                  style={{ paddingRight: '44px' }}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword((prev) => !prev)}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '34px',
                    height: '34px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--rtw-text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="rtw-btn rtw-btn-primary"
              style={{ width: '100%', marginTop: '4px' }}
              disabled={submitting}
            >
              <Lock size={15} aria-hidden="true" />
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
                autoComplete="new-password"
                required
              />
            </div>

            <div className="rtw-field">
              <label className="rtw-label" htmlFor="auth-confirm-password">
                Confirmar contraseña
              </label>
              <input
                id="auth-confirm-password"
                type="password"
                className="rtw-input"
                placeholder="Repite la nueva contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
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
          role="alert"
          aria-live="polite"
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
          role="status"
          aria-live="polite"
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
          <CheckCircle2 size={16} aria-hidden="true" />
          {feedbackMessage}
        </div>
      )}
    </div>
  );
}
