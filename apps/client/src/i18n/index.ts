/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from 'react';
import { usePreferences } from '../store/PreferencesStore';
import { resolveLocale, type Locale } from './locales';
import { translate, type Translate } from './translate';

/**
 * Reading the app in one language.
 *
 * Scoped to this app on purpose. The customer-facing copy in
 * `src/data/catalogue.ts` is translated through this layer by id, but the
 * strings in `packages/core` are left in English: the desk console and the rider
 * app import the same package, and neither is being translated, so moving those
 * strings behind a lookup would put a Ghanaian-language dictionary in the way of
 * two English-only surfaces for no gain.
 *
 * Where a core string is customer-facing all the same — the phone-length
 * message is the one so far — the *logic* stays in core and the *wording* gets a
 * key here, which is what `settings.details.phoneLength` is.
 */
export function useT(): { t: Translate; locale: Locale } {
  const { locale: preference } = usePreferences();

  const locale = useMemo(() => resolveLocale(preference), [preference]);

  // Stable per language, so a screen that passes `t` into a `useMemo` or a
  // child's props does not re-render on every keystroke elsewhere.
  const t = useCallback<Translate>((key, values) => translate(locale, key, values), [locale]);

  return useMemo(() => ({ t, locale }), [t, locale]);
}

export {
  LOCALES,
  LOCALE_LABELS,
  deviceLocale,
  intlTag,
  localeFromTag,
  resolveLocale,
  type Locale,
} from './locales';
export { coverage, translate, type Translate, type TranslateValues } from './translate';
export type { TranslationKey } from './en';
