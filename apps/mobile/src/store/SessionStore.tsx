/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useMemo, useState } from 'react';

interface SessionState {
  isAuthenticated: boolean;
  /** Whether Face ID is registered for this device — toggled from Profile. */
  biometricEnabled: boolean;
  signIn: () => void;
  signOut: () => void;
  /** Locks the console without dropping the rider profile. */
  lock: () => void;
  setBiometricEnabled: (enabled: boolean) => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(true);

  const value = useMemo<SessionState>(
    () => ({
      isAuthenticated,
      biometricEnabled,
      signIn: () => setIsAuthenticated(true),
      signOut: () => setIsAuthenticated(false),
      lock: () => setIsAuthenticated(false),
      setBiometricEnabled,
    }),
    [isAuthenticated, biometricEnabled]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
