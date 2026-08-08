import { Shirt, Shield, Heart } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-brand-charcoal pt-16 pb-12 border-t border-white/5 relative z-10 text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Footer Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pb-12 border-b border-white/10">
          
          {/* Column 1: Brand & Bio (Span: 5) */}
          <div className="md:col-span-5 space-y-6">
            <div className="flex items-center space-x-3">
              <div className="flex w-9 h-9 rounded-xl bg-brand-sage items-center justify-center">
                <Shirt className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-serif text-[15px] tracking-[0.2em] text-white font-medium uppercase">
                  FRESHFOLD
                </span>
                <span className="font-sans text-[8px] tracking-[0.4em] text-brand-sage uppercase font-semibold">
                  LAUNDRY CO.
                </span>
              </div>
            </div>

            <p className="font-sans text-[#8E9299] text-xs font-light leading-relaxed max-w-sm">
              We operate an eco-harmonious laundry concierge. FreshFold Laundry Co. substitutes toxic chemicals with botanical oils, pH-balanced rain filters, and meticulous hand-finishing blocks.
            </p>

            <div className="flex items-center space-x-2 text-[10px] text-[#8E9299]/70 font-mono">
              <Shield className="w-4 h-4 text-brand-sage" />
              <span>Certified Luxury Garment Care Society #1902</span>
            </div>
          </div>

          {/* Column 2: Quick Navigation Links (Span: 3) */}
          <div className="md:col-span-3 space-y-4 text-left">
            <h5 className="font-sans text-[10px] uppercase font-bold tracking-widest text-white">
              Sitemap Navigation
            </h5>
            <ul className="space-y-2.5 font-sans text-xs text-[#8E9299] font-light">
              <li>
                <a href="#services" className="hover:text-brand-sage transition-colors">Curated Offerings</a>
              </li>
              <li>
                <a href="#subscriptions" className="hover:text-brand-sage transition-colors">Membership Pricing</a>
              </li>
              <li>
                <a href="#membership" className="hover:text-brand-sage transition-colors">Patron Digital Pass</a>
              </li>
              <li>
                <a href="#why-choose-us" className="hover:text-brand-sage transition-colors">The FreshFold Codex</a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-brand-sage transition-colors">Operational Timeline</a>
              </li>
              <li className="pt-1.5 border-t border-white/5">
                <a href="#admin" className="hover:text-brand-gold font-semibold text-brand-gold/95 transition-all flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-brand-gold rounded-full inline-block animate-pulse"></span>
                  Supervisor Desk
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Sustainability Statement (Span: 4) */}
          <div className="md:col-span-4 space-y-4 text-left">
            <h5 className="font-sans text-[10px] uppercase font-bold tracking-widest text-white">
              Environmental Codex
            </h5>
            <p className="font-sans text-[#8E9299] text-xs font-light leading-relaxed">
              We pledge to preserve local water ecology. FreshFold strictly rejects traditional perchloroethylene solvent formulas. Instead, our cycles harness organic, biodegradable soap enzymes delicate on skin microflora and fabric threads.
            </p>
            <div className="flex items-center space-x-2 text-[10px] text-brand-sage font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-sage" />
              <span>100% Zero-Carbon Logistic Deliveries by 2028</span>
            </div>
          </div>

        </div>

        {/* Footer Bottom Block */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-left">
            <p className="font-sans text-[11px] text-[#8E9299]/70 font-light">
              &copy; {currentYear} FreshFold Laundry Co. All intellectual properties protected.
            </p>
            <p className="font-mono text-[9px] text-[#8E9299]/50 mt-1 uppercase tracking-tight">
              Crafted in bespoke workspace with organic coordinates.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-[#8E9299]/70 font-light">
            <span>Delivered with care</span>
            <Heart className="w-3 h-3 text-brand-sage fill-brand-sage" />
            <span>worldwide.</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
