/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import { ScanFace, Star } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Button, Card } from '../../src/components/ui';
import { useApp } from '../../src/store/AppStore';
import { useSession } from '../../src/store/SessionStore';
import { DEFAULT_AVATAR, colors, radius } from '../../src/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { rider, updateRider } = useApp();
  const { signOut, lock, biometricEnabled, setBiometricEnabled } = useSession();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(rider.name);
  const [employeeId, setEmployeeId] = useState(rider.employeeId);
  const [vehicle, setVehicle] = useState(rider.vehicle);
  const [vehiclePlate, setVehiclePlate] = useState(rider.vehiclePlate);
  const [avatar, setAvatar] = useState(rider.avatar);

  useEffect(() => {
    setName(rider.name);
    setEmployeeId(rider.employeeId);
    setVehicle(rider.vehicle);
    setVehiclePlate(rider.vehiclePlate);
    setAvatar(rider.avatar);
  }, [rider]);

  // A rider without a saved name has to complete the form before anything else.
  const mustSetUp = !rider.name;
  const showForm = editing || mustSetUp;

  const save = () => {
    if (!name.trim() || !employeeId.trim()) return;
    updateRider({
      name: name.trim(),
      employeeId: employeeId.trim(),
      vehicle: vehicle.trim(),
      vehiclePlate: vehiclePlate.trim(),
      avatar: avatar.trim() || DEFAULT_AVATAR,
    });
    setEditing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {showForm ? (
            <Card style={{ gap: 12 }}>
              <Text style={styles.formTitle}>
                {mustSetUp ? 'Set up driver profile' : 'Edit driver profile'}
              </Text>

              <Field label="Full name" value={name} onChange={setName} placeholder="e.g. Emmanuel Boateng" />
              <Field
                label="Employee ID"
                value={employeeId}
                onChange={setEmployeeId}
                placeholder="e.g. RIDER-9051"
              />
              <Field
                label="Vehicle type"
                value={vehicle}
                onChange={setVehicle}
                placeholder="e.g. Electric delivery scooter"
              />
              <Field
                label="Vehicle plate"
                value={vehiclePlate}
                onChange={setVehiclePlate}
                placeholder="e.g. AS-3012-26"
              />
              <Field
                label="Avatar URL (optional)"
                value={avatar}
                onChange={setAvatar}
                placeholder="https://…"
                autoCapitalize="none"
              />

              <View style={styles.formActions}>
                {!mustSetUp && (
                  <Button
                    label="Cancel"
                    variant="ghost"
                    onPress={() => setEditing(false)}
                    style={{ flex: 1 }}
                  />
                )}
                <Button
                  label="Save profile"
                  onPress={save}
                  disabled={!name.trim() || !employeeId.trim()}
                  style={{ flex: 1.4 }}
                />
              </View>
            </Card>
          ) : (
            <Card style={styles.identityCard}>
              <Avatar uri={rider.avatar} size={62} style={{ borderWidth: 2 }} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {rider.name}
                </Text>
                <Text style={styles.vehicle} numberOfLines={1}>
                  {rider.vehicle || 'No vehicle on file'}
                </Text>
                <Text style={styles.plate}>Plate: {rider.vehiclePlate || '—'}</Text>
              </View>
              <Pressable
                onPress={() => setEditing(true)}
                style={({ pressed }) => [styles.editChip, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.editLabel}>Edit</Text>
              </Pressable>
            </Card>
          )}

          <Card style={{ gap: 12 }}>
            <View style={styles.metricsHeader}>
              <Star size={15} color={colors.brandGold} fill={colors.brandGold} />
              <Text style={styles.metricsTitle}>Rider metrics profile</Text>
            </View>

            <View style={styles.metricsGrid}>
              <Metric label="Rider rating" value={`${rider.rating} ★`} />
              <Metric label="On-time %" value={`${rider.onTimeRate}%`} />
              <Metric label="Acceptance rate" value={`${rider.acceptanceRate}%`} />
              <Metric label="Completion rate" value={`${rider.completionRate}%`} />
            </View>
          </Card>

          <Card style={{ gap: 4 }}>
            <Text style={styles.configTitle}>App configuration</Text>

            <ConfigRow label="Live geolocation tracking" value="ACTIVE" tone="success" />

            <View style={styles.configRow}>
              <Text style={styles.configLabel}>Biometric unlock</Text>
              <Pressable
                onPress={() => setBiometricEnabled(!biometricEnabled)}
                style={[styles.toggle, biometricEnabled && styles.toggleOn]}
              >
                <Text style={[styles.toggleLabel, biometricEnabled && styles.toggleLabelOn]}>
                  {biometricEnabled ? 'ENABLED' : 'DISABLED'}
                </Text>
              </Pressable>
            </View>

            <ConfigRow label="Offline caching engine" value="STANDBY" />
            <ConfigRow label="Operational shift" value="08:00 – 22:00" tone="sage" last />
          </Card>

          {biometricEnabled && (
            <Button
              label="Lock console & test Face ID"
              variant="outline"
              icon={<ScanFace size={15} color={colors.brandSage} />}
              onPress={() => {
                lock();
                router.replace('/auth');
              }}
            />
          )}

          <Button
            label="Log out of scooter console"
            variant="danger"
            onPress={() => {
              updateRider({ isOnline: false });
              signOut();
              router.replace('/auth');
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize = 'words',
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'words';
}) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSlate}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function ConfigRow({
  label,
  value,
  tone,
  last,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'sage';
  last?: boolean;
}) {
  const color =
    tone === 'success'
      ? colors.statusSuccess
      : tone === 'sage'
        ? colors.brandSage
        : colors.textSlate;

  return (
    <View style={[styles.configRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.configLabel}>{label}</Text>
      <Text style={[styles.configValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory },
  scroll: { padding: 18, gap: 14, paddingBottom: 40 },

  formTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textCharcoal,
  },
  fieldLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    backgroundColor: colors.bgIvory,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12.5,
    color: colors.textCharcoal,
  },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },

  identityCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontSize: 15, fontWeight: '800', color: colors.textCharcoal },
  vehicle: { fontSize: 10.5, color: colors.textSlate },
  plate: {
    alignSelf: 'flex-start',
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.textSlate,
    backgroundColor: colors.bgLinen,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  editChip: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  editLabel: { fontSize: 10, fontWeight: '700', color: colors.textCharcoal },

  metricsHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  metricsTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textCharcoal,
  },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    backgroundColor: colors.bgIvory,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    paddingVertical: 10,
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  metricValue: { fontSize: 14, fontWeight: '800', color: colors.textCharcoal, marginTop: 3 },

  configTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textSlate,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingBottom: 8,
    marginBottom: 4,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  configLabel: { fontSize: 12, color: colors.textCharcoal },
  configValue: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  toggle: {
    backgroundColor: colors.borderSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  toggleOn: { backgroundColor: colors.brandSage },
  toggleLabel: { fontSize: 9, fontWeight: '800', color: colors.textSlate },
  toggleLabelOn: { color: '#FFFFFF' },
});
