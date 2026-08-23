import React, { Suspense, lazy, useState, useEffect } from 'react';
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
import { Booking } from './types';
import * as store from './services/store';
import { Sparkles, ArrowUp, Check } from 'lucide-react';

/**
 * The four heavy surfaces, split out of the first load.
 *
 * All of these are already conditional — the portal renders behind `#portal`,
 * the desk behind `#admin`, the booking form behind a button — but a static
 * import puts them in the entry chunk regardless, so every visitor to the
 * marketing page was downloading the supervisor dashboard, the client portal,
 * Leaflet and the Google Maps bindings before the hero rendered. That was the
 * bulk of a 1.5 MB single chunk.
 *
 * `lazy` makes the conditional render the thing that fetches them. A visitor who
 * never opens the portal never pays for it; one who does waits on a chunk over a
 * connection that has already warmed up, behind the `Suspense` fallback below.
 *
 * `Contact`, `Hero` and the rest stay static: they are the page.
 */
const BookingModal = lazy(() => import('./components/BookingModal'));
const ClientPortal = lazy(() => import('./components/ClientPortal'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const AdminLogin = lazy(() => import('./components/AdminLogin'));
const ChatbotWidget = lazy(() => import('./components/ChatbotWidget'));
const PaystackReturn = lazy(() => import('./components/PaystackReturn'));

/**
 * What shows while one of those chunks is on the wire.
 *
 * Deliberately not a spinner over the whole page. Each of these mounts into a
 * space that was empty a moment ago — a modal, an overlay — so an empty space is
 * the honest intermediate state, and a full-screen loader would be a bigger
 * interruption than the wait it describes.
 */
const Deferred = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={null}>{children}</Suspense>
);
export default function App() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [preselectedService, setPreselectedService] = useState('');
  const [activeBookings, setActiveBookings] = useState<Booking[]>([]);
  /** The subset of the ledger this browser is entitled to see. See the notifier. */
  const [ownBookings, setOwnBookings] = useState<Booking[]>([]);
  const [activeSection, setActiveSection] = useState('hero');
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Portal routing states
  const [isPortalOpen, setIsPortalOpen] = useState(false);
  const [portalBookingId, setPortalBookingId] = useState<string | null>(null);
  /**
   * The token from an emailed setup link, when the portal was opened by one.
   *
   * A token rather than the `setup=true` flag this used to be. The flag paired
   * with a booking id, and a booking id is six digits: anyone could walk them
   * against the public booking route and claim a stranger's account, which is
   * the whole reason the password screen now asks the server what this token
   * opens instead of trusting the URL.
   */
  const [portalSetupToken, setPortalSetupToken] = useState<string | null>(null);

  // Manager admin routing state
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  /**
   * Whether the desk session has been checked with the server yet.
   *
   * Three states, and the distinction matters: `null` means we have not asked,
   * so the dashboard must not render even for a moment; `false` means asked and
   * refused, so show the login. Rendering the dashboard first and hiding it
   * afterwards would put the whole ledger on screen for a frame.
   */
  const [isSupervisor, setIsSupervisor] = useState<boolean | null>(null);

  /**
   * Whether Paystack has just sent this window back.
   *
   * Its own branch rather than a third portal flag, because it replaces the
   * whole page: what lands here is usually a 600×750 popup, and a marketing
   * site is the wrong thing to put in one. See `PaystackReturn`.
   */
  const [isPaystackReturn, setIsPaystackReturn] = useState(false);

  // Re-validate the stored desk token whenever the admin route is entered. It
  // is checked against the server every time rather than trusted from storage —
  // a revoked supervisor should not keep a working dashboard.
  useEffect(() => {
    if (!isAdminOpen) return;

    let cancelled = false;
    setIsSupervisor(null);

    store
      .restoreAdminSession()
      .then((supervisor) => {
        if (!cancelled) setIsSupervisor(Boolean(supervisor));
      })
      .catch(() => {
        if (!cancelled) setIsSupervisor(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdminOpen]);

  // The booking ledger lives on the dispatch server. Read the cached mirror
  // immediately so the first paint has data, then subscribe: every poll that
  // brings back a rider's progress re-renders the portal and the live map.
  useEffect(() => {
    const sync = () => {
      setActiveBookings(store.readBookings());
      setOwnBookings(store.readOwnBookings());
    };

    sync();

    const unsubscribe = store.subscribe(sync);
    const stopSync = store.startSync();

    return () => {
      unsubscribe();
      stopSync();
    };
  }, []);

  /**
   * The one order the floating notifier offers to track: this visitor's own,
   * still in flight, furthest along.
   */
  const trackableBooking =
    ownBookings.find(
      (booking) => booking.status !== 'Delivered' && booking.status !== 'Cancelled'
    ) ?? null;

  // Monitor URL hash/query variations for secure client portal transition triggers
  useEffect(() => {
    const handleHashAndParams = () => {
      const hash = window.location.hash;

      // Checked first, and returning early: this branch owns the whole window,
      // so none of the portal/admin flags below should be touched on the way
      // through.
      if (hash.startsWith('#paystack-success')) {
        setIsPaystackReturn(true);
        return;
      }
      setIsPaystackReturn(false);

      if (hash.startsWith('#portal')) {
        setIsPortalOpen(true);
        setIsAdminOpen(false);
        const queryIdx = hash.indexOf('?');
        if (queryIdx !== -1) {
          const urlParams = new URLSearchParams(hash.substring(queryIdx));
          setPortalBookingId(urlParams.get('bookingId'));
          setPortalSetupToken(urlParams.get('setup'));
        } else {
          setPortalBookingId(null);
          setPortalSetupToken(null);
        }
      } else if (hash.startsWith('#admin')) {
        setIsAdminOpen(true);
        setIsPortalOpen(false);
        setPortalBookingId(null);
        setPortalSetupToken(null);
      } else {
        setIsPortalOpen(false);
        setIsAdminOpen(false);
        setPortalBookingId(null);
        setPortalSetupToken(null);
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

  // Before anything else, and instead of everything else. The header, the
  // marketing sections and the chat bubble are all wrong in a checkout popup.
  if (isPaystackReturn) {
    return (
      <Deferred>
        <PaystackReturn />
      </Deferred>
    );
  }

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

        {/* Interactive Luxury Loyalty */}
        <Membership />

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
      {/* Mounted only once opened: `lazy` fetches on first render, and this
          modal renders nothing until `isOpen`, so gating here is what keeps its
          chunk off the marketing page. */}
      {isBookingOpen && (
        <Deferred>
          <BookingModal
            isOpen={isBookingOpen}
            onClose={() => {
              setIsBookingOpen(false);
              setPreselectedService('');
            }}
            preselectedService={preselectedService}
            onBookingCreated={handleBookingCreated}
          />
        </Deferred>
      )}

      {/* Immersive password-setup & progress-tracking Client Portal */}
      {isPortalOpen && (
        <Deferred>
          <ClientPortal
            isOpen={isPortalOpen}
            onClose={() => {
              setIsPortalOpen(false);
              window.location.hash = '';
            }}
            bookingIdParam={portalBookingId}
            setupTokenParam={portalSetupToken}
            activeBookings={activeBookings}
            onUpdateBookings={(updated) => {
              setActiveBookings(updated);
              store.writeBookings(updated);
            }}
            onOpenBooking={() => {
              setIsBookingOpen(true);
            }}
          />
        </Deferred>
      )}

      {/* Supervisor desk — behind a real login, not a URL fragment. */}
      {isAdminOpen && isSupervisor === false && (
        <Deferred>
          <AdminLogin
            onAuthenticated={() => setIsSupervisor(true)}
            onClose={() => {
              setIsAdminOpen(false);
              window.location.hash = '';
            }}
          />
        </Deferred>
      )}

      {isAdminOpen && isSupervisor === true && (
        <Deferred>
          <AdminDashboard
            isOpen={isAdminOpen}
            onClose={() => {
              setIsAdminOpen(false);
              window.location.hash = '';
            }}
            onSignOut={() => {
              void store.adminLogout();
              setIsSupervisor(false);
            }}
            activeBookings={activeBookings}
            onUpdateBookings={(updated) => {
              setActiveBookings(updated);
              store.writeBookings(updated);
            }}
          />
        </Deferred>
      )}

      {/*
        Floating notifier for an order *this* visitor has on the go.

        Read from `readOwnBookings()`, not from the ledger. It used to show
        `activeBookings[0].id`, and `activeBookings` is every booking on the
        board — so anybody who opened the marketing site was shown the order
        number of the last person to book, whoever they were. Delivered and
        cancelled orders are left out too: there is nothing left to track, and
        a pulsing button that never goes away is not a notification.
      */}
      {trackableBooking && (
        <button
          onClick={() => {
            window.location.hash = '#portal';
          }}
          className="fixed bottom-6 left-6 z-40 bg-black/95 hover:bg-[#161616] border border-brand-sage/60 text-white px-5 py-3.5 rounded-xl text-xs font-bold tracking-wider uppercase shadow-[0_4px_25px_rgba(0,0,0,0.5)] flex items-center space-x-2 animate-pulse group cursor-pointer"
          id="active-order-floating-notifier"
        >
          <span className="w-2 h-2 rounded-full bg-brand-sage" />
          <span>Track Order: {trackableBooking.id}</span>
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
      <Deferred>
        <ChatbotWidget />
      </Deferred>

    </div>
  );
}
