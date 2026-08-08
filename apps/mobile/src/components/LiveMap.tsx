/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Activity, Minus, Navigation, Plus } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';
import { LAUNDRY_HUB_COORDS } from '../data/mockData';
import { NavigationTarget } from '../store/AppStore';
import { colors, formatCedis, radius, shadow, tints } from '../theme';
import { Coords, Order, RiderState } from '../types';
import MapFallback from './MapFallback';
import { Badge, Button, Divider } from './ui';

interface LiveMapProps {
  rider: RiderState;
  orders: Order[];
  activeOrder?: Order;
  navigationTarget: NavigationTarget | null;
  /** Order the map should fly to, set when arriving from another screen. */
  focusedOrderId?: string | null;
  onSelectOrder?: (order: Order) => void;
  onAcceptOrder?: (orderId: string) => void;
}

const DEFAULT_DELTA = 0.012;

function toRegion(coords: Coords, delta = DEFAULT_DELTA): Region {
  return {
    latitude: coords.lat,
    longitude: coords.lng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

/**
 * Keeps a map failure contained. `react-native-maps` is a native view, so a
 * missing module or a bad Google Maps key on the device throws while rendering
 * — without this the whole screen (and the rider's active job) goes with it.
 */
class MapBoundary extends React.Component<
  { fallback: (message: string) => React.ReactNode; children: React.ReactNode },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    console.warn('[LiveMap] native map failed to render, showing fallback:', error);
  }

  render() {
    if (this.state.message !== null) return this.props.fallback(this.state.message);
    return this.props.children;
  }
}

export default function LiveMap(props: LiveMapProps) {
  return (
    <MapBoundary
      fallback={(message) => (
        <MapFallback
          {...props}
          notice={`The map could not be loaded on this device (${message}). Everything else on this screen still works.`}
        />
      )}
    >
      <NativeLiveMap {...props} />
    </MapBoundary>
  );
}

