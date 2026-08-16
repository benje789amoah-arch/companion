/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Eye, EyeOff, ScanLine, ShieldCheck } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buildHandoffPayload, type Booking } from '@freshfold/core';
import QRCode from './QRCode';
import { Card, SectionLabel } from './ui';
import { colors, radius, tints } from '../theme';

/**
 * The collection hand-off.
 *
 * The courier has to see this before taking the bags — either by scanning the
 * QR or by having the four digits read out. Both encode the same code; the QR
 * additionally carries the job id, so a courier cannot have the code accepted
 * against somebody else's job.
 *
 * Shown open. It was collapsed behind a tap at first, on a shoulder-surfing
 * argument that does not survive contact with the job: the code exists to be
 * held up to a courier, and burying it added a step at precisely the moment
 * someone is standing at the door. Anyone who wants it off screen still has
 * the Hide control.
 */
export default function HandoffCard({ booking }: { booking: Booking }) {
  const [revealed, setRevealed] = useState(true);

  if (!booking.pickupOtp) return null;

  const payload = buildHandoffPayload(booking.id, 'pickup', booking.pickupOtp);
  const arrived = booking.rider?.jobStatus === 'arrived_at_pickup';

  return (
    <Card tone={arrived ? 'gold' : 'plain'} style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, arrived && { backgroundColor: tints.gold18 }]}>
          <ScanLine size={17} color={arrived ? colors.brandGold : colors.brandSage} />
        </View>
        <View style={{ flex: 1 }}>
          <SectionLabel>Collection code</SectionLabel>
          <Text style={styles.title}>
            {arrived ? 'Your courier is at the door' : 'Show this when the courier arrives'}
          </Text>
        </View>
      </View>

      <Text style={styles.body}>
        Your courier will scan the code or ask for the four digits. Don't hand over the bags to
        anyone who cannot check it.
      </Text>

      {revealed ? (
        <View style={styles.revealed}>
          <View style={styles.qrFrame}>
            <QRCode value={payload} size={168} />
          </View>

          <View style={styles.digitsRow}>
            {booking.pickupOtp.split('').map((digit, index) => (
              <View key={index} style={styles.digitCell}>
                <Text style={styles.digit}>{digit}</Text>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hide the collection code"
            onPress={() => setRevealed(false)}
            hitSlop={8}
            style={styles.toggle}
          >
            <EyeOff size={13} color={colors.textSlate} />
            <Text style={styles.toggleLabel}>Hide</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show the collection code"
          onPress={() => setRevealed(true)}
          style={({ pressed }) => [styles.reveal, pressed && { opacity: 0.85 }]}
        >
          <Eye size={15} color={colors.brandSage} />
          <Text style={styles.revealLabel}>Show the QR and code again</Text>
        </Pressable>
      )}

      <View style={styles.assurance}>
        <ShieldCheck size={13} color={colors.brandSage} />
        <Text style={styles.assuranceText}>
          The code is tied to order {booking.id} and works only for this collection.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: tints.sage08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13.5, fontWeight: '800', color: colors.textCharcoal, marginTop: 3 },
  body: { fontSize: 11, color: colors.textSlate, lineHeight: 15.5 },

  reveal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brandStone,
    backgroundColor: colors.bgLinen,
  },
  revealLabel: { fontSize: 12, fontWeight: '700', color: colors.brandSage },

  revealed: { alignItems: 'center', gap: 13 },
  qrFrame: {
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  digitsRow: { flexDirection: 'row', gap: 8 },
  digitCell: {
    width: 46,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.textCharcoal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toggleLabel: { fontSize: 11, fontWeight: '700', color: colors.textSlate },

  assurance: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  assuranceText: { flex: 1, fontSize: 10, color: colors.textMuted, lineHeight: 14 },
});
