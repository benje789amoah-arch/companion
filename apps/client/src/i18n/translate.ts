/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { en, type TranslationKey } from './en';
import { ee } from './ee';
import { fr } from './fr';
import { gaa } from './gaa';
import { tw } from './tw';
import type { Locale } from './locales';

/**
 * Looking a string up, without React.
 *
 * Separate from the `useT` hook next door so that `theme.ts` can translate the
 * words inside `relativeTime` without every screen in the app importing React
 * through the palette it already imports.
 */

export type TranslateValues = Record<string, string | number>;
export type Translate = (key: TranslationKey, values?: TranslateValues) => string;

const DICTIONARIES: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  en,
  tw,
  gaa,
  ee,
  fr,
};

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * The string for this key in this language, falling back key by key.
 *
 * Key by key, not file by file: the Twi, Ga and Ewe dictionaries are partial on
 * purpose — they carry what has actually been translated and no more — so a
 * missing key has to fall through to English on its own rather than dropping the
 * whole language back. A half-translated screen is the honest picture of a
 * half-translated app, and it is legible; a screen of empty labels is not.
 *
 * An empty string counts as missing for the same reason: whatever put it there,
 * a blank label is never the intended answer.
 *
 * A placeholder with no value passed for it is left standing as `{name}`, which
 * is ugly on purpose — it shows up the moment the screen is opened, where a
 * silently dropped value would not.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: TranslateValues
): string {
  const template = DICTIONARIES[locale][key] || en[key];
  if (!values) return template;

  return template.replace(PLACEHOLDER, (whole, name: string) =>
    name in values ? String(values[name]) : whole
  );
}

/**
 * Keys that are meant to read the same in every language, and so do not count
 * against a dictionary's coverage.
 *
 * `settings.danger.confirmWord` is both the word the customer types and the word
 * the code compares against. Translating one half of that pair breaks the gate,
 * so every non-English file leaves it out on purpose — and a deliberate omission
 * should not make a finished language report as a draft.
 */
const UNTRANSLATED: TranslationKey[] = ['settings.danger.confirmWord'];

/**
 * How much of a language is written, as a fraction.
 *
 * Only used to decide whether the settings screen owes the customer a note
 * about the state of their language — a number nobody sees is easier to keep
 * true than a boolean somebody has to remember to flip.
 */
export function coverage(locale: Locale): number {
  const keys = (Object.keys(en) as TranslationKey[]).filter((key) => !UNTRANSLATED.includes(key));
  const dictionary = DICTIONARIES[locale];
  const written = keys.filter((key) => !!dictionary[key]).length;
  return written / keys.length;
}
