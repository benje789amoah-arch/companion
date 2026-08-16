/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MEMBERSHIP_PLANS,
  LOYALTY_TIERS as CORE_LOYALTY_TIERS,
  nextTierAfter as coreNextTierAfter,
  tierForPoints as coreTierForPoints,
} from '@freshfold/core';
import type {
  LoyaltyTier,
  LoyaltyTierId,
  MembershipPlanId,
  SubscriptionPlan,
  Testimonial,
} from '@freshfold/core';

/**
 * The marketing catalogue, ported from `apps/web/src/data.ts`.
 *
 * It is duplicated rather than lifted into `@freshfold/core` for the same
 * reason the palettes are: the shared package deliberately imports nothing
 * platform-specific, and this table carries presentation decisions (icon names
 * that must exist in `lucide-react-native`, gradient stops as hex rather than
 * Tailwind class names) that only make sense on a device. The *prices and
 * copy* are the contract with the website; keep those in step.
 */

export type ServiceCategory = 'core' | 'specialized' | 'express';

export interface ClientService {
  id: string;
  name: string;
  /** Short label for chips and the booking summary, where the full name won't fit. */
  shortName: string;
  description: string;
  priceInfo: string;
  iconName: string;
  category: ServiceCategory;
  imageUrl: string;
}

export const SERVICES: ClientService[] = [
  {
    id: 'washing',
    name: 'Washing (Machine & Hand Wash)',
    shortName: 'Wash & Care',
    description:
      'Bespoke hand-care treatments for fine silks and cashmere, alongside temperature-regulated drum-washing for designer garments.',
    priceInfo: 'From ₵15 / load',
    iconName: 'Sparkles',
    category: 'core',
    imageUrl:
      'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'drying',
    name: 'Gentle Air drying',
    shortName: 'Air Dry',
    description:
      'Controlled low-heat dehydration that prevents thermal shrinkage, restoring original fabric lift and wool elasticity.',
    priceInfo: 'Included with Wash',
    iconName: 'Wind',
    category: 'core',
    imageUrl:
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPI6SKSgSeb7TRH3tohbZVtJXr9VLQq8uyyryGaMA3AQ&s=10',
  },
  {
    id: 'ironing-folding',
    name: 'Ironing & Folding',
    shortName: 'Iron & Fold',
    description:
      'Crisp hand-pressed steam finishes and pristine laser-line boutique folding, ready for direct closet placement.',
    priceInfo: 'From ₵3.50 / item',
    iconName: 'Shirt',
    category: 'core',
    imageUrl:
      'https://images.unsplash.com/photo-1489274495757-95c7c837b101?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'stain-removal',
    name: 'Advanced Stain Removal',
    shortName: 'Stain Care',
    description:
      'Targeted eco-friendly enzyme treatment of individual spots that safely releases red wine, oil, and coffee stains.',
    priceInfo: 'From ₵8 / item',
    iconName: 'Droplet',
    category: 'specialized',
    imageUrl:
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'bedding-linens',
    name: 'Bed Sheets & Linens Care',
    shortName: 'Linens',
    description:
      'Sanitizing hot-water cycles paired with ultra-soft, organic floral-extract formulas for high-thread-count sheets.',
    priceInfo: 'From ₵25 / set',
    iconName: 'Bed',
    category: 'specialized',
    imageUrl:
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'express-laundry',
    name: 'Express Same-Day Laundry',
    shortName: 'Same-Day',
    description:
      'A dedicated expedited sequence. Collected from your home by 9:00 AM, delivered freshly pressed by 7:30 PM.',
    priceInfo: '+₵15 premium surcharge',
    iconName: 'Zap',
    category: 'express',
    imageUrl:
      'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'pickup-delivery',
    name: 'Fast Pickup & Delivery',
    shortName: 'Pickup Only',
    description:
      'Convenient, reliable, on time, every time. Direct real-time GPS-tracked logistics ensuring your orders are received and returned exactly on your clock.',
    priceInfo: 'Complimentary',
    iconName: 'Truck',
    category: 'express',
    imageUrl:
      'https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'car-detailing',
    name: 'Bespoke Car Detailing',
    shortName: 'Car Detail',
    description:
      'We restore, shine and protect your ride. High-end hand steam, polymer sealant wax coating, and deep interior/exterior detailing.',
    priceInfo: 'From ₵150 / ride',
    iconName: 'Car',
    category: 'specialized',
    imageUrl:
      'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'home-office-cleaning',
    name: 'Home & Office Cleaning',
    shortName: 'Deep Clean',
    description:
      'Spotless spaces, and healthier living. Deep-steam surface sanitizing, precise dust eradication, and natural aromatherapy allergen-free deodorizing.',
    priceInfo: 'From ₵180 / space',
    iconName: 'House',
    category: 'specialized',
    imageUrl:
      'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'sofa-carpet-cleaning',
    name: 'Sofa & Carpet Cleaning',
    shortName: 'Upholstery',
    description:
      'Deep clean for a fresher, safer home. Heavy-duty hot water extraction, stain neutralization, and antibacterial fabric protectants for all upholstery.',
    priceInfo: 'From ₵90 / unit',
    iconName: 'Armchair',
    category: 'specialized',
    imageUrl:
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&q=80&w=800',
  },
  {
    id: 'corporate',
    name: 'Corporate Contracts',
    shortName: 'Corporate',
    description:
      'Continuous logistics and custom care protocols for boutique hotels, premium spas, high-end fitness studios, and corporate offices.',
    priceInfo: 'Custom Enterprise Quotes',
    iconName: 'Briefcase',
    category: 'specialized',
    imageUrl:
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800',
  },
];

