/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TranslationKey } from './en';

/**
 * Ga (Gã).
 *
 * **Nearly empty, and that is the honest state of it. It needs a native speaker
 * before it is worth anything.**
 *
 * My Ga is not good enough to draft a UI in, so this file carries only the few
 * words I am not guessing at, and everything else falls back to English key by
 * key. That is a deliberate choice rather than an unfinished one: a Ga-speaking
 * customer picking this option today gets an app that is almost entirely in
 * English, which is legible and which the settings screen warns them about — the
 * alternative was thirty invented phrases in a language somebody actually reads,
 * where a wrong word about a wallet balance is a real problem rather than a
 * cosmetic one.
 *
 * The picker still offers Ga, on purpose. It is the hook the translation hangs
 * on, and the entry costs one file.
 *
 * What a translator should be handed first, in order: `settings.*` titles and
 * buttons, then the `settings.danger.*` block, then the `address.*` sheet.
 *
 * `settings.danger.confirmWord` must stay absent so the word to type remains
 * `DELETE` — it has to match what the code compares against.
 */
export const gaa: Partial<Record<TranslationKey, string>> = {
  'settings.details.name': 'Gbɛi',
  'settings.language.title': 'Wiemɔ',
  'address.label': 'Gbɛi',
  'address.city': 'Maŋ',
  'address.cityPlaceholder': 'Kumasi',
};
