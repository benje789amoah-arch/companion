/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import { Navigation, Activity, Map as MapIcon } from 'lucide-react';
import { Order, RiderState } from '../types';
import { LAUNDRY_HUB_COORDS } from '../data/mockData';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface LiveMapProps {
  rider: RiderState;
  orders?: Order[];
  activeOrder?: Order;
  focusedOrderId?: string | null;
  onSelectOrder?: (order: Order) => void;
  onAcceptOrder?: (orderId: string) => void;
  onArrived?: () => void;
  simulationActive?: boolean;
  onSimulationStep?: (coords: { x: number; y: number; lat: number; lng: number }) => void;
}

// Custom HTML Overlay Marker Component for Google Maps (no mapId required)
interface HTMLMarkerProps {
  key?: React.Key;
  position: { lat: number; lng: number };
  children: React.ReactNode;
  zIndex?: number;
}

function HTMLMarker({ position, children, zIndex = 1 }: HTMLMarkerProps) {
  const map = useMap();
  const [container] = useState(() => {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.cursor = 'pointer';
    div.style.pointerEvents = 'auto';
    return div;
  });
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) return;

    class CustomOverlay extends google.maps.OverlayView {
      onAdd() {
        const panes = this.getPanes();
        if (panes?.overlayMouseTarget) {
          panes.overlayMouseTarget.appendChild(container);
        }
      }

      draw() {
        const projection = this.getProjection();
        if (projection) {
          const point = projection.fromLatLngToDivPixel(
            new google.maps.LatLng(position.lat, position.lng)
          );
          if (point) {
            container.style.left = `${Math.round(point.x)}px`;
            container.style.top = `${Math.round(point.y)}px`;
          }
        }
      }

      onRemove() {
        if (container.parentElement) {
          container.parentElement.removeChild(container);
        }
      }
    }

    const overlay = new CustomOverlay();
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    container.style.zIndex = String(zIndex);
    if (overlayRef.current) {
      overlayRef.current.draw();
    }
  }, [position.lat, position.lng, zIndex, container]);

  return createPortal(children, container);
}

// Custom Polyline Component for Google Maps
function CustomPolyline({
  path,
  color,
}: {
  path: { lat: number; lng: number }[];
  color: string;
}) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!polylineRef.current) {
      polylineRef.current = new google.maps.Polyline({
        path,
        strokeColor: color,
        strokeOpacity: 0.85,
        strokeWeight: 4,
        map,
      });
    } else {
      polylineRef.current.setPath(path);
      polylineRef.current.setOptions({ strokeColor: color });
    }

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, JSON.stringify(path), color]);

  return null;
}

// Map Controller for Centering and Fitting Bounds
function MapController({
  riderCoords,
  targetCoords,
  focusedCoords,
  simulationActive,
}: {
  riderCoords: { lat: number; lng: number };
  targetCoords: { lat: number; lng: number } | null;
  focusedCoords: { lat: number; lng: number } | null;
  simulationActive: boolean;
}) {
  const map = useMap();
  const prevTargetRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevFocusedRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!map) return;

    if (focusedCoords) {
      const isFocusedChanged =
        !prevFocusedRef.current ||
        prevFocusedRef.current.lat !== focusedCoords.lat ||
        prevFocusedRef.current.lng !== focusedCoords.lng;

      if (isFocusedChanged) {
        map.panTo(focusedCoords);
        map.setZoom(17);
        prevFocusedRef.current = focusedCoords;
      }
    } else if (targetCoords) {
      const isTargetChanged =
        !prevTargetRef.current ||
        prevTargetRef.current.lat !== targetCoords.lat ||
        prevTargetRef.current.lng !== targetCoords.lng;

      if (isTargetChanged) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(riderCoords);
        bounds.extend(targetCoords);
        map.fitBounds(bounds, { top: 60, bottom: 80, left: 40, right: 40 });
        prevTargetRef.current = targetCoords;
      } else if (simulationActive) {
        map.panTo(riderCoords);
      }
    } else {
      map.panTo(riderCoords);
    }
  }, [map, riderCoords.lat, riderCoords.lng, targetCoords?.lat, targetCoords?.lng, focusedCoords?.lat, focusedCoords?.lng, simulationActive]);

  return null;
}

