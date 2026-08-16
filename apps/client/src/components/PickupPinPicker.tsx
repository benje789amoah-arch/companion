/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Home } from 'lucide-react-native';
import React, { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import type { Coords } from '@freshfold/core';
import { MAP_PROVIDER } from '@freshfold/rn-maps';
import PickupPinPanel, {
  LocateButton,
  NearestAddress,
  PinReadout,
  anchorFor,
  styles,
  useDeviceFix,
  type PickupPinPickerProps,
} from './PickupPinPanel';

/**
 * Where the courier should knock.
 *
 * The address is free text — "Evandy Hostel, Block B, Room 304" — and no
 * amount of parsing turns that into a doorstep. Before this, the pin was
 * hashed out of the string: stable, identical on every screen, and several
 * hundred metres from the building. The courier then navigated confidently to
 * a spot in a field, and the arrival check confirmed they had reached it.
 *
 * So the customer places it. Two ways in, because neither works everywhere:
 * the device's own fix, exact when they are standing at home and useless when
 * they are booking from a lecture hall, and the pin itself, which always works
 * but needs a map. Web gets `PickupPinPicker.web.tsx` — the panel alone, since
 * importing `react-native-maps` there fails the bundle outright.
 */
export default function PickupPinPicker(props: PickupPinPickerProps) {
  return (
    <MapBoundary
      fallback={(message) => (
        <PickupPinPanel {...props} notice={`The map could not load here (${message}).`} />
      )}
    >
      <NativePinPicker {...props} />
    </MapBoundary>
  );
}

/**
 * Keeps a map failure contained — `react-native-maps` is a native view, and a
 * missing module or a bad key throws while rendering. Same guard the tracking
 * map uses; without it a tile problem takes the whole booking flow down.
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
    console.warn('[PickupPinPicker] map failed to render, showing panel:', error);
  }

  render() {
    if (this.state.message !== null) return this.props.fallback(this.state.message);
    return this.props.children;
  }
}

/**
 * The pin does not move; the map does.
 *
 * Every ride-hailing app on the phone works this way, and for a good reason:
 * dragging a marker means covering it with your thumb at the exact moment you
 * need to see what is underneath. Holding the pin at the centre of the view
 * and sliding the city beneath it keeps the target visible the whole time, and
 * makes "where the courier knocks" a thing you aim rather than a thing you
 * grab. The pin commits when the map settles, so a pan is one update rather
 * than sixty.
 */
function NativePinPicker({ value, onChange, suburb, onAddressSuggested }: PickupPinPickerProps) {
  const mapRef = useRef<MapView | null>(null);
  /**
   * `onRegionChangeComplete` also fires when the map first lays itself out.
   * Committing that would hand back a pin nobody aimed — the suburb anchor
   * wearing a customer's authority, which is the whole thing this component
   * exists to stop. So the map only starts reporting once it has been touched.
   */
  const touched = useRef(false);

  const { locate, busy, error } = useDeviceFix((next) => {
    onChange(next);
    mapRef.current?.animateToRegion(regionAround(next), 600);
  });

  const anchor = anchorFor(suburb);
  // Read once, on mount: after that the map owns its own camera, and feeding a
  // region back into a map the customer is panning fights them for it.
  const initialRegion = useMemo(() => regionAround(value ?? anchor), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          provider={MAP_PROVIDER}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          onTouchStart={() => {
            touched.current = true;
          }}
          onRegionChangeComplete={(region, details) => {
            if (!touched.current && !details?.isGesture) return;
            onChange({ lat: region.latitude, lng: region.longitude });
          }}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        />

        {/* The pin itself: fixed to the centre, never in the way of a drag. */}
        <View pointerEvents="none" style={styles.centrePin}>
          <View style={styles.pin}>
            <Home size={13} color="#FFFFFF" />
          </View>
          <View style={styles.pinStem} />
        </View>

        {!value && (
          <View pointerEvents="none" style={styles.mapHintOverlay}>
            <Text style={styles.mapHintText}>Move the map so the pin is on your gate</Text>
          </View>
        )}
      </View>

      <LocateButton onPress={locate} busy={busy} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <NearestAddress pin={value} onAddressSuggested={onAddressSuggested} />
      <PinReadout value={value} suburb={suburb} />
    </View>
  );
}

/** A block tight enough to place a doorway in, not a suburb. */
function regionAround(coords: Coords): Region {
  return {
    latitude: coords.lat,
    longitude: coords.lng,
    latitudeDelta: 0.004,
    longitudeDelta: 0.004,
  };
}
