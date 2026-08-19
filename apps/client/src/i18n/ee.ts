/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TranslationKey } from './en';

/**
 * Ewe (Eʋegbe).
 *
 * **A draft, and deliberately incomplete. It needs a native speaker before
 * release.**
 *
 * Same rule as the Twi file: short labels and titles where the word is not in
 * doubt, nothing where it is. Everything absent falls back to English key by
 * key, which is why leaving a gap is safe and guessing is not — the paragraphs
 * this file does not carry are the ones that tell a customer what happens to
 * their wallet balance, and those have to be right rather than present.
 *
 * Notes a reviewer should check:
 *
 * - `Ɖoɖowo` for "Settings" — arrangements, plural.
 * - `Nɔƒe` for an address, i.e. a place of dwelling, rather than a loan of
 *   "address".
 * - `Kaƒomɔ` for the telephone, which is the standard Ewe word and not a loan.
 * - `Tutu` for delete, in the sense of erasing.
 * - Orthography: this file uses the Ewe letters `ƒ ɖ ʋ ɛ ɔ ŋ`. If a device
 *   renders them as boxes it is a font problem, not a spelling one.
 * - `settings.danger.confirmWord` is absent, so the word to type stays `DELETE`.
 */
export const ee: Partial<Record<TranslationKey, string>> = {
  // -------------------------------------------------------------- shared
  'common.back': 'Trɔ megbe',
  'common.remove': 'Ɖee ɖa',
  'common.add': 'Tsɔ kpe ɖe eŋu',
  'common.saving': 'Dzradzram ɖo…',
  'common.default': 'Vevitɔ',

  // ----------------------------------------------------------------- time
  //
  // Only "just now". The counted forms are left out rather than guessed at, so
  // they fall back to English.
  'time.justNow': 'fifi laa',

  // ------------------------------------------------------------------ aƒe
  //
  // The greetings are the ordinary Ewe ones rather than translations of the
  // English, which is why they are here when most of this screen is not.
  'home.greeting.morning': 'Ŋdi nyui',
  'home.greeting.afternoon': 'Ŋdɔ nyui',
  'home.greeting.evening': 'Fiẽ nyui',
  'home.greetingNamed': '{greeting}, {name}',

  'home.quick.wallet': 'Gakotoku',

  'home.why.title': 'Nu ka ta FreshFold',
  'home.contact.title': 'Ƒo nu na mí',

  // -------------------------------------------------------------- ɣeyiɣi
  //
  // The booking form, and only the words that stand on their own. The five step
  // names are left out as a set rather than half-done — they share one line above
  // a progress bar, and an English one after three Ewe ones reads as breakage.
  // The payment and plan paragraphs are left out because they are about money.
  'book.date.today': 'Egbe',
  'book.date.tomorrow': 'Etsɔ',

  'book.address.saved': 'Zã nɔƒe si wodzra ɖo',
  'book.picker.addresses': 'Nɔƒe siwo wodzra ɖo',

  /** `Katã` is "all of it", which is what a total is. */
  'book.summary.total': 'Katã',

  'book.continue': 'Yi edzi',

  // ----------------------------------------------------------- gakotoku
  //
  // The wallet, labels only. The payment, plan and gateway sentences are left in
  // English deliberately: they are what tells a customer whether their money
  // moved, and that has to be right rather than present.
  'wallet.title': 'Gakotoku',
  /** "The money that remains", which is what an available balance is. */
  'wallet.balance.label': 'Ga si susɔ',
  'wallet.balance.topUp': 'Tsɔ ga kpe ɖe eŋu',
  /** `Viɖe` is the benefit or the gain; `viɖewo` is the plural. */
  'wallet.tier.benefits': 'Wò viɖewo',
  'wallet.statement.emptyTitle': 'Naneke meli haɖe o',

  // ------------------------------------------------------------- settings
  'settings.title': 'Ɖoɖowo',

  'settings.details.name': 'Ŋkɔ',
  'settings.details.namePlaceholder': 'Wò ŋkɔ',
  'settings.details.phone': 'Kaƒomɔ',
  'settings.details.email': 'E-mail',
  'settings.details.save': 'Dzra tɔtrɔwo ɖo',

  'settings.addresses.title': 'Nɔƒewo',

  'settings.alerts.message': 'Gbedasiwo',

  'settings.language.title': 'Gbe',
  'settings.language.system': 'Dze kaƒomɔ sia yome',

  'settings.about.title': 'Mía ŋuti',
  'settings.about.call': 'Yɔ dɔwɔƒea',

  'settings.danger.title': 'Afɔku',
  'settings.danger.action': 'Tutu nye akɔnta',
  'settings.danger.deleting': 'Tutum…',
  'settings.danger.delete': 'Tutui keŋkeŋ',

  // -------------------------------------------------------------- akɔnta
  //
  // `Gakotoku` is the purse, which is what the wallet figure is. The other three
  // stat headings are absent for the reason the file header gives: a single word
  // over a number carries the whole meaning on its own, so a near-enough word is
  // worse there than an English one.
  'account.title': 'Akɔnta',
  'account.stats.wallet': 'Gakotoku',
  'account.addresses.title': 'Nɔƒe siwo wodzra ɖo',
  'account.help.title': 'Kpekpeɖeŋu',
  'account.signOut': 'Do go',

  // ------------------------------------------------------------- nɔƒewo
  'addresses.empty': 'Tsɔ wò nɔƒe gbãtɔ kpe ɖe eŋu',
  'addresses.edit': 'Trɔ asi le {label} ŋu',
  'addresses.remove': 'Ɖe {label} ɖa',
  'addresses.confirmRemove': 'Ɖe nɔƒe sia ɖa?',

  // -------------------------------------------------------- address sheet
  'address.add': 'Tsɔ nɔƒe kpe ɖe eŋu',
  'address.edit': 'Trɔ asi le nɔƒe ŋu',
  'address.label': 'Ŋkɔ',
  'address.address': 'Nɔƒe',
  'address.city': 'Du',
  'address.cityPlaceholder': 'Kumasi',
  'address.save': 'Dzra nɔƒe ɖo',
  'address.saveChanges': 'Dzra tɔtrɔwo ɖo',
};
