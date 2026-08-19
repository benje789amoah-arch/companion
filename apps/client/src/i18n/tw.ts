/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TranslationKey } from './en';

/**
 * Twi (Asante Twi).
 *
 * **A draft, and deliberately incomplete. It needs a native speaker before
 * release.**
 *
 * Only the strings I can render faithfully are here — labels, buttons, section
 * titles, the short sentences. The long explanatory paragraphs are *left out on
 * purpose*: the lookup falls back to English key by key, and an English sentence
 * a customer can read beats a Twi one that says something slightly different
 * about what happens to their money or their orders. Those paragraphs are the
 * ones to hand a translator first, and the settings screen tells the customer
 * plainly that the language is part-written.
 *
 * Notes on choices a reviewer should check:
 *
 * - `Nhyehyɛe` for "Settings" — the ordinary word for an arrangement, and what
 *   Akan-language software generally uses.
 * - `Titiriw` for the "Default" badge on an address, i.e. the main one, rather
 *   than a loan of the English computing sense.
 * - Loanwords kept where they are what people actually say: `Email`, `Telefon`,
 *   `Adres`, `akawnt`. Coining native replacements for these would read as
 *   stiffer, not clearer.
 * - `settings.danger.confirmWord` is absent, so the word to type stays `DELETE`.
 *   It has to match what the code compares against.
 */
