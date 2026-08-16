/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import MapPanel from './MapPanel';

/** `react-native-maps` has no web implementation, so the browser gets the panel. */
export default function TrackingMapWeb(props: React.ComponentProps<typeof MapPanel>) {
  return (
    <MapPanel
      {...props}
      notice="Live tiles render on iOS and Android. Open the app in Expo Go to see the map."
    />
  );
}
