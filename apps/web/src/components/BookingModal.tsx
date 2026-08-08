import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, MapPin, Sparkles, MessageSquare, Clock, ShieldCheck, CheckCircle, Smartphone, CreditCard, Wallet, Banknote, Lock, CheckCircle2, QrCode } from 'lucide-react';
import { Booking } from '../types';
import * as store from '../services/store';
import { SERVICES } from '../data';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedService?: string;
  onBookingCreated: (booking: Booking) => void;
}

export default function BookingModal({ isOpen, onClose, preselectedService = '', onBookingCreated }: BookingModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [suburb, setSuburb] = useState('');
  const [city, setCity] = useState('');
  const [service, setService] = useState(SERVICES[0]?.name || 'Washing (Machine & Hand Wash)');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTimeSlot, setPickupTimeSlot] = useState('08:00 AM - 11:00 AM (Morning Concierge)');
  const [specialScent, setSpecialScent] = useState('Organic Lavender');
  const [starchLevel, setStarchLevel] = useState('None');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [riderNote, setRiderNote] = useState('');

  // Payment states
  const [paymentMethod, setPaymentMethod] = useState<'Paystack' | 'MTN MoMo' | 'Telecel Cash' | 'AT Money' | 'Card' | 'Wallet' | 'Pay on Pickup'>('Paystack');
  const [momoNumber, setMomoNumber] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [momoPromptActive, setMomoPromptActive] = useState(false);
  const [momoPin, setMomoPin] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  const [walletBalance, setWalletBalance] = useState(150); // GHS wallet balance demo

  // Paystack states
  const [paystackLoading, setPaystackLoading] = useState(false);
  const [paystackAuthUrl, setPaystackAuthUrl] = useState('');
  const [paystackRef, setPaystackRef] = useState('');
  const [paystackError, setPaystackError] = useState('');

  const handlePaystackInit = async () => {
    setPaystackLoading(true);
    setPaystackError('');
    try {
      const userEmail = email || (loggedInUser?.email) || 'patron@freshfold.com';
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          amount: estimatedPrice,
          metadata: {
            customer_name: name || 'Patron',
            phone: phone,
            service: service,
          }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.error || 'Failed to initialize Paystack checkout.');
      }
      setPaystackAuthUrl(data.authorization_url);
      setPaystackRef(data.reference);
      setTransactionRef(data.reference);
      
      // Open Paystack authorization URL
      window.open(data.authorization_url, '_blank', 'width=600,height=750');
    } catch (err: any) {
      setPaystackError(err.message || 'Error connecting to Paystack payment gateway.');
    } finally {
      setPaystackLoading(false);
    }
  };

  const handlePaystackVerify = async () => {
    if (!paystackRef) return;
    setPaystackLoading(true);
    setPaystackError('');
    try {
      const res = await fetch(`/api/paystack/verify/${encodeURIComponent(paystackRef)}`);
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.error || 'Paystack payment verification failed.');
      }
      if (data.data && data.data.status === 'success') {
        setIsPaid(true);
        setTransactionRef(data.data.reference || paystackRef);
        alert('Paystack payment verified successfully!');
      } else {
        alert(`Paystack transaction status: ${data.data?.status || 'pending'}. Please complete payment on Paystack checkout and try again.`);
      }
    } catch (err: any) {
      setPaystackError(err.message || 'Error verifying Paystack payment.');
    } finally {
      setPaystackLoading(false);
    }
  };
  
  // Estimate calculations
  const [estimatedPrice, setEstimatedPrice] = useState(35);
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [loggedInUser, setLoggedInUser] = useState<any | null>(null);

  // Check for active logged in session on open and pre-fill credentials & logistics
  useEffect(() => {
    if (isOpen) {
      try {
        const user = store.readCurrentUser();
        if (user) {
          setLoggedInUser(user);
          setName(user.name || '');
          setEmail(user.email || '');
          setPhone(user.phone || '');

          // Look for past bookings under this email or phone to pre-fill address, city, suburb
          const allBookings: Booking[] = store.readBookings();
          const matched = allBookings.filter(
            b => 
              (b.email && user.email && b.email.toLowerCase() === user.email.toLowerCase()) || 
              (b.phone && user.phone && b.phone.replace(/[\s-+]/g, '') === user.phone.replace(/[\s-+]/g, ''))
          );
          if (matched.length > 0) {
            // Sort by createdAt descending to get the most recent one
            matched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const latest = matched[0];
            if (latest.address) setAddress(latest.address);
            if (latest.suburb) setSuburb(latest.suburb);
            if (latest.city) setCity(latest.city);
          }
        } else {
          setLoggedInUser(null);
          setName('');
          setEmail('');
          setPhone('');
          setAddress('');
          setSuburb('');
          setCity('');
        }
      } catch (e) {
        console.warn('Could not read existing session state for booking prefill', e);
      }
    }
  }, [isOpen]);

  // Sync preselected services on open
  useEffect(() => {
    if (preselectedService) {
      setService(preselectedService);
    }
  }, [preselectedService, isOpen]);

  // Dynamically estimate prices for a high-end feel
  useEffect(() => {
    let basePrice = 25;
    if (service.includes('Washing')) basePrice = 30;
    else if (service.includes('Bed Sheets') || service.includes('Linen')) basePrice = 45;
    else if (service.includes('Executive') || service.includes('Pro') || service.includes('Premium')) basePrice = 55;
    else if (service.includes('Express') || service.includes('Same-Day')) basePrice = 50;
    else if (service.includes('Car Detailing') || service.includes('Detailing')) basePrice = 150;
    else if (service.includes('Home & Office') || service.includes('Office Cleaning')) basePrice = 180;
    else if (service.includes('Sofa & Carpet') || service.includes('Carpet Cleaning')) basePrice = 90;
    else if (service.includes('Fast Pickup') || service.includes('Pickup & Delivery')) basePrice = 0; // Complimentary

    if (specialScent !== 'Fragrance-Free' && !service.includes('Car Detailing') && !service.includes('Home & Office') && !service.includes('Sofa & Carpet')) {
      basePrice += 5;
    }
    if (starchLevel !== 'None' && !service.includes('Car Detailing') && !service.includes('Home & Office') && !service.includes('Sofa & Carpet')) {
      basePrice += 5;
    }
    setEstimatedPrice(basePrice);
  }, [service, specialScent, starchLevel]);

  // Set default tomorrow date on open
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    setPickupDate(tomorrowStr);
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !address || !pickupDate) {
      alert('Please fill out all required physical details to coordinate transport.');
      return;
    }

    if (paymentMethod === 'Wallet' && walletBalance < estimatedPrice) {
      alert(`Insufficient wallet balance (₵${walletBalance}.00 GHS). Please select Mobile Money or Card to complete your booking.`);
      return;
    }

    // Standard 24h layout delivery schedule
    const delivDate = new Date(pickupDate);
    delivDate.setDate(delivDate.getDate() + 1);
    const deliveryDateStr = delivDate.toISOString().split('T')[0];

    const isNowPaid = isPaid || paymentMethod === 'Wallet';
    const finalTxnRef = isNowPaid 
      ? (transactionRef || 'TXN-' + Math.floor(100000 + Math.random() * 900000))
      : undefined;

    const newBooking: Booking = {
      id: 'FFC-' + Math.floor(100000 + Math.random() * 900000),
      name,
      email: email || 'patron@freshfold.com',
      phone,
      serviceType: service,
      pickupDate,
      pickupTime: pickupTimeSlot,
      deliveryDate: deliveryDateStr,
      specialInstructions: `${specialScent} scent, ${starchLevel} starch. ${specialInstructions}`,
      riderNote: riderNote.trim() || undefined,
      address,
      city: city || 'Boutique Care District',
      suburb,
      status: 'Scheduled',
      createdAt: new Date().toISOString(),
      paymentStatus: isNowPaid ? 'Paid' : (paymentMethod === 'Pay on Pickup' ? 'Pay on Pickup' : 'Pending'),
      paymentMethod,
      amount: estimatedPrice,
      momoNumber: (paymentMethod.includes('MoMo') || paymentMethod.includes('Cash') || paymentMethod.includes('AT')) ? (momoNumber || phone) : undefined,
      momoNetwork: paymentMethod === 'MTN MoMo' ? 'MTN' : paymentMethod === 'Telecel Cash' ? 'Telecel' : paymentMethod === 'AT Money' ? 'AT' : undefined,
      transactionRef: finalTxnRef,
      paidAt: isNowPaid ? new Date().toISOString() : undefined
    };

    // If wallet was used, deduct balance
    if (paymentMethod === 'Wallet') {
      setWalletBalance(prev => Math.max(0, prev - estimatedPrice));
    }

    // Hand the booking to the dispatch server. It derives the pickup pin, bag
    // manifest and priority, and the job appears on the rider app's board.
    store.createBooking(newBooking);

    // Callback
    onBookingCreated(newBooking);
    setCreatedBooking(newBooking);
    setIsSuccess(true);
  };

  // Compile WhatsApp redirect URL based on form data
  const triggerWhatsAppRedirect = () => {
    if (!createdBooking) return;
    const trackingLink = `${window.location.origin}${window.location.pathname}#portal?bookingId=${createdBooking.id}&setup=true`;
    const formatMsg = `Hi FreshFold Laundry Co.! I would like to confirm my premium clothing pickup:
• Booking ID: ${createdBooking.id}
• Patron: ${createdBooking.name}
• Fabric Treatment: ${createdBooking.serviceType}
• Pickup: ${createdBooking.pickupDate} @ ${createdBooking.pickupTime}
• Scent: ${specialScent}
• Delivery: ${createdBooking.deliveryDate}
• Surcharges Estimate: ₵${estimatedPrice}.00 GHS
• Address: ${createdBooking.address}, ${createdBooking.suburb}${createdBooking.riderNote ? `\n• Note for Rider: ${createdBooking.riderNote}` : ''}
• Access Patron Portal to Setup password & Track live: ${trackingLink}`;
    
    const encoded = encodeURIComponent(formatMsg);
    window.open(`https://wa.me/233257880675?text=${encoded}`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-brand-charcoal/90 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Dialog Frame - Curved block container matching the premium theme */}
      <div className="relative w-full max-w-2xl bg-[#0C0C0C] rounded-2xl border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden z-10 text-left">
        
        {/* Modal Brand Border Line */}
        <div className="h-1.5 bg-brand-sage" />

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-left">
            <span className="font-mono text-[9px] tracking-[0.25em] text-brand-sage uppercase font-bold">
              Secure Scheduling Engine
            </span>
            <h3 className="font-serif text-lg text-white font-medium">
              Schedule Garment Concierge Pickup
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.form 
              key="booking-form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6 space-y-5 max-h-[80vh] overflow-y-auto"
            >
              
              {/* Form segment - Personal Credentials */}
              <div className="space-y-3">
                <h4 className="font-sans text-[10px] uppercase tracking-wider text-stone-500 font-bold">
                  01. Patron Credentials
                </h4>
                {loggedInUser ? (
                  <div className="bg-[#161616]/70 border border-brand-sage/20 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center space-x-3.5 text-left">
                      <div className="p-2.5 rounded-lg bg-brand-sage/10 text-brand-sage border border-brand-sage/20 shrink-0">
                        <ShieldCheck className="w-5 h-5 text-brand-sage" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-xs font-semibold text-white uppercase tracking-wider">{loggedInUser.name}</span>
                          <span className="text-[7.5px] tracking-widest uppercase bg-brand-sage/20 text-brand-sage px-1.5 py-0.5 rounded border border-brand-sage/30 font-mono font-black">
                            Portal Patron Linked
                          </span>
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                          {loggedInUser.email} • {loggedInUser.phone}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[7.5px] text-stone-500 uppercase font-mono tracking-[0.15em] block">Status: Verified</span>
                      <span className="text-[9.5px] text-brand-sage font-sans font-light">Credentials locked</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Paapa Cobbold"
                          className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                          Phone Number (for Courier SMS) *
                        </label>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. +233 000 000 000"
                          className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. PCobbold@yahoo.com"
                        className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Form segment - Pickup Logistics */}
              <div className="space-y-3 pt-2">
                <h4 className="font-sans text-[10px] uppercase tracking-wider text-stone-500 font-bold">
                  02. Transit Logistics
                </h4>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                    Contactless Doorstep / Locker Pickup Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Victory Towers Hostel (Tabua's Court)"
                    className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Suburb *
                    </label>
                    <input
                      type="text"
                      required
                      value={suburb}
                      onChange={(e) => setSuburb(e.target.value)}
                      placeholder="e.g. Ayeduase"
                      className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      City
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Kumasi"
                      className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                    />
                  </div>
                </div>

                {/* Short note for the rider */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Short Note for Courier Rider (Optional)</span>
                    <span className="text-[9.5px] font-mono text-brand-gold uppercase tracking-wider font-semibold">Courier Navigation Tip</span>
                  </label>
                  <textarea
                    rows={2}
                    value={riderNote}
                    onChange={(e) => setRiderNote(e.target.value)}
                    placeholder="e.g. Call when outside hostel gate, ask for Kwame, leave with security at reception, or door 4B."
                    className="w-full bg-[#161616] text-white placeholder-[#8E9299]/40 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors resize-none"
                  />
                </div>
              </div>

              {/* Form segment - Fabric Selection and custom variables */}
              <div className="space-y-3 pt-2">
                <h4 className="font-sans text-[10px] uppercase tracking-wider text-stone-500 font-bold">
                  03. Garment specifications & Scent matching
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Primary Service Treatment
                    </label>
                    <select
                      value={service}
                      onChange={(e) => setService(e.target.value)}
                      className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors text-left"
                    >
                      {SERVICES.map((srv) => (
                        <option key={srv.id} value={srv.name}>
                          {srv.name} ({srv.priceInfo})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Earthy Essential Oil Scent
                    </label>
                    <select
                      value={specialScent}
                      onChange={(e) => setSpecialScent(e.target.value)}
                      className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors text-left"
                    >
                      <option value="Organic Lavender">Organic Lavender (+ ₵5.00)</option>
                      <option value="Bespoke Eucalyptus & Tea-Tree">Bespoke Eucalyptus & Tea-Tree (+ ₵5.00)</option>
                      <option value="Fragrance-Free (Pure Hypoallergenic Soap)">Fragrance-Free (Pure Organic Soap)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Urgency Timeline
                    </label>
                    <input
                      type="date"
                      required
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Pickup Window Timeslot
                    </label>
                    <select
                      value={pickupTimeSlot}
                      onChange={(e) => setPickupTimeSlot(e.target.value)}
                      className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors text-left"
                    >
                      <option value="08:00 AM - 11:00 AM (Morning Concierge)">08:00 AM - 11:00 AM (Morning Concierge)</option>
                      <option value="12:00 PM - 03:00 PM (Afternoon Transit)">12:00 PM - 03:00 PM (Afternoon Transit)</option>
                      <option value="05:30 PM - 08:30 PM (Sunset Concierge)">05:30 PM - 08:30 PM (Sunset Concierge)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Starch Level Treatment (Ironed items)
                    </label>
                    <div className="flex gap-2.5">
                      {['None', 'Light', 'Medium'].map((starch) => (
                        <button
                          type="button"
                          key={starch}
                          onClick={() => setStarchLevel(starch)}
                          className={`flex-1 py-2 text-xs rounded-xl border cursor-pointer transition-all duration-300 ${
                            starchLevel === starch
                              ? 'bg-brand-sage border-brand-sage text-white font-bold'
                              : 'bg-[#161616] border-white/10 text-[#8E9299] hover:text-white'
                          }`}
                        >
                          {starch}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Special Garment instructions ?
                    </label>
                    <input
                      type="text"
                      value={specialInstructions}
                      onChange={(e) => setSpecialInstructions(e.target.value)}
                      placeholder="e.g. Leave bag inside locker 12, code 1902"
                      className="w-full bg-[#161616] text-white placeholder-[#8E9299]/40 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Form segment - 04. Payment Method Integration */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <h4 className="font-sans text-[10px] uppercase tracking-wider text-stone-500 font-bold flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-brand-sage" />
                    <span>04. Payment Settlement & Guarantee</span>
                  </h4>
                  {isPaid ? (
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg font-mono font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> PAID ON-THE-FLY ({transactionRef})
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-mono text-brand-gold uppercase tracking-wider">
                      Ghana MoMo & Cards Supported
                    </span>
                  )}
                </div>

                {/* Payment Option Selector Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('Paystack'); setIsPaid(false); }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'Paystack'
                        ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-lg'
                        : 'bg-[#161616] border-white/10 text-stone-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                      <span className="text-[7.5px] bg-emerald-500/20 text-emerald-400 font-mono px-1 rounded font-bold uppercase">Online</span>
                    </div>
                    <div>
                      <p className="font-bold text-[11px] leading-tight text-emerald-400">Paystack</p>
                      <p className="text-[8.5px] text-stone-400 font-mono">MoMo & Cards</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('MTN MoMo'); setIsPaid(false); }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'MTN MoMo' || paymentMethod === 'Telecel Cash' || paymentMethod === 'AT Money'
                        ? 'bg-brand-sage/15 border-brand-sage text-white'
                        : 'bg-[#161616] border-white/10 text-stone-400 hover:text-white'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-brand-sage mb-1.5" />
                    <div>
                      <p className="font-bold text-[11px] leading-tight">Mobile Money</p>
                      <p className="text-[8.5px] text-stone-400 font-mono">Direct MoMo</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('Card'); setIsPaid(false); }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'Card'
                        ? 'bg-brand-sage/15 border-brand-sage text-white'
                        : 'bg-[#161616] border-white/10 text-stone-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-brand-sage mb-1.5" />
                    <div>
                      <p className="font-bold text-[11px] leading-tight">Bank Card</p>
                      <p className="text-[8.5px] text-stone-400 font-mono">Visa / Mastercard</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('Wallet'); setIsPaid(true); }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'Wallet'
                        ? 'bg-brand-sage/15 border-brand-sage text-white'
                        : 'bg-[#161616] border-white/10 text-stone-400 hover:text-white'
                    }`}
                  >
                    <Wallet className="w-4 h-4 text-brand-gold mb-1.5" />
                    <div>
                      <p className="font-bold text-[11px] leading-tight">Patron Wallet</p>
                      <p className="text-[8.5px] text-brand-gold font-mono">Bal: ₵{walletBalance}.00</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('Pay on Pickup'); setIsPaid(false); }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between col-span-2 sm:col-span-1 ${
                      paymentMethod === 'Pay on Pickup'
                        ? 'bg-brand-sage/15 border-brand-sage text-white'
                        : 'bg-[#161616] border-white/10 text-stone-400 hover:text-white'
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-amber-400 mb-1.5" />
                    <div>
                      <p className="font-bold text-[11px] leading-tight">Pay on Pickup</p>
                      <p className="text-[8.5px] text-stone-400 font-mono">Cash/Rider</p>
                    </div>
                  </button>
                </div>

                {/* Sub-Panel for Paystack Online Gateway */}
                {paymentMethod === 'Paystack' && (
                  <div className="bg-[#161616] p-4 rounded-xl border border-emerald-500/30 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                          Paystack Ghana Live Gateway
                        </span>
                      </div>
                      <span className="text-[9.5px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold">
                        MTN • Telecel • AT • Cards
                      </span>
                    </div>

                    <p className="text-xs text-stone-300">
                      Amount to settle via Paystack: <strong className="text-emerald-400 font-mono font-bold">₵{estimatedPrice}.00 GHS</strong>
                    </p>

                    {paystackError && (
                      <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-xs font-mono">
                        ⚠️ {paystackError}
                      </div>
                    )}

                    {!isPaid ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={handlePaystackInit}
                          disabled={paystackLoading}
                          className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2"
                        >
                          <Lock className="w-4 h-4 text-white" />
                          <span>{paystackLoading ? 'Connecting to Paystack...' : `Pay ₵${estimatedPrice}.00 GHS via Paystack`}</span>
                        </button>

                        {paystackAuthUrl && (
                          <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-2 text-left">
                            <p className="text-[11px] text-stone-300 font-mono">
                              Checkout page opened! If pop-up was blocked, click below:
                            </p>
                            <a
                              href={paystackAuthUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block text-xs font-bold text-emerald-400 underline font-mono break-all"
                            >
                              Open Paystack Checkout Link ↗
                            </a>
                            <div className="pt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={handlePaystackVerify}
                                disabled={paystackLoading}
                                className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-mono font-bold hover:bg-emerald-500/30 transition-all cursor-pointer"
                              >
                                {paystackLoading ? 'Checking...' : 'Verify Paystack Payment'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsPaid(true)}
                                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-stone-300 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer"
                              >
                                Mark Paid
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 font-mono">
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
                        <span>Paystack Payment Approved ({transactionRef})</span>
                      </div>
                    )}
                  </div>
                )}


                {/* Sub-Panel for Mobile Money Details */}
                {(paymentMethod === 'MTN MoMo' || paymentMethod === 'Telecel Cash' || paymentMethod === 'AT Money') && (
                  <div className="bg-[#161616] p-4 rounded-xl border border-white/10 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-stone-300 uppercase tracking-wider">
                        Select MoMo Provider Network:
                      </span>
                      <div className="flex gap-1.5">
                        {(['MTN MoMo', 'Telecel Cash', 'AT Money'] as const).map(net => (
                          <button
                            key={net}
                            type="button"
                            onClick={() => setPaymentMethod(net)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all border ${
                              paymentMethod === net
                                ? 'bg-brand-gold text-black border-brand-gold'
                                : 'bg-black/50 text-stone-400 border-white/10 hover:text-white'
                            }`}
                          >
                            {net.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={momoNumber || phone}
                        onChange={(e) => setMomoNumber(e.target.value)}
                        placeholder="e.g. 0244 123 456"
                        className="flex-1 bg-black text-white text-xs p-3 rounded-xl border border-white/10 focus:border-brand-sage focus:outline-none font-mono"
                      />
                      {!isPaid ? (
                        <button
                          type="button"
                          onClick={() => setMomoPromptActive(true)}
                          className="px-4 py-3 bg-brand-gold text-black rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-yellow-400 transition-all flex items-center gap-1.5 shrink-0"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Trigger USSD Prompt</span>
                        </button>
                      ) : (
                        <div className="px-4 py-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Payment Approved</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-stone-400 font-sans">
                      Click <strong className="text-brand-gold">Trigger USSD Prompt</strong> to simulate receiving the Mobile Money authorization pop-up on your phone.
                    </p>
                  </div>
                )}

                {/* Sub-Panel for Card Details */}
                {paymentMethod === 'Card' && (
                  <div className="bg-[#161616] p-4 rounded-xl border border-white/10 space-y-3">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-semibold uppercase text-stone-400 tracking-wider">
                        Card Number (Visa / Mastercard)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="4532 •••• •••• 8892"
                          className="w-full bg-black text-white text-xs p-3 pl-9 rounded-xl border border-white/10 focus:border-brand-sage focus:outline-none font-mono"
                        />
                        <CreditCard className="w-4 h-4 text-stone-500 absolute left-3 top-3.5" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase text-stone-400 tracking-wider mb-1">
                          Expiry
                        </label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="w-full bg-black text-white text-xs p-3 rounded-xl border border-white/10 focus:border-brand-sage focus:outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase text-stone-400 tracking-wider mb-1">
                          CVV Security
                        </label>
                        <input
                          type="password"
                          maxLength={3}
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          placeholder="•••"
                          className="w-full bg-black text-white text-xs p-3 rounded-xl border border-white/10 focus:border-brand-sage focus:outline-none font-mono"
                        />
                      </div>
                    </div>
                    {!isPaid ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsPaid(true);
                          setTransactionRef('TXN-CARD-' + Math.floor(100000 + Math.random() * 900000));
                        }}
                        className="w-full py-2.5 bg-brand-sage text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-brand-sage-light transition-all flex items-center justify-center gap-1.5"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Authorize Card Payment ₵{estimatedPrice}.00 GHS</span>
                      </button>
                    ) : (
                      <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold uppercase tracking-wider text-center flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Card Payment Authorized ({transactionRef})</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-Panel for Wallet */}
                {paymentMethod === 'Wallet' && (
                  <div className="bg-[#161616] p-4 rounded-xl border border-brand-gold/30 space-y-2 text-left">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-stone-300 font-medium">FreshFold Digital Wallet Balance:</span>
                      <span className="font-mono font-bold text-brand-gold">₵{walletBalance}.00 GHS</span>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-white/10">
                      <span className="text-stone-400">Amount to deduct:</span>
                      <span className="font-mono font-bold text-brand-sage">- ₵{estimatedPrice}.00 GHS</span>
                    </div>
                    <p className="text-[10px] text-stone-400 pt-1">
                      Payment will be automatically debited from your patron wallet balance on confirmation.
                    </p>
                  </div>
                )}
              </div>

              {/* Interactive MoMo USSD Prompt Modal Overlay */}
              <AnimatePresence>
                {momoPromptActive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
                  >
                    <div className="bg-[#1c1c1c] border-2 border-brand-gold rounded-2xl max-w-sm w-full p-6 text-left space-y-4 shadow-2xl relative">
                      <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                        <div className="w-10 h-10 rounded-full bg-brand-gold/20 flex items-center justify-center text-brand-gold font-bold">
                          📲
                        </div>
                        <div>
                          <p className="font-mono text-[10px] text-brand-gold uppercase tracking-wider font-extrabold">Simulated USSD Prompt (*170#)</p>
                          <p className="font-bold text-white text-sm">{paymentMethod} Payment Request</p>
                        </div>
                      </div>

                      <div className="bg-black/80 p-3 rounded-xl border border-white/10 text-xs font-mono text-stone-300 space-y-1.5">
                        <p className="text-brand-sage font-bold">FreshFold Garment Concierge</p>
                        <p>Merchant ID: 882910</p>
                        <p>Amount: <strong className="text-brand-gold">₵{estimatedPrice}.00 GHS</strong></p>
                        <p>Subscriber: {momoNumber || phone || '0244123456'}</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[11px] text-stone-400 font-semibold">
                          Enter 4-Digit Mobile Money PIN to Approve:
                        </label>
                        <input
                          type="password"
                          maxLength={4}
                          value={momoPin}
                          onChange={(e) => setMomoPin(e.target.value)}
                          placeholder="••••"
                          className="w-full bg-black text-brand-gold text-center text-lg tracking-widest p-2.5 rounded-xl border border-brand-gold/40 focus:outline-none font-mono"
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setMomoPromptActive(false)}
                          className="flex-1 py-2.5 bg-white/10 text-stone-300 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-white/20"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!momoPin || momoPin.length < 4) {
                              alert('Please enter your 4-digit MoMo PIN to simulate approval.');
                              return;
                            }
                            setIsPaid(true);
                            setTransactionRef('TXN-MOMO-' + Math.floor(100000 + Math.random() * 900000));
                            setMomoPromptActive(false);
                          }}
                          className="flex-1 py-2.5 bg-brand-gold text-black rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-yellow-400 font-mono"
                        >
                          Approve & Pay
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Cost Preview estimation panel */}
              <div className="p-4 bg-[#161616] rounded-xl border border-white/10 text-left flex justify-between items-center">
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-stone-500 block">
                    Estimated Transit & Soap Charges *
                  </span>
                  <span className="font-serif text-lg text-white font-medium mt-1 inline-flex items-center gap-1">
                    <Sparkles className="w-4 h-4 text-brand-sage" />
                    Estimated: <span className="text-brand-sage font-bold">₵{estimatedPrice}.00 GHS</span>
                  </span>
                </div>
                <div className="text-right">
                  <span className={`font-sans text-[9px] px-2.5 py-1 rounded-lg uppercase border font-bold ${
                    isPaid || paymentMethod === 'Wallet'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-brand-sage/10 text-brand-sage border-brand-sage/20'
                  }`}>
                    {isPaid || paymentMethod === 'Wallet' ? '✓ Instant Online Paid' : `Payment: ${paymentMethod}`}
                  </span>
                </div>
              </div>

              {/* Form submission CTAs */}
              <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3.5 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-all cursor-pointer w-full sm:w-1/3 text-center border border-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3.5 rounded-xl font-sans text-xs font-bold tracking-widest uppercase bg-white text-black hover:bg-brand-sage hover:text-white hover:border-brand-sage transition-all cursor-pointer w-full sm:w-2/3 border border-white/10"
                >
                  Confirm & Schedule Pickup
                </button>
              </div>

            </motion.form>
          ) : (
            <motion.div 
              key="booking-success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 text-center space-y-6"
            >
              <div className="inline-flex p-4 bg-brand-sage/15 rounded-full border border-brand-sage/20 mb-2">
                <CheckCircle className="w-12 h-12 text-brand-sage" />
              </div>

              <div className="space-y-2">
                <span className="font-mono text-[9px] tracking-[0.3em] text-brand-sage uppercase font-bold">
                  Receipt Codified
                </span>
                <h4 className="font-serif text-2xl text-white font-light">
                  Garment Concierge Confirmed!
                </h4>
                <p className="font-sans text-stone-400 text-xs sm:text-sm font-light max-w-md mx-auto leading-relaxed">
                  Your pickup booking is recorded in our local ledger. We have generated a secure tracking ID: <strong className="text-brand-sage font-mono">{createdBooking?.id}</strong>.
                </p>
              </div>

              {/* Booking receipt simulation box - Curved and styled */}
              <div className="max-w-md mx-auto bg-[#161616] p-5 rounded-2xl border border-white/10 text-left text-xs space-y-2.5">
                <div className="flex justify-between border-b border-white/10 pb-2 text-[10px] text-stone-500 font-mono">
                  <span>ORDER LEDGER REPORT</span>
                  <span>{createdBooking?.createdAt.substring(0, 10)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Patron Name:</span>
                  <span className="text-white font-medium">{createdBooking?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Garment Treatment:</span>
                  <span className="text-white font-medium">{createdBooking?.serviceType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Pickup Schedule:</span>
                  <span className="text-brand-sage font-semibold">{createdBooking?.pickupDate} during slot</span>
                </div>
                <div className="flex justify-between text-[11px] text-stone-400 pl-4">
                  <span>↳ Timeslot:</span>
                  <span className="text-white">{createdBooking?.pickupTime.split(' ')[0]} {createdBooking?.pickupTime.split(' ')[1]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Address Location:</span>
                  <span className="text-white font-medium max-w-[200px] text-right truncate">{createdBooking?.address}</span>
                </div>
                {createdBooking?.riderNote && (
                  <div className="flex justify-between">
                    <span className="text-stone-400">Note for Rider:</span>
                    <span className="text-brand-gold font-medium max-w-[220px] text-right truncate">{createdBooking.riderNote}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/10 pt-2">
                  <span className="text-stone-400">Payment Channel:</span>
                  <span className="text-stone-200 font-mono font-medium">{createdBooking?.paymentMethod || 'Pay on Pickup'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Payment Status:</span>
                  <span className={`font-mono font-bold ${createdBooking?.paymentStatus === 'Paid' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {createdBooking?.paymentStatus === 'Paid' ? `PAID (${createdBooking.transactionRef || 'ONLINE'})` : 'PAY ON PICKUP'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2 font-serif text-sm">
                  <span className="text-stone-400">Estimated Total:</span>
                  <span className="text-brand-sage font-bold">₵{estimatedPrice}.00 GHS</span>
                </div>
              </div>

              {/* Portal setup link section */}
              <div className="max-w-md mx-auto bg-brand-sage/5 border border-brand-sage/20 rounded-2xl p-4 text-xs text-left space-y-2 mt-4">
                <span className="font-mono text-[9px] text-brand-gold uppercase tracking-widest block font-bold">DIGITAL CLIENT PORTAL DISPATCH</span>
                <div className="text-[#8E9299] font-light leading-relaxed text-[11px]">
                  {loggedInUser ? (
                    <p>This pickup order has been saved directly under your linked patron profile. You can view, track, or simulate courier dispatch telemetry instantly:</p>
                  ) : (
                    <p>A secure, personalized tracking URL has been formulated for your phone or email. Tap below to head directly to the portal setup screen and establish your logging password:</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setIsSuccess(false);
                    onClose();
                    window.location.hash = loggedInUser ? '#portal' : `#portal?bookingId=${createdBooking?.id}&setup=true`;
                  }}
                  className="w-full mt-1 px-4 py-2.5 bg-brand-sage hover:bg-brand-sage-light text-white text-[10px] font-bold uppercase tracking-widest rounded-xl flex items-center justify-center space-x-1 transition-all cursor-pointer border border-white/5"
                >
                  <span>{loggedInUser ? 'Go directly to active portal' : 'Activate Portal & Choose Password'}</span>
                </button>
              </div>

              {/* WhatsApp routing call link */}
              <div className="space-y-3 max-w-sm mx-auto pt-2">
                <button
                  onClick={triggerWhatsAppRedirect}
                  className="w-full py-3.5 bg-[#25D366] hover:bg-[#20BA5A] text-white text-xs font-bold tracking-wider uppercase rounded-xl transition-all duration-300 flex items-center justify-center space-x-2 cursor-pointer shadow-lg hover:shadow-[#25d366]/10"
                >
                  <MessageSquare className="w-4 h-4 font-black" />
                  <span>Send Confirmation to WhatsApp</span>
                </button>
                <p className="text-[10px] text-stone-500 font-light font-sans max-w-xs mx-auto leading-relaxed">
                  Triggers prefilled message dispatch to our concierge dispatchers for ultra-fast approval!
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setIsSuccess(false);
                      onClose();
                    }}
                    className="text-stone-400 hover:text-white text-xs font-sans tracking-wide cursor-pointer uppercase font-semibold"
                  >
                    Done & Return to Site
                  </button>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
