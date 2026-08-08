/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Redirect, Tabs } from 'expo-router';
import { History, Home, Layers, Map, User } from 'lucide-react-native';
import React from 'react';
import { Platform, View } from 'react-native';
import SimulationHub from '../../src/components/SimulationHub';
import { useSession } from '../../src/store/SessionStore';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  const { isAuthenticated } = useSession();

  // The console locks itself whenever the session is dropped.
  if (!isAuthenticated) return <Redirect href="/auth" />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brandSage,
          tabBarInactiveTintColor: colors.textSlate,
          tabBarStyle: {
            backgroundColor: colors.cardPure,
            borderTopColor: colors.borderSoft,
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 84 : 62,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 9, fontWeight: '700' },
          sceneStyle: { backgroundColor: colors.bgIvory },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <Home size={18} color={color} />,
          }}
        />
        <Tabs.Screen
          name="assignments"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ color }) => <Layers size={18} color={color} />,
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: 'Map',
            tabBarIcon: ({ color }) => <Map size={18} color={color} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ color }) => <History size={18} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <User size={18} color={color} />,
          }}
        />
      </Tabs>

      {/* Demo dispatcher controls, floating above every tab. */}
      <SimulationHub />
    </View>
  );
}
