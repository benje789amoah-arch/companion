/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, Check, ImageIcon, RotateCcw } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import { Button, Divider } from './ui';

interface CameraCaptureProps {
  onCapture: (photoUri: string) => void;
  onCancel?: () => void;
  title?: string;
  context?: 'pickup' | 'delivery';
}

/** Stand-in shots so the flow is demoable without pointing a phone at laundry. */
const PRESET_PHOTOS = {
  pickup: [
    {
      id: 'p1',
      label: 'Canvas bags on KNUST bench',
      url: 'https://images.unsplash.com/photo-1545173168-9f19472ef7f8?auto=format&fit=crop&q=80&w=600',
    },
    {
      id: 'p2',
      label: 'Silk bags at reception',
      url: 'https://images.unsplash.com/photo-1528570188406-29a019a2884c?auto=format&fit=crop&q=80&w=600',
    },
  ],
  delivery: [
    {
      id: 'd1',
      label: 'Pressed linen at the desk',
      url: 'https://images.unsplash.com/photo-1541123437800-1bb1317badc2?auto=format&fit=crop&q=80&w=600',
    },
    {
      id: 'd2',
      label: 'Garments hung on valet',
      url: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=600',
    },
  ],
} as const;

type CaptureMode = 'presets' | 'camera';

export default function CameraCapture({
  onCapture,
  onCancel,
  title = 'Capture condition documentation',
  context = 'pickup',
}: CameraCaptureProps) {
  const [mode, setMode] = useState<CaptureMode>('presets');
  const [captured, setCaptured] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const enterCameraMode = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setMode('camera');
  };

  const takePicture = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (photo?.uri) setCaptured(photo.uri);
    } catch {
      // Falling back to the presets keeps the workflow unblocked on a device
      // where the camera is unavailable (simulator, hardware in use, etc).
      setMode('presets');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Camera size={20} color={colors.brandSage} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            Verify garment placement and state of cleanliness
          </Text>
        </View>
      </View>

      {!captured && (
        <View style={styles.modeToggle}>
          <Pressable
            onPress={() => setMode('presets')}
            style={[styles.modeButton, mode === 'presets' && styles.modeButtonActive]}
          >
            <Text style={[styles.modeLabel, mode === 'presets' && styles.modeLabelActive]}>
              Gallery presets
            </Text>
          </Pressable>
          <Pressable
            onPress={enterCameraMode}
            style={[styles.modeButton, mode === 'camera' && styles.modeButtonActive]}
          >
            <Text style={[styles.modeLabel, mode === 'camera' && styles.modeLabelActive]}>
              Device camera
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.viewfinder}>
        {captured ? (
          <Image source={{ uri: captured }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : mode === 'camera' && permission?.granted ? (
          <>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
            <Pressable
              onPress={takePicture}
              accessibilityLabel="Take photo"
              style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              <View style={styles.shutterInner} />
            </Pressable>
          </>
        ) : (
          <View style={styles.presetPane}>
            <ImageIcon size={34} color="rgba(255,255,255,0.4)" />
            <Text style={styles.presetTitle}>Select a dispatch photo</Text>
            <Text style={styles.presetBody}>
              Simulates capturing the concierge handover
            </Text>

            <View style={styles.presetGrid}>
              {PRESET_PHOTOS[context].map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setCaptured(item.url)}
                  style={({ pressed }) => [styles.presetCard, pressed && { opacity: 0.75 }]}
                >
                  <Image source={{ uri: item.url }} style={styles.presetImage} />
                  <Text style={styles.presetCaption} numberOfLines={2}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
      </View>

      <Divider />

      <View style={styles.actions}>
        {captured ? (
          <>
            <Button
              label="Retake"
              variant="ghost"
              onPress={() => setCaptured(null)}
              icon={<RotateCcw size={14} color={colors.textCharcoal} />}
              style={{ flex: 1 }}
            />
            <Button
              label="Submit proof"
              onPress={() => onCapture(captured)}
              icon={<Check size={15} color="#FFFFFF" />}
              style={{ flex: 1 }}
            />
          </>
        ) : (
          <Button label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        )}
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
  modeButton: { flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: 'center' },
  modeButtonActive: { backgroundColor: colors.cardPure },
  modeLabel: { fontSize: 10.5, fontWeight: '600', color: colors.textSlate },
  modeLabelActive: { color: colors.textCharcoal },

  viewfinder: {
    aspectRatio: 4 / 3,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  shutter: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.statusError,
  },

  presetPane: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 3,
  },
  presetTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginTop: 4 },
  presetBody: { color: colors.textSlate, fontSize: 9.5, marginBottom: 8 },
  presetGrid: { flexDirection: 'row', gap: 10 },
  presetCard: {
    width: 120,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  presetImage: { width: '100%', height: 64 },
  presetCaption: {
    fontSize: 8,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 4,
    paddingVertical: 3,
    textAlign: 'center',
  },

  corner: { position: 'absolute', width: 16, height: 16, borderColor: 'rgba(255,255,255,0.45)' },
  cornerTL: { top: 14, left: 14, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 14, right: 14, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 14, left: 14, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 14, right: 14, borderBottomWidth: 2, borderRightWidth: 2 },

  actions: { flexDirection: 'row', gap: 10 },
});
