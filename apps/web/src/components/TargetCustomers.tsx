import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GraduationCap, Briefcase, Users, Building, Check, ArrowUpRight } from 'lucide-react';

interface TargetCustomersProps {
  onSelectCustomerType: (typeGroup: string) => void;
}

export default function TargetCustomers({ onSelectCustomerType }: TargetCustomersProps) {
  const [activeTab, setActiveTab] = useState<'student' | 'professional' | 'family' | 'business'>('professional');

  const targets = [
    {
      id: 'student' as const,
      name: 'Students & Academics',
      icon: GraduationCap,
      quote: '“Midterms, essays, social calendars—there is zero room left for handling mountain piles of laundry in dark dorm basements.”',
      tailoredText: 'We integrate with campus lifestyles. Schedule budget-friendly bi-weekly collections so you can focus strictly on what matters.',
      perks: [
        'Dedicated student cash-saving packages',
        'Direct campus-dorm collections',
        'Hypoallergenic formulas for zero skin breakout reaction',
        'SMS automated tracking updates'
      ],
      ctaLabel: 'Schedule Student Package',
      imageUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=800'
    },
    {
      id: 'professional' as const,
      name: 'Working Professionals',
      icon: Briefcase,
      quote: '“My dry-clean runs used to hijack my Saturday mornings. Now, my business attire is managed on auto-pilot.”',
      tailoredText: 'Primacy visual presence is essential. We treat executive wardrobes with absolute detail, using custom collar stays, luxury starch selections, and closet-ready hanger returns.',
      perks: [
        'Guaranteed next-morning response schedules',
        'Bespoke hand-press suits & formal shirts styling',
        'Automated digital calendar sync options',
        'Exclusive premium garment shield transportation'
      ],
      ctaLabel: 'Book Executive Care',
      imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=800'
    },
    {
      id: 'family' as const,
      name: 'Families & Households',
      icon: Users,
      quote: '“With three children and heavy sports, washing machines were running 24/7. FreshFold gave us our weekends back.”',
      tailoredText: 'Heavy-volume household laundry processed with absolute care. We separated families’ washes carefully by load, heat-balancing delicate baby materials from sports uniforms.',
      perks: [
        'Hygienic high-capacity multi-weight packages',
        'Pre-sort separation rules (Colors, Whites, Delicates separated)',
        'Eucalyptus natural floral organic sanitizers',
        'Easy monthly digital household billing tracking'
      ],
      ctaLabel: 'Book Family Pack',
      imageUrl: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&q=80&w=800'
    },
    {
      id: 'business' as const,
      name: 'Corporate & Businesses',
      icon: Building,
      quote: '“FreshFold handles our boutique spa linens with absolute punctuality. Our clients always compliment the scent.”',
      tailoredText: 'Tailored continuous operations for local beauty salons, medical offices, private clinics, gyms, and Airbnb hosts requiring continuous pristine linens, soft towels, and clean robes.',
      perks: [
        'SLA guaranteed turnaround timelines (12-24h options)',
        'Flexible monthly credit ledger invoicing compliance',
        'Custom high-heat sanitizing medical grade protocols',
        'Dedicated dispatch courier account liaison'
      ],
      ctaLabel: 'Request Corporate Rate',
      imageUrl: 'https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&q=80&w=800'
    }
  ];

  const currentTab = targets.find(t => t.id === activeTab) || targets[1];
  const TabIcon = currentTab.icon;

  return (
    <section id="target-customers" className="py-24 bg-brand-charcoal relative border-b border-white/5">
      {/* Visual background lights */}
      <div className="absolute top-1/4 left-10 w-[45%] h-[45%] rounded-full bg-brand-sage/5 blur-[150px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="font-sans text-[11px] uppercase tracking-[0.4em] text-brand-sage font-bold">
            Bespoke Audiences
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl text-white font-light tracking-tight mt-3">
            Tailored Solutions <span className="font-serif italic text-brand-sage">by Sector</span>
          </h2>
          <p className="font-sans text-[#8E9299] text-sm mt-4 font-light tracking-wide max-w-xl mx-auto leading-relaxed">
            Every fabric user requires distinct care, frequency, and budget criteria. Select your sector above to learn how we personalize garment care for your specific lifestyle.
          </p>

          {/* Symmetrical interactive horizontal tabs - Curved and high contrast */}
          <div className="mt-8 flex flex-wrap justify-center gap-2.5" id="customer-sector-tabs">
            {targets.map((tab) => {
              const IconComp = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center space-x-2 border transition-all duration-300 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-brand-sage border-brand-sage text-white shadow-lg'
                      : 'bg-[#161616]/75 border-white/10 text-[#8E9299] hover:text-white hover:border-white/20'
                  }`}
                >
                  <IconComp className="w-4 h-4" />
                  <span>{tab.name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Display Panel Grid Layout - Curved card boundaries */}
        <div className="bg-[#161616] rounded-2xl border border-white/10 overflow-hidden" id="customer-display-panel">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.4 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-0"
            >
              
              {/* LEFT side: Lifestyle Image (Grid Columns: 5) */}
              <div className="lg:col-span-5 h-[320px] lg:h-auto min-h-[350px] relative">
                <img
                  src={currentTab.imageUrl}
                  alt={currentTab.name}
                  className="w-full h-full object-cover grayscale brightness-90 saturate-75"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#161616] hidden lg:block" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-transparent to-transparent lg:hidden" />
              </div>

              {/* RIGHT side: Text Details (Grid Columns: 7) */}
              <div className="lg:col-span-7 p-8 sm:p-12 text-left flex flex-col justify-between">
                <div>
                  <div className="flex items-center space-x-3 text-brand-sage">
                    <TabIcon className="w-5 h-5" />
                    <span className="font-mono text-[10px] tracking-[0.25em] uppercase font-bold text-brand-sage">
                      {currentTab.name}
                    </span>
                  </div>

                  <blockquote className="font-serif italic text-lg text-white font-light mt-6 leading-relaxed relative pl-4 border-l border-brand-sage/30">
                    {currentTab.quote}
                  </blockquote>

                  <p className="font-sans text-[#8E9299] text-xs sm:text-sm font-light leading-relaxed mt-6 tracking-wide">
                    {currentTab.tailoredText}
                  </p>

                  <h4 className="font-sans text-xs font-semibold uppercase tracking-wider text-white mt-8 mb-4">
                    Targeted Features & Perks
                  </h4>

                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {currentTab.perks.map((perk, index) => (
                      <li key={index} className="flex items-start">
                        <Check className="w-3.5 h-3.5 text-brand-sage shrink-0 mt-0.5 mr-2.5" />
                        <span className="font-sans text-[#8E9299] text-xs font-light leading-relaxed">
                          {perk}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="text-left">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[#8E9299]/70 block">
                      Sector Solution Code
                    </span>
                    <span className="font-sans text-[11px] text-brand-sage font-semibold uppercase tracking-wider">
                      FFC-{currentTab.id.toUpperCase()}-VIP
                    </span>
                  </div>
                  
                  <button
                    onClick={() => onSelectCustomerType(`${currentTab.name}`)}
                    className="px-6 py-3.5 bg-white hover:bg-brand-sage hover:text-white text-black text-xs font-bold tracking-widest uppercase rounded-xl transition-all duration-300 hover:shadow-lg flex items-center justify-center space-x-2 cursor-pointer self-start sm:self-auto border border-white/15"
                  >
                    <span>{currentTab.ctaLabel}</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>

              </div>

            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </section>
  );
}
