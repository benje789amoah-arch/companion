/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What a booking costs, all in.
 *
 * `./finish` owns the finish itself — which scents exist, what the surcharge is,
 * which services take one, and how the choice is flattened into
 * `specialInstructions` and read back. This module owns the arithmetic on top:
 * the add-ons, the three reductions a customer can be owed, and the one number at
 * the end.
 *
 * That number had no home. The website's `BookingModal` carried a cascade of
 * `if (service.includes(…))` branches; the customer app's catalogue carried
 * `priceBreakdown`, whose own comment said it "reproduces the website's
 * arithmetic exactly". The server carried none at all and read `amount` off the
 * request body — so the price of a wash was whatever the client claimed, and a
 * booking could arrive at ₵0.
 *
 * The two copies had already drifted, in the way two copies always do; see the
 * note on `isFragranceFree` in `./finish` for the ₵5 the website charged for
 * choosing *unscented*. This is the third time the codebase has had to
 * consolidate a table like this — `./loyalty` for the tier thresholds and
 * `./membership` for the plan prices were the first two — and the only one of the
 * three that decides what somebody is charged.
 */

import { tierForPoints } from './loyalty';
import { membershipBookingQuote, roundCedis, type ActivePlan } from './membership';
import { serviceByName } from './services';

/** Exact slot strings both booking forms submit, so the two read the same. */
export const PICKUP_TIME_SLOTS = [
  '08:00 AM - 11:00 AM (Morning Concierge)',
  '12:00 PM - 03:00 PM (Afternoon Transit)',
  '05:30 PM - 08:30 PM (Sunset Concierge)',
] as const;

// ---------------------------------------------------------------------------
// The finish: what a customer can choose, and what it adds
// ---------------------------------------------------------------------------

export interface FinishOption {
  /** The value stored on the booking. Both surfaces submit this string. */
  id: string;
  label: string;
  surcharge: number;
}

/**
 * The scents offered, in the order they are shown.
 *
 * `surcharge` is read off the record rather than inferred from the name. Both
 * implementations this replaces worked the ₵5 out by testing the *string* — the
 * app with `startsWith('Fragrance-Free')`, the website with
 * `!== 'Fragrance-Free'` — and since every option's stored value is the
 * parenthesised long form, the website's test was true of all three. It charged
 * ₵5 for choosing unscented, and ₵5 for everything else, from a comparison that
 * could never match its own option value.
 *
 * A number on the option it belongs to cannot be got wrong by a string compare.
 */
export const SCENTS: FinishOption[] = [
  { id: 'Organic Lavender', label: 'Organic Lavender', surcharge: 5 },
  { id: 'Bespoke Eucalyptus & Tea-Tree', label: 'Eucalyptus & Tea-Tree', surcharge: 5 },
  { id: 'Fragrance-Free (Pure Hypoallergenic Soap)', label: 'Fragrance-Free', surcharge: 0 },
];

export const STARCH_LEVELS: FinishOption[] = [
  { id: 'None', label: 'None', surcharge: 0 },
  { id: 'Light', label: 'Light', surcharge: 5 },
  { id: 'Medium', label: 'Medium', surcharge: 5 },
];

export const DEFAULT_SCENT = SCENTS[0].id;
export const DEFAULT_STARCH = STARCH_LEVELS[0].id;

/**
 * The unscented option, matched by prefix.
 *
 * Kept as a named rule because a scent read back out of `specialInstructions` by
 * `decodeFinish` is a bare string that may not be in {@link SCENTS} at all —
 * older bookings predate the list. Prefix rather than equality, which is the
 * distinction the website got wrong.
 */
export function isFragranceFree(scent: string): boolean {
  return scent.trim().startsWith('Fragrance-Free');
}

/**
 * Whether scent and starch mean anything for this service.
 *
 * A car and a sofa do not take a fabric finish, so the surcharges do not apply,
 * the pickers are hidden, and `encodeFinish` leaves the sentence off the
 * courier's card. Also what decides whether a membership's included pickups can
 * cover the work — see {@link isPlanCoverable}.
 */
export function isGarmentService(serviceType: string): boolean {
  const listed = serviceByName(serviceType ?? '');
  if (listed) return listed.garment;

  // Legacy names only — see the note on LEGACY_BASE_PRICES. This was the whole
  // test, and being a blacklist it answered "garment" for anything it had not
  // heard of. `Fast Pickup & Delivery` is the one that got away: a courier run
  // advertised as complimentary, quoted at ₵5, because a scent surcharge
  // applied to it.
  const name = serviceType ?? '';
  return (
    !name.includes('Car Detailing') &&
    !name.includes('Home & Office') &&
    !name.includes('Sofa & Carpet')
  );
}

