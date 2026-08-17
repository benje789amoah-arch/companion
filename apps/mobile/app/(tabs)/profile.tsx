/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import { ScanFace, Star } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';
import { Avatar, Button, Card } from '../../src/components/ui';
import { usePullToRefresh } from '../../src/hooks/usePullToRefresh';
import { useApp } from '../../src/store/AppStore';
import { useSession } from '../../src/store/SessionStore';
import { DEFAULT_AVATAR, colors, radius } from '../../src/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { rider, updateRider, profileComplete } = useApp();
  const { signOut, lock, biometricEnabled, setBiometricEnabled } = useSession();
  const refreshControl = usePullToRefresh();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(rider.name);
  const [avatar, setAvatar] = useState(rider.avatar);

  useEffect(() => {
    setName(rider.name);
    setAvatar(rider.avatar);
  }, [rider]);

  // A rider without a saved name has to complete the form before anything else.
  // The form stays open, with no way to dismiss it, until dispatch has
  // everything it needs — same rule the accept gate uses.
  const mustSetUp = !profileComplete;
  const showForm = editing || mustSetUp;

  /**
   * All this form can complete is the courier's own name. The employee ID and
   * the vehicle were both set by a supervisor — dispatch still requires all
   * three before a job can be accepted (`REQUIRED_PROFILE_FIELDS` in the
   * store), but only one of them is this screen's to fill.
   */
  const formComplete = !!name.trim();
  /** Nothing the courier can do about this one; the roster desk assigns it. */
  const awaitingVehicle = !rider.vehicle.trim() || !rider.vehiclePlate.trim();

  const save = () => {
    if (!formComplete) return;
    updateRider({
      name: name.trim(),
      avatar: avatar.trim() || DEFAULT_AVATAR,
    });
    setEditing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoider>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {showForm ? (
            <Card style={{ gap: 12 }}>
              <Text style={styles.formTitle}>
                {mustSetUp ? 'Set up driver profile' : 'Edit driver profile'}
              </Text>

              <ReadOnlyField label="Employee ID" value={rider.employeeId || '—'} />

              <Field label="Full name" value={name} onChange={setName} placeholder="e.g. Emmanuel Boateng" />

              <ReadOnlyField label="Vehicle type" value={rider.vehicle || 'Not assigned yet'} />
              <ReadOnlyField label="Vehicle plate" value={rider.vehiclePlate || 'Not assigned yet'} />

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
                  disabled={!formComplete}
                  style={{ flex: 1.4 }}
                />
              </View>

              {!formComplete && (
                <Text style={styles.formNote}>
                  Your name is needed before you can accept jobs — customers are shown it when you
                  are on the way.
                </Text>
              )}

              {awaitingVehicle && (
                <Text style={styles.formNote}>
                  No vehicle is assigned to you yet. Dispatch assigns it from the roster desk, and
                  jobs stay locked until they have — ask your supervisor.
                </Text>
              )}
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
      </KeyboardAvoider>
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

/**
 * A field the courier can read but not change. The employee ID is assigned by
 * the supervisor's console when they are added to the roster — it is what they
 * sign in with, so editing it here would only lock them out.
 */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={styles.fieldLabel}>{label} · assigned</Text>
      <Text style={[styles.input, styles.inputLocked]}>{value}</Text>
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
  inputLocked: {
    backgroundColor: colors.bgLinen,
    color: colors.textSlate,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  formNote: { fontSize: 10, color: colors.textSlate, lineHeight: 14 },

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
