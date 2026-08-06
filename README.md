# FreshFold Dispatch — Rider Companion

A React Native / Expo app for FreshFold's laundry riders: accept dispatch offers, navigate to
pickups on a live map, scan bag QR codes, capture proof photos and signatures, and hand off to
the customer with an OTP.

Converted from the original Vite + React web prototype — the domain model, workflow and brand
palette carry over unchanged; every UI surface is now native.

## Running it

```bash
npm install
```

```bash
npx expo start
```

Then scan the QR code with **Expo Go** (Android/iOS), or press `a` / `i` to open an emulator.
No API keys are needed to run the app.

`npx expo start --web` also works for a quick browser look at the flows, with a coordinate
readout standing in for the map — `react-native-maps` is iOS/Android only.

> **Expo Go version matters.** This project targets **Expo SDK 54**, and a given Expo Go build
> supports exactly one SDK. If your Expo Go is built for a different SDK, the project will fail
> to launch. Check the SDK your Expo Go supports on its home screen, and either match it here or
> install the matching Expo Go.

## Demo walkthrough

1. **Splash → Auth.** Tap *Request access OTP* with any phone number, then enter `7801`.
   Or use the Face ID button — real biometrics if the device has them enrolled, a simulated
   scan if not.
2. **Profile.** A rider with no saved profile lands here first. Fill in name and employee ID.
3. **Home.** Toggle *Go online*. The floating **SIM** handle on the right edge opens the
   simulation hub, which stands in for the dispatcher: generate mock orders, dispatch them,
   fire alerts, or reset all state.
4. **Accept a job**, then step through the workflow in the bottom sheet: start navigation
   (the GPS position animates along the route), confirm arrival, scan the bag QR codes, take a
   condition photo, and capture a signature.
5. **Drop off at the hub**, wait for processing, then deliver. The delivery OTP is `7809`
   (`4019` and `1234` also pass).

## Architecture

| Path | Purpose |
| --- | --- |
| `app/` | expo-router routes — splash, auth, chat modal, and the five-tab console |
| `src/store/AppStore.tsx` | Domain state (rider, orders, messages, alerts) + AsyncStorage persistence + the GPS simulation loop |
| `src/store/SessionStore.tsx` | Auth/lock state for the console |
| `src/components/` | `LiveMap` (`.web.tsx` fallback for browsers), `QRScanner`, `CameraCapture`, `SignaturePad`, plus shared UI primitives |
| `src/theme.ts` | Brand tokens ported from the web build's Tailwind theme |
| `src/data/mockData.ts` | Seed rider, orders, messages and alerts (KNUST campus, Kumasi) |

State lives in one provider so the simulation ticks exactly once regardless of how many
screens are showing a map, and so an order keeps ripening while the rider browses other tabs.

## Native capabilities

| Feature | Module | Notes |
| --- | --- | --- |
| Live map, markers, route | `react-native-maps` | Google Maps on Android, Apple Maps on iOS. Wrapped in an error boundary — if the native map fails to load, the screen degrades to a coordinate panel instead of taking the app down |
| Bag QR scanning | `expo-camera` | Real barcode scanning, with a tap-to-scan fallback |
| Proof photos | `expo-camera` | Falls back to preset stock shots if the camera is unavailable |
| Signature capture | `react-native-svg` + `PanResponder` | Rasterised to a PNG data URL |
| Biometric unlock | `expo-local-authentication` | Simulated when no biometrics are enrolled |
| Persistence | `@react-native-async-storage/async-storage` | Replaces the web build's `localStorage` |

## Building a standalone app

Expo Go covers the whole demo. For a standalone Android build, Google Maps needs your own key:

```bash
cp .env.example .env
```

Set `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`, then `npx expo prebuild` and build with EAS.
iOS needs no key — it uses Apple Maps.