export const SERVICE_CATEGORIES: { id: ServiceCategory; label: string; blurb: string }[] = [
  { id: 'core', label: 'Everyday care', blurb: 'The weekly essentials, done properly.' },
  { id: 'specialized', label: 'Specialist', blurb: 'Fabrics and spaces that need a specific hand.' },
  { id: 'express', label: 'Express', blurb: 'When it has to be back today.' },
];

/**
 * How each plan is *presented*. What it costs and what it includes is in
 * `@freshfold/core`, and the two are joined below.
 *
 * The split matters: the price used to exist twice — once as the string on the
 * card and once as a number in a `PLAN_PRICES` map — and a plan missing from
 * the map subscribed for ₵0 while showing its full price. There is now one
 * number, the server holds the same one, and the card's `₵79` is derived from
 * it rather than typed alongside it.
 */
const PLAN_PRESENTATION: Record<
  MembershipPlanId,
  Omit<SubscriptionPlan, 'id' | 'name' | 'price' | 'billing'>
> = {
  student: {
    tagline: 'Worry-free fabric care built around class schedules.',
    iconName: 'GraduationCap',
    capacity: '20 lbs / month of laundry',
    turnaround: 'Next-day turnaround standard',
    benefits: [
      '2 scheduled pickups per month, laundry included',
      'Complimentary organic hypoallergenic soap',
      '10% member rate once the two are used',
      'Digital laundry history log',
    ],
  },
  professional: {
    tagline: 'Always-pristine formal shirts, business ensembles and suits.',
    popular: true,
    iconName: 'Briefcase',
    capacity: '45 lbs / month + 10 ironed items',
    turnaround: 'Next-day turnaround standard',
    benefits: [
      'Weekly door-side pickups — 4 a month, laundry included',
      'Complimentary delicate handwashing for custom knits',
      'Boutique hanger delivery with garment shielding',
      '15% member rate on anything beyond the four',
    ],
  },
  family: {
    tagline: 'Large bulk handling with individual-level garment separation.',
    iconName: 'House',
    capacity: '100 lbs / month of heavy cycles',
    turnaround: 'Standard 24-hour delivery',
    benefits: [
      '8 pickups/month (twice per week), laundry included',
      'Strict fabric and household division rules',
      'Free plush duvet and bed sheet washing & ironing',
      '20% member rate on anything beyond the eight',
    ],
  },
  corporate: {
    tagline: 'Custom high-frequency care for premium enterprises.',
    iconName: 'Crown',
    capacity: '200 lbs / month + customizable setups',
    turnaround: 'Same-day turnaround prioritized',
    benefits: [
      'Daily pickups — 30 a month, laundry included',
      'White-glove quality assurance reports',
      'Dedicated account manager and express stain restoration',
      '25% member rate on anything beyond the thirty',
    ],
  },
};

