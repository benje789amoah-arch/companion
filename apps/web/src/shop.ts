/**
 * The shop's own details, written down once.
 *
 * They used to be typed out in full in both `Contact.tsx` and `Footer.tsx` —
 * two copies of an address, a phone number and an email, about six hundred
 * pixels apart on the same page. That is a duplication of *content*, which
 * reads as padding, and a duplication of *fact*, which is how a page ends up
 * advertising a disconnected number in one place and the live one in another.
 *
 * The two surfaces now have different jobs. Contact is where you reach the
 * shop and carries all of it; the footer closes the page and carries a single
 * line of it.
 */
export const SHOP = {
  addressLine1: 'Wagyingo Opal, Ayeduase-Kotei',
  addressLine2: 'Beside the Benab filling station, Kumasi',
  /** The two lines as one, for a single-line context. */
  addressShort: 'Ayeduase-Kotei, Kumasi',
  phone: '+233200957165',
  phoneLabel: '+233 20 095 7165',
  email: 'laundry.freshfold@gmail.com',
} as const;
