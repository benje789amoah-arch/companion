/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  Battery as BatteryIcon, 
  Signal, 
  Home, 
  Layers, 
  MapPin, 
  History as HistoryIcon, 
  User, 
  Sparkles, 
  Lock, 
  Smartphone, 
  Eye, 
  EyeOff, 
  Play, 
  AlertCircle, 
  CheckCircle2, 
  ShieldCheck, 
  Layers2, 
  Camera, 
  QrCode, 
  MessageSquare, 
  Bell, 
  ArrowLeft, 
  Activity, 
  ChevronRight, 
  Star, 
  ThumbsUp,
  Map,
  BadgeAlert,
  BadgePercent,
  Menu,
  ChevronDown,
  Compass
} from 'lucide-react';
import { Order, RiderState, Message, Notification, OrderStatus } from '../types';
import LiveMap from './LiveMap';
import QRScanner from './QRScanner';
import CameraCapture from './CameraCapture';
import SignaturePad from './SignaturePad';

interface PhoneSimulatorProps {
  rider: RiderState;
  orders: Order[];
  messages: Message[];
  notifications: Notification[];
  activeOrder?: Order;
  onUpdateRider: (updates: Partial<RiderState>) => void;
  onAcceptOrder: (orderId: string) => void;
  onDeclineOrder: (orderId: string) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, photo?: string, sig?: string) => void;
  onSendRiderMessage: (text: string) => void;
  onMarkNotificationRead: (notifId: string) => void;
  simulationActive: boolean;
  setSimulationActive: (active: boolean) => void;
}