/** A plan card: core's commercial terms joined to this app's presentation. */
export interface ClientSubscriptionPlan extends SubscriptionPlan {
  id: MembershipPlanId;
  /** The number actually charged. `price` is this, formatted. */
  monthlyPrice: number;
  includedPickups: number;
  overageDiscount: number;
}

export const SUBSCRIPTION_PLANS: ClientSubscriptionPlan[] = MEMBERSHIP_PLANS.map((plan) => ({
  ...PLAN_PRESENTATION[plan.id],
  id: plan.id,
  name: plan.name,
  price: `₵${plan.price}`,
  billing: 'billed monthly',
  monthlyPrice: plan.price,
  includedPickups: plan.includedPickups,
  overageDiscount: plan.overageDiscount,
}));

export function clientPlan(id: string | undefined | null): ClientSubscriptionPlan | null {
  if (!id) return null;
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === id) ?? null;
}

/**
 * Loyalty tiers, dressed for a phone.
 *
 * The tiers themselves — names, thresholds, discounts, benefits — come from
 * `@freshfold/core` and are shared with the website and the server. This file
 * used to declare its own array, which is how the app came to put Silver at 500
 * points while the website's client portal put it at 400: the same customer,
 * two tiers, depending on which screen they were looking at.
 *
 * What stays local is only presentation. The website expresses a card's
 * gradient as Tailwind class names, which mean nothing to React Native, so the
 * same visual intent is a pair of hex stops here.
 */
interface TierPalette {
  gradient: [string, string];
  textColor: string;
  accent: string;
}

const TIER_PALETTE: Record<LoyaltyTierId, TierPalette> = {
  basic: { gradient: ['#2E2B26', '#171613'], textColor: '#D6D1C7', accent: '#8C8577' },
  silver: { gradient: ['#4A4E55', '#1E2024'], textColor: '#F1F1EE', accent: '#B9BEC4' },
  gold: { gradient: ['#8A6A2E', '#312410'], textColor: '#F6EBD6', accent: '#E2C489' },
};

export type ClientLoyaltyTier = LoyaltyTier & TierPalette;

function dress(tier: LoyaltyTier): ClientLoyaltyTier {
  return { ...tier, ...TIER_PALETTE[tier.id] };
}

export const LOYALTY_TIERS: ClientLoyaltyTier[] = CORE_LOYALTY_TIERS.map(dress);

/** The highest tier the given lifetime points qualify for. */
export function tierForPoints(points: number): ClientLoyaltyTier {
  return dress(coreTierForPoints(points));
}

/** The next tier up, or `null` at the top. */
export function nextTierAfter(tier: ClientLoyaltyTier): ClientLoyaltyTier | null {
  const next = coreNextTierAfter(tier);
  return next ? dress(next) : null;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    id: '1',
    name: 'Seraphina Kensington',
    role: 'Creative Director & Fashion Consultant',
    quote:
      'As someone with severe fabric standards, handling bespoke knitwear can trigger anxiety. FreshFold treats my garments as individual works of art.',
    rating: 5,
    avatarUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150',
  },
  {
    id: '2',
    name: 'Jonathan Reynolds',
    role: 'Managing Partner at Reynolds Asset Management',
    quote:
      'The Professional plan changed the way I travel. I step off a plane, schedule a locker drop, and my business clothing is back inside my closet the next morning.',
    rating: 5,
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150',
  },
  {
    id: '3',
    name: 'Aurelia Vance',
    role: 'Luxury Hotelier & Family Advocate',
    quote:
      'Washing bedsheets for a high-occupancy estate used to disrupt our schedule. FreshFold sanitizes our Italian cottons with natural scenting. Perfect care.',
    rating: 5,
    avatarUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150',
  },
];

// ---------------------------------------------------------------------------
// Booking options
// ---------------------------------------------------------------------------

