/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { Pencil, RotateCcw, Check, ShieldCheck } from 'lucide-react';

interface SignaturePadProps {
  onSave: (signatureDataUrl: string) => void;
  onCancel?: () => void;
  title?: string;
  customerName?: string;
}

export default function SignaturePad({
  onSave,
  onCancel,
  title = "Recipient's Signature Required",
  customerName = "Alistair Thorne",
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Adjust canvas resolution for high-density screens (retina)
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Ink pen configurations
    ctx.strokeStyle = '#1F1F1F'; // Rich charcoal
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  // Drawing event handlers (Mouse)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSigned(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Drawing event handlers (Touch)
  const startDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSigned(true);
  };

  const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || e.touches.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  // Reset Canvas
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  // Save Signature as Data URL
  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSigned) return;

    // Save
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="bg-white rounded-2xl border border-border-soft p-5 w-full flex flex-col space-y-4 shadow-sm" id="signature-pad-container">
      {/* Title */}
      <div className="flex items-center space-x-2 border-b border-border-soft pb-3">
        <Pencil className="w-4 h-4 text-brand-sage" />
        <div>
          <h3 className="text-sm font-bold text-text-charcoal font-display">{title}</h3>
          <p className="text-[10px] text-text-slate">Please have <span className="font-semibold text-brand-sage">{customerName}</span> sign below</p>
        </div>
      </div>

      {/* Signature Canvas Box */}
      <div className="relative border border-dashed border-brand-stone/80 rounded-xl bg-bg-ivory/50 h-36 overflow-hidden">
        {/* Subtle Sign Line */}
        <div className="absolute bottom-8 left-6 right-6 border-b border-brand-stone/40 pointer-events-none flex justify-between">
          <span className="text-[9px] font-mono text-brand-stone uppercase tracking-wider">X Sign here</span>
          <span className="text-[8px] font-mono text-brand-stone">Security encrypted signature</span>
        </div>

        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawingTouch}
          onTouchMove={drawTouch}
          onTouchEnd={stopDrawing}
        />
      </div>

      {/* Security note */}
      <div className="flex items-center space-x-1.5 text-[9px] text-text-slate bg-bg-linen/50 px-2 py-1.5 rounded-lg">
        <ShieldCheck className="w-3.5 h-3.5 text-brand-sage shrink-0" />
        <span>By signing, recipient verifies garment count matches precisely and accepts conditions of care.</span>
      </div>

      {/* Actions */}
      <div className="flex space-x-3 pt-1">
        <button
          onClick={clearCanvas}
          type="button"
          disabled={!hasSigned}
          className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl border border-border-soft text-text-charcoal hover:bg-bg-linen disabled:opacity-40 disabled:hover:bg-transparent text-xs font-semibold tracking-tight transition-all active:scale-98"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Clear Pad</span>
        </button>

        <button
          onClick={handleConfirm}
          type="button"
          disabled={!hasSigned}
          className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl bg-brand-sage text-white disabled:opacity-40 disabled:hover:opacity-40 hover:bg-brand-sage/95 text-xs font-semibold tracking-tight transition-all active:scale-98 shadow-xs"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Confirm Slip</span>
        </button>
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          type="button"
          className="text-center text-[10px] text-text-slate hover:text-text-charcoal transition-colors py-0.5"
        >
          Cancel Signature Entry
        </button>
      )}
    </div>
  );
}
