/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import { AlertCircle, ScanFace } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, PHONE_DIGITS, limitPhoneInput } from '@freshfold/core';
import { KeyboardAvoider } from '../src/components/KeyboardAvoider';
import { Button } from '../src/components/ui';
import { REQUIRED_PROFILE_FIELDS, useApp } from '../src/store/AppStore';
import { useSession } from '../src/store/SessionStore';
import { colors, radius, shadow, tints } from '../src/theme';

const PIN_DIGITS = 4;

export default function AuthScreen() {
  const router = useRouter();
  const { updateRider, profileComplete } = useApp();
  const { signIn, biometricEnabled, promptBiometric, rider, phase } = useSession();

  /** Employee ID, or the phone number on the employment record. */
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanningFace, setScanningFace] = useState(false);

  const landAfterLogin = useCallback(
    (complete: boolean) => {
      updateRider({ isOnline: true });
      // Land on Profile whenever anything dispatch requires is still missing —
      // otherwise the courier reaches the board only to find every accept
      // refused with no explanation.
      router.replace(complete ? '/(tabs)' : '/(tabs)/profile');
    },
    [router, updateRider]
  );

  const submit = useCallback(async () => {
    if (!identifier.trim() || pin.length !== PIN_DIGITS) {
      setAuthError(`Enter your employee ID and your ${PIN_DIGITS}-digit PIN.`);
      return;
    }

    setAuthError('');
    setBusy(true);

    try {
      const signedIn = await signIn(identifier, pin);
      setPin('');
      // The roster record decides where to land, not the store's copy — the
      // store has not seen this courier yet at this point in the render.
      landAfterLogin(
        REQUIRED_PROFILE_FIELDS.every((field) => String(signedIn[field] ?? '').trim())
      );
    } catch (error) {
      if (error instanceof ApiError) {
        setAuthError(
          error.status === 401
            ? 'That employee ID and PIN do not match.'
            : error.status === 403
              ? 'This courier is no longer on the roster. Speak to dispatch.'
              : error.message
        );
      } else {
        setAuthError('Could not reach dispatch. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [identifier, pin, signIn, landAfterLogin]);

  /**
   * Biometrics reopen a session; they do not create one.
   *
   * A face is not a credential the server can check, so this only works once a
   * courier has signed in on this device and the token is still valid. Without
   * that there is nobody to unlock as.
   */
  const authenticateWithBiometrics = async () => {
    if (!rider) {
      setAuthError('Sign in with your employee ID once on this device first.');
      return;
    }

    setScanningFace(true);
    try {
      const ok = await promptBiometric();
      if (!ok) {
        setAuthError('Biometric verification was not completed.');
        return;
      }
      landAfterLogin(profileComplete);
    } finally {
      setScanningFace(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoider>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>White-glove service</Text>
            <Text style={styles.heading}>FreshFold rider authentication</Text>
            <Text style={styles.introBody}>
              Access the elite dispatch rider companion console with secure biometric
              encryption.
            </Text>
          </View>

          <View style={styles.form}>
            {!!authError && (
              <View style={[styles.toast, styles.toastError]}>
                <AlertCircle size={14} color={colors.statusError} />
                <Text style={styles.toastErrorText}>{authError}</Text>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Employee ID or phone</Text>
              <TextInput
                value={identifier}
                onChangeText={(text) => {
                  // One field, two kinds of answer. An employee ID has letters
                  // in it and is left alone; a number is a phone number, and a
                  // phone number is ten digits, so the eleventh never lands.
                  setIdentifier(/[a-z]/i.test(text) ? text : limitPhoneInput(text));
                  setAuthError('');
                }}
                placeholder="e.g. RIDER-204"
                placeholderTextColor={colors.textSlate}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.input}
              />
              <Text style={styles.hint}>
                The {PHONE_DIGITS}-digit number on your employment record works too.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Access PIN</Text>
              <TextInput
                value={pin}
                onChangeText={(text) => {
                  setPin(text.replace(/\D/g, '').slice(0, PIN_DIGITS));
                  setAuthError('');
                }}
                placeholder="••••"
                placeholderTextColor={colors.textSlate}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={PIN_DIGITS}
                style={[styles.input, styles.otpInput]}
                onSubmitEditing={submit}
                returnKeyType="go"
              />
              <Text style={[styles.hint, styles.counter]}>
                {pin.length}/{PIN_DIGITS} digits
              </Text>
            </View>

            <Button
              label="Sign in"
              onPress={submit}
              loading={busy}
              disabled={!identifier.trim() || pin.length !== PIN_DIGITS}
            />

            {biometricEnabled && (
              <View style={styles.biometric}>
                <Pressable
                  onPress={authenticateWithBiometrics}
                  accessibilityLabel="Authenticate with biometrics"
                  style={({ pressed }) => [styles.faceButton, pressed && { opacity: 0.8 }]}
                >
                  <ScanFace size={32} color={colors.brandSage} />
                </Pressable>
                <Text style={styles.biometricLabel}>Authenticate with Face ID</Text>
              </View>
            )}
          </View>

          <View style={styles.legal}>
            <Text style={styles.legalText}>
              By continuing, you agree to geolocation tracking during your operational shift.
            </Text>
            <Text style={styles.legalBrand}>FreshFold Luxury Co. All rights reserved 2026</Text>
          </View>
        </ScrollView>
      </KeyboardAvoider>

      {scanningFace && (
        <View style={styles.scanOverlay}>
          <View style={styles.scanBox}>
            <ScanFace size={46} color={colors.brandSage} />
          </View>
          <ActivityIndicator color={colors.brandGold} style={{ marginTop: 18 }} />
          <Text style={styles.scanTitle}>Verifying identity…</Text>
          <Text style={styles.scanSub}>Biometric hash encryption</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory },
  scroll: { flexGrow: 1, padding: 28, justifyContent: 'space-between', gap: 28 },

  intro: { gap: 5, marginTop: 12 },
  eyebrow: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.brandSage,
  },
  heading: { fontSize: 24, fontWeight: '800', color: colors.textCharcoal, lineHeight: 30 },
  introBody: { fontSize: 11.5, color: colors.textSlate, lineHeight: 17 },

  form: { gap: 14 },
  field: { gap: 6 },
  label: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.cardPure,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 13,
    color: colors.textCharcoal,
    ...shadow.xs,
  },
  otpInput: {
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: '700',
    fontSize: 16,
  },
  hint: { fontSize: 9.5, color: colors.textSlate },
  hintCode: { color: colors.brandGold, fontWeight: '700' },
  counter: { textAlign: 'right' },
  row: { flexDirection: 'row', gap: 10 },

  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toastError: { backgroundColor: tints.error05, borderColor: tints.error20 },
  toastErrorText: { flex: 1, fontSize: 10.5, color: colors.statusError },
  toastSuccess: { backgroundColor: tints.success10, borderColor: tints.success30 },
  toastSuccessText: { flex: 1, fontSize: 10.5, color: colors.statusSuccess },

  biometric: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  faceButton: {
    width: 68,
    height: 68,
    borderRadius: radius.xxl,
    backgroundColor: tints.sage10,
    borderWidth: 2,
    borderColor: tints.sage30,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  biometricLabel: { fontSize: 10, fontWeight: '700', color: colors.brandSage },

  legal: { alignItems: 'center', gap: 4 },
  legalText: { fontSize: 9, color: colors.textSlate, textAlign: 'center' },
  legalBrand: { fontSize: 9, fontWeight: '600', color: colors.brandGold },

  scanOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: tints.scrimDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBox: {
    width: 106,
    height: 106,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.brandSage,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTitle: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.brandGold,
  },
  scanSub: { marginTop: 4, fontSize: 9, color: 'rgba(255,255,255,0.7)' },
});
