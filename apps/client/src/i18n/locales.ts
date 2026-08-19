/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which languages the app reads in, and how a handset's own setting maps onto
 * them.
 *
 * Kept in its own module, apart from both the dictionaries and the React hook,
 * so that `theme.ts` — which every screen in the app imports — can take the
 * `Locale` type and the number formats without dragging five dictionaries and
 * React through the module graph behind them.
 */

export type Locale = 'en' | 'tw' | 'gaa' | 'ee' | 'fr';

/** In the order the picker shows them: English first, then Ghana, then French. */
export const LOCALES: Locale[] = ['en', 'tw', 'gaa', 'ee', 'fr'];

/**
 * What to call each language on screen.
 *
 * `name` is the endonym — what speakers call the language themselves — because
 * a list of languages written in a language you cannot read is not a list you
 * can choose from. `english` sits under it for the same reason in reverse: a
 * customer who has landed in the wrong one needs to find their way back out.
 */
export const LOCALE_LABELS: Record<Locale, { name: string; english: string }> = {
  en: { name: 'English', english: 'English' },
  tw: { name: 'Twi', english: 'Twi · Akan' },
  gaa: { name: 'Gã', english: 'Ga' },
  ee: { name: 'Eʋegbe', english: 'Ewe' },
  fr: { name: 'Français', english: 'French' },
};

/**
 * `ak-GH` -> `tw`. Anything we do not publish reads as English.
 *
 * Split off from {@link deviceLocale} so the mapping can be exercised without a
 * device to set the language on.
 */
export function localeFromTag(tag: string): Locale {
  const primary = tag.toLowerCase().split(/[-_]/)[0] ?? '';

  switch (primary) {
    case 'fr':
      return 'fr';
    // Twi is a dialect of Akan and `ak` is the code for the macrolanguage, so a
    // handset set to Akan is asking for the one Akan dictionary we have.
    case 'ak':
    case 'tw':
    case 'twi':
      return 'tw';
    case 'gaa':
      return 'gaa';
    case 'ee':
      return 'ee';
    default:
      return 'en';
  }
}

/**
 * The handset's language, as one of ours.
 *
 * Read through `Intl` rather than through `expo-localization`. The dependency
 * would give a more precise answer than this one; in this product it would not
 * give a *different* answer. A phone sold in Ghana reports `en-GH` whether or
 * not the person holding it reads Twi, so detection lands on English for very
 * nearly every customer however it is read — the picker in settings is what
 * actually moves somebody into Twi, Ga or Ewe, and that is the mechanism worth
 * getting right.
 *
 * A runtime without `Intl` therefore costs nothing: English is where detection
 * was going anyway.
 */
export function deviceLocale(): Locale {
  try {
    return localeFromTag(Intl.DateTimeFormat().resolvedOptions().locale ?? '');
  } catch {
    return 'en';
  }
}

/**
 * The language to actually render in.
 *
 * Takes `Locale | 'system'` rather than importing `LocalePreference`, which is
 * the same union — the preferences store is a React module, and this one is
 * deliberately not.
 */
export function resolveLocale(preference: Locale | 'system'): Locale {
  return preference === 'system' ? deviceLocale() : preference;
}

/**
 * The BCP 47 tag to hand `Intl` for dates and times.
 *
 * Only French gets its own. `Intl` carries no date data for Twi, Ga or Ewe — no
 * runtime we ship on does — so those three format on `en-GH`, which is what
 * Ghana writes dates in anyway. The consequence is visible and worth stating: a
 * customer reading the app in Twi still sees `Tue, 11 Aug`. Akan day names
 * (Dwoada, Benada, Wukuada…) are well established and would be a good thing for
 * a native speaker to add later; inventing month names is not.
 *
 * The tag is fixed per language rather than taken from the handset so that two
 * customers reading the same screen in the same language see the same thing.
 */
export function intlTag(locale: Locale): string {
  return locale === 'fr' ? 'fr-FR' : 'en-GH';
}
