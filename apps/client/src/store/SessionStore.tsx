/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as LocalAuthentication from 'expo-local-authentication';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, type UserAccount } from '@freshfold/core';
import { api } from '../services/api';
import { STORAGE_KEYS, readJson, readString, remove, writeJson, writeString } from '../services/storage';

/**
 * Who is signed in on this device.
 *
 * Credentials never live here. A sign-in posts the attempt to
 * `/api/auth/login`, which compares it server-side and returns a bearer token;
 * this store keeps the token and the profile, exactly as the website's store
 * does. The password is not retained after the request completes.
 *
 * The app is usable signed out — the marketing catalogue and the booking flow
 * both work for a visitor, matching the website, where a booking does not
 * require an account. `isGuest` is that state, and it is distinct from
 * "still restoring", so the router doesn't flash the sign-in screen on launch.
 */

export type SessionPhase = 'restoring' | 'guest' | 'authenticated';

interface SessionState {
  phase: SessionPhase;
  account: UserAccount | null;
  token: string | null;
  isAuthenticated: boolean;

  /** Whether the device can do Face ID / fingerprint at all. */
  biometricAvailable: boolean;
  /** Whether the customer has opted into it. */
  biometricEnabled: boolean;
  setBiometricEnabled: (enabled: boolean) => void;
  /** Prompts for the device biometric. Resolves false if it fails or is off. */
  promptBiometric: () => Promise<boolean>;

  signIn: (identifier: string, password: string) => Promise<UserAccount>;
  register: (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<UserAccount>;
  /** Does this contact already have a login? Lets the UI offer the right path. */
  checkContact: (identifier: string) => Promise<{ exists: boolean; hasPassword: boolean }>;
  /**
   * Mails a reset link to whatever address is on the account.
   *
   * Resolves the same way for a contact with no account as for one with a
   * password — the server refuses to distinguish them, so neither can this.
   * Rejects only when the request could not be made at all.
   */
  requestPasswordReset: (identifier: string) => Promise<void>;
  /**
   * Asks for another email-confirmation link.
   *
   * Rejects with the server's own message when the address is already
   * confirmed or the resend cooldown is still running, both of which are worth
   * showing the customer rather than flattening into "something went wrong".
   */
  resendVerification: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Continue without an account — bookings still work. */
  continueAsGuest: () => void;
  /** Local profile update, mirrored to `/api/accounts` by the client store. */
  applyAccount: (account: UserAccount) => void;
}

interface PersistedPreferences {
  biometricEnabled: boolean;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<SessionPhase>('restoring');
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

  // Restore on launch: the cached profile paints immediately, then the token is
  // re-validated. A token the server no longer honours drops the session rather
  // than leaving the app showing someone who is not really signed in.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [storedToken, storedAccount, prefs] = await Promise.all([
        readString(STORAGE_KEYS.token),
        readJson<UserAccount | null>(STORAGE_KEYS.account, null),
        readJson<PersistedPreferences>(STORAGE_KEYS.preferences, { biometricEnabled: false }),
      ]);

      if (cancelled) return;
      setBiometricEnabledState(prefs.biometricEnabled);

      if (!storedToken) {
        setPhase('guest');
        return;
      }

      setAccount(storedAccount);
      setToken(storedToken);

      try {
        const fresh = await api.me(storedToken);
        if (cancelled) return;
        setAccount(fresh);
        setPhase('authenticated');
        void writeJson(STORAGE_KEYS.account, fresh);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          setAccount(null);
          setToken(null);
          setPhase('guest');
          void remove(STORAGE_KEYS.token, STORAGE_KEYS.account);
        } else {
          // Server unreachable — keep the cached profile rather than signing
          // someone out every time their connection drops.
          setPhase(storedAccount ? 'authenticated' : 'guest');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [hasHardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!cancelled) setBiometricAvailable(hasHardware && enrolled);
    })().catch(() => {
      if (!cancelled) setBiometricAvailable(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback((next: { token: string; account: UserAccount }) => {
    setToken(next.token);
    setAccount(next.account);
    setPhase('authenticated');
    void writeString(STORAGE_KEYS.token, next.token);
    void writeJson(STORAGE_KEYS.account, next.account);
    return next.account;
  }, []);

  const signIn = useCallback<SessionState['signIn']>(
    async (identifier, password) => adopt(await api.login({ identifier, password })),
    [adopt]
  );

  const register = useCallback<SessionState['register']>(
    async (payload) => adopt(await api.register(payload)),
    [adopt]
  );

  const checkContact = useCallback<SessionState['checkContact']>(
    (identifier) => api.authStatus(identifier),
    []
  );

  const requestPasswordReset = useCallback<SessionState['requestPasswordReset']>(
    async (identifier) => {
      await api.requestPasswordReset(identifier);
    },
    []
  );

  const resendVerification = useCallback<SessionState['resendVerification']>(async () => {
    if (!token) throw new Error('Sign in to request a new link.');
    await api.resendVerification(token);
  }, [token]);

  const signOut = useCallback(async () => {
    const current = token;

    setAccount(null);
    setToken(null);
    setPhase('guest');
    await remove(STORAGE_KEYS.token, STORAGE_KEYS.account);

    if (current) {
      try {
        await api.logout(current);
      } catch {
        // Already signed out locally; a failed revoke just leaves a token to
        // expire on its own.
      }
    }
  }, [token]);

  const continueAsGuest = useCallback(() => setPhase('guest'), []);

  const applyAccount = useCallback((next: UserAccount) => {
    setAccount(next);
    void writeJson(STORAGE_KEYS.account, next);
  }, []);

  const setBiometricEnabled = useCallback((enabled: boolean) => {
    setBiometricEnabledState(enabled);
    void writeJson(STORAGE_KEYS.preferences, { biometricEnabled: enabled });
  }, []);

  const promptBiometric = useCallback(async () => {
    if (!biometricAvailable) return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock FreshFold',
        fallbackLabel: 'Use password',
      });
      return result.success;
    } catch {
      return false;
    }
  }, [biometricAvailable]);

  const value = useMemo<SessionState>(
    () => ({
      phase,
      account,
      token,
      isAuthenticated: phase === 'authenticated' && !!account,
      biometricAvailable,
      biometricEnabled,
      setBiometricEnabled,
      promptBiometric,
      signIn,
      register,
      checkContact,
      requestPasswordReset,
      resendVerification,
      signOut,
      continueAsGuest,
      applyAccount,
    }),
    [
      phase,
      account,
      token,
      biometricAvailable,
      biometricEnabled,
      setBiometricEnabled,
      promptBiometric,
      signIn,
      register,
      checkContact,
      requestPasswordReset,
      resendVerification,
      signOut,
      continueAsGuest,
      applyAccount,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
