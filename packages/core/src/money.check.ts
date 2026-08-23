/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks for everything that decides what a customer pays.
 *
 * Run with `npm run check --workspace @freshfold/core`.
 *
 * This file covers `pricing`, `membership` and `loyalty` together because they
 * are one rule pretending to be three: `quoteBooking` composes all of them, and
 * the interesting cases are the ones where they interact. The comments in those
 * modules describe several bugs that were fixed by moving the arithmetic here
 * from the two clients — a plan discount applied by the app and not the
 * website, a tier table that disagreed between surfaces, a `setMonth(+1)` that
 * moved every subsequent renewal. Each of those now has an assertion, so the
 * fix has something holding it in place.
 *
 * Prices are read from the tables rather than hard-coded, except where the
 * number *is* the thing being checked — a test that recomputes the
 * implementation proves only that it is self-consistent.
 */

import { check, checkTrue, report, section } from './check';
import {
  DEFAULT_STARCH,
  SPECIALTY_ADDONS,
  isPlanCoverable,
  priceBreakdown,
  quoteBooking,
  serviceBasePrice,
} from './pricing';
import {
  MEMBERSHIP_PLANS,
  addMonthClamped,
  consumePickup,
  membershipPlan,
  membershipSwitchQuote,
  roundCedis,
  settleMembership,
  startMembership,
  type ActivePlan,
} from './membership';
import { LOYALTY_TIERS, loyaltyReward, pointsForSpend, tierForPoints, tierProgress } from './loyalty';

const WASH = 'Washing (Machine & Hand Wash)';
const CAR = 'Bespoke Car Detailing';
const LAVENDER = 'Organic Lavender';
const UNSCENTED = 'Fragrance-Free (Pure Hypoallergenic Soap)';
const SHIELDING = 'Garment Shielding';

const plan = (id: string, pickupsUsed = 0): ActivePlan =>
  ({ ...startMembership(membershipPlan(id)!), pickupsUsed }) as ActivePlan;

// ---------------------------------------------------------------------------
section('the list price');

check('a wash is its listed price', serviceBasePrice(WASH), 30);
check('an unlisted service falls back to the default', serviceBasePrice('Alchemy'), 25);

check('scent and starch are itemised away from the base', priceBreakdown({
  serviceType: WASH,
  scent: LAVENDER,
  starch: DEFAULT_STARCH,
}), { base: 30, finishes: 5, addons: 0, laundry: 35, gross: 35 });

// The comment on SCENTS names this: a string compare once charged ₵5 for
// choosing *unscented*, which is the option that exists to cost nothing.
check('fragrance-free carries no surcharge', priceBreakdown({
  serviceType: WASH,
  scent: UNSCENTED,
  starch: DEFAULT_STARCH,
}).finishes, 0);

// `finishesFor` returns 0 for anything that is not a garment, so a scent left
// selected from a previous step cannot be billed onto a car.
check('a finish cannot be billed onto a car detail', priceBreakdown({
  serviceType: CAR,
  scent: LAVENDER,
  starch: 'Medium',
}).finishes, 0);

check('add-ons are separable from the laundry', priceBreakdown({
  serviceType: WASH,
  scent: UNSCENTED,
  addonIds: [SHIELDING],
}), { base: 30, finishes: 0, addons: 10, laundry: 30, gross: 40 });

check('an unknown add-on is worth nothing, not NaN', priceBreakdown({
  serviceType: WASH,
  scent: UNSCENTED,
  addonIds: ['Gold Plating'],
}).addons, 0);

// ---------------------------------------------------------------------------
section('the quote a guest gets');

check('no plan and no points is the list price', quoteBooking({
  selections: { serviceType: WASH, scent: LAVENDER, starch: DEFAULT_STARCH },
}).total, 35);

// `points === undefined` means "there is no customer here" — distinct from a
// signed-in customer who happens to have zero.
check('a guest gets no tier discount', quoteBooking({
  selections: { serviceType: WASH, scent: LAVENDER },
}).tierDiscount, 0);

check('a signed-in customer at zero points is also Bronze at 0%', quoteBooking({
  selections: { serviceType: WASH, scent: LAVENDER },
  points: 0,
}).tierDiscount, 0);

// ---------------------------------------------------------------------------
section('membership against a booking');

const student = membershipPlan('student')!;

{
  // An included pickup absorbs the laundry; the add-on is still billed, at the
  // member rate.
  const quote = quoteBooking({
    selections: { serviceType: WASH, scent: LAVENDER, addonIds: [SHIELDING] },
    plan: plan('student'),
  });
  check('an included pickup waives the laundry only', quote.waived, 35);
  checkTrue('...and the booking is marked as covered', quote.coveredByPlan);
  check('...the add-on is billed at the member rate', quote.memberDiscount, roundCedis(10 * 0.1));
  check('...leaving the extras and nothing else', quote.total, roundCedis(10 - 10 * 0.1));
}

