import { ServiceItem, SubscriptionPlan, Testimonial } from './types';

export const SERVICES: ServiceItem[] = [
  {
    id: 'washing',
    name: 'Washing (Machine & Hand Wash)',
    description: 'Bespoke hand-care treatments for fine silks and cashmere, alongside temperature-regulated drum-washing for designer garments.',
    priceInfo: 'From ₵15 / load',
    iconName: 'Sparkles',
    category: 'core',
    imageUrl: 'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'drying',
    name: 'Gentle Air drying',
    description: 'Controlled low-heat dehydration that prevents thermal shrinkage, restoring original fabric lift and wool elasticity.',
    priceInfo: 'Included with Wash',
    iconName: 'Wind',
    category: 'core',
    imageUrl: 'https://images.unsplash.com/photo-1489274495757-95c7c837b101?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'ironing-folding',
    name: 'Ironing & Folding',
    description: 'Crisp hand-pressed steam finishes and pristine laser-line boutique folding, ready for direct closet placement.',
    priceInfo: 'From ₵3.50 / item',
    iconName: 'Shirt',
    category: 'core',
    imageUrl: 'https://images.unsplash.com/photo-1489274495757-95c7c837b101?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'stain-removal',
    name: 'Advanced Stain Removal',
    description: 'Targeted eco-friendly enzyme treatment of individual spots that safely releases red wine, oil, and coffee stains.',
    priceInfo: 'From ₵8 / item',
    iconName: 'Droplet',
    category: 'specialized',
    imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'bedding-linens',
    name: 'Bed Sheets & Linens Care',
    description: 'Sanitizing hot-water cycles paired with ultra-soft, organic floral-extract formulas for high-thread-count sheets.',
    priceInfo: 'From ₵25 / set',
    iconName: 'Bed',
    category: 'specialized',
    imageUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'express-laundry',
    name: 'Express Same-Day Laundry',
    description: 'A dedicated expedited sequence. Collected from your home by 9:00 AM, delivered freshly pressed by 7:30 PM.',
    priceInfo: '+₵15 premium surcharge',
    iconName: 'Zap',
    category: 'express',
    imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'pickup-delivery',
    name: 'Fast Pickup & Delivery',
    description: 'Convenient, reliable, on time, every time. Direct real-time GPS-tracked prompt logistics ensuring your orders are received and returned exactly on your clock.',
    priceInfo: 'Complimentary',
    iconName: 'Truck',
    category: 'express',
    imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'car-detailing',
    name: 'Bespoke Car Detailing',
    description: 'We restore, shine and protect your ride. High-end hand steam, polymer sealant wax coating, and deep interior/exterior detail detailing.',
    priceInfo: 'From ₵150 / ride',
    iconName: 'Car',
    category: 'specialized',
    imageUrl: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'home-office-cleaning',
    name: 'Home & Office Cleaning',
    description: 'Spotless spaces, and healthier living. Deep-steam surface sanitizing, precise dust eradication, and natural aromatherapy allergen-free deodorizing.',
    priceInfo: 'From ₵180 / space',
    iconName: 'Home',
    category: 'specialized',
    imageUrl: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'sofa-carpet-cleaning',
    name: 'Sofa & Carpet Cleaning',
    description: 'Deep clean for a fresher, safer home. Heavy-duty hot water extraction, stain neutralization, and antibacterial fabric protectants for all upholstery.',
    priceInfo: 'From ₵90 / unit',
    iconName: 'Armchair',
    category: 'specialized',
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'corporate',
    name: 'Corporate Contracts',
    description: 'Continuous continuous logistics and custom care protocols for boutique hotels, premium spas, high-end fitness studios, and corporate offices.',
    priceInfo: 'Custom Enterprise Quotes',
    iconName: 'Briefcase',
    category: 'specialized',
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800'
  }
];

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'student',
    name: 'Student Club Plan',
    tagline: 'Worry-free fabric care built around class schedules.',
    price: '₵79',
    billing: 'billed monthly',
    iconName: 'GraduationCap',
    capacity: '20 lbs / month of laundry',
    turnaround: 'Next-day turnaround standard',
    benefits: [
      '2 scheduled pickups per month',
      'Complimentary organic hypoallergenic soap',
      'Free standard machine-wash & tumble dry',
      'Digital laundry history log'
    ]
  },
  {
    id: 'professional',
    name: 'Professional Concierge',
    tagline: 'Always-pristine formal shirts, business ensembles and suits.',
    price: '₵149',
    billing: 'billed monthly',
    popular: true,
    iconName: 'Briefcase',
    capacity: '45 lbs / month + 10 ironed items',
    turnaround: 'Next-day turnaround standard',
    benefits: [
      'Weekly automated door-side pickups',
      'Complimentary delicate handwashing for custom knits',
      'Boutique hanger delivery with garment shielding',
      'Free priority emergency delivery (1/month)'
    ]
  },
  {
    id: 'family',
    name: 'Infinite Family Plan',
    tagline: 'Large bulk handling with individual-level garment separation.',
    price: '₵289',
    billing: 'billed monthly',
    iconName: 'Home',
    capacity: '100 lbs / month of heavy cycles',
    turnaround: 'Standard 24-hour delivery',
    benefits: [
      '8 pickups/month (twice per week)',
      'Strict fabric and household division rules',
      'Free plush duvet and bed sheet washing & ironing',
      'Same-day express upgrades up to twice a month'
    ]
  },
  {
    id: 'corporate',
    name: 'Corporate Executive',
    tagline: 'Custom high-frequency care for premium enterprises.',
    price: '₵499',
    billing: 'billed monthly',
    iconName: 'Crown',
    capacity: '200 lbs / month + customizable setups',
    turnaround: 'Same-day turnaround prioritized',
    benefits: [
      'Daily pickup options with dedicated account manager',
      'White-glove quality assurance reports',
      'Express stain restoration guarantee',
      'Special discounted rates for bulk employee vouchers'
    ]
  }
];

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
