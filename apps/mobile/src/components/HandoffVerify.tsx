/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { KeyRound, ScanLine, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseHandoffPayload, verifyHandoff } from '@freshfold/core';
import { colors, radius, tints } from '../theme';
import { Order } from '../types';
import { Button, Divider } from './ui';

/**
 * Checking the customer's collection code before taking the bags.
 *
 * The customer's app and the website both show a four-digit code and a QR
 * carrying the same thing. Scanning is the fast path; typing exists because
 * cameras fail in the dark, in the rain, and on cracked screens, and a courier
 * standing at a door cannot be blocked by that.
 *
 * A scanned payload has to name *this* job — `verifyHandoff` enforces it. A
 * courier holding two orders for the same street cannot have one customer's
 * QR accepted against the other's job.
 */

interface HandoffVerifyProps {
  order: Order;
  onVerified: () => void;
  onCancel?: () => void;
}

type Mode = 'camera' | 'manual';

export default function HandoffVerify({ order, onVerified, onCancel }: HandoffVerifyProps) {
  const [mode, setMode] = useState<Mode>('camera');
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState(
    'Ask the customer to show their collection code, then scan it.'
  );
  const [failed, setFailed] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // The camera fires continuously; ignore repeats of a code just handled.
  const lastCodeRef = useRef<{ value: string; at: number } | null>(null);

  const accept = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onVerified();
  }, [onVerified]);

  const reject = useCallback((message: string) => {
    setFailed(true);
    setStatus(message);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, []);

  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      if (lastCodeRef.current?.value === data && now - lastCodeRef.current.at < 2000) return;
      lastCodeRef.current = { value: data, at: now };

      if (verifyHandoff(data, { jobId: order.id, leg: 'pickup', code: order.pickupOtp })) {
        setFailed(false);
        setStatus('Code verified.');
        accept();
        return;
      }

      // Distinguish "somebody else's code" from "not one of ours at all" —
      // they call for completely different reactions at the door.
      const parsed = parseHandoffPayload(data);
      if (parsed && parsed.jobId !== order.id) {
        reject(`That code belongs to order ${parsed.jobId}, not ${order.orderNumber}.`);
      } else if (parsed) {
        reject('That code does not match this order. Ask the customer to refresh it.');
      } else {
        reject('That is not a FreshFold collection code.');
      }
    },
    [order.id, order.orderNumber, order.pickupOtp, accept, reject]
  );

  const submitTyped = () => {
    if (verifyHandoff(typed, { jobId: order.id, leg: 'pickup', code: order.pickupOtp })) {
      setFailed(false);
      accept();
    } else {
      reject('Those digits do not match. Ask the customer to read them again.');
    }
  };

  const enterCameraMode = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setMode('manual');
        setStatus('Camera access declined. Type the four digits instead.');
        return;
      }
    }
    setMode('camera');
    setStatus('Align the customer’s QR inside the frame.');
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <ScanLine size={20} color={colors.brandSage} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Verify the collection</Text>
          <Text style={styles.subtitle}>
            {order.orderNumber} · {order.customerName}
          </Text>
        </View>
      </View>

      <View style={styles.modeToggle}>
        <Pressable
          onPress={enterCameraMode}
          style={[styles.modeButton, mode === 'camera' && styles.modeButtonActive]}
        >
          <Text style={[styles.modeLabel, mode === 'camera' && styles.modeLabelActive]}>
            Scan QR
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMode('manual');
            setStatus('Ask the customer to read out their four digits.');
          }}
          style={[styles.modeButton, mode === 'manual' && styles.modeButtonActive]}
        >
          <Text style={[styles.modeLabel, mode === 'manual' && styles.modeLabelActive]}>
            Type the code
          </Text>
        </Pressable>
      </View>

      {mode === 'camera' ? (
        <View style={styles.viewfinder}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
          ) : (
            <View style={styles.viewfinderPlaceholder}>
              <ScanLine size={40} color={tints.sage30} />
              <Text style={styles.viewfinderTitle}>Camera not enabled</Text>
              <Text style={styles.viewfinderBody}>
                Grant access to scan, or switch to typing the code.
              </Text>
            </View>
          )}

          <View style={[styles.corner, styles.cornerTL, failed && styles.cornerFailed]} />
          <View style={[styles.corner, styles.cornerTR, failed && styles.cornerFailed]} />
          <View style={[styles.corner, styles.cornerBL, failed && styles.cornerFailed]} />
          <View style={[styles.corner, styles.cornerBR, failed && styles.cornerFailed]} />

          <View style={[styles.statusPill, failed && styles.statusPillFailed]}>
            <Text style={styles.statusText} numberOfLines={2}>
              {status}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.manualPane}>
          <KeyRound size={17} color={colors.brandSage} />
          <Text style={styles.manualTitle}>Four digits from the customer</Text>
          <TextInput
            value={typed}
            onChangeText={(next) => {
              setTyped(next.replace(/\D/g, '').slice(0, 4));
              setFailed(false);
            }}
            placeholder="0000"
            placeholderTextColor={colors.brandStone}
            keyboardType="number-pad"
            style={[styles.manualInput, failed && styles.manualInputFailed]}
            maxLength={4}
          />
          {failed && (
            <View style={styles.failRow}>
              <TriangleAlert size={13} color={colors.statusError} />
              <Text style={styles.failText}>{status}</Text>
            </View>
          )}
          <Button
            label="Verify code"
            onPress={submitTyped}
            disabled={typed.length < 4}
            icon={<ShieldCheck size={15} color="#FFFFFF" />}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      )}

      <View style={styles.notice}>
        <ShieldCheck size={14} color={colors.brandSage} />
        <Text style={styles.noticeText}>
          Do not collect without a matching code. If the customer cannot produce one, call
          dispatch rather than taking the bags.
        </Text>
      </View>

      <Divider />

      <Button label="Cancel" variant="ghost" onPress={onCancel} />
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
  modeButton: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  modeButtonActive: { backgroundColor: colors.cardPure },
  modeLabel: { fontSize: 10.5, fontWeight: '600', color: colors.textSlate },
  modeLabelActive: { color: colors.textCharcoal },

  viewfinder: {
    aspectRatio: 16 / 11,
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
    padding: 18,
    gap: 4,
  },
  viewfinderTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginTop: 6 },
  viewfinderBody: {
    color: colors.textSlate,
    fontSize: 9.5,
    textAlign: 'center',
    maxWidth: 210,
  },
  corner: { position: 'absolute', width: 20, height: 20, borderColor: colors.brandGold },
  cornerFailed: { borderColor: colors.statusError },
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
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statusPillFailed: { backgroundColor: 'rgba(184, 92, 92, 0.85)' },
  statusText: { color: '#FFFFFF', fontSize: 9.5, lineHeight: 13 },

  manualPane: {
    alignItems: 'center',
    gap: 11,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgIvory,
  },
  manualTitle: { fontSize: 11.5, fontWeight: '700', color: colors.textCharcoal },
  manualInput: {
    width: 168,
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 12,
    color: colors.textCharcoal,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.brandStone,
    backgroundColor: colors.cardPure,
    ...Platform.select({ ios: { fontFamily: 'Menlo' }, android: { fontFamily: 'monospace' } }),
  },
  manualInputFailed: { borderColor: colors.statusError },
  failRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  failText: { flex: 1, fontSize: 10, color: colors.statusError, lineHeight: 14 },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: tints.stone30,
    borderRadius: radius.md,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  noticeText: { flex: 1, fontSize: 9.5, color: colors.textSlate, lineHeight: 13.5 },
});