function NativeLiveMap({
  rider,
  orders,
  activeOrder,
  navigationTarget,
  focusedOrderId,
  onSelectOrder,
  onAcceptOrder,
}: LiveMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Custom marker views must stop re-rendering into the map texture once they
  // have painted, or Android drops frames on every rider tick.
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTracksViewChanges(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const visibleOrders = useMemo(
    () => orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
    [orders]
  );

  // A pin tapped on another screen wins the camera.
  useEffect(() => {
    if (!focusedOrderId) return;
    const found = orders.find((o) => o.id === focusedOrderId);
    if (!found) return;

    setSelectedOrder(found);
    mapRef.current?.animateToRegion(toRegion(found.pickupCoords, 0.005), 600);
  }, [focusedOrderId, orders]);

  // Frame the whole leg when a new destination is set, then follow the rider.
  const legKey = navigationTarget
    ? `${navigationTarget.coords.lat},${navigationTarget.coords.lng}`
    : null;

  useEffect(() => {
    if (!navigationTarget || !mapRef.current) return;

    mapRef.current.fitToCoordinates(
      [
        { latitude: rider.coords.lat, longitude: rider.coords.lng },
        { latitude: navigationTarget.coords.lat, longitude: navigationTarget.coords.lng },
      ],
      {
        edgePadding: { top: 110, right: 60, bottom: 190, left: 60 },
        animated: true,
      }
    );
    // Re-framing on every rider tick would fight the follow-cam below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legKey]);

  useEffect(() => {
    if (!navigationTarget || selectedOrder) return;
    mapRef.current?.animateCamera(
      { center: { latitude: rider.coords.lat, longitude: rider.coords.lng } },
      { duration: 800 }
    );
  }, [rider.coords.lat, rider.coords.lng, navigationTarget, selectedOrder]);

  const routeCoordinates = navigationTarget
    ? [
        { latitude: rider.coords.lat, longitude: rider.coords.lng },
        { latitude: navigationTarget.coords.lat, longitude: rider.coords.lng },
        { latitude: navigationTarget.coords.lat, longitude: navigationTarget.coords.lng },
      ]
    : [];

  const routeColor = activeOrder?.priority === 'elite' ? colors.brandGold : colors.brandSage;

  const recenter = () => {
    mapRef.current?.animateToRegion(toRegion(rider.coords, 0.006), 500);
  };

  const zoomBy = (factor: number) => {
    mapRef.current?.getCamera().then((camera) => {
      if (camera.zoom != null) {
        mapRef.current?.animateCamera({ zoom: camera.zoom + factor }, { duration: 250 });
      } else if (camera.altitude != null) {
        // Apple Maps reports altitude instead of a zoom level.
        mapRef.current?.animateCamera(
          { altitude: camera.altitude / Math.pow(2, factor) },
          { duration: 250 }
        );
      }
    });
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={toRegion(rider.coords)}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        onPress={() => setSelectedOrder(null)}
      >
        {/* Central laundry hub */}
        <Marker
          coordinate={{ latitude: LAUNDRY_HUB_COORDS.lat, longitude: LAUNDRY_HUB_COORDS.lng }}
          tracksViewChanges={tracksViewChanges}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.hubMarker}>
            <View style={styles.hubDot}>
              <View style={styles.hubDiamond} />
            </View>
            <Text style={styles.hubLabel}>FreshFold Hub</Text>
          </View>
        </Marker>

        {/* Pickup pins */}
        {visibleOrders.map((order) => {
          const isSelected = selectedOrder?.id === order.id;
          const isActive = activeOrder?.id === order.id;

          return (
            <Marker
              key={order.id}
              coordinate={{
                latitude: order.pickupCoords.lat,
                longitude: order.pickupCoords.lng,
              }}
              tracksViewChanges={tracksViewChanges || isSelected}
              anchor={{ x: 0.5, y: 1 }}
              onPress={(e) => {
                e.stopPropagation();
                setSelectedOrder(order);
                onSelectOrder?.(order);
              }}
            >
              <View style={styles.pinWrapper}>
                <View
                  style={[
                    styles.pin,
                    isSelected && styles.pinSelected,
                    !isSelected && isActive && styles.pinActive,
                  ]}
                >
                  <View
                    style={[
                      styles.pinDot,
                      (isSelected || isActive) && { backgroundColor: '#FFFFFF' },
                    ]}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.pinLabel,
                      (isSelected || isActive) && { color: '#FFFFFF' },
                    ]}
                  >
                    {order.customerName}
                  </Text>
                </View>
                <Text style={styles.pinSubLabel} numberOfLines={1}>
                  📍 {order.pickupAddress.split(',')[0]}
                </Text>
              </View>
            </Marker>
          );
        })}

        {/* The rider */}
        <Marker
          coordinate={{ latitude: rider.coords.lat, longitude: rider.coords.lng }}
          tracksViewChanges={tracksViewChanges}
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={rider.heading}
          flat
          zIndex={40}
        >
          <View style={styles.riderHalo}>
            <View style={styles.riderDot}>
              <Navigation size={14} color="#FFFFFF" fill="#FFFFFF" />
            </View>
          </View>
        </Marker>

        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={routeColor}
            strokeWidth={4}
            lineCap="round"
          />
        )}
      </MapView>

      {/* GPS quality + map controls */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.gpsBadge}>
          <Activity size={13} color={colors.statusSuccess} />
          <View>
            <Text style={styles.gpsTitle}>GPS High Accuracy</Text>
            <Text style={styles.gpsSub}>KNUST Campus Grid</Text>
          </View>
        </View>

        <View style={styles.mapControls}>
          <Pressable
            onPress={recenter}
            accessibilityLabel="Recenter map on rider"
            style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
          >
            <Navigation size={16} color={colors.brandSage} />
          </Pressable>
          <Pressable
            onPress={() => zoomBy(1)}
            accessibilityLabel="Zoom in"
            style={({ pressed }) => [
              styles.controlButton,
              styles.controlSmall,
              pressed && styles.controlPressed,
            ]}
          >
            <Plus size={14} color={colors.textCharcoal} />
          </Pressable>
          <Pressable
            onPress={() => zoomBy(-1)}
            accessibilityLabel="Zoom out"
            style={({ pressed }) => [
              styles.controlButton,
              styles.controlSmall,
              pressed && styles.controlPressed,
            ]}
          >
            <Minus size={14} color={colors.textCharcoal} />
          </Pressable>
        </View>
      </View>

      {/* Tapped pin detail */}
      {selectedOrder && (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.detailTitleRow}>
                <Text style={styles.detailName} numberOfLines={1}>
                  {selectedOrder.customerName}
                </Text>
                <Badge
                  label={selectedOrder.priority}
                  tone={selectedOrder.priority === 'elite' ? 'gold' : 'sage'}
                />
              </View>
              <Text style={styles.detailOrderNumber}>{selectedOrder.orderNumber}</Text>
            </View>
            <Pressable
              onPress={() => setSelectedOrder(null)}
              hitSlop={10}
              accessibilityLabel="Dismiss pin details"
            >
              <Text style={styles.detailClose}>✕</Text>
            </Pressable>
          </View>

          <Divider style={{ marginVertical: 8 }} />

          <Text style={styles.detailAddress}>📍 {selectedOrder.pickupAddress}</Text>
          <Text style={styles.detailCoords}>
            {selectedOrder.pickupCoords.lat.toFixed(4)}° N,{' '}
            {Math.abs(selectedOrder.pickupCoords.lng).toFixed(4)}° W
          </Text>

          <View style={styles.detailStatsRow}>
            <Text style={styles.detailStat}>{selectedOrder.distance} km</Text>
            <Text style={styles.detailStat}>{selectedOrder.estDuration} min</Text>
            <Text style={[styles.detailStat, { color: colors.brandSage, fontWeight: '700' }]}>
              {formatCedis(selectedOrder.price)}
            </Text>
          </View>

          {selectedOrder.status === 'unassigned' && onAcceptOrder && (
            <Button
              label="Accept task at location"
              onPress={() => {
                onAcceptOrder(selectedOrder.id);
                setSelectedOrder(null);
              }}
              style={{ marginTop: 10 }}
            />
          )}
        </View>
      )}

      {/* Turn-by-turn strip */}
      {navigationTarget && activeOrder && !selectedOrder && (
        <View style={styles.navCard}>
          <View style={styles.navIcon}>
            <Navigation size={16} color={colors.brandSage} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.navTitle} numberOfLines={1}>
              {activeOrder.status === 'navigating_to_pickup'
                ? 'Navigating to pickup'
                : activeOrder.status === 'navigating_to_laundry'
                  ? 'Navigating to laundry hub'
                  : 'Navigating to delivery'}
            </Text>
            <Text style={styles.navSubtitle} numberOfLines={1}>
              {navigationTarget.label}
            </Text>
          </View>
          <View style={styles.navMetrics}>
            <Text style={styles.navDistance}>{activeOrder.distance} km</Text>
            <Text style={styles.navEta}>Est. {activeOrder.estDuration} min</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgLinen,
    overflow: 'hidden',
  },

  /* markers */
  hubMarker: { alignItems: 'center' },
  hubDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brandSage,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.xs,
  },
  hubDiamond: {
    width: 7,
    height: 7,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
  },
  hubLabel: {
    marginTop: 3,
    fontSize: 8,
    fontWeight: '700',
    color: colors.textCharcoal,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  pinWrapper: { alignItems: 'center', maxWidth: 150 },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: colors.brandSage,
    ...shadow.xs,
  },
  pinSelected: {
    backgroundColor: colors.brandSage,
    borderColor: '#FFFFFF',
  },
  pinActive: {
    backgroundColor: colors.brandGold,
    borderColor: '#FFFFFF',
  },
  pinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandSage,
  },
  pinLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.brandSage,
    maxWidth: 90,
  },
  pinSubLabel: {
    marginTop: 2,
    fontSize: 7.5,
    fontWeight: '600',
    color: colors.textCharcoal,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  riderHalo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tints.sage20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.brandSage,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },

  /* overlays */
  topOverlay: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...shadow.md,
  },
  gpsTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textCharcoal,
  },
  gpsSub: { fontSize: 8, color: colors.textSlate, marginTop: 1 },
  mapControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  controlButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  controlSmall: { width: 32, height: 32, borderRadius: 16 },
  controlPressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },

  detailCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: tints.sage30,
    padding: 14,
    ...shadow.lg,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textCharcoal,
    flexShrink: 1,
  },
  detailOrderNumber: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.brandGold,
    marginTop: 2,
  },
  detailClose: { fontSize: 14, color: colors.textSlate, paddingHorizontal: 4 },
  detailAddress: { fontSize: 11.5, fontWeight: '600', color: colors.textCharcoal },
  detailCoords: {
    fontSize: 10,
    color: colors.textSlate,
    marginTop: 3,
    ...Platform.select({ ios: { fontFamily: 'Menlo' }, android: { fontFamily: 'monospace' } }),
  },
  detailStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  detailStat: { fontSize: 11, color: colors.textCharcoal },

  navCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: tints.sage20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadow.md,
  },
  navIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: tints.sage10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: { fontSize: 12, fontWeight: '800', color: colors.textCharcoal },
  navSubtitle: { fontSize: 10, color: colors.textSlate, marginTop: 1 },
  navMetrics: {
    alignItems: 'flex-end',
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSoft,
    paddingLeft: 10,
  },
  navDistance: { fontSize: 12, fontWeight: '700', color: colors.brandSage },
  navEta: { fontSize: 9, color: colors.textSlate },
});
