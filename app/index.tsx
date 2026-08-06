/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../src/store/AppStore';
import { useSession } from '../src/store/SessionStore';
import { colors, radius, shadow } from '../src/theme';

const SPLASH_MS = 2200;

export default function SplashScreen() {
  const router = useRouter();
  const { hydrated } = useApp();
  const { isAuthenticated } = useSession();

  const pulse = useRef(new Animated.Value(0)).current;
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    const bounces = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(dot, { toValue: -5, duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.delay(360 - i * 180),
        ])
      )
    );
    bounces.forEach((b) => b.start());

    return () => {
      loop.stop();
      bounces.forEach((b) => b.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hold the brand moment, but never navigate before storage has loaded.
  useEffect(() => {
    if (!hydrated) return;

    const timer = setTimeout(() => {
      router.replace(isAuthenticated ? '/(tabs)' : '/auth');
    }, SPLASH_MS);

    return () => clearTimeout(timer);
  }, [hydrated, isAuthenticated, router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.logo,
            {
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
              ],
            },
          ]}
        >
          <Sparkles size={34} color="#FFFFFF" />
        </Animated.View>

        <Text style={styles.wordmark}>F R E S H F O L D</Text>
        <Text style={styles.tagline}>Dispatch operations companion</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Luxury Valet Laundry Service</Text>
        <View style={styles.dotsRow}>
          {dots.map((dot, i) => (
            <Animated.View key={i} style={[styles.dot, { transform: [{ translateY: dot }] }]} />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory, padding: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  logo: {
    width: 68,
    height: 68,
    borderRadius: radius.xxl,
    backgroundColor: colors.brandSage,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  wordmark: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.textCharcoal,
    marginTop: 6,
  },
  tagline: {
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.brandGold,
    fontWeight: '700',
  },
  footer: { alignItems: 'center', gap: 10, paddingBottom: 12 },
  footerText: { fontSize: 10.5, color: colors.textSlate },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandSage },
});
