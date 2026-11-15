import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode
} from 'react';
import type { ToastMessage } from '../types/domain';

interface NotificationContextValue {
  notifications: ToastMessage[];
  notify: (
    type: ToastMessage['type'],
    title: string,
    description: string
  ) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, description: string) => {
      const id = `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date();
      const timestamp = now.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      setNotifications((prev) => [
        { id, type, title, description, timestamp },
        ...prev.slice(0, 4)
      ]);
    },
    []
  );

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, notify, dismiss, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      'useNotifications debe utilizarse dentro de un NotificationProvider'
    );
  }
  return ctx;
}
