import React, { useState, useEffect, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary
} from '@vis.gl/react-google-maps';
import { Compass, Navigation, Info, MapPin, RefreshCw, Layers, Map as MapIcon, Shield, Sun, Moon, Key } from 'lucide-react';
import {
  LANDMARKS,
  LAUNDRY_HUB,
  SUBURB_COORDS,
  coordsForAddress,
  type BookingRiderView,
  type Coords,
  type Landmark
} from '@freshfold/core';

interface LiveDispatchMapProps {
  clientSuburb: string;
  clientAddress: string;
  bookingStatus: string;
  bookingId: string;
  clientName: string;
  /**
   * The exact pin the dispatch server assigned this booking. When present it
   * beats the landmark/suburb guesswork below, so the customer's marker sits
   * where the rider is actually being routed.
   */
  clientCoords?: Coords;
  /**
   * Live telemetry from the rider's phone. When present the courier marker is
   * the real courier; without it the marker falls back to the scripted
   * animation, which is what the demo shows when nobody is on the road.
   */
  rider?: BookingRiderView;
}

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

// The landmark table, suburb anchors and hub all come from @freshfold/core, so
// the pin the customer watches and the pin the rider navigates to are the same
// point derived the same way.
const landmarks = LANDMARKS;
const suburbCoords = SUBURB_COORDS;
const laundryHub = LAUNDRY_HUB;

// Define road route path coordinates from Bomso HQ to each suburb
const getRoadRoutePath = (suburbName: string): { lat: number; lng: number }[] => {
  const start = { lat: 6.6852, lng: -1.5815 }; // Bomso HQ
  const gate = { lat: 6.6811, lng: -1.5744 }; // KNUST Main Gate
  const commercialArea = { lat: 6.6782, lng: -1.5711 }; // Commercial Area
  const adminRoundabout = { lat: 6.6728, lng: -1.5662 }; // Admin Roundabout
  const ayeduaseGate = { lat: 6.6695, lng: -1.5585 }; // Ayeduase Gate Junction
  const ayeduaseCenter = { lat: 6.6685, lng: -1.5524 }; // Ayeduase (Evandy)

  const normalized = (suburbName || '').toLowerCase();

  if (normalized.includes('bomso')) {
    return [start, { lat: 6.6845, lng: -1.5802 }];
  }
  if (normalized.includes('ayeduase')) {
    return [start, gate, commercialArea, adminRoundabout, ayeduaseGate, ayeduaseCenter];
  }
  if (normalized.includes('kotei')) {
    return [start, gate, commercialArea, adminRoundabout, ayeduaseGate, ayeduaseCenter, { lat: 6.6625, lng: -1.5518 }, { lat: 6.6565, lng: -1.5515 }];
  }
  if (normalized.includes('deduako')) {
    return [start, gate, commercialArea, adminRoundabout, ayeduaseGate, ayeduaseCenter, { lat: 6.6625, lng: -1.5518 }, { lat: 6.6565, lng: -1.5515 }, { lat: 6.6515, lng: -1.5621 }];
  }
  if (normalized.includes('boadi')) {
    return [start, gate, { lat: 6.6805, lng: -1.5482 }, { lat: 6.6815, lng: -1.5412 }];
  }
  if (normalized.includes('campus') || normalized.includes('brunei') || normalized.includes('unity') || normalized.includes('katanga') || normalized.includes('queens')) {
    return [start, gate, commercialArea, adminRoundabout];
  }

  return [start, gate, commercialArea, adminRoundabout, ayeduaseGate, ayeduaseCenter];
};

// Route Polyline Helper Component using Google Maps API
function RoutePolyline({ path }: { path: { lat: number; lng: number }[] }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !mapsLib || path.length < 2) return;

    if (polylineRef.current) {
      polylineRef.current.setMap(null);
    }

    const polyline = new mapsLib.Polyline({
      path: path,
      geodesic: true,
      strokeColor: '#c5a880',
      strokeOpacity: 0.85,
      strokeWeight: 3,
      map: map,
    });

    polylineRef.current = polyline;

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
      }
    };
  }, [map, mapsLib, path]);

  return null;
}

// Map Auto Fit Bounds Helper Component
function MapFitBounds({ bounds }: { bounds: { lat: number; lng: number }[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || bounds.length < 2) return;
    try {
      const latLngBounds = new google.maps.LatLngBounds();
      bounds.forEach(pt => latLngBounds.extend(pt));
      map.fitBounds(latLngBounds, { top: 50, right: 50, bottom: 50, left: 50 });
    } catch (e) {
      // ignore fit bounds error on initialization
    }
  }, [map, bounds]);

  return null;
}

