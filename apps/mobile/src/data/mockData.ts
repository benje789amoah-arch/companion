/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LAUNDRY_HUB } from '@freshfold/core';
import { Order, RiderState, Message, Notification } from '../types';

/**
 * Offline seed data.
 *
 * The dispatch server is the real source of these records — this is what the
 * app falls back to when it cannot reach the server, so a rider with no signal
 * still opens to a working console instead of an empty one. Everything here is
 * replaced on the first successful poll.
 */

/** The hub, from the one geography both apps share. */
export const LAUNDRY_HUB_COORDS = { lat: LAUNDRY_HUB.lat, lng: LAUNDRY_HUB.lng };

export const INITIAL_RIDER: RiderState = {
  id: "FF-R-204",
  name: "",
  employeeId: "",
  avatar: "",
  vehicle: "",
  vehiclePlate: "",
  rating: 5.0,
  isOnline: false,
  batteryLevel: 100,
  gpsAccuracy: 1.5,
  speed: 0,
  heading: 180,
  coords: { lat: 6.6730, lng: -1.5700 }, // Near KNUST Main Gate / Commercial Area
  todayDistance: 0.0,
  todayEarnings: 0.0,
  completedCount: 0,
  onTimeRate: 100.0,
  acceptanceRate: 96.5,
  completionRate: 100
};

