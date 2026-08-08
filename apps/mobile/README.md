# FreshFold Dispatch — Rider Companion

A React Native / Expo app for FreshFold's laundry riders: accept dispatch offers, navigate to
pickups on a live map, scan bag QR codes, capture proof photos and signatures, and hand off to
the customer with an OTP.

This is one half of the [FreshFold monorepo](../../README.md) — the other half is the customer
website, and both talk to the same dispatch server. Jobs shown here are real bookings made on
the website, and the progress recorded here is what the customer watches on their tracking page.

## Running it

From the repository root:

```bash
npm install
```

Start the dispatch server (and the website) first, so there is a board to pull from:

```bash
npm run dev
```

Then, in a second terminal:

```bash
npm run mobile
```

Scan the QR code with **Expo Go** (Android/iOS), or press `a` / `i` to open an emulator.
No API keys are needed.

The server address is derived from the Expo dev server's own host, so a phone on the same
Wi-Fi finds it with no configuration. Override it with `EXPO_PUBLIC_API_URL` if the server
lives somewhere else — note that `localhost` will never work from a physical phone.

With no server reachable the app runs entirely on local seed data and AsyncStorage, exactly as
it did before there was a backend. `useApp().connected` says which mode it is in.

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
3. **Home.** Toggle *Go online* — this is what starts publishing your position to the server,
   so it is also what makes the courier appear on the customer's tracking map. The floating
   **SIM** handle on the right edge opens the simulation hub, which stands in for the
   dispatcher: generate orders, dispatch them, fire alerts, or reset all state. Orders
   generated here are pushed to the server and are indistinguishable from real bookings.
4. **Accept a job**, then step through the workflow in the bottom sheet: start navigation
   (the GPS position animates along the route), confirm arrival, scan the bag QR codes, take a
   condition photo, and capture a signature.
5. **Drop off at the hub**, wait for processing, then deliver. The delivery OTP is `7809`
   (`4019` and `1234` also pass).

## Architecture

| Path | Purpose |
| --- | --- |
| `app/` | expo-router routes — splash, auth, chat modal, and the five-tab console |
| `src/store/AppStore.tsx` | Domain state, server sync, AsyncStorage offline cache, and the GPS simulation loop |
| `src/store/SessionStore.tsx` | Auth/lock state for the console |
| `src/services/api.ts` | Dispatch server address resolution + the shared `@freshfold/core` client |
| `src/components/` | `LiveMap` (`.web.tsx` fallback for browsers), `QRScanner`, `CameraCapture`, `SignaturePad`, plus shared UI primitives |
| `src/theme.ts` | Brand tokens for the native surfaces |
| `src/data/mockData.ts` | Offline seed data, replaced by the server on the first successful poll |
| `src/types.ts` | Re-export of the shared domain model from `@freshfold/core` |

State lives in one provider so the simulation ticks exactly once regardless of how many
screens are showing a map, and so an order keeps ripening while the rider browses other tabs.

Reads come from a poll every 4 seconds; writes are applied locally first and sent in the
background, so a rider halfway up a stairwell can still mark a pickup complete. A poll that
lands while a write is in flight is discarded rather than rewinding the workflow.

## Native capabilities

| Feature | Module | Notes |
| --- | --- | --- |
| Live map, markers, route | `react-native-maps` | Google Maps on Android, Apple Maps on iOS. Wrapped in an error boundary — if the native map fails to load, the screen degrades to a coordinate panel instead of taking the app down |
| Bag QR scanning | `expo-camera` | Real barcode scanning, with a tap-to-scan fallback |
| Proof photos | `expo-camera` | Falls back to preset stock shots if the camera is unavailable |
| Signature capture | `react-native-svg` + `PanResponder` | Rasterised to a PNG data URL |
| Biometric unlock | `expo-local-authentication` | Simulated when no biometrics are enrolled |
| Persistence | `@react-native-async-storage/async-storage` | Offline cache in front of the dispatch server |

## Building a standalone app

Expo Go covers the whole demo. For a standalone Android build, Google Maps needs your own key:

```bash
cp .env.example .env
```

Set `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`, then `npx expo prebuild` and build with EAS.
iOS needs no key — it uses Apple Maps.