/** Exact slot strings the website submits, so both surfaces read the same. */
export const PICKUP_TIME_SLOTS = [
  '08:00 AM - 11:00 AM (Morning Concierge)',
  '12:00 PM - 03:00 PM (Afternoon Transit)',
  '05:30 PM - 08:30 PM (Sunset Concierge)',
] as const;

export const SCENTS = [
  { id: 'Organic Lavender', label: 'Organic Lavender', surcharge: 5 },
  { id: 'Bespoke Eucalyptus & Tea-Tree', label: 'Eucalyptus & Tea-Tree', surcharge: 5 },
  {
    id: 'Fragrance-Free (Pure Hypoallergenic Soap)',
    label: 'Fragrance-Free',
    surcharge: 0,
  },
] as const;

export const STARCH_LEVELS = ['None', 'Light', 'Medium'] as const;

export interface SpecialtyAddon {
  id: string;
  label: string;
  description: string;
  price: number;
  iconName: string;
}

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

/**
 * The website's price estimator, kept behaviourally identical so a quote in the
 * app matches a quote on the site for the same selections. The add-on total is
 * this app's extension — the website has no add-on picker, and an empty
 * selection reproduces its number exactly.
 */
export function estimatePrice(input: {
  serviceName: string;
  scent: string;
  starch: string;
  addonIds?: string[];
}): number {
  return priceBreakdown(input).gross;
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
  /** Everything, which is what `estimatePrice` has always returned. */
  gross: number;
}

/**
 * The same arithmetic, itemised.
 *
 * A membership covers the laundry and not the extras, so the quote has to be
 * separable — `estimatePrice` returned one number and there was no way to waive
 * part of it. The sum is unchanged, so a quote here still matches the website's
 * for the same selections.
 */
export function priceBreakdown(input: {
  serviceName: string;
  scent: string;
  starch: string;
  addonIds?: string[];
}): PriceBreakdown {
  const { serviceName, scent, starch, addonIds = [] } = input;

  let base = 25;
  if (serviceName.includes('Washing')) base = 30;
  else if (serviceName.includes('Bed Sheets') || serviceName.includes('Linen')) base = 45;
  else if (
    serviceName.includes('Executive') ||
    serviceName.includes('Pro') ||
    serviceName.includes('Premium')
  ) {
    base = 55;
  } else if (serviceName.includes('Express') || serviceName.includes('Same-Day')) base = 50;
  else if (serviceName.includes('Car Detailing') || serviceName.includes('Detailing')) base = 150;
  else if (serviceName.includes('Home & Office') || serviceName.includes('Office Cleaning')) {
    base = 180;
  } else if (serviceName.includes('Sofa & Carpet') || serviceName.includes('Carpet Cleaning')) {
    base = 90;
  } else if (serviceName.includes('Fast Pickup') || serviceName.includes('Pickup & Delivery')) {
    base = 0; // Complimentary
  }

  // Scent and starch are garment finishes; they don't apply to a car or a sofa.
  let finishes = 0;
  if (isGarmentService(serviceName)) {
    if (!scent.startsWith('Fragrance-Free')) finishes += 5;
    if (starch !== 'None') finishes += 5;
  }

  const addons = SPECIALTY_ADDONS.filter((addon) => addonIds.includes(addon.id)).reduce(
    (total, addon) => total + addon.price,
    0
  );

  return { base, finishes, addons, laundry: base + finishes, gross: base + finishes + addons };
}

/**
 * Whether a membership's included pickups apply to this service.
 *
 * A laundry plan buys laundry. Car detailing, office cleaning and upholstery
 * are priced at ₵90–₵180 a visit and would otherwise let a Family member spend
 * eight included pickups on ₵1,440 of work for ₵289. Those get the member
 * discount instead.
 */
export function isPlanCoverable(serviceName: string): boolean {
  return isGarmentService(serviceName);
}

