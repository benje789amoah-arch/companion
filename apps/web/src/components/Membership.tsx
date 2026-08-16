import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PHONE_DIGITS,
  PHONE_LENGTH_MESSAGE,
  isCompletePhone,
  limitPhoneInput,
} from '@freshfold/core';
import { LOYALTY_TIERS } from '../data';
import { LoyaltyTier } from '../types';
import { Award, ShieldCheck, History, HelpCircle, Gift, Sparkles, Sliders, Calendar, Clock, CreditCard, Wallet, Lock, Smartphone, CheckCircle2, X, Crown, Check, Banknote } from 'lucide-react';

export default function Membership() {
  const [selectedTierId, setSelectedTierId] = useState<'basic' | 'silver' | 'gold'>('silver');

  // Membership payment states
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Price calculations
  const getTierPrice = (tierId: string) => {
    if (tierId === 'basic') return 0;
    if (tierId === 'silver') return billingCycle === 'annual' ? 67 : 79;
    return billingCycle === 'annual' ? 126 : 149;
  };


  // The tier the visitor is previewing, from the card picker above.
  const activeLoyaltyTier = LOYALTY_TIERS.find(t => {
    if (selectedTierId === 'basic') return t.id === 'basic';
    if (selectedTierId === 'silver') return t.id === 'silver';
    return t.id === 'gold';
  }) || LOYALTY_TIERS[1];

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
            Explore the tiers and what each unlocks. Points accrue on the orders you actually place.
          </p>
        </div>

        {/* Card selector buttons — above the grid so the card face and the perks
            panel below start on the same line. */}
        <div className="flex justify-center mb-10">
          <div className="flex gap-2.5 p-1 bg-[#161616] rounded-xl border border-white/10" id="card-picker">
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
        </div>

        {/* Dashboard Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start" id="loyalty-container">

          {/* LEFT: Interactive Digital Card (Grid Columns: 5) */}
          <div className="lg:col-span-5 flex flex-col items-center">

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
                  {/* Card chip motif */}
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

                <a
                  href="#contact"
                  className="px-5 py-2.5 bg-brand-gold text-black hover:bg-yellow-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer font-mono flex items-center justify-center gap-1.5 shrink-0 shadow-lg"
                >
                  <Crown className="w-4 h-4" />
                  <span>Enquire about this tier</span>
                </a>
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

          </div>

        </div>

      </div>

    </section>
  );
}
