/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform, TextStyle } from 'react-native';

/**
 * Brand palette for the rider console.
 *
 * These accents are deliberately *not* the same hex values as the website's
 * (`apps/web/src/index.css`): sage is `#6F7A63` here against ivory, `#5A5A40`
 * there against near-black. Same brand role, tuned for opposite backgrounds —
 * lifting one set into the shared package would break contrast on whichever
 * surface lost. The colours to keep in step are the *roles*, not the values.
 */
export const colors = {
  bgIvory: '#FAF9F6',
  bgLinen: '#F3F1EC',
  cardPure: '#FFFFFF',

  textCharcoal: '#1F1F1F',
  textSlate: '#6B7280',
  borderSoft: '#E5E7EB',

  brandSage: '#6F7A63',
  brandStone: '#D8D3CC',
  brandGold: '#C5A46D',

  statusSuccess: '#4F8A5B',
  statusWarning: '#C89B4A',
  statusError: '#B85C5C',
  statusInfo: '#5D7A8A',
} as const;

/**
 * Translucent variants. React Native has no `bg-brand-sage/10` shorthand, so the
 * handful of tints used across the app are pre-mixed here.
 */
export const tints = {
  sage05: 'rgba(111, 122, 99, 0.05)',
  sage10: 'rgba(111, 122, 99, 0.10)',
  sage15: 'rgba(111, 122, 99, 0.15)',
  sage20: 'rgba(111, 122, 99, 0.20)',
  sage30: 'rgba(111, 122, 99, 0.30)',
  gold05: 'rgba(197, 164, 109, 0.05)',
  gold15: 'rgba(197, 164, 109, 0.15)',
  gold30: 'rgba(197, 164, 109, 0.30)',
  success10: 'rgba(79, 138, 91, 0.10)',
  success30: 'rgba(79, 138, 91, 0.30)',
  error05: 'rgba(184, 92, 92, 0.05)',
  error20: 'rgba(184, 92, 92, 0.20)',
  error30: 'rgba(184, 92, 92, 0.30)',
  stone30: 'rgba(216, 211, 204, 0.45)',
  scrim: 'rgba(0, 0, 0, 0.55)',
  scrimDeep: 'rgba(0, 0, 0, 0.78)',
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
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
 * The web build loaded Inter / Manrope / Space Grotesk from Google Fonts. On
 * device we stay on the platform UI font (San Francisco / Roboto) and carry the
 * brand's character through weight and letter-spacing instead — no font files to
 * bundle, no flash of unstyled text.
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
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textSlate,
  } as TextStyle,
  display: {
    fontWeight: '800',
    letterSpacing: 0.2,
    color: colors.textCharcoal,
  } as TextStyle,
  body: {
    fontSize: 13,
    color: colors.textCharcoal,
  } as TextStyle,
  caption: {
    fontSize: 11,
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
 * Deliberately typed narrower than `ViewStyle`: these get spread into text and
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
      shadowColor: '#1F1F1F',
      shadowOpacity: 0.05,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
    android: { elevation: 1 },
    default: {},
  })!,
  md: Platform.select<Shadow>({
    ios: {
      shadowColor: '#1F1F1F',
      shadowOpacity: 0.1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 4 },
    default: {},
  })!,
  lg: Platform.select<Shadow>({
    ios: {
      shadowColor: '#1F1F1F',
      shadowOpacity: 0.18,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 10 },
    default: {},
  })!,
};

/** Fallback rider portrait, kept from the web build. */
export const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200';

/**
 * `navigating_to_pickup` -> `Navigating to pickup`. Re-exported from the shared
 * package so the rider console and the client portal label a status the same.
 */
export { humanizeStatus } from '@freshfold/core';

export function formatCedis(amount: number): string {
  return `GH₵ ${amount.toFixed(2)}`;
}

export function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
