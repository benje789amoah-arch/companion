/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLocalSearchParams } from 'expo-router';
import { Compass } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LiveMap from '../../src/components/LiveMap';
import { useApp } from '../../src/store/AppStore';
import { colors, radius, shadow } from '../../src/theme';

export default function MapScreen() {
  // Tapping "Pin" on an assignment card routes here with the order to frame.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { rider, orders, activeOrder, navigationTarget, acceptOrder } = useApp();

  return (
    <View style={styles.container}>
      <LiveMap
        rider={rider}
        orders={orders}
        activeOrder={activeOrder}
        navigationTarget={navigationTarget}
        focusedOrderId={focus ?? null}
        onAcceptOrder={acceptOrder}
      />

      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.compassChip}>
          <Compass size={15} color={colors.brandSage} />
          <Text style={styles.compassLabel}>Compass overlay</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory },
  overlay: { position: 'absolute', top: 0, left: 14, right: 14, alignItems: 'flex-start' },
  compassChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
    marginTop: 58,
    ...shadow.md,
  },
  compassLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textCharcoal,
  },
});