{
  // The comment on `isPlanCoverable` names the exploit: eight included pickups
  // spent on ₵180 visits would buy ₵1,440 of work for a ₵289 plan.
  const quote = quoteBooking({ selections: { serviceType: CAR }, plan: plan('family') });
  checkTrue('a car detail is never covered by an allowance', !quote.coveredByPlan);
  check('...it gets the member discount instead', quote.waived, 0);
  check('...at the family rate', quote.memberDiscount, roundCedis(150 * 0.2));
}

{
  const spent = plan('student', student.includedPickups);
  const quote = quoteBooking({ selections: { serviceType: WASH, scent: LAVENDER }, plan: spent });
  check('a spent allowance waives nothing', quote.waived, 0);
  check('...and reports none remaining', quote.remainingPickups, 0);
  check('...but the member rate still applies', quote.memberDiscount, roundCedis(35 * 0.1));
}

// ---------------------------------------------------------------------------
section('the two discounts do not compound');

{
  // The ordering `quoteBooking` documents: allowance, then member rate, then
  // tier — the tier taking its cut of what is left rather than of the gross.
  const gold = LOYALTY_TIERS.find((tier) => tier.id === 'gold')!;
  const quote = quoteBooking({
    selections: { serviceType: CAR },
    plan: plan('family'),
    points: gold.minPoints,
  });

  const afterPlan = roundCedis(150 - 150 * 0.2);
  check('the tier discounts what the plan left, not the gross', quote.tierDiscount,
    roundCedis(afterPlan * gold.discountRate));
  check('...so the total is the two applied in order', quote.total,
    roundCedis(afterPlan - afterPlan * gold.discountRate));
  checkTrue('...and is never more than the booking was worth', quote.total <= quote.gross);
}

checkTrue(
  'no combination of plan and tier can make a booking cost less than nothing',
  MEMBERSHIP_PLANS.every((definition) =>
    LOYALTY_TIERS.every((tier) =>
      quoteBooking({
        selections: { serviceType: WASH, scent: LAVENDER, addonIds: [SHIELDING] },
        plan: plan(definition.id),
        points: tier.minPoints,
      }).total >= 0
    )
  )
);

// ---------------------------------------------------------------------------
section('renewal dates');

// The comment on `addMonthClamped`: `setMonth(+1)` on 31 January lands in March,
// which gives a longer first period and moves every renewal after it.
check('31 January clamps to 28 February', addMonthClamped(new Date(2026, 0, 31)).getDate(), 28);
check('31 January 2028 clamps to the 29th in a leap year',
  addMonthClamped(new Date(2028, 0, 31)).getDate(), 29);
check('31 March clamps to 30 April', addMonthClamped(new Date(2026, 2, 31)).getDate(), 30);
check('the 15th stays the 15th', addMonthClamped(new Date(2026, 0, 15)).getDate(), 15);
check('December rolls into January', addMonthClamped(new Date(2026, 11, 15)).getFullYear(), 2027);

// ---------------------------------------------------------------------------
section('settling a membership');

{
  const now = new Date(2026, 0, 15);
  const active = startMembership(student, now);
  const settled = settleMembership(active, 500, new Date(2026, 0, 20));
  checkTrue('a period still running is returned untouched', settled.plan === active);
  check('...nothing is charged', settled.charges.length, 0);
  check('...and the balance is unmoved', settled.balance, 500);
}

{
  // Identity matters here: `plan === settlement.plan` is how callers avoid a
  // database write on every poll from every device.
  const active = startMembership(student, new Date(2026, 0, 15));
  const due = settleMembership(active, 500, new Date(2026, 1, 16));
  check('a period that has rolled over charges once', due.charges.length, 1);
  check('...at the plan price', due.balance, 500 - student.price);
  check('...and resets the allowance', due.plan?.pickupsUsed, 0);
  checkTrue('...returning a new object, so the caller knows to write', due.plan !== active);
}

{
  const active = startMembership(student, new Date(2026, 0, 15));
  const broke = settleMembership(active, student.price - 1, new Date(2026, 1, 16));
  check('a wallet that cannot cover the fee lapses the plan', broke.plan, null);
  check('...saying why', broke.lapsed, 'insufficient-funds');
  check('...without accruing a debt', broke.balance, student.price - 1);
}

{
  const cancelling = { ...startMembership(student, new Date(2026, 0, 15)), cancelAtPeriodEnd: true };
  const ended = settleMembership(cancelling, 5000, new Date(2026, 1, 16));
  check('a cancelled plan ends at the period boundary', ended.plan, null);
  check('...and is not charged for another month', ended.charges.length, 0);
  check('...saying why', ended.lapsed, 'cancelled');
}