export default function PhoneSimulator({
  rider,
  orders,
  messages,
  notifications,
  activeOrder,
  onUpdateRider,
  onAcceptOrder,
  onDeclineOrder,
  onUpdateOrderStatus,
  onSendRiderMessage,
  onMarkNotificationRead,
  simulationActive,
  setSimulationActive,
}: PhoneSimulatorProps) {
  // App navigation state
  const [currentScreen, setCurrentScreen] = useState<'splash' | 'auth' | 'app'>('splash');
  const [currentTab, setCurrentTab] = useState<'home' | 'assignments' | 'map' | 'history' | 'profile'>('home');
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Auth Form State
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showOtpField, setShowOtpField] = useState(false);
  const [password, setPassword] = useState('');
  const [isBiometricRegistered, setIsBiometricRegistered] = useState(true);
  const [isScanningFaceId, setIsScanningFaceId] = useState(false);
  const [authError, setAuthError] = useState('');
  const [otpSentToast, setOtpSentToast] = useState(false);

  // Active Workflow Action Sheets / Steps
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number>(0);
  const [activeScanner, setActiveScanner] = useState(false);
  const [activeCamera, setActiveCamera] = useState<'pickup' | 'delivery' | null>(null);
  const [activeSignature, setActiveSignature] = useState(false);
  const [deliveryOtpInput, setDeliveryOtpInput] = useState('');
  const [deliveryOtpError, setDeliveryOtpError] = useState(false);

  // Messaging sub-screen
  const [chatTarget, setChatTarget] = useState<'dispatcher' | 'customer'>('dispatcher');
  const [riderChatText, setRiderChatText] = useState('');
  const [isInsideChat, setIsInsideChat] = useState(false);

  // Assignments filter
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'upcoming' | 'active' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedOrderIdForMap, setFocusedOrderIdForMap] = useState<string | null>(null);

  // Driver profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(rider.name || '');
  const [editEmployeeId, setEditEmployeeId] = useState(rider.employeeId || '');
  const [editVehicle, setEditVehicle] = useState(rider.vehicle || '');
  const [editVehiclePlate, setEditVehiclePlate] = useState(rider.vehiclePlate || '');
  const [editAvatar, setEditAvatar] = useState(rider.avatar || '');

  useEffect(() => {
    setEditName(rider.name || '');
    setEditEmployeeId(rider.employeeId || '');
    setEditVehicle(rider.vehicle || '');
    setEditVehiclePlate(rider.vehiclePlate || '');
    setEditAvatar(rider.avatar || '');
  }, [rider]);

  // Auto-forward Splash
  useEffect(() => {
    if (currentScreen === 'splash') {
      const timer = setTimeout(() => {
        setCurrentScreen('auth');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentScreen]);

  // Synchronize GPS Simulation Status
  useEffect(() => {
    if (activeOrder) {
      if (
        activeOrder.status === 'navigating_to_pickup' ||
        activeOrder.status === 'navigating_to_laundry' ||
        activeOrder.status === 'navigating_to_delivery'
      ) {
        setSimulationActive(true);
      } else {
        setSimulationActive(false);
      }
    } else {
      setSimulationActive(false);
    }
  }, [activeOrder?.status]);

  // Handle Login OTP simulation
  const handleRequestOtp = () => {
    if (!phoneNumber.trim()) {
      setAuthError("Please provide an employee registered phone number");
      return;
    }
    setAuthError("");
    setOtpSentToast(true);
    setShowOtpField(true);
    setTimeout(() => setOtpSentToast(false), 3000);
  };

  const handleVerifyOtp = () => {
    if (otpCode.length === 4) {
      setAuthError("");
      setCurrentScreen('app');
      onUpdateRider({ isOnline: true });
      if (!rider.name) {
        setCurrentTab('profile');
      }
    } else {
      setAuthError("Invalid luxury pin. Try entering '7801' or '1234'.");
    }
  };

  const handleBiometricLogin = () => {
    setIsScanningFaceId(true);
    setTimeout(() => {
      setIsScanningFaceId(false);
      setCurrentScreen('app');
      onUpdateRider({ isOnline: true });
      if (!rider.name) {
        setCurrentTab('profile');
      }
    }, 1200);
  };

  // Status handlers
  const handleToggleOnline = () => {
    onUpdateRider({ isOnline: !rider.isOnline });
  };

  const handleArrival = () => {
    if (!activeOrder) return;
    setSimulationActive(false);
    
    if (activeOrder.status === 'navigating_to_pickup') {
      onUpdateOrderStatus(activeOrder.id, 'arrived_at_pickup');
      setActiveWorkflowStep(1); // Ready to scan QR
    } else if (activeOrder.status === 'navigating_to_laundry') {
      onUpdateOrderStatus(activeOrder.id, 'arrived_at_laundry');
      setActiveWorkflowStep(1); // Ready to dropoff scan
    } else if (activeOrder.status === 'navigating_to_delivery') {
      onUpdateOrderStatus(activeOrder.id, 'arrived_at_delivery');
      setActiveWorkflowStep(1); // Ready for OTP and Photo
    }
  };

  // QR Scan Complete
  const handleQRVerify = (scannedBags: any[]) => {
    if (!activeOrder) return;
    setActiveScanner(false);
    
    if (activeOrder.status === 'arrived_at_pickup') {
      onUpdateOrderStatus(activeOrder.id, 'pickup_scanned');
      setActiveWorkflowStep(2); // Move to Photo
    } else if (activeOrder.status === 'arrived_at_laundry') {
      onUpdateOrderStatus(activeOrder.id, 'dropped_off');
      // Drops are instant. Clean clothes are then processed. Let's make it go to process!
      setTimeout(() => {
        onUpdateOrderStatus(activeOrder.id, 'ready_for_delivery');
      }, 4000);
      setActiveWorkflowStep(0);
    }
  };

  // Camera capture Complete
  const handlePhotoCaptured = (url: string) => {
    if (!activeOrder) return;
    setActiveCamera(null);

    if (activeOrder.status === 'pickup_scanned') {
      // Save photo to order
      onUpdateOrderStatus(activeOrder.id, 'pickup_scanned', url);
      setActiveWorkflowStep(3); // Move to Signature
    } else if (activeOrder.status === 'arrived_at_delivery') {
      onUpdateOrderStatus(activeOrder.id, 'arrived_at_delivery', undefined, undefined); // update status
      // We also update local order state
      activeOrder.deliveryPhoto = url;
      setActiveWorkflowStep(3); // Move to Signature
    }
  };

  // Signature Complete
  const handleSignatureCaptured = (dataUrl: string) => {
    if (!activeOrder) return;
    setActiveSignature(false);

    if (activeOrder.status === 'pickup_scanned') {
      onUpdateOrderStatus(activeOrder.id, 'picked_up', undefined, dataUrl);
      onUpdateRider({ todayDistance: rider.todayDistance + 2.1 });
      setActiveWorkflowStep(0); // Completed pickup, ready for delivery or transit
    } else if (activeOrder.status === 'arrived_at_delivery') {
      onUpdateOrderStatus(activeOrder.id, 'delivered', undefined, dataUrl);
      onUpdateRider({
        todayDistance: rider.todayDistance + activeOrder.distance,
        todayEarnings: rider.todayEarnings + activeOrder.price,
        completedCount: rider.completedCount + 1
      });
      setActiveWorkflowStep(0); // Finished!
    }
  };

  // Delivery OTP checking
  const handleVerifyDeliveryOtp = () => {
    // Correct OTP is in messages or "7809" or "4019"
    if (deliveryOtpInput === '7809' || deliveryOtpInput === '4019' || deliveryOtpInput === '1234' || deliveryOtpInput === '') {
      setDeliveryOtpError(false);
      setActiveWorkflowStep(2); // Move to Camera Photo
    } else {
      setDeliveryOtpError(true);
    }
  };

  // Send messaging text
  const handleSendRiderText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!riderChatText.trim()) return;
    onSendRiderMessage(riderChatText);
    setRiderChatText('');
  };

  // Filter assignments
  const filteredAssignments = orders.filter(order => {
    const matchesSearch = order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (assignmentFilter === 'all') return true;
    if (assignmentFilter === 'upcoming') return order.status === 'unassigned';
    if (assignmentFilter === 'active') return order.status !== 'unassigned' && order.status !== 'delivered' && order.status !== 'cancelled';
    if (assignmentFilter === 'completed') return order.status === 'delivered';
    return true;
  });

  // Safe counts
  const unreadNotifsCount = notifications.filter(n => !n.read).length;

  return (
    <div className="flex flex-col items-center justify-center p-0 md:p-4 w-full h-full bg-bg-linen" id="smartphone-device-simulator">
      {/* PHONE CASING (Luxury Matte Bronze/Gold iPhone style bezel - Adaptive to fill screen on mobile) */}
      <div className="relative w-full h-full md:w-[370px] md:h-[760px] bg-bg-ivory md:bg-[#141413] md:rounded-[42px] md:border-[11px] md:border-[#2C2B29] md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.45)] overflow-hidden flex flex-col shrink-0 transition-all duration-300">
        
        {/* Dynamic Island / Notch (Hidden on actual mobile screens to avoid clashing with native notches) */}
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-28 h-6 bg-black rounded-full z-50 hidden md:flex items-center justify-center space-x-1 border border-white/5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-900/50"></div>
          <div className="w-4 h-1 bg-neutral-900 rounded-full"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-pulse"></div>
        </div>

        {/* STATUS BAR */}
        <div className="bg-bg-ivory text-text-charcoal text-[11px] font-bold px-7 pt-4 pb-2 flex justify-between items-center z-40 select-none">
          {/* Time */}
          <span>19:05</span>
          
          {/* Icons */}
          <div className="flex items-center space-x-1.5">
            <Signal className="w-3.5 h-3.5 text-text-charcoal" />
            <span className="text-[9px] font-bold uppercase tracking-tighter">5G</span>
            <Wifi className="w-3.5 h-3.5 text-text-charcoal" />
            
            {/* Battery */}
            <div className="flex items-center space-x-0.5">
              <span className="text-[9px] font-bold mr-0.5">{rider.batteryLevel}%</span>
              <BatteryIcon className={`w-4 h-4 ${rider.batteryLevel < 20 ? 'text-status-error' : 'text-brand-sage'}`} />
            </div>
          </div>
        </div>

        {/* MAIN SCREEN AREA */}
        <div className="flex-1 bg-bg-ivory overflow-hidden relative flex flex-col">

          {/* SCREEN 1: SPLASH SCREEN */}
          {currentScreen === 'splash' && (
            <div className="absolute inset-0 bg-bg-ivory z-50 flex flex-col items-center justify-between p-12 text-center animate-fade-in" id="splash-view">
              <div className="my-auto flex flex-col items-center space-y-4">
                {/* Custom Brand Logo */}
                <div className="w-16 h-16 bg-brand-sage rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                
                <div>
                  <h1 className="text-xl font-bold font-heading text-text-charcoal tracking-wide">F R E S H F O L D</h1>
                  <p className="text-[9px] font-mono tracking-widest text-brand-gold uppercase mt-1">Dispatch operations companion</p>
                </div>
              </div>

              <div className="flex flex-col items-center space-y-2">
                <p className="text-[10px] text-text-slate font-sans tracking-tight">Luxury Valet Laundry Service</p>
                <div className="flex space-x-1">
                  <span className="w-1.5 h-1.5 bg-brand-sage rounded-full animate-bounce [animation-delay:0.1s]"></span>
                  <span className="w-1.5 h-1.5 bg-brand-sage rounded-full animate-bounce [animation-delay:0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-brand-sage rounded-full animate-bounce [animation-delay:0.5s]"></span>
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 2: AUTHENTICATION */}
          {currentScreen === 'auth' && (
            <div className="absolute inset-0 bg-bg-ivory z-40 flex flex-col justify-between p-8 animate-fade-in" id="auth-view">
              <div className="mt-6 flex flex-col items-start space-y-1">
                <span className="text-[9px] font-bold text-brand-sage uppercase tracking-widest font-mono">White-Glove Service</span>
                <h2 className="text-2xl font-bold text-text-charcoal font-display">FreshFold Rider Authentication</h2>
                <p className="text-[10.5px] text-text-slate leading-relaxed">Access the elite dispatch rider companion console with secure biometric encryption.</p>
              </div>

              <div className="space-y-4 my-auto">
                {authError && (
                  <div className="bg-status-error/5 border border-status-error/20 p-2.5 rounded-xl text-[10.5px] text-status-error flex items-center space-x-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                {otpSentToast && (
                  <div className="bg-status-success/5 border border-status-success/20 p-2.5 rounded-xl text-[10.5px] text-status-success flex items-center space-x-2 animate-bounce">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>OTP code sent to registered driver line!</span>
                  </div>
                )}

                {!showOtpField ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold uppercase tracking-wider text-text-slate">Mobile Phone Line</label>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 0243456789"
                        className="w-full p-3 border border-border-soft rounded-xl focus:outline-none focus:border-brand-sage bg-white text-text-charcoal text-xs shadow-xs"
                      />
                    </div>

                    <button
                      onClick={handleRequestOtp}
                      type="button"
                      className="w-full py-3 bg-brand-sage hover:bg-brand-sage/95 text-white font-bold rounded-xl text-xs tracking-wide transition-all active:scale-98 shadow-xs uppercase font-display"
                    >
                      Request Luxury Access OTP
                    </button>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold uppercase tracking-wider text-text-slate">Enter 4-Digit Security PIN</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value)}
                        placeholder="e.g. 7801"
                        className="w-full p-3 border border-border-soft rounded-xl text-center font-bold tracking-widest text-text-charcoal bg-white text-sm focus:outline-none focus:border-brand-sage shadow-xs"
                      />
                      <p className="text-[9px] text-text-slate mt-0.5">Mock security bypass code is <span className="font-bold text-brand-gold">7801</span></p>
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={() => setShowOtpField(false)}
                        type="button"
                        className="w-1/3 py-3 border border-border-soft rounded-xl text-xs font-semibold text-text-charcoal bg-white active:scale-98 transition-all"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleVerifyOtp}
                        type="button"
                        className="flex-1 py-3 bg-brand-sage text-white font-bold rounded-xl text-xs tracking-wide active:scale-98 transition-all shadow-xs"
                      >
                        Verify & Login
                      </button>
                    </div>
                  </>
                )}

                {/* Face ID Quick Bypass */}
                {isBiometricRegistered && (
                  <div className="pt-4 border-t border-border-soft flex flex-col items-center space-y-2">
                    <button
                      onClick={handleBiometricLogin}
                      type="button"
                      className="w-16 h-16 bg-brand-sage/10 hover:bg-brand-sage/20 border-2 border-brand-sage/40 rounded-2xl flex items-center justify-center text-brand-sage hover:scale-105 active:scale-95 transition-all shadow-md group relative overflow-hidden"
                      title="Biometric Face ID Signature"
                    >
                      <div className="absolute inset-0 bg-brand-sage/10 animate-pulse" />
                      <User className="w-8 h-8 relative z-10 text-brand-sage" />
                    </button>
                    <span className="text-[9.5px] font-bold text-brand-sage">Authenticate with Face ID</span>
                  </div>
                )}
              </div>

              {/* Face ID Scanning Modal Overlay */}
              {isScanningFaceId && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col items-center justify-center text-white p-6 animate-fade-in">
                  <div className="relative w-24 h-24 rounded-3xl border-2 border-brand-sage flex items-center justify-center animate-pulse shadow-2xl bg-white/5">
                    <div className="absolute -inset-1 border-2 border-brand-gold/60 rounded-3xl animate-spin [animation-duration:3s]" />
                    <User className="w-12 h-12 text-brand-sage animate-bounce" />
                  </div>
                  <p className="mt-5 text-xs font-bold font-display uppercase tracking-widest text-brand-gold">Verifying Face ID...</p>
                  <p className="text-[9px] text-white/70 font-mono mt-1">Biometric Hash Encryption Verified</p>
                </div>
              )}

              <div className="text-center text-[9px] text-text-slate flex flex-col space-y-1">
                <span>By continuing, you agree to security geolocation tracking during operational shift.</span>
                <span className="font-semibold text-brand-gold">FreshFold Luxury Co. All rights reserved 2026</span>
              </div>
            </div>
          )}

          {/* SCREEN 3: APP INTERFACES */}
          {currentScreen === 'app' && (
            <div className="flex-1 flex flex-col relative h-full">

              {/* FLOATING ACTION OVERLAYS FOR MODALS */}

              {/* OVERLAY: ACTIVE QR CODE SCANNER */}
              {activeScanner && activeOrder && (
                <div className="absolute inset-0 bg-black/55 z-50 p-4 flex flex-col justify-end animate-fade-in">
                  <div className="bg-white rounded-2xl p-1 shadow-2xl">
                    <QRScanner
                      order={activeOrder}
                      onScanComplete={handleQRVerify}
                      onCancel={() => setActiveScanner(false)}
                    />
                  </div>
                </div>
              )}

              {/* OVERLAY: CONDITION CAMERA CAPTURE */}
              {activeCamera && (
                <div className="absolute inset-0 bg-black/55 z-50 p-4 flex flex-col justify-end animate-fade-in">
                  <div className="bg-white rounded-2xl p-1 shadow-2xl">
                    <CameraCapture
                      context={activeCamera}
                      onCapture={handlePhotoCaptured}
                      onCancel={() => setActiveCamera(null)}
                    />
                  </div>
                </div>
              )}

              {/* OVERLAY: SIGNATURE PAD */}
              {activeSignature && activeOrder && (
                <div className="absolute inset-0 bg-black/55 z-50 p-4 flex flex-col justify-end animate-fade-in">
                  <div className="bg-white rounded-2xl p-1 shadow-2xl">
                    <SignaturePad
                      customerName={activeOrder.customerName}
                      title={activeOrder.status === 'pickup_scanned' ? 'Pickup Signature Verification' : 'Delivery Receipt Slips'}
                      onSave={handleSignatureCaptured}
                      onCancel={() => setActiveSignature(false)}
                    />
                  </div>
                </div>
              )}

              {/* APP LEVEL TOAST ALERT DROPDOWN */}
              {showNotifications && (
                <div className="absolute top-0 inset-x-0 bg-white/95 backdrop-blur-md border-b border-border-soft z-50 p-4 shadow-xl flex flex-col space-y-3 animate-slide-down max-h-[300px] overflow-y-auto">
                  <div className="flex justify-between items-center border-b border-border-soft pb-1.5">
                    <h4 className="text-xs font-bold text-text-charcoal uppercase tracking-widest font-display">Operational Alerts</h4>
                    <button onClick={() => setShowNotifications(false)} className="text-[9px] font-bold text-brand-sage hover:text-brand-gold uppercase font-sans">Close</button>
                  </div>
                  {notifications.map(notif => (
                    <div 
                      key={notif.id} 
                      onClick={() => {
                        onMarkNotificationRead(notif.id);
                        if (notif.orderId) {
                          setCurrentTab('assignments');
                          setAssignmentFilter('all');
                        }
                        setShowNotifications(false);
                      }}
                      className={`p-2.5 rounded-xl border text-[10.5px] transition-colors cursor-pointer ${notif.read ? 'bg-bg-ivory/50 border-border-soft' : 'bg-brand-sage/5 border-brand-sage/20 font-semibold'}`}
                    >
                      <div className="flex justify-between font-bold text-text-charcoal mb-0.5">
                        <span>{notif.title}</span>
                        <span className="font-mono text-[8px] text-text-slate">{notif.timestamp}</span>
                      </div>
                      <p className="text-[10px] text-text-slate leading-tight">{notif.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* RIDER NAVIGATION CHAT SUB-SCREEN */}
              {isInsideChat && (
                <div className="absolute inset-0 bg-bg-ivory z-40 flex flex-col justify-between animate-fade-in">
                  {/* Chat header */}
                  <div className="bg-white border-b border-border-soft p-4 flex items-center justify-between shadow-xs pt-10">
                    <button onClick={() => setIsInsideChat(false)} className="text-text-charcoal p-1 hover:bg-bg-linen rounded-lg transition-colors">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="text-center">
                      <h4 className="text-xs font-bold text-text-charcoal font-display">Communication Core</h4>
                      <p className="text-[9px] text-text-slate">Connected with {chatTarget}</p>
                    </div>
                    <div className="w-7 h-7 bg-brand-sage/10 rounded-full flex items-center justify-center">
                      <Activity className="w-3.5 h-3.5 text-brand-sage animate-pulse" />
                    </div>
                  </div>

                  {/* Messaging Bubble list */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-bg-linen/25">
                    {messages
                      .filter(msg => msg.sender === 'rider' || msg.sender === chatTarget)
                      .map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex flex-col max-w-[80%] p-2.5 rounded-2xl text-[11px] leading-tight shadow-xs ${
                            msg.sender === 'rider'
                              ? 'self-end bg-brand-sage text-white rounded-tr-none'
                              : 'self-start bg-white border border-border-soft text-text-charcoal rounded-tl-none'
                          }`}
                        >
                          <span className={`text-[8px] uppercase font-bold mb-0.5 ${msg.sender === 'rider' ? 'text-white/80' : 'text-text-slate'}`}>
                            {msg.sender === 'rider' ? 'Me' : msg.sender} • {msg.timestamp}
                          </span>
                          <p>{msg.text}</p>
                        </div>
                      ))}
                  </div>

                  {/* Quick Replies list */}
                  <div className="bg-white px-4 py-2 border-t border-border-soft overflow-x-auto flex space-x-1.5 whitespace-nowrap scrollbar-none">
                    {[
                      "I have arrived at the concierge lobby.",
                      "Placing delicate garments in security sleeves.",
                      "GPS recalculation requested.",
                      "Please confirm building entry buzzer number."
                    ].map((reply, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          onSendRiderMessage(reply);
                        }}
                        className="inline-block px-2.5 py-1.5 bg-bg-linen hover:bg-brand-stone/40 text-[9.5px] font-semibold text-text-charcoal rounded-full transition-colors border border-border-soft"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>

                  {/* Bottom input */}
                  <form onSubmit={handleSendRiderText} className="bg-white p-3 border-t border-border-soft flex space-x-2">
                    <input
                      type="text"
                      value={riderChatText}
                      onChange={e => setRiderChatText(e.target.value)}
                      placeholder={`Send text to ${chatTarget}...`}
                      className="flex-1 p-2 bg-bg-ivory border border-border-soft rounded-xl text-xs focus:outline-none focus:border-brand-sage"
                    />
                    <button
                      type="submit"
                      className="px-4 bg-brand-sage text-white text-xs font-bold rounded-xl shadow-xs transition-transform active:scale-95"
                    >
                      Send
                    </button>
                  </form>
                </div>
              )}

              {/* PRIMARY TAB PANELS */}

              {/* TAB 1: HOME PANEL */}
              {currentTab === 'home' && (
                <div className="flex-1 flex flex-col relative h-full">
                  {/* Floating App Top Bar */}
                  <div className="absolute top-4 inset-x-4 flex justify-between items-center z-40 pointer-events-none select-none">
                    {/* Floating Avatar & Stats */}
                    <div className="bg-white/95 backdrop-blur-md border border-border-soft p-1.5 rounded-full shadow-lg flex items-center space-x-2.5 pointer-events-auto">
                      <img
                        src={rider.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200"}
                        alt={rider.name || "Rider"}
                        className="w-8 h-8 rounded-full border border-brand-sage object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="pr-3 text-left">
                        <p className="text-[10px] font-bold text-text-charcoal leading-none font-display">
                          {rider.name ? (rider.name.length > 15 ? rider.name.substring(0, 13) + '...' : rider.name) : "Setup Profile"}
                        </p>
                        <p className="text-[8px] text-text-slate leading-none mt-0.5">
                          {rider.employeeId ? `ID: ${rider.employeeId}` : "No Identity"}
                        </p>
                      </div>
                    </div>

                    {/* Notification & Messages Icons */}
                    <div className="flex space-x-2 pointer-events-auto">
                      {/* Notifications bell */}
                      <button 
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="relative w-8 h-8 bg-white/95 backdrop-blur-md border border-border-soft rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
                      >
                        <Bell className="w-4 h-4 text-text-charcoal" />
                        {unreadNotifsCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-status-error text-white text-[8px] font-extrabold rounded-full flex items-center justify-center shadow-xs">
                            {unreadNotifsCount}
                          </span>
                        )}
                      </button>

                      {/* Messaging hub */}
                      <button
                        onClick={() => {
                          setChatTarget('dispatcher');
                          setIsInsideChat(true);
                        }}
                        className="w-8 h-8 bg-white/95 backdrop-blur-md border border-border-soft rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
                      >
                        <MessageSquare className="w-4 h-4 text-text-charcoal" />
                      </button>
                    </div>
                  </div>

                  {/* LARGE MAP CANVAS */}
                  <div className="flex-1 relative">
                    <LiveMap
                      rider={rider}
                      orders={orders}
                      activeOrder={activeOrder}
                      focusedOrderId={focusedOrderIdForMap}
                      onSelectOrder={(ord) => setFocusedOrderIdForMap(ord.id)}
                      onAcceptOrder={onAcceptOrder}
                      onArrived={handleArrival}
                      simulationActive={simulationActive}
                      onSimulationStep={(coords) => onUpdateRider({ coords })}
                    />
                  </div>

                  {/* BOTTOM SHEET CONTROLS */}
                  <div className="bg-white border-t border-border-soft rounded-t-[28px] p-5 shadow-2xl space-y-4 animate-slide-up z-30 select-none">
                    
                    {/* Slide up summary bar */}
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-bold text-text-charcoal font-display">
                          {rider.isOnline ? "Scooter Shift Active" : "Operational Offline"}
                        </h3>
                        <p className="text-[10px] text-text-slate">
                          {rider.isOnline ? "Awaiting white-glove orders..." : "Go Online to receive premium orders"}
                        </p>
                      </div>

                      {/* Online/Offline Button */}
                      <button
                        onClick={handleToggleOnline}
                        type="button"
                        className={`px-4 py-2 rounded-full text-xs font-bold tracking-wide uppercase shadow-xs transition-all active:scale-95 border ${
                          rider.isOnline 
                            ? 'bg-status-success/10 border-status-success/30 text-status-success' 
                            : 'bg-text-charcoal border-text-charcoal text-white hover:bg-neutral-800'
                        }`}
                      >
                        {rider.isOnline ? "• Online" : "Go Online"}
                      </button>
                    </div>

                    {/* STATS TILES ROW */}
                    {rider.isOnline && (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2.5 bg-bg-ivory rounded-xl border border-border-soft">
                          <p className="text-[8px] font-bold uppercase text-text-slate tracking-wider leading-none">Complete</p>
                          <h4 className="text-sm font-bold text-text-charcoal font-display mt-1">{rider.completedCount} Jobs</h4>
                        </div>
                        <div className="p-2.5 bg-bg-ivory rounded-xl border border-border-soft">
                          <p className="text-[8px] font-bold uppercase text-text-slate tracking-wider leading-none">Est. Earnings</p>
                          <h4 className="text-sm font-bold text-brand-gold font-display mt-1">GH₵ {rider.todayEarnings.toFixed(2)}</h4>
                        </div>
                        <div className="p-2.5 bg-bg-ivory rounded-xl border border-border-soft">
                          <p className="text-[8px] font-bold uppercase text-text-slate tracking-wider leading-none">Shift Distance</p>
                          <h4 className="text-sm font-bold text-text-charcoal font-display mt-1">{rider.todayDistance.toFixed(1)} km</h4>
                        </div>
                      </div>
                    )}

                    {/* ACTIVE JOB STEP WORKFLOW DRAWER (Only if Emmanuel has an accepted job) */}
                    {rider.isOnline && activeOrder && activeOrder.status !== 'unassigned' && (
                      <div className="border-t border-border-soft pt-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] uppercase font-bold text-text-slate tracking-wider">Active Assignment Workflow</span>
                          <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-sm uppercase ${
                            activeOrder.priority === 'elite' ? 'bg-brand-gold/15 text-brand-gold' : 'bg-brand-sage/10 text-brand-sage'
                          }`}>
                            {activeOrder.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {/* RIDER PICKUP STEPS FLOW */}
                        {activeOrder.status === 'assigned' && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-text-charcoal">Proceed to <span className="font-bold">{activeOrder.pickupAddress}</span> for pickup.</p>
                            <button
                               onClick={() => onUpdateOrderStatus(activeOrder.id, 'navigating_to_pickup')}
                              type="button"
                              className="w-full py-2.5 bg-brand-sage hover:bg-brand-sage/95 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-98 uppercase font-display"
                            >
                              Tap to Start GPS Navigation
                            </button>
                          </div>
                        )}

                        {activeOrder.status === 'navigating_to_pickup' && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-text-slate">Scooter traveling KNUST roads. Sim GPS actively driving...</p>
                            <button
                              onClick={handleArrival}
                              type="button"
                              className="w-full py-2.5 border border-brand-sage text-brand-sage font-bold text-xs rounded-xl shadow-xs hover:bg-brand-sage/5 transition-all active:scale-98 uppercase font-display"
                            >
                              Arrived at KNUST Pickup Location
                            </button>
                          </div>
                        )}

                        {/* PICKUP WORKFLOW: CHECKLIST IN ACTION */}
                        {activeOrder.status === 'arrived_at_pickup' && activeWorkflowStep === 1 && (
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-[10.5px] text-text-charcoal bg-bg-linen/50 p-2 rounded-xl">
                              <span className="w-5 h-5 bg-brand-sage text-white rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
                              <span>Scan FreshFold QR codes on luxury linen bags</span>
                            </div>
                            <button
                              onClick={() => setActiveScanner(true)}
                              type="button"
                              className="w-full py-2.5 bg-brand-sage text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center space-x-2"
                            >
                              <QrCode className="w-4 h-4" />
                              <span>Open QR Bag Scanner</span>
                            </button>
                          </div>
                        )}

                        {activeOrder.status === 'pickup_scanned' && activeWorkflowStep === 2 && (
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-[10.5px] text-text-charcoal bg-bg-linen/50 p-2 rounded-xl">
                              <span className="w-5 h-5 bg-brand-sage text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
                              <span>Take garment documentation photo</span>
                            </div>
                            <button
                              onClick={() => setActiveCamera('pickup')}
                              type="button"
                              className="w-full py-2.5 bg-brand-sage text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center space-x-2"
                            >
                              <Camera className="w-4 h-4" />
                              <span>Document Garment State</span>
                            </button>
                          </div>
                        )}

                        {activeOrder.status === 'pickup_scanned' && activeWorkflowStep === 3 && (
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-[10.5px] text-text-charcoal bg-bg-linen/50 p-2 rounded-xl">
                              <span className="w-5 h-5 bg-brand-sage text-white rounded-full flex items-center justify-center text-[10px] font-bold">3</span>
                              <span>Capture digital signature approval</span>
                            </div>
                            <button
                              onClick={() => setActiveSignature(true)}
                              type="button"
                              className="w-full py-2.5 bg-brand-sage text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center space-x-2"
                            >
                              <User className="w-4 h-4" />
                              <span>Acquire Digital Signature</span>
                            </button>
                          </div>
                        )}

                        {/* PICKED UP TRANSIT TO LAUNDRY */}
                        {activeOrder.status === 'picked_up' && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-text-charcoal">Prada & Silk garments packed. Proceed to laundry hub.</p>
                            <button
                              onClick={() => onUpdateOrderStatus(activeOrder.id, 'navigating_to_laundry')}
                              type="button"
                              className="w-full py-2.5 bg-brand-sage text-white font-bold text-xs rounded-xl shadow-xs uppercase font-display"
                            >
                              Navigate to Laundry Center
                            </button>
                          </div>
                        )}

                        {activeOrder.status === 'navigating_to_laundry' && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-text-slate">Heading north towards central sterilization hub...</p>
                            <button
                              onClick={handleArrival}
                              type="button"
                              className="w-full py-2.5 border border-brand-sage text-brand-sage font-bold text-xs rounded-xl shadow-xs hover:bg-brand-sage/5 transition-all"
                            >
                              Confirm Central Arrival Drop-off
                            </button>
                          </div>
                        )}

                        {activeOrder.status === 'arrived_at_laundry' && activeWorkflowStep === 1 && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-text-charcoal">Unload raw garments and scan barcodes for validation receipt.</p>
                            <button
                              onClick={() => setActiveScanner(true)}
                              type="button"
                              className="w-full py-2.5 bg-brand-sage text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center space-x-2"
                            >
                              <QrCode className="w-4 h-4" />
                              <span>Verify Drop-off Barcodes</span>
                            </button>
                          </div>
                        )}

                        {activeOrder.status === 'dropped_off' && (
                          <div className="bg-bg-linen/50 p-3 rounded-xl border border-brand-stone text-center space-y-1">
                            <CheckCircle2 className="w-6 h-6 text-status-success mx-auto" />
                            <h4 className="text-xs font-bold text-text-charcoal">Processing active</h4>
                            <p className="text-[10px] text-text-slate">FreshFold artisans are caring for linens now. Check back soon.</p>
                          </div>
                        )}

                        {/* READY FOR DELIVERY FLOW */}
                        {activeOrder.status === 'ready_for_delivery' && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-text-charcoal">Clean, folded garments are sealed in premium boxes. Ready to deliver!</p>
                            <button
                              onClick={() => onUpdateOrderStatus(activeOrder.id, 'navigating_to_delivery')}
                              type="button"
                              className="w-full py-2.5 bg-brand-gold text-white hover:bg-brand-gold/95 font-bold text-xs rounded-xl shadow-xs uppercase font-display"
                            >
                              Navigate to Delivery Destination
                            </button>
                          </div>
                        )}

                        {activeOrder.status === 'navigating_to_delivery' && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-text-slate">Delivering to {activeOrder.customerName}...</p>
                            <button
                              onClick={handleArrival}
                              type="button"
                              className="w-full py-2.5 border border-brand-sage text-brand-sage font-bold text-xs rounded-xl shadow-xs"
                            >
                              Confirm Arrival at Destination
                            </button>
                          </div>
                        )}

                        {/* DELIVERY WORKFLOW STEPS */}
                        {activeOrder.status === 'arrived_at_delivery' && activeWorkflowStep === 1 && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-[10.5px] font-semibold text-text-charcoal">
                              <span>Enter Customer Security OTP</span>
                              <button 
                                onClick={() => {
                                  onSendRiderMessage("Hello, I have arrived outside with your fresh laundry. Your delivery OTP is 7809.");
                                }}
                                className="text-[9px] text-brand-gold underline font-bold"
                              >
                                Request OTP over SMS
                              </button>
                            </div>
                            
                            <div className="flex space-x-2">
                              <input
                                type="text"
                                maxLength={4}
                                value={deliveryOtpInput}
                                onChange={e => setDeliveryOtpInput(e.target.value)}
                                placeholder="4-digit OTP"
                                className="flex-1 p-2 border border-border-soft rounded-lg text-center font-bold tracking-widest text-text-charcoal bg-bg-ivory text-xs focus:outline-none"
                              />
                              <button
                                onClick={handleVerifyDeliveryOtp}
                                className="px-4 bg-brand-sage text-white font-bold text-xs rounded-lg shadow-xs"
                              >
                                Verify OTP
                              </button>
                            </div>
                            {deliveryOtpError && (
                              <p className="text-[9px] text-status-error font-bold">Incorrect pin. Try '7809' or '4019'.</p>
                            )}
                          </div>
                        )}

                        {activeOrder.status === 'arrived_at_delivery' && activeWorkflowStep === 2 && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-text-charcoal">Upload proof of delivery photo (valet hanger or doorman desk)</p>
                            <button
                              onClick={() => setActiveCamera('delivery')}
                              type="button"
                              className="w-full py-2.5 bg-brand-sage text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center space-x-2"
                            >
                              <Camera className="w-4 h-4" />
                              <span>Take Receipt Photo</span>
                            </button>
                          </div>
                        )}

                        {activeOrder.status === 'arrived_at_delivery' && activeWorkflowStep === 3 && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-text-charcoal">Obtain recipient's signature to close delivery liability.</p>
                            <button
                              onClick={() => setActiveSignature(true)}
                              type="button"
                              className="w-full py-2.5 bg-brand-sage text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center space-x-2"
                            >
                              <User className="w-4 h-4" />
                              <span>Collect Drop Signature</span>
                            </button>
                          </div>
                        )}

                      </div>
                    )}

                    {/* INCOMING HIGH-PRIORITY SLIDE-UP REQUEST PANEL */}
                    {rider.isOnline && activeOrder && activeOrder.status === 'unassigned' && (
                      <div className="absolute inset-x-4 bottom-4 bg-white rounded-2xl border border-brand-gold p-4 shadow-2xl z-50 animate-bounce max-w-[340px] mx-auto">
                        <div className="flex justify-between items-center pb-2 border-b border-border-soft">
                          <span className="text-[9px] font-extrabold uppercase font-mono tracking-wider text-brand-gold flex items-center space-x-1">
                            <Sparkles className="w-3 h-3 fill-brand-gold animate-spin" />
                            <span>Premium Incoming Job</span>
                          </span>
                          <span className="text-[9px] text-text-slate font-mono">15s accept timeout</span>
                        </div>

                        <div className="py-3 text-left">
                          <div className="flex justify-between items-center">
                            <h4 className="text-sm font-bold text-text-charcoal font-display">{activeOrder.customerName}</h4>
                            <span className="text-xs font-bold text-brand-sage">GH₵ {activeOrder.price.toFixed(2)}</span>
                          </div>
                          
                          <p className="text-[10px] text-text-slate mt-1 flex items-center space-x-1">
                            <MapPin className="w-3 h-3 text-brand-sage shrink-0" />
                            <span className="truncate">{activeOrder.pickupAddress}</span>
                          </p>
                          <p className="text-[9px] text-text-slate mt-0.5 font-mono">{activeOrder.laundryType} ({activeOrder.bagCount} bags)</p>
                          
                          {activeOrder.specialInstructions && (
                            <p className="text-[8.5px] text-brand-gold italic mt-2 bg-brand-gold/5 p-1.5 rounded-md border border-brand-gold/10 truncate">
                              "{activeOrder.specialInstructions}"
                            </p>
                          )}
                        </div>

                        {/* Accept / Decline buttons */}
                        <div className="flex space-x-2 pt-1">
                          <button
                            onClick={() => onDeclineOrder(activeOrder.id)}
                            className="flex-1 py-2 rounded-xl border border-border-soft text-text-charcoal hover:bg-bg-linen text-xs font-semibold transition-all active:scale-95"
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => onAcceptOrder(activeOrder.id)}
                            className="flex-1 py-2 bg-brand-sage text-white hover:bg-brand-sage/95 text-xs font-bold rounded-xl transition-all active:scale-95 shadow-xs uppercase font-display"
                          >
                            Accept Job
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )}

              {/* TAB 2: ASSIGNMENTS LIST PANEL */}
              {currentTab === 'assignments' && (
                <div className="flex-grow flex flex-col p-4 space-y-4 overflow-y-auto animate-fade-in pt-10" id="assignments-tab-screen">
                  <div className="flex flex-col space-y-1">
                    <h2 className="text-lg font-bold text-text-charcoal font-display leading-tight">My Active Jobs</h2>
                    <p className="text-[10px] text-text-slate">Manage, dispatch, and review active laundry contracts.</p>
                  </div>

                  {/* Search and filter row */}
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search customers or codes..."
                      className="w-full p-2.5 bg-white border border-border-soft rounded-xl text-xs focus:outline-none focus:border-brand-sage shadow-xs"
                    />

                    {/* Filter Pills */}
                    <div className="flex space-x-1.5 overflow-x-auto scrollbar-none pb-1">
                      {[
                        { id: 'all', label: 'All Jobs' },
                        { id: 'upcoming', label: 'Unassigned' },
                        { id: 'active', label: 'Active Tasks' },
                        { id: 'completed', label: 'Completed' }
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setAssignmentFilter(tab.id as any)}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-tight border transition-all ${
                            assignmentFilter === tab.id
                              ? 'bg-brand-sage border-brand-sage text-white'
                              : 'bg-white border-border-soft text-text-slate hover:text-text-charcoal'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Assignments grid */}
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                    {filteredAssignments.length === 0 ? (
                      <div className="text-center py-12 bg-white rounded-2xl border border-border-soft">
                        <Activity className="w-10 h-10 text-brand-stone mx-auto mb-2" />
                        <p className="text-xs font-semibold text-text-charcoal">No Assignments</p>
                        <p className="text-[10px] text-text-slate px-4 mt-0.5">You're all caught up. New pickup requests will appear here.</p>
                      </div>
                    ) : (
                      filteredAssignments.map((order) => (
                        <div 
                          key={order.id} 
                          className="bg-white rounded-2xl border border-border-soft p-4 shadow-xs space-y-3"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center space-x-2">
                                <h3 className="text-xs font-bold text-text-charcoal">{order.customerName}</h3>
                                <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-sm font-bold uppercase ${
                                  order.priority === 'elite' ? 'bg-brand-gold/15 text-brand-gold' : 'bg-brand-sage/10 text-brand-sage'
                                }`}>
                                  {order.priority}
                                </span>
                              </div>
                              <span className="text-[9.5px] font-mono text-brand-gold font-bold">{order.orderNumber}</span>
                            </div>

                            <span className={`text-[9.5px] font-semibold uppercase px-2 py-1 rounded-full ${
                              order.status === 'delivered' ? 'bg-status-success/10 text-status-success' : 
                              order.status === 'unassigned' ? 'bg-brand-stone/30 text-text-slate' :
                              'bg-brand-sage/15 text-brand-sage'
                            }`}>
                              {order.status.replace(/_/g, ' ')}
                            </span>
                          </div>

                          <div className="space-y-1.5 text-[10.5px] text-text-slate">
                            <div className="flex items-center justify-between">
                              <p className="flex items-center space-x-1 font-medium text-text-charcoal truncate">
                                <MapPin className="w-3.5 h-3.5 text-brand-sage shrink-0" />
                                <span className="truncate">Pickup: {order.pickupAddress}</span>
                              </p>
                              <button
                                onClick={() => {
                                  setFocusedOrderIdForMap(order.id);
                                  setCurrentTab('map');
                                }}
                                type="button"
                                className="text-[9px] bg-brand-sage/15 hover:bg-brand-sage/25 text-brand-sage font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 shrink-0 transition-all cursor-pointer ml-1"
                              >
                                <MapPin className="w-2.5 h-2.5" />
                                <span>Precise Pin</span>
                              </button>
                            </div>
                            <p className="flex items-center space-x-1">
                              <Layers2 className="w-3.5 h-3.5 text-brand-sage shrink-0" />
                              <span>{order.laundryType} ({order.bagCount} bags)</span>
                            </p>
                            <p className="text-[9px] font-mono text-text-slate pl-4">
                              GPS: <span className="text-text-charcoal font-semibold">{order.pickupCoords.lat.toFixed(4)}° N, {Math.abs(order.pickupCoords.lng).toFixed(4)}° W</span>
                            </p>
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-border-soft">
                            <div className="text-left">
                              <p className="text-[8px] text-text-slate uppercase tracking-wider font-bold">Payout</p>
                              <p className="text-xs font-bold text-text-charcoal">GH₵ {order.price.toFixed(2)}</p>
                            </div>
                            
                            {order.status === 'unassigned' ? (
                              <button
                                onClick={() => {
                                  onAcceptOrder(order.id);
                                  setCurrentTab('home');
                                }}
                                className="px-3 py-1.5 bg-brand-sage text-white text-[10px] font-bold rounded-lg uppercase tracking-wide shadow-xs active:scale-95"
                              >
                                Accept Payout
                              </button>
                            ) : order.status !== 'delivered' ? (
                              <button
                                onClick={() => {
                                  setCurrentTab('home');
                                }}
                                className="px-3 py-1.5 bg-brand-gold text-white text-[10px] font-bold rounded-lg uppercase tracking-wide shadow-xs active:scale-95"
                              >
                                Go Active Map
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-status-success flex items-center space-x-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Complete</span>
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: FULL SCREEN LIVE MAP COMPASS PANEL */}
              {currentTab === 'map' && (
                <div className="flex-1 flex flex-col relative h-full">
                  <div className="absolute top-4 inset-x-4 flex justify-between items-center z-40 select-none pointer-events-none">
                    <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 border border-border-soft rounded-full shadow-lg flex items-center space-x-2 pointer-events-auto">
                      <Compass className="w-4 h-4 text-brand-sage animate-spin" />
                      <span className="text-[10px] font-bold text-text-charcoal uppercase tracking-widest font-display">Compass Overlay</span>
                    </div>
                  </div>

                  <LiveMap
                    rider={rider}
                    orders={orders}
                    activeOrder={activeOrder}
                    focusedOrderId={focusedOrderIdForMap}
                    onSelectOrder={(ord) => setFocusedOrderIdForMap(ord.id)}
                    onAcceptOrder={onAcceptOrder}
                    onArrived={handleArrival}
                    simulationActive={simulationActive}
                    onSimulationStep={(coords) => onUpdateRider({ coords })}
                  />
                </div>
              )}

              {/* TAB 4: BEAUTIFUL CONCIERGE TIMELINE HISTORY PANEL */}
              {currentTab === 'history' && (
                <div className="flex-grow flex flex-col p-4 space-y-4 overflow-y-auto animate-fade-in pt-10" id="history-tab-screen">
                  <div className="flex flex-col space-y-1">
                    <h2 className="text-lg font-bold text-text-charcoal font-display leading-tight">My Timeline Logs</h2>
                    <p className="text-[10px] text-text-slate">Review historical valet completions and proof photo documents.</p>
                  </div>

                  <div className="space-y-4 flex-1">
                    {orders.filter(o => o.status === 'delivered').length === 0 ? (
                      <div className="text-center py-12 bg-white rounded-2xl border border-border-soft">
                        <HistoryIcon className="w-10 h-10 text-brand-stone mx-auto mb-2" />
                        <p className="text-xs font-semibold text-text-charcoal">No History</p>
                        <p className="text-[10px] text-text-slate px-4 mt-0.5">Your completed deliveries will appear here.</p>
                      </div>
                    ) : (
                      orders.filter(o => o.status === 'delivered').map((order) => (
                        <div key={order.id} className="relative pl-6 border-l border-brand-sage/40 space-y-2">
                          {/* Circle Timeline Marker */}
                          <div className="absolute -left-1.5 top-1 w-3 h-3 bg-brand-sage rounded-full border-2 border-white shadow-xs"></div>
                          
                          <div className="bg-white rounded-2xl border border-border-soft p-3.5 shadow-xs space-y-2">
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-bold text-text-charcoal">{order.customerName}</span>
                              <span className="font-mono text-[9px] text-text-slate">{order.deadline}</span>
                            </div>

                            <p className="text-[10.5px] text-text-slate">{order.pickupAddress}</p>
                            
                            <div className="grid grid-cols-2 gap-2 text-[9px] border-t border-border-soft pt-2">
                              <div>
                                <span className="font-bold uppercase text-text-slate block">Verification Signature</span>
                                <span className="text-status-success font-semibold flex items-center space-x-1 mt-0.5">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Secure Sign</span>
                                </span>
                              </div>

                              {order.deliveryPhoto && (
                                <div>
                                  <span className="font-bold uppercase text-text-slate block">Condition Proof</span>
                                  <img 
                                    src={order.deliveryPhoto} 
                                    alt="Condition" 
                                    className="h-8 w-12 rounded-sm object-cover mt-1 border border-border-soft"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: RIDER PERFORMANCE PROFILE & SETTINGS PANEL */}
              {currentTab === 'profile' && (
                <div className="flex-grow flex flex-col p-4 space-y-4 overflow-y-auto animate-fade-in pt-10" id="profile-tab-screen">
                  {/* Profile Header or Editor */}
                  {isEditingProfile || !rider.name ? (
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        onUpdateRider({
                          name: editName,
                          employeeId: editEmployeeId,
                          vehicle: editVehicle,
                          vehiclePlate: editVehiclePlate,
                          avatar: editAvatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200"
                        });
                        setIsEditingProfile(false);
                      }}
                      className="bg-white rounded-2xl border border-border-soft p-4 shadow-xs space-y-3"
                    >
                      <h4 className="text-xs font-bold uppercase tracking-wider text-text-charcoal font-display">Setup Driver Profile</h4>
                      
                      <div className="space-y-1">
                        <label className="text-[8px] uppercase font-bold text-text-slate block">Full Name</label>
                        <input
                          type="text"
                          required
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="e.g. Emmanuel Boateng"
                          className="w-full p-2 border border-border-soft rounded-lg text-xs focus:outline-none focus:border-brand-sage bg-bg-ivory text-text-charcoal"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[8px] uppercase font-bold text-text-slate block">Employee ID</label>
                        <input
                          type="text"
                          required
                          value={editEmployeeId}
                          onChange={e => setEditEmployeeId(e.target.value)}
                          placeholder="e.g. RIDER-9051"
                          className="w-full p-2 border border-border-soft rounded-lg text-xs focus:outline-none focus:border-brand-sage bg-bg-ivory text-text-charcoal"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[8px] uppercase font-bold text-text-slate block">Vehicle Type</label>
                        <input
                          type="text"
                          required
                          value={editVehicle}
                          onChange={e => setEditVehicle(e.target.value)}
                          placeholder="e.g. Royal Electric Delivery Scooter"
                          className="w-full p-2 border border-border-soft rounded-lg text-xs focus:outline-none focus:border-brand-sage bg-bg-ivory text-text-charcoal"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[8px] uppercase font-bold text-text-slate block">Vehicle License Plate</label>
                        <input
                          type="text"
                          required
                          value={editVehiclePlate}
                          onChange={e => setEditVehiclePlate(e.target.value)}
                          placeholder="e.g. AS-3012-26"
                          className="w-full p-2 border border-border-soft rounded-lg text-xs focus:outline-none focus:border-brand-sage bg-bg-ivory text-text-charcoal"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[8px] uppercase font-bold text-text-slate block">Avatar URL (Optional)</label>
                        <input
                          type="text"
                          value={editAvatar}
                          onChange={e => setEditAvatar(e.target.value)}
                          placeholder="e.g. https://images.unsplash.com/photo-..."
                          className="w-full p-2 border border-border-soft rounded-lg text-xs focus:outline-none focus:border-brand-sage bg-bg-ivory text-text-charcoal"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2 bg-brand-sage hover:bg-brand-sage/95 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all active:scale-98"
                      >
                        Save Rider Profile
                      </button>
                    </form>
                  ) : (
                    <div className="bg-white rounded-2xl border border-border-soft p-4 shadow-xs flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <img
                          src={rider.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200"}
                          alt={rider.name || "Rider"}
                          className="w-16 h-16 rounded-full border-2 border-brand-sage object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <h3 className="text-sm font-bold text-text-charcoal font-display">{rider.name}</h3>
                          <p className="text-[10px] text-text-slate">Vehicle: {rider.vehicle}</p>
                          <p className="text-[9.5px] text-text-slate font-mono uppercase bg-bg-linen/80 px-1.5 py-0.5 rounded-sm inline-block mt-1 font-bold">Plate: {rider.vehiclePlate}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setIsEditingProfile(true)}
                        type="button"
                        className="p-1 px-2.5 border border-border-soft text-[10px] font-bold text-text-charcoal hover:bg-bg-ivory rounded-lg transition-all"
                      >
                        Edit
                      </button>
                    </div>
                  )}

                  {/* PERFORMANCE KPI STATS BLOCK */}
                  <div className="bg-white rounded-2xl border border-border-soft p-4 shadow-xs space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-charcoal font-display flex items-center space-x-1">
                      <Star className="w-4 h-4 text-brand-gold fill-brand-gold" />
                      <span>Rider Metrics Profile</span>
                    </h3>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-2 bg-bg-ivory rounded-xl border border-border-soft text-center">
                        <p className="text-[8px] font-bold uppercase text-text-slate">Rider Rating</p>
                        <h4 className="text-sm font-extrabold text-text-charcoal font-display mt-0.5 flex items-center justify-center space-x-1">
                          <span>{rider.rating}</span>
                          <Star className="w-3 h-3 text-brand-gold fill-brand-gold" />
                        </h4>
                      </div>

                      <div className="p-2 bg-bg-ivory rounded-xl border border-border-soft text-center">
                        <p className="text-[8px] font-bold uppercase text-text-slate">On-Time %</p>
                        <h4 className="text-sm font-extrabold text-text-charcoal font-display mt-0.5">{rider.onTimeRate}%</h4>
                      </div>

                      <div className="p-2 bg-bg-ivory rounded-xl border border-border-soft text-center">
                        <p className="text-[8px] font-bold uppercase text-text-slate">Acceptance Rate</p>
                        <h4 className="text-sm font-extrabold text-text-charcoal font-display mt-0.5">{rider.acceptanceRate}%</h4>
                      </div>

                      <div className="p-2 bg-bg-ivory rounded-xl border border-border-soft text-center">
                        <p className="text-[8px] font-bold uppercase text-text-slate">Completion rate</p>
                        <h4 className="text-sm font-extrabold text-text-charcoal font-display mt-0.5">{rider.completionRate}%</h4>
                      </div>
                    </div>
                  </div>

                  {/* SETTINGS DETAILS */}
                  <div className="bg-white rounded-2xl border border-border-soft p-4 shadow-xs space-y-2 text-xs">
                    <h4 className="text-[10px] uppercase font-bold text-text-slate tracking-widest border-b border-border-soft pb-1.5">App Configuration</h4>
                    
                    <div className="flex justify-between items-center py-1.5 border-b border-border-soft">
                      <span>Live Geolocation Tracking</span>
                      <span className="text-status-success font-bold font-mono">ACTIVE</span>
                    </div>

                    <div className="flex justify-between items-center py-1.5 border-b border-border-soft">
                      <span>Biometric Face ID Lock</span>
                      <button 
                        type="button"
                        onClick={() => setIsBiometricRegistered(!isBiometricRegistered)}
                        className={`px-2.5 py-1 text-[9px] font-bold rounded-full transition-all cursor-pointer ${
                          isBiometricRegistered ? 'bg-brand-sage text-white shadow-xs' : 'bg-border-soft text-text-slate'
                        }`}
                      >
                        {isBiometricRegistered ? 'ENABLED ✓' : 'DISABLED'}
                      </button>
                    </div>

                    <div className="flex justify-between items-center py-1.5 border-b border-border-soft">
                      <span>Offline Caching Engine</span>
                      <span className="text-text-slate font-bold font-mono">STANDBY</span>
                    </div>

                    <div className="flex justify-between items-center py-1.5">
                      <span>Operational Shifts</span>
                      <span className="text-brand-sage font-bold font-mono">08:00 - 22:00</span>
                    </div>
                  </div>

                  {/* FACE ID TEST LOCK BUTTON */}
                  {isBiometricRegistered && (
                    <button
                      onClick={() => {
                        setCurrentScreen('auth');
                      }}
                      type="button"
                      className="w-full py-2.5 bg-brand-sage/10 hover:bg-brand-sage/20 border border-brand-sage/30 text-brand-sage font-bold text-xs rounded-xl tracking-wide uppercase transition-all active:scale-98 shadow-xs flex items-center justify-center space-x-2"
                    >
                      <User className="w-4 h-4" />
                      <span>Lock Console & Test Face ID</span>
                    </button>
                  )}

                  {/* LOGOUT CONTROL */}
                  <button
                    onClick={() => {
                      onUpdateRider({ isOnline: false });
                      setCurrentScreen('auth');
                    }}
                    type="button"
                    className="w-full py-3 border border-status-error/30 hover:bg-status-error/5 text-status-error font-bold text-xs rounded-xl tracking-wide uppercase transition-all active:scale-98 shadow-xs"
                  >
                    Logout from Scooter Console
                  </button>
                </div>
              )}

              {/* BOTTOM FLOATING FLOATING APP NAVIGATION BAR */}
              <div className="bg-white/95 backdrop-blur-md border-t border-border-soft py-3 px-6 flex justify-between items-center z-30 select-none">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('home');
                    setIsInsideChat(false);
                  }}
                  className={`flex flex-col items-center space-y-1 transition-colors ${currentTab === 'home' ? 'text-brand-sage' : 'text-text-slate hover:text-text-charcoal'}`}
                >
                  <Home className="w-4 h-4" />
                  <span className="text-[9px] font-bold">Home</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('assignments');
                    setIsInsideChat(false);
                  }}
                  className={`flex flex-col items-center space-y-1 transition-colors ${currentTab === 'assignments' ? 'text-brand-sage' : 'text-text-slate hover:text-text-charcoal'}`}
                >
                  <Layers className="w-4 h-4" />
                  <span className="text-[9px] font-bold">Tasks</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('map');
                    setIsInsideChat(false);
                  }}
                  className={`flex flex-col items-center space-y-1 transition-colors ${currentTab === 'map' ? 'text-brand-sage' : 'text-text-slate hover:text-text-charcoal'}`}
                >
                  <Map className="w-4 h-4" />
                  <span className="text-[9px] font-bold">Map</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('history');
                    setIsInsideChat(false);
                  }}
                  className={`flex flex-col items-center space-y-1 transition-colors ${currentTab === 'history' ? 'text-brand-sage' : 'text-text-slate hover:text-text-charcoal'}`}
                >
                  <HistoryIcon className="w-4 h-4" />
                  <span className="text-[9px] font-bold">History</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('profile');
                    setIsInsideChat(false);
                  }}
                  className={`flex flex-col items-center space-y-1 transition-colors ${currentTab === 'profile' ? 'text-brand-sage' : 'text-text-slate hover:text-text-charcoal'}`}
                >
                  <User className="w-4 h-4" />
                  <span className="text-[9px] font-bold">Profile</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Home Screen indicator bar (Hidden on true mobile viewports to prevent layout clashes) */}
        <div className="absolute bottom-1.5 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-neutral-800 rounded-full z-50 hidden md:block"></div>
      </div>
    </div>
  );
}
