/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import { Activity, CheckCircle2, Layers2, MapPin } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Card, EmptyState } from '../../src/components/ui';
import { useApp } from '../../src/store/AppStore';
import { colors, formatCedis, humanizeStatus, radius, shadow } from '../../src/theme';
import { Order } from '../../src/types';

type Filter = 'all' | 'upcoming' | 'active' | 'completed';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All jobs' },
  { id: 'upcoming', label: 'Unassigned' },
  { id: 'active', label: 'Active tasks' },
  { id: 'completed', label: 'Completed' },
];

export default function AssignmentsScreen() {
  const router = useRouter();
  const { orders, acceptOrder } = useApp();

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return orders.filter((order) => {
      const matches =
        !needle ||
        order.customerName.toLowerCase().includes(needle) ||
        order.orderNumber.toLowerCase().includes(needle);

      if (!matches) return false;

      switch (filter) {
        case 'upcoming':
          return order.status === 'unassigned';
        case 'active':
          return (
            order.status !== 'unassigned' &&
            order.status !== 'delivered' &&
            order.status !== 'cancelled'
          );
        case 'completed':
          return order.status === 'delivered';
        default:
          return true;
      }
    });
  }, [orders, filter, query]);

  const statusTone = (order: Order) => {
    if (order.status === 'delivered') return 'success' as const;
    if (order.status === 'unassigned') return 'muted' as const;
    return 'sage' as const;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My active jobs</Text>
        <Text style={styles.subtitle}>
          Manage, dispatch and review active laundry contracts.
        </Text>
      </View>

      <View style={styles.controls}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search customers or codes…"
          placeholderTextColor={colors.textSlate}
          style={styles.search}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setFilter(item.id)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Activity size={34} color={colors.brandStone} />}
            title="No assignments"
            body="You're all caught up. New pickup requests will appear here."
          />
        ) : (
          filtered.map((order) => (
            <Card key={order.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.customer} numberOfLines={1}>
                      {order.customerName}
                    </Text>
                    <Badge
                      label={order.priority}
                      tone={order.priority === 'elite' ? 'gold' : 'sage'}
                    />
                  </View>
                  <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                </View>

                <Badge label={humanizeStatus(order.status)} tone={statusTone(order)} />
              </View>

              <View style={styles.detailBlock}>
                <View style={styles.detailRow}>
                  <MapPin size={13} color={colors.brandSage} />
                  <Text style={styles.detailText} numberOfLines={1}>
                    Pickup: {order.pickupAddress}
                  </Text>
                  <Pressable
                    onPress={() => router.push({ pathname: '/(tabs)/map', params: { focus: order.id } })}
                    style={({ pressed }) => [styles.pinChip, pressed && { opacity: 0.8 }]}
                  >
                    <MapPin size={10} color={colors.brandSage} />
                    <Text style={styles.pinChipLabel}>Pin</Text>
                  </Pressable>
                </View>

                <View style={styles.detailRow}>
                  <Layers2 size={13} color={colors.brandSage} />
                  <Text style={styles.detailText} numberOfLines={1}>
                    {order.laundryType} ({order.bagCount} bags)
                  </Text>
                </View>

                <Text style={styles.coords}>
                  GPS {order.pickupCoords.lat.toFixed(4)}° N,{' '}
                  {Math.abs(order.pickupCoords.lng).toFixed(4)}° W
                </Text>
              </View>

              <View style={styles.cardFooter}>
                <View>
                  <Text style={styles.payoutLabel}>Payout</Text>
                  <Text style={styles.payout}>{formatCedis(order.price)}</Text>
                </View>

                {order.status === 'unassigned' ? (
                  <Pressable
                    onPress={() => {
                      acceptOrder(order.id);
                      router.push('/(tabs)');
                    }}
                    style={({ pressed }) => [styles.actionChip, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.actionChipLabel}>Accept payout</Text>
                  </Pressable>
                ) : order.status !== 'delivered' ? (
                  <Pressable
                    onPress={() => router.push('/(tabs)')}
                    style={({ pressed }) => [
                      styles.actionChip,
                      styles.actionChipGold,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={styles.actionChipLabel}>Go to active map</Text>
                  </Pressable>
                ) : (
                  <View style={styles.completeRow}>
                    <CheckCircle2 size={14} color={colors.statusSuccess} />
                    <Text style={styles.completeLabel}>Complete</Text>
                  </View>
                )}
              </View>
            </Card>
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

  controls: { paddingHorizontal: 18, paddingTop: 14, gap: 10 },
  search: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.cardPure,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 12.5,
    color: colors.textCharcoal,
    ...shadow.xs,
  },
  filterRow: { gap: 7, paddingBottom: 2 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.cardPure,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  filterChipActive: { backgroundColor: colors.brandSage, borderColor: colors.brandSage },
  filterLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textSlate },
  filterLabelActive: { color: '#FFFFFF' },

  list: { padding: 18, gap: 12, paddingBottom: 40 },
  card: { gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customer: { fontSize: 13, fontWeight: '800', color: colors.textCharcoal, flexShrink: 1 },
  orderNumber: { fontSize: 9.5, fontWeight: '700', color: colors.brandGold, marginTop: 3 },

  detailBlock: { gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { flex: 1, fontSize: 11, color: colors.textCharcoal },
  pinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(111, 122, 99, 0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pinChipLabel: { fontSize: 9, fontWeight: '800', color: colors.brandSage },
  coords: {
    fontSize: 9.5,
    color: colors.textSlate,
    paddingLeft: 19,
    ...Platform.select({ ios: { fontFamily: 'Menlo' }, android: { fontFamily: 'monospace' } }),
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: 10,
  },
  payoutLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  payout: { fontSize: 13, fontWeight: '800', color: colors.textCharcoal, marginTop: 2 },
  actionChip: {
    backgroundColor: colors.brandSage,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionChipGold: { backgroundColor: colors.brandGold },
  actionChipLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  completeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  completeLabel: { fontSize: 11, fontWeight: '700', color: colors.statusSuccess },
});
