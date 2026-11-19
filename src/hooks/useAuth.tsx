import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  fetchUserProfileById,
  recordSecurityEvent,
  signInWithEmailPassword,
  signOutCurrentSession
} from '../services/authService';
import { useOwnerScope } from './useOwnerScope';
import type {
  AuthStatus,
  SecurityAuditEvent,
  UserProfile,
  UserRole
} from '../types/domain';

interface AuthContextValue {
  authStatus: AuthStatus;
  userProfile: UserProfile | null;
  activeEffectiveRole: UserRole;
  activeRolePreview: UserRole | null;
  canInspectRoles: boolean;
  setActiveRolePreview: (role: UserRole | null) => void;
  isSupabaseReady: boolean;
  securityEvents: SecurityAuditEvent[];
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  triggerSessionExpiredSimulation: () => void;
  restoreExpiredSessionSimulation: () => void;
  appendSecurityEvents: (events: SecurityAuditEvent[]) => void;
  logGuardEvent: (params: {
    eventType: string;
    targetResource: string;
    outcome: 'ALLOWED' | 'BLOCKED';
    reason: string;
    dbEnforcementLayer: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setSelectedOwnerScope } = useOwnerScope();
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? 'LOADING' : 'UNAUTHENTICATED'
  );
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeRolePreview, setActiveRolePreviewState] =
    useState<UserRole | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityAuditEvent[]>(
    []
  );
  const passwordRecoveryPendingRef = useRef(
    typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
  );

  // Solo un administrador real autenticado puede previsualizar permisos de otro rol en UI.
  const canInspectRoles =
    authStatus === 'AUTHENTICATED' && userProfile?.role === 'ADMIN';

  const setActiveRolePreview = useCallback(
    (role: UserRole | null) => {
      if (userProfile?.role !== 'ADMIN') {
        setActiveRolePreviewState(null);
        return;
      }
      setActiveRolePreviewState((prev) => {
        if (prev === 'OWNER' && role !== 'OWNER') {
          setSelectedOwnerScope('ALL');
        }
        return role;
      });
    },
    [userProfile?.role, setSelectedOwnerScope]
  );

  const activeEffectiveRole: UserRole =
    canInspectRoles && activeRolePreview
      ? activeRolePreview
      : userProfile?.role ?? 'OWNER';

  const appendSecurityEvents = useCallback((events: SecurityAuditEvent[]) => {
    setSecurityEvents((prev) => [...events, ...prev].slice(0, 60));
  }, []);

  const logGuardEvent = useCallback(
    async (params: {
      eventType: string;
      targetResource: string;
      outcome: 'ALLOWED' | 'BLOCKED';
      reason: string;
      dbEnforcementLayer: string;
    }) => {
      const evt = await recordSecurityEvent({
        actorId: userProfile?.id ?? 'unauthenticated-session',
        actorRole:
          authStatus === 'SESSION_EXPIRED'
            ? 'EXPIRED_SESSION'
            : canInspectRoles && activeRolePreview
              ? activeRolePreview
              : userProfile?.role ?? 'UNAUTHENTICATED',
        eventType: params.eventType,
        targetResource: params.targetResource,
        outcome: params.outcome,
        reason: params.reason,
        dbEnforcementLayer: params.dbEnforcementLayer
      });
      setSecurityEvents((prev) => [evt, ...prev].slice(0, 60));
    },
    [userProfile, authStatus, canInspectRoles, activeRolePreview]
  );

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setAuthStatus('UNAUTHENTICATED');
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (passwordRecoveryPendingRef.current) {
        setAuthStatus('PASSWORD_RECOVERY');
        return;
      }
      if (error || !data.session) {
        setAuthStatus('UNAUTHENTICATED');
        return;
      }

      const expiresAtMs = (data.session.expires_at ?? 0) * 1000;
      if (expiresAtMs > 0 && expiresAtMs < Date.now()) {
        setUserProfile(null);
        setActiveRolePreviewState(null);
        setSelectedOwnerScope('ALL');
        setAuthStatus('SESSION_EXPIRED');
        return;
      }

      const { profile } = await fetchUserProfileById(
        data.session.user.id,
        data.session.user.email ?? ''
      );
      if (!mounted) return;

      if (profile && profile.isActive) {
        setUserProfile(profile);
        setAuthStatus('AUTHENTICATED');
      } else {
        await signOutCurrentSession();
        setUserProfile(null);
        setActiveRolePreviewState(null);
        setSelectedOwnerScope('ALL');
        setAuthStatus('UNAUTHENTICATED');
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'PASSWORD_RECOVERY') {
          passwordRecoveryPendingRef.current = true;
          setAuthStatus('PASSWORD_RECOVERY');
          return;
        }

        if (event === 'SIGNED_OUT' || !session) {
          passwordRecoveryPendingRef.current = false;
          setUserProfile(null);
          setActiveRolePreviewState(null);
          setSelectedOwnerScope('ALL');
          setAuthStatus((prev) =>
            prev === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED'
          );
          return;
        }

        if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          if (event === 'USER_UPDATED') {
            passwordRecoveryPendingRef.current = false;
          }
          if (passwordRecoveryPendingRef.current) {
            setAuthStatus('PASSWORD_RECOVERY');
            return;
          }
          const { profile } = await fetchUserProfileById(
            session.user.id,
            session.user.email ?? ''
          );
          if (!mounted) return;
          if (profile && profile.isActive) {
            setUserProfile(profile);
            setAuthStatus('AUTHENTICATED');
          } else {
            await signOutCurrentSession();
            setUserProfile(null);
            setActiveRolePreviewState(null);
            setSelectedOwnerScope('ALL');
            setAuthStatus('UNAUTHENTICATED');
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [setSelectedOwnerScope]);

  const signIn = useCallback(async (email: string, password: string) => {
    passwordRecoveryPendingRef.current = false;
    const { profile, error } = await signInWithEmailPassword(email, password);
    if (error || !profile) {
      return { error: error ?? 'No fue posible iniciar sesión.' };
    }
    if (!profile.isActive) {
      await signOutCurrentSession();
      return {
        error:
          'Su cuenta está registrada pero permanece inactiva hasta que un administrador habilite su acceso en el sistema.'
      };
    }
    setUserProfile(profile);
    setActiveRolePreviewState(null);
    setSelectedOwnerScope('ALL');
    setAuthStatus('AUTHENTICATED');
    return { error: null };
  }, [setSelectedOwnerScope]);

  const signOut = useCallback(async () => {
    passwordRecoveryPendingRef.current = false;
    await signOutCurrentSession();
    setUserProfile(null);
    setActiveRolePreviewState(null);
    setSelectedOwnerScope('ALL');
    setAuthStatus('UNAUTHENTICATED');
  }, [setSelectedOwnerScope]);

  const triggerSessionExpiredSimulation = useCallback(() => {
    setAuthStatus('SESSION_EXPIRED');
    void logGuardEvent({
      eventType: 'SESSION_EXPIRED_DETECTED',
      targetResource: 'auth.session',
      outcome: 'BLOCKED',
      reason:
        'Sesión expirada o invalidada. Todas las rutas y operaciones sensibles quedan bloqueadas hasta reautenticar.',
      dbEnforcementLayer: 'Supabase Auth JWT'
    });
  }, [logGuardEvent]);

  const restoreExpiredSessionSimulation = useCallback(() => {
    // Exige reautenticación real en Supabase Auth; nunca restaura acceso sin credenciales.
    void signOut();
  }, [signOut]);

  return (
    <AuthContext.Provider
      value={{
        authStatus,
        userProfile,
        activeEffectiveRole,
        activeRolePreview,
        canInspectRoles,
        setActiveRolePreview,
        isSupabaseReady: isSupabaseConfigured,
        securityEvents,
        signIn,
        signOut,
        triggerSessionExpiredSimulation,
        restoreExpiredSessionSimulation,
        appendSecurityEvents,
        logGuardEvent
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe utilizarse dentro de un AuthProvider');
  }
  return ctx;
}
