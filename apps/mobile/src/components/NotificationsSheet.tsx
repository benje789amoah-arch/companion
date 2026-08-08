/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BellOff } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow, tints } from '../theme';
import { Notification } from '../types';

interface NotificationsSheetProps {
  visible: boolean;
  notifications: Notification[];
  onClose: () => void;
  onSelect: (notif: Notification) => void;
}

export default function NotificationsSheet({
  visible,
  notifications,
  onClose,
  onSelect,
}: NotificationsSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.title}>Operational alerts</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={styles.close}>Close</Text>
              </Pressable>
            </View>

            {notifications.length === 0 ? (
              <View style={styles.empty}>
                <BellOff size={26} color={colors.brandStone} />
                <Text style={styles.emptyText}>No alerts right now.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
                {notifications.map((notif) => (
                  <Pressable
                    key={notif.id}
                    onPress={() => onSelect(notif)}
                    style={({ pressed }) => [
                      styles.row,
                      !notif.read && styles.rowUnread,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={styles.rowHeader}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {notif.title}
                      </Text>
                      <Text style={styles.rowTime}>{notif.timestamp}</Text>
                    </View>
                    <Text style={styles.rowBody}>{notif.body}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: tints.scrim },
  safe: { paddingHorizontal: 12 },
  panel: {
    backgroundColor: colors.cardPure,
    borderRadius: radius.xxl,
    padding: 16,
    gap: 10,
    ...shadow.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingBottom: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textCharcoal,
  },
  close: { fontSize: 10, fontWeight: '700', color: colors.brandSage, textTransform: 'uppercase' },

  row: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgIvory,
    padding: 11,
    gap: 3,
  },
  rowUnread: { backgroundColor: tints.sage05, borderColor: tints.sage20 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowTitle: { flex: 1, fontSize: 11.5, fontWeight: '700', color: colors.textCharcoal },
  rowTime: { fontSize: 8.5, color: colors.textSlate },
  rowBody: { fontSize: 10.5, color: colors.textSlate, lineHeight: 15 },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 26 },
  emptyText: { fontSize: 11, color: colors.textSlate },
});