// ---------------------------------------------------------------------------
// The service itself
// ---------------------------------------------------------------------------

/**
 * Legacy base prices, matched on a substring of the name.
 *
 * This was the whole of the pricing table, and it was a second opinion: the
 * catalogue card said what a service cost and this said what it charged, and on
 * six of eleven services they disagreed. The catalogue in `./services` is now
 * the price, and this is only consulted for a `serviceType` that no longer
 * names a service in it.
 *
 * That case is real and has to keep working. `Booking.serviceType` stores the
 * free-text label the customer picked, not an id, so every booking already in
 * the ledger carries whatever the catalogue said the day it was made. Renaming
 * a service must not silently reprice the orders taken under the old name.
 *
 * First match wins, so the specific entries come before the general ones:
 * `Detailing` has to be tested before `Premium` or a "Premium Detailing" would be
 * priced as laundry.
 */
const LEGACY_BASE_PRICES: { match: string[]; price: number }[] = [
  { match: ['Car Detailing', 'Detailing'], price: 150 },
  { match: ['Home & Office', 'Office Cleaning'], price: 180 },
  { match: ['Sofa & Carpet', 'Carpet Cleaning'], price: 90 },
  { match: ['Fast Pickup', 'Pickup & Delivery'], price: 0 },
  { match: ['Washing'], price: 30 },
  { match: ['Bed Sheets', 'Linen'], price: 45 },
  { match: ['Executive', 'Pro', 'Premium'], price: 55 },
  { match: ['Express', 'Same-Day'], price: 50 },
];

/** What an unrecognised service falls back to. */
export const DEFAULT_BASE_PRICE = 25;

export function serviceBasePrice(serviceType: string): number {
  const listed = serviceByName(serviceType ?? '');
  if (listed) return listed.price;

  const name = serviceType ?? '';
  const found = LEGACY_BASE_PRICES.find((entry) =>
    entry.match.some((needle) => name.includes(needle))
  );
  return found ? found.price : DEFAULT_BASE_PRICE;
}

// ---------------------------------------------------------------------------
// Specialty add-ons
// ---------------------------------------------------------------------------

export interface SpecialtyAddon {
  id: string;
  label: string;
  description: string;
  price: number;
  iconName: string;
}

/**
 * The extras, priced individually.
 *
 * Deliberately outside the finish: a membership's included pickup covers the
 * laundry and its scent, and does not cover garment shielding. Keeping them
 * separable is what lets {@link quoteBooking} waive one and bill the other.
 */
export const SPECIALTY_ADDONS: SpecialtyAddon[] = [
  {
    id: 'Fabric Softening',
    label: 'Fabric softening',
    description: 'Plant-derived conditioner for a softer hand-feel.',
    price: 6,
    iconName: 'Feather',
  },
  {
    id: 'Laser Line Creasing',
    label: 'Laser-line creasing',
    description: 'Razor-sharp trouser and sleeve lines.',
    price: 8,
    iconName: 'Ruler',
  },
  {
    id: 'Garment Shielding',
    label: 'Garment shielding',
    description: 'Individual breathable covers on the hanger return.',
    price: 10,
    iconName: 'ShieldCheck',
  },
  {
    id: 'Delicate Hand Finish',
    label: 'Delicate hand finish',
    description: 'Silks and cashmere finished by hand, never machine-pressed.',
    price: 12,
    iconName: 'Hand',
  },
];

export function specialtyAddon(id: string): SpecialtyAddon | null {
  return SPECIALTY_ADDONS.find((addon) => addon.id === id) ?? null;
}

/**
 * Whether a membership's included pickups apply to this service.
 *
 * A laundry plan buys laundry. Car detailing, office cleaning and upholstery are
 * priced at ₵90–₵180 a visit and would otherwise let a Family member spend eight
 * included pickups on ₵1,440 of work for ₵289. Those get the member discount
 * instead. The same test as the finish, because it is the same question: is this
 * a garment?
 */
export function isPlanCoverable(serviceType: string): boolean {
  return isGarmentService(serviceType);
}

// ---------------------------------------------------------------------------
// The list price
// ---------------------------------------------------------------------------

/** What the customer chose. The only inputs to a price. */
export interface BookingSelections {
  serviceType: string;
  /** Absent means nothing was chosen, which costs nothing. */
  scent?: string;
  starch?: string;
  addonIds?: string[];
}

