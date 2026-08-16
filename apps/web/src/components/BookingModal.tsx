import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, MapPin, Sparkles, Clock, ShieldCheck, CheckCircle, Smartphone, CreditCard, Wallet, Banknote, Lock, CheckCircle2, QrCode } from 'lucide-react';
import {
  PHONE_DIGITS,
  PHONE_LENGTH_MESSAGE,
  isCompletePhone,
  limitPhoneInput,
  samePhone,
  deriveSuburb,
  type Coords,
} from '@freshfold/core';
import { Booking } from '../types';
import * as store from '../services/store';
import { SERVICES } from '../data';
import AddressAutocomplete from './AddressAutocomplete';
import PickupPinField, { type PinOrigin } from './PickupPinField';

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
  const [city, setCity] = useState('');
  /**
   * The doorstep, when the customer places one. Left null the dispatch server
   * derives a pin from the typed address, which lands in the right suburb and
   * the wrong street.
   */
  const [pickupPin, setPickupPin] = useState<Coords | null>(null);
  /** How that pin came to be, so the field can say so under the map. */
  const [pinOrigin, setPinOrigin] = useState<PinOrigin>(null);

  /**
   * The collection zone this booking is filed under.
   *
   * Derived, never typed. The dispatch board still groups by suburb and the
   * supervisor still filters on it, but it is a fact about where the pin is,
   * not a separate answer the customer can get wrong — and they routinely did,
   * because "Ayeduase" and a pin on campus were both accepted and nothing
   * reconciled them.
   */
  const suburb = useMemo(() => deriveSuburb(pickupPin, address), [pickupPin, address]);
  const [service, setService] = useState(SERVICES[0]?.name || 'Washing (Machine & Hand Wash)');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTimeSlot, setPickupTimeSlot] = useState('08:00 AM - 11:00 AM (Morning Concierge)');
  const [specialScent, setSpecialScent] = useState('Organic Lavender');
  const [starchLevel, setStarchLevel] = useState('None');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [riderNote, setRiderNote] = useState('');

  // Payment states
  const [paymentMethod, setPaymentMethod] = useState<'Paystack' | 'Wallet' | 'Pay on Pickup'>('Paystack');
  const [isPaid, setIsPaid] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);

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
          // Where Paystack sends the customer back to. This page knows its own
          // origin; the server's APP_URL is a single fixed guess that is wrong
          // for everyone not running the site on the machine it names.
          callback_url: `${window.location.origin}/#paystack-success`,
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
              samePhone(b.phone, user.phone)
          );
          if (matched.length > 0) {
            // Sort by createdAt descending to get the most recent one
            matched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const latest = matched[0];
            if (latest.address) setAddress(latest.address);
            if (latest.city) setCity(latest.city);
            // The pin travels with the address it was placed for. A patron
            // booking the same pickup again should not have to aim it twice.
            setPickupPin(latest.pickupCoords ?? null);
            setPinOrigin(latest.pickupCoords ? 'map' : null);
          } else {
            setPickupPin(null);
            setPinOrigin(null);
          }
        } else {
          setLoggedInUser(null);
          setName('');
          setEmail('');
          setPhone('');
          setAddress('');
          setCity('');
          setPickupPin(null);
          setPinOrigin(null);
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

    // The confirmation — and with it the link that sets the portal password —
    // is emailed, so a booking without an address to send it to leaves the
    // patron with no way into their own tracking terminal.
    if (!email.trim()) {
      alert('Please add your email address. Your booking receipt and portal setup link are sent there.');
      return;
    }

    // The courier rings this number from the doorstep, so a partial one is
    // worse than none: it looks like a contact and reaches nobody.
    if (!isCompletePhone(phone)) {
      alert(PHONE_LENGTH_MESSAGE);
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
      email: email.trim(),
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
      // Optional by design. The server falls back to a pin derived from the
      // address when there is none, and refuses one outside the service area.
      pickupCoords: pickupPin ?? undefined,
      status: 'Scheduled',
      createdAt: new Date().toISOString(),
      paymentStatus: isNowPaid ? 'Paid' : (paymentMethod === 'Pay on Pickup' ? 'Pay on Pickup' : 'Pending'),
      paymentMethod,
      amount: estimatedPrice,
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

  // Compile WhatsApp redirect URL based on form data.
  //
  // Hidden for now, along with the button on the success screen. The confirmation
  // email already carries this detail, so nothing is lost while it is switched off.
  //
  // A note to the desk about the order, and nothing more. The portal setup link
  // used to ride along in this message; it is emailed now, so it no longer sits
  // in a chat thread that anyone holding the phone can scroll back through.
  // const triggerWhatsAppRedirect = () => {
  //   if (!createdBooking) return;
  //   const formatMsg = [
  //     'Hi FreshFold Laundry Co.! I would like to confirm my premium clothing pickup:',
  //     `• Booking ID: ${createdBooking.id}`,
  //     `• Patron: ${createdBooking.name}`,
  //     `• Fabric Treatment: ${createdBooking.serviceType}`,
  //     `• Pickup: ${createdBooking.pickupDate} @ ${createdBooking.pickupTime}`,
  //     `• Scent: ${specialScent}`,
  //     `• Delivery: ${createdBooking.deliveryDate}`,
  //     `• Surcharges Estimate: ₵${estimatedPrice}.00 GHS`,
  //     `• Address: ${createdBooking.address}, ${createdBooking.suburb}`,
  //     createdBooking.riderNote ? `• Note for Rider: ${createdBooking.riderNote}` : '',
  //   ].filter(Boolean).join('\n');
  //
  //   const encoded = encodeURIComponent(formatMsg);
  //   window.open(`https://wa.me/233257880675?text=${encoded}`, '_blank');
  // };

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
                          inputMode="numeric"
                          maxLength={PHONE_DIGITS}
                          value={phone}
                          onChange={(e) => setPhone(limitPhoneInput(e.target.value))}
                          placeholder={`${PHONE_DIGITS} digits — e.g. 0244000000`}
                          className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                        Email Address (for Receipt & Portal Password Link) *
                      </label>
                      <input
                        type="email"
                        required
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
                  {/* Choosing a suggestion places the pin on the building, so
                      the room number gets typed onto an address that is
                      already in the right place. Typing straight past the list
                      still works — it is a text field first. */}
                  <AddressAutocomplete
                    value={address}
                    onChange={setAddress}
                    onPlaceSelected={(detail) => {
                      setAddress(detail.address);
                      setPickupPin(detail.coords);
                      setPinOrigin('place');
                    }}
                    placeholder="e.g. Victory Towers Hostel (Tabua's Court)"
                    className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                  />
                </div>
                {/* The suburb used to be a required box here. It is derived
                    from the pin now — see `suburb` above — because a customer
                    who has chosen a building or dropped a pin has already said
                    where they are, and asking them to also sort it into a
                    collection zone was asking them to do our filing. */}
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

                {/* The doorstep itself, which the typed address above cannot
                    give us: a hostel block and room number is something no
                    geocoder knows. */}
                <PickupPinField
                  value={pickupPin}
                  onChange={setPickupPin}
                  suburb={suburb}
                  address={address}
                  origin={pinOrigin}
                  onOriginChange={setPinOrigin}
                />

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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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

              {/* Booking receipt */}
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
                    <p>This pickup order is saved under your patron profile. You can view and track it here:</p>
                  ) : (
                    /* No shortcut into the password screen from here: the link
                       in the email carries a single-use token, and it is the
                       only thing that opens one. A button on this panel could
                       only be a booking id in a URL, which is what anybody
                       could have typed. */
                    <p>
                      Your receipt and a secure link for setting your portal password are on their way to{' '}
                      <strong className="text-brand-sage font-mono">{createdBooking?.email}</strong>. Open it from
                      your inbox to choose a password and follow your courier live.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setIsSuccess(false);
                    onClose();
                    window.location.hash = '#portal';
                  }}
                  className="w-full mt-1 px-4 py-2.5 bg-brand-sage hover:bg-brand-sage-light text-white text-[10px] font-bold uppercase tracking-widest rounded-xl flex items-center justify-center space-x-1 transition-all cursor-pointer border border-white/5"
                >
                  <span>{loggedInUser ? 'Go directly to active portal' : 'Open the patron portal'}</span>
                </button>
              </div>

              {/* WhatsApp routing call link — hidden for now. */}
              <div className="space-y-3 max-w-sm mx-auto pt-2">
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
