/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Camera, ShieldCheck, Zap, Laptop, Layers, ClipboardCheck, ArrowRight } from 'lucide-react';
import { LaundryBag, Order } from '../types';

interface QRScannerProps {
  order: Order;
  onScanComplete: (scannedBags: LaundryBag[]) => void;
  onCancel?: () => void;
}

export default function QRScanner({
  order,
  onScanComplete,
  onCancel,
}: QRScannerProps) {
  const [bags, setBags] = useState<LaundryBag[]>(
    order.bags.map(bag => ({ ...bag }))
  );
  const [activeTab, setActiveTab] = useState<'simulated' | 'webcam'>('simulated');
  const [isScanningWebcam, setIsScanningWebcam] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<string>('Align barcode or QR code inside the bounding frame');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Auto-simulate scanning after a short delay for simulated tab
  const handleSimulateScanBag = (bagId: string) => {
    setBags(prev =>
      prev.map(b => (b.id === bagId ? { ...b, scanned: true } : b))
    );
    setScanningStatus(`Successfully scanned bag ${bagId} | Code registered.`);
  };

  const handleSimulateScanAll = () => {
    setBags(prev => prev.map(b => ({ ...b, scanned: true })));
    setScanningStatus("All bags scanned and verified successfully.");
  };

  // Check if all bags are scanned
  const allBagsScanned = bags.every(b => b.scanned);

  const handleConfirmScans = () => {
    if (allBagsScanned) {
      onScanComplete(bags);
    }
  };

  // Webcam setup
  const startWebcam = async () => {
    try {
      setIsScanningWebcam(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setScanningStatus("Webcam initialized. Align bag barcode within frame...");
    } catch (err) {
      console.warn("Webcam access declined or unavailable, defaulting to simulated high-fidelity scanner.", err);
      setActiveTab('simulated');
      setIsScanningWebcam(false);
      setScanningStatus("Webcam unavailable. Simulated high-fidelity scanner active.");
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanningWebcam(false);
  };

  useEffect(() => {
    if (activeTab === 'webcam') {
      startWebcam();
    } else {
      stopWebcam();
    }
    return () => stopWebcam();
  }, [activeTab]);

  return (
    <div className="bg-white rounded-2xl border border-border-soft p-5 w-full flex flex-col space-y-4 shadow-md" id="qr-bag-scanner-container">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-soft pb-3">
        <div className="flex items-center space-x-2">
          <QrCode className="w-5 h-5 text-brand-sage" />
          <div>
            <h3 className="text-sm font-bold text-text-charcoal font-display">FreshFold QR Bag Verification</h3>
            <p className="text-[10px] text-text-slate">Order ID: <span className="font-mono font-bold text-brand-gold">{order.orderNumber}</span></p>
          </div>
        </div>
        
        {/* Tab Toggle */}
        <div className="flex space-x-1 bg-bg-linen p-0.5 rounded-lg text-[9px] font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('simulated')}
            className={`px-2 py-1 rounded-md transition-all ${activeTab === 'simulated' ? 'bg-white text-text-charcoal shadow-xs' : 'text-text-slate hover:text-text-charcoal'}`}
          >
            Digital Scanner
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('webcam')}
            className={`px-2 py-1 rounded-md transition-all ${activeTab === 'webcam' ? 'bg-white text-text-charcoal shadow-xs' : 'text-text-slate hover:text-text-charcoal'}`}
          >
            Live Camera
          </button>
        </div>
      </div>

      {/* VIEWFINDER SCREEN */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-[#121212] border border-border-soft flex flex-col items-center justify-center">
        {activeTab === 'webcam' && isScanningWebcam ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          /* Premium Simulated Scanner Graphic */
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            {/* Spinning background rings */}
            <div className="absolute w-32 h-32 border border-brand-sage/20 rounded-full animate-spin [animation-duration:8s]"></div>
            <div className="absolute w-24 h-24 border border-brand-gold/10 rounded-full animate-spin [animation-duration:4s] reverse"></div>
            
            <QrCode className="w-12 h-12 text-brand-sage/80 relative z-10 animate-pulse mb-2" />
            <p className="text-white text-xs font-semibold tracking-wide relative z-10 font-display">Virtual Laser Alignment Active</p>
            <p className="text-text-slate text-[9px] max-w-[180px] relative z-10 mt-1">Automatic recognition of FreshFold luxury canvas bag QR labels</p>
          </div>
        )}

        {/* Viewfinder Bounding Corner Markers */}
        <div className="absolute top-6 left-6 w-5 h-5 border-t-2 border-l-2 border-brand-gold rounded-tl-md"></div>
        <div className="absolute top-6 right-6 w-5 h-5 border-t-2 border-r-2 border-brand-gold rounded-tr-md"></div>
        <div className="absolute bottom-6 left-6 w-5 h-5 border-b-2 border-l-2 border-brand-gold rounded-bl-md"></div>
        <div className="absolute bottom-6 right-6 w-5 h-5 border-b-2 border-r-2 border-brand-gold rounded-br-md"></div>

        {/* Red Laser Scanning Line (Moving) */}
        <div className="absolute left-6 right-6 h-[1.5px] bg-status-error opacity-75 shadow-[0_0_8px_rgba(184,92,92,0.8)] animate-bounce [animation-duration:2.5s] top-1/2"></div>

        {/* Flashlight button toggle */}
        <button
          type="button"
          onClick={() => setFlashOn(!flashOn)}
          className={`absolute bottom-3 right-3 p-1.5 rounded-full ${flashOn ? 'bg-brand-gold text-text-charcoal shadow-sm' : 'bg-black/45 text-white/80'} backdrop-blur-xs transition-colors`}
        >
          <Zap className="w-3.5 h-3.5" />
        </button>

        {/* Floating status banner */}
        <div className="absolute bottom-3 left-3 bg-black/60 text-white text-[8.5px] px-2.5 py-1 rounded-md font-sans tracking-tight max-w-[180px] truncate backdrop-blur-xs border border-white/10">
          {scanningStatus}
        </div>
      </div>

      {/* RECONCILED BAGS QUEUE */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-text-slate">
          <span>Required Bag Checks ({bags.filter(b => b.scanned).length}/{bags.length})</span>
          {activeTab === 'simulated' && !allBagsScanned && (
            <button
              onClick={handleSimulateScanAll}
              type="button"
              className="text-brand-sage hover:text-brand-gold font-bold tracking-tight lowercase font-sans text-xs flex items-center space-x-1"
            >
              <span>Auto-scan all bags</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 max-h-36 overflow-y-auto pr-1">
          {bags.map((bag) => (
            <div
              key={bag.id}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                bag.scanned
                  ? 'border-status-success/30 bg-status-success/5'
                  : 'border-border-soft bg-bg-ivory'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                  bag.scanned ? 'bg-status-success/15 border-status-success/25 text-status-success' : 'bg-brand-stone/15 border-brand-stone/35 text-text-slate'
                }`}>
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[11px] font-bold text-text-charcoal">{bag.type}</span>
                    <span className="text-[9px] px-1 bg-border-soft text-text-slate rounded-sm font-mono font-medium">{bag.weight}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-[9.5px] text-text-slate font-mono">
                    <span className="text-brand-gold font-semibold">{bag.qrCode}</span>
                    <span>•</span>
                    <span>{bag.itemCount} items</span>
                  </div>
                </div>
              </div>

              {bag.scanned ? (
                <span className="text-[9.5px] font-bold text-status-success flex items-center space-x-1">
                  <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Verified</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSimulateScanBag(bag.id)}
                  className="px-2.5 py-1 bg-brand-sage text-white text-[9.5px] font-bold rounded-lg hover:bg-brand-sage/90 transition-all active:scale-95"
                >
                  Scan QR
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* VERIFICATION ACTIONS */}
      <div className="flex space-x-3 pt-1 border-t border-border-soft">
        <button
          onClick={onCancel}
          type="button"
          className="flex-1 py-2.5 rounded-xl border border-border-soft text-text-charcoal hover:bg-bg-linen text-xs font-semibold tracking-tight transition-all active:scale-98"
        >
          Close Scanner
        </button>

        <button
          onClick={handleConfirmScans}
          type="button"
          disabled={!allBagsScanned}
          className="flex-1 py-2.5 rounded-xl bg-brand-sage text-white disabled:opacity-40 hover:bg-brand-sage/95 text-xs font-semibold tracking-tight transition-all active:scale-98 shadow-xs flex items-center justify-center space-x-1.5"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Confirm {bags.length} Bags Loaded</span>
        </button>
      </div>
    </div>
  );
}
