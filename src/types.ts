/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OrderPriority = 'standard' | 'priority' | 'elite';

export type OrderStatus =
  | 'unassigned'
  | 'assigned'
  | 'navigating_to_pickup'
  | 'arrived_at_pickup'
  | 'pickup_scanned'
  | 'picked_up'
  | 'navigating_to_laundry'
  | 'arrived_at_laundry'
  | 'dropped_off'
  | 'processing'
  | 'ready_for_delivery'
  | 'navigating_to_delivery'
  | 'arrived_at_delivery'
  | 'delivered'
  | 'cancelled';

export interface Coords {
  lat: number;
  lng: number;
}

export interface LaundryBag {
  id: string;
  type: string;
  weight: string;
  itemCount: number;
  qrCode: string;
  scanned: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  pickupCoords: Coords;
  deliveryAddress: string;
  deliveryCoords: Coords;
  laundryType: string;
  bagCount: number;
  bags: LaundryBag[];
  priority: OrderPriority;
  status: OrderStatus;
  distance: number; // in km
  estDuration: number; // in mins
  price: number;
  deadline: string;
  specialInstructions?: string;
  pickupPhoto?: string;
  pickupSignature?: string;
  deliveryPhoto?: string;
  deliverySignature?: string;
  deliveryOtp?: string;
  assignedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
}

export interface RiderState {
  id: string;
  name: string;
  employeeId: string;
  avatar: string;
  vehicle: string;
  vehiclePlate: string;
  rating: number;
  isOnline: boolean;
  batteryLevel: number;
  gpsAccuracy: number; // in meters
  speed: number; // in km/h
  heading: number; // in degrees
  coords: Coords;
  todayDistance: number;
  todayEarnings: number;
  completedCount: number;
  onTimeRate: number; // e.g. 98.4
  acceptanceRate: number; // e.g. 96.0
  completionRate: number; // e.g. 100
}

export interface Message {
  id: string;
  sender: 'rider' | 'customer' | 'dispatcher' | 'laundry_center';
  text: string;
  timestamp: string;
  orderId?: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  type: 'order' | 'system' | 'message' | 'alert';
  orderId?: string;
  read: boolean;
}
