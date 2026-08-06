/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Camera, Image, Check, RotateCcw, Zap, Laptop, ShieldCheck, Heart } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (photoDataUrl: string) => void;
  onCancel?: () => void;
  title?: string;
  context?: 'pickup' | 'delivery';
}

const PRESET_PHOTOS = {
  pickup: [
    {
      id: "p1",
      label: "Delicate canvas laundry bags on KNUST bench",
      url: "https://images.unsplash.com/photo-1545173168-9f19472ef7f8?auto=format&fit=crop&q=80&w=300"
    },
    {
      id: "p2",
      label: "Pre-verified silk bags at reception",
      url: "https://images.unsplash.com/photo-1528570188406-29a019a2884c?auto=format&fit=crop&q=80&w=300"
    }
  ],
  delivery: [
    {
      id: "d1",
      label: "Freshly pressed linen box at doorman desk",
      url: "https://images.unsplash.com/photo-1541123437800-1bb1317badc2?auto=format&fit=crop&q=80&w=300"
    },
    {
      id: "d2",
      label: "Garments elegantly hung on closet valet",
      url: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=300"
    }
  ]
};

export default function CameraCapture({
  onCapture,
  onCancel,
  title = "Capture Condition Documentation",
  context = "pickup",
}: CameraCaptureProps) {
  const [activeTab, setActiveTab] = useState<'simulated' | 'live'>('simulated');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Live Camera handlers
  const startLiveCamera = async () => {
    try {
      setIsLiveActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn("Live camera unavailable, switching to simulated documentation photos.", err);
      setActiveTab('simulated');
      setIsLiveActive(false);
    }
  };

  const stopLiveCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsLiveActive(false);
  };

  useEffect(() => {
    if (activeTab === 'live') {
      startLiveCamera();
    } else {
      stopLiveCamera();
    }
    return () => stopLiveCamera();
  }, [activeTab]);

  const captureLiveFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);
      stopLiveCamera();
    }
  };

  const handleSelectPreset = (url: string) => {
    setCapturedImage(url);
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  };

  const handleReset = () => {
    setCapturedImage(null);
    if (activeTab === 'live') {
      startLiveCamera();
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-border-soft p-5 w-full flex flex-col space-y-4 shadow-md animate-fade-in" id="camera-capture-container">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-soft pb-3">
        <div className="flex items-center space-x-2">
          <Camera className="w-5 h-5 text-brand-sage" />
          <div>
            <h3 className="text-sm font-bold text-text-charcoal font-display">{title}</h3>
            <p className="text-[10px] text-text-slate">Verify garment placement and state of cleanliness</p>
          </div>
        </div>

        {/* Tab Toggle */}
        {!capturedImage && (
          <div className="flex space-x-1 bg-bg-linen p-0.5 rounded-lg text-[9px] font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('simulated')}
              className={`px-2.5 py-1 rounded-md transition-all ${activeTab === 'simulated' ? 'bg-white text-text-charcoal shadow-xs' : 'text-text-slate hover:text-text-charcoal'}`}
            >
              Gallery Presets
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className={`px-2.5 py-1 rounded-md transition-all ${activeTab === 'live' ? 'bg-white text-text-charcoal shadow-xs' : 'text-text-slate hover:text-text-charcoal'}`}
            >
              Hardware Camera
            </button>
          </div>
        )}
      </div>

      {/* CAMERA SCREEN */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-[#121212] border border-border-soft flex items-center justify-center">
        {capturedImage ? (
          /* Captured photo preview */
          <img
            src={capturedImage}
            alt="Captured Proof"
            className="absolute inset-0 w-full h-full object-cover animate-scale-up"
            referrerPolicy="no-referrer"
          />
        ) : activeTab === 'live' && isLiveActive ? (
          /* Live stream view */
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Capture button overlay */}
            <button
              onClick={captureLiveFrame}
              type="button"
              className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-full border-4 border-white bg-transparent flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
            >
              <div className="w-8 h-8 rounded-full bg-status-error"></div>
            </button>
            {/* Guide Grid Overlays */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20">
              <div className="border-r border-b border-white"></div>
              <div className="border-r border-b border-white"></div>
              <div className="border-b border-white"></div>
              <div className="border-r border-b border-white"></div>
              <div className="border-r border-b border-white"></div>
              <div className="border-b border-white"></div>
              <div className="border-r border-white"></div>
              <div className="border-r border-white"></div>
              <div></div>
            </div>
          </>
        ) : (
          /* Digital Preset Select Screen */
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <Image className="w-10 h-10 text-white/40 mb-1 animate-pulse" />
            <p className="text-white text-xs font-semibold font-display">Select Premium Dispatch Photo</p>
            <p className="text-text-slate text-[9px] mt-1 mb-3">Simulate capturing state-of-the-art concierge delivery</p>
            
            <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
              {PRESET_PHOTOS[context].map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectPreset(item.url)}
                  type="button"
                  className="group relative h-16 rounded-lg overflow-hidden border border-white/10 hover:border-brand-gold active:scale-95 transition-all"
                >
                  <img
                    src={item.url}
                    alt={item.label}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/65 p-1 text-[8px] text-white font-sans text-center leading-tight">
                    {item.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Viewfinder Bounding Corner Markers */}
        <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-white/40 rounded-tl-sm"></div>
        <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-white/40 rounded-tr-sm"></div>
        <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-white/40 rounded-bl-sm"></div>
        <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-white/40 rounded-br-sm"></div>

        {/* Leveler helper */}
        {!capturedImage && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white text-[8px] px-2 py-0.5 rounded-full backdrop-blur-xs font-mono">
            AXIS: 0.0° VERTICAL
          </div>
        )}
      </div>

      {/* CONFIRMATION OR CANCEL ACTIONS */}
      <div className="flex space-x-3 pt-1 border-t border-border-soft">
        {capturedImage ? (
          <>
            <button
              onClick={handleReset}
              type="button"
              className="flex-1 py-2.5 rounded-xl border border-border-soft text-text-charcoal hover:bg-bg-linen text-xs font-semibold tracking-tight transition-all active:scale-98 flex items-center justify-center space-x-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retake Photo</span>
            </button>

            <button
              onClick={handleConfirm}
              type="button"
              className="flex-1 py-2.5 rounded-xl bg-brand-sage text-white hover:bg-brand-sage/95 text-xs font-semibold tracking-tight transition-all active:scale-98 shadow-xs flex items-center justify-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Submit Proof</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onCancel}
              type="button"
              className="flex-1 py-2.5 rounded-xl border border-border-soft text-text-charcoal hover:bg-bg-linen text-xs font-semibold tracking-tight transition-all active:scale-98"
            >
              Cancel Documentation
            </button>
          </>
        )}
      </div>
    </div>
  );
}
