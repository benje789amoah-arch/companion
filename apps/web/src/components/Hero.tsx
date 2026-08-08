import { motion } from 'motion/react';
import { Sparkles, Calendar, ChevronDown, Award, Users, ShieldCheck } from 'lucide-react';

interface HeroProps {
  onOpenBooking: () => void;
  onExplorePlans: () => void;
}

export default function Hero({ onOpenBooking, onExplorePlans }: HeroProps) {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center justify-center bg-brand-charcoal pt-24 overflow-hidden"
    >
      {/* Editorial Sophisticated Background Layer with Lifestyle Image */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&q=80&w=1920"
          alt="Immaculately clean folded white garments and linens"
          className="w-full h-full object-cover opacity-20 filter grayscale contrast-125"
          referrerPolicy="no-referrer"
        />
        {/* Subtle earth-tone and olive-gray circular custom gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-brand-charcoal via-brand-charcoal/90 to-transparent" />
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-brand-sage/5 blur-[120px] pointer-events-none" />
        <div className="absolute top-[30%] -right-[10%] w-[50%] h-[50%] rounded-full bg-brand-gold/5 blur-[150px] pointer-events-none" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
        {/* Dynamic Tagline Banner */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-6"
          id="hero-badge"
        >
          <span className="font-sans text-[11px] uppercase tracking-[0.4em] text-brand-sage font-bold">
            Concierge Care • Bespoke Fabric Hospitality
          </span>
        </motion.div>

        {/* Large Italic Serif Bold Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="font-serif text-5xl sm:text-7xl lg:text-8xl font-light leading-[0.9] tracking-tighter text-white"
          id="hero-headline"
        >
          Laundry <br />
          <span className="italic font-serif font-light text-brand-text-light">Reimagined.</span>
        </motion.h1>

        {/* Sophisticated Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-8 font-sans text-brand-text-muted text-base sm:text-lg max-w-2xl mx-auto leading-relaxed font-light tracking-wide"
          id="hero-subheadline"
        >
          Professional garment care for modern living. Designed for those who value time and precision. We collect, clean, and deliver—elevating your daily routine.
        </motion.p>

        {/* CTA Button Group - Sharp corners & High contrast block styles */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          id="hero-buttons"
        >
          <button
            onClick={onOpenBooking}
            className="w-full sm:w-auto px-10 py-5 bg-white text-black hover:bg-brand-sage hover:text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all duration-300 cursor-pointer flex items-center justify-center space-x-2"
          >
            <Calendar className="w-4 h-4" />
            <span>Schedule Pickup</span>
          </button>
          
          <button
            onClick={onExplorePlans}
            className="w-full sm:w-auto px-10 py-5 bg-transparent hover:bg-white/10 text-white text-xs font-bold tracking-widest uppercase rounded-xl border border-white/20 transition-all duration-300 cursor-pointer flex items-center justify-center space-x-2"
          >
            <span>Explore Plans</span>
          </button>
        </motion.div>

        {/* Micro highlights block (3 Trust factors) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.7 }}
          className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto pt-10 border-t border-white/5 text-left"
          id="hero-stats"
        >
          <div className="flex items-start space-x-3">
            <ShieldCheck className="w-5 h-5 text-brand-sage shrink-0 mt-0.5" />
            <div>
              <h4 className="font-sans text-xs font-semibold uppercase tracking-wider text-white">
                Certified Fabric Experts
              </h4>
              <p className="font-sans text-xs text-stone-400 mt-1 font-light leading-relaxed">
                Eco-safe botanical washes tuned to individual garment threads.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Award className="w-5 h-5 text-brand-gold shrink-0 mt-0.5" />
            <div>
              <h4 className="font-sans text-xs font-semibold uppercase tracking-wider text-white">
                Concierge Delivery
              </h4>
              <p className="font-sans text-xs text-stone-400 mt-1 font-light leading-relaxed">
                Contactless doorstep drop off in beautiful luxury garment shield cases.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Users className="w-5 h-5 text-brand-sage shrink-0 mt-0.5" />
            <div>
              <h4 className="font-sans text-xs font-semibold uppercase tracking-wider text-white">
                5-Star Rated Care
              </h4>
              <p className="font-sans text-xs text-stone-400 mt-1 font-light leading-relaxed">
                Over 12,000 pristine deliveries made for local boutique partners and estates.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: 1 }}
          className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex flex-col items-center cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
          onClick={() => {
            const el = document.getElementById('services');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          id="hero-scroll-indicator"
        >
          <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-stone-500 mb-2">
            Scroll to discover
          </span>
          <ChevronDown className="w-4 h-4 text-brand-sage" />
        </motion.div>
      </div>
    </section>
  );
}
