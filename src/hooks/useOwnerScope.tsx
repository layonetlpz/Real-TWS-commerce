import { createContext, useContext, useState, type ReactNode } from 'react';
import type { OwnerScope } from '../types/domain';

interface OwnerScopeContextValue {
  selectedOwnerScope: OwnerScope;
  setSelectedOwnerScope: (scope: OwnerScope) => void;
}

const OwnerScopeContext = createContext<OwnerScopeContextValue | undefined>(
  undefined
);

export function OwnerScopeProvider({ children }: { children: ReactNode }) {
  const [selectedOwnerScope, setSelectedOwnerScope] =
    useState<OwnerScope>('ALL');

  return (
    <OwnerScopeContext.Provider
      value={{ selectedOwnerScope, setSelectedOwnerScope }}
    >
      {children}
    </OwnerScopeContext.Provider>
  );
}

export function useOwnerScope(): OwnerScopeContextValue {
  const ctx = useContext(OwnerScopeContext);
  if (!ctx) {
    throw new Error(
      'useOwnerScope debe utilizarse dentro de un OwnerScopeProvider'
    );
  }
  return ctx;
}
