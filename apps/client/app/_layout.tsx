/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClientProvider } from '../src/store/ClientStore';
import { SessionProvider } from '../src/store/SessionStore';
import { colors } from '../src/theme';

/**
 * `ClientProvider` sits *inside* `SessionProvider` because the data layer needs
 * to know who is signed in: bookings are scoped by email server-side, and the
 * wallet writes through the session's account record.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <ClientProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bgIvory },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="auth" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="order/[id]" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="orders" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen
                name="chat"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="concierge"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="plans"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
            </Stack>
          </ClientProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