export default function LiveDispatchMap({
  clientSuburb,
  clientAddress,
  bookingStatus,
  bookingId,
  clientName,
  clientCoords,
  rider
}: LiveDispatchMapProps) {
  const [mapTheme, setMapTheme] = useState<'light' | 'dark'>('dark');
  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>({
    name: 'FreshFold Laundry Hub',
    lat: 6.6852,
    lng: -1.5815,
    suburb: 'Bomso',
    type: 'hub',
    description: 'FreshFold Premium Apparel Processing & Steam-Press Sanctuary.'
  });

  // Calculate Client Position accurately
  const getClientPosition = (): { lat: number; lng: number } => {
    // The server already decided where this job is. Trust it.
    if (clientCoords) return clientCoords;

    const addressLower = (clientAddress || '').toLowerCase();
    const suburbLower = (clientSuburb || '').toLowerCase();

    // 1. Check known campus hostels / halls landmarks
    const matchedLandmark = landmarks.find(mark => {
      const cleanName = mark.name.split('(')[0].trim().toLowerCase();
      const nicknameMatch = mark.name.match(/\((.*?)\)/);
      const nickname = nicknameMatch ? nicknameMatch[1].toLowerCase() : null;

      return (
        (cleanName.length > 2 && addressLower.includes(cleanName)) ||
        (cleanName.length > 2 && suburbLower.includes(cleanName)) ||
        (nickname && addressLower.includes(nickname)) ||
        (nickname && suburbLower.includes(nickname))
      );
    });

    if (matchedLandmark) {
      return { lat: matchedLandmark.lat, lng: matchedLandmark.lng };
    }

    // 2. Fallback to suburb coordinate anchor with deterministic string hash offset
    const matchedKey = Object.keys(suburbCoords).find(key =>
      clientSuburb.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(clientSuburb.toLowerCase())
    );

    return coordsForAddress(clientAddress, matchedKey ?? 'Ayeduase');
  };

  const clientPos = getClientPosition();
  const rawPath = getRoadRoutePath(clientSuburb);
  
  // Ensure path ends at exact clientPos
  const pathPoints = [...rawPath];
  const lastPoint = pathPoints[pathPoints.length - 1];
  if (!lastPoint || lastPoint.lat !== clientPos.lat || lastPoint.lng !== clientPos.lng) {
    pathPoints.push(clientPos);
  }

  // Courier location state for live animation
  const [courierPos, setCourierPos] = useState<{ lat: number; lng: number }>(laundryHub);

  // Live Courier Animation along path.
  //
  // Only runs when there is no real rider on the job. Once the companion app
  // starts reporting position, `rider.coords` is the truth and interpolating
  // along a guessed route would only fight it.
  useEffect(() => {
    if (rider?.coords) {
      setCourierPos(rider.coords);
      return;
    }

    let progress = 0;
    switch (bookingStatus) {
      case 'Scheduled':
        progress = 0.05;
        break;
      case 'Collecting':
        progress = 0.45;
        break;
      case 'In Care':
        progress = 0.90;
        break;
      case 'Delivered':
        progress = 1.0;
        break;
      default:
        progress = 0.5;
    }

    let step = 0;
    const interval = setInterval(() => {
      const wiggleLat = Math.sin(step) * 0.00015;
      const wiggleLng = Math.cos(step) * 0.00015;

      if (pathPoints.length < 2) {
        setCourierPos(laundryHub);
        return;
      }

      const segmentCount = pathPoints.length - 1;
      const rawIndex = progress * segmentCount;
      const segmentIndex = Math.min(Math.floor(rawIndex), segmentCount - 1);
      const segmentProgress = rawIndex - segmentIndex;

      const p1 = pathPoints[segmentIndex];
      const p2 = pathPoints[segmentIndex + 1];

      const interpolatedLat = p1.lat + (p2.lat - p1.lat) * segmentProgress + wiggleLat;
      const interpolatedLng = p1.lng + (p2.lng - p1.lng) * segmentProgress + wiggleLng;

      setCourierPos({ lat: interpolatedLat, lng: interpolatedLng });
      step += 0.2;
    }, 2000);

    return () => clearInterval(interval);
  }, [bookingStatus, clientSuburb, rider?.coords?.lat, rider?.coords?.lng]);

  // If Google Maps API Key is missing, render Splash Screen
  if (!hasValidKey) {
    return (
      <div className="w-full bg-[#121212] rounded-2xl border border-white/10 p-8 text-center space-y-5 text-white shadow-2xl">
        <div className="w-14 h-14 bg-brand-gold/10 border border-brand-gold/30 rounded-2xl flex items-center justify-center mx-auto text-brand-gold">
          <Key className="w-7 h-7 animate-pulse" />
        </div>
        <div className="max-w-md mx-auto space-y-2">
          <h3 className="font-serif text-lg font-semibold tracking-wide">Google Maps API Key Required</h3>
          <p className="text-stone-400 text-xs leading-relaxed font-light">
            To view Google Maps live dispatch telemetry, please add your Google Maps Platform key to environment secrets.
          </p>
        </div>

        <div className="bg-[#181818] border border-white/5 rounded-xl p-5 text-left max-w-lg mx-auto text-xs font-sans space-y-3">
          <p className="font-bold text-brand-gold uppercase tracking-wider text-[10px] font-mono">Setup Instructions:</p>
          <div className="space-y-2 text-stone-300 leading-relaxed font-light text-[11px]">
            <p className="font-semibold text-white">For Local VS Code Development:</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Create a file named <code className="bg-black px-1.5 py-0.5 rounded text-brand-gold font-mono">.env</code> in your project root directory.</li>
              <li>Add your key: <code className="bg-black px-1.5 py-0.5 rounded text-brand-gold font-mono">VITE_GOOGLE_MAPS_PLATFORM_KEY=your_key_here</code></li>
              <li>Restart your local dev server (<code className="bg-black px-1 py-0.5 rounded font-mono">npm run dev</code>).</li>
            </ol>

            <p className="font-semibold text-white mt-3">For AI Studio Cloud Environment:</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Open <strong>Settings</strong> (⚙️ gear icon) &gt; <strong>Secrets</strong></li>
              <li>Add key name <code className="bg-black px-1.5 py-0.5 rounded text-brand-gold font-mono">GOOGLE_MAPS_PLATFORM_KEY</code> and save</li>
            </ol>
          </div>
        </div>
        <p className="text-[10px] text-stone-500 font-mono">The app rebuilds automatically when the key is saved.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tracker Header Hud */}
      <div className="bg-[#121212]/80 backdrop-blur-md p-4 rounded-xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-brand-sage/15 border border-brand-sage/20 rounded-xl text-brand-sage shrink-0 mt-0.5">
            <Compass className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[8px] bg-brand-sage/10 text-brand-sage border border-brand-sage/30 px-1.5 py-0.5 rounded font-mono tracking-wider uppercase font-black">
                Google Maps Telemetry
              </span>
              <span className="text-[8px] bg-brand-gold/10 text-brand-gold border border-brand-gold/30 px-1.5 py-0.5 rounded font-mono tracking-wider uppercase font-bold">
                📍 Auto-Pinned Location
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
            </div>
            <h5 className="font-serif text-sm font-medium text-white mt-1">
              Live KNUST Dispatch Telemetry
            </h5>
            <p className="font-sans text-[11px] text-[#8E9299] font-light">
              Pinned Destination: <strong className="text-brand-sage font-medium">{clientAddress || 'Pickup Point'}</strong>, <span className="text-stone-300">{clientSuburb}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:self-center">
          {/* Theme Toggle Button */}
          <button
            onClick={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white rounded-lg text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Toggle Map theme (Light/Dark)"
          >
            {mapTheme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light Map</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Dark Map</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Map Interactive Frame */}
      <div className="relative w-full h-[380px] rounded-2xl border border-white/10 overflow-hidden bg-[#0e0e0e] shadow-2xl">
        <APIProvider apiKey={API_KEY} version="weekly">
          <Map
            defaultCenter={{ lat: 6.6710, lng: -1.5620 }}
            defaultZoom={14}
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
            colorScheme={mapTheme === 'dark' ? 'DARK' : 'LIGHT'}
            gestureHandling="greedy"
            disableDefaultUI={true}
          >
            {/* Draw Route Polyline */}
            <RoutePolyline path={pathPoints} />
            <MapFitBounds bounds={pathPoints} />

            {/* FreshFold HQ Marker */}
            <AdvancedMarker position={laundryHub} title={laundryHub.name}>
              <div className="relative flex items-center justify-center">
                <div className="absolute w-8 h-8 rounded-full bg-[#c5a880]/20 animate-ping"></div>
                <div className="w-7 h-7 bg-[#c5a880] border border-black rounded-lg flex items-center justify-center shadow-lg text-black font-serif text-[10px] font-bold">
                  HQ
                </div>
              </div>
            </AdvancedMarker>

            {/* Client Destination Marker - Auto Pinned Pickup Address */}
            <AdvancedMarker
              position={clientPos}
              title={`Pickup Location: ${clientAddress || clientSuburb}`}
              onClick={() => setSelectedLandmark({
                name: `Pickup: ${clientAddress || clientSuburb}`,
                lat: clientPos.lat,
                lng: clientPos.lng,
                suburb: clientSuburb,
                type: 'landmark',
                description: `Accurately pinned pickup destination for ${clientName || 'Valued Patron'}. Dispatch rider navigates directly to this location.`
              })}
            >
              <div className="relative flex flex-col items-center justify-center group cursor-pointer">
                <div className="absolute w-9 h-9 rounded-full bg-brand-sage/30 animate-ping"></div>
                <div className="w-7 h-7 bg-brand-sage border-2 border-white rounded-full flex items-center justify-center shadow-2xl text-white font-bold group-hover:scale-110 transition-transform">
                  <MapPin className="w-4 h-4 fill-current text-white" />
                </div>
                <div className="mt-1 whitespace-nowrap bg-black/95 text-brand-sage border border-brand-sage/40 px-2 py-0.5 rounded text-[9.5px] font-mono tracking-wide font-bold shadow-2xl flex items-center gap-1">
                  <span>📍</span>
                  <span>{clientAddress ? (clientAddress.length > 22 ? clientAddress.slice(0, 20) + '...' : clientAddress) : clientSuburb}</span>
                </div>
              </div>
            </AdvancedMarker>

            {/* Live Courier Runner Marker */}
            <AdvancedMarker position={courierPos} title="FreshFold Courier Runner">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-10 h-10 rounded-full bg-[#c5a880]/30 animate-ping"></div>
                <div className="w-8 h-8 bg-[#c5a880] border-2 border-[#161616] rounded-full flex items-center justify-center shadow-2xl text-black">
                  <Navigation className="w-4 h-4 transform rotate-45 fill-current" />
                </div>
              </div>
            </AdvancedMarker>

            {/* Interactive Student Hostels & Landmarks */}
            {landmarks.map((mark, i) => {
              if (mark.type === 'hub') return null;
              return (
                <AdvancedMarker
                  key={i}
                  position={{ lat: mark.lat, lng: mark.lng }}
                  title={mark.name}
                  onClick={() => setSelectedLandmark(mark)}
                >
                  <div className="w-3 h-3 rounded-full bg-stone-700/90 border border-white/30 hover:bg-brand-sage hover:scale-125 transition-all cursor-pointer shadow-md flex items-center justify-center">
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                  </div>
                </AdvancedMarker>
              );
            })}
          </Map>
        </APIProvider>

        {/* HUD Overlay with Selected Hostel/Landmark details */}
        {selectedLandmark && (
          <div className="absolute bottom-4 left-4 right-4 z-20 bg-[#161616]/95 backdrop-blur-md p-3 rounded-xl border border-white/10 flex items-center justify-between gap-4 animate-fade-in text-left shadow-2xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-mono tracking-wider font-extrabold border ${
                  selectedLandmark.type === 'hub' ? 'bg-[#c5a880]/10 text-[#c5a880] border-[#c5a880]/30' :
                  selectedLandmark.type === 'hostel' ? 'bg-brand-sage/10 text-brand-sage border-brand-sage/30' :
                  'bg-stone-800 text-stone-400 border-white/5'
                }`}>
                  {selectedLandmark.type}
                </span>
                <strong className="font-serif text-xs text-white tracking-wide">{selectedLandmark.name}</strong>
              </div>
              <p className="text-[10.5px] text-stone-400 font-sans font-light leading-snug">
                {selectedLandmark.description} • Sector: <span className="text-brand-sage font-medium">{selectedLandmark.suburb}</span>
              </p>
            </div>
            <button
              onClick={() => setSelectedLandmark(null)}
              className="text-[9px] font-mono text-stone-500 hover:text-white uppercase font-bold px-2 py-1 bg-white/5 hover:bg-white/10 rounded transition-colors border border-white/5 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Floating Quick Stats Map Key */}
        <div className="absolute top-4 right-4 z-20 bg-black/90 p-3 rounded-xl border border-white/10 text-left max-w-[210px] space-y-2 backdrop-blur-sm pointer-events-auto">
          <span className="font-mono text-[8px] tracking-wider text-[#8E9299] block uppercase font-bold">Map Key / Coverage</span>
          <div className="space-y-1.5 text-[10px] font-sans">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-[#c5a880] border border-black inline-block"></span>
              <span className="text-stone-300 font-light">FreshFold HQ (Bomso)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-sage inline-block"></span>
              <span className="text-stone-300 font-light">Delivery Target</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-stone-700 border border-white/30 flex items-center justify-center inline-block">
                <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
              </div>
              <span className="text-stone-300 font-light">Hostels (Evandy, Brunei, etc)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#c5a880]">✦</span>
              <span className="text-[9px] text-[#8E9299] font-mono">Dashed Line = Dispatch Route</span>
            </div>
          </div>
        </div>

        {/* Google Maps floating tip */}
        <div className="absolute top-4 left-4 z-20 bg-black/80 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-white/5 text-[9px] text-stone-400 font-mono flex items-center gap-1">
          <span>💡 Google Maps Live Telemetry. Click hostels for details.</span>
        </div>
      </div>
    </div>
  );
}
