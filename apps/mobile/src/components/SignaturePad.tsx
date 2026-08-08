/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Check, Pencil, RotateCcw, ShieldCheck } from 'lucide-react-native';
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, tints } from '../theme';
import { Button, Divider } from './ui';

interface SignaturePadProps {
  onSave: (signatureDataUrl: string) => void;
  onCancel?: () => void;
  title?: string;
  customerName?: string;
}

const PAD_HEIGHT = 170;

export default function SignaturePad({
  onSave,
  onCancel,
  title = "Recipient's signature required",
  customerName = 'the recipient',
}: SignaturePadProps) {
  /** Completed strokes, plus the one currently under the finger. */
  const [strokes, setStrokes] = useState<string[]>([]);
  const [currentStroke, setCurrentStroke] = useState('');
  const [saving, setSaving] = useState(false);

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
          if (finished.includes('L')) setStrokes((prev) => [...prev, finished]);
        },
      }),
    []
  );

  const hasSigned = strokes.length > 0 || currentStroke.includes('L');

  const clear = () => {
    strokeRef.current = '';
    setCurrentStroke('');
    setStrokes([]);
  };

  const confirm = () => {
    if (!hasSigned || saving) return;
    setSaving(true);

    const finish = (value: string) => {
      setSaving(false);
      onSave(value);
    };

    // react-native-svg can rasterise the pad straight to a PNG.
    const ref = svgRef.current as (Svg & { toDataURL?: (cb: (b64: string) => void) => void }) | null;

    if (ref?.toDataURL) {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          finish(`freshfold-signature:${strokes.join(' ')}`);
        }
      }, 2500);

      ref.toDataURL((base64) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        finish(`data:image/png;base64,${base64}`);
      });
    } else {
      // Fallback: keep the vector itself so the receipt still has a record.
      finish(`freshfold-signature:${strokes.join(' ')}`);
    }
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Pencil size={18} color={colors.brandSage} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            Please have <Text style={styles.customer}>{customerName}</Text> sign below
          </Text>
        </View>
      </View>

      <View style={styles.pad} {...panResponder.panHandlers}>
        <View style={styles.signLine} pointerEvents="none">
          <Text style={styles.signHint}>X SIGN HERE</Text>
          <Text style={styles.signHintRight}>Encrypted signature</Text>
        </View>

        <Svg ref={svgRef} style={StyleSheet.absoluteFill} pointerEvents="none">
          {strokes.map((d, i) => (
            <Path
              key={i}
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
          By signing, the recipient verifies the garment count matches and accepts the
          conditions of care.
        </Text>
      </View>

      <Divider />

      <View style={styles.actions}>
        <Button
          label="Clear pad"
          variant="ghost"
          onPress={clear}
          disabled={!hasSigned}
          icon={<RotateCcw size={14} color={colors.textCharcoal} />}
          style={{ flex: 1 }}
        />
        <Button
          label="Confirm slip"
          onPress={confirm}
          disabled={!hasSigned}
          loading={saving}
          icon={<Check size={15} color="#FFFFFF" />}
          style={{ flex: 1 }}
        />
      </View>

      {onCancel && (
        <Pressable onPress={onCancel} hitSlop={8} style={styles.cancel}>
          <Text style={styles.cancelLabel}>Cancel signature entry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.cardPure,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 14, fontWeight: '800', color: colors.textCharcoal },
  subtitle: { fontSize: 10, color: colors.textSlate, marginTop: 2 },
  customer: { color: colors.brandSage, fontWeight: '700' },

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
  signHint: {
    fontSize: 9,
    letterSpacing: 1,
    color: colors.brandStone,
    fontWeight: '700',
  },
  signHintRight: { fontSize: 8, color: colors.brandStone },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tints.stone30,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noticeText: { flex: 1, fontSize: 9.5, color: colors.textSlate, lineHeight: 13 },

  actions: { flexDirection: 'row', gap: 10 },
  cancel: { alignItems: 'center', paddingVertical: 2 },
  cancelLabel: { fontSize: 10.5, color: colors.textSlate },
});
