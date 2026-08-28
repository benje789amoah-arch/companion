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
import { ArrowUp } from 'lucide-react';
import { priceBreakdown } from '@freshfold/core';
import { useIntent } from './intent';
import NextCollection from './components/ui/NextCollection';

/**
 * The four heavy surfaces, split out of the first load.
 *
 * All of these are already conditional — the portal renders behind `#portal`,
 * the desk behind `#admin`, the booking form behind a button — but a static
 * import puts them in the entry chunk regardless, so every visitor to the
 * marketing page was downloading the supervisor dashboard, the client portal
 * and the Google Maps bindings before the hero rendered. That was the
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
  /**
   * What the visitor has told the page so far.
   *
   * `App` used to hold a service name and a count and thread them into the
   * booking form as props — the only one of the page's nine interactive
   * controls whose answer survived being scrolled past. Every control now
   * writes into the shared intent instead, and this reads it for the one thing
   * `App` itself renders: the standing offer at the bottom of a phone.
   */
  const { intent } = useIntent();
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

  const openBooking = () => setIsBookingOpen(true);

  /**
   * The order as it stands, for the sticky bar.
   *
   * Priced through `priceBreakdown` rather than summed here, for the same
   * reason the estimator does: how an order is priced is core's business, and
   * a second copy of that arithmetic on the marketing page is a second number
   * to disagree with the checkout.
   */
  const orderLines = intent.items;
  const orderTotal =
    orderLines.length > 0
      ? priceBreakdown({ serviceType: orderLines[0].serviceType, items: orderLines }).gross
      : 0;

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
    /* `ff` scopes the marketing page's focus ring and its reduced-motion
       escape hatch — see index.css. The portal, the booking modal and the
       supervisor desk render outside it and keep their own. */
    <div className="ff min-h-screen bg-brand-charcoal pb-[4.75rem] font-ui text-white antialiased selection:bg-brand-gold selection:text-brand-charcoal lg:pb-0">

      {/*
        The site header — down while the portal is up.

        The portal used to be a sheet laid over this page with `pt-[72px]`
        reserved so the header showed above it, which put "Book a pickup" and
        the section nav over a customer reading their own delivery window. It
        is its own screen now and paints over this one, but painting over a
        header is not the same as it not being there: it was still in the tab
        order and still on the accessibility tree, so a keyboard or a screen
        reader landed in the marketing nav before reaching the account.

        Same reasoning for the floating controls and the chat bubble below.
      */}
      {!isPortalOpen && (
        <Header
          onOpenBooking={openBooking}
          onOpenPortal={() => {
            window.location.hash = '#portal';
          }}
          onScrollToSection={handleScrollToSection}
          activeSection={activeSection}
        />
      )}

      <main>
        {/* Homepage Hero */}
        <Hero
          onOpenBooking={openBooking}
          onExplorePlans={() => handleScrollToSection('subscriptions')}
        />

        {/* "When would I get it back?", answered off the live dispatch board
            rather than in prose. Directly under the hero because it is the
            second of the three questions the page exists to answer, and the
            hero has just answered the first. */}
        <NextCollection />

        {/* Services Section with custom category targets */}
        <Services onOpenBooking={openBooking} />

        {/* Subscription pricing structures */}
        <Pricing onOpenBooking={openBooking} />

        {/* Loyalty tiers, earned rather than sold */}
        <Membership onOpenBooking={openBooking} />

        {/* Philosophy Core guidelines */}
        <WhyChooseUs />

        {/* Progressive Timeline sequence */}
        <HowItWorks />

        {/* Segment customized panels (Students, Execs, Spas) */}
        <TargetCustomers onOpenBooking={openBooking} />

        {/* Communications, Map and Hours portal */}
        <Contact onOpenBooking={openBooking} />
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
            onClose={() => setIsBookingOpen(false)}
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
      {trackableBooking && !isPortalOpen && (
        <button
          onClick={() => {
            window.location.hash = '#portal';
          }}
          className="fixed bottom-5 left-5 z-[var(--z-floating)] hidden items-center gap-2.5 rounded-md border border-white/15 bg-brand-card/95 px-4 py-3 text-[14px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-sm transition-colors duration-200 hover:border-brand-gold/60 lg:flex"
          id="active-order-floating-notifier"
        >
          {/* The pulse is on the dot, not on the button. A whole control
              breathing in the corner of the page is an alarm, and this is a
              standing offer to look at an order that is going fine. */}
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-sage-light opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-sage-light" />
          </span>
          <span>
            Track order <span className="tnum text-brand-gold">{trackableBooking.id}</span>
          </span>
        </button>
      )}

      {/* Back to Top floating arrow. Desktop only: on a phone the bottom edge
          belongs to the booking bar below, and a second floating control
          fighting it for the same corner is clutter. */}
      {showScrollTop && !isPortalOpen && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-5 right-5 z-[var(--z-floating)] hidden h-11 w-11 place-items-center rounded-md border border-white/15 bg-brand-card/95 text-white shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-sm transition-colors duration-200 hover:border-brand-gold/60 hover:text-brand-gold lg:grid"
          aria-label="Back to top"
          id="scroll-to-top-button"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      {/*
        The phone's standing offer.

        A marketing page on a phone is a long scroll with the one action that
        matters sitting at the very top, out of sight from the second screenful
        onwards. This puts it back within thumb reach without stealing the
        header, and it carries the price so the button is never a cold ask.

        It doubles as the tracker when this visitor has an order on the go:
        that is the reason a returning customer is on this page, and it
        outranks booking another one.
      */}
      {showScrollTop && !isPortalOpen && (
        <div className="fixed inset-x-0 bottom-0 z-[var(--z-floating)] border-t border-white/10 bg-brand-charcoal/95 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {trackableBooking ? (
              <button
                onClick={() => {
                  window.location.hash = '#portal';
                }}
                className="flex min-w-0 flex-1 flex-col text-left"
              >
                <span className="flex items-center gap-1.5 text-[13px] text-brand-text-muted">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-sage-light" />
                  Order in progress
                </span>
                <span className="truncate text-[15px] font-medium text-white">
                  Track <span className="tnum text-brand-gold">{trackableBooking.id}</span>
                </span>
              </button>
            ) : orderLines.length > 0 ? (
              /*
                An order in progress upstairs, carried down the page.

                On a phone the estimator is a screenful somewhere in the middle
                of a long scroll, and the total someone just built stops
                existing the moment they scroll past it. This keeps it under
                their thumb — which is also what makes building one worth the
                trouble on the device most of these visitors are on.
              */
              <button
                onClick={openBooking}
                className="flex min-w-0 flex-1 flex-col text-left"
              >
                <span className="block truncate text-[13px] text-brand-text-muted">
                  {orderLines.length === 1
                    ? orderLines[0].serviceType
                    : `${orderLines.length} services`}
                </span>
                <span className="block text-[15px] font-medium text-white">
                  Your order &middot;{' '}
                  <span className="tnum text-brand-gold">₵{orderTotal}</span>
                </span>
              </button>
            ) : (
              <div className="min-w-0 flex-1">
                <span className="block text-[13px] text-brand-text-muted">
                  Pickup &amp; delivery free
                </span>
                <span className="block text-[15px] font-medium text-white">
                  A wash from <span className="tnum text-brand-gold">₵30</span>
                </span>
              </div>
            )}
            <button
              onClick={openBooking}
              className="shrink-0 rounded-md bg-brand-gold px-5 py-3 text-[15px] font-semibold text-brand-charcoal transition-colors duration-200 hover:bg-brand-gold-light"
            >
              {orderLines.length > 0 && !trackableBooking ? 'Book it' : 'Book a pickup'}
            </button>
          </div>
        </div>
      )}

      {/* The question box. Told where the reader is, so its openers can be
          about what is on screen rather than the same five every time. It is a
          pre-sales opener; a signed-in customer with a live order has the
          message thread on the order itself. */}
      {!isPortalOpen && (
        <Deferred>
          <ChatbotWidget activeSection={activeSection} onOpenBooking={openBooking} />
        </Deferred>
      )}

    </div>
  );
}
