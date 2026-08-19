import {
  MEMBERSHIP_PLANS,
  SERVICE_CATALOGUE,
  priceLabel,
  serviceById,
  type MembershipPlanId,
} from '@freshfold/core';
import { ServiceItem, SubscriptionPlan, Testimonial } from './types';

/**
 * The service cards.
 *
 * Name, description, price and category come from `@freshfold/core` so the
 * advert and the checkout are the same number — they used to be two, and on six
 * of eleven services they disagreed. What stays here is what only a browser
 * cares about: a `lucide-react` icon name and a photograph.
 */
const SERVICE_PRESENTATION: Record<string, { iconName: string; imageUrl: string }> = {
  washing: {
    iconName: 'Sparkles',
    imageUrl: 'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&q=80&w=800'
  },
  drying: {
    iconName: 'Wind',
    imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPI6SKSgSeb7TRH3tohbZVtJXr9VLQq8uyyryGaMA3AQ&s=10'
  },
  'ironing-folding': {
    iconName: 'Shirt',
    imageUrl: 'https://images.unsplash.com/photo-1489274495757-95c7c837b101?auto=format&fit=crop&q=80&w=800'
  },
  'stain-removal': {
    iconName: 'Droplet',
    imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&q=80&w=800'
  },
  'bedding-linens': {
    iconName: 'Bed',
    imageUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&q=80&w=800'
  },
  'express-laundry': {
    iconName: 'Zap',
    imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800'
  },
  'pickup-delivery': {
    iconName: 'Truck',
    imageUrl: 'https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&q=80&w=800'
  },
  'car-detailing': {
    iconName: 'Car',
    imageUrl: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&q=80&w=800'
  },
  'home-office-cleaning': {
    iconName: 'Home',
    imageUrl: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&q=80&w=800'
  },
  'sofa-carpet-cleaning': {
    iconName: 'Armchair',
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&q=80&w=800'
  },
  corporate: {
    iconName: 'Briefcase',
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800'
  }
};

export const SERVICES: ServiceItem[] = SERVICE_CATALOGUE.map((service) => ({
  id: service.id,
  name: service.name,
  description: service.description,
  priceInfo: priceLabel(service),
  category: service.category,
  ...SERVICE_PRESENTATION[service.id]
}));

/** Only these can become an order — see `bookable` in core's catalogue. */
export const BOOKABLE_SERVICE_ITEMS: ServiceItem[] = SERVICES.filter(
  (service) => serviceById(service.id)?.bookable
);

/**
 * How each plan is *presented*. What it costs and what it includes is in
 * `@freshfold/core`, and the two are joined below.
 *
 * Two things used to go wrong with these cards, and both were the same mistake
 * twice:
 *
 *  - **The price was written here.** `'₵79'` sat on the card while a number sat
 *    in the server's plan table, and nothing held them together. There is one
 *    number now, in core, and the card's string is derived from it.
 *  - **The bullets promised things nothing implemented.** "Free priority
 *    emergency delivery (1/month)", "Same-day express upgrades up to twice a
 *    month" and "Special discounted rates for bulk employee vouchers" are not
 *    features; no code has ever granted them. What a plan actually buys is a
 *    number of included pickups and a member rate on everything past them, both
 *    of which core enforces — so that is what the bullets say, matching the
 *    customer app word for word.
 *
 * Icon names are the one genuinely local field: these are `lucide-react`, and
 * the app's are `lucide-react-native`, which is why `Home` here is `House`
 * there.
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
      'Digital laundry history log'
    ]
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
      '15% member rate on anything beyond the four'
    ]
  },
  family: {
    tagline: 'Large bulk handling with individual-level garment separation.',
    iconName: 'Home',
    capacity: '100 lbs / month of heavy cycles',
    turnaround: 'Standard 24-hour delivery',
    benefits: [
      '8 pickups/month (twice per week), laundry included',
      'Strict fabric and household division rules',
      'Free plush duvet and bed sheet washing & ironing',
      '20% member rate on anything beyond the eight'
    ]
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
      '25% member rate on anything beyond the thirty'
    ]
  }
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = MEMBERSHIP_PLANS.map((plan) => ({
  ...PLAN_PRESENTATION[plan.id],
  id: plan.id,
  name: plan.name,
  price: `₵${plan.price}`,
  billing: 'billed monthly'
}));

/**
 * Loyalty tiers come from `@freshfold/core`.
 *
 * This file used to declare its own array, the customer app's catalogue
 * declared a second, and the client portal hardcoded a third inline — with
 * Silver starting at 400 points in the portal and 500 everywhere else. Nothing
 * rendered the Tailwind gradient fields that made a local copy look necessary,
 * so the copy is gone rather than reconciled.
 */
export { LOYALTY_TIERS } from '@freshfold/core';

export const TESTIMONIALS: Testimonial[] = [
  {
    id: '1',
    name: 'Seraphina Kensington',
    role: 'Creative Director & Fashion Consultant',
    quote: 'As someone with severe fabric standards, handling bespoke knitwear can trigger anxiety. FreshFold treats my garments as individual works of art.',
    rating: 5,
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150'
  },
  {
    id: '2',
    name: 'Jonathan Reynolds',
    role: 'Managing Partner at Reynolds Asset Management',
    quote: 'The Professional plan changed the way I travel. I step off a plane, schedule a locker drop, and my business clothing is back inside my closet the next morning.',
    rating: 5,
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150'
  },
  {
    id: '3',
    name: 'Aurelia Vance',
    role: 'Luxury Hotelier & Family Advocate',
    quote: 'Washing bedsheets for a high-occupancy estate used to disrupt our schedule. FreshFold sanitizes our Italian cottons with natural scenting. Perfect care.',
    rating: 5,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150'
  }
];
