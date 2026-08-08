/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  bookingToJob,
  type Booking,
  type Job,
  type JobStatus,
  type Message,
  type Notification,
  type RiderState,
} from '@freshfold/core';
import { hashPassword } from './auth';
import type { StoredAccount } from './store';

/**
 * Demo data for a fresh database.
 *
 * These are the four jobs the rider app used to hard-code as mock orders,
 * expressed as bookings and run through the same `bookingToJob` path a real
 * website submission takes. The point is that the seeded board and a
 * customer-created one are indistinguishable — no separate mock code path.
 */

interface SeedSpec {
  booking: Omit<Booking, 'status' | 'createdAt'>;
  status: JobStatus;
  riderId?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const today = () => new Date().toISOString().split('T')[0];
const tomorrow = () => new Date(Date.now() + DAY_MS).toISOString().split('T')[0];

const SEEDS: SeedSpec[] = [
  {
    status: 'assigned',
    riderId: 'FF-R-204',
    booking: {
      id: 'FFC-780145',
      name: 'Ama Serwaah',
      email: 'ama.serwaah@st.knust.edu.gh',
      phone: '+233 550 192 831',
      serviceType: 'Traditional Kente Cloth & Silk Stole',
      address: 'Unity Hall (Conti), Block C, Room 102',
      suburb: 'KNUST Campus',
      city: 'Kumasi',
      pickupDate: today(),
      pickupTime: '05:00 PM - 07:30 PM',
      deliveryDate: tomorrow(),
      specialInstructions:
        'Please handle the gold-threaded Kente with extreme reverence. Hand-wash and steam-press only. No hot water.',
      riderNote: 'Call when at the Unity Hall parking lot.',
      specialtyAddons: ['Sandalwood Silk Scent'],
      amount: 45,
      paymentStatus: 'Paid',
      paymentMethod: 'MTN MoMo',
      momoNetwork: 'MTN',
      transactionRef: 'TXN-MOMO-780145',
    },
  },
  {
    status: 'ready_for_delivery',
    riderId: 'FF-R-204',
    booking: {
      id: 'FFC-340288',
      name: 'Kofi Mensah',
      email: 'kofi.mensah@gmail.com',
      phone: '+233 240 419 844',
      serviceType: 'Linen Shirts & Designer Khakis',
      address: 'Millennium Hostel, Ayeduase Gate',
      suburb: 'Ayeduase',
      city: 'Kumasi',
      pickupDate: today(),
      pickupTime: '09:00 AM - 11:00 AM',
      deliveryDate: today(),
      specialInstructions:
        'Scent-free premium organic detergents only. Double-fold all collared linen shirts, please.',
      amount: 24.5,
      paymentStatus: 'Paid',
      paymentMethod: 'Card',
      transactionRef: 'TXN-CARD-340288',
    },
  },
  {
    status: 'unassigned',
    booking: {
      id: 'FFC-902133',
      name: 'Adwoa Osei',
      email: 'adwoa.osei@outlook.com',
      phone: '+233 500 887 261',
      serviceType: 'Premium Comforter Shell & Egyptian Sheets',
      address: 'Jubilee Apartment Complex, Penthouse 4B',
      suburb: 'Bomso',
      city: 'Kumasi',
      pickupDate: today(),
      pickupTime: '06:00 PM - 08:00 PM',
      deliveryDate: tomorrow(),
      specialInstructions:
        'Hot water wash for linens. Apply lavender natural scent mist. Leave with the secure apartment gate desk if unavailable.',
      specialtyAddons: ['French Lavender Scent Spray'],
      amount: 68,
      paymentStatus: 'Pay on Pickup',
      paymentMethod: 'Pay on Pickup',
    },
  },
  {
    status: 'delivered',
    riderId: 'FF-R-204',
    booking: {
      id: 'FFC-110977',
      name: "Prof. Acheampong's Office",
      email: 'vc.office@knust.edu.gh',
      phone: '+233 200 991 111',
      serviceType: 'Academic Gowns & Velvet Hood Sets',
      address: 'KNUST Vice Chancellor Lodge, Lodge Hill Road',
      suburb: 'KNUST Campus',
      city: 'Kumasi',
      pickupDate: today(),
      pickupTime: '02:00 PM - 04:00 PM',
      deliveryDate: today(),
      specialInstructions:
        'Signature required on delivery. Drop off directly at the private residence reception desk. Ask for Adama.',
      amount: 110,
      paymentStatus: 'Paid',
      paymentMethod: 'Card',
      transactionRef: 'TXN-CARD-110977',
    },
  },
];

export function seedJobs(): Job[] {
  return SEEDS.map(({ booking, status, riderId }) => {
    const job = bookingToJob({ ...booking, status: 'Scheduled', createdAt: new Date().toISOString() });

    job.status = status;
    job.dispatch.riderId = riderId;

    if (riderId) job.dispatch.assignedAt = new Date().toISOString();

    if (status === 'delivered') {
      job.dispatch.deliveredAt = new Date().toISOString();
      job.dispatch.pickedUpAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      job.dispatch.proof = {
        pickupPhoto:
          'https://images.unsplash.com/photo-1545173168-9f19472ef7f8?auto=format&fit=crop&q=80&w=300',
        pickupSignature: 'SEED_SIGNATURE_PICKUP',
        deliveryPhoto:
          'https://images.unsplash.com/photo-1541123437800-1bb1317badc2?auto=format&fit=crop&q=80&w=300',
        deliverySignature: 'SEED_SIGNATURE_DELIVERY',
      };
      job.dispatch.bags = job.dispatch.bags.map((bag) => ({ ...bag, scanned: true }));
    }

    if (status === 'ready_for_delivery') {
      job.dispatch.pickedUpAt = new Date(Date.now() - 90 * 60 * 1000).toISOString();
      job.dispatch.bags = job.dispatch.bags.map((bag) => ({ ...bag, scanned: true }));
    }

    return job;
  });
}

/** The rider the companion app signs in as. */
export const DEFAULT_RIDER_ID = 'FF-R-204';

export function seedRiders(): RiderState[] {
  return [
    {
      id: DEFAULT_RIDER_ID,
      name: '',
      employeeId: '',
      avatar: '',
      vehicle: '',
      vehiclePlate: '',
      rating: 5.0,
      isOnline: false,
      batteryLevel: 100,
      gpsAccuracy: 1.5,
      speed: 0,
      heading: 180,
      // Parked at the hub until the rider goes online.
      coords: { lat: 6.6852, lng: -1.5815 },
      todayDistance: 0,
      todayEarnings: 0,
      completedCount: 0,
      onTimeRate: 100,
      acceptanceRate: 96.5,
      completionRate: 100,
    },
  ];
}

export function seedMessages(): Message[] {
  return [
    {
      id: 'msg-seed-1',
      sender: 'dispatcher',
      text: 'Welcome back. You have been assigned the Ama Serwaah delicate collection. The customer is expecting you by 19:30.',
      timestamp: '19:01',
      orderId: 'FFC-780145',
    },
    {
      id: 'msg-seed-2',
      sender: 'customer',
      text: 'Hello, I placed the bag of kente out on the bench, but I will be here to sign. Please let me know when you are outside.',
      timestamp: '19:03',
      orderId: 'FFC-780145',
    },
  ];
}

export function seedNotifications(): Notification[] {
  return [
    {
      id: 'notif-seed-1',
      title: 'New Premium Pickup Available',
      body: 'An elite order from Ama Serwaah (Unity Hall) has been assigned to you. Touch to view route.',
      timestamp: '19:00',
      type: 'order',
      orderId: 'FFC-780145',
      read: false,
    },
    {
      id: 'notif-seed-2',
      title: 'High Priority Active Alert',
      body: 'Campus traffic is normal. All riders are requested to wear FreshFold signature ivory aprons.',
      timestamp: '18:30',
      type: 'system',
      read: true,
    },
  ];
}

/**
 * Demo accounts, all with the password `password` — hashed on the way in, like
 * any other account. There is no plaintext credential anywhere in the database.
 */
export const DEMO_PASSWORD = 'password';

export function seedAccounts(): StoredAccount[] {
  return SEEDS.map(({ booking }) => {
    const { salt, hash } = hashPassword(DEMO_PASSWORD);
    return {
      email: booking.email,
      phone: booking.phone,
      name: booking.name,
      points: 850,
      walletBalance: 120,
      createdAt: new Date().toISOString(),
      passwordSalt: salt,
      passwordHash: hash,
    };
  });
}
