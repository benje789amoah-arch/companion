import { useState } from 'react';
import { motion } from 'motion/react';
import { SERVICES } from '../data';
import { ServiceItem } from '../types';
import * as Lucide from 'lucide-react';

interface ServicesProps {
  onSelectService: (serviceName: string) => void;
}

// Helper to look up Lucide icons by name string
const IconRenderer = ({ name, className }: { name: string; className: string }) => {
  const IconComponent = (Lucide as any)[name];
  if (!IconComponent) return <Lucide.Sparkles className={className} />;
  return <IconComponent className={className} />;
};

export default function Services({ onSelectService }: ServicesProps) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'core' | 'specialized' | 'express'>('all');

  const filteredServices = selectedCategory === 'all'
    ? SERVICES
    : SERVICES.filter(service => service.category === selectedCategory);

  const categories = [
    { id: 'all', label: 'All Offerings' },
    { id: 'core', label: 'Core Fabric Care' },
    { id: 'specialized', label: 'Specialized Restoration' },
    { id: 'express', label: 'Express Logistics' }
  ];

  return (
    <section id="services" className="py-24 bg-brand-charcoal relative border-b border-white/5">
      {/* Decorative ambient gradient */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[70%] h-[40%] rounded-full bg-brand-sage/5 blur-[160px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Editorial Section Header */}
        <div className="text-center md:text-left md:flex md:items-end md:justify-between mb-16">
          <div className="max-w-2xl text-left">
            <span className="font-sans text-[11px] uppercase tracking-[0.4em] text-brand-sage font-bold">
              Bespoke Portfolio
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl text-white font-light tracking-tight mt-3">
              Curated Care <span className="font-serif italic text-brand-sage">for Every Thread</span>
            </h2>
            <p className="font-sans text-stone-400 text-sm mt-4 font-light tracking-wide max-w-xl">
              We approach laundry through traditional high-end craftsmanship principles paired with cutting-edge textile chemistry. Your garments receive isolated, individual attention.
            </p>
          </div>

          {/* Luxury Filter Controls - Sharp & Blocky corrected to curved */}
          <div className="mt-8 md:mt-0 flex flex-wrap gap-2 justify-start" id="services-filter">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as any)}
                className={`px-5 py-2.5 text-xs uppercase tracking-widest font-bold rounded-xl transition-all duration-300 border cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-brand-sage border-brand-sage text-white'
                    : 'bg-transparent border-white/10 text-[#8E9299] hover:text-white hover:border-white/30'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Services Grid with elegant cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" id="services-grid">
          {filteredServices.map((service: ServiceItem, index: number) => (
            <motion.div
              layout
              key={service.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              className="bg-[#161616] border border-white/10 rounded-2xl overflow-hidden flex flex-col group min-h-[420px] transition-all duration-300 hover:border-brand-sage/50"
            >
              {/* Card Image Cover with delicate hover scale */}
              <div className="relative h-48 overflow-hidden bg-stone-900 shrink-0">
                <img
                  src={service.imageUrl}
                  alt={service.name}
                  className="w-full h-full object-cover grayscale transition-all duration-700 ease-out group-hover:scale-110 group-hover:grayscale-0"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#161616] via-[#161616]/20 to-transparent" />
                <div className="absolute top-4 left-4 p-2 bg-black border-2 border-white rounded-xl">
                  <IconRenderer name={service.iconName} className="w-4 h-4 text-white group-hover:text-brand-sage transition-colors duration-300" />
                </div>
                <div className="absolute bottom-3 right-4 bg-brand-sage text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg border border-white/10">
                  {service.priceInfo}
                </div>
              </div>

              {/* Card Contents */}
              <div className="p-6 flex flex-col flex-grow text-left">
                <h3 className="font-serif text-lg text-white font-medium group-hover:text-brand-sage transition-colors duration-300">
                  {service.name}
                </h3>
                
                <p className="font-sans text-[#8E9299] text-xs font-light mt-3 leading-relaxed flex-grow">
                  {service.description}
                </p>

                {/* Card CTA Trigger */}
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className="font-sans text-[10px] uppercase text-[#8E9299]/50 tracking-wider font-semibold">
                    Luxury Standard
                  </span>
                  <button
                    onClick={() => onSelectService(service.name)}
                    className="text-brand-sage hover:text-white font-sans text-xs uppercase tracking-widest font-semibold flex items-center space-x-1 transition-colors group/btn cursor-pointer"
                  >
                    <span>Book Care</span>
                    <Lucide.ChevronRight className="w-3 h-3 transform group-hover/btn:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
