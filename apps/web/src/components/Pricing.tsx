import { useState } from 'react';
import { motion } from 'motion/react';
import { SUBSCRIPTION_PLANS } from '../data';
import { SubscriptionPlan } from '../types';
import { Check, ShieldCheck, HelpCircle, ArrowRight, Home, GraduationCap, Briefcase, Award } from 'lucide-react';

interface PricingProps {
  onSelectPlan: (planName: string) => void;
}

export default function Pricing({ onSelectPlan }: PricingProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const getPrice = (basePriceString: string) => {
    const value = parseInt(basePriceString.replace(/[₵$]/g, ''), 10);
    if (billingCycle === 'annual') {
      // Apply a luxury 15% discount formatted gracefully
      const discounted = Math.round(value * 0.85);
      return `₵${discounted}`;
    }
    return basePriceString;
  };

  return (
    <section id="subscriptions" className="py-24 bg-brand-charcoal border-b border-white/5 relative">
      {/* Editorial glowing accents */}
      <div className="absolute top-0 right-[15%] w-[40%] h-[40%] rounded-full bg-brand-gold/5 blur-[160px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="font-sans text-[11px] uppercase tracking-[0.4em] text-brand-sage font-bold">
            Bespoke Subscriptions
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl text-white font-light tracking-tight mt-3">
            Tailored Membership <span className="font-serif italic text-brand-sage">Programs</span>
          </h2>
          <p className="font-sans text-[#8E9299] text-sm mt-4 font-light tracking-wide max-w-xl mx-auto leading-relaxed">
            Eliminate chore cognitive load with recurring automated schedules. Fixed predictable monthly billing with dedicated VIP delivery days.
          </p>

          {/* Billing cycle slider - Sharp & Blocky corrected to curved */}
          <div className="mt-8 inline-flex items-center p-1 bg-[#161616] rounded-xl border border-white/10" id="billing-cycle-toggle">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-brand-sage text-white'
                  : 'text-[#8E9299] hover:text-white'
              }`}
            >
              Monthly Cycle
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 relative cursor-pointer ${
                billingCycle === 'annual'
                  ? 'bg-brand-sage text-white'
                  : 'text-[#8E9299] hover:text-white'
              }`}
            >
              <span>Annual Cycle</span>
              <span className="absolute -top-3 -right-2 bg-white text-black font-black text-[8px] px-1.5 py-0.5 rounded-lg uppercase scale-90 tracking-widest border border-black">
                Save 15%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8" id="pricing-grid">
          {SUBSCRIPTION_PLANS.map((plan: SubscriptionPlan) => {
            const calculatedPrice = getPrice(plan.price);
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-8 flex flex-col justify-between transition-all duration-500 ease-in-out text-left ${
                  plan.popular
                    ? 'bg-[#161616] border-2 border-brand-sage shadow-[0_8px_30px_rgba(0,0,0,0.85)] scale-105 z-10'
                    : 'bg-[#161616]/70 hover:bg-[#161616] border border-white/10 hover:border-white/20'
                }`}
                id={`plan-card-${plan.id}`}
              >
                {/* Popular Indicator Tag info */}
                {plan.popular && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-sage text-white text-[9px] font-bold tracking-[0.2em] uppercase px-4 py-1 rounded-lg shadow-md border border-white/10">
                    RECOMMENDED CONCIERGE
                  </span>
                )}

                {/* Plan Header */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-xl font-light text-white uppercase tracking-wider">
                      {plan.name}
                    </span>
                    {plan.id === 'student' && <GraduationCap className="w-5 h-5 text-brand-sage" />}
                    {plan.id === 'professional' && <Briefcase className="w-5 h-5 text-brand-sage" />}
                    {plan.id === 'family' && <Home className="w-5 h-5 text-brand-sage-light" />}
                    {plan.id === 'corporate' && <Award className="w-5 h-5 text-brand-sage" />}
                  </div>

                  <p className="font-sans text-xs text-[#8E9299] mt-2 font-light leading-relaxed">
                    {plan.tagline}
                  </p>

                  {/* Pricing Details */}
                  <div className="mt-6 flex items-baseline">
                    <span className="font-serif text-4xl sm:text-5xl font-light text-white tracking-tight">
                      {calculatedPrice}
                    </span>
                    <span className="font-sans text-xs text-[#8E9299]/70 ml-2 uppercase tracking-widest">
                      / {billingCycle === 'monthly' ? 'mo' : 'mo, billed annually'}
                    </span>
                  </div>

                  {/* Volume allocation meter - Sharp corners corrected to rounded */}
                  <div className="mt-6 p-4 bg-black/60 rounded-xl border border-white/10">
                    <div className="flex justify-between items-center text-[10px] tracking-wide text-[#F5F5F4] font-semibold mb-2 uppercase">
                      <span>Allowance Volume</span>
                      <span className="text-brand-sage">{plan.capacity}</span>
                    </div>
                    <div className="w-full bg-[#161616] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-brand-sage h-full rounded-full"
                        style={{
                          width:
                            plan.id === 'student'
                              ? '25%'
                              : plan.id === 'professional'
                              ? '50%'
                              : plan.id === 'family'
                              ? '75%'
                              : '100%',
                        }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-[#8E9299] mt-2 font-light">
                      <span>{plan.turnaround}</span>
                    </div>
                  </div>

                  {/* Benefits checklist */}
                  <ul className="mt-8 space-y-3.5">
                    {plan.benefits.map((benefit, idx) => (
                      <li key={idx} className="flex items-start">
                        <Check className="w-4 h-4 text-brand-sage shrink-0 mt-0.5 mr-3" />
                        <span className="font-sans text-stone-300 text-xs font-light leading-relaxed">
                          {benefit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Subscriptions CTA Button - Sharp blocks corrected to rounded */}
                <div className="mt-10 pt-4 border-t border-white/10">
                  <button
                    onClick={() => onSelectPlan(plan.name)}
                    className={`w-full py-4 rounded-xl font-sans text-xs font-bold tracking-widest uppercase transition-all duration-300 cursor-pointer ${
                      plan.popular
                        ? 'bg-white text-black hover:bg-brand-sage hover:text-white'
                        : 'bg-transparent hover:bg-white/10 text-white border border-white/15'
                    }`}
                  >
                    Activate {plan.name}
                  </button>
                  <p className="text-[9px] font-sans text-[#8E9299] mt-2 text-center font-light leading-snug">
                    Instant setup. Pause, scale or cancel cycle anytime without penalty.
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust summary block - Corrected to rounded */}
        <div className="mt-16 bg-[#161616] border border-white/10 p-6 rounded-2xl max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between text-left gap-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-brand-sage/10 rounded-xl border border-white/10">
              <ShieldCheck className="w-6 h-6 text-brand-sage" />
            </div>
            <div>
              <h4 className="font-serif text-lg text-white font-medium">FreshFold Quality Promise</h4>
              <p className="font-sans text-xs text-[#8E9299] mt-1 font-light leading-relaxed">
                If you are not 100% satisfied with our folding lines or botanical fragrance levels, return within 24h and we will press them again complimentary.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center space-x-2 text-[#8E9299] text-xs">
            <span>Special business requirements?</span>
            <a href="#contact" className="text-brand-sage underline hover:text-white font-bold transition-colors">Contact us</a>
          </div>
        </div>

      </div>
    </section>
  );
}
