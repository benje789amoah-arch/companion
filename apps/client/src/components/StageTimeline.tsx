/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Check } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BOOKING_STAGE_SEQUENCE,
  bookingProgressPercent,
  humanizeStatus,
  type BookingStatus,
  type JobStatus,
} from '@freshfold/core';
import { colors, radius, tints } from '../theme';
import { ProgressBar } from './ui';

/**
 * The seven-stage progress readout, straight off `BOOKING_STAGE_SEQUENCE`.
 *
 * `stage` is the coarse customer vocabulary; `dispatchStatus` is the finer one
 * the rider is actually in, shown as a live sub-line when the courier is
 * moving. Deriving the first from the second is what keeps this screen and the
 * rider's console from disagreeing about where the garments are.
 */

/** What each stage means, in the voice the client portal already uses. */
const STAGE_COPY: Record<BookingStatus, string> = {
  Scheduled: 'Your appointment is registered. A courier will be assigned shortly.',
  Collecting: 'Your courier is collecting the bags and heading for the hub.',
  'In Care': 'Checked in at the hub. Sorting and botanical stain treatment under way.',
  'Ironing & Folding': 'Hand-pressing and boutique folding in progress.',
  'Quality Check': 'Thread and finish inspected and packed, waiting for a courier.',
  Delivering: 'Your courier is on the way back to your door with the finished order.',
  Delivered: 'Delivered and signed for. Thank you for choosing FreshFold.',
  Cancelled: 'This order was cancelled. Nothing further will be collected.',
};

export function StageTimeline({
  stage,
  dispatchStatus,
  compact,
}: {
  stage: BookingStatus;
  dispatchStatus?: JobStatus;
  compact?: boolean;
}) {
  const cancelled = stage === 'Cancelled';
  const currentIndex = BOOKING_STAGE_SEQUENCE.indexOf(stage);
  const percent = bookingProgressPercent(stage);

  if (compact) {
    return (
      <View style={{ gap: 7 }}>
        <View style={styles.compactRow}>
          <Text style={styles.compactStage}>{cancelled ? 'Cancelled' : stage}</Text>
          <Text style={styles.compactPercent}>{percent}%</Text>
        </View>
        <ProgressBar percent={percent} tone={cancelled ? 'gold' : 'sage'} />
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 7 }}>
        <View style={styles.compactRow}>
          <Text style={styles.headline}>{cancelled ? 'Cancelled' : stage}</Text>
          <Text style={styles.compactPercent}>{percent}%</Text>
        </View>
        <ProgressBar percent={percent} tone={cancelled ? 'gold' : 'sage'} height={7} />
        <Text style={styles.copy}>{STAGE_COPY[stage]}</Text>
        {!!dispatchStatus && !cancelled && (
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>
              Dispatch: {humanizeStatus(dispatchStatus).toLowerCase()}
            </Text>
          </View>
        )}
      </View>

      {!cancelled && (
        <View style={styles.steps}>
          {BOOKING_STAGE_SEQUENCE.map((step, index) => {
            const complete = index < currentIndex;
            const current = index === currentIndex;

            return (
              <View key={step} style={styles.step}>
                <View style={styles.stepRail}>
                  <View
                    style={[
                      styles.node,
                      complete && styles.nodeComplete,
                      current && styles.nodeCurrent,
                    ]}
                  >
                    {complete && <Check size={10} color="#FFFFFF" strokeWidth={3} />}
                  </View>
                  {index < BOOKING_STAGE_SEQUENCE.length - 1 && (
                    <View style={[styles.connector, complete && styles.connectorComplete]} />
                  )}
                </View>

                <Text
                  style={[
                    styles.stepLabel,
                    (complete || current) && styles.stepLabelActive,
                    current && { fontWeight: '800' },
                  ]}
                  numberOfLines={2}
                >
                  {step}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compactStage: { fontSize: 12, fontWeight: '800', color: colors.textCharcoal },
  compactPercent: { fontSize: 10.5, fontWeight: '700', color: colors.brandSage },
  headline: { fontSize: 17, fontWeight: '800', color: colors.textCharcoal, letterSpacing: -0.3 },
  copy: { fontSize: 11.5, color: colors.textSlate, lineHeight: 16 },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandGold },
  liveLabel: { fontSize: 10.5, fontWeight: '600', color: colors.brandGold },

  steps: { flexDirection: 'row', gap: 2 },
  step: { flex: 1, gap: 6 },
  stepRail: { flexDirection: 'row', alignItems: 'center' },
  node: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.brandStone,
    backgroundColor: colors.cardPure,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeComplete: { backgroundColor: colors.brandSage, borderColor: colors.brandSage },
  nodeCurrent: {
    borderColor: colors.brandSage,
    borderWidth: 4,
    backgroundColor: tints.sage12,
  },
  connector: { flex: 1, height: 2, backgroundColor: colors.bgSand, borderRadius: radius.sm },
  connectorComplete: { backgroundColor: colors.brandSage },

  stepLabel: { fontSize: 8.5, color: colors.textMuted, lineHeight: 11, paddingRight: 4 },
  stepLabelActive: { color: colors.textCharcoal, fontWeight: '700' },
});