export const INITIAL_ORDERS: Order[] = [
  {
    id: "order-1",
    orderNumber: "FF-7801-PREMIUM",
    customerName: "Ama Serwaah",
    customerPhone: "+233 550 192 831",
    pickupAddress: "Unity Hall (Conti), Block C, Room 102",
    pickupCoords: { lat: 6.6765, lng: -1.5695 },
    deliveryAddress: "FreshFold Laundry Hub (KNUST Commercial Area)",
    deliveryCoords: LAUNDRY_HUB_COORDS,
    laundryType: "Traditional Kente Cloth & Silk Stole",
    bagCount: 2,
    bags: [
      { id: "BAG-1A", type: "Delicate Kente Thread", weight: "1.8kg", itemCount: 4, qrCode: "FF-BAG-7801-A", scanned: false },
      { id: "BAG-1B", type: "Premium Silk Care", weight: "2.1kg", itemCount: 3, qrCode: "FF-BAG-7801-B", scanned: false }
    ],
    priority: "elite",
    status: "assigned",
    distance: 0.8,
    estDuration: 5,
    price: 45.00,
    deadline: "Pickup by 19:30",
    specialInstructions: "Please handle the gold-threaded Kente with extreme reverence. Hand-wash and steam-press only. No hot water. Call when at the Unity Hall parking lot."
  },
  {
    id: "order-2",
    orderNumber: "FF-3402-STANDARD",
    customerName: "Kofi Mensah",
    customerPhone: "+233 240 419 844",
    pickupAddress: "Ayeduase Gate, Millennium Hostel",
    pickupCoords: { lat: 6.6685, lng: -1.5580 },
    deliveryAddress: "FreshFold Laundry Hub (KNUST Commercial Area)",
    deliveryCoords: LAUNDRY_HUB_COORDS,
    laundryType: "Linen Shirts & Designer Khakis",
    bagCount: 1,
    bags: [
      { id: "BAG-2A", type: "Daily Wear Cottons", weight: "5.4kg", itemCount: 18, qrCode: "FF-BAG-3402-A", scanned: false }
    ],
    priority: "standard",
    status: "ready_for_delivery",
    distance: 1.4,
    estDuration: 7,
    price: 24.50,
    deadline: "Deliver by 21:00",
    specialInstructions: "Scent-free premium organic detergents only. Double-fold all collared linen shirts, please."
  },
  {
    id: "order-3",
    orderNumber: "FF-9021-PRIORITY",
    customerName: "Adwoa Osei",
    customerPhone: "+233 500 887 261",
    pickupAddress: "Bomso, Jubilee Apartment Complex, Penthouse 4B",
    pickupCoords: { lat: 6.6835, lng: -1.5790 },
    deliveryAddress: "FreshFold Laundry Hub (KNUST Commercial Area)",
    deliveryCoords: LAUNDRY_HUB_COORDS,
    laundryType: "Premium Comforter Shell & Egyptian Sheets",
    bagCount: 3,
    bags: [
      { id: "BAG-3A", type: "Premium Duvet", weight: "6.2kg", itemCount: 1, qrCode: "FF-BAG-9021-A", scanned: false },
      { id: "BAG-3B", type: "Cotton Sheets", weight: "2.0kg", itemCount: 8, qrCode: "FF-BAG-9021-B", scanned: false },
      { id: "BAG-3C", type: "Pillow Cases", weight: "3.5kg", itemCount: 6, qrCode: "FF-BAG-9021-C", scanned: false }
    ],
    priority: "priority",
    status: "unassigned",
    distance: 1.6,
    estDuration: 8,
    price: 68.00,
    deadline: "Pickup by 20:00",
    specialInstructions: "Hot water wash for linens. Apply lavender natural scent mist. Leave with secure apartment gate desk if unavailable."
  },
  {
    id: "order-4",
    orderNumber: "FF-1109-ELITE",
    customerName: "Prof. Acheampong Office",
    customerPhone: "+233 200 991 111",
    pickupAddress: "KNUST Vice Chancellor Lodge, Lodge Hill Road",
    pickupCoords: { lat: 6.6775, lng: -1.5735 },
    deliveryAddress: "FreshFold Laundry Hub (KNUST Commercial Area)",
    deliveryCoords: LAUNDRY_HUB_COORDS,
    laundryType: "Academic Gowns & Velvet Hood Sets",
    bagCount: 2,
    bags: [
      { id: "BAG-4A", type: "University Academic Gown", weight: "4.5kg", itemCount: 3, qrCode: "FF-BAG-1109-A", scanned: false },
      { id: "BAG-4B", type: "Silk Robes & Academic Hoods", weight: "2.2kg", itemCount: 6, qrCode: "FF-BAG-1109-B", scanned: false }
    ],
    priority: "elite",
    status: "delivered",
    distance: 1.1,
    estDuration: 6,
    price: 110.00,
    deadline: "Completed Today 16:45",
    specialInstructions: "Signature required on delivery. Drop off directly at the private residence reception desk. Ask for Adama.",
    pickupPhoto: "https://images.unsplash.com/photo-1545173168-9f19472ef7f8?auto=format&fit=crop&q=80&w=300",
    pickupSignature: "MOCK_SIGNATURE_DATA_1",
    deliveryPhoto: "https://images.unsplash.com/photo-1541123437800-1bb1317badc2?auto=format&fit=crop&q=80&w=300",
    deliverySignature: "MOCK_SIGNATURE_DATA_2",
    deliveredAt: "2026-07-20T16:45:00-07:00"
  }
];

export const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: "notif-1",
    title: "New Premium Pickup Available",
    body: "An elite order from Ama Serwaah (Unity Hall) has been assigned to you. Touch to view route.",
    timestamp: "19:00",
    type: "order",
    orderId: "order-1",
    read: false
  },
  {
    id: "notif-2",
    title: "High Priority Active Alert",
    body: "Campus traffic is normal. All riders are requested to wear FreshFold signature ivory aprons.",
    timestamp: "18:30",
    type: "system",
    read: true
  },
  {
    id: "notif-3",
    title: "Customer Message Received",
    body: "Kofi Mensah: 'I added one additional bag of premium laundry. Can you update the count?'",
    timestamp: "18:15",
    type: "message",
    orderId: "order-2",
    read: true
  }
];

export const INITIAL_MESSAGES: Message[] = [
  {
    id: "msg-1",
    sender: "dispatcher",
    text: "Welcome back Emmanuel. You have been assigned the Ama Serwaah delicate collection. The customer is expecting you by 19:30.",
    timestamp: "19:01"
  },
  {
    id: "msg-2",
    sender: "customer",
    text: "Hello, I placed the bag of kente out on the bench, but I will be here to sign. Please let me know when you are outside.",
    timestamp: "19:03",
    orderId: "order-1"
  }
];
