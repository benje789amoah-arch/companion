/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Haptics from 'expo-haptics';
import { Check, KeyRound, Pencil, RotateCcw, ShieldCheck } from 'lucide-react-native';
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, tints } from '../theme';
import { Button, Divider } from './ui';

/**
 * Signing for a delivery.
 *
 * The rider console captures a signature *from* the customer; here the
 * customer gives it directly, which is both the more honest chain of custody
 * and the reason this transition is theirs to make.
 *
 * The handover code is shown rather than asked for. It belongs to the customer
 * — the courier's console is never told it — so this screen's job is to put it
 * in front of them to read out, and to send it with the signature when they
 * sign for the order themselves.
 */

interface DeliveryConfirmProps {
  /** Commits the signature against this order's code. False if it is refused. */
  onConfirm: (signature: string, code: string) => Promise<boolean>;
  onCancel?: () => void;
  customerName?: string;
  bagCount?: number;
  /** This order's delivery code — the customer's to read out. */
  deliveryCode?: string;
}

const PAD_HEIGHT = 170;

export default function DeliveryConfirm({
  onConfirm,
  onCancel,
  customerName = 'you',
  bagCount,
  deliveryCode,
}: DeliveryConfirmProps) {
  /** Completed strokes, plus the one currently under the finger. */
  const [strokes, setStrokes] = useState<string[]>([]);
  const [currentStroke, setCurrentStroke] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const svgRef = useRef<Svg | null>(null);
  const strokeRef = useRef('');

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          strokeRef.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
          setCurrentStroke(strokeRef.current);
        },

        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          strokeRef.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
          setCurrentStroke(strokeRef.current);
        },

        onPanResponderRelease: () => {
          const finished = strokeRef.current;
          strokeRef.current = '';
          setCurrentStroke('');
          // A tap with no drag leaves a single moveto — not worth keeping.
          if (finished.includes('L')) setStrokes((current) => [...current, finished]);
        },
      }),
    []
  );

  const hasSigned = strokes.length > 0 || currentStroke.includes('L');
  const ready = hasSigned && !!deliveryCode;

  const clear = () => {
    strokeRef.current = '';
    setCurrentStroke('');
    setStrokes([]);
  };

  /** Rasterises the pad, falling back to the vector if the SVG can't export. */
  const captureSignature = (): Promise<string> =>
    new Promise((resolve) => {
      const ref = svgRef.current as
        | (Svg & { toDataURL?: (callback: (base64: string) => void) => void })
        | null;

      const vector = `freshfold-signature:${strokes.join(' ')}`;
      if (!ref?.toDataURL) {
        resolve(vector);
        return;
      }

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(vector);
      }, 2500);

      ref.toDataURL((base64) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(`data:image/png;base64,${base64}`);
      });
    });

  const confirm = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError('');

    try {
      const signature = await captureSignature();
      const ok = await onConfirm(signature, deliveryCode ?? '');

      if (!ok) {
        setError('Dispatch would not accept that. Ask the courier to try from their console.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pencil size={19} color={colors.brandSage} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Sign for your delivery</Text>
          <Text style={styles.subtitle}>
            {bagCount
              ? `Check all ${bagCount} bags are present, then sign below.`
              : 'Check everything is present, then sign below.'}
          </Text>
        </View>
      </View>

      {/* The code, to read out. Not a field: the customer is the one who has
          it, and typing it back to themselves proves nothing. */}
      <View style={styles.codeCard}>
        <KeyRound size={15} color={colors.brandSage} />
        <View style={{ flex: 1 }}>
          <Text style={styles.codeLabel}>Read this to your courier</Text>
          <Text style={styles.codeValue}>{deliveryCode ?? '—'}</Text>
        </View>
      </View>
      <Text style={styles.codeHint}>
        Only give it once your laundry is actually in your hands. Signing below sends it for you.
      </Text>
      {!!error && <Text style={styles.codeError}>{error}</Text>}

      <View style={styles.pad} {...panResponder.panHandlers}>
        <View style={styles.signLine} pointerEvents="none">
          <Text style={styles.signHint}>X SIGN HERE</Text>
          <Text style={styles.signHintRight}>{customerName}</Text>
        </View>

        <Svg ref={svgRef} style={StyleSheet.absoluteFill} pointerEvents="none">
          {strokes.map((d, index) => (
            <Path
              key={index}
              d={d}
              stroke={colors.textCharcoal}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {currentStroke !== '' && (
            <Path
              d={currentStroke}
              stroke={colors.textCharcoal}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
        </Svg>
      </View>

      <View style={styles.notice}>
        <ShieldCheck size={14} color={colors.brandSage} />
        <Text style={styles.noticeText}>
          Signing confirms the garment count matches and closes the order. Anything wrong after
          this can still be reported from the order screen.
        </Text>
      </View>

      <Divider />

      <View style={styles.actions}>
        <Button
          label="Clear"
          variant="ghost"
          onPress={clear}
          disabled={!hasSigned}
          icon={<RotateCcw size={14} color={colors.textCharcoal} />}
          style={{ flex: 1 }}
        />
        <Button
          label="Confirm delivery"
          onPress={confirm}
          disabled={!ready}
          loading={saving}
          icon={<Check size={15} color="#FFFFFF" />}
          style={{ flex: 1.5 }}
        />
      </View>

      {!!onCancel && (
        <Button label="Not yet" variant="ghost" size="sm" onPress={onCancel} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: tints.sage08,
    borderWidth: 1,
    borderColor: tints.sage25,
    borderRadius: radius.lg,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  codeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  codeValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 8,
    color: colors.textCharcoal,
    marginTop: 2,
  },
  codeHint: { fontSize: 10, color: colors.textSlate, lineHeight: 14 },
  codeError: { fontSize: 10, fontWeight: '700', color: colors.statusError },

  sheet: { padding: 20, paddingTop: 8, gap: 13 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 15, fontWeight: '800', color: colors.textCharcoal },
  subtitle: { fontSize: 10.5, color: colors.textSlate, marginTop: 3, lineHeight: 14.5 },

  pad: {
    height: PAD_HEIGHT,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brandStone,
    backgroundColor: colors.bgIvory,
    overflow: 'hidden',
  },
  signLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 34,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.brandStone,
    paddingBottom: 3,
  },
  signHint: { fontSize: 9, letterSpacing: 1, color: colors.brandStone, fontWeight: '700' },
  signHintRight: { fontSize: 8.5, color: colors.brandStone },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: tints.stone35,
    borderRadius: radius.md,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  noticeText: { flex: 1, fontSize: 10, color: colors.textSlate, lineHeight: 14 },

  actions: { flexDirection: 'row', gap: 10 },
});
