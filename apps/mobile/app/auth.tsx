/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { AlertCircle, CheckCircle2, ScanFace } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { Button } from '../src/components/ui';
import { useApp } from '../src/store/AppStore';
import { useSession } from '../src/store/SessionStore';
import { colors, radius, shadow, tints } from '../src/theme';

/** Demo bypass codes, same as the original console. */
const VALID_PINS = ['7801', '1234'];

export default function AuthScreen() {
  const router = useRouter();
  const { rider, updateRider } = useApp();
  const { signIn, biometricEnabled } = useSession();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showOtpField, setShowOtpField] = useState(false);
  const [authError, setAuthError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [scanningFace, setScanningFace] = useState(false);

  const completeLogin = () => {
    signIn();
    updateRider({ isOnline: true });
    // A rider with no saved profile lands on Profile to fill it in first.
    router.replace(rider.name ? '/(tabs)' : '/(tabs)/profile');
  };

  const requestOtp = () => {
    if (!phoneNumber.trim()) {
      setAuthError('Please provide an employee registered phone number');
      return;
    }
    setAuthError('');
    setOtpSent(true);
    setShowOtpField(true);
    setTimeout(() => setOtpSent(false), 3000);
  };

  const verifyOtp = () => {
    if (VALID_PINS.includes(otpCode)) {
      setAuthError('');
      completeLogin();
    } else {
      setAuthError("Invalid access pin. Try entering '7801' or '1234'.");
    }
  };

  const authenticateWithBiometrics = async () => {
    setScanningFace(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock the FreshFold rider console',
          fallbackLabel: 'Use access PIN',
        });

        if (!result.success) {
          setAuthError('Biometric verification was not completed.');
          return;
        }
      } else {
        // No enrolled biometrics on this device — keep the demo walkable.
        await new Promise((resolve) => setTimeout(resolve, 900));
      }

      completeLogin();
    } finally {
      setScanningFace(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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

            {otpSent && (
              <View style={[styles.toast, styles.toastSuccess]}>
                <CheckCircle2 size={14} color={colors.statusSuccess} />
                <Text style={styles.toastSuccessText}>
                  OTP code sent to the registered driver line
                </Text>
              </View>
            )}

            {!showOtpField ? (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Mobile phone line</Text>
                  <TextInput
                    value={phoneNumber}
                    onChangeText={(text) => setPhoneNumber(text.replace(/\D/g, ''))}
                    placeholder="e.g. 0243456789"
                    placeholderTextColor={colors.textSlate}
                    keyboardType="phone-pad"
                    style={styles.input}
                  />
                </View>

                <Button label="Request access OTP" onPress={requestOtp} />
              </>
            ) : (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Enter 4-digit security PIN</Text>
                  <TextInput
                    value={otpCode}
                    onChangeText={setOtpCode}
                    placeholder="e.g. 7801"
                    placeholderTextColor={colors.textSlate}
                    keyboardType="number-pad"
                    maxLength={4}
                    style={[styles.input, styles.otpInput]}
                  />
                  <Text style={styles.hint}>
                    Mock security bypass code is <Text style={styles.hintCode}>7801</Text>
                  </Text>
                </View>

                <View style={styles.row}>
                  <Button
                    label="Back"
                    variant="ghost"
                    onPress={() => setShowOtpField(false)}
                    style={{ flex: 1 }}
                  />
                  <Button label="Verify & login" onPress={verifyOtp} style={{ flex: 2 }} />
                </View>
              </>
            )}

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
      </KeyboardAvoidingView>

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
