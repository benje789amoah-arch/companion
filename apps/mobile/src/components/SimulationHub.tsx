/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageSquare, RefreshCw, Sliders } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../store/AppStore';
import { colors, radius, shadow, tints } from '../theme';
import { Button, Divider } from './ui';

const DISPATCH_ALERTS = [
  'Vice Chancellor lodge needs a verification signature upon arrival.',
  'Severe storm alert south of Central Hub. Scooter safe-speeds mandatory.',
  'FreshFold laundry hub has cleared the sterilization backlog. Ready for delivery check-ins.',
  'All riders check tyre pressures at the scooter hub. Service standards apply today.',
];

/**
 * Demo control surface. The web build drove dispatch events from a desktop
 * sidebar; on a phone the same levers live behind a floating handle so a single
 * tester can play both rider and dispatcher.
 */
export default function SimulationHub() {
  const [open, setOpen] = useState(false);
  const {
    rider,
    backlogOrders,
    dispatchOrder,
    generateRandomOrder,
    sendAdminMessage,
    resetSimulation,
  } = useApp();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Open simulation hub"
        style={({ pressed }) => [styles.handle, pressed && { opacity: 0.85 }]}
      >
        <Sliders size={15} color="#FFFFFF" />
        <Text style={styles.handleLabel}>S{'\n'}I{'\n'}M</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Concierge simulation hub</Text>
                <Text style={styles.subtitle}>
                  Trigger dispatch events without a second device
                </Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} style={styles.closeChip}>
                <Text style={styles.closeLabel}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.queueHeader}>
              <Text style={styles.queueTitle}>
                Unassigned queue ({backlogOrders.length})
              </Text>
              <Pressable onPress={generateRandomOrder} hitSlop={6}>
                <Text style={styles.generate}>+ Generate mock</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 190 }} contentContainerStyle={{ gap: 8 }}>
              {backlogOrders.length === 0 ? (
                <Text style={styles.emptyQueue}>
                  No unassigned orders. Generate a mock contract above.
                </Text>
              ) : (
                backlogOrders.map((order) => (
                  <View key={order.id} style={styles.queueRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.queueName} numberOfLines={1}>
                        {order.customerName}
                      </Text>
                      <Text style={styles.queueAddress} numberOfLines={1}>
                        {order.pickupAddress.split(',')[0]}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        dispatchOrder(order.id);
                        setOpen(false);
                      }}
                      style={({ pressed }) => [styles.dispatchChip, pressed && { opacity: 0.85 }]}
                    >
                      <Text style={styles.dispatchLabel}>Dispatch</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>

            <Divider style={{ marginTop: 4 }} />

            <View style={styles.actions}>
              <Button
                label="Reset state"
                variant="ghost"
                onPress={() => {
                  resetSimulation();
                  setOpen(false);
                }}
                icon={<RefreshCw size={14} color={colors.textCharcoal} />}
                style={{ flex: 1 }}
              />
              <Button
                label="Trigger alert"
                variant="outline"
                onPress={() => {
                  const alert =
                    DISPATCH_ALERTS[Math.floor(Math.random() * DISPATCH_ALERTS.length)];
                  sendAdminMessage(
                    'dispatcher',
                    rider.name ? `${rider.name}, ${alert}` : alert
                  );
                  setOpen(false);
                }}
                icon={<MessageSquare size={14} color={colors.brandSage} />}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  handle: {
    position: 'absolute',
    right: 0,
    top: '32%',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.brandSage,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    ...shadow.md,
  },
  handleLabel: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    lineHeight: 10,
  },

  scrim: { flex: 1, backgroundColor: tints.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.cardPure,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  grabber: {
    width: 46,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brandStone,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.textCharcoal,
  },
  subtitle: { fontSize: 10, color: colors.textSlate, marginTop: 2 },
  closeChip: {
    backgroundColor: colors.bgLinen,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  closeLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textSlate },

  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  queueTitle: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  generate: { fontSize: 10.5, fontWeight: '800', color: colors.brandSage },
  emptyQueue: {
    fontSize: 11,
    color: colors.textSlate,
    textAlign: 'center',
    paddingVertical: 18,
    backgroundColor: colors.bgLinen,
    borderRadius: radius.lg,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgIvory,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    padding: 11,
  },
  queueName: { fontSize: 12, fontWeight: '700', color: colors.textCharcoal },
  queueAddress: { fontSize: 9.5, color: colors.textSlate, marginTop: 2 },
  dispatchChip: {
    backgroundColor: colors.brandSage,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  dispatchLabel: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },

  actions: { flexDirection: 'row', gap: 10 },
});
