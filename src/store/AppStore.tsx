/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Coords,
  Message,
  Notification,
  Order,
  OrderStatus,
  RiderState,
} from '../types';
import {
  INITIAL_MESSAGES,
  INITIAL_NOTIFICATIONS,
  INITIAL_ORDERS,
  INITIAL_RIDER,
  LAUNDRY_HUB_COORDS,
} from '../data/mockData';
import { nowLabel } from '../theme';

const KEYS = {
  rider: 'freshfold_rider',
  orders: 'freshfold_orders',
  messages: 'freshfold_messages',
  notifications: 'freshfold_notifications',
} as const;

/** Where the rider is currently headed, if anywhere. */
export interface NavigationTarget {
  coords: Coords;
  label: string;
  /** Status the order moves to once the rider reaches this point. */
  arrivalStatus: OrderStatus;
}

interface AppState {
  hydrated: boolean;
  rider: RiderState;
  orders: Order[];
  messages: Message[];
  notifications: Notification[];
  activeOrder?: Order;
  backlogOrders: Order[];
  unreadCount: number;
  /** True while an order is in one of the `navigating_*` states. */
  isNavigating: boolean;
  navigationTarget: NavigationTarget | null;

  /** Marks arrival at the current navigation target. */
  arriveAtDestination: () => void;
  updateRider: (updates: Partial<RiderState>) => void;
  dispatchOrder: (orderId: string) => void;
  acceptOrder: (orderId: string) => void;
  declineOrder: (orderId: string) => void;
  updateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    photo?: string,
    signature?: string
  ) => void;
  sendRiderMessage: (text: string) => void;
  sendAdminMessage: (sender: 'dispatcher' | 'customer', text: string) => void;
  generateRandomOrder: () => void;
  markNotificationRead: (notifId: string) => void;
  resetSimulation: () => void;
}

const AppContext = createContext<AppState | null>(null);

/** KNUST campus bounding box — anything outside it is stale persisted data. */
function isOutsideCampus(coords?: Coords): boolean {
  if (!coords) return false;
  return coords.lat > 10 || coords.lat < 5 || coords.lng > 0 || coords.lng < -3;
}

