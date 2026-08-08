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
  ApiError,
  LAUNDRY_HUB,
  bearingBetween,
  degreeGap,
  distanceKm,
  isOutsideServiceArea,
  type Coords,
  type Message,
  type Notification,
  type Order,
  type OrderStatus,
  type RiderState,
} from '@freshfold/core';
import {
  INITIAL_MESSAGES,
  INITIAL_NOTIFICATIONS,
  INITIAL_ORDERS,
  INITIAL_RIDER,
  LAUNDRY_HUB_COORDS,
} from '../data/mockData';
import { RIDER_ID, api } from '../services/api';
import { nowLabel } from '../theme';

/**
 * Rider-side domain state.
 *
 * The dispatch server owns the job board; this provider is the phone's view of
 * it. Reads come from a poll, writes go out immediately and are applied
 * locally first so the UI never waits on the network — a rider halfway up a
 * stairwell should still be able to mark a pickup complete.
 *
 * When the server is unreachable everything keeps working against local state
 * and AsyncStorage, exactly as it did before there was a server. `connected`
 * says which mode we are in so the UI can be honest about it.
 */

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
  /** True while the dispatch server is answering. */
  connected: boolean;
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

const ARRIVAL_THRESHOLD_DEGREES = 0.0003;
const SIM_TICK_MS = 950;
const SIM_STEP_FRACTION = 0.22;
const POLL_INTERVAL_MS = 4000;
/** Don't spam the server with every simulated GPS tick. */
const TELEMETRY_INTERVAL_MS = 3000;

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
  const [connected, setConnected] = useState(false);
  const [rider, setRider] = useState<RiderState>({ ...INITIAL_RIDER });
  const [orders, setOrders] = useState<Order[]>([...INITIAL_ORDERS]);
  const [messages, setMessages] = useState<Message[]>([...INITIAL_MESSAGES]);
  const [notifications, setNotifications] = useState<Notification[]>([
    ...INITIAL_NOTIFICATIONS,
  ]);

  const replyTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /**
   * Non-zero while a write is on the wire. A poll that lands mid-write carries
   * a snapshot from before the change, and applying it would visibly rewind
   * the workflow the rider just advanced.
   */
  const inFlight = useRef(0);

  useEffect(
    () => () => {
      replyTimers.current.forEach(clearTimeout);
      replyTimers.current = [];
    },
    []
  );

  /**
   * Runs a write against the server, holding the poll off while it is in
   * flight. Rethrows — callers that need to tell a rejection apart from a
   * dropped connection use this directly.
   */
  const track = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    inFlight.current += 1;
    try {
      const result = await operation();
      setConnected(true);
      return result;
    } finally {
      inFlight.current -= 1;
    }
  }, []);

  /**
   * Fire-and-forget write. Any failure just means the app is offline for now;
   * the local state stands and the next poll reconciles.
   */
  const push = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T | null> => {
      try {
        return await track(operation);
      } catch {
        setConnected(false);
        return null;
      }
    },
    [track]
  );

  // Hydrate from device storage once on launch, so the first frame has data
  // even before the server answers.
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
        isOutsideServiceArea(savedRider?.coords) ||
        (savedOrders ?? []).some((o) => isOutsideServiceArea(o?.pickupCoords));

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

  /**
   * Pull the board from the server.
   *
   * The rider's own telemetry (position, speed, heading) is deliberately *not*
   * overwritten: this device is the authority on where it is, and the server's
   * copy is always a few seconds behind what we just sent it.
   */
  const pull = useCallback(async () => {
    if (inFlight.current > 0) return;

    try {
      const [serverOrders, serverMessages, serverNotifications, serverRider] =
        await Promise.all([
          api.listOrders({ riderId: RIDER_ID }),
          api.listMessages(),
          api.listNotifications(),
          api.getRider(RIDER_ID),
        ]);

      if (inFlight.current > 0) return;

      setOrders(serverOrders);
      setMessages(serverMessages);
      setNotifications(serverNotifications);
      setRider((prev) => ({
        ...prev,
        rating: serverRider.rating,
        todayDistance: serverRider.todayDistance,
        todayEarnings: serverRider.todayEarnings,
        completedCount: serverRider.completedCount,
        onTimeRate: serverRider.onTimeRate,
        acceptanceRate: serverRider.acceptanceRate,
        completionRate: serverRider.completionRate,
      }));
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  // Poll for anything the customer, the admin dashboard or the hub changed.
  useEffect(() => {
    if (!hydrated) return;

    void pull();
    const timer = setInterval(() => void pull(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hydrated, pull]);

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
          label: LAUNDRY_HUB.name,
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

  const pushNotification = useCallback(
    (notif: Omit<Notification, 'timestamp'>) => {
      setNotifications((prev) => [{ ...notif, timestamp: nowLabel() }, ...prev]);
      void push(() => api.postNotification({ ...notif, timestamp: nowLabel() }));
    },
    [push]
  );

  const updateRider = useCallback(
    (updates: Partial<RiderState>) => {
      setRider((prev) => ({ ...prev, ...updates }));

      // Profile and presence changes matter to the customer's live map, so
      // they go up straight away rather than waiting for the telemetry tick.
      const { name, employeeId, vehicle, vehiclePlate, isOnline, batteryLevel } = updates;
      if (
        name !== undefined ||
        employeeId !== undefined ||
        vehicle !== undefined ||
        vehiclePlate !== undefined ||
        isOnline !== undefined ||
        batteryLevel !== undefined
      ) {
        void push(() =>
          api.updateRider(RIDER_ID, {
            name,
            employeeId,
            vehicle,
            vehiclePlate,
            isOnline,
            batteryLevel,
          })
        );
      }
    },
    [push]
  );

  /** Optimistic local patch for one order. */
  const patchOrder = useCallback((orderId: string, updates: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)));
  }, []);

  const dispatchOrder = useCallback(
    (orderId: string) => {
      const target = orders.find((o) => o.id === orderId);
      if (!target) return;

      patchOrder(orderId, { status: 'unassigned' });
      void push(() => api.updateOrderStatus(orderId, { status: 'unassigned' }));

      pushNotification({
        id: `notif-${Date.now()}`,
        title: 'New Premium Pickup Request',
        body: `Incoming elite order from ${target.customerName}. Accept within 15 seconds.`,
        type: 'order',
        orderId,
        read: false,
      });
    },
    [orders, patchOrder, push, pushNotification]
  );

  const acceptOrder = useCallback(
    (orderId: string) => {
      patchOrder(orderId, { status: 'assigned' });

      void (async () => {
        try {
          await track(() => api.acceptOrder(orderId, RIDER_ID));
        } catch (error) {
          // Two very different failures land here and they need opposite
          // handling: a 409 means another rider has the job and this phone must
          // let go of it, while a transport failure means we're offline and the
          // optimistic accept should stand until the rider reconnects.
          if (error instanceof ApiError) {
            setConnected(true);
            patchOrder(orderId, { status: 'unassigned' });
            pushNotification({
              id: `notif-conflict-${Date.now()}`,
              title: 'Job No Longer Available',
              body: error.message,
              type: 'alert',
              orderId,
              read: false,
            });
          } else {
            setConnected(false);
          }
        }
      })();
    },
    [patchOrder, pushNotification, track]
  );

  const declineOrder = useCallback(
    (orderId: string) => {
      patchOrder(orderId, { status: 'unassigned' });
      void push(() => api.declineOrder(orderId, RIDER_ID));

      pushNotification({
        id: `notif-${Date.now()}`,
        title: 'Order Returned to Backlog',
        body: `${rider.name || 'The rider'} declined order ${orderId}. Re-dispatch initiated.`,
        type: 'alert',
        read: false,
      });
    },
    [patchOrder, push, pushNotification, rider.name]
  );

  const updateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, photo?: string, signature?: string) => {
      const isPickupLeg =
        status === 'navigating_to_pickup' ||
        status === 'arrived_at_pickup' ||
        status === 'pickup_scanned' ||
        status === 'picked_up';

      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;

          const updated: Order = { ...o, status };
          if (photo) {
            if (isPickupLeg) updated.pickupPhoto = photo;
            else updated.deliveryPhoto = photo;
          }
          if (signature) {
            if (isPickupLeg) updated.pickupSignature = signature;
            else updated.deliverySignature = signature;
          }
          if (status === 'picked_up') updated.pickedUpAt = new Date().toISOString();
          if (status === 'delivered') updated.deliveredAt = new Date().toISOString();
          return updated;
        })
      );

      // Offline, nothing else is going to credit the completion, so do it here.
      // Online the server owns these totals and the next poll brings them back.
      if (status === 'delivered' && !connected) {
        const completed = orders.find((o) => o.id === orderId);
        setRider((prev) => ({
          ...prev,
          completedCount: prev.completedCount + 1,
          todayEarnings: Number((prev.todayEarnings + (completed?.price ?? 0)).toFixed(2)),
          todayDistance: Number((prev.todayDistance + (completed?.distance ?? 0)).toFixed(2)),
        }));
      }

      // The customer-facing narration for each step is written by the server,
      // so both the rider's chat and the client portal show the same thread.
      void push(() =>
        api.updateOrderStatus(orderId, { status, riderId: RIDER_ID, photo, signature })
      );
    },
    [connected, orders, push]
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
   * Publish position to the server on a slow tick. This is what puts a moving
   * courier on the customer's dispatch map, so it runs whenever the rider is
   * online — not only while navigating.
   */
  const telemetryRef = useRef(rider);
  telemetryRef.current = rider;

  useEffect(() => {
    if (!hydrated || !rider.isOnline) return;

    const timer = setInterval(() => {
      const current = telemetryRef.current;
      void push(() =>
        api.updateRider(RIDER_ID, {
          coords: current.coords,
          speed: current.speed,
          heading: current.heading,
          batteryLevel: current.batteryLevel,
          gpsAccuracy: current.gpsAccuracy,
          isOnline: current.isOnline,
        })
      );
    }, TELEMETRY_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [hydrated, rider.isOnline, push]);

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

  const postMessage = useCallback(
    (message: Message) => {
      setMessages((prev) => [...prev, message]);
      void push(() => api.postMessage(message));
    },
    [push]
  );

  const sendRiderMessage = useCallback(
    (text: string) => {
      const orderId = activeOrder?.id;

      postMessage({
        id: `msg-rider-${Date.now()}`,
        sender: 'rider',
        text,
        timestamp: nowLabel(),
        orderId,
      });

      // Dispatch "replies" a few seconds later so the console feels staffed.
      // The reply is posted to the server too, so the customer sees the same
      // exchange in their portal.
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

        postMessage({
          id: `msg-dispatcher-${Date.now()}`,
          sender: 'dispatcher',
          text: replyText,
          timestamp: nowLabel(),
          orderId,
        });

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
    [activeOrder?.id, postMessage, pushNotification]
  );

  const sendAdminMessage = useCallback(
    (sender: 'dispatcher' | 'customer', text: string) => {
      postMessage({
        id: `msg-admin-${Date.now()}`,
        sender,
        text,
        timestamp: nowLabel(),
        orderId: activeOrder?.id,
      });

      pushNotification({
        id: `notif-admin-${Date.now()}`,
        title: sender === 'dispatcher' ? 'Dispatch Alert' : 'Customer Update',
        body: text,
        type: sender === 'dispatcher' ? 'system' : 'message',
        read: false,
      });
    },
    [activeOrder?.id, postMessage, pushNotification]
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
      // Same `FFC-` identity scheme the website issues, so a simulated job is
      // indistinguishable from a real booking once it reaches the server.
      id: `FFC-${Math.floor(100000 + Math.random() * 900000)}`,
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
      deliveryAddress: LAUNDRY_HUB.name,
      deliveryCoords: LAUNDRY_HUB_COORDS,
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
    void push(() => api.createOrder(newOrder));

    pushNotification({
      id: `notif-inject-${Date.now()}`,
      title: 'Backlog Item Created',
      body: `New luxury order ${newOrder.orderNumber} for ${newOrder.customerName} added to dispatch backlog queue.`,
      type: 'system',
      read: false,
    });
  }, [push, pushNotification]);

  const markNotificationRead = useCallback(
    (notifId: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
      );
      void push(() => api.markNotificationRead(notifId));
    },
    [push]
  );

  const resetSimulation = useCallback(async () => {
    replyTimers.current.forEach(clearTimeout);
    replyTimers.current = [];

    await AsyncStorage.multiRemove(Object.values(KEYS));
    setRider({ ...INITIAL_RIDER });
    setOrders([...INITIAL_ORDERS]);
    setMessages([...INITIAL_MESSAGES]);
    setNotifications([...INITIAL_NOTIFICATIONS]);

    // Reset the shared board too, otherwise the next poll would immediately
    // restore everything this just cleared.
    await push(() => fetch(`${api.baseUrl}/api/reset`, { method: 'POST' }));
    await pull();
  }, [pull, push]);

  const value = useMemo<AppState>(
    () => ({
      hydrated,
      connected,
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
      connected,
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
