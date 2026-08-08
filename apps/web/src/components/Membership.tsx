import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LOYALTY_TIERS } from '../data';
import { LoyaltyTier, Booking } from '../types';
import { Award, Zap, ShieldCheck, History, HelpCircle, Gift, Sparkles, Sliders, MapPin, Calendar, Clock, CreditCard, Wallet, Lock, Smartphone, CheckCircle2, X, Crown, Check, Banknote } from 'lucide-react';

interface MembershipProps {
  activeBookings?: Booking[];
}

export default function Membership({ activeBookings = [] }: MembershipProps) {
  const [selectedTierId, setSelectedTierId] = useState<'basic' | 'silver' | 'gold'>('silver');
  const [simulatedPoints, setSimulatedPoints] = useState<number>(750);

  // Membership payment states
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<'MTN MoMo' | 'Telecel Cash' | 'AT Money' | 'Card' | 'Wallet'>('MTN MoMo');
  const [momoNumber, setMomoNumber] = useState('');
  const [momoPin, setMomoPin] = useState('');
  const [momoPromptActive, setMomoPromptActive] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [subscribedTier, setSubscribedTier] = useState<string | null>(() => {
    return localStorage.getItem('freshfold_membership_active_tier') || null;
  });
  const [paymentRef, setPaymentRef] = useState<string>(() => {
    return localStorage.getItem('freshfold_membership_txn_ref') || '';
  });
  const [walletBalance, setWalletBalance] = useState<number>(150);

  useEffect(() => {
    const savedBal = localStorage.getItem('freshfold_wallet_balance');
    if (savedBal) {
      setWalletBalance(parseFloat(savedBal));
    }
  }, []);

  // Price calculations
  const getTierPrice = (tierId: string) => {
    if (tierId === 'basic') return 0;
    if (tierId === 'silver') return billingCycle === 'annual' ? 67 : 79;
    return billingCycle === 'annual' ? 126 : 149;
  };

  const handleSubscribePayment = () => {
    const price = getTierPrice(selectedTierId);
    if (payMethod === 'Wallet' && walletBalance < price) {
      alert(`Insufficient wallet balance (₵${walletBalance}.00 GHS). Please top up or choose Mobile Money.`);
      return;
    }

    const ref = 'TXN-MEMB-' + Math.floor(100000 + Math.random() * 900000);
    setPaymentRef(ref);
    setSubscribedTier(selectedTierId);

    localStorage.setItem('freshfold_membership_active_tier', selectedTierId);
    localStorage.setItem('freshfold_membership_txn_ref', ref);

    if (payMethod === 'Wallet') {
      const newBal = Math.max(0, walletBalance - price);
      setWalletBalance(newBal);
      localStorage.setItem('freshfold_wallet_balance', newBal.toString());
    }

    setIsPayModalOpen(false);
    setMomoPromptActive(false);
  };

  // Dynamically map simulated points to current membership level
  const activeLoyaltyTier = LOYALTY_TIERS.find(t => {
    if (selectedTierId === 'basic') return t.id === 'basic';
    if (selectedTierId === 'silver') return t.id === 'silver';
    return t.id === 'gold';
  }) || LOYALTY_TIERS[1];

  // Simulated laundry history list corresponding to selected level
  const getMockHistory = (tierId: string) => {
    switch (tierId) {
      case 'gold':
        return [
          { date: 'May 28, 2026', items: '15 items (Cashmere Knits, Linens)', status: 'Delivered', service: 'Bespoke Garment Handwash', techSign: 'Signature Lavender Scent' },
          { date: 'May 14, 2026', items: '24 items (Formal suits, Shirts)', status: 'Delivered', service: 'Pro Press & Air dry', techSign: 'No Crease Guarantee' },
          { date: 'Apr 30, 2026', items: '32 items (Bed Bedding Suite)', status: 'Delivered', service: 'Sanitizing Sheet Wash', techSign: 'Gold waived express fee' }
        ];
      case 'silver':
        return [
          { date: 'Jun 02, 2026', items: '12 items (Polo shirts, Trousers)', status: 'Delivered', service: 'Machine Clean & Folded', techSign: 'Complimentary herbal scent' },
          { date: 'May 18, 2026', items: '18 items (Dresses, Gentle Cycle)', status: 'Delivered', service: 'Delicate Wool Drying', techSign: '10% Platinum stain code' },
        ];
      default:
        return [
          { date: 'May 10, 2026', items: '8 items (Everyday Denim, Shirts)', status: 'Delivered', service: 'Standard Wash & Dry', techSign: 'Normal turnaround' }
        ];
    }
  };

  const getPointsCap = (tierId: string) => {
    if (tierId === 'basic') return 'Up to 500 lifetime points';
    if (tierId === 'silver') return '500 to 1,500 lifetime points';
    return '1,500+ lifetime points';
  };

  return (
    <section id="membership" className="py-24 bg-brand-charcoal relative overflow-hidden border-b border-white/5">
      {/* Background aesthetics */}
      <div className="absolute top-1/2 left-0 w-[40%] h-[40%] rounded-full bg-brand-sage/5 blur-[150px] pointer-events-none" />
      <div className="absolute top-[30%] right-0 w-[40%] h-[40%] rounded-full bg-brand-gold/5 blur-[150px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="font-sans text-[11px] uppercase tracking-[0.4em] text-brand-sage font-bold">
            Digital Identity
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl text-white font-light tracking-tight mt-3">
            Pure Care <span className="font-serif italic text-brand-sage">Loyalty Program</span>
          </h2>
          <p className="font-sans text-[#8E9299] text-sm mt-4 font-light tracking-wide max-w-xl mx-auto">
            Experience our premium digital tier cards. Adjust your parameters, explore loyalty history tracking logs, and preview VIP laundry benefits on-the-fly.
          </p>
        </div>

        {/* Dashboard Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center" id="loyalty-container">
          
          {/* LEFT: Card Picker and Interactive Digital Card (Grid Columns: 5) */}
          <div className="lg:col-span-5 flex flex-col items-center">
            
            {/* Card selector buttons - Sharp & Blocky corrected to curved */}
            <div className="flex gap-2.5 p-1 bg-[#161616] rounded-xl border border-white/10 mb-8" id="card-picker">
              {LOYALTY_TIERS.map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => setSelectedTierId(tier.id as any)}
                  className={`px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${
                    selectedTierId === tier.id
                      ? 'bg-brand-sage text-white'
                      : 'text-[#8E9299] hover:text-white'
                  }`}
                >
                  {tier.id === 'basic' ? 'Bronze' : tier.id === 'silver' ? 'Silver' : 'Gold'}
                </button>
              ))}
            </div>

            {/* Virtual Card Rendering Frame - Sculpted curved details */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeLoyaltyTier.id}
                initial={{ opacity: 0, rotateY: 45, scale: 0.95 }}
                animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                exit={{ opacity: 0, rotateY: -45, scale: 0.95 }}
                transition={{ duration: 0.6 }}
                className={`relative w-full max-w-[400px] h-60 rounded-2xl p-6 flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-white/15 overflow-hidden ${
                  activeLoyaltyTier.id === 'gold'
                    ? 'bg-gradient-to-br from-[#2A2A2A] to-[#1A1A1A]'
                    : activeLoyaltyTier.id === 'silver'
                    ? 'bg-gradient-to-br from-[#5A5A40] to-[#3D3D2D]'
                    : 'bg-gradient-to-br from-[#3D3D2D] to-[#161616]'
                }`}
                id={`digital-laundry-card-${activeLoyaltyTier.id}`}
              >
                {/* Background foil shimmer ornament */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent opacity-60 pointer-events-none" />
                <div className="absolute -bottom-10 -right-10 w-44 h-44 rounded-full bg-blend-soft-light bg-brand-sage/10 blur-3xl pointer-events-none" />

                {/* Card Top Block */}
                <div className="flex justify-between items-start relative z-10">
                  <div className="text-left">
                    <p className="font-mono text-[9px] tracking-[0.3em] text-white/50 uppercase">
                      Boutique Patron ID
                    </p>
                    <p className="font-serif text-sm tracking-widest text-white mt-1 uppercase font-semibold">
                      {activeLoyaltyTier.cardName}
                    </p>
                  </div>
                  {/* Digital RFID Mock Chip */}
                  <div className="w-10 h-7 rounded-md bg-gradient-to-br from-amber-200/40 via-amber-100/20 to-stone-500/30 border border-white/20 flex items-center justify-center relative shadow-inner">
                    <div className="w-6 h-4 border-r border-b border-white/10 rounded-sm" />
                  </div>
                </div>

                {/* Card Center Stamp */}
                <div className="my-auto flex items-center space-x-3.5 relative z-10 text-left">
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 z-10 w-11 h-11 flex items-center justify-center font-bold text-sm text-white">
                    {activeLoyaltyTier.id === 'gold' ? 'G' : activeLoyaltyTier.id === 'silver' ? 'S' : 'B'}
                  </div>
                  <div>
                    <h3 className="font-sans text-xs uppercase tracking-widest text-white font-bold">
                      {activeLoyaltyTier.name}
                    </h3>
                    <p className={`font-sans text-[10px] ${activeLoyaltyTier.id === 'silver' ? 'text-white/80' : 'text-[#8E9299]'} mt-0.5 font-light`}>
                      {getPointsCap(activeLoyaltyTier.id)}
                    </p>
                  </div>
                </div>

                {/* Card Bottom Block */}
                <div className="flex justify-between items-end relative z-10 text-left">
                  <div>
                    <span className="font-mono text-[8px] tracking-[0.2em] text-white/40 block uppercase">
                      Direct Loyalty Benefit
                    </span>
                    <span className="font-serif text-lg tracking-wider text-white font-semibold block italic">
                      {activeLoyaltyTier.discountRate > 0
                        ? `${activeLoyaltyTier.discountRate * 100}% Surcharges Off`
                        : 'Complimentary Upgrades'}
                    </span>
                  </div>
                  {/* Subtle watermarked typographic lock */}
                  <span className="font-mono text-[8px] tracking-[0.3em] text-white/40 uppercase font-bold">
                    Julian V. Rossi
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Simulated Points slider to interactively level up */}
            <div className="mt-8 w-full max-w-[400px] bg-[#161616] p-4 rounded-xl border border-white/10 text-left">
              <div className="flex justify-between items-center mb-2">
                <span className="font-sans text-[10px] font-bold text-[#8E9299] tracking-wider uppercase flex items-center gap-1.5">
                  <Sliders className="w-3 h-3 text-brand-sage" />
                  Point Level Simulator
                </span>
                <span className="font-mono text-xs text-brand-sage font-bold">
                  {simulatedPoints} Points
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="2000"
                step="50"
                value={simulatedPoints}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setSimulatedPoints(val);
                  if (val < 500) {
                    setSelectedTierId('basic');
                  } else if (val >= 500 && val < 1500) {
                    setSelectedTierId('silver');
                  } else {
                    setSelectedTierId('gold');
                  }
                }}
                className="w-full h-1.5 bg-stone-900 rounded-full appearance-none cursor-pointer accent-brand-sage"
                id="loyalty-points-slider"
              />
              <p className="text-[9px] text-[#8E9299] font-sans mt-2 font-light">
                {simulatedPoints < 500
                  ? 'Accumulate 500 points to unlock Silver Concierge rewards automatically'
                  : simulatedPoints < 1500
                  ? 'Accumulate 1,500 points to trigger lifetime Gold Royal status'
                  : 'Platinum status acquired. Enjoy bespoke scent custom selections.'}
              </p>
            </div>
          </div>

          {/* RIGHT: Tier Details, Rewards Benefits & Laundry ledger (Grid Columns: 7) */}
          <div className="lg:col-span-7 space-y-8 text-left" id="loyalty-perks-history">
            
            {/* Benefits detail list details */}
            <div className="bg-[#161616] rounded-2xl p-6 border border-white/10 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/10 pb-4">
                <div>
                  <h4 className="font-serif text-lg text-white font-medium flex items-center space-x-2">
                    <Gift className="w-4 h-4 text-brand-sage" />
                    <span>Tier Loyalty Rewards & Perks</span>
                  </h4>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {activeLoyaltyTier.name} — Plan Rate: <strong className="text-brand-sage font-mono">{selectedTierId === 'basic' ? 'Complimentary' : `₵${getTierPrice(selectedTierId)}.00 GHS / month`}</strong>
                  </p>
                </div>

                {subscribedTier === selectedTierId ? (
                  <div className="px-3.5 py-2 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Active Subscribed Tier ({paymentRef})</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsPayModalOpen(true)}
                    className="px-5 py-2.5 bg-brand-gold text-black hover:bg-yellow-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer font-mono flex items-center justify-center gap-1.5 shrink-0 shadow-lg"
                  >
                    <Crown className="w-4 h-4" />
                    <span>Subscribe to {activeLoyaltyTier.id === 'basic' ? 'Bronze' : activeLoyaltyTier.id === 'silver' ? 'Silver' : 'Gold'} Tier</span>
                  </button>
                )}
              </div>

              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeLoyaltyTier.benefits.map((benefit, idx) => (
                  <li key={idx} className="flex items-start bg-black/40 p-3 rounded-xl border border-white/5">
                    <span className="w-2 h-2 rounded-full bg-brand-sage shrink-0 mt-2 mr-3" />
                    <span className="font-sans text-xs text-stone-300 font-light leading-relaxed">
                      {benefit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Active Bookings Tracking Ledger */}
            {activeBookings.length > 0 && (
              <div className="bg-[#161616] rounded-2xl p-6 border border-brand-sage/60 shadow-[0_4px_25px_-5px_rgba(90,90,64,0.3)]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-serif text-lg text-white font-medium flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-brand-sage animate-pulse" />
                    <span>Active Closet Shipments Tracking</span>
                  </h4>
                  <span className="font-sans text-[9px] bg-brand-sage/20 text-white px-2 py-0.5 rounded-lg uppercase tracking-widest font-bold border border-brand-sage/20">
                    Live Status
                  </span>
                </div>
                
                <div className="space-y-4">
                  {activeBookings.map((booking) => (
                    <div key={booking.id} className="p-4 bg-black/60 rounded-xl border border-white/15 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-[10px] text-brand-sage font-bold">{booking.id}</span>
                            <span className="text-[10px] text-stone-500">•</span>
                            <span className="text-[10px] text-stone-300 font-medium uppercase tracking-wider">{booking.serviceType.replace(/\(.*?\)/g, '').trim()}</span>
                          </div>
                          <p className="text-[11px] text-stone-400 mt-1 font-sans font-light flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-brand-sage shrink-0" />
                            <span className="truncate max-w-[220px]">{booking.address}</span>
                          </p>
                        </div>
                        <span className="font-sans text-[9px] text-[#8E9299] bg-white/5 border border-white/10 font-bold px-2 py-0.5 rounded-lg uppercase shrink-0">
                          {booking.status}
                        </span>
                      </div>

                      {/* Visual Step Progress bar */}
                      <div className="w-full bg-[#161616] h-1.5 rounded-full overflow-hidden flex">
                        <div className="bg-brand-sage h-full rounded-full transition-all duration-500" style={{ width: '25%' }} />
                      </div>
                      <div className="flex justify-between text-[8px] text-[#8E9299] uppercase font-mono font-bold tracking-tight">
                        <span className="text-brand-sage font-extrabold">01 COLLECT</span>
                        <span>02 GARMENT CARE</span>
                        <span>03 PRESS FINISH</span>
                        <span>04 DELIVER</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Simulated Live Laundry Ledger History (Simulating usage logs) - sharp corrected to rounded */}
            <div className="bg-[#161616] rounded-2xl p-6 border border-white/10">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-serif text-lg text-white font-medium flex items-center space-x-2">
                  <History className="w-4 h-4 text-brand-sage" />
                  <span>Interactive Digital Laundry History</span>
                </h4>
                <span className="font-sans text-[9px] bg-brand-sage/10 text-brand-sage px-2 py-0.5 rounded-lg uppercase tracking-widest font-semibold border border-brand-sage/20">
                  Live Ledger
                </span>
              </div>
              
              <div className="space-y-3.5 max-h-[190px] overflow-y-auto pr-1">
                {getMockHistory(activeLoyaltyTier.id).map((history, idx) => (
                  <div key={idx} className="p-3 bg-black/40 rounded-xl border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                    <div className="text-left">
                      <div className="flex items-center space-x-2.5">
                        <span className="font-mono text-[10px] text-brand-sage font-bold">{history.date}</span>
                        <span className="text-[10px] text-[#8E9299]">•</span>
                        <span className="text-[10px] text-stone-300 font-medium">{history.service}</span>
                      </div>
                      <p className="font-sans text-[11px] text-[#8E9299] mt-1 font-light">
                        {history.items} — <span className="italic text-brand-sage/80 text-[10px]">{history.techSign}</span>
                      </p>
                    </div>
                    <span className="font-sans text-[9px] bg-brand-sage/10 text-brand-sage px-3 py-1 rounded-full uppercase font-bold border border-brand-sage/20 shrink-0 self-start md:self-center">
                      {history.status}
                    </span>
                  </div>
                ))}
              </div>
              <p className="font-sans text-[10px] text-[#8E9299]/70 mt-3 text-center font-light leading-snug">
                Cardholders and families can link accounts for integrated household usage statements.
              </p>
            </div>

          </div>

        </div>

      </div>

      {/* Membership Subscription Payment Drawer Modal */}
      <AnimatePresence>
        {isPayModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 text-left"
          >
            <div className="bg-[#181818] border border-brand-gold/40 rounded-2xl max-w-md w-full p-6 text-left space-y-5 shadow-2xl relative">
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="absolute top-4 right-4 text-stone-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-1">
                <span className="font-mono text-[9px] text-brand-gold uppercase tracking-widest block font-bold">
                  FRESHFOLD MEMBERSHIP PAYMENT
                </span>
                <h3 className="font-serif text-xl text-white">
                  Subscribe to {activeLoyaltyTier.name}
                </h3>
                <p className="text-stone-400 text-xs">
                  Rate: <strong className="text-brand-gold font-mono text-sm font-bold">
                    {selectedTierId === 'basic' ? 'Complimentary (₵0.00)' : `₵${getTierPrice(selectedTierId)}.00 GHS / month`}
                  </strong>
                </p>
              </div>

              {/* Billing Cycle Selector */}
              <div className="flex gap-2 p-1 bg-black/60 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-all ${
                    billingCycle === 'monthly' ? 'bg-brand-gold text-black' : 'text-stone-400'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-all ${
                    billingCycle === 'annual' ? 'bg-brand-gold text-black' : 'text-stone-400'
                  }`}
                >
                  Annual (-15%)
                </button>
              </div>

              {/* Payment Channel Options */}
              <div className="space-y-2">
                <label className="block text-[10px] font-mono text-stone-400 uppercase font-bold">Select Payment Channel</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['MTN MoMo', 'Telecel Cash', 'Card', 'Wallet'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayMethod(m as any)}
                      className={`p-2.5 rounded-xl border text-[10px] font-bold font-mono transition-all text-center ${
                        payMethod === m
                          ? 'bg-brand-gold text-black border-brand-gold'
                          : 'bg-black/50 border-white/10 text-stone-400 hover:text-white'
                      }`}
                    >
                      {m === 'Wallet' ? `Wallet (₵${walletBalance})` : m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Channel-Specific Form */}
              {(payMethod.includes('MoMo') || payMethod.includes('Cash') || payMethod.includes('AT')) && (
                <div className="space-y-3 bg-black/50 p-3.5 rounded-xl border border-white/10">
                  <label className="block text-[10px] font-mono text-stone-400 uppercase font-bold">Mobile Money Phone Number</label>
                  <input
                    type="text"
                    value={momoNumber}
                    onChange={(e) => setMomoNumber(e.target.value)}
                    placeholder="e.g. 0244 123 456"
                    className="w-full bg-black text-white text-xs p-3 rounded-xl border border-white/10 font-mono focus:border-brand-gold focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!momoNumber || momoNumber.length < 9) {
                        alert('Please enter a valid Mobile Money number.');
                        return;
                      }
                      setMomoPromptActive(true);
                    }}
                    className="w-full py-2.5 bg-brand-gold text-black rounded-xl text-xs font-bold font-mono uppercase tracking-wider hover:bg-yellow-400 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Smartphone className="w-4 h-4" /> Trigger MoMo USSD Prompt (*170#)
                  </button>
                </div>
              )}

              {payMethod === 'Card' && (
                <div className="space-y-3 bg-black/50 p-3.5 rounded-xl border border-white/10">
                  <input
                    type="text"
                    placeholder="4532 •••• •••• 8892"
                    className="w-full bg-black text-white text-xs p-3 rounded-xl border border-white/10 font-mono focus:border-brand-gold focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSubscribePayment}
                    className="w-full py-2.5 bg-brand-gold text-black rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-yellow-400 font-mono"
                  >
                    Authorize ₵{getTierPrice(selectedTierId)}.00 GHS Card Payment
                  </button>
                </div>
              )}

              {payMethod === 'Wallet' && (
                <div className="space-y-3 bg-black/50 p-3.5 rounded-xl border border-brand-gold/30">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-300">Wallet Balance:</span>
                    <span className="font-mono text-brand-gold font-bold">₵{walletBalance.toFixed(2)} GHS</span>
                  </div>
                  {walletBalance < getTierPrice(selectedTierId) ? (
                    <p className="text-[10px] text-red-400">Insufficient wallet balance. Please top up or select Mobile Money.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubscribePayment}
                      className="w-full py-2.5 bg-brand-gold text-black rounded-xl text-xs font-bold font-mono uppercase tracking-wider hover:bg-yellow-400"
                    >
                      Pay ₵{getTierPrice(selectedTierId)}.00 GHS from Wallet
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Simulated Mobile Money USSD PIN Prompt Modal */}
      <AnimatePresence>
        {momoPromptActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 text-left"
          >
            <div className="bg-[#1c1c1c] border-2 border-brand-gold rounded-2xl max-w-sm w-full p-6 text-left space-y-4 shadow-2xl relative">
              <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                <div className="w-10 h-10 rounded-full bg-brand-gold/20 flex items-center justify-center text-brand-gold font-bold text-lg">
                  👑
                </div>
                <div>
                  <p className="font-mono text-[10px] text-brand-gold uppercase tracking-wider font-extrabold">Simulated USSD Prompt (*170#)</p>
                  <p className="font-bold text-white text-sm">{payMethod} Membership Payment</p>
                </div>
              </div>

              <div className="bg-black/80 p-3 rounded-xl border border-white/10 text-xs font-mono text-stone-300 space-y-1.5">
                <p className="text-brand-sage font-bold">FreshFold Membership Tier</p>
                <p>Selected Tier: {activeLoyaltyTier.name}</p>
                <p>Amount Due: <strong className="text-brand-gold">₵{getTierPrice(selectedTierId)}.00 GHS</strong></p>
                <p>Subscriber: {momoNumber}</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] text-stone-400 font-semibold">
                  Enter 4-Digit Mobile Money PIN:
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
                      alert('Please enter your 4-digit MoMo PIN.');
                      return;
                    }
                    handleSubscribePayment();
                  }}
                  className="flex-1 py-2.5 bg-brand-gold text-black rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-yellow-400 font-mono"
                >
                  Confirm & Pay
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </section>
  );
}
