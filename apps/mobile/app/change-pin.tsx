/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import { AlertCircle, KeyRound, ShieldCheck } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@freshfold/core';
import { Button } from '../src/components/ui';
import { api } from '../src/services/api';
import { useSession } from '../src/store/SessionStore';
import { colors, radius, shadow, tints } from '../src/theme';

const PIN_DIGITS = 4;

/**
 * Replacing the temporary PIN a supervisor issued.
 *
 * There is no way past this screen. A courier signed in on a provisional
 * credential is one whose PIN a second person also knows — the supervisor who
 * read it out — so the console stays shut until only the courier knows it.
 */
export default function ChangePinScreen() {
  const router = useRouter();
  const { rider, token, applyRider } = useSession();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (currentPin.length !== PIN_DIGITS || newPin.length !== PIN_DIGITS) {
      setError(`Every PIN is ${PIN_DIGITS} digits.`);
      return;
    }
    if (newPin !== confirmPin) {
      setError('The two new PINs do not match.');
      return;
    }
    if (newPin === currentPin) {
      setError('Choose a PIN different from the temporary one.');
      return;
    }
    if (!token) {
      setError('Your session has expired. Sign in again.');
      return;
    }

    setError('');
    setBusy(true);

    try {
      await api.changeRiderPin({ currentPin, newPin }, token);

      // The server has cleared the flag; mirror it locally so the gate opens
      // without waiting for the next poll.
      if (rider) applyRider({ ...rider, mustChangePin: false });

      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      router.replace('/(tabs)/profile');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401 ? 'That is not your current PIN.' : err.message
        );
      } else {
        setError('Could not reach dispatch. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [currentPin, newPin, confirmPin, token, rider, applyRider, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.mark}>
            <KeyRound size={22} color={colors.brandSage} />
          </View>

          <Text style={styles.heading}>Choose your own PIN</Text>
          <Text style={styles.body}>
            You signed in with a temporary PIN from your supervisor. They know it too, so it
            cannot stay. Pick one only you know — you will use it every shift.
          </Text>

          <View style={styles.form}>
            <PinField
              label="Temporary PIN"
              value={currentPin}
              onChange={(next) => {
                setCurrentPin(next);
                setError('');
              }}
            />
            <PinField
              label="New PIN"
              value={newPin}
              onChange={(next) => {
                setNewPin(next);
                setError('');
              }}
            />
            <PinField
              label="New PIN again"
              value={confirmPin}
              onChange={(next) => {
                setConfirmPin(next);
                setError('');
              }}
            />

            {!!error && (
              <View style={styles.errorBox}>
                <AlertCircle size={14} color={colors.statusError} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              label="Set my PIN"
              onPress={submit}
              loading={busy}
              disabled={
                currentPin.length !== PIN_DIGITS ||
                newPin.length !== PIN_DIGITS ||
                confirmPin.length !== PIN_DIGITS
              }
            />
          </View>

          <View style={styles.assurance}>
            <ShieldCheck size={14} color={colors.brandSage} />
            <Text style={styles.assuranceText}>
              Your PIN is hashed on the dispatch server. Nobody at FreshFold can read it back —
              a forgotten PIN is replaced, not recovered.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PinField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, PIN_DIGITS))}
        placeholder="••••"
        placeholderTextColor={colors.brandStone}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={PIN_DIGITS}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory },
  scroll: { padding: 24, paddingTop: 40, gap: 6 },

  mark: {
    width: 52,
    height: 52,
    borderRadius: 20,
    backgroundColor: tints.sage10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heading: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.textCharcoal,
  },
  body: { fontSize: 12.5, color: colors.textSlate, lineHeight: 18, marginTop: 6 },

  form: { gap: 14, marginTop: 26 },
  field: { gap: 6 },
  label: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.brandStone,
    borderRadius: radius.lg,
    backgroundColor: colors.cardPure,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 12,
    textAlign: 'center',
    color: colors.textCharcoal,
    ...shadow.xs,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tints.error05,
    borderWidth: 1,
    borderColor: tints.error30,
    borderRadius: radius.md,
    padding: 11,
  },
  errorText: { flex: 1, fontSize: 11, color: colors.statusError, lineHeight: 15 },

  assurance: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 26 },
  assuranceText: { flex: 1, fontSize: 10, color: colors.textSlate, lineHeight: 14.5 },
});
