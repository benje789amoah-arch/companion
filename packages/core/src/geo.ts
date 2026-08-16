/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Coords } from './types';

/**
 * One geography for both apps.
 *
 * The web build and the rider build had drifted onto different hub
 * coordinates (Bomso Junction vs. the KNUST Commercial Area), which meant the
 * customer's live map and the rider's map disagreed about where the garments
 * were going. Bomso Junction wins — it is the address the marketing site,
 * the route polylines and the landmark table were all already built around.
 */
export const LAUNDRY_HUB: Coords & { name: string } = {
  lat: 6.6852,
  lng: -1.5815,
  name: 'FreshFold Care Headquarters',
};

export const LAUNDRY_HUB_ADDRESS = 'FreshFold Laundry Hub (Bomso Junction)';

/** Suburbs FreshFold collects from, and the anchor pin for each. */
export const SUBURB_COORDS: Record<string, Coords> = {
  Bomso: { lat: 6.6845, lng: -1.5802 },
  Ayeduase: { lat: 6.6685, lng: -1.5524 },
  Kotei: { lat: 6.6565, lng: -1.5515 },
  Deduako: { lat: 6.6515, lng: -1.5621 },
  Boadi: { lat: 6.6815, lng: -1.5412 },
  'KNUST Campus': { lat: 6.6725, lng: -1.5645 },
};

export const SERVICE_SUBURBS = Object.keys(SUBURB_COORDS);

/**
 * The anchor pin for a suburb named in free text.
 *
 * The customer app offers a fixed list, but the website's booking form is a
 * text box — "ayeduase", "Ayeduase Newsite", "KNUST campus" all mean a suburb
 * we serve, and none of them is a key in the table. Loose on purpose, and
 * falling back to the middle of campus rather than to nothing, because this
 * only ever decides where a map opens.
 */
export function anchorForSuburb(suburb: string): Coords {
  const exact = SUBURB_COORDS[suburb];
  if (exact) return { ...exact };

  const needle = (suburb || '').trim().toLowerCase();
  if (needle) {
    const match = Object.keys(SUBURB_COORDS).find(
      (key) => needle.includes(key.toLowerCase()) || key.toLowerCase().includes(needle)
    );
    if (match) return { ...SUBURB_COORDS[match] };
  }

  return { ...SUBURB_COORDS['KNUST Campus'] };
}

export interface Landmark {
  name: string;
  lat: number;
  lng: number;
  suburb: string;
  type: 'hostel' | 'landmark' | 'hub';
  description: string;
}

export const LANDMARKS: Landmark[] = [
  { name: 'FreshFold Laundry Hub', lat: 6.6852, lng: -1.5815, suburb: 'Bomso', type: 'hub', description: 'FreshFold Premium Apparel Processing & Steam-Press Sanctuary' },
  { name: 'Evandy Hostel', lat: 6.6685, lng: -1.5524, suburb: 'Ayeduase', type: 'hostel', description: 'Popular private student residency with luxury care dropoff lockers' },
  { name: 'Frontline Hostel', lat: 6.6695, lng: -1.5511, suburb: 'Ayeduase', type: 'hostel', description: 'Major student hostel equipped with standard FreshFold pickup service' },
  { name: 'Wundua Hostel', lat: 6.6692, lng: -1.5539, suburb: 'Ayeduase', type: 'hostel', description: 'High-density student accommodation off the Ayeduase high street' },
  { name: 'Brunei Complex', lat: 6.6661, lng: -1.5658, suburb: 'KNUST Campus', type: 'hostel', description: 'Postgraduate hostel block' },
  { name: 'Unity Hall (Conti)', lat: 6.6749, lng: -1.5721, suburb: 'KNUST Campus', type: 'hostel', description: 'Premier on-campus male hall' },
  { name: 'University Hall (Katanga)', lat: 6.6791, lng: -1.5699, suburb: 'KNUST Campus', type: 'hostel', description: 'Legendary student hall with on-demand laundry dispatch services' },
  { name: 'Queens Hall', lat: 6.6752, lng: -1.5684, suburb: 'KNUST Campus', type: 'hostel', description: 'All-inclusive student hall with active FreshFold pickup lockers' },
  { name: 'Republic Hall', lat: 6.6738, lng: -1.5602, suburb: 'KNUST Campus', type: 'hostel', description: 'Central on-campus mixed hall with designated laundry points' },
  { name: 'Independence Hall', lat: 6.6715, lng: -1.5582, suburb: 'KNUST Campus', type: 'hostel', description: 'Designated on-campus hall with direct courier access' },
  { name: 'SRC Hostel', lat: 6.6645, lng: -1.5495, suburb: 'KNUST Campus', type: 'hostel', description: 'Large student residence complex off the main campus drive' },
  { name: 'De-Grace Hostel', lat: 6.6582, lng: -1.5492, suburb: 'Kotei', type: 'hostel', description: 'Premium private off-campus hostel block' },
  { name: 'Kotei Town Square', lat: 6.6565, lng: -1.5515, suburb: 'Kotei', type: 'landmark', description: 'Central hub of the Kotei community' },
  { name: 'Deduako Court', lat: 6.6515, lng: -1.5621, suburb: 'Deduako', type: 'landmark', description: 'Developing student residential suites' },
  { name: 'Boadi Junction Hub', lat: 6.6815, lng: -1.5412, suburb: 'Boadi', type: 'landmark', description: 'Access gateway to pristine Boadi residential estates' },
];

