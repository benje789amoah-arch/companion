/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { ClipboardCheck, Layers, QrCode, ShieldCheck } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { classifyScan } from '../scan';
import { colors, radius, tints } from '../theme';
import { LaundryBag, Order } from '../types';
import { Button, Divider } from './ui';

interface QRScannerProps {
  order: Order;
  onScanComplete: (scannedBags: LaundryBag[]) => void;
  onCancel?: () => void;
}

type ScannerMode = 'camera' | 'manual';

export default function QRScanner({ order, onScanComplete, onCancel }: QRScannerProps) {
  const [bags, setBags] = useState<LaundryBag[]>(() => order.bags.map((bag) => ({ ...bag })));
  // Opens on the checklist, not the camera. The bag manifest is derived from
  // the order — `bagsForJob` in the shared package — so `FF-BAG-…-A` exists as
  // a record, not as a sticker on a bag. Defaulting to the camera left riders
  // pointing at nothing and scanning the customer's collection QR instead.
  // The camera stays a tap away for when labels are actually printed.
  const [mode, setMode] = useState<ScannerMode>('manual');
  const [status, setStatus] = useState('Check each bag against the list, then confirm.');
  const [permission, requestPermission] = useCameraPermissions();

  // The camera fires continuously; ignore repeats of a code we just handled.
  const lastCodeRef = useRef<{ value: string; at: number } | null>(null);

  const allScanned = bags.every((b) => b.scanned);

  const markScanned = useCallback((bagId: string) => {
    setBags((prev) => prev.map((b) => (b.id === bagId ? { ...b, scanned: true } : b)));
  }, []);

  // One bag at a time, deliberately: there is no control that clears the whole
  // manifest, so a rider has to look at every bag to get through this.
  const markByHand = (bag: LaundryBag) => {
    markScanned(bag.id);
    setStatus(`${bag.qrCode} accounted for.`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // Ask for the camera as soon as the sheet opens: it is the intended path,
  // and a rider should not have to find a toggle to get to it.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);


  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      if (lastCodeRef.current?.value === data && now - lastCodeRef.current.at < 2000) return;
      lastCodeRef.current = { value: data, at: now };

      const result = classifyScan(data, bags);

      switch (result.kind) {
        case 'bag':
          markScanned(result.bag.id);
          setStatus(`Verified ${result.bag.qrCode} — ${result.bag.type}.`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          return;

        // A bag the rider has already checked off, read again because they left
        // the label in the frame or went back to confirm it. No haptic: this
        // comes round every couple of seconds while a label is held there, and
        // a bag buzzing on a loop reads as a fault.
        case 'bag-again':
          setStatus(`${result.bag.qrCode} is already accounted for.`);
          return;

        // The customer's collection QR is the other code in the room, and it is
        // the easiest thing to point at by mistake. Saying "unrecognised label"
        // to a rider who has just scanned the right customer reads like a
        // failure, so name what they actually scanned.
        case 'handoff':
          setStatus(
            result.payload.jobId === order.id
              ? `That is the collection code for this order, not a bag label. Tick the bags off below.`
              : `That is order ${result.payload.jobId}'s collection code, not a bag on ${order.orderNumber}.`
          );
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          return;

        default:
          setStatus(`Unrecognised label "${data}". Not part of ${order.orderNumber}.`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    },
    [bags, markScanned, order.id, order.orderNumber]
  );

  const enterCameraMode = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setMode('manual');
        setStatus('Camera access declined. Mark each bag by hand instead.');
        return;
      }
    }
    setMode('camera');
    setStatus('Camera live. Align a FreshFold bag label within the frame.');
  };

  const scannedCount = bags.filter((b) => b.scanned).length;

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <QrCode size={20} color={colors.brandSage} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>FreshFold QR bag verification</Text>
          <Text style={styles.subtitle}>Order {order.orderNumber}</Text>
        </View>
      </View>

      <View style={styles.modeToggle}>
        <Pressable
          onPress={() => {
            setMode('manual');
            setStatus('Check each bag against the list, then confirm.');
          }}
          style={[styles.modeButton, mode === 'manual' && styles.modeButtonActive]}
        >
          <Text style={[styles.modeLabel, mode === 'manual' && styles.modeLabelActive]}>
            Check the list
          </Text>
        </Pressable>
        <Pressable
          onPress={enterCameraMode}
          style={[styles.modeButton, mode === 'camera' && styles.modeButtonActive]}
        >
          <Text style={[styles.modeLabel, mode === 'camera' && styles.modeLabelActive]}>
            Scan a label
          </Text>
        </Pressable>
      </View>

      {/* Viewfinder */}
      <View style={styles.viewfinder}>
        {mode === 'camera' && permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'pdf417'] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        ) : (
          <View style={styles.viewfinderPlaceholder}>
            <QrCode size={44} color={tints.sage30} />
            <Text style={styles.viewfinderTitle}>
              {mode === 'manual' ? 'Checking the manifest' : 'Camera not enabled'}
            </Text>
            <Text style={styles.viewfinderBody}>
              {mode === 'manual'
                ? 'Count the bags against the list below, then tick each one off.'
                : 'Grant camera access to scan printed bag labels.'}
            </Text>
          </View>
        )}

        {/* Framing corners */}
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />

        <View style={styles.statusPill}>
          <Text style={styles.statusText} numberOfLines={2}>
            {status}
          </Text>
        </View>
      </View>

      {/* Bag checklist */}
      <View style={styles.checklistHeader}>
        <Text style={styles.checklistTitle}>
          Required bag checks ({scannedCount}/{bags.length})
        </Text>
      </View>

      <ScrollView style={styles.bagList} contentContainerStyle={{ gap: 8 }}>
        {bags.map((bag) => (
          <View key={bag.id} style={[styles.bagRow, bag.scanned && styles.bagRowScanned]}>
            <View style={[styles.bagIcon, bag.scanned && styles.bagIconScanned]}>
              <Layers
                size={14}
                color={bag.scanned ? colors.statusSuccess : colors.textSlate}
              />
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.bagTitleRow}>
                <Text style={styles.bagType} numberOfLines={1}>
                  {bag.type}
                </Text>
                <Text style={styles.bagWeight}>{bag.weight}</Text>
              </View>
              <Text style={styles.bagCode} numberOfLines={1}>
                {bag.qrCode} • {bag.itemCount} items
              </Text>
            </View>

            {bag.scanned ? (
              <View style={styles.verified}>
                <ClipboardCheck size={13} color={colors.statusSuccess} />
                <Text style={styles.verifiedLabel}>Verified</Text>
              </View>
            ) : (
              // Only offered while marking by hand. Showing it beside a live
              // camera would turn scanning into the slower of two options.
              mode === 'manual' && (
                <Pressable
                  onPress={() => markByHand(bag)}
                  style={({ pressed }) => [styles.scanChip, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.scanChipLabel}>Mark</Text>
                </Pressable>
              )
            )}
          </View>
        ))}
      </ScrollView>

      <Divider style={{ marginTop: 4 }} />

      <View style={styles.actions}>
        <Button label="Close" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          label={`Confirm ${bags.length} bags`}
          onPress={() => onScanComplete(bags)}
          disabled={!allScanned}
          icon={<ShieldCheck size={15} color="#FFFFFF" />}
          style={{ flex: 1.4 }}
        />
      </View>
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

  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgLinen,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  modeButtonActive: { backgroundColor: colors.cardPure },
  modeLabel: { fontSize: 10.5, fontWeight: '600', color: colors.textSlate },
  modeLabelActive: { color: colors.textCharcoal },

  viewfinder: {
    aspectRatio: 16 / 10,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  viewfinderPlaceholder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 4,
  },
  viewfinderTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  viewfinderBody: {
    color: colors.textSlate,
    fontSize: 9.5,
    textAlign: 'center',
    maxWidth: 200,
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: colors.brandGold,
  },
  cornerTL: { top: 20, left: 20, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 6 },
  cornerTR: { top: 20, right: 20, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 6 },
  cornerBL: {
    bottom: 20,
    left: 20,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 20,
    right: 20,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 6,
  },
  statusPill: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statusText: { color: '#FFFFFF', fontSize: 9 },

  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checklistTitle: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },

  bagList: { maxHeight: 150 },
  bagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgIvory,
  },
  bagRowScanned: {
    borderColor: tints.success30,
    backgroundColor: tints.success10,
  },
  bagIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tints.stone30,
  },
  bagIconScanned: { backgroundColor: tints.success10 },
  bagTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bagType: { fontSize: 11.5, fontWeight: '700', color: colors.textCharcoal, flexShrink: 1 },
  bagWeight: {
    fontSize: 9,
    color: colors.textSlate,
    backgroundColor: colors.borderSoft,
    borderRadius: 3,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  bagCode: {
    fontSize: 9.5,
    color: colors.textSlate,
    marginTop: 2,
    ...Platform.select({ ios: { fontFamily: 'Menlo' }, android: { fontFamily: 'monospace' } }),
  },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedLabel: { fontSize: 9.5, fontWeight: '700', color: colors.statusSuccess },
  scanChip: {
    backgroundColor: colors.brandSage,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  scanChipLabel: { fontSize: 9.5, fontWeight: '700', color: '#FFFFFF' },

  actions: { flexDirection: 'row', gap: 10 },
});
