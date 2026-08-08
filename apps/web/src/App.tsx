import { useState, useEffect } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import Services from './components/Services';
import Pricing from './components/Pricing';
import Membership from './components/Membership';
import WhyChooseUs from './components/WhyChooseUs';
import HowItWorks from './components/HowItWorks';
import TargetCustomers from './components/TargetCustomers';
import Contact from './components/Contact';
import Footer from './components/Footer';
import BookingModal from './components/BookingModal';
import ClientPortal from './components/ClientPortal';
import AdminDashboard from './components/AdminDashboard';
import ChatbotWidget from './components/ChatbotWidget';
import { Booking } from './types';
import * as store from './services/store';
import { Sparkles, ArrowUp, Check } from 'lucide-react';

export default function App() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [preselectedService, setPreselectedService] = useState('');
  const [activeBookings, setActiveBookings] = useState<Booking[]>([]);
  const [activeSection, setActiveSection] = useState('hero');
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Portal routing states
  const [isPortalOpen, setIsPortalOpen] = useState(false);
  const [portalBookingId, setPortalBookingId] = useState<string | null>(null);
  const [portalSetupMode, setPortalSetupMode] = useState(false);

  // Manager admin routing state
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // The booking ledger lives on the dispatch server. Read the cached mirror
  // immediately so the first paint has data, then subscribe: every poll that
  // brings back a rider's progress re-renders the portal and the live map.
  useEffect(() => {
    setActiveBookings(store.readBookings());

    const unsubscribe = store.subscribe(() => setActiveBookings(store.readBookings()));
    const stopSync = store.startSync();

    return () => {
      unsubscribe();
      stopSync();
    };
  }, []);

  // Monitor URL hash/query variations for secure client portal transition triggers
  useEffect(() => {
    const handleHashAndParams = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#portal')) {
        setIsPortalOpen(true);
        setIsAdminOpen(false);
        const queryIdx = hash.indexOf('?');
        if (queryIdx !== -1) {
          const urlParams = new URLSearchParams(hash.substring(queryIdx));
          setPortalBookingId(urlParams.get('bookingId'));
          setPortalSetupMode(urlParams.get('setup') === 'true');
        } else {
          setPortalBookingId(null);
          setPortalSetupMode(false);
        }
      } else if (hash.startsWith('#admin')) {
        setIsAdminOpen(true);
        setIsPortalOpen(false);
        setPortalBookingId(null);
        setPortalSetupMode(false);
      } else {
        setIsPortalOpen(false);
        setIsAdminOpen(false);
        setPortalBookingId(null);
        setPortalSetupMode(false);
      }
    };
    
    handleHashAndParams();
    window.addEventListener('hashchange', handleHashAndParams);
    return () => window.removeEventListener('hashchange', handleHashAndParams);
  }, []);

  // Monitor scrolling to highlight appropriate header tags and show Back to Top button
  useEffect(() => {
    const handleScroll = () => {
      // Back to top button visibility check
      setShowScrollTop(window.scrollY > 500);

      const scrollPosition = window.scrollY + 200;
      const sections = [
        { id: 'hero', top: 0 },
        { id: 'services', el: document.getElementById('services') },
        { id: 'subscriptions', el: document.getElementById('subscriptions') },
        { id: 'membership', el: document.getElementById('membership') },
        { id: 'why-choose-us', el: document.getElementById('why-choose-us') },
        { id: 'how-it-works', el: document.getElementById('how-it-works') },
        { id: 'target-customers', el: document.getElementById('target-customers') },
        { id: 'contact', el: document.getElementById('contact') },
      ];

      for (let i = sections.length - 1; i >= 0; i--) {
        const item = sections[i];
        if (item.el) {
          const offsetTop = item.el.offsetTop;
          if (scrollPosition >= offsetTop) {
            setActiveSection(item.id);
            break;
          }
        } else if (item.id === 'hero' && scrollPosition < 400) {
          setActiveSection('hero');
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      // Smooth travel transitions
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (sectionId === 'hero') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleOpenBookingWithService = (serviceName: string) => {
    setPreselectedService(serviceName);
    setIsBookingOpen(true);
  };

  const handleBookingCreated = (newBooking: Booking) => {
    setActiveBookings((prev) => [newBooking, ...prev]);
  };

  return (
    <div className="min-h-screen bg-brand-charcoal text-white font-sans antialiased selection:bg-brand-sage selection:text-brand-charcoal">
      
      {/* Universal Floater Header */}
      <Header
        onOpenBooking={() => handleOpenBookingWithService('')}
        onOpenPortal={() => {
          window.location.hash = '#portal';
        }}
        onScrollToSection={handleScrollToSection}
        activeSection={activeSection}
      />

      <main>
        {/* Homepage Hero */}
        <Hero
          onOpenBooking={() => handleOpenBookingWithService('')}
          onExplorePlans={() => handleScrollToSection('subscriptions')}
        />

        {/* Services Section with custom category targets */}
        <Services onSelectService={handleOpenBookingWithService} />

        {/* Subscription pricing structures */}
        <Pricing onSelectPlan={handleOpenBookingWithService} />

        {/* Interactive Luxury Loyalty and tracking */}
        <Membership activeBookings={activeBookings} />

        {/* Philosophy Core guidelines */}
        <WhyChooseUs />

        {/* Progressive Timeline sequence */}
        <HowItWorks />

        {/* Segment customized panels (Students, Execs, Spas) */}
        <TargetCustomers onSelectCustomerType={handleOpenBookingWithService} />

        {/* Communications, Map and Hours portal */}
        <Contact />
      </main>

      {/* Footer copyright */}
      <Footer />

      {/* Digital Scheduling Modal form container */}
      <BookingModal
        isOpen={isBookingOpen}
        onClose={() => {
          setIsBookingOpen(false);
          setPreselectedService('');
        }}
        preselectedService={preselectedService}
        onBookingCreated={handleBookingCreated}
      />

      {/* Immersive password-setup & progress-tracking Client Portal */}
      {isPortalOpen && (
        <ClientPortal
          isOpen={isPortalOpen}
          onClose={() => {
            setIsPortalOpen(false);
            window.location.hash = '';
          }}
          bookingIdParam={portalBookingId}
          setupModeParam={portalSetupMode}
          activeBookings={activeBookings}
          onUpdateBookings={(updated) => {
            setActiveBookings(updated);
            store.writeBookings(updated);
          }}
          onOpenBooking={() => {
            setIsBookingOpen(true);
          }}
        />
      )}

      {/* Authorized Manager Admin Dashboard */}
      {isAdminOpen && (
        <AdminDashboard
          isOpen={isAdminOpen}
          onClose={() => {
            setIsAdminOpen(false);
            window.location.hash = '';
          }}
          activeBookings={activeBookings}
          onUpdateBookings={(updated) => {
            setActiveBookings(updated);
            store.writeBookings(updated);
          }}
        />
      )}

      {/* Floating Active Delivery Notifier (Quick indicator if a booking exists in local session) */}
      {activeBookings.length > 0 && (
        <button
          onClick={() => {
            window.location.hash = '#portal';
          }}
          className="fixed bottom-6 left-6 z-40 bg-black/95 hover:bg-[#161616] border border-brand-sage/60 text-white px-5 py-3.5 rounded-xl text-xs font-bold tracking-wider uppercase shadow-[0_4px_25px_rgba(0,0,0,0.5)] flex items-center space-x-2 animate-pulse group cursor-pointer"
          id="active-order-floating-notifier"
        >
          <span className="w-2 h-2 rounded-full bg-brand-sage" />
          <span>Track Order: {activeBookings[0].id}</span>
        </button>
      )}

      {/* Back to Top floating arrow */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-24 right-6 z-40 p-3 bg-brand-sage hover:bg-white hover:text-black text-white rounded-xl shadow-xl transition-all duration-300 transform hover:scale-105 cursor-pointer border border-white/10"
          aria-label="Back to top"
          id="scroll-to-top-button"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      {/* AI Chatbot Widget */}
      <ChatbotWidget />

    </div>
  );
}