/**
 * Bounding box for the service area.
 *
 * Coordinates outside it are stale, corrupt, or not ours: the apps use it to
 * decide whether persisted state survives an upgrade, the booking route uses it
 * to refuse a pickup pin, and the directions proxy uses it as the only thing
 * standing between a billed Google endpoint and the open internet.
 *
 * That last caller is why this is drawn tightly. It used to be a whole degree
 * square — roughly 110 km on a side, from north of Mampong to past Obuasi —
 * which let anybody walk arbitrary routes through the proxy and call it Kumasi.
 * These bounds are Greater Kumasi with room to grow: every landmark, suburb
 * anchor and hub below sits well inside them, as does the city centre and the
 * airport, while the box is about a sixteenth of the area.
 */
export const SERVICE_AREA_BOUNDS = {
  minLat: 6.55,
  maxLat: 6.8,
  minLng: -1.75,
  maxLng: -1.45,
} as const;

export function isOutsideServiceArea(coords?: Coords): boolean {
  if (!coords) return true;
  return (
    coords.lat > SERVICE_AREA_BOUNDS.maxLat ||
    coords.lat < SERVICE_AREA_BOUNDS.minLat ||
    coords.lng > SERVICE_AREA_BOUNDS.maxLng ||
    coords.lng < SERVICE_AREA_BOUNDS.minLng
  );
}

/**
 * A stable pin for a free-text address.
 *
 * Bookings are typed by hand ("Gaza Hostel, Room 304") and there is no
 * geocoder in the loop, so an address is hashed to a small deterministic
 * offset from its suburb anchor. Same address, same pin, every time — which is
 * what makes the customer's map and the rider's map agree.
 */
export function coordsForAddress(address: string, suburb?: string): Coords {
  const base = (suburb && SUBURB_COORDS[suburb]) || SUBURB_COORDS['KNUST Campus'];
  if (!address) return { ...base };

  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash << 5) - hash + address.charCodeAt(i);
    hash |= 0;
  }

  return {
    lat: base.lat + ((Math.abs(hash) % 80) - 40) * 0.0001,
    lng: base.lng + ((Math.abs(hash >> 3) % 80) - 40) * 0.0001,
  };
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km — accurate enough for an ETA readout. */
export function distanceKm(from: Coords, to: Coords): number {
  const R = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Compass bearing from one point to another, in degrees. */
export function bearingBetween(from: Coords, to: Coords): number {
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Straight-line separation in metres. */
export function metresBetween(from: Coords, to: Coords): number {
  return distanceKm(from, to) * 1000;
}

/**
 * Arrival.
 *
 * Reaching a destination is what flips an order from `navigating_*` to
 * `arrived_*`, which is a real claim: the customer is told their courier is at
 * the door, and the pickup checklist opens. So it is a test against metres on
 * the ground, and against how much the device's own fix can be trusted.
 *
 * `ARRIVAL_RADIUS_M` is a doorway rather than a street — close enough that
 * "arrived" is true from anywhere inside it, tight enough that the building
 * next door is outside it.
 */
export const ARRIVAL_RADIUS_M = 35;

/**
 * The worst fix worth acting on.
 *
 * A phone reporting ±120 m has no idea which side of the road it is on, and a
 * position that vague cannot confirm a 35 m arrival — it would fire from
 * halfway down the street, or refuse to fire while the courier stands at the
 * door. Such a fix is still fine for drawing the courier on a map, which is
 * why this is a threshold for acting rather than for believing at all.
 */
export const MAX_ACTIONABLE_ACCURACY_M = 50;

/** Whether a fix is precise enough to base a status change on. */
export function isActionableFix(accuracyM?: number | null): boolean {
  return typeof accuracyM === 'number' && accuracyM > 0 && accuracyM <= MAX_ACTIONABLE_ACCURACY_M;
}

/**
 * Whether a reported position is close enough, and sure enough of itself, to
 * count as arrived. A fix the device cannot vouch for never arrives anywhere —
 * the courier confirms by hand instead, which is a button they already have.
 */
export function hasArrivedAt(position: Coords, target: Coords, accuracyM?: number | null): boolean {
  if (!isActionableFix(accuracyM)) return false;
  return metresBetween(position, target) <= ARRIVAL_RADIUS_M;
}

/**
 * A heading is only meaningful above walking pace. Standing still, the compass
 * derived from consecutive fixes is noise, and feeding it to a map turns the
 * courier's arrow into a spinner.
 */
export const MIN_HEADING_SPEED_KMH = 4;

/** Average scooter speed on campus roads, used for every ETA in the system. */
export const AVERAGE_SPEED_KMH = 18;

export function etaMinutes(from: Coords, to: Coords): number {
  return Math.max(1, Math.round((distanceKm(from, to) / AVERAGE_SPEED_KMH) * 60));
}
