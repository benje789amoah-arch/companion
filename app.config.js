/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Dynamic config so the (optional) Android Google Maps key can come from the
// environment instead of being committed. Expo Go and iOS need no key at all.
const googleMapsAndroidKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || '';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'FreshFold Dispatch',
  slug: 'freshfold-dispatch',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'freshfold',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  backgroundColor: '#FAF9F6',
  splash: {
    backgroundColor: '#FAF9F6',
    resizeMode: 'contain',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.freshfold.dispatch',
    infoPlist: {
      NSCameraUsageDescription:
        'FreshFold uses the camera to scan laundry bag QR codes and document garment condition at pickup and delivery.',
      NSLocationWhenInUseUsageDescription:
        'FreshFold tracks your location during an active shift so dispatch can route you to pickups and deliveries.',
      NSFaceIDUsageDescription:
        'FreshFold uses Face ID to unlock the rider console without re-entering your access PIN.',
    },
  },
  android: {
    package: 'com.freshfold.dispatch',
    edgeToEdgeEnabled: true,
    adaptiveIcon: { backgroundColor: '#6F7A63' },
    permissions: [
      'android.permission.CAMERA',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
    ...(googleMapsAndroidKey
      ? { config: { googleMaps: { apiKey: googleMapsAndroidKey } } }
      : {}),
  },
  web: {
    bundler: 'metro',
    output: 'static',
  },
  plugins: [
    'expo-router',
    [
      'expo-camera',
      {
        cameraPermission:
          'FreshFold uses the camera to scan bag QR codes and capture proof-of-service photos.',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'FreshFold tracks your location during an active shift to route you to pickups and deliveries.',
      },
    ],
    [
      'expo-local-authentication',
      {
        faceIDPermission:
          'FreshFold uses Face ID to unlock the rider console without re-entering your access PIN.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};