// Custom Map Overlay Controls
function MapControls({
  riderCoords,
}: {
  riderCoords: { lat: number; lng: number };
}) {
  const map = useMap();

  const recenterOnRider = () => {
    if (map) {
      map.panTo(riderCoords);
      map.setZoom(17);
    }
  };

  const handleZoomIn = () => {
    if (map) {
      map.setZoom((map.getZoom() || 16) + 1);
    }
  };

  const handleZoomOut = () => {
    if (map) {
      map.setZoom((map.getZoom() || 16) - 1);
    }
  };

  return (
    <div className="flex space-x-2 pointer-events-auto">
      <button
        onClick={recenterOnRider}
        className="w-10 h-10 bg-white/95 backdrop-blur-md hover:bg-white border border-border-soft text-text-charcoal rounded-full flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
        title="Recenter Map"
        id="recenter-rider-btn"
      >
        <Navigation className="w-4 h-4 text-brand-sage fill-brand-sage/20" />
      </button>

      <button
        onClick={handleZoomIn}
        className="w-8 h-8 bg-white/95 backdrop-blur-md border border-border-soft text-text-charcoal rounded-full flex items-center justify-center shadow-md text-sm font-semibold active:scale-95 transition-all cursor-pointer"
      >
        +
      </button>
      <button
        onClick={handleZoomOut}
        className="w-8 h-8 bg-white/95 backdrop-blur-md border border-border-soft text-text-charcoal rounded-full flex items-center justify-center shadow-md text-sm font-semibold active:scale-95 transition-all cursor-pointer"
      >
        −
      </button>
    </div>
  );
}

