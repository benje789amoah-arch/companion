import { useState, useEffect } from 'react';
import { Menu, X, Shirt, Calendar, Shield } from 'lucide-react';

interface HeaderProps {
  onOpenBooking: () => void;
  onOpenPortal: () => void;
  onScrollToSection: (sectionId: string) => void;
  activeSection: string;
}

export default function Header({ onOpenBooking, onOpenPortal, onScrollToSection, activeSection }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { id: 'services', label: 'Services' },
    { id: 'subscriptions', label: 'Plans' },
    { id: 'membership', label: 'Membership' },
    { id: 'why-choose-us', label: 'Philosophy' },
    { id: 'how-it-works', label: 'Process' },
    { id: 'target-customers', label: 'Sectors' },
    { id: 'contact', label: 'Contact' },
  ];

  return (
    <header
      id="main-header"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? 'bg-brand-charcoal/80 backdrop-blur-md py-4 border-b border-white/5'
          : 'bg-transparent py-6'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Brand Logo */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center space-x-2 group cursor-pointer"
            id="logo-button"
          >
            <div className="w-10 h-10 rounded-xl border-2 border-white flex items-center justify-center font-black text-lg text-white group-hover:bg-brand-sage group-hover:border-brand-sage transition-all duration-300">
              FF
            </div>
            <div className="flex items-baseline">
              <span className="text-xl font-bold tracking-tighter uppercase text-white">
                FreshFold
              </span>
              <span className="text-xs text-brand-text-muted ml-1 lowercase font-light">
                laundry co.
              </span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-10" id="desktop-nav">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onScrollToSection(item.id)}
                className={`font-sans text-[11px] font-semibold uppercase tracking-[0.2em] transition-all duration-300 relative py-1 cursor-pointer ${
                  activeSection === item.id
                    ? 'text-brand-sage opacity-100'
                    : 'text-[#8E9299] opacity-70 hover:opacity-100 hover:text-white'
                }`}
                id={`nav-${item.id}`}
              >
                {item.label}
                {activeSection === item.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-sage" />
                )}
              </button>
            ))}
          </nav>

          {/* Desktop Call to Action */}
          <div className="hidden lg:flex items-center space-x-2.5 ml-8" id="desktop-cta-buttons">
            <button
              onClick={onOpenPortal}
              className="px-3 py-1.5 border border-white/10 hover:border-brand-sage hover:text-white text-stone-300 hover:bg-brand-sage/20 text-[9.5px] font-bold uppercase tracking-widest rounded-lg transition-all duration-350 cursor-pointer"
              id="cta-portal-desktop"
            >
              Client Portal
            </button>
            {/* The supervisor desk is staff-only, so it is not advertised in
                the customer-facing nav. Its way in is the discreet link in the
                footer — see Footer.tsx — and it is gated on a real login
                either way. */}
            <button
              onClick={onOpenBooking}
              className="px-4 py-2 bg-white text-black hover:bg-brand-sage hover:text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all duration-350 cursor-pointer"
              id="cta-schedule-desktop"
            >
              Schedule Pickup
            </button>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-stone-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Toggle menu"
              id="mobile-menu-trigger"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      <div
        className={`fixed inset-0 top-[72px] bg-brand-charcoal z-40 lg:hidden transition-all duration-500 ease-in-out border-t border-white/5 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        id="mobile-drawer"
      >
        <div className="px-6 py-8 space-y-6 flex flex-col h-full bg-brand-charcoal text-left">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setMobileMenuOpen(false);
                setTimeout(() => onScrollToSection(item.id), 250);
              }}
              className={`text-base font-serif tracking-wider text-left py-2 border-b border-white/5 cursor-pointer flex justify-between items-center ${
                activeSection === item.id ? 'text-brand-sage' : 'text-stone-300'
              }`}
              id={`nav-mobile-${item.id}`}
            >
              <span>{item.label}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${activeSection === item.id ? 'bg-brand-sage' : 'bg-transparent'}`} />
            </button>
          ))}
          <div className="pt-6 space-y-2.5">
            <button
               onClick={() => {
                 setMobileMenuOpen(false);
                 onOpenPortal();
               }}
               className="w-full py-3 bg-[#161616] text-white border border-white/10 text-center text-[11px] font-bold tracking-widest uppercase rounded-xl hover:bg-brand-sage hover:border-brand-sage transition-all cursor-pointer flex items-center justify-center space-x-2"
               id="cta-portal-mobile"
             >
               <Shield className="w-3.5 h-3.5 text-brand-sage" />
               <span>Client Portal</span>
             </button>
             <button
               onClick={() => {
                 setMobileMenuOpen(false);
                 onOpenBooking();
               }}
               className="w-full py-3 bg-white text-black text-center text-[11px] font-bold tracking-widest uppercase rounded-xl hover:bg-brand-sage hover:text-white transition-colors cursor-pointer flex items-center justify-center space-x-2"
               id="cta-schedule-mobile"
             >
               <Calendar className="w-3.5 h-3.5" />
               <span>Schedule Pickup</span>
             </button>
          </div>
        </div>
      </div>
    </header>
  );
}
