/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import { ChevronRight, IdCard } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../store/AppStore';
import { colors, radius, tints } from '../theme';

/**
 * Why this rider cannot take work yet, and the way to fix it.
 *
 * Rendered on the screens where a job would otherwise be accepted. Names the
 * fields that are actually missing rather than saying "complete your profile"
 * — a rider who has filled three of four should not have to guess which one.
 *
 * Renders nothing once the profile is complete, so callers can drop it in
 * unconditionally.
 */
export default function ProfileGate() {
  const router = useRouter();
  const { profileComplete, missingProfileFields } = useApp();

  if (profileComplete) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Finish your driver profile"
      onPress={() => router.push('/(tabs)/profile')}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.icon}>
        <IdCard size={17} color={colors.statusWarning} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Finish your profile to accept jobs</Text>
        <Text style={styles.body}>
          Still needed: {listFields(missingProfileFields)}. Customers see your name, vehicle and
          plate when you are on the way — the vehicle is assigned by your supervisor.
        </Text>
      </View>

      <ChevronRight size={16} color={colors.statusWarning} />
    </Pressable>
  );
}

/** `['vehicle', 'plate']` -> `vehicle and plate`. */
function listFields(fields: string[]): string {
  if (fields.length <= 1) return fields[0] ?? 'nothing';
  return `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}`;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tints.warning30,
    backgroundColor: tints.warning10,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 12, fontWeight: '800', color: colors.textCharcoal },
  body: { fontSize: 10, color: colors.textSlate, marginTop: 2, lineHeight: 14 },
});
