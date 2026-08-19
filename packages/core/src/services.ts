/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What FreshFold sells, and what each thing costs.
 *
 * The price used to be written twice per service and the two were not the same
 * number. A marketing string sat on the catalogue card — `'From ₵15 / load'` —
 * and the charge came from a separate cascade of `serviceType.includes(…)`
 * branches in the pricing module. Six of the eleven services disagreed:
 *
 *  - Washing advertised ₵15 and charged ₵30.
 *  - Ironing & Folding advertised ₵3.50 an item and charged ₵25 an order.
 *  - Bed Sheets & Linens advertised ₵25 and charged ₵45.
 *  - Gentle Air drying advertised *"Included with Wash"* and charged ₵25 to
 *    anyone who booked it on its own.
 *  - Corporate Contracts advertised "Custom Enterprise Quotes" and charged ₵25,
 *    which is not what an enterprise contract costs and never was.
 *
 * The last two were not mispriced so much as not bookable: drying is part of a
 * wash and a corporate contract is a conversation. Both are `bookable: false`
 * here and neither appears in a booking form, because a ₵25 order for work
 * nobody agreed to do is worse than an advert that is merely wrong.
 *
 * One number per service now, and {@link priceLabel} derives the advert from
 * it, so the card and the checkout cannot drift apart again.
 *
 * Presentation is deliberately absent — no icons, no images. Those differ per
 * surface (`lucide-react` against `lucide-react-native`, hex against Tailwind)
 * and each app joins its own to this table.
 */

export type ServiceCategory = 'core' | 'specialized' | 'express';

export interface ServiceDefinition {
  id: string;
  /**
   * The label the customer picks, and the exact string a booking stores in
   * `serviceType`. Changing it changes what every existing booking is worth —
   * see the legacy note on `basePriceFor`.
   */
  name: string;
  description: string;
  category: ServiceCategory;
  /**
   * What a booking for this service is charged, before finishes and add-ons.
   * The one place this number is written down.
   */
  price: number;
  /** What that price buys: a load, a set, a ride. Builds the advert. */
  unit: string;
  /**
   * Whether a fabric finish — scent, starch — means anything here.
   *
   * A car, a sofa and an office do not take one. Neither does a bare courier
   * run: `Fast Pickup & Delivery` advertises "Complimentary" and was quoting ₵5,
   * because the finish pickers applied to anything that was not on the old
   * blacklist of three, and moving a bag is not garment care. Stated per service
   * rather than inferred from the name, which is how that was missed.
   */
  garment: boolean;
  /**
   * Whether this can be the service on a booking.
   *
   * False for work that is only ever sold alongside something else, or that is
   * quoted rather than priced. A non-bookable service is still shown on the
   * marketing pages — it is part of what the business does — it just cannot be
   * turned into an order at a price nobody quoted.
   */
  bookable: boolean;
  /**
   * Replaces the derived advert where a number is the wrong answer: work that
   * is bundled into another service, or quoted case by case.
   */
  priceNote?: string;
}

export const SERVICE_CATALOGUE: ServiceDefinition[] = [
  {
    id: 'washing',
    garment: true,
    name: 'Washing (Machine & Hand Wash)',
    description:
      'Bespoke hand-care treatments for fine silks and cashmere, alongside temperature-regulated drum-washing for designer garments.',
    category: 'core',
    price: 30,
    unit: 'load',
    bookable: true,
  },
  {
    id: 'drying',
    garment: true,
    name: 'Gentle Air drying',
    description:
      'Controlled low-heat dehydration that prevents thermal shrinkage, restoring original fabric lift and wool elasticity.',
    category: 'core',
    price: 0,
    unit: 'load',
    bookable: false,
    priceNote: 'Included with Wash',
  },
  {
    id: 'ironing-folding',
    garment: true,
    name: 'Ironing & Folding',
    description:
      'Crisp hand-pressed steam finishes and pristine laser-line boutique folding, ready for direct closet placement.',
    category: 'core',
    price: 25,
    unit: 'order',
    bookable: true,
  },
  {
    id: 'stain-removal',
    garment: true,
    name: 'Advanced Stain Removal',
    description:
      'Targeted eco-friendly enzyme treatment of individual spots that safely releases red wine, oil, and coffee stains.',
    category: 'specialized',
    price: 25,
    unit: 'order',
    bookable: true,
  },
  {
    id: 'bedding-linens',
    garment: true,
    name: 'Bed Sheets & Linens Care',
    description:
      'Sanitizing hot-water cycles paired with ultra-soft, organic floral-extract formulas for high-thread-count sheets.',
    category: 'specialized',
    price: 45,
    unit: 'set',
    bookable: true,
  },
  {
    id: 'express-laundry',
    garment: true,
    name: 'Express Same-Day Laundry',
    description:
      'A dedicated expedited sequence. Collected from your home by 9:00 AM, delivered freshly pressed by 7:30 PM.',
    category: 'express',
    price: 50,
    unit: 'order',
    bookable: true,
  },
  {
    id: 'pickup-delivery',
    garment: false,
    name: 'Fast Pickup & Delivery',
    description:
      'Convenient, reliable, on time, every time. Direct real-time GPS-tracked logistics ensuring your orders are received and returned exactly on your clock.',
    category: 'express',
    price: 0,
    unit: 'order',
    bookable: true,
    priceNote: 'Complimentary',
  },
  {
    id: 'car-detailing',
    garment: false,
    name: 'Bespoke Car Detailing',
    description:
      'We restore, shine and protect your ride. High-end hand steam, polymer sealant wax coating, and deep interior/exterior detailing.',
    category: 'specialized',
    price: 150,
    unit: 'ride',
    bookable: true,
  },
  {
    id: 'home-office-cleaning',
    garment: false,
    name: 'Home & Office Cleaning',
    description:
      'Spotless spaces, and healthier living. Deep-steam surface sanitizing, precise dust eradication, and natural aromatherapy allergen-free deodorizing.',
    category: 'specialized',
    price: 180,
    unit: 'space',
    bookable: true,
  },
  {
    id: 'sofa-carpet-cleaning',
    garment: false,
    name: 'Sofa & Carpet Cleaning',
    description:
      'Deep clean for a fresher, safer home. Heavy-duty hot water extraction, stain neutralization, and antibacterial fabric protectants for all upholstery.',
    category: 'specialized',
    price: 90,
    unit: 'unit',
    bookable: true,
  },
  {
    id: 'corporate',
    garment: false,
    name: 'Corporate Contracts',
    description:
      'Continuous logistics and custom care protocols for boutique hotels, premium spas, high-end fitness studios, and corporate offices.',
    category: 'specialized',
    price: 0,
    unit: 'contract',
    bookable: false,
    priceNote: 'Custom Enterprise Quotes',
  },
];

/** The services a booking form may offer. */
export const BOOKABLE_SERVICES = SERVICE_CATALOGUE.filter((service) => service.bookable);

export function serviceById(id: string): ServiceDefinition | null {
  return SERVICE_CATALOGUE.find((service) => service.id === id) ?? null;
}

/** By the exact `serviceType` string a booking carries. */
export function serviceByName(name: string): ServiceDefinition | null {
  const wanted = (name ?? '').trim();
  return SERVICE_CATALOGUE.find((service) => service.name === wanted) ?? null;
}

/**
 * The advert, derived from the charge.
 *
 * Every card on every surface renders this rather than a string somebody typed
 * next to the price, which is the whole point of the table.
 */
export function priceLabel(service: ServiceDefinition): string {
  if (service.priceNote) return service.priceNote;
  return `From ₵${service.price} / ${service.unit}`;
}
