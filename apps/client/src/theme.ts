/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform, TextStyle } from 'react-native';

/**
 * Brand palette for the customer app.
 *
 * A third set of hex values, for the same reason the rider console has its own:
 * the website's sage (`#5A5A40`) is tuned for near-black, the rider console's
 * (`#6F7A63`) for ivory under daylight in a helmet. This app sits on warm linen
 * and leans a shade deeper so the accent still carries at arm's length indoors.
 * Keep the *roles* in step across surfaces, not the values.
 */
export const colors = {
  bgIvory: '#FAF9F6',
  bgLinen: '#F2EFE9',
  bgSand: '#EAE5DC',
  cardPure: '#FFFFFF',

  textCharcoal: '#1C1C1A',
  textSlate: '#6B6F68',
  textMuted: '#9A9E97',
  borderSoft: '#E6E3DC',

  brandSage: '#5A6B4F',
  brandSageDeep: '#3E4A37',
  brandStone: '#D5CFC4',
  brandGold: '#B58E4C',
  brandClay: '#A8674F',

  statusSuccess: '#4A7C54',
  statusWarning: '#BE8F3E',
  statusError: '#AE5252',
  statusInfo: '#546F80',
} as const;

/**
 * Translucent variants. React Native has no `bg-brand-sage/10` shorthand, so
 * every tint the app uses is pre-mixed here.
 */
export const tints = {
  sage05: 'rgba(90, 107, 79, 0.05)',
  sage08: 'rgba(90, 107, 79, 0.08)',
  sage12: 'rgba(90, 107, 79, 0.12)',
  sage18: 'rgba(90, 107, 79, 0.18)',
  sage25: 'rgba(90, 107, 79, 0.25)',
  sage40: 'rgba(90, 107, 79, 0.40)',
  gold08: 'rgba(181, 142, 76, 0.08)',
  gold18: 'rgba(181, 142, 76, 0.18)',
  gold35: 'rgba(181, 142, 76, 0.35)',
  success10: 'rgba(74, 124, 84, 0.10)',
  success30: 'rgba(74, 124, 84, 0.30)',
  warning10: 'rgba(190, 143, 62, 0.10)',
  warning30: 'rgba(190, 143, 62, 0.30)',
  error08: 'rgba(174, 82, 82, 0.08)',
  error25: 'rgba(174, 82, 82, 0.25)',
  info10: 'rgba(84, 111, 128, 0.10)',
  stone35: 'rgba(213, 207, 196, 0.35)',
  scrim: 'rgba(20, 20, 18, 0.55)',
  scrimDeep: 'rgba(20, 20, 18, 0.80)',
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 26,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * The website loads Inter / Manrope / Space Grotesk from Google Fonts. On
 * device we stay on the platform UI font and carry the brand's character
 * through weight and letter-spacing instead — no font files to bundle, no
 * flash of unstyled text on a cold start.
 */
export const fonts = {
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export const type = {
  /** Uppercase micro-labels used for section headers throughout the app. */
  overline: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.textSlate,
  } as TextStyle,
  display: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.textCharcoal,
  } as TextStyle,
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: colors.textCharcoal,
  } as TextStyle,
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textCharcoal,
  } as TextStyle,
  caption: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSlate,
  } as TextStyle,
  mono: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textSlate,
  } as TextStyle,
};

/**
 * Soft elevation used on cards and floating pills.
 *
 * Typed narrower than `ViewStyle` deliberately: these get spread into text and
 * input styles too, and a full `ViewStyle` drags in web-only properties that
 * `TextStyle` refuses.
 */
interface Shadow {
  shadowColor?: string;
  shadowOpacity?: number;
  shadowRadius?: number;
  shadowOffset?: { width: number; height: number };
  elevation?: number;
}

export const shadow: Record<'xs' | 'md' | 'lg', Shadow> = {
  xs: Platform.select<Shadow>({
    ios: {
      shadowColor: '#1C1C1A',
      shadowOpacity: 0.05,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 1 },
    default: {},
  })!,
  md: Platform.select<Shadow>({
    ios: {
      shadowColor: '#1C1C1A',
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 4 },
    default: {},
  })!,
  lg: Platform.select<Shadow>({
    ios: {
      shadowColor: '#1C1C1A',
      shadowOpacity: 0.2,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 14 },
    },
    android: { elevation: 12 },
    default: {},
  })!,
};

/** Fallback portrait for a courier with no avatar on their rider record. */
export const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200';

/**
 * `navigating_to_pickup` -> `Navigating to pickup`. Re-exported from the shared
 * package so the customer app and the rider console label a status identically.
 */
export { humanizeStatus } from '@freshfold/core';

export function formatCedis(amount: number): string {
  return `GH₵ ${amount.toFixed(2)}`;
}

export function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** `2026-08-11` -> `Tue, 11 Aug`. Falls back to the raw string if unparseable. */
export function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * A courier's display name.
 *
 * `RiderState` starts with blank identity fields and fills them from the
 * telemetry the rider app pushes on a timer, so a job can legitimately have a
 * courier assigned before their name has landed. A placeholder beats an empty
 * string with the separator still hanging off it.
 */
export function courierName(rider?: { name?: string }): string {
  return rider?.name?.trim() || 'Your courier';
}

/** `Honda PCX · GR 4821-24`, or an honest placeholder while telemetry is pending. */
export function courierVehicle(rider?: { vehicle?: string; vehiclePlate?: string }): string {
  const parts = [rider?.vehicle?.trim(), rider?.vehiclePlate?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Vehicle details pending';
}

/** Relative age for a timestamp, e.g. `4m ago`. */
export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