/** Compass bearing from one point to another, in degrees. */
function bearingBetween(from: Coords, to: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Rough great-circle distance in km — good enough for an ETA readout. */
function distanceKm(from: Coords, to: Coords): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** How far apart two points are in raw degrees — the sim's arrival test. */
function degreeGap(from: Coords, to: Coords): number {
  return Math.hypot(to.lat - from.lat, to.lng - from.lng);
}

const ARRIVAL_THRESHOLD_DEGREES = 0.0003;
const SIM_TICK_MS = 950;
const SIM_STEP_FRACTION = 0.22;

async function loadPersisted<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [rider, setRider] = useState<RiderState>({ ...INITIAL_RIDER });
  const [orders, setOrders] = useState<Order[]>([...INITIAL_ORDERS]);
  const [messages, setMessages] = useState<Message[]>([...INITIAL_MESSAGES]);
  const [notifications, setNotifications] = useState<Notification[]>([
    ...INITIAL_NOTIFICATIONS,
  ]);

  const replyTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      replyTimers.current.forEach(clearTimeout);
      replyTimers.current = [];
    },
    []
  );

  // Hydrate from device storage once on launch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [savedRider, savedOrders, savedMessages, savedNotifs] = await Promise.all([
        loadPersisted<RiderState>(KEYS.rider, { ...INITIAL_RIDER }),
        loadPersisted<Order[]>(KEYS.orders, [...INITIAL_ORDERS]),
        loadPersisted<Message[]>(KEYS.messages, [...INITIAL_MESSAGES]),
        loadPersisted<Notification[]>(KEYS.notifications, [...INITIAL_NOTIFICATIONS]),
      ]);

      if (cancelled) return;

      // Guard against coordinates persisted by an older build of the app.
      const stale =
        isOutsideCampus(savedRider?.coords) ||
        (savedOrders ?? []).some((o) => isOutsideCampus(o?.pickupCoords));

      if (stale) {
        await AsyncStorage.multiRemove(Object.values(KEYS));
        setRider({ ...INITIAL_RIDER });
        setOrders([...INITIAL_ORDERS]);
        setMessages([...INITIAL_MESSAGES]);
        setNotifications([...INITIAL_NOTIFICATIONS]);
      } else {
        setRider(savedRider);
        setOrders(savedOrders);
        setMessages(savedMessages);
        setNotifications(savedNotifs);
      }

      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist each slice as it changes (never before hydration, or we'd clobber it).
  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(KEYS.rider, JSON.stringify(rider));
  }, [rider, hydrated]);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(KEYS.orders, JSON.stringify(orders));
  }, [orders, hydrated]);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(KEYS.messages, JSON.stringify(messages));
  }, [messages, hydrated]);

  useEffect(() => {
    if (hydrated) {
      AsyncStorage.setItem(KEYS.notifications, JSON.stringify(notifications));
    }
  }, [notifications, hydrated]);

  const activeOrder = useMemo(
    () =>
      orders.find(
        (o) =>
          o.status !== 'unassigned' &&
          o.status !== 'delivered' &&
          o.status !== 'cancelled'
      ),
    [orders]
  );

  const backlogOrders = useMemo(
    () => orders.filter((o) => o.status === 'unassigned'),
    [orders]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const navigationTarget = useMemo<NavigationTarget | null>(() => {
    if (!activeOrder) return null;

    switch (activeOrder.status) {
      case 'navigating_to_pickup':
        return {
          coords: activeOrder.pickupCoords,
          label: activeOrder.pickupAddress,
          arrivalStatus: 'arrived_at_pickup',
        };
      case 'navigating_to_laundry':
        return {
          coords: LAUNDRY_HUB_COORDS,
          label: 'FreshFold Central Laundry Hub',
          arrivalStatus: 'arrived_at_laundry',
        };
      case 'navigating_to_delivery':
        return {
          coords: activeOrder.deliveryCoords,
          label: activeOrder.deliveryAddress,
          arrivalStatus: 'arrived_at_delivery',
        };
      default:
        return null;
    }
  }, [activeOrder]);

  const isNavigating = navigationTarget !== null;

  const pushNotification = useCallback((notif: Omit<Notification, 'timestamp'>) => {
    setNotifications((prev) => [{ ...notif, timestamp: nowLabel() }, ...prev]);
  }, []);

  const updateRider = useCallback((updates: Partial<RiderState>) => {
    setRider((prev) => ({ ...prev, ...updates }));
  }, []);

  const dispatchOrder = useCallback(
    (orderId: string) => {
      const target = orders.find((o) => o.id === orderId);
      if (!target) return;

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'unassigned' } : o))
      );

      pushNotification({
        id: `notif-${Date.now()}`,
        title: 'New Premium Pickup Request',
        body: `Incoming elite order from ${target.customerName}. Accept within 15 seconds.`,
        type: 'order',
        orderId,
        read: false,
      });
    },
    [orders, pushNotification]
  );

  const acceptOrder = useCallback(
    (orderId: string) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'assigned' } : o))
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          sender: 'dispatcher',
          text: `${rider.name || 'Rider'} on ${rider.vehicle || 'Scooter'} (${
            rider.vehiclePlate || 'N/A'
          }) has accepted your contract and is preparing transit.`,
          timestamp: nowLabel(),
          orderId,
        },
      ]);
    },
    [rider.name, rider.vehicle, rider.vehiclePlate]
  );

  const declineOrder = useCallback(
    (orderId: string) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'unassigned' } : o))
      );

      pushNotification({
        id: `notif-${Date.now()}`,
        title: 'Order Returned to Backlog',
        body: `${rider.name || 'The rider'} declined order ${orderId}. Re-dispatch initiated.`,
        type: 'alert',
        read: false,
      });
    },
    [rider.name, pushNotification]
  );

  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, photo?: string, signature?: string) => {
      let target: Order | undefined;

      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          target = o;

          const updated: Order = { ...o, status };
          if (photo) {
            if (status === 'pickup_scanned') updated.pickupPhoto = photo;
            else updated.deliveryPhoto = photo;
          }
          if (signature) {
            if (status === 'picked_up') updated.pickupSignature = signature;
            else updated.deliverySignature = signature;
          }
          if (status === 'picked_up') updated.pickedUpAt = new Date().toISOString();
          if (status === 'delivered') updated.deliveredAt = new Date().toISOString();
          return updated;
        })
      );

      if (!target) return;

      // Keep the dispatcher feed alive alongside the workflow.
      const name = rider.name || 'Rider';
      const script: Partial<Record<OrderStatus, string>> = {
        navigating_to_pickup: `${name} is navigating to KNUST Area Pickup Address: ${target.pickupAddress}.`,
        arrived_at_pickup: `${name} has arrived outside. Preparing deluxe canvas bag validation scans.`,
        picked_up: `Pristine pickup documented and confirmed. ${name} is securing garments on the scooter for transit to the Central Hub.`,
        navigating_to_laundry: 'Rider is traveling towards FreshFold Central Hub.',
        dropped_off:
          'Garments checked in successfully at sterilization hub. Beginning meticulous organic cleaning process.',
        navigating_to_delivery: `Scent-infused clean garments are packaged and transit is active. ${name} is navigating to delivery point.`,
        delivered:
          'Concierge delivery complete. Garments handed off beautifully. Thank you for choosing FreshFold.',
      };

      const text = script[status];
      if (!text) return;

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          sender: 'dispatcher',
          text,
          timestamp: nowLabel(),
          orderId,
        },
      ]);
    },
    [rider.name]
  );

  const arriveAtDestination = useCallback(() => {
    if (!activeOrder || !navigationTarget) return;
    updateOrderStatus(activeOrder.id, navigationTarget.arrivalStatus);
  }, [activeOrder, navigationTarget, updateOrderStatus]);

  /**
   * GPS simulation. Lives here rather than in the map component so it ticks
   * exactly once no matter how many screens are showing a map.
   */
  useEffect(() => {
    if (!navigationTarget) return;

    const from = rider.coords;
    const to = navigationTarget.coords;

    if (degreeGap(from, to) < ARRIVAL_THRESHOLD_DEGREES) {
      arriveAtDestination();
      return;
    }

    const timer = setTimeout(() => {
      const next: Coords = {
        lat: from.lat + (to.lat - from.lat) * SIM_STEP_FRACTION,
        lng: from.lng + (to.lng - from.lng) * SIM_STEP_FRACTION,
      };

      setRider((prev) => ({
        ...prev,
        coords: next,
        heading: bearingBetween(from, to),
        speed: Math.round((distanceKm(from, next) / (SIM_TICK_MS / 1000)) * 3600),
      }));
    }, SIM_TICK_MS);

    return () => clearTimeout(timer);
  }, [navigationTarget, rider.coords, arriveAtDestination]);

  /**
   * The hub "processes" a drop-off on its own. Driving it from the store rather
   * than the scanner callback means the order still ripens if the rider
   * navigates away mid-cycle.
   */
  useEffect(() => {
    const processing = orders.find((o) => o.status === 'dropped_off');
    if (!processing) return;

    const timer = setTimeout(() => {
      updateOrderStatus(processing.id, 'ready_for_delivery');
    }, 4000);

    return () => clearTimeout(timer);
  }, [orders, updateOrderStatus]);

  // Park the speedometer whenever the scooter is not in transit.
  useEffect(() => {
    if (!navigationTarget) {
      setRider((prev) => (prev.speed === 0 ? prev : { ...prev, speed: 0 }));
    }
  }, [navigationTarget]);

  const sendRiderMessage = useCallback(
    (text: string) => {
      const orderId = activeOrder?.id;

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-rider-${Date.now()}`,
          sender: 'rider',
          text,
          timestamp: nowLabel(),
          orderId,
        },
      ]);

      // Dispatch "replies" a few seconds later so the console feels staffed.
      const timer = setTimeout(() => {
        const lowered = text.toLowerCase();
        let replyText = 'Copy that. Operational details synchronized with the Admin Dashboard.';

        if (lowered.includes('arrived') || lowered.includes('lobby')) {
          replyText =
            'Understood. The customer has been alerted and will receive you in the lounge. Safe handling requested.';
        } else if (lowered.includes('delay') || lowered.includes('traffic')) {
          replyText =
            'Coordinates received. ETA updated in customer client portal. Continue with caution.';
        } else if (lowered.includes('sig') || lowered.includes('otp')) {
          replyText = 'Digital receipt ledger is open. Signature received successfully.';
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `msg-dispatcher-${Date.now()}`,
            sender: 'dispatcher',
            text: replyText,
            timestamp: nowLabel(),
            orderId,
          },
        ]);

        pushNotification({
          id: `notif-chat-${Date.now()}`,
          title: 'New Dispatch Message',
          body: replyText,
          type: 'message',
          read: false,
        });

        replyTimers.current = replyTimers.current.filter((t) => t !== timer);
      }, 3000);

      replyTimers.current.push(timer);
    },
    [activeOrder?.id, pushNotification]
  );

  const sendAdminMessage = useCallback(
    (sender: 'dispatcher' | 'customer', text: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-admin-${Date.now()}`,
          sender,
          text,
          timestamp: nowLabel(),
          orderId: activeOrder?.id,
        },
      ]);

      pushNotification({
        id: `notif-admin-${Date.now()}`,
        title: sender === 'dispatcher' ? 'Dispatch Alert' : 'Customer Update',
        body: text,
        type: sender === 'dispatcher' ? 'system' : 'message',
        read: false,
      });
    },
    [activeOrder?.id, pushNotification]
  );

  const generateRandomOrder = useCallback(() => {
    const names = [
      'Prof. Acheampong',
      'Dr. Emmanuel Boateng',
      'Ama Serwaah',
      'Kofi Mensah',
      'Adwoa Osei',
      'Kwabena Appiah',
      'Abena Danso',
      'Nana Yaw Boateng',
    ];
    const garments = [
      'Traditional Kente Cloth',
      'Premium Cotton Smock (Fugu)',
      'Delicate Hand-woven Lace Dress',
      'Academic Gown & Hood',
      'Linen Shirts & Designer Khakis',
      'Organic Cotton Bed Sheets',
    ];
    const locations = [
      'Unity Hall (Conti), Block C',
      'University Hall (Katanga), Room 205',
      'Ayeduase Gate, Millennium Hostel',
      'Bomso, Jubilee Apartment Complex',
      'Kotei, Shalom Haven Residency',
      'Kentinkrono, Royal Park Gardens',
      'Republic Hall, Block A',
    ];

    const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

    const price = Math.floor(Math.random() * 60) + 35;
    const distance = parseFloat((Math.random() * 2 + 0.8).toFixed(1));
    const bagCount = Math.floor(Math.random() * 2) + 1;
    const orderNum = Math.floor(Math.random() * 9000) + 1000;

    const newOrder: Order = {
      id: `order-${Date.now()}`,
      orderNumber: `FF-${orderNum}-PREMIUM`,
      customerName: pick(names),
      customerPhone: `+233 ${Math.floor(200 + Math.random() * 800)} ${Math.floor(
        100 + Math.random() * 900
      )} ${Math.floor(100 + Math.random() * 900)}`,
      pickupAddress: pick(locations),
      pickupCoords: {
        lat: 6.6745 + (Math.random() * 0.02 - 0.01),
        lng: -1.5716 + (Math.random() * 0.02 - 0.01),
      },
      deliveryAddress: 'FreshFold Laundry Hub (Commercial Area)',
      deliveryCoords: { lat: 6.6745, lng: -1.5716 },
      laundryType: pick(garments),
      bagCount,
      bags: Array.from({ length: bagCount }).map((_, i) => ({
        id: `BAG-${orderNum}-${String.fromCharCode(65 + i)}`,
        type: i === 0 ? 'Delicate Organics' : 'Premium Textiles',
        weight: `${(Math.random() * 3 + 1).toFixed(1)}kg`,
        itemCount: Math.floor(Math.random() * 5) + 3,
        qrCode: `FF-BAG-${orderNum}-${String.fromCharCode(65 + i)}`,
        scanned: false,
      })),
      priority: 'elite',
      status: 'unassigned',
      distance,
      estDuration: Math.round(distance * 4),
      price,
      deadline: `Pickup by ${new Date(Date.now() + 45 * 60 * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      specialInstructions:
        'Handle with white-glove standards. Place in individual organic cotton covers. Call upon arrival.',
    };

    setOrders((prev) => [newOrder, ...prev]);

    pushNotification({
      id: `notif-inject-${Date.now()}`,
      title: 'Backlog Item Created',
      body: `New luxury order ${newOrder.orderNumber} for ${newOrder.customerName} added to dispatch backlog queue.`,
      type: 'system',
      read: false,
    });
  }, [pushNotification]);

  const markNotificationRead = useCallback((notifId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    );
  }, []);

  const resetSimulation = useCallback(async () => {
    replyTimers.current.forEach(clearTimeout);
    replyTimers.current = [];

    await AsyncStorage.multiRemove(Object.values(KEYS));
    setRider({ ...INITIAL_RIDER });
    setOrders([...INITIAL_ORDERS]);
    setMessages([...INITIAL_MESSAGES]);
    setNotifications([...INITIAL_NOTIFICATIONS]);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      hydrated,
      rider,
      orders,
      messages,
      notifications,
      activeOrder,
      backlogOrders,
      unreadCount,
      isNavigating,
      navigationTarget,
      arriveAtDestination,
      updateRider,
      dispatchOrder,
      acceptOrder,
      declineOrder,
      updateOrderStatus,
      sendRiderMessage,
      sendAdminMessage,
      generateRandomOrder,
      markNotificationRead,
      resetSimulation,
    }),
    [
      hydrated,
      rider,
      orders,
      messages,
      notifications,
      activeOrder,
      backlogOrders,
      unreadCount,
      isNavigating,
      navigationTarget,
      arriveAtDestination,
      updateRider,
      dispatchOrder,
      acceptOrder,
      declineOrder,
      updateOrderStatus,
      sendRiderMessage,
      sendAdminMessage,
      generateRandomOrder,
      markNotificationRead,
      resetSimulation,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