{
  // Two years away. The loop is guarded at 24 periods precisely so a corrupt
  // far-past date cannot spin.
  const stale = startMembership(student, new Date(2020, 0, 15));
  const caught = settleMembership(stale, 100000, new Date(2026, 0, 15));
  checkTrue('a long-abandoned account settles without spinning', caught.charges.length <= 24);
}

// Cast through `unknown`: `planId` is a union of the four ids that exist, and
// the whole point of this case is a stored plan naming one that does not.
check('a plan id no longer offered ends rather than renewing',
  settleMembership({ ...plan('student'), planId: 'platinum' } as unknown as ActivePlan, 5000,
    new Date(2030, 0, 1)).lapsed, 'withdrawn');

// ---------------------------------------------------------------------------
section('switching plans');

{
  const family = membershipPlan('family')!;
  const now = new Date(2026, 0, 15);
  const running = startMembership(student, now);

  // Halfway through the month: half the student fee is unused and credited.
  const halfway = new Date(2026, 0, 30);
  const quote = membershipSwitchQuote(running, family, halfway);
  check('the new plan is quoted at its full fee', quote.fee, family.price);
  checkTrue('...against a credit for the unused part of the old one', quote.credit > 0);
  checkTrue('...which never exceeds what was paid', quote.credit <= student.price);
  check('...and the amount due is the difference', quote.due, roundCedis(family.price - quote.credit));
}

{
  // The documented limit: a downgrade costs ₵0 today rather than refunding.
  const corporate = membershipPlan('corporate')!;
  const running = startMembership(corporate, new Date(2026, 0, 15));
  const quote = membershipSwitchQuote(running, student, new Date(2026, 0, 16));
  check('a downgrade is never negative', quote.due, Math.max(0, quote.due));
  checkTrue('...and costs nothing today', quote.due === 0);
}

// ---------------------------------------------------------------------------
section('spending an included pickup');

{
  const fresh = plan('student');
  check('spending one increments the count', consumePickup(fresh).pickupsUsed, 1);

  const spent = plan('student', student.includedPickups);
  check('spending past the allowance changes nothing',
    consumePickup(spent).pickupsUsed, student.includedPickups);
}

// ---------------------------------------------------------------------------
section('care points');

check('a point per whole cedi', pointsForSpend(35), 35);
check('part-cedis do not round up into free points', pointsForSpend(35.99), 35);
check('...and neither does a stream of small charges', pointsForSpend(0.99), 0);
check('a negative spend earns nothing', pointsForSpend(-50), 0);

// The comment on LOYALTY_TIERS: the website said Silver at 400 and the app said
// 500, so the same customer was two different tiers depending where they looked.
check('Bronze at zero', tierForPoints(0).id, 'basic');
check('one point short of Silver is still Bronze', tierForPoints(499).id, 'basic');
check('Silver at its own threshold', tierForPoints(500).id, 'silver');
check('Gold at its own threshold', tierForPoints(1500).id, 'gold');
check('past the top tier stays at the top', tierForPoints(999999).id, 'gold');

checkTrue(
  'the tier table is ascending, which tierForPoints relies on',
  LOYALTY_TIERS.every((tier, index) => index === 0 || tier.minPoints > LOYALTY_TIERS[index - 1].minPoints)
);

{
  const progress = tierProgress(0);
  check('progress from zero points to Silver', progress.pointsToNext, 500);
  check('...at nought per cent', progress.percent, 0);

  const top = tierProgress(2000);
  check('there is nothing after Gold', top.next, null);
}

// ---------------------------------------------------------------------------
section('rewards');

checkTrue('a reward in the catalogue is found', loyaltyReward('wallet-credit-50') !== null);
check('one that is not is null, not a throw', loyaltyReward('free-house'), null);
check('and so is nothing at all', loyaltyReward(undefined), null);

checkTrue(
  'every reward costs points',
  loyaltyRewardsAllPositive()
);

function loyaltyRewardsAllPositive(): boolean {
  return ['scent-spray', 'express-dispatch', 'wallet-credit-50']
    .map((id) => loyaltyReward(id))
    .every((reward) => reward !== null && reward.cost > 0);
}

// ---------------------------------------------------------------------------
section('sanity on the tables themselves');

checkTrue('every plan has a price and an allowance',
  MEMBERSHIP_PLANS.every((p) => p.price > 0 && p.includedPickups > 0));
checkTrue('every plan discount is a fraction, not a percentage',
  MEMBERSHIP_PLANS.every((p) => p.overageDiscount > 0 && p.overageDiscount < 1));
checkTrue('every add-on is priced',
  SPECIALTY_ADDONS.every((addon) => addon.price > 0));
checkTrue('garment services are plan-coverable and premises services are not',
  isPlanCoverable(WASH) && !isPlanCoverable(CAR));

report();
