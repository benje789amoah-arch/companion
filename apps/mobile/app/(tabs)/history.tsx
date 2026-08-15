/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { History as HistoryIcon, ShieldCheck } from 'lucide-react-native';
import React, { useEffect, useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, EmptyState } from '../../src/components/ui';
import { useApp } from '../../src/store/AppStore';
import { colors, formatCedis, radius } from '../../src/theme';

export default function HistoryScreen() {
  const { orders, loadOrderProof } = useApp();

  const completed = useMemo(
    () => orders.filter((o) => o.status === 'delivered'),
    [orders]
  );

  /**
   * The board this list is built from arrives without its photographs — one
   * request every four seconds cannot carry them. This screen is the only
   * place a courier looks back at a finished job, so it asks for the ones it
   * is about to draw, once each, and only for jobs it does not already hold.
   */
  useEffect(() => {
    for (const order of completed) {
      if (!order.deliveryPhoto) void loadOrderProof(order.id);
    }
  }, [completed, loadOrderProof]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My timeline logs</Text>
        <Text style={styles.subtitle}>
          Review historical valet completions and proof documents.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {completed.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon size={34} color={colors.brandStone} />}
            title="No history"
            body="Your completed deliveries will appear here."
          />
        ) : (
          completed.map((order) => (
            <View key={order.id} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineLine} />
              </View>

              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.customer} numberOfLines={1}>
                    {order.customerName}
                  </Text>
                  <Text style={styles.deadline}>{order.deadline}</Text>
                </View>

                <Text style={styles.address} numberOfLines={2}>
                  {order.pickupAddress}
                </Text>

                <View style={styles.proofRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.proofLabel}>Verification signature</Text>
                    <View style={styles.secureRow}>
                      <ShieldCheck size={13} color={colors.statusSuccess} />
                      <Text style={styles.secureLabel}>
                        {order.deliverySignature ? 'Secure sign' : 'Not captured'}
                      </Text>
                    </View>
                    <Text style={styles.payout}>Payout {formatCedis(order.price)}</Text>
                  </View>

                  {!!order.deliveryPhoto && (
                    <View style={{ gap: 4 }}>
                      <Text style={styles.proofLabel}>Condition proof</Text>
                      <Image source={{ uri: order.deliveryPhoto }} style={styles.proofImage} />
                    </View>
                  )}
                </View>
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory },
  header: { paddingHorizontal: 18, paddingTop: 12, gap: 3 },
  title: { fontSize: 19, fontWeight: '800', color: colors.textCharcoal },
  subtitle: { fontSize: 10.5, color: colors.textSlate },

  list: { padding: 18, gap: 14, paddingBottom: 40 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineRail: { width: 12, alignItems: 'center', paddingTop: 6 },
  timelineDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.brandSage,
    borderWidth: 2,
    borderColor: colors.cardPure,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    marginTop: 4,
    backgroundColor: 'rgba(111, 122, 99, 0.35)',
  },

  card: { flex: 1, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  customer: { flex: 1, fontSize: 12.5, fontWeight: '800', color: colors.textCharcoal },
  deadline: { fontSize: 9, color: colors.textSlate },
  address: { fontSize: 11, color: colors.textSlate },

  proofRow: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: 10,
  },
  proofLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  secureLabel: { fontSize: 10.5, fontWeight: '700', color: colors.statusSuccess },
  payout: { fontSize: 10.5, color: colors.textCharcoal, marginTop: 2 },
  proofImage: {
    width: 62,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgLinen,
  },
});
