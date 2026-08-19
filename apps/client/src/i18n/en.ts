/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * English, and the source of truth for what a key is.
 *
 * Every other dictionary is a `Partial` of this one, so this file decides which
 * keys exist and `TranslationKey` makes a typo in a `t()` call a build error
 * rather than a blank label on a screen.
 *
 * Conventions worth keeping to as this grows:
 *
 * - Keys are `screen.thing`, flat and dotted. A nested tree reads more neatly in
 *   the file and much worse at the call site, where what you want is to see the
 *   whole key at a glance.
 * - Placeholders are `{name}`, filled by the second argument to `t()`.
 * - Counted phrases get two keys and the call site picks — `orders.one` against
 *   `orders.many`. No plural machinery: Twi, Ga and Ewe do not inflect a noun
 *   for number the way English does, so a rule engine tuned to English would be
 *   deciding something the language does not ask about.
 * - The wording here is the wording that was already on the screen. This layer
 *   moves strings; it does not rewrite them.
 */

export const en = {
  // -------------------------------------------------------------- shared
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'common.keep': 'Keep',
  'common.remove': 'Remove',
  'common.add': 'Add',
  'common.saving': 'Saving…',
  'common.sending': 'Sending…',
  'common.default': 'Default',
  'common.signInCta': 'Sign in or create an account',
  /**
   * The primary call to action, said in two places — the home hero and the empty
   * orders list on the account tab. One key because it is one button going to
   * one place, and two copies of a button label is how they end up worded
   * differently in Twi.
   */
  'common.schedulePickup': 'Schedule a pickup',
  /** Said on both the account tab and the settings header. */
  'common.guest': 'Browsing as a guest',
  /** The one sentence for "the request never left the phone". */
  'common.unreachable': 'Could not reach FreshFold. Check your connection and try again.',
  /**
   * The badge that says this phone cannot see the server, worn on the wallet
   * header and in the connection pill in `ui.tsx`. One word, one meaning, one
   * key — the pill's other two states live beside it.
   */
  'common.offline': 'Offline',
  /** Stands in for a date or a figure the app does not have. */
  'common.blank': '—',

  // ----------------------------------------------------------------- time
  //
  // Read by `relativeTime` in `theme.ts`, which is why they are keys rather
  // than literals in that file. Deliberately coarse — the exact second a
  // courier's telemetry landed is not information anybody acts on.
  'time.justNow': 'just now',
  'time.minutes': '{count}m ago',
  'time.hours': '{count}h ago',
  'time.days': '{count}d ago',

  // -------------------------------------------------------------- courier
  //
  // Placeholders rather than labels. `RiderState` starts with blank identity
  // fields and fills them from the telemetry the rider app pushes on a timer, so
  // a job can legitimately have a courier assigned before their name lands.
  'courier.unnamed': 'Your courier',
  'courier.vehiclePending': 'Vehicle details pending',

  // ------------------------------------------------------------------ home
  //
  // The chrome of the home screen only. Everything the tab shows that comes out
  // of `src/data/catalogue.ts` — the eleven services, the four steps, the
  // reasons, the segments, the testimonials — is translated there by id, not
  // here, because those are records with an id and a picture attached rather
  // than loose strings.
  'home.greeting.morning': 'Good morning',
  'home.greeting.afternoon': 'Good afternoon',
  'home.greeting.evening': 'Good evening',
  /**
   * The greeting with a name on the end.
   *
   * A separate key rather than string concatenation, because the comma is not
   * where every language puts it and some would rather lead with the name.
   */
  'home.greetingNamed': '{greeting}, {name}',

  'home.live.label': 'In progress',
  'home.live.courier': '{name} · {vehicle}',
  'home.live.assigning': 'Assigning a courier',
  'home.live.track': 'Track live',
  /** Two keys and the call site picks, per the note at the top of this file. */
  'home.live.moreOne': '+1 more order running',
  'home.live.moreMany': '+{count} more orders running',

  /** The company name, and so the same in every language. */
  'home.hero.eyebrow': 'FreshFold Laundry Co.',
  // The break is deliberate — the line lands on "collected from your door" — and
  // a translation should put it wherever its own sentence divides.
  'home.hero.title': 'Boutique fabric care,\ncollected from your door.',
  'home.hero.body':
    'Hand-finished washing, pressing and specialist treatment across Kumasi — booked in a minute, tracked to the doorstep.',
  'home.hero.plans': 'Plans',

  'home.quick.book': 'Book',
  'home.quick.track': 'Track',
  'home.quick.wallet': 'Wallet',
  /** The concierge assistant's name, and so untranslated. */
  'home.quick.foldie': 'Foldie',

  'home.services.title': 'Our services',
  'home.services.caption': 'Priced up front. No surprises at the door.',

  'home.steps.title': 'How it works',
  'home.steps.caption': 'Four steps, start to closet.',

  'home.why.title': 'Why FreshFold',
  'home.why.caption': 'What you get that a laundrette doesn’t.',

  'home.segments.title': 'Built for',
  'home.segments.caption': 'Tap one to start a booking shaped around it.',

  'home.testimonials.title': 'From our patrons',

  'home.contact.title': 'Talk to us',
  'home.contact.caption': 'A person, not a form.',
  'home.contact.phoneCaption': 'Call the concierge desk',
  'home.contact.foldie': 'Ask Foldie',
  'home.contact.foldieCaption': 'Our concierge assistant, in-app',
  'home.contact.emailCaption': 'For contracts and invoicing',
  'home.contact.addressCaption': 'Where your garments are cared for',
  'home.contact.hoursCaption': 'Collection windows run to close',

  'home.footer': 'FreshFold Laundry Co. · Ayeduase-Kotei, Kumasi\nEvery order priced before you confirm.',

  // ------------------------------------------------------------------ book
  //
  // The five-step booking flow. The service names, the time slots, the scents,
  // the starch levels, the add-ons and the payment methods are all catalogue
  // records with ids, so they are translated in `src/data/catalogue.ts` and not
  // here — what is here is the form around them.
  //
  // Three of this screen's labels are borrowed rather than duplicated: the
  // address and city fields reuse `address.*` because they are the same two
  // fields the address sheet shows, and the phone field reuses
  // `settings.details.phone*` for the same reason. The phone-length complaint is
  // `settings.details.phoneLength`, which is where the logic in
  // `packages/core/src/phone.ts` gets its wording.
  /**
   * The screen's own title, not the button that opens it.
   *
   * `common.schedulePickup` says the same words in English, and they are still
   * two keys: one is an instruction to the customer and one is the name of a
   * screen, and plenty of languages phrase those differently even when English
   * does not.
   */
  'book.title': 'Schedule a pickup',
  'book.stepOf': 'Step {current} of {total} · {name}',
  'book.step.service': 'Service',
  'book.step.schedule': 'Schedule',
  'book.step.address': 'Address',
  'book.step.finishing': 'Finishing',
  'book.step.payment': 'Payment',

  'book.service.prompt': 'What needs care?',
  'book.service.helper':
    'Tap to change. Every service is quoted before you confirm, and the courier is complimentary on all of them.',
  'book.picker.service': 'Choose a service',

  'book.plan.coveredTitle': 'This pickup is included in your membership',
  'book.plan.title': 'Booked under your membership',
  'book.plan.coveredBody':
    'The laundry is already paid for — {left} of {total} pickups left this month. Add-ons are charged at your member rate, and the order is prioritised in dispatch.',
  'book.plan.rateBody':
    'Your included pickups are spent for this month, so this one is at your member rate. It is still prioritised in dispatch, and your allowance resets on {date}.',
  'book.plan.priorityBody': 'This order is prioritised in dispatch.',

  'book.date.title': 'Pickup date',
  'book.date.today': 'Today',
  /** Abbreviated to fit a 5-across row of date cells — so should a translation be. */
  'book.date.tomorrow': 'Tmrw',
  'book.date.field': 'Or type a date',
  /**
   * The shape of the date, not a date.
   *
   * The field is parsed as ISO whatever this says, so a translation renames the
   * letters — `AAAA-MM-JJ` in French — without reordering them.
   */
  'book.date.placeholder': 'YYYY-MM-DD',
  'book.date.hint': 'Delivery is scheduled for the following day.',
  'book.window.title': 'Collection window',

  'book.address.saved': 'Use a saved address',
  'book.picker.addresses': 'Saved addresses',
  'book.address.hint':
    'Include the block and room — this is what the courier reads at the door.',
  'book.address.save': 'Save this address for next time',

  'book.pin.title': 'Where should the courier knock?',
  'book.pin.intro':
    'An address is a sentence; a courier needs a point. Drop the pin on your gate or hostel entrance — it is what their navigation follows and what confirms their arrival.',

  'book.contact.title': 'Who should the courier ask for?',
  'book.contact.name': 'Full name',
  'book.contact.namePlaceholder': 'Ama Mensah',
  'book.contact.emailPlaceholder': 'you@example.com',
  'book.contact.emailHint':
    'Optional — but it is how we link this order to an account later.',

  'book.scent.title': 'Scent',
  'book.scent.noSurcharge': 'No surcharge',
  'book.starch.title': 'Starch on ironed items',
  'book.finish.noneTitle': 'No finishing options here',
  'book.finish.noneBody':
    'Scent and starch apply to garments. {service} is quoted on the work itself — add a note below if there is anything specific.',
  'book.addons.title': 'Specialist add-ons',
  'book.instructions.label': 'Care instructions',
  'book.instructions.placeholder': 'The navy blazer has a coffee stain on the left cuff.',
  'book.riderNote.label': 'Note for the courier',
  'book.riderNote.placeholder': 'Call when you reach the gate — the buzzer is broken.',
  'book.riderNote.hint': 'Shown on the courier’s job card, not to the laundry team.',

  'book.summary.title': 'Summary',
  'book.summary.service': 'Service',
  'book.summary.pickup': 'Pickup',
  'book.summary.address': 'Address',
  'book.summary.pin': 'Pickup pin',
  'book.summary.pinUnset': 'Not set',
  'book.summary.finish': 'Finish',
  'book.summary.finishValue': '{scent}, {starch} starch',
  'book.summary.addons': 'Add-ons',
  'book.summary.subtotal': 'Subtotal',
  /** Named when the plan is known, generic when the id no longer matches one. */
  'book.summary.planIncluded': '{plan} — pickup included',
  'book.summary.planFallback': 'Membership',
  'book.summary.memberRate': 'Member rate',
  'book.summary.tierDiscount': '{tier} discount',
  'book.summary.total': 'Total',
  /** A figure being taken off rather than added on. The dash is a minus sign, U+2212. */
  'book.summary.less': '− {amount}',

  'book.pay.title': 'How would you like to pay?',
  'book.pay.walletBalance': 'Balance {amount}',
  'book.pay.walletShort': 'Balance {amount} — not enough',
  'book.pay.paystackTitle': 'Paystack secure checkout',
  'book.pay.paystackBody':
    'Opens Paystack in a browser. Nothing about your card is entered in this app or stored by FreshFold.',
  'book.pay.open': 'Open checkout',
  'book.pay.reopen': 'Reopen checkout',
  'book.pay.verify': 'I have paid — verify',
  'book.pay.doorTitle': 'Settle at the door',
  'book.pay.doorBody':
    'The courier carries a card reader and accepts mobile money. Your order is confirmed either way.',
  /**
   * The gateway's own words, passed through.
   *
   * Paystack and the server answer in English and this app does not translate
   * their sentences — but the frame around them is ours, so a customer reading
   * in French is at least told what the English is about.
   */
  'book.pay.gateway': 'Payment gateway: {message}',
  'book.pay.gatewayUnreachable':
    'Could not reach the payment gateway. Check your connection, or choose Pay on Pickup.',
  'book.pay.finishOnPage': 'Finish on the Paystack page, then tap “I have paid” to verify.',
  'book.pay.browserFailed':
    'Could not open the checkout page here. Reference {reference} is live — open Paystack, pay, then tap “I have paid”.',
  'book.pay.confirmed': 'Payment confirmed.',
  'book.pay.pending': 'Paystack says: {status}. Complete the checkout and retry.',
  /** Stands in when the gateway answers without naming a state. */
  'book.pay.pendingStatus': 'pending',
  'book.pay.verifyUnreachable':
    'Could not reach FreshFold to confirm the payment. If you were charged, your funds are safe — tap “I have paid” again in a moment.',
  'book.pay.bookedThen': 'Pickup booked. {message}',
  'book.pay.bookedUnsettled':
    'Pickup booked, but we could not take the payment. Settle it from your wallet.',

  'book.error.date': 'Choose a pickup date.',
  'book.error.address': 'We need an address to collect from.',
  'book.error.pin': 'Set the pickup pin so the courier knows where to knock.',
  'book.error.name': 'Tell us who to ask for at the door.',
  'book.error.phone': 'A phone number lets the courier reach you.',
  'book.error.walletSignIn': 'Sign in to pay from your FreshFold wallet.',
  'book.error.walletShort': 'Your wallet holds {amount}. Choose another method or top up.',
  'book.error.save': 'Could not save that booking. It is queued and will send when you reconnect.',

  'book.quote.due': 'Total due',
  'book.quote.running': 'Running quote',
  'book.quote.before': '{amount} before your {reason}',
  'book.quote.reasonIncluded': 'included pickup',
  'book.quote.reasonBoth': 'member and tier rates',
  'book.quote.reasonMember': 'member rate',
  'book.quote.reasonTier': 'tier discount',
  'book.continue': 'Continue',
  'book.confirm': 'Confirm booking',

  'book.done.title': 'Booked',
  /**
   * One sentence in two keys, because the reference between them is bold.
   *
   * The split assumes the reference comes after the word for "reference", which
   * holds for the five languages here. A language that puts it elsewhere needs a
   * third arrangement, not a translation of these two.
   */
  'book.done.bodyBefore': 'Reference',
  'book.done.bodyAfter':
    'is on the dispatch board. A courier will accept it shortly and you can follow them from the Track tab.',
  'book.done.collection': 'Collection',
  'book.done.return': 'Return',
  'book.done.paid': 'Paid',
  'book.done.another': 'Book another',
  'book.done.track': 'Track it',

  // ---------------------------------------------------------------- wallet
  //
  // The wallet tab: the balance, the loyalty tier, the subscription and the
  // statement. The tier names and their benefits, the rewards and the plans are
  // catalogue and core records with ids, so they are translated by id and not
  // here — as are the words the server writes into a transaction's description,
  // method and status, which arrive on the wire in English.
  //
  // Two of this screen's strings are borrowed from the booking flow rather than
  // written again: `book.pay.gateway` frames a message Paystack wrote, and
  // `book.pay.reopen` labels the button that reopens a checkout. Both are the
  // same element doing the same job in both places.
  'wallet.title': 'Wallet',
  'wallet.locked.title': 'Sign in to use your wallet',
  'wallet.locked.body':
    'Your balance, loyalty points and membership are tied to your account, so they follow you to any device you sign in from.',

  'wallet.balance.label': 'Available balance',
  'wallet.balance.hint': 'Settles a booking instantly and earns a loyalty point per cedi.',
  'wallet.balance.topUp': 'Top up',
  'wallet.balance.book': 'Book with it',

  'wallet.tier.title': 'Membership',
  'wallet.tier.caption': 'Earned on everything you spend.',
  'wallet.tier.lifetime': 'lifetime points',
  'wallet.tier.toNext': '{points} points to {tier}',
  'wallet.tier.top': 'Top tier — every benefit unlocked.',
  'wallet.tier.benefits': 'Your benefits',
  'wallet.tier.discount':
    '{percent}% is taken off every quote before you confirm it — you never have to claim it.',

  'wallet.rewards.title': 'Spend your points',
  /** Read aloud by a screen reader; the visible label is the cost alone. */
  'wallet.rewards.redeem': 'Redeem {name} for {cost} care points',
  'wallet.rewards.cost': '{points} pts',
  'wallet.rewards.doneTitle': 'Redeemed',
  'wallet.rewards.doneBody': 'Your reward is on your account.',
  'wallet.rewards.failed': 'Could not redeem',

  'wallet.plan.title': 'Subscription',
  'wallet.plan.activeCaption': 'Active plan',
  'wallet.plan.caption': 'Regular laundry, one monthly price.',
  'wallet.plan.compare': 'Compare plans',
  /** `{when}` is one of the two keys below. */
  'wallet.plan.meta': '{left} of {total} pickups left · {when}',
  'wallet.plan.ends': 'ends {date}',
  'wallet.plan.renews': 'renews {date}',
  'wallet.plan.cancelled':
    'Cancelled. Your pickups and elite priority run until {date} — nothing more will be taken.',
  'wallet.plan.change': 'Change plan',
  /** The card's button and the confirmation dialog's safe answer, one key. */
  'wallet.plan.keep': 'Keep plan',
  /**
   * Short for cancelling the membership, on a button beside "Change plan" —
   * deliberately not `common.cancel`, which dismisses a sheet. A language that
   * cannot say both with one word should keep these two apart.
   */
  'wallet.plan.cancel': 'Cancel',
  'wallet.plan.cancelTitle': 'Cancel membership?',
  'wallet.plan.cancelBody':
    'Your plan stays active until {date} — included pickups and elite priority included — and nothing is taken after that. You can restart it any time.',
  'wallet.plan.cancelConfirm': 'Cancel membership',
  'wallet.plan.cancelFailedTitle': 'Could not cancel',
  'wallet.plan.cancelFailedBody':
    'FreshFold could not be reached. Your plan is unchanged — try again in a moment.',
  'wallet.plan.resumeFailedTitle': 'Could not restore',
  'wallet.plan.resumeFailedBody':
    'FreshFold could not be reached. Your plan still ends as scheduled — try again in a moment.',
  'wallet.plan.none': 'No active plan',
  'wallet.plan.from': 'From {price} a month, pickups included.',
  'wallet.plan.explore': 'Explore plans',

  'wallet.statement.title': 'Statement',
  'wallet.statement.caption': 'Every movement on this account.',
  'wallet.statement.emptyTitle': 'Nothing yet',
  'wallet.statement.emptyBody':
    'Top-ups, bookings and refunds all show up here with their reference.',

  'wallet.topUp.title': 'Top up your wallet',
  'wallet.topUp.body':
    'Paid through Paystack — MTN MoMo, Telecel Cash, AT Money, Visa or Mastercard. Funds land the moment the payment settles.',
  'wallet.topUp.after': 'Balance after payment',
  'wallet.topUp.pay': 'Pay {amount} with Paystack',
  'wallet.topUp.collect': 'I have paid — collect funds',
  'wallet.topUp.finishOnPage':
    'Finish on the Paystack page, then tap “I have paid” to collect the funds.',
  'wallet.topUp.browserFailed':
    'Could not open the checkout page here. Reference {reference} is live — pay on Paystack, then tap “I have paid”.',
  'wallet.topUp.confirmFailed':
    'Could not confirm the payment with FreshFold at {url}. If you were charged, your funds are safe — tap “I have paid” again once the server is reachable.',
  /**
   * The three ways a top-up can fail before Paystack has the payment, told
   * apart. `{url}` is the dispatch server's address — on a phone that is a LAN
   * address, and being wrong about it is the usual cause, so it is named rather
   * than described.
   */
  'wallet.gateway.unreachable':
    'Paystack was not contacted — the app cannot reach FreshFold at {url}. Check that the dispatch server is running and that this device is on the same network as it.',
  'wallet.gateway.timeout': 'FreshFold did not answer in time. Nothing was charged — try again.',
  'wallet.gateway.offline':
    'Could not reach FreshFold at {url}. Check that the dispatch server is running and that this device can see it.',

  // ------------------------------------------------------------- settings
  'settings.title': 'Settings',

  'settings.details.title': 'Your details',
  'settings.details.caption': 'What the courier and the desk see.',
  'settings.details.name': 'Name',
  'settings.details.namePlaceholder': 'Your name',
  'settings.details.phone': 'Phone',
  'settings.details.phonePlaceholder': '{digits} digits — e.g. 0550001234',
  'settings.details.phoneLength': 'A phone number is {digits} digits, e.g. 0244000000.',
  'settings.details.email': 'Email',
  'settings.details.emailHint': 'Your email is your account. The desk can move it — the app cannot.',
  'settings.details.nameBlank': 'Your name cannot be blank — the courier asks for it at the door.',
  'settings.details.save': 'Save changes',
  'settings.details.saved': 'Saved.',
  'settings.details.savedNewPhone':
    'Saved. Couriers will call the new number — and any pickup you booked as a guest on the old one will stop showing in your history.',
  'settings.details.failed':
    'Could not reach FreshFold, so nothing was changed. Check your connection and try again.',

  'settings.guestCard.title': 'Sign in to change your details',
  'settings.guestCard.body':
    'Your name, number and password live on the account, and so do your saved addresses — sign in and the ones below move with you, to the website and to any phone you use. The alert settings belong to this phone.',

  'settings.security.title': 'Security',
  'settings.security.biometric': 'Unlock with biometrics',
  'settings.security.biometricOn':
    'Use Face ID or your fingerprint instead of typing your password.',
  'settings.security.biometricOff': 'No biometric enrolled on this device.',
  'settings.security.reset': 'Email me a password reset link',
  'settings.security.resetCaption': 'The link sets a new password. It is good for one hour.',
  'settings.security.resetSent': 'A reset link is on its way to {email}. It is good for one hour.',
  'settings.security.assurance':
    'Your password is compared on our servers and never stored on this device — only a session token is, and signing out revokes it.',

  'settings.addresses.title': 'Pickup addresses',
  'settings.addresses.caption': 'Tap one to make it the default the booking form fills in.',

  'settings.alerts.title': 'Alerts',
  'settings.alerts.caption': 'In-app only — FreshFold does not send push notifications.',
  'settings.alerts.order': 'Order updates',
  'settings.alerts.orderCaption': 'Collected, in the wash, on the way back.',
  'settings.alerts.message': 'Messages',
  'settings.alerts.messageCaption': 'Replies from your courier and from the desk.',
  'settings.alerts.alert': 'Service alerts',
  'settings.alerts.alertCaption': 'Delays, weather, anything that moves a pickup.',
  'settings.alerts.assurance':
    'Switching one off hides it from the bell and stops it counting — it does not delete anything, and turning it back on brings the history with it. Notices from the desk about the service itself always come through.',

  'settings.language.title': 'Language',
  'settings.language.caption': 'The app reads in this language. Your orders are unaffected.',
  'settings.language.system': 'Follow this phone',
  'settings.language.systemCaption': 'Currently {language}.',
  /** Sits on any language the dictionary does not yet fully cover. */
  'settings.language.partial': 'Draft',
  /**
   * Said on the screen, not only in a commit message. The Twi, Ga and Ewe copy
   * is a first draft awaiting a native speaker, and a customer who reads it
   * should know that before they report the app as broken rather than as rough.
   *
   * Worded with `{language}` rather than naming the three, so it stays true as
   * dictionaries fill in and needs no edit when one of them is finished.
   */
  'settings.language.draft':
    '{language} is still being worked on: parts of the app still read in English, and the rest is a first draft a native speaker has yet to go over. Tell us what reads wrong and we will fix it.',

  'settings.about.title': 'About',
  'settings.about.caption': 'A person answers the phone.',
  'settings.about.version': 'App version',
  'settings.about.server': 'Dispatch server',
  'settings.about.hours': 'Opening hours',
  'settings.about.call': 'Call the desk',
  'settings.about.email': 'Contracts and invoicing',

  'settings.danger.title': 'Danger zone',
  'settings.danger.body':
    'Closing your account signs you out everywhere and cannot be undone. Your orders stop being readable here, and a new account on the same email starts empty.',
  'settings.danger.action': 'Delete my account',
  'settings.danger.confirmTitle': 'Delete your account?',
  'settings.danger.confirmBody':
    'This closes {email} for good. Your order history, saved addresses and messages come off this phone, and signing up again on the same email will not bring them back. The desk keeps its own record of work already done, so ask us if you need a receipt for a past pickup.',
  'settings.danger.yourAccount': 'your account',
  'settings.danger.wallet':
    'Your wallet still holds {amount}. It is not refunded — closing the account forfeits it. Spend it on a pickup first if you would rather not.',
  'settings.danger.planNamed':
    'Your membership ({plan}) ends immediately, and the rest of the period you have paid for goes with it.',
  'settings.danger.plan':
    'Your membership ends immediately, and the rest of the period you have paid for goes with it.',
  'settings.danger.typeToConfirm': 'Type {word} to confirm',
  /**
   * The word the customer types, and the word the code compares against. One
   * key, so a translated prompt cannot ask for a word the check will refuse —
   * and left as `DELETE` in every language for the same reason a keyboard
   * shortcut is not translated.
   */
  'settings.danger.confirmWord': 'DELETE',
  'settings.danger.keep': 'Keep my account',
  'settings.danger.deleting': 'Deleting…',
  'settings.danger.delete': 'Delete for good',
  'settings.danger.failed':
    'Could not reach FreshFold, so nothing was deleted. Check your connection and try again.',

  // --------------------------------------------------------------- account
  //
  // The account tab. A dashboard, so most of this is labels; the things that
  // change an account are on the settings screen above.
  'account.title': 'Account',
  'account.notifications': 'Notifications',
  'account.settingsCaption': 'Your details, security, addresses, alerts',

  'account.verify.title': 'Confirm your email',
  'account.verify.body': 'We sent a link to {email}. Confirm it to start booking pickups.',
  'account.verify.resend': 'Resend link',
  'account.verify.sent': 'Sent. Check your inbox — and your spam folder.',
  'account.verify.failed': 'Could not send the link. Try again shortly.',

  /** The name the initials avatar is built from when nobody is signed in. */
  'account.guestName': 'Guest',
  'account.guestBody':
    'Bookings work without an account — an account is what keeps them, along with your wallet and loyalty tier.',

  'account.stats.orders': 'Orders',
  'account.stats.points': 'Points',
  'account.stats.wallet': 'Wallet',
  'account.stats.spent': 'Spent',

  'account.orders.title': 'Recent orders',
  /**
   * Two counts in one line. Both numbers are always present, so this stays a
   * single key rather than splitting on whether either is zero.
   */
  'account.orders.caption': '{active} active · {past} completed',
  'account.orders.seeAll': 'See all',
  'account.orders.emptyTitle': 'No orders yet',
  'account.orders.emptyBody': 'Your first pickup is a minute away.',

  'account.addresses.title': 'Saved addresses',
  'account.addresses.caption': 'Pre-fills the booking form. Pick which one in Settings.',

  'account.help.title': 'Help',
  'account.help.caption': 'A person, not a form.',
  'account.help.foldie': 'Ask Foldie',
  'account.help.foldieCaption': 'Concierge assistant, in-app',
  'account.help.rate': 'Rate FreshFold',
  'account.help.rateCaption': 'Tell us how we are doing',
  /** Subject line of the feedback mail, so it arrives readable at the desk. */
  'account.help.feedbackSubject': 'Feedback on FreshFold',

  'account.signOut': 'Sign out',
  'account.signOutTitle': 'Sign out?',
  'account.signOutBody': 'Your orders stay on the account and come back when you sign in.',
  'account.stay': 'Stay signed in',
  'account.build': 'FreshFold client {version} · dispatch at {server}',

  // ------------------------------------------------------- address lists
  //
  // Shared by the two screens that list saved addresses — the account tab and
  // the settings screen. Only their section headings differ, and those live in
  // each screen's own block; the row itself reads the same in both places and
  // should not be written twice.
  'addresses.empty': 'Add your first address',
  'addresses.edit': 'Edit {label}',
  'addresses.remove': 'Remove {label}',
  'addresses.confirmRemove': 'Remove this address?',
  // The ceiling is `MAX_SAVED_ADDRESSES` in @freshfold/core, passed in as
  // `{max}` rather than written out here: the server refuses a book longer than
  // that, and a number typed into five dictionaries is a number that will
  // disagree with it one day.
  'addresses.full': 'Saved addresses are limited to {max}. Remove one to add another.',

  // -------------------------------------------------------- address sheet
  'address.add': 'Add an address',
  'address.edit': 'Edit address',
  'address.label': 'Label',
  'address.labelPlaceholder': 'Home, hostel, office…',
  'address.address': 'Address',
  'address.addressPlaceholder': 'Evandy Hostel, Block B, Room 304',
  'address.city': 'City',
  'address.cityPlaceholder': 'Kumasi',
  'address.pinKept':
    'The pin you placed for this address is kept. Editing the text does not move it.',
  'address.pinPlaced':
    'Picked from the list, so this address carries that place’s pin — type the block and room after it.',
  'address.pinDerived':
    'The courier navigates to a pin derived from this text — the more specific, the closer they land.',
  // Only asked when there is no pin and the text matches no landmark we know.
  // Something has to name the zone: the shared address rules drop an entry
  // without one, so the alternative is a form that closes on a saved address
  // that was never saved.
  'address.zone': 'Collection zone',
  'address.zoneHint':
    'We cannot tell where this is from the text alone. Pick the zone we should collect from, or choose the place from the list above.',
  'address.error.address': 'Type the address the courier should knock at.',
  'address.error.zone': 'Pick a collection zone so we know where to send the courier.',
  'address.save': 'Save address',
  'address.saveChanges': 'Save changes',
  /** Used when the customer saved an address without naming it. */
  'address.fallbackLabel': 'Pickup address',
} as const;

/**
 * Every key the app may ask for.
 *
 * Derived from the English dictionary rather than written out, so adding a
 * string is one edit and using one that does not exist does not compile.
 */
export type TranslationKey = keyof typeof en;