export function isGarmentService(serviceName: string): boolean {
  return (
    !serviceName.includes('Car Detailing') &&
    !serviceName.includes('Home & Office') &&
    !serviceName.includes('Sofa & Carpet')
  );
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export type PaymentChoice =
  | 'Paystack'
  | 'MTN MoMo'
  | 'Telecel Cash'
  | 'AT Money'
  | 'Card'
  | 'Wallet'
  | 'Pay on Pickup';

export const PAYMENT_METHODS: {
  id: PaymentChoice;
  label: string;
  blurb: string;
  iconName: string;
}[] = [
  {
    id: 'Paystack',
    label: 'Paystack checkout',
    blurb: 'Card, bank or mobile money via the secure hosted page.',
    iconName: 'ShieldCheck',
  },
  {
    id: 'Wallet',
    label: 'FreshFold wallet',
    blurb: 'Settle instantly from your stored balance.',
    iconName: 'Wallet',
  },
  {
    id: 'Pay on Pickup',
    label: 'Pay on pickup',
    blurb: 'Settle with the courier at the door.',
    iconName: 'Banknote',
  },
];

/** Networks that mean "send a mobile-money prompt", and the tag stored on the job. */
export const MOMO_NETWORKS: Partial<Record<PaymentChoice, 'MTN' | 'Telecel' | 'AT'>> = {
  'MTN MoMo': 'MTN',
  'Telecel Cash': 'Telecel',
  'AT Money': 'AT',
};

// ---------------------------------------------------------------------------
// Static marketing copy
// ---------------------------------------------------------------------------

export const HOW_IT_WORKS = [
  {
    id: 'schedule',
    title: 'Schedule',
    body: 'Pick a service, a window and an address. A quote is priced before you commit.',
    iconName: 'CalendarClock',
  },
  {
    id: 'collect',
    title: 'We collect',
    body: 'A courier arrives in your window, scans each bag onto the manifest and heads for the hub.',
    iconName: 'Bike',
  },
  {
    id: 'care',
    title: 'Artisan care',
    body: 'Sorted, treated, washed at fabric-appropriate temperatures, then hand-pressed.',
    iconName: 'Sparkles',
  },
  {
    id: 'return',
    title: 'Returned',
    body: 'Back at your door, folded or on hangers, with proof of delivery in the app.',
    iconName: 'PackageCheck',
  },
];

export const WHY_CHOOSE_US = [
  {
    id: 'tracking',
    title: 'Watch it happen',
    body: 'The courier’s real position, the stage your garments are in, the exact minute of arrival.',
    iconName: 'Radar',
  },
  {
    id: 'fabric',
    title: 'Fabric-first',
    body: 'Temperature, agitation and finish chosen per garment, not per load.',
    iconName: 'Shirt',
  },
  {
    id: 'eco',
    title: 'Gentle chemistry',
    body: 'Enzyme stain treatment and plant-derived detergents. Hypoallergenic on request.',
    iconName: 'Leaf',
  },
  {
    id: 'guarantee',
    title: 'Care guarantee',
    body: 'Anything not right gets re-treated at our cost. Report it from the order screen.',
    iconName: 'BadgeCheck',
  },
];

export const CUSTOMER_SEGMENTS = [
  {
    id: 'students',
    title: 'Students',
    body: 'Hostel pickups across Ayeduase, Kotei and campus halls, priced for a term budget.',
    serviceId: 'washing',
    iconName: 'GraduationCap',
  },
  {
    id: 'executives',
    title: 'Executives',
    body: 'Shirts pressed to a standard you can wear into a board room, back by morning.',
    serviceId: 'ironing-folding',
    iconName: 'Briefcase',
  },
  {
    id: 'homes',
    title: 'Homes & families',
    body: 'Bulk cycles with household separation, plus linens, upholstery and deep cleans.',
    serviceId: 'bedding-linens',
    iconName: 'House',
  },
  {
    id: 'business',
    title: 'Hotels & spas',
    body: 'Contract volumes with a named account manager and quality-assurance reporting.',
    serviceId: 'corporate',
    iconName: 'Building2',
  },
];

export const CONTACT = {
  phone: '+233 55 000 1234',
  whatsapp: '233550001234',
  email: 'concierge@freshfold.com',
  hours: 'Mon–Sat 07:00–21:00 · Sun 10:00–18:00',
  address: 'FreshFold Laundry Hub, Bomso Junction, Kumasi',
};
