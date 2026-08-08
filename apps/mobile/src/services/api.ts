/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Constants from 'expo-constants';
import { createClient } from '@freshfold/core';

/**
 * The rider app's connection to the dispatch server.
 *
 * A phone cannot reach `localhost` on your laptop, so the address has to be a
 * LAN one. Rather than making that a setup step, the default is derived from
 * the Expo dev server the app was loaded from — which is running on the same
 * machine as the dispatch server in every normal development setup.
 */

const DEFAULT_PORT = 4000;

function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  // e.g. "192.168.1.42:8081" while running under Expo Go.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;

  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${DEFAULT_PORT}`;

  // Standalone build with nothing configured. Works in a simulator; a real
  // device needs EXPO_PUBLIC_API_URL set.
  return `http://localhost:${DEFAULT_PORT}`;
}

export const API_BASE_URL = resolveBaseUrl();

export const api = createClient({ baseUrl: API_BASE_URL, timeoutMs: 6000 });

/** The rider this device signs in as. */
export const RIDER_ID = 'FF-R-204';