export default function LiveMap({
  rider,
  orders = [],
  activeOrder,
  focusedOrderId,
  onSelectOrder,
  onAcceptOrder,
  onArrived,
  simulationActive = false,
  onSimulationStep,
}: LiveMapProps) {
  const simTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Sync internal selected order when focusedOrderId prop changes
  useEffect(() => {
    if (focusedOrderId) {
      const found = orders.find(o => o.id === focusedOrderId);
      if (found) {
        setSelectedOrder(found);
      }
    }
  }, [focusedOrderId, orders]);

  // Determine current destination coords
  let targetCoords: { x: number; y: number; lat: number; lng: number } | null = null;
  let destinationName = '';

  if (activeOrder) {
    if (activeOrder.status === 'navigating_to_pickup') {
      targetCoords = activeOrder.pickupCoords;
      destinationName = activeOrder.pickupAddress;
    } else if (activeOrder.status === 'navigating_to_laundry') {
      targetCoords = LAUNDRY_HUB_COORDS;
      destinationName = 'FreshFold Central Laundry Hub';
    } else if (activeOrder.status === 'navigating_to_delivery') {
      targetCoords = activeOrder.deliveryCoords;
      destinationName = activeOrder.deliveryAddress;
    }
  }

  // Focused coords for MapController
  const focusedCoords = selectedOrder ? selectedOrder.pickupCoords : null;

  // Smooth Navigation Simulation Loop
  useEffect(() => {
    if (simulationActive && targetCoords) {
      const rx = rider.coords.x;
      const ry = rider.coords.y;
      const tx = targetCoords.x;
      const ty = targetCoords.y;

      const rLat = rider.coords.lat;
      const rLng = rider.coords.lng;
      const tLat = targetCoords.lat;
      const tLng = targetCoords.lng;

      const latDiff = tLat - rLat;
      const lngDiff = tLng - rLng;
      const geoDistance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

      if (geoDistance < 0.0003) {
        if (onArrived) {
          onArrived();
        }
        return;
      }

      simTimerRef.current = setTimeout(() => {
        const step = 0.22;

        const nextX = rx + (tx - rx) * step;
        const nextY = ry + (ty - ry) * step;
        const nextLat = rLat + latDiff * step;
        const nextLng = rLng + lngDiff * step;

        if (onSimulationStep) {
          onSimulationStep({ x: nextX, y: nextY, lat: nextLat, lng: nextLng });
        }
      }, 950);
    }

    return () => {
      if (simTimerRef.current) {
        clearTimeout(simTimerRef.current);
      }
    };
  }, [simulationActive, targetCoords?.lat, targetCoords?.lng, rider.coords.lat, rider.coords.lng]);

  const isElite = activeOrder?.priority === 'elite';

  if (!hasValidKey) {
    return (
      <div className="relative w-full h-full min-h-[400px] bg-bg-linen rounded-2xl p-6 flex items-center justify-center text-center">
        <div className="max-w-md bg-white p-6 rounded-2xl border border-border-soft shadow-xl space-y-4">
          <div className="w-12 h-12 bg-brand-sage/10 text-brand-sage rounded-full flex items-center justify-center mx-auto">
            <MapIcon className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-text-charcoal font-display">
            Google Maps API Key Required
          </h3>
          <p className="text-xs text-text-slate leading-relaxed">
            To view the live dispatch map and route tracking with Google Maps, please configure your API key.
          </p>
          <div className="text-left bg-bg-ivory p-3 rounded-xl border border-border-soft space-y-2 text-[11px] text-text-charcoal">
            <p><strong>Step 1:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener noreferrer" className="text-brand-sage underline font-semibold">Get an API Key</a></p>
            <p><strong>Step 2:</strong> Add your key as a secret in AI Studio:</p>
            <ul className="list-disc list-inside text-text-slate pl-1 space-y-1">
              <li>Open <strong>Settings</strong> (⚙️ gear icon, top-right corner)</li>
              <li>Select <strong>Secrets</strong></li>
              <li>Type <code className="bg-white px-1.5 py-0.5 rounded border border-border-soft text-text-charcoal font-mono">GOOGLE_MAPS_PLATFORM_KEY</code></li>
              <li>Paste your API key and press Enter</li>
            </ul>
          </div>
          <p className="text-[10px] text-text-slate italic">
            The app rebuilds automatically after you add the secret.
          </p>
        </div>
      </div>
    );
  }

  const routePath = targetCoords
    ? [
        { lat: rider.coords.lat, lng: rider.coords.lng },
        { lat: targetCoords.lat, lng: rider.coords.lng },
        { lat: targetCoords.lat, lng: targetCoords.lng },
      ]
    : [];

  return (
    <div className="relative w-full h-full bg-bg-linen overflow-hidden rounded-2xl" id="live-gps-map-container">
      <APIProvider apiKey={API_KEY} version="weekly">
        <Map
          defaultCenter={{ lat: rider.coords.lat, lng: rider.coords.lng }}
          defaultZoom={16}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
          gestureHandling="greedy"
          disableDefaultUI={true}
          onClick={() => setSelectedOrder(null)}
        >
          <MapController
            riderCoords={rider.coords}
            targetCoords={targetCoords}
            focusedCoords={focusedCoords}
            simulationActive={simulationActive}
          />

          {/* Central Laundry Hub Marker */}
          <HTMLMarker position={{ lat: LAUNDRY_HUB_COORDS.lat, lng: LAUNDRY_HUB_COORDS.lng }} zIndex={2}>
            <div className="relative flex items-center justify-center group cursor-pointer">
              <div className="absolute w-8 h-8 bg-brand-gold/20 rounded-full animate-pulse" />
              <div className="w-6 h-6 bg-[#6F7A63] border-2 border-white rounded-full flex items-center justify-center shadow-md">
                <div className="w-1.5 h-1.5 bg-white rounded-sm rotate-45" />
              </div>
              <div className="absolute -bottom-6 bg-white/95 px-1.5 py-0.5 rounded border border-[#E5E7EB] shadow-xs text-[7.5px] font-bold text-text-charcoal whitespace-nowrap font-display">
                FreshFold Hub
              </div>
            </div>
          </HTMLMarker>

          {/* Task Pickup Markers for All Orders */}
          {orders.map((ord) => {
            if (ord.status === 'delivered' || ord.status === 'cancelled') return null;
            const isSelected = selectedOrder?.id === ord.id;
            const isActive = activeOrder?.id === ord.id;
            const isUnassigned = ord.status === 'unassigned';

            return (
              <HTMLMarker 
                key={ord.id} 
                position={{ lat: ord.pickupCoords.lat, lng: ord.pickupCoords.lng }} 
                zIndex={isSelected ? 30 : isActive ? 20 : 5}
              >
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedOrder(ord);
                    if (onSelectOrder) onSelectOrder(ord);
                  }}
                  className="relative flex flex-col items-center cursor-pointer group"
                >
                  {/* Outer pulse */}
                  <div className={`absolute -inset-2 rounded-full ${
                    isSelected ? 'bg-brand-sage/40 animate-ping' :
                    isActive ? 'bg-brand-gold/30 animate-pulse' :
                    isUnassigned ? 'bg-brand-sage/20' : 'bg-transparent'
                  }`} />

                  {/* Marker Pin Icon */}
                  <div className={`px-2 py-1 rounded-full text-[9px] font-bold shadow-md border-2 transition-transform duration-200 flex items-center space-x-1 ${
                    isSelected ? 'bg-brand-sage text-white border-white scale-110 ring-2 ring-brand-sage/50' :
                    isActive ? 'bg-brand-gold text-white border-white scale-105' :
                    isUnassigned ? 'bg-white text-brand-sage border-brand-sage' :
                    'bg-white text-text-slate border-border-soft'
                  }`}>
                    <span className="w-2 h-2 rounded-full bg-current" />
                    <span className="truncate max-w-[80px] font-display">{ord.customerName}</span>
                  </div>

                  {/* Subtitle Badge */}
                  <div className="bg-white/90 border border-border-soft px-1.5 py-0.5 rounded text-[7px] text-text-charcoal font-semibold shadow-xs mt-0.5 whitespace-nowrap">
                    📍 {ord.pickupAddress.split(',')[0]}
                  </div>
                </div>
              </HTMLMarker>
            );
          })}

          {/* Rider Marker */}
          <HTMLMarker position={{ lat: rider.coords.lat, lng: rider.coords.lng }} zIndex={40}>
            <div className="relative flex items-center justify-center">
              <div className="absolute w-10 h-10 bg-[#6F7A63]/20 rounded-full animate-ping" />
              <div
                className="w-8 h-8 bg-[#6F7A63] border-2 border-white rounded-full flex items-center justify-center shadow-lg transition-transform duration-200"
                style={{ transform: `rotate(${rider.heading}deg)` }}
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </div>
            </div>
          </HTMLMarker>

          {/* Route Polyline */}
          {targetCoords && routePath.length > 0 && (
            <CustomPolyline
              path={routePath}
              color={isElite ? '#C5A46D' : '#6F7A63'}
            />
          )}

          {/* TOP FLOATING OVERLAYS - Status & Custom Map Controls */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-none z-10">
            {/* GPS Quality Badge */}
            <div className="bg-white/90 backdrop-blur-md border border-border-soft px-3 py-1.5 rounded-full shadow-md flex items-center space-x-2 pointer-events-auto">
              <Activity className="w-3.5 h-3.5 text-status-success animate-pulse" />
              <div className="text-left">
                <p className="text-[9px] font-bold text-text-charcoal font-display uppercase tracking-wider leading-none">GPS High Accuracy</p>
                <p className="text-[8px] text-text-slate leading-none mt-0.5">KNUST Campus Grid</p>
              </div>
            </div>

            {/* Custom Google Map Controls */}
            <MapControls riderCoords={rider.coords} />
          </div>
        </Map>
      </APIProvider>

      {/* SELECTED TASK PICKUP LOCATION DETAIL OVERLAY */}
      {selectedOrder && (
        <div className="absolute bottom-16 inset-x-4 bg-white/95 backdrop-blur-md border border-brand-sage/30 rounded-2xl p-3.5 shadow-2xl z-50 animate-slide-up pointer-events-auto">
          <div className="flex justify-between items-start pb-2 border-b border-border-soft">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-text-charcoal font-display">{selectedOrder.customerName}</span>
                <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                  selectedOrder.priority === 'elite' ? 'bg-brand-gold/15 text-brand-gold' : 'bg-brand-sage/15 text-brand-sage'
                }`}>
                  {selectedOrder.priority}
                </span>
              </div>
              <p className="text-[9px] font-mono text-brand-gold font-bold">{selectedOrder.orderNumber}</p>
            </div>
            <button 
              onClick={() => setSelectedOrder(null)}
              className="text-text-slate hover:text-text-charcoal font-bold text-xs p-1"
            >
              ✕
            </button>
          </div>

          <div className="py-2 space-y-1 text-left text-[10.5px]">
            <p className="text-text-charcoal font-semibold flex items-center space-x-1">
              <span className="text-brand-sage font-bold">📍 Pickup Location:</span>
              <span>{selectedOrder.pickupAddress}</span>
            </p>
            <p className="text-[9.5px] font-mono text-text-slate flex items-center space-x-1">
              <span>GPS Coordinates:</span>
              <span className="bg-bg-linen px-1.5 py-0.5 rounded border border-border-soft font-bold text-text-charcoal">
                {selectedOrder.pickupCoords.lat.toFixed(4)}° N, {Math.abs(selectedOrder.pickupCoords.lng).toFixed(4)}° W
              </span>
            </p>
            <div className="flex justify-between text-[9.5px] text-text-slate pt-1">
              <span>Distance: <strong className="text-text-charcoal">{selectedOrder.distance} km</strong></span>
              <span>Est. Travel: <strong className="text-text-charcoal">{selectedOrder.estDuration} mins</strong></span>
              <span>Payout: <strong className="text-brand-sage">GH₵ {selectedOrder.price.toFixed(2)}</strong></span>
            </div>
          </div>

          <div className="flex space-x-2 pt-1">
            {selectedOrder.status === 'unassigned' && onAcceptOrder && (
              <button
                onClick={() => {
                  onAcceptOrder(selectedOrder.id);
                  setSelectedOrder(null);
                }}
                className="flex-1 py-2 bg-brand-sage text-white text-xs font-bold rounded-xl shadow-xs uppercase font-display active:scale-95 transition-transform"
              >
                Accept Task at Location
              </button>
            )}
            <button
              onClick={() => setSelectedOrder(null)}
              className="px-3 py-2 border border-border-soft rounded-xl text-xs font-semibold text-text-slate hover:bg-bg-linen"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* NAVIGATION INSTRUCTIONS OVERLAY */}
      {targetCoords && activeOrder && !selectedOrder && (
        <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-md border border-brand-sage/20 rounded-xl p-3 shadow-lg flex items-center justify-between transition-all animate-slide-up z-10 pointer-events-auto">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-brand-sage/10 rounded-full flex items-center justify-center">
              <Navigation className="w-4 h-4 text-brand-sage rotate-45" />
            </div>
            <div>
              <p className="text-xs font-bold text-text-charcoal font-display leading-tight truncate max-w-[180px]">
                {activeOrder.status === 'navigating_to_pickup'
                  ? 'Navigating to Pickup'
                  : activeOrder.status === 'navigating_to_laundry'
                  ? 'Navigating to Laundry Hub'
                  : 'Navigating to Delivery'}
              </p>
              <p className="text-[10px] text-text-slate truncate max-w-[180px]">
                {destinationName}
              </p>
            </div>
          </div>

          <div className="text-right border-l border-border-soft pl-3">
            <p className="text-xs font-bold text-brand-sage font-sans">{activeOrder.distance} km</p>
            <p className="text-[9px] text-text-slate">Est. {activeOrder.estDuration} min</p>
          </div>
        </div>
      )}

      {/* DRAG-TO-PAN WATERMARK */}
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-text-charcoal/50 text-white/90 text-[8px] font-medium tracking-widest uppercase px-2 py-0.5 rounded-full backdrop-blur-xs pointer-events-none z-10">
        Google Maps Live View
      </div>
    </div>
  );
}

