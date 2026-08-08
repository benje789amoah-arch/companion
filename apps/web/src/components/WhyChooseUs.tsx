import { motion } from 'motion/react';
import { ShieldAlert, Zap, Users, ShieldCheck, HeartHandshake, Sliders, Truck, DollarSign } from 'lucide-react';

export default function WhyChooseUs() {
  const highlights = [
    {
      idx: '01',
      title: 'Hygienic Fabric Separation',
      desc: 'We never mix garments across distinct households. Every patron’s wash is run in designated, isolated sanitizing drums.',
      icon: ShieldCheck,
      color: 'text-brand-sage'
    },
    {
      idx: '02',
      title: 'Fast Turnaround Time',
      desc: 'Our processes are calibrated for speed. Next-day is standard; same-day delivery options are prioritized whenever active.',
      icon: Zap,
      color: 'text-brand-sage'
    },
    {
      idx: '03',
      title: 'Affordable Predictable Pricing',
      desc: 'High-end treatment without secret service commissions. Know exactly what you pay with transparent itemization or flat plans.',
      icon: DollarSign,
      color: 'text-brand-sage'
    },
    {
      idx: '04',
      title: 'Reliable Pickup & Delivery',
      desc: 'Tracked logistics dispatchers. Rain or shine, your laundry is picked up directly and secured within luxury waterproof shielding coats.',
      icon: Truck,
      color: 'text-brand-sage'
    },
    {
      idx: '05',
      title: 'Flexible Subscription Options',
      desc: 'Scale, modify, pause, or swap scheduled service plans seamlessly on your phone, built directly around your active lifestyle.',
      icon: Sliders,
      color: 'text-brand-sage'
    },
    {
      idx: '06',
      title: 'Friendly Professional Service',
      desc: 'White-glove custom support. From custom starch treatments to bespoke scent choices, our textile hospitality is personalized.',
      icon: HeartHandshake,
      color: 'text-brand-sage'
    }
  ];

  return (
    <section id="why-choose-us" className="py-24 bg-brand-charcoal relative border-b border-white/5">
      {/* Visual Ambient ornament */}
      <div className="absolute top-1/2 left-1/3 -translate-x-1/2 w-[50%] h-[30%] bg-brand-sage/5 blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header Block */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="font-sans text-[11px] uppercase tracking-[0.4em] text-brand-sage font-bold">
            Bespoke Philosophy
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl text-white font-light tracking-tight mt-3">
            Pure Care Standards <span className="font-serif italic text-brand-sage">& Metrics</span>
          </h2>
          <p className="font-sans text-[#8E9299] text-sm mt-4 font-light tracking-wide max-w-xl mx-auto leading-relaxed">
            We hold ourselves to strict artisanal guidelines. Here is why discerning clients trust FreshFold with precious fabrics, designer knits, and everyday sheets.
          </p>
        </div>

        {/* Highlight Grid of 6 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" id="why-choose-us-grid">
          {highlights.map((item, index) => {
            const IconComponent = item.icon;
            return (
              <motion.div
                key={item.idx}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6, delay: index * 0.05 }}
                className="bg-[#161616] hover:bg-[#161616]/90 p-8 border border-white/10 hover:border-brand-sage/40 rounded-2xl transition-all duration-400 group text-left flex flex-col justify-between"
              >
                <div>
                  {/* Card top banner with Index number and Icon */}
                  <div className="flex justify-between items-center mb-6">
                    <span className="font-mono text-xs tracking-wider text-[#8E9299] font-bold group-hover:text-brand-sage transition-colors">
                      {item.idx} // FFC
                    </span>
                    <div className="p-2.5 bg-[#161616] rounded-xl border border-white/10 group-hover:border-brand-sage/20 transition-all">
                      <IconComponent className={`w-5 h-5 ${item.color}`} />
                    </div>
                  </div>

                  {/* Title & Desc */}
                  <h3 className="font-serif text-lg text-white font-medium tracking-wide group-hover:text-brand-sage transition-colors">
                    {item.title}
                  </h3>
                  
                  <p className="font-sans text-[#8E9299] text-xs font-light mt-4 leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-white/10">
                  <span className="font-mono text-[9px] uppercase text-[#8E9299]/70 font-semibold tracking-wider">
                    Verified Quality Standard
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