export interface PriceBreakdown {
  /** The service itself, before finishes. */
  base: number;
  /** Scent and starch surcharges — part of the laundry, not an extra. */
  finishes: number;
  /** Specialty add-ons, which a membership does not cover. */
  addons: number;
  /** The laundry a membership's included pickups pay for: base + finishes. */
  laundry: number;
  /** Everything, before any discount. */
  gross: number;
}

/**
 * The surcharge for the chosen finish, tolerating one that was never chosen.
 *
 * Both fields are optional: they are new on `Booking`, so a booking replayed from
 * an older client's offline queue carries neither. Absent means nothing chosen and
 * nothing owed — the alternative is billing somebody ₵5 for a scent they were
 * never offered, since an empty string is not fragrance-free either.
 *
 * A value that is not on the menu — a scent read back out of an old booking's
 * `specialInstructions` — falls through the lookup to ₵0 rather than guessing.
 * Charging for something we cannot price is the worse failure of the two.
 */
function finishesFor(selections: BookingSelections): number {
  const { serviceType, scent, starch } = selections;
  if (!isGarmentService(serviceType)) return 0;

  const scentSurcharge = scent ? (SCENTS.find((o) => o.id === scent)?.surcharge ?? 0) : 0;
  const starchSurcharge = starch
    ? (STARCH_LEVELS.find((o) => o.id === starch)?.surcharge ?? 0)
    : 0;

  return scentSurcharge + starchSurcharge;
}

/**
 * The list price, itemised.
 *
 * Separable because a membership covers the laundry and not the extras, so the
 * quote has to say which part is which before anything can be waived.
 */
export function priceBreakdown(selections: BookingSelections): PriceBreakdown {
  const base = serviceBasePrice(selections.serviceType ?? '');
  const finishes = finishesFor(selections);
  const addons = (selections.addonIds ?? []).reduce(
    (total, id) => total + (specialtyAddon(id)?.price ?? 0),
    0
  );

  return {
    base,
    finishes,
    addons,
    laundry: roundCedis(base + finishes),
    gross: roundCedis(base + finishes + addons),
  };
}

// ---------------------------------------------------------------------------
// The quote
// ---------------------------------------------------------------------------

/** Everything that decides what one customer pays for one booking. */
export interface BookingQuote extends PriceBreakdown {
  /** Laundry fee absorbed by an included pickup. */
  waived: number;
  /** The member rate on whatever the allowance did not absorb. */
  memberDiscount: number;
  /** The loyalty tier's cut, taken after the membership. */
  tierDiscount: number;
  /** What the customer actually owes. */
  total: number;
  /** True when this booking spends one of the period's included pickups. */
  coveredByPlan: boolean;
  /** Included pickups left before this booking. */
  remainingPickups: number;
}

/**
 * What this customer owes for this booking.
 *
 * Three reductions, in a fixed order, because they do not commute: the
 * membership's included pickup waives the laundry, the member rate applies to
 * whatever is left, and the loyalty tier takes its cut of *that* rather than of
 * the gross — so the two discounts can never compound into more than the booking
 * is worth. That ordering was the customer app's, and it was the only place it
 * existed.
 *
 * Every caller passes the same three things and gets the same number: the
 * website's form, the app's form, and the server that decides what the job is
 * actually worth. That last one is the point — the two forms are showing a quote,
 * only the server is setting a price.
 *
 * `plan` and `points` are the customer's as the *server* knows them. A signed-out
 * booking passes neither and gets the list price, which is what a guest pays.
 */
export function quoteBooking(input: {
  selections: BookingSelections;
  plan?: ActivePlan | null;
  points?: number;
}): BookingQuote {
  const { selections, plan, points } = input;
  const breakdown = priceBreakdown(selections);

  const membership = membershipBookingQuote({
    plan,
    gross: breakdown.gross,
    laundry: breakdown.laundry,
    coverable: isPlanCoverable(selections.serviceType ?? ''),
  });

  const afterPlan = Math.max(
    0,
    roundCedis(breakdown.gross - membership.waived - membership.discount)
  );

  // A tier discount is earned by an account. `tierForPoints(0)` is Bronze at 0%
  // anyway, but passing no points at all says "there is no customer here" more
  // plainly than relying on the first row of the table.
  const tierDiscount =
    points === undefined ? 0 : roundCedis(afterPlan * tierForPoints(points).discountRate);

  return {
    ...breakdown,
    waived: membership.waived,
    memberDiscount: membership.discount,
    tierDiscount,
    total: Math.max(0, roundCedis(afterPlan - tierDiscount)),
    coveredByPlan: membership.covered,
    remainingPickups: membership.remainingPickups,
  };
}