export const tw: Partial<Record<TranslationKey, string>> = {
  // -------------------------------------------------------------- shared
  'common.back': 'San kɔ',
  'common.cancel': 'Gyae',
  'common.keep': 'Ma ɛnka',
  'common.remove': 'Yi fi hɔ',
  'common.add': 'Fa ka ho',
  'common.saving': 'Ɛrekora…',
  'common.sending': 'Ɛresoma…',
  'common.default': 'Titiriw',
  'common.signInCta': 'Hyɛn mu anaa bue akawnt',
  'common.guest': 'Wohwɛ sɛ ɔhɔhoɔ',
  'common.unreachable': 'Yɛantumi nnuru FreshFold so. Hwɛ wo intanɛt na sɔ hwɛ bio.',

  // ----------------------------------------------------------------- time
  //
  // `a atwam` is "that has passed". The units are the ordinary words: `simma`
  // for minutes, `dɔnhwere` for hours, `nna` for days. A reviewer should check
  // the numeral-then-noun order reads naturally — Akan counts the other way
  // round when the number is written out, but a digit is what fits a badge.
  'time.justNow': 'seisei ara',
  'time.minutes': 'simma {count} a atwam',
  'time.hours': 'dɔnhwere {count} a atwam',
  'time.days': 'nna {count} a atwam',

  // ---------------------------------------------------------------- fie so
  //
  // The greetings are the ordinary Akan ones and are not translations of the
  // English at all — `Maakye` is what you say in the morning, and the reply is
  // `Yaa agya` or `Yaa ɛna`. They are the one part of this screen I would put in
  // front of a customer without hesitation.
  'home.greeting.morning': 'Maakye',
  'home.greeting.afternoon': 'Maaha',
  'home.greeting.evening': 'Maadwo',
  'home.greetingNamed': '{greeting}, {name}',

  'home.live.label': 'Ɛrekɔ so',
  'home.live.assigning': 'Yɛrepɛ ɔsomafoɔ',
  'home.live.track': 'Hwɛ no seisei',

  'home.quick.book': 'Hyɛ berɛ',
  'home.quick.track': 'Di akyi',
  'home.quick.wallet': 'Sika kotokuo',

  'home.services.title': 'Yɛn nnwuma',
  'home.steps.title': 'Sɛdeɛ ɛyɛ adwuma',
  'home.why.title': 'Adɛn nti FreshFold',
  'home.contact.title': 'Kasa kyerɛ yɛn',

  // ------------------------------------------------------------ hyɛ berɛ
  //
  // The booking form, and only the words that are not in doubt. The five step
  // names are absent as a set rather than half-translated: they sit in one line
  // above a progress bar, and a row reading "Step 4 of 5 · Finishing" after
  // three Twi ones is worse than a row that is English throughout. Same for the
  // payment copy — a sentence about money that is nearly right is not right.
  'book.title': 'Hyɛ berɛ',
  'book.picker.service': 'Paw adwuma',

  'book.date.title': 'Da a yɛbɛba',
  'book.date.today': 'Ɛnnɛ',
  'book.date.tomorrow': 'Ɔkyena',

  'book.address.saved': 'Fa adres a wɔakora',
  'book.picker.addresses': 'Adres a wɔakora',

  /** `Ahwam` is the fragrance itself, which is what the choice is. */
  'book.scent.title': 'Ahwam',

  'book.summary.total': 'Nyinaa',

  'book.continue': 'Kɔ so',
  'book.confirm': 'Gye tom',

  'book.done.title': 'Wɔahyɛ berɛ',
  'book.done.another': 'Hyɛ bio',
  'book.done.track': 'Di akyi',

  // ------------------------------------------------------- sika kotokuo
  //
  // The wallet, and again only the labels. Everything this screen says about a
  // payment, a plan or a gateway is left in English on purpose — those sentences
  // decide whether a customer believes their money moved, and a nearly-right one
  // is worse than an English one they can read. `points` stays as it is; it is
  // the word people use for loyalty points either way.
  'wallet.title': 'Sika kotokuo',
  /** "The money you have", which is what an available balance is. */
  'wallet.balance.label': 'Sika a wowɔ',
  'wallet.balance.topUp': 'Fa sika ka ho',
  /** "Use it to book" — the button beside it, said as an action. */
  'wallet.balance.book': 'Fa hyɛ berɛ',
  'wallet.tier.lifetime': 'points nyinaa',
  /** `Mfasoɔ` is the benefit or the gain. */
  'wallet.tier.benefits': 'Mfasoɔ a wonya',
  'wallet.statement.emptyTitle': 'Biribiara nni hɔ',

  // ------------------------------------------------------------- settings
  'settings.title': 'Nhyehyɛe',

  'settings.details.title': 'Wo ho nsɛm',
  'settings.details.name': 'Din',
  'settings.details.namePlaceholder': 'Wo din',
  'settings.details.phone': 'Telefon',
  'settings.details.email': 'Email',
  'settings.details.save': 'Kora nsakraeɛ',
  'settings.details.saved': 'Wɔakora.',

  'settings.security.title': 'Ahobammɔ',
  'settings.security.biometric': 'Fa wo nsateaa bue',

  'settings.addresses.title': 'Adres ahodoɔ',

  'settings.alerts.title': 'Nkɔkɔbɔ',
  'settings.alerts.message': 'Nkrasɛm',

  'settings.language.title': 'Kasa',
  'settings.language.system': 'Di telefon yi akyi',

  'settings.about.title': 'Yɛn ho',
  'settings.about.version': 'App version',
  'settings.about.hours': 'Berɛ a yɛbue',
  'settings.about.call': 'Frɛ ɔfese hɔ',

  'settings.danger.title': 'Asiane',
  'settings.danger.action': 'Yi me akawnt fi hɔ',
  'settings.danger.confirmTitle': 'Yi wo akawnt fi hɔ?',
  'settings.danger.keep': 'Ma me akawnt nka hɔ',
  'settings.danger.deleting': 'Ɛreyi…',
  'settings.danger.delete': 'Yi koraa',

  // -------------------------------------------------------------- akawnt
  //
  // Of the four figures over the account tab only the wallet is here. `Points`
  // is the word people use for loyalty points either way, and I do not have a
  // rendering of "Spent" and "Orders" as column headings that I would put in
  // front of a customer — a heading over a number has to be exactly right,
  // because there is no sentence around it to recover the meaning from.
  'account.title': 'Akawnt',
  'account.notifications': 'Nkɔkɔbɔ',
  'account.guestName': 'Ɔhɔhoɔ',
  'account.stats.wallet': 'Sika kotokuo',
  'account.addresses.title': 'Adres a wɔakora',
  'account.help.title': 'Mmoa',
  'account.signOut': 'Fi mu',
  'account.signOutTitle': 'Fi mu?',
  'account.stay': 'Ma menka mu',

  // -------------------------------------------------------- adres ahodoɔ
  'addresses.empty': 'Fa wo adres a ɛdi kan ka ho',
  'addresses.edit': 'Sesa {label}',
  'addresses.remove': 'Yi {label} fi hɔ',
  'addresses.confirmRemove': 'Yi adres yi fi hɔ?',

  // -------------------------------------------------------- address sheet
  'address.add': 'Fa adres ka ho',
  'address.edit': 'Sesa adres',
  'address.label': 'Din',
  'address.address': 'Adres',
  'address.city': 'Kurow',
  'address.cityPlaceholder': 'Kumasi',
  'address.save': 'Kora adres',
  'address.saveChanges': 'Kora nsakraeɛ',
};
