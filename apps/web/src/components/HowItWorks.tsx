import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Truck, Sparkles, Wind, FileText, Gift, ChevronRight, Play } from 'lucide-react';

export default function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      title: 'Schedule Pickup',
      sub: 'Decide your timeline',
      icon: Calendar,
      duration: 'Est. 2 minutes',
      details: 'Select your preferred pickup day and timeslot through our online booking engine or a quick call to the desk. Inform us about custom fabric requirements, laundry volume, or scent preferences.',
      highlight: 'Keyless lock drops and contactless options available 24/7.'
    },
    {
      title: 'We Collect Your Laundry',
      sub: 'Concierge runner transit',
      icon: Truck,
      duration: 'Same-day collection',
      details: 'A uniformed FreshFold logistics concierge arrives at your physical doorstep with weatherized heavy-duty dry shield cases. Bags are tagged and locked in real-time, matching your Patron profile.',
      highlight: 'Full GPS tracking and digital receipt dispatch on collect.'
    },
    {
      title: 'Washing & Garment Care',
      sub: 'Bespoke fabric treatment',
      icon: Sparkles,
      duration: '4-8 hours cycle duration',
      details: 'Garments are individual-separated, spot-evaluated by master artisans, and washed using advanced temperature-controlled drum cycles. We use plant-extract biological detergents and pH-balanced soft water.',
      highlight: 'Zero mixing across families. 100% individual isolated batches.'
    },
    {
      title: 'Drying, Ironing & Folding',
      sub: 'Artisan textile press',
      icon: Wind,
      duration: '2-4 hours careful touch',
      details: 'Gentle low-heat drying prevents shrinkage. Garments are hand-pressed using precise custom structural templates to guarantee symmetric, retail-standard folding, ready for direct closet storage.',
      highlight: 'Bespoke collar-shields and hangers provided on formal suits.'
    },
    {
      title: 'Packaging & Quality Check',
      sub: 'Multi-point inspection',
      icon: FileText,
      duration: 'Double Q/A review',
      details: 'Every collar, cuff, and button line is examined under crisp inspection stage lighting. Checked-out garments are wrapped in bespoke canvas protectors or organic breathable paper wrapping.',
      highlight: 'If any spot remains, it is automatically routed back to spot cleaning.'
    },
    {
      title: 'Delivery to Your Doorstep',
      sub: 'Pristine drawer placement',
      icon: Gift,
      duration: 'Exact requested timeslot',
      details: 'Your garment driver returns to your home within the specified delivery slot. All laundry is delivered crisp, folded of aesthetic order, and ready to immediately wear.',
      highlight: 'Complimentary luxury hanger recycle program available on drop-off.'
    }
  ];

  return (
    <section id="how-it-works" className="py-24 bg-brand-charcoal relative border-b border-white/5">
      {/* Visual background lights */}
      <div className="absolute top-1/4 right-[2%] w-[45%] h-[35%] rounded-full bg-brand-gold/5 blur-[160px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header Title */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="font-sans text-[11px] uppercase tracking-[0.4em] text-brand-sage font-bold">
            Bespoke Sequence
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl text-white font-light tracking-tight mt-3">
            The FreshFold <span className="font-serif italic text-brand-sage">Chronicle</span>
          </h2>
          <p className="font-sans text-[#8E9299] text-sm mt-4 font-light tracking-wide max-w-xl mx-auto leading-relaxed">
            From your closet back to your closet, learn how our master handlers execute and safeguard your garments through a six-stage white glove care timeline.
          </p>
        </div>

        {/* Step-by-Step interactive timeline component */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center" id="timeline-interactive-container">
          
          {/* Timeline Node buttons Selection Block (Grid columns: 5) - Sharp boundaries corrected to curved */}
          <div className="lg:col-span-5 space-y-4" id="timeline-node-selectors">
            {steps.map((step, idx) => {
              const IconComponent = step.icon;
              const isActive = idx === activeStep;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-300 flex items-center space-x-4 cursor-pointer relative ${
                    isActive
                      ? 'bg-[#161616] border-brand-sage shadow-[0_4px_20px_-4px_rgba(90,90,64,0.15)] scale-[1.02] z-10'
                      : 'bg-[#161616]/40 border-white/5 hover:border-white/20'
                  }`}
                  id={`timeline-btn-${idx}`}
                >
                  {/* Connection Node indicators */}
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-sage rounded-full" />
                  )}

                  {/* Icon Stamp */}
                  <div className={`p-2.5 rounded-lg border transition-colors ${
                    isActive ? 'bg-black border-brand-sage/30 text-brand-sage' : 'bg-[#161616]/70 border-white/5 text-[#8E9299]'
                  }`}>
                    <IconComponent className="w-5 h-5" />
                  </div>

                  {/* Titles */}
                  <div className="flex-grow">
                    <span className="font-mono text-[9px] tracking-widest text-brand-sage uppercase block font-semibold mb-0.5">
                      Stage 0{idx + 1}
                    </span>
                    <h4 className="font-serif text-sm text-white font-medium">
                      {step.title}
                    </h4>
                    <p className="font-sans text-[11px] text-stone-400 font-light mt-0.5">
                      {step.sub}
                    </p>
                  </div>

                  <ChevronRight className={`w-4 h-4 text-[#8E9299] transition-transform ${isActive ? 'translate-x-1 text-brand-sage' : ''}`} />
                </button>
              );
            })}
          </div>

          {/* Timeline Details Explanation Panel (Grid columns: 7) - Curved details card */}
          <div className="lg:col-span-7" id="timeline-explainer-display">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4 }}
                className="bg-[#161616] p-8 rounded-2xl border border-white/10 text-left relative overflow-hidden"
              >
                {/* Visual watermark */}
                <div className="absolute -bottom-10 -right-10 font-serif italic text-9xl text-white/[0.02] select-none pointer-events-none">
                  0{activeStep + 1}
                </div>

                <div className="flex justify-between items-center pb-4 border-b border-white/10">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-brand-sage" />
                    <span className="font-sans text-xs text-brand-sage font-bold tracking-widest uppercase">
                      Operational Excellence
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-brand-sage font-bold bg-brand-sage/15 px-2.5 py-0.5 rounded-lg border border-brand-sage/25">
                    {steps[activeStep].duration}
                  </span>
                </div>

                <h3 className="font-serif text-2xl text-white mt-6 font-light">
                  {steps[activeStep].title}
                </h3>
                <p className="font-sans text-stone-300 text-sm font-light mt-4 leading-relaxed tracking-wide">
                  {steps[activeStep].details}
                </p>

                {/* Micro tech highlight note - rounded corners */}
                <div className="mt-8 p-4 bg-black/50 rounded-xl border-l-2 border-brand-sage text-left flex gap-3">
                  <span className="text-xl font-bold text-brand-sage leading-none">“</span>
                  <div>
                    <h5 className="font-sans text-[11px] font-bold tracking-wider text-white uppercase">
                      FreshFold Guarantee
                    </h5>
                    <p className="font-sans text-xs text-stone-400 mt-1 font-light leading-relaxed">
                      {steps[activeStep].highlight}
                    </p>
                  </div>
                </div>

                {/* Linear progress ticks indicator at bottom - rounded curves */}
                <div className="mt-8 flex gap-2 justify-center">
                  {steps.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveStep(idx)}
                      className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                        idx === activeStep ? 'w-8 bg-brand-sage' : 'w-2 bg-stone-800'
                      }`}
                      aria-label={`Jump to stage ${idx + 1}`}
                    />
                  ))}
                </div>

              </motion.div>
            </AnimatePresence>
          </div>

        </div>

      </div>
    </section>
  );
}
