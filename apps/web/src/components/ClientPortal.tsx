import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Booking, UserAccount } from '../types';
import * as store from '../services/store';
import {
  ApiError,
  BOOKING_STAGE_SEQUENCE,
  LOYALTY_REWARDS,
  bookingProgressPercent,
  membershipPlan,
  tierForPoints,
  tierProgress,
  type JobStatus,
  type LoyaltyTierId,
  type Message,
} from '@freshfold/core';
import { 
  X, Shield, Lock, Smartphone, Mail, Sparkles, User, LogOut,
  MapPin, Calendar, Clock, ChevronRight, CheckCircle2, History,
  Award, Play, Plus, RefreshCw, Send, AlertTriangle, AlertCircle,
  CreditCard, Wallet, Banknote, QrCode, Receipt, DollarSign, CheckCircle, Trash2
} from 'lucide-react';
import LiveDispatchMap from './LiveDispatchMap';
import HandoffCode from './HandoffCode';

/**
 * Dispatch states in which the bags are still with the customer, and the
 * collection code is therefore worth showing.
 */
const COLLECTION_PENDING = new Set<JobStatus>([
  'unassigned',
  'assigned',
  'navigating_to_pickup',
  'arrived_at_pickup',
]);

/**
 * And the states in which the clean laundry is on its way back, so the
 * delivery code is the one worth showing. It appears as the courier sets off
 * rather than when they knock — a customer who has to hunt for it with
 * somebody waiting at the door will just read out whatever is nearest.
 */
const DELIVERY_PENDING = new Set<JobStatus>([
  'ready_for_delivery',
  'navigating_to_delivery',
  'arrived_at_delivery',
]);

/**
 * Who a message is from, in the customer's language. The wire values are the
 * dispatch team's own vocabulary, and "laundry_center" on a bubble helps
 * nobody.
 */
const SENDER_LABELS: Record<Message['sender'], string> = {
  rider: 'Your Courier',
  customer: 'You',
  dispatcher: 'Dispatch Desk',
  laundry_center: 'Bomso Atelier',
};

/**
 * How each loyalty tier is dressed here.
 *
 * The tiers themselves — names, thresholds, discounts, benefits — come from
 * `@freshfold/core` and are shared with the customer app and the server. This
 * portal used to carry its own table inline, with Silver starting at 400 points
 * and Gold at 700 against 500 and 1500 everywhere else, so the same customer
 * read as Gold on the website and Silver in the app. Only the Tailwind classes
 * are local now, because only they are specific to this surface.
 */
const TIER_STYLES: Record<LoyaltyTierId, {
  colorClass: string;
  borderColor: string;
  bgGradient: string;
  radialGradient: string;
  badgeColor: string;
}> = {
  gold: {
    colorClass: 'text-[#c5a880]',
    borderColor: 'border-[#c5a880]/30',
    bgGradient: 'from-[#1C1C16] to-[#0A0A0A]',
    radialGradient: 'from-[#c5a880]/15',
    badgeColor: 'bg-brand-gold/10 text-brand-gold border-brand-gold/20',
  },
  silver: {
    colorClass: 'text-slate-300',
    borderColor: 'border-slate-500/30',
    bgGradient: 'from-[#1F2022] to-[#0E0F10]',
    radialGradient: 'from-slate-400/10',
    badgeColor: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  },
  basic: {
    colorClass: 'text-amber-600',
    borderColor: 'border-amber-700/30',
    bgGradient: 'from-[#1A1412] to-[#0E0C0B]',
    radialGradient: 'from-amber-700/10',
    badgeColor: 'bg-amber-700/10 text-amber-500 border-amber-700/20',
  },
};

/** What `GET /api/auth/claim` hands back for a live setup link. */
interface SetupBooking {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface ClientPortalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingIdParam: string | null;
  /** The token from an emailed setup link, or null when this is a plain visit. */
  setupTokenParam: string | null;
  activeBookings: Booking[];
  onUpdateBookings: (bookings: Booking[]) => void;
  onOpenBooking: () => void;
}

export default function ClientPortal({
  isOpen,
  onClose,
  bookingIdParam,
  setupTokenParam,
  activeBookings,
  onUpdateBookings,
  onOpenBooking
}: ClientPortalProps) {
  // Authentication states
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [inputIdentifier, setInputIdentifier] = useState(''); // Email or Phone
  const [inputPassword, setInputPassword] = useState('');
  
  // Setup Password states
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  /**
   * The booking a setup link opens, as the server describes it.
   *
   * Not a full `Booking`: the token buys the contact details this screen shows
   * and nothing else — no address, no payment, no hand-off codes. What the
   * order is doing is the tracking terminal's business, once there is a login.
   */
  const [setupBooking, setSetupBooking] = useState<SetupBooking | null>(null);
  const [setupError, setSetupError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // The unconfirmed-email notice. `verifyNotice` carries whatever the server
  // last said — a cooldown message is more useful to show than to swallow.
  const [verifySending, setVerifySending] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<string>('');

  // The reset request is in flight. Its outcome rides on the existing
  // success/error banners rather than a third one — the sign-in card already
  // has two places to look, and a locked-out customer does not need a fourth.
  const [resetSending, setResetSending] = useState(false);

  // And the same for "send my setup link again", which shares those banners.
  const [setupSending, setSetupSending] = useState(false);

  // Active User Data states
  const [userBookings, setUserBookings] = useState<Booking[]>([]);
  const [activeTrackingId, setActiveTrackingId] = useState<string | null>(null);

  // Portal Payment Modal states
  const [payModalBooking, setPayModalBooking] = useState<Booking | null>(null);
  const [payMethod, setPayMethod] = useState<'Paystack' | 'MTN MoMo' | 'Telecel Cash' | 'AT Money' | 'Card' | 'Wallet'>('Paystack');
  const [payMomoNum, setPayMomoNum] = useState('');
  const [payMomoPin, setPayMomoPin] = useState('');
  const [payUssdPrompt, setPayUssdPrompt] = useState(false);

  // Paystack portal states
  const [paystackLoading, setPaystackLoading] = useState(false);
  const [paystackAuthUrl, setPaystackAuthUrl] = useState('');
  const [paystackRef, setPaystackRef] = useState('');
  const [paystackError, setPaystackError] = useState('');

  const handlePortalPaystackInit = async () => {
    if (!payModalBooking) return;
    setPaystackLoading(true);
    setPaystackError('');
    try {
      const userEmail = currentUser?.email || payModalBooking.email || 'patron@freshfold.com';
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          amount: payModalBooking.amount || 35,
          metadata: {
            booking_id: payModalBooking.id,
            customer_name: currentUser?.name || payModalBooking.name,
          }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.error || 'Failed to initialize Paystack checkout.');
      }
      setPaystackAuthUrl(data.authorization_url);
      setPaystackRef(data.reference);
      window.open(data.authorization_url, '_blank', 'width=600,height=750');
    } catch (err: any) {
      setPaystackError(err.message || 'Error connecting to Paystack.');
    } finally {
      setPaystackLoading(false);
    }
  };

  const handlePortalPaystackVerify = async () => {
    if (!paystackRef || !payModalBooking) return;
    setPaystackLoading(true);
    setPaystackError('');
    try {
      const res = await fetch(`/api/paystack/verify/${encodeURIComponent(paystackRef)}`);
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.error || 'Payment verification failed.');
      }
      if (data.data && data.data.status === 'success') {
        handleCompletePayment(payModalBooking.id);
        alert('Paystack Payment Confirmed!');
      } else {
        alert(`Status: ${data.data?.status || 'pending'}. Complete the transaction in the popup window and retry.`);
      }
    } catch (err: any) {
      setPaystackError(err.message || 'Error verifying Paystack transaction.');
    } finally {
      setPaystackLoading(false);
    }
  };

  // Wallet top-up states
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('100');
  const [topUpPaystackLoading, setTopUpPaystackLoading] = useState(false);
  const [topUpPaystackAuthUrl, setTopUpPaystackAuthUrl] = useState('');
  const [topUpPaystackRef, setTopUpPaystackRef] = useState('');
  const [topUpPaystackError, setTopUpPaystackError] = useState('');

  const handleWalletPaystackInit = async () => {
    const amt = parseFloat(topUpAmount) || 0;
    if (amt <= 0) {
      setTopUpPaystackError('Please specify a valid top-up amount.');
      return;
    }
    setTopUpPaystackLoading(true);
    setTopUpPaystackError('');
    try {
      const userEmail = currentUser?.email || 'patron@freshfold.com';
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          amount: amt,
          metadata: {
            type: 'wallet_topup',
            customer_name: currentUser?.name || 'Patron',
          }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.error || 'Failed to initialize Paystack checkout.');
      }
      setTopUpPaystackAuthUrl(data.authorization_url);
      setTopUpPaystackRef(data.reference);
      window.open(data.authorization_url, '_blank', 'width=600,height=750');
    } catch (err: any) {
      setTopUpPaystackError(err.message || 'Error connecting to Paystack.');
    } finally {
      setTopUpPaystackLoading(false);
    }
  };

  const handleWalletPaystackVerify = async () => {
    if (!topUpPaystackRef) return;
    setTopUpPaystackLoading(true);
    setTopUpPaystackError('');
    try {
      const res = await fetch(`/api/paystack/verify/${encodeURIComponent(topUpPaystackRef)}`);
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.error || 'Payment verification failed.');
      }
      if (data.data && data.data.status === 'success') {
        const amt = parseFloat(topUpAmount) || (data.data.amount / 100) || 0;

        // Credited by the server, keyed on Paystack's own reference — so this
        // verify running twice, in two tabs or after a retry, credits once.
        const account = await store.topUpWallet(amt, 'Paystack', topUpPaystackRef);

        setTopUpModalOpen(false);
        setTopUpPaystackAuthUrl('');
        setTopUpPaystackRef('');
        setSuccessMsg(
          `Wallet topped up with ₵${amt.toFixed(2)} GHS via Paystack. ` +
          `New balance: ₵${(account.walletBalance ?? 0).toFixed(2)} GHS`
        );
      } else {
        alert(`Status: ${data.data?.status || 'pending'}. Complete payment in Paystack checkout and retry.`);
      }
    } catch (err: any) {
      setTopUpPaystackError(err.message || 'Error verifying Paystack transaction.');
    } finally {
      setTopUpPaystackLoading(false);
    }
  };

  // Filter & Concierge states
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [conciergeOpen, setConciergeOpen] = useState(false);
  const [conciergeText, setConciergeText] = useState('');
  const [conciergeSuccess, setConciergeSuccess] = useState('');

  /**
   * The order thread, mirrored from the dispatch server.
   *
   * The same conversation the rider sees in the companion app, so a courier
   * asking which buzzer to press gets an answer here rather than nowhere. The
   * subscription covers both directions: our own sends notify synchronously,
   * and the five-second poll brings the rider's replies in.
   */
  const [messages, setMessages] = useState<Message[]>(() => store.readMessages());
  useEffect(() => {
    return store.subscribe(() => setMessages(store.readMessages()));
  }, []);

  const threadOrderId = activeTrackingId ?? userBookings[0]?.id ?? null;
  const thread = threadOrderId
    ? messages.filter((message) => message.orderId === threadOrderId)
    : [];

  // Main portal navigation tab state
  const [activePortalTab, setActivePortalTab] = useState<'dashboard' | 'orders' | 'wallet' | 'settings'>('dashboard');
  const [receiptModalBooking, setReceiptModalBooking] = useState<Booking | null>(null);
  const [userAddress, setUserAddress] = useState('KNUST Gaza Hostel, Room 304, Ayeduase');
  const [userHostel, setUserHostel] = useState('Gaza Hostel, Room 304');
  const [userSuburb, setUserSuburb] = useState('Ayeduase');
  const [savedSettingsMsg, setSavedSettingsMsg] = useState('');
  const [redeemedRewardMsg, setRedeemedRewardMsg] = useState('');

  /**
   * The balance and the points, straight off the account.
   *
   * Both were invented here until now: the wallet was a `useState(150)` that
   * only reloaded when the signed-in user changed, and the points fell back to
   * 750 for anybody whose account had none. A customer saw ₵150 and 750 points
   * in this portal and ₵0 and 0 in the app, for the same account, on the same
   * day. There is nothing to fall back to — the server owns both, `pull()`
   * re-reads them every five seconds, and every movement goes through
   * `/api/accounts/wallet` and comes back as a new account.
   */
  const walletBalance = currentUser?.walletBalance ?? 0;
  const patronPoints = currentUser?.points ?? 0;

  const tier = tierForPoints(patronPoints);
  const { next: nextTier, pointsToNext, percent: tierPercent } = tierProgress(patronPoints);

  /**
   * The membership the customer is actually paying for, as opposed to the tier
   * their points have earned. The portal had no notion of one at all, while the
   * app read it off `account.plan` — so a paid subscription was invisible here.
   */
  const activePlan = currentUser?.plan ?? null;
  const activePlanDefinition = membershipPlan(activePlan?.planId);

  /**
   * Who is signed in, and everything that hangs off them.
   *
   * The subscription is the change that matters: this used to read the profile
   * once on mount and never again, so a top-up made in the customer app, a
   * membership renewal the server settled, or points earned on an order all sat
   * invisible here until the next sign-in. `pull()` now re-reads `/auth/me` on
   * every poll and notifies, so the balance on this screen is the balance.
   */
  useEffect(() => {
    // Show the cached profile immediately, then check the token is still good.
    // An expired or revoked session resolves to null and signs the patron out
    // rather than leaving the portal looking authenticated when it isn't.
    setCurrentUser(store.readCurrentUser());

    const unsubscribe = store.subscribe(() => setCurrentUser(store.readCurrentUser()));

    let cancelled = false;
    store.restoreSession().then((account) => {
      if (!cancelled) setCurrentUser(account);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /**
   * This customer's orders, scoped by the server.
   *
   * The portal used to pull the entire ledger — every customer's orders, to
   * every browser that opened this panel — and filter it here on `email OR
   * samePhone`. The app asked the server for one customer's history instead,
   * which matched on email alone, so the two surfaces disagreed about which
   * orders belonged to whom. `GET /api/bookings?email=` now covers both: it
   * matches the address *and* the number on that account, and it is the only
   * list either surface reads.
   */
  useEffect(() => {
    if (!currentUser) {
      setUserBookings([]);
      setActiveTrackingId(null);
      return;
    }

    let cancelled = false;

    const load = () => {
      store.readUserBookings(currentUser.email)
        .then((matched) => {
          if (cancelled) return;
          setUserBookings(matched);
          setActiveTrackingId((current) => current ?? matched[0]?.id ?? null);
        })
        .catch(() => {
          // Offline. Whatever the last load produced stays on screen.
        });
    };

    load();
    const unsubscribe = store.subscribe(load);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentUser?.email, activeBookings]);

  // Resolve the emailed setup link into the booking it opens
  useEffect(() => {
    if (!setupTokenParam) {
      setSetupBooking(null);
      return;
    }

    // Asked of the server, never read out of the URL or the local mirror. The
    // token is the only claim this browser has to the order — it arrived in the
    // customer's inbox — and the server is the only thing that can say whether
    // it is still good. A link opened on a phone that has never seen this site
    // works for exactly the same reason.
    let cancelled = false;
    setSetupError('');

    store
      .readSetupLink(setupTokenParam)
      .then((booking) => {
        if (cancelled) return;
        setSetupBooking(booking);
        setInputIdentifier(booking.email); // Pre-fill email
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSetupBooking(null);
        setSetupError(
          e instanceof ApiError
            ? e.message
            : 'Could not open this setup link. Check your connection and try again.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [setupTokenParam]);

  // Handle setting/creating a new secure password
  const handleSetupPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');
    setSuccessMsg('');

    if (!setupTokenParam || !setupBooking) {
      setSetupError('No active booking state is associated with this link.');
      return;
    }

    if (setupPassword.length < 5) {
      setSetupError('Password must be at least 5 characters for luxury grade protection.');
      return;
    }

    if (setupPassword !== setupConfirmPassword) {
      setSetupError('Confirmation password does not match.');
      return;
    }

    try {
      // Which account this opens is decided by the token, not by the fields on
      // screen — those are shown so the customer can see what they are claiming,
      // and are not sent. The password goes to the server and is hashed there;
      // it is never held in this browser.
      const account = await store.claimBooking(setupTokenParam, setupPassword);

      // The spent token leaves the URL in the same beat the terminal opens.
      //
      // These used to be 1.5 seconds apart, which put the setup card and the
      // signed-in portal on screen together — the overlap the note on
      // `AnimatePresence` above is about. There is also nothing left to read on
      // the card by then: the account exists and the terminal is the answer.
      setCurrentUser(account);
      window.location.hash = '#portal';
      setSuccessMsg('Patron account certified successfully.');

    } catch (e) {
      // Two refusals mean the same thing to the customer: this link cannot set
      // a password, and pressing the button again will not change that. A 409 is
      // an account that already has one; a spent link is usually a previous
      // attempt that reached the server and lost only its response, leaving an
      // account the customer was told had failed. Both end at sign-in, with the
      // address already filled in, rather than at a refusal they cannot act on.
      const spent =
        e instanceof ApiError &&
        (e.status === 409 ||
          (typeof e.body === 'object' &&
            e.body !== null &&
            (e.body as { code?: string }).code === 'SETUP_LINK_INVALID'));

      if (spent) {
        setInputIdentifier(setupBooking.email);
        setLoginError(
          'This contact already has a password — your account may have been created on an earlier attempt. Sign in below, or use the reset link if you do not have the password.'
        );
        window.location.hash = '#portal';
        return;
      }

      setSetupError(e instanceof Error ? e.message : 'Could not create your credentials. Please try again.');
    }
  };

  /**
   * Sign in.
   *
   * The password is posted to the server and compared there. This component
   * never sees a stored credential — which is the point: the account list it
   * can read carries no password material at all.
   */
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setSuccessMsg('');

    if (!inputIdentifier || !inputPassword) {
      setLoginError('Credentials fields cannot be left empty.');
      return;
    }

    try {
      const account = await store.login(inputIdentifier, inputPassword);
      setCurrentUser(account);
      setInputPassword('');
      setSuccessMsg('Welcome back, Patron.');
    } catch (e) {
      // A rejected sign-in may just mean this patron has a booking but has
      // never chosen a password, so point them at setup rather than leaving
      // them stuck on "wrong credentials".
      const bookingMatch = store.readBookings().find(b => {
        const cleanInp = inputIdentifier.toLowerCase().trim();
        return b.email.toLowerCase() === cleanInp || samePhone(b.phone, cleanInp);
      });

      if (bookingMatch) {
        setLoginError(`We found your booking ${bookingMatch.id} under this contact! However, you haven't chosen a secure login password yet. Open the setup link in your booking confirmation email — or press "Send my setup link again" below and we will mail you a fresh one.`);
      } else {
        setLoginError(e instanceof Error ? e.message : 'No matching patron credentials found. Please double-check formatting or schedule a pickup to sign up.');
      }
    }
  };

  /**
   * Asks for a password-reset link.
   *
   * This control was a dead `<a>` with no handler and a `cursor-not-allowed`
   * class — it looked live and did nothing, which is worse than not offering
   * it, because the customer it is aimed at is already locked out.
   *
   * The confirmation says the same thing whether or not that contact has an
   * account. The server refuses to distinguish them so that this endpoint
   * cannot be used to find out who banks here, and a message that varied would
   * hand back precisely what the server withheld.
   */
  const handleForgotPassword = async () => {
    const identifier = inputIdentifier.trim();

    if (!identifier) {
      setLoginError('Enter your email or phone number above first, then press Reset Password.');
      return;
    }

    setLoginError('');
    setSuccessMsg('');
    setResetSending(true);

    try {
      await store.requestPasswordReset(identifier);
      setSuccessMsg(
        `If ${identifier} has a FreshFold account, a reset link is on its way. It is good for one hour — check your spam folder too.`
      );
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : 'Could not reach FreshFold just now. Please try again shortly.'
      );
    } finally {
      setResetSending(false);
    }
  };

  /**
   * Asks for the setup link to be sent again.
   *
   * For the patron who booked as a guest and no longer has the confirmation
   * email. Reset Password cannot help them — there is no account to reset until
   * a setup link has been spent — so this is the only way back to a password
   * for a booking, and the sign-in card offers both side by side.
   *
   * Says the same thing whatever the server found, for the reason the reset
   * confirmation does.
   */
  const handleResendSetupLink = async () => {
    const identifier = inputIdentifier.trim();

    if (!identifier) {
      setLoginError('Enter the email address you booked with above first.');
      return;
    }

    setLoginError('');
    setSuccessMsg('');
    setSetupSending(true);

    try {
      await store.requestSetupLink(identifier);
      setSuccessMsg(
        `If ${identifier} has a booking with no password yet, a setup link is on its way — check your spam folder too.`
      );
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : 'Could not reach FreshFold just now. Please try again shortly.'
      );
    } finally {
      setSetupSending(false);
    }
  };

  /**
   * Asks for another confirmation link.
   *
   * The server's message is shown as-is rather than replaced with a generic
   * one: "try again in 41 seconds" is the answer to the question the customer
   * is about to ask, and a bland failure would have them pressing the button
   * again.
   */
  const handleResendVerification = async () => {
    setVerifySending(true);
    setVerifyNotice('');
    try {
      await store.resendVerification();
      setVerifyNotice('Sent. Check your inbox — and your spam folder.');
    } catch (error) {
      setVerifyNotice(
        error instanceof Error ? error.message : 'Could not send the link. Try again shortly.'
      );
    } finally {
      setVerifySending(false);
    }
  };

  // Log currently active session out, revoking the token server-side too.
  const handleSignOut = () => {
    void store.logout();
    setCurrentUser(null);
    setInputPassword('');
    setInputIdentifier('');
    setSuccessMsg('Account safely signed out.');
    window.location.hash = '#portal';
  };

  // Step the progress of an active booking for interactive presentation/testing
  // Handler to remove a single order from the client portal
  const handleRemoveOrder = (bookingId: string) => {
    if (!window.confirm(`Are you sure you want to remove order ${bookingId} from your account history?`)) {
      return;
    }
    try {
      const allBookings: Booking[] = store.readBookings();
      const updatedAll = allBookings.filter(b => b.id !== bookingId);
      store.writeBookings(updatedAll);
      
      // Update parent state
      onUpdateBookings(updatedAll);

      // Update local userBookings state
      const remainingUserBookings = userBookings.filter(b => b.id !== bookingId);
      setUserBookings(remainingUserBookings);
      if (activeTrackingId === bookingId) {
        setActiveTrackingId(remainingUserBookings.length > 0 ? remainingUserBookings[0].id : null);
      }

      setSuccessMsg(`Order ${bookingId} has been successfully removed.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      console.error('Error removing order:', e);
    }
  };

  // Handler to clear all orders for the current user
  const handleClearAllOrders = () => {
    if (userBookings.length === 0) return;
    if (!window.confirm('Are you sure you want to clear ALL your orders from history? This action cannot be undone.')) {
      return;
    }
    try {
      const allBookings: Booking[] = store.readBookings();
      const updatedAll = allBookings.filter(b => {
        if (!currentUser) return true;
        const matchesEmail = b.email.toLowerCase() === currentUser.email.toLowerCase();
        const matchesPhone = samePhone(b.phone, currentUser.phone);
        return !matchesEmail && !matchesPhone;
      });

      store.writeBookings(updatedAll);
      onUpdateBookings(updatedAll);
      setUserBookings([]);
      setActiveTrackingId(null);

      setSuccessMsg('All orders have been cleared from your account history.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      console.error('Error clearing all orders:', e);
    }
  };

  /**
   * Marks a booking paid, and — when it is paid from the wallet — moves the
   * money.
   *
   * The wallet leg is a server call now, and it goes first: the debit is what
   * can fail, and marking an order paid that was never actually paid for is the
   * one outcome worth ordering the steps to avoid. It also earns the loyalty
   * points the spend is worth, which this screen never did — the app awarded a
   * point per cedi and the website awarded none, on the same ledger.
   */
  const handleCompletePayment = async (bookingId: string) => {
    const cost = payModalBooking?.amount || 35;
    let ref = 'TXN-' + payMethod.substring(0, 3).toUpperCase() + '-' + Math.floor(100000 + Math.random() * 900000);

    if (payMethod === 'Wallet') {
      try {
        const account = await store.chargeWallet({
          amount: cost,
          description: `FreshFold order ${bookingId}`,
          bookingId,
          reference: ref,
        });
        setCurrentUser(account);
      } catch (error) {
        setSuccessMsg('');
        setPaystackError(
          error instanceof ApiError
            ? error.message
            : 'Could not reach FreshFold to take the payment. Try again in a moment.'
        );
        return;
      }
    }

    try {
      const nowIso = new Date().toISOString();
      const allBookings: Booking[] = store.readBookings();

      const updated = allBookings.map(b =>
        b.id === bookingId
          ? {
              ...b,
              paymentStatus: 'Paid' as const,
              paymentMethod: payMethod,
              transactionRef: ref,
              paidAt: nowIso,
            }
          : b
      );

      store.writeBookings(updated);
      onUpdateBookings(updated);

      setPayModalBooking(null);
      setPayUssdPrompt(false);
      setSuccessMsg(`Payment of ₵${cost.toFixed(2)} GHS confirmed via ${payMethod}. Ref: ${ref}`);
    } catch (e) {
      console.error('Payment error', e);
    }
  };

  /**
   * Tops the wallet up without going through Paystack — the MoMo and card
   * paths, which settle out of band.
   *
   * The balance is whatever the server says it is afterwards. This used to add
   * to a number held in this component and write it back absolutely, which is
   * how a top-up here could erase a membership renewal the server had just
   * debited.
   */
  const handleTopUpConfirm = async () => {
    const amt = parseFloat(topUpAmount) || 0;
    if (amt <= 0) return;

    try {
      const account = await store.topUpWallet(amt, 'MoMo');
      setTopUpModalOpen(false);
      setSuccessMsg(
        `Wallet topped up with ₵${amt.toFixed(2)} GHS. ` +
        `New balance: ₵${(account.walletBalance ?? 0).toFixed(2)} GHS`
      );
    } catch (error) {
      setTopUpPaystackError(
        error instanceof ApiError
          ? error.message
          : 'Could not reach FreshFold. Your wallet is unchanged — try again in a moment.'
      );
    }
  };

  /**
   * Spends care points on a reward.
   *
   * These buttons used to check the balance, print "Successfully redeemed" and
   * deduct nothing — the same 1000-point voucher could be claimed forever, and
   * the ₵50 credit added money to a React state hook no other surface could
   * see. The points come off on the server now, and the wallet credit with
   * them.
   */
  const [redeemingReward, setRedeemingReward] = useState<string | null>(null);

  const handleRedeem = async (rewardId: string) => {
    setRedeemingReward(rewardId);
    setRedeemedRewardMsg('');
    try {
      const account = await store.redeemReward(rewardId);
      const reward = LOYALTY_REWARDS.find((candidate) => candidate.id === rewardId);
      setRedeemedRewardMsg(
        `Redeemed ${reward?.name ?? 'your reward'}. ${(account.points ?? 0).toLocaleString()} care points left.`
      );
      setTimeout(() => setRedeemedRewardMsg(''), 5000);
    } catch (error) {
      setRedeemedRewardMsg(
        error instanceof ApiError
          ? error.message
          : 'Could not reach FreshFold. Your points are unchanged — try again in a moment.'
      );
      setTimeout(() => setRedeemedRewardMsg(''), 5000);
    } finally {
      setRedeemingReward(null);
    }
  };

  // Progress percentage, from the shared stage model so the bar and the
  // rider's dispatch status can never disagree about how far along a job is.
  const getStatusPercent = bookingProgressPercent;

  // Helper to get status descriptions matching the luxurious FreshFold theme
  const getStatusDetail = (status: Booking['status']) => {
    switch (status) {
      case 'Scheduled': return 'Your appointment is registered. Master artisan scheduled.';
      case 'Collecting': return 'Concierge courier is inbound to collect your clothing protectors.';
      case 'In Care': return 'Garments undergo botanical stain treatment and temperature washing.';
      case 'Ironing & Folding': return 'Artisanal hand-pressing and boutique crisp folding active.';
      case 'Quality Check': return 'Pristine laser-alignment and fabric thread inspection complete, awaiting a courier.';
      case 'Delivering': return 'Your courier is riding back to your door with the finished order.';
      case 'Delivered': return 'Delivered back safely into your physical closet wardrobe sanctuary.';
      default: return 'Under luxury surveillance.';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col pt-[72px] bg-brand-charcoal text-white overflow-y-auto">
      
      {/* Top Banner Status Info */}
      <div className="bg-[#121212] py-3.5 px-6 border-b border-white/5 flex items-center justify-between z-25 relative">
        <div className="flex items-center space-x-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-brand-sage animate-pulse" />
          <span className="font-mono text-[10px] tracking-[0.25em] text-stone-400 uppercase font-black">
            Laundro-Progress Central Tracking Terminal
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 px-3 text-xs tracking-widest text-[#8E9299] hover:text-white uppercase font-bold font-sans flex items-center gap-1 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Exit Portal</span>
        </button>
      </div>

      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full relative">
        {/* Background artwork */}
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-brand-sage/5 blur-[150px] pointer-events-none rounded-full" />
        <div className="absolute bottom-12 left-10 w-[300px] h-[300px] bg-brand-gold/5 blur-[120px] pointer-events-none rounded-full" />

        {/*
          Not `mode="wait"`.

          Two reasons, neither of them cosmetic. The three panels below are
          separate conditions rather than one switch, so two can be true in a
          single render — which framer-motion says out loud in the console:
          "attempting to animate multiple children within AnimatePresence, but
          its mode is set to wait". And `wait` makes the entering panel wait on
          the leaving one's exit *animation*; where animations do not run — a
          backgrounded tab is the ordinary case, since browsers stop
          requestAnimationFrame there — that exit never finishes and the
          entering panel never mounts at all.

          Claiming a setup link is the worst moment for that: the account is
          created and the session stored, so the terminal is the only correct
          thing to be looking at. The default mode crossfades instead, and
          nothing is waiting on a frame that may never come.
        */}
        <AnimatePresence>

          {/* STATE 1: SETUP/PASSWORD CREATION MODE
              `!currentUser` because a claimed link has nothing left to set — the
              terminal below is what that customer wants, and overlapping panels
              are what the note above is about. */}
          {setupTokenParam && !currentUser && (
            <motion.div
              key="setup-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-md mx-auto bg-[#161616] p-8 rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-brand-gold" />
              
              <div className="text-center space-y-3 mb-6">
                <div className="inline-flex p-3 bg-brand-gold/15 rounded-full border border-brand-gold/25 mb-1 text-brand-gold">
                  <Shield className="w-8 h-8" />
                </div>
                <h3 className="font-serif text-2xl text-white font-light">
                  Certify Your Password
                </h3>
                <p className="font-sans text-stone-400 text-xs font-light max-w-xs mx-auto leading-relaxed">
                  {setupBooking ? (
                    <>
                      Booking <span className="text-brand-sage font-mono font-bold">{setupBooking.id}</span> verified. Set a secure password to unlock continuous progress updates.
                    </>
                  ) : setupError ? (
                    <>This setup link could not be opened.</>
                  ) : (
                    <>Verifying your setup link…</>
                  )}
                </p>
              </div>

              {setupBooking && (
                <div className="bg-black/40 rounded-xl p-4 border border-white/5 mb-6 text-xs space-y-1.5 text-left">
                  <span className="text-[9px] font-mono tracking-widest text-[#8E9299]/70 uppercase block mb-1">PATRON METRIC HIGHLIGHTS</span>
                  <div className="flex justify-between"><span className="text-stone-400">Patron Name:</span><span className="text-white font-medium">{setupBooking.name}</span></div>
                  <div className="flex justify-between"><span className="text-stone-400">Inbound Phone:</span><span className="text-white font-medium">{setupBooking.phone}</span></div>
                  <div className="flex justify-between"><span className="text-stone-400">Email Address:</span><span className="text-white font-medium">{setupBooking.email}</span></div>
                </div>
              )}

              {setupError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3.5 mb-5 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{setupError}</span>
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-xl p-3.5 mb-5 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Only once the server has said what this link opens. A dead or
                  spent link gets the way out below and no password fields —
                  there is nothing they could be submitted to. */}
              <form
                onSubmit={handleSetupPasswordSubmit}
                className={`space-y-4 text-left ${setupBooking ? '' : 'hidden'}`}
              >
                <div className="space-y-1.5">
                  <label className="font-sans text-[10px] uppercase font-bold tracking-widest text-[#8E9299]">Secure Account Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-stone-500" />
                    <input
                      type="password"
                      required
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      placeholder="Min. 5 characters"
                      className="w-full bg-black text-white pl-10 pr-4 py-3 border border-white/10 focus:border-brand-gold focus:outline-none text-xs rounded-xl transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-sans text-[10px] uppercase font-bold tracking-widest text-[#8E9299]">Confirm Account Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-stone-500" />
                    <input
                      type="password"
                      required
                      value={setupConfirmPassword}
                      onChange={(e) => setSetupConfirmPassword(e.target.value)}
                      placeholder="Repeat choosing password"
                      className="w-full bg-black text-white pl-10 pr-4 py-3 border border-white/10 focus:border-brand-gold focus:outline-none text-xs rounded-xl transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-brand-gold hover:bg-brand-gold-light text-black font-extrabold uppercase font-sans text-xs tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 mt-2 shadow-[0_10px_20px_rgba(197,168,128,0.15)]"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Create Account & Log In</span>
                </button>

              </form>

              <div className="text-center pt-3">
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = '#portal';
                  }}
                  className="font-sans text-[11px] text-stone-500 hover:text-white uppercase tracking-wider font-semibold cursor-pointer"
                >
                  Go back to traditional Login
                </button>
              </div>
            </motion.div>
          )}

          {/* STATE 2: DIRECT MANUAL LOGIN MODE (If no currentUser is set) */}
          {!currentUser && !setupTokenParam && (
            <motion.div
              key="login-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-md mx-auto bg-[#161616] p-8 rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-brand-sage" />

              <div className="text-center space-y-3 mb-6">
                <div className="inline-flex p-3 bg-brand-sage/15 rounded-full border border-brand-sage/25 mb-1 text-brand-sage">
                  <User className="w-8 h-8" />
                </div>
                <h3 className="font-serif text-2xl text-white font-light">
                  Patron Closet Terminal
                </h3>
                <p className="font-sans text-stone-400 text-xs font-light max-w-xs mx-auto leading-relaxed">
                  Input your registered email or phone coordinates along with your secure password to audit active laundry care cycles.
                </p>
              </div>

              {loginError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3.5 mb-5 text-xs flex items-start gap-2.5 text-left">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span className="leading-relaxed">{loginError}</span>
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-xl p-3.5 mb-5 text-xs flex items-start gap-2.5 text-left">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
                <div className="space-y-1.5">
                  <label className="font-sans text-[10px] uppercase font-bold tracking-widest text-[#8E9299]">Email Address or Phone Number</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-stone-500" />
                    <input
                      type="text"
                      required
                      value={inputIdentifier}
                      onChange={(e) => setInputIdentifier(e.target.value)}
                      placeholder="e.g. PCobbold@yahoo.com or 0244123456"
                      className="w-full bg-black text-white pl-10 pr-4 py-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs rounded-xl transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="font-sans text-[10px] uppercase font-bold tracking-widest text-[#8E9299]">Patron Password</label>
                    {/* `type="button"` matters: this sits inside the sign-in
                        form, and a bare <button> would submit it. */}
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetSending}
                      className="text-[9px] font-sans text-brand-gold font-bold hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                    >
                      {resetSending ? 'Sending…' : 'Reset Password?'}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-stone-500" />
                    <input
                      type="password"
                      required
                      value={inputPassword}
                      onChange={(e) => setInputPassword(e.target.value)}
                      placeholder="Password chosen during setup link"
                      className="w-full bg-black text-white pl-10 pr-4 py-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs rounded-xl transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-white text-black font-extrabold uppercase font-sans text-xs tracking-widest rounded-xl hover:bg-brand-sage hover:text-white transition-all cursor-pointer flex items-center justify-center space-x-2 mt-2"
                >
                  <span>Sign In to Terminal</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <div className="text-center pt-2 space-y-3">
                  <p className="font-sans text-[10.5px] text-stone-500 leading-relaxed font-light">
                    First-time scheduling? Access passwords are created via a secure email link you receive after placing a booking.
                  </p>
                  {/* The way back for a guest who lost that email. Reset
                      Password above cannot help them: there is no account to
                      reset until a setup link has been spent. */}
                  <button
                    type="button"
                    onClick={handleResendSetupLink}
                    disabled={setupSending}
                    className="font-sans text-[10px] text-brand-sage font-bold uppercase tracking-wider hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                  >
                    {setupSending ? 'Sending…' : 'Send my setup link again'}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* STATE 3: FULL ACCESS tracking & orders portal (If logged in!) */}
          {currentUser && (
            <motion.div
              key="portal-main-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8 text-left"
            >
              {/*
                UNCONFIRMED EMAIL NOTICE

                Shown above everything else, because the server refuses a
                booking from an unconfirmed account — finding that out at
                checkout, after filling in the whole form, is the version of
                this that generates support calls.
              */}
              {currentUser.emailVerified === false && (
                <div className="bg-brand-gold/10 border border-brand-gold/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <AlertCircle className="w-5 h-5 text-brand-gold shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-serif text-base text-white mb-1">Confirm your email</h4>
                    <p className="text-xs font-sans text-stone-400 font-light leading-relaxed">
                      {verifyNotice ||
                        <>We sent a link to <strong className="text-stone-200">{currentUser.email}</strong>. Confirm it to start booking pickups.</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleResendVerification()}
                    disabled={verifySending}
                    className="px-4 py-2.5 rounded-xl text-xs font-sans tracking-wider uppercase font-bold bg-brand-gold/20 text-brand-gold border border-brand-gold/40 hover:bg-brand-gold/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap cursor-pointer"
                  >
                    {verifySending ? 'Sending…' : 'Resend link'}
                  </button>
                </div>
              )}

              {/* TOP BANNER: Welcome card */}
              <div className="bg-[#161616] rounded-2xl border border-white/10 p-6 relative overflow-hidden shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-sage/30 to-black border border-brand-sage/40 flex items-center justify-center text-brand-sage text-2xl font-serif shadow-inner">
                      {currentUser.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[8px] tracking-[0.25em] text-[#8E9299] uppercase font-bold block">
                          PATRON CLOSET TERMINAL
                        </span>
                        {/* Membership Badge */}
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-serif font-bold bg-brand-gold/15 text-brand-gold border border-brand-gold/30">
                          ⭐️ {currentUser.points ?? 0} care points
                        </span>
                      </div>
                      <h3 className="font-serif text-2xl text-white font-medium">
                        Welcome back, {currentUser.name}
                      </h3>
                      <p className="text-xs font-sans text-stone-400 flex items-center gap-1.5 mt-1 font-light">
                        <MapPin className="w-3.5 h-3.5 text-brand-sage shrink-0" />
                        <span>
                          {userBookings[0]?.address ? (
                            <>Last collection: <strong className="text-stone-200">{[userBookings[0].address, userBookings[0].suburb].filter(Boolean).join(', ')}</strong></>
                          ) : (
                            <>No collections yet — your address is taken at booking.</>
                          )}
                        </span>
                      </p>
                    </div>
                  </div>

                </div>

                {/* SIMPLE TAB NAVIGATION BAR */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-6 mt-6 border-t border-white/10">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setActivePortalTab('dashboard')}
                      className={`px-4 py-2.5 rounded-xl text-xs font-sans tracking-wider uppercase font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                        activePortalTab === 'dashboard'
                          ? 'bg-brand-sage text-white border border-brand-sage shadow-md'
                          : 'bg-black/40 text-stone-400 border border-white/5 hover:text-white hover:bg-black/70'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Dashboard & Live Map</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActivePortalTab('orders')}
                      className={`px-4 py-2.5 rounded-xl text-xs font-sans tracking-wider uppercase font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                        activePortalTab === 'orders'
                          ? 'bg-brand-sage text-white border border-brand-sage shadow-md'
                          : 'bg-black/40 text-stone-400 border border-white/5 hover:text-white hover:bg-black/70'
                      }`}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>My Orders ({userBookings.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActivePortalTab('wallet')}
                      className={`px-4 py-2.5 rounded-xl text-xs font-sans tracking-wider uppercase font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                        activePortalTab === 'wallet'
                          ? 'bg-brand-gold text-black border border-brand-gold shadow-md'
                          : 'bg-black/40 text-stone-400 border border-white/5 hover:text-white hover:bg-black/70'
                      }`}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Wallet & Loyalty (₵{walletBalance.toFixed(2)})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActivePortalTab('settings')}
                      className={`px-4 py-2.5 rounded-xl text-xs font-sans tracking-wider uppercase font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                        activePortalTab === 'settings'
                          ? 'bg-white text-black border border-white shadow-md'
                          : 'bg-black/40 text-stone-400 border border-white/5 hover:text-white hover:bg-black/70'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Account Settings</span>
                    </button>
                  </div>

                  {/* Action buttons aligned on the exact same row as Account Settings */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={onOpenBooking}
                      className="px-4 py-2.5 bg-brand-sage hover:bg-brand-sage-light text-white rounded-xl text-xs font-sans font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Book New Pickup</span>
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="px-3.5 py-2.5 bg-black/40 hover:bg-red-500/10 text-stone-400 hover:text-red-400 rounded-xl text-xs font-mono tracking-wider uppercase font-bold border border-white/5 cursor-pointer flex items-center gap-1.5 transition-all"
                      title="Sign Out"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* TAB 1: DASHBOARD & LIVE TRACKING MAP */}
              {activePortalTab === 'dashboard' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Left Column: Quick Stats & Concierge */}
                  <div className="lg:col-span-4 space-y-6">
                    {/* Wallet Quick Box */}
                    <div className="bg-[#161616] rounded-2xl border border-brand-gold/30 p-5 space-y-3 relative overflow-hidden">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[9px] text-brand-gold uppercase tracking-widest font-bold">FRESHFOLD PATRON WALLET</span>
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-bold">✓ Active</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="font-serif text-2xl font-bold text-white">₵{walletBalance.toFixed(2)} <span className="text-xs font-mono text-stone-400">GHS</span></span>
                        <button
                          type="button"
                          onClick={() => setTopUpModalOpen(true)}
                          className="px-3 py-1.5 bg-brand-gold text-black rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-yellow-400 transition-all font-mono flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Top Up
                        </button>
                      </div>
                      <p className="text-[10.5px] text-stone-400 font-sans font-light leading-tight">
                        Pre-funded wallet balance for 1-click order settlements across Kumasi suburbs.
                      </p>
                    </div>

                    {/* Quick Action CTAs */}
                    <div className="space-y-3">
                      <button
                        onClick={onOpenBooking}
                        className="w-full py-3.5 bg-brand-sage hover:bg-brand-sage-light text-white rounded-xl text-xs font-sans tracking-widest font-bold uppercase transition-all flex items-center justify-center space-x-2 border border-white/5 shadow-lg cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Schedule New Pickup</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConciergeOpen(true)}
                        className="w-full py-3 bg-black/60 hover:bg-black/90 text-brand-gold border border-brand-gold/30 rounded-xl text-xs font-mono tracking-wider font-bold uppercase transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-md"
                      >
                        <Sparkles className="w-4 h-4 text-brand-gold" />
                        <span>Artisan Concierge Desk</span>
                      </button>
                    </div>

                    {/* Care Points Card */}
                    {(() => {
                      const sub = getSubscriptionDetails(getPatronPoints());
                      return (
                        <div className="bg-[#161616] rounded-2xl border border-white/10 p-5 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="font-mono text-[9px] text-[#8E9299] uppercase tracking-widest font-bold">CARE POINTS PASS</span>
                            <span className={`text-[10px] font-serif ${sub.colorClass} font-bold`}>{sub.className}</span>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <span className={`font-serif text-xl font-bold ${sub.colorClass}`}>{getPatronPoints()} pts</span>
                            <span className="text-[9px] font-mono text-stone-400">{sub.discountText}</span>
                          </div>
                          <p className="text-[10px] text-stone-400 font-sans leading-relaxed">
                            {sub.statusText}
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right Column: Live GPS Delivery Map & Active Shipment Tracking */}
                  <div className="lg:col-span-8 space-y-6">
                    <div className="bg-[#161616] rounded-2xl border border-brand-sage/30 p-6 overflow-hidden relative shadow-md space-y-6">
                      {userBookings.length === 0 ? (
                        <div className="text-center py-10 space-y-4">
                          <div className="inline-flex p-4 bg-stone-900 border border-white/10 rounded-full text-[#8E9299]">
                            <Clock className="w-10 h-10" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-serif text-lg text-white font-medium">No Active Laundry Shipments</h4>
                            <p className="font-sans text-[#8E9299] text-xs max-w-sm mx-auto font-light leading-relaxed">
                              You currently have no active orders in transit. Book a pickup to dispatch our Kumasi concierge runner!
                            </p>
                          </div>
                          <button
                            onClick={onOpenBooking}
                            className="px-6 py-2.5 bg-brand-sage text-white font-bold text-[11px] font-sans uppercase tracking-widest rounded-xl hover:bg-brand-sage-light transition-all cursor-pointer"
                          >
                            Book First Pickup
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* Active Selector Block */}
                          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-white/10">
                            <div>
                              <span className="font-mono text-[8px] tracking-[0.3em] text-[#8E9299] uppercase font-bold">Active GPS Monitor</span>
                              <h4 className="font-serif text-xl text-white font-light">
                                Live Shipment Telemetry
                              </h4>
                            </div>
                            
                            <div className="flex gap-1.5 overflow-x-auto">
                              {userBookings.map((b) => (
                                <button
                                  key={b.id}
                                  onClick={() => setActiveTrackingId(b.id)}
                                  className={`px-3 py-1.5 text-[10px] font-mono rounded-xl border font-bold transition-all cursor-pointer ${
                                    activeTrackingId === b.id 
                                      ? 'bg-brand-sage border-brand-sage text-white' 
                                      : 'bg-black/40 border-white/10 text-stone-400 hover:text-white'
                                  }`}
                                >
                                  {b.id} ({b.status})
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Selected Booking Tracking Details */}
                          {userBookings.filter(b => b.id === activeTrackingId).map((booking) => {
                            const percent = getStatusPercent(booking.status);
                            
                            return (
                              <div key={booking.id} className="space-y-6">
                                {/* Top Info Strip */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-black/40 p-4 rounded-xl border border-white/5 items-center">
                                  <div className="md:col-span-8 space-y-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-[11px] bg-brand-sage/20 text-brand-sage border border-brand-sage/20 font-mono px-2 py-0.5 rounded-lg font-black">{booking.id}</span>
                                      <span className="text-stone-600 font-bold">•</span>
                                      <span className="text-stone-300 font-sans font-bold text-xs uppercase tracking-wider">{booking.serviceType}</span>
                                    </div>
                                    <p className="font-sans text-[11px] font-light text-[#8E9299] flex items-center gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-brand-sage shrink-0" />
                                      <span>{booking.address}, {booking.suburb}</span>
                                    </p>
                                  </div>

                                </div>

                                {/* Progress bar line */}
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="font-mono text-stone-400">STATUS: <strong className="text-white uppercase font-bold">{booking.status}</strong></span>
                                    <span className="font-mono text-brand-sage font-bold">{percent}% COMPLETE</span>
                                  </div>
                                  <div className="w-full bg-black/60 h-2.5 rounded-full overflow-hidden p-0.5 border border-white/10 relative">
                                    <div 
                                      className="bg-brand-sage h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(90,90,64,0.6)]" 
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>

                                  {/*
                                    Stage strip, off BOOKING_STAGE_SEQUENCE.
                                    Hand-listing the stages here is how this
                                    strip ended up one stage behind the rest of
                                    the product; deriving it means a stage
                                    added in core arrives here for free.
                                  */}
                                  <div
                                    className="grid pt-1 text-center font-mono text-[8px] font-bold uppercase tracking-tighter gap-1"
                                    style={{
                                      gridTemplateColumns: `repeat(${BOOKING_STAGE_SEQUENCE.length}, minmax(0, 1fr))`,
                                    }}
                                  >
                                    {BOOKING_STAGE_SEQUENCE.map((stageName, stageIndex) => (
                                      <div
                                        key={stageName}
                                        className={`flex flex-col items-center ${
                                          percent >= bookingProgressPercent(stageName)
                                            ? 'text-brand-sage'
                                            : 'text-stone-600'
                                        }`}
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5 mb-0.5" />
                                        <span>
                                          {stageIndex + 1}. {stageName}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Live Dispatch Map */}
                                <LiveDispatchMap
                                  clientSuburb={booking.suburb}
                                  clientAddress={booking.address}
                                  bookingStatus={booking.status}
                                  bookingId={booking.id}
                                  clientName={booking.name}
                                  clientCoords={booking.pickupCoords}
                                  rider={booking.rider}
                                />

                                {/* Collection hand-off — only while the bags are
                                    still here. Once the courier has them the code
                                    has done its job. */}
                                {COLLECTION_PENDING.has(booking.rider?.jobStatus ?? 'unassigned') && (
                                  <HandoffCode booking={booking} />
                                )}

                                {/* And the other end of the round trip: the code
                                    the courier needs before the clean laundry
                                    changes hands back. */}
                                {DELIVERY_PENDING.has(booking.rider?.jobStatus ?? 'unassigned') && (
                                  <HandoffCode booking={booking} leg="delivery" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: MY ORDERS & RECEIPTS */}
              {activePortalTab === 'orders' && (
                <div className="space-y-6">
                  {/* Order Filter Tabs & Clear All Header */}
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-[#161616] p-4 rounded-2xl border border-white/10">
                    <div className="flex items-center space-x-2">
                      <Receipt className="w-5 h-5 text-brand-sage" />
                      <h4 className="font-serif text-lg text-white font-medium">Order History & Receipts</h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex gap-1 bg-black/60 p-1 rounded-xl border border-white/10 text-[10px] font-mono">
                        <button
                          type="button"
                          onClick={() => setOrderFilter('all')}
                          className={`px-3 py-1.5 rounded-lg font-bold uppercase transition-all cursor-pointer ${
                            orderFilter === 'all' ? 'bg-white text-black' : 'text-stone-400 hover:text-white'
                          }`}
                        >
                          All ({userBookings.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderFilter('active')}
                          className={`px-3 py-1.5 rounded-lg font-bold uppercase transition-all cursor-pointer ${
                            orderFilter === 'active' ? 'bg-brand-sage text-white' : 'text-stone-400 hover:text-white'
                          }`}
                        >
                          Active
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderFilter('completed')}
                          className={`px-3 py-1.5 rounded-lg font-bold uppercase transition-all cursor-pointer ${
                            orderFilter === 'completed' ? 'bg-brand-gold text-black' : 'text-stone-400 hover:text-white'
                          }`}
                        >
                          Delivered
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Orders Cards List */}
                  {(() => {
                    const filtered = userBookings.filter(b => {
                      if (orderFilter === 'active') return b.status !== 'Delivered';
                      if (orderFilter === 'completed') return b.status === 'Delivered';
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="bg-[#161616] rounded-2xl border border-white/10 p-10 text-center space-y-4">
                          <div className="inline-flex p-3.5 bg-black/50 border border-white/10 rounded-full text-stone-500">
                            <Receipt className="w-8 h-8 text-brand-sage" />
                          </div>
                          <div className="space-y-1">
                            <h5 className="font-serif text-white text-base font-medium">No Orders Found</h5>
                            <p className="font-sans text-xs text-stone-400 font-light max-w-sm mx-auto">
                              {userBookings.length === 0
                                ? "Your order history is clear. Schedule a pickup to send your laundry to our care team."
                                : "No orders match the selected filter category."}
                            </p>
                          </div>
                          <button
                            onClick={onOpenBooking}
                            className="px-5 py-2.5 bg-brand-sage hover:bg-brand-sage-light text-white font-bold text-xs font-sans uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                          >
                            + Schedule New Pickup
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {filtered.map((booking) => (
                          <div key={booking.id} className="bg-[#161616] rounded-2xl border border-white/10 p-5 space-y-4 hover:border-brand-sage/40 transition-all">
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-3 border-b border-white/5">
                              <div className="flex items-center space-x-3">
                                <span className="font-mono text-xs bg-brand-sage/20 text-brand-sage border border-brand-sage/30 px-2.5 py-1 rounded-lg font-extrabold">
                                  {booking.id}
                                </span>
                                <span className="font-serif text-base text-white font-medium">
                                  {booking.serviceType}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                {booking.paymentStatus === 'Paid' ? (
                                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-lg font-mono font-bold flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> PAID (₵{booking.amount || 45}.00)
                                  </span>
                                ) : (
                                  <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg font-mono font-bold flex items-center gap-1">
                                    UNPAID / COD (₵{booking.amount || 45}.00)
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setReceiptModalBooking(booking)}
                                  className="px-3 py-1 bg-black/50 hover:bg-black text-stone-300 border border-white/10 rounded-lg text-[10px] font-mono uppercase font-bold flex items-center gap-1 transition-all cursor-pointer"
                                >
                                  <Receipt className="w-3 h-3 text-brand-gold" /> View Receipt
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs text-stone-400">
                              <div>
                                <span className="text-[9px] font-mono text-stone-500 uppercase block">Pickup Slot</span>
                                <span className="text-white font-medium">{booking.pickupDate} • {booking.pickupTime}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-mono text-stone-500 uppercase block">Suburb Address</span>
                                <span className="text-white font-medium">{booking.address}, {booking.suburb}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-mono text-stone-500 uppercase block">Scent Option</span>
                                <span className="text-brand-gold font-medium">{booking.specialtyAddons ? booking.specialtyAddons.join(', ') : 'French Lavender'}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-mono text-stone-500 uppercase block">Current Status</span>
                                <span className="text-brand-sage font-bold uppercase">{booking.status}</span>
                              </div>
                            </div>

                            {booking.paymentStatus !== 'Paid' && (
                              <div className="pt-2 border-t border-white/5 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPayModalBooking(booking);
                                    setPayMomoNum(booking.momoNumber || booking.phone);
                                  }}
                                  className="px-4 py-2 bg-brand-gold text-black rounded-xl text-xs font-bold font-mono uppercase tracking-wider hover:bg-yellow-400 transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                                >
                                  <Smartphone className="w-3.5 h-3.5" /> Settle Online Now (₵{booking.amount || 45}.00 GHS)
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 3: WALLET & LOYALTY REWARDS */}
              {activePortalTab === 'wallet' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Left Column: Wallet Management & Mobile Money */}
                  <div className="lg:col-span-6 space-y-6">
                    <div className="bg-[#161616] rounded-2xl border border-brand-gold/40 p-6 space-y-5 shadow-xl">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[9px] text-brand-gold uppercase tracking-widest font-bold">FRESHFOLD PATRON DIGITAL WALLET</span>
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-bold">MoMo Ready</span>
                      </div>

                      <div className="bg-gradient-to-br from-[#1F1D1B] to-black p-5 rounded-xl border border-brand-gold/20 space-y-2">
                        <span className="text-[10px] font-mono text-stone-400 uppercase">Available Cedi Balance</span>
                        <div className="flex items-baseline justify-between">
                          <span className="font-serif text-3xl font-bold text-white">₵{walletBalance.toFixed(2)} <span className="text-sm font-mono text-brand-gold">GHS</span></span>
                          <button
                            type="button"
                            onClick={() => setTopUpModalOpen(true)}
                            className="px-4 py-2 bg-brand-gold text-black rounded-xl text-xs font-bold font-mono uppercase tracking-wider hover:bg-yellow-400 transition-all cursor-pointer shadow-lg flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" /> Top Up Wallet
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        <span className="font-mono text-[9.5px] text-stone-400 uppercase font-bold block">Supported Local Payment Options</span>
                        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono font-bold">
                          <div className="p-2.5 bg-black/50 border border-white/10 rounded-xl text-yellow-400">MTN MoMo</div>
                          <div className="p-2.5 bg-black/50 border border-white/10 rounded-xl text-red-400">Telecel Cash</div>
                          <div className="p-2.5 bg-black/50 border border-white/10 rounded-xl text-blue-400">AT Money / Card</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Loyalty Points & Reward Store */}
                  <div className="lg:col-span-6 space-y-6">
                    <div className="bg-[#161616] rounded-2xl border border-white/10 p-6 space-y-5 shadow-xl">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[9px] text-brand-sage uppercase tracking-widest font-bold">CARE POINTS REWARD STORE</span>
                        <span className="text-xs font-serif font-bold text-brand-gold">{getPatronPoints()} Care Points</span>
                      </div>

                      {redeemedRewardMsg && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>{redeemedRewardMsg}</span>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="p-4 bg-black/40 rounded-xl border border-white/10 flex justify-between items-center">
                          <div>
                            <h5 className="font-serif text-sm text-white font-bold">Free Organic Scent Spray</h5>
                            <p className="text-[10.5px] text-stone-400 font-light">Redeem 300 Care Points for French Lavender or Cedarwood infusion.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (getPatronPoints() >= 300) {
                                setRedeemedRewardMsg('Successfully redeemed Organic Scent Spray Voucher!');
                                setTimeout(() => setRedeemedRewardMsg(''), 3000);
                              } else {
                                alert('Requires 300 Care Points.');
                              }
                            }}
                            className="px-3 py-1.5 bg-brand-sage text-white rounded-lg text-[10px] font-mono font-bold uppercase hover:bg-brand-sage-light cursor-pointer shrink-0"
                          >
                            Redeem 300 pts
                          </button>
                        </div>

                        <div className="p-4 bg-black/40 rounded-xl border border-white/10 flex justify-between items-center">
                          <div>
                            <h5 className="font-serif text-sm text-white font-bold">Free Express Courier Dispatch</h5>
                            <p className="text-[10.5px] text-stone-400 font-light">Redeem 500 Care Points to waive express same-day courier dispatch.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (getPatronPoints() >= 500) {
                                setRedeemedRewardMsg('Successfully redeemed Free Express Dispatch Voucher!');
                                setTimeout(() => setRedeemedRewardMsg(''), 3000);
                              } else {
                                alert('Requires 500 Care Points.');
                              }
                            }}
                            className="px-3 py-1.5 bg-brand-gold text-black rounded-lg text-[10px] font-mono font-bold uppercase hover:bg-yellow-400 cursor-pointer shrink-0"
                          >
                            Redeem 500 pts
                          </button>
                        </div>

                        <div className="p-4 bg-black/40 rounded-xl border border-white/10 flex justify-between items-center">
                          <div>
                            <h5 className="font-serif text-sm text-white font-bold">₵50.00 GHS Direct Wallet Credit</h5>
                            <p className="text-[10.5px] text-stone-400 font-light">Redeem 1000 Care Points for GHS 50 added straight to your FreshFold wallet.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (getPatronPoints() >= 1000) {
                                setWalletBalance(prev => prev + 50);
                                setRedeemedRewardMsg('Successfully redeemed ₵50.00 GHS added to your wallet!');
                                setTimeout(() => setRedeemedRewardMsg(''), 3000);
                              } else {
                                alert('Requires 1000 Care Points. Keep earning on completed orders!');
                              }
                            }}
                            className="px-3 py-1.5 bg-white text-black rounded-lg text-[10px] font-mono font-bold uppercase hover:bg-brand-sage hover:text-white cursor-pointer shrink-0"
                          >
                            Redeem 1000 pts
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: ACCOUNT SETTINGS */}
              {activePortalTab === 'settings' && (
                <div className="max-w-2xl mx-auto bg-[#161616] rounded-2xl border border-white/10 p-6 space-y-6 shadow-2xl">
                  <div className="space-y-1 pb-4 border-b border-white/10">
                    <span className="font-mono text-[9px] text-brand-sage uppercase tracking-widest block font-bold">PATRON ACCOUNT PREFERENCES</span>
                    <h4 className="font-serif text-xl text-white">Default Delivery & Care Settings</h4>
                  </div>

                  {savedSettingsMsg && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{savedSettingsMsg}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-mono text-stone-400 uppercase font-bold">Primary Delivery Suburb</label>
                      <select
                        value={userSuburb}
                        onChange={(e) => setUserSuburb(e.target.value)}
                        className="w-full bg-black text-white text-xs p-3 rounded-xl border border-white/10 font-sans focus:border-brand-sage focus:outline-none"
                      >
                        <option value="Ayeduase">Ayeduase (KNUST Gaza / Brunei / Hall 7)</option>
                        <option value="Bomso">Bomso (Bomso Hill / Junction)</option>
                        <option value="Kotei">Kotei (Kotei Junction / Campus Extension)</option>
                        <option value="Kentinkrono">Kentinkrono</option>
                        <option value="KNUST Campus">KNUST Central Campus</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-mono text-stone-400 uppercase font-bold">Full Physical Address / Landmark</label>
                      <input
                        type="text"
                        value={userAddress}
                        onChange={(e) => setUserAddress(e.target.value)}
                        className="w-full bg-black text-white text-xs p-3 rounded-xl border border-white/10 font-sans focus:border-brand-sage focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-mono text-stone-400 uppercase font-bold">Hostel / Hall / House Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Gaza Hostel, Brunei, Hall 7, or Plot 14"
                        value={userHostel}
                        onChange={(e) => setUserHostel(e.target.value)}
                        className="w-full bg-black text-white text-xs p-3 rounded-xl border border-white/10 font-sans focus:border-brand-sage focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-mono text-stone-400 uppercase font-bold">Registered Email</label>
                        <input
                          type="text"
                          disabled
                          value={currentUser.email}
                          className="w-full bg-black/50 text-stone-400 text-xs p-3 rounded-xl border border-white/5 font-mono cursor-not-allowed"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-mono text-stone-400 uppercase font-bold">Contact Phone</label>
                        <input
                          type="text"
                          disabled
                          value={currentUser.phone}
                          className="w-full bg-black/50 text-stone-400 text-xs p-3 rounded-xl border border-white/5 font-mono cursor-not-allowed"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSavedSettingsMsg('Settings updated successfully!');
                        setTimeout(() => setSavedSettingsMsg(''), 3000);
                      }}
                      className="w-full py-3 bg-brand-sage text-white rounded-xl text-xs font-bold font-sans uppercase tracking-widest hover:bg-brand-sage-light transition-all cursor-pointer shadow-lg mt-2"
                    >
                      Save Preferences
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          )}

        </AnimatePresence>

        {/* Modal 1: Pay Online Now Drawer for a specific booking */}
        <AnimatePresence>
          {payModalBooking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            >
              <div className="bg-[#181818] border border-brand-sage/40 rounded-2xl max-w-md w-full p-6 text-left space-y-5 shadow-2xl relative">
                <button
                  type="button"
                  onClick={() => setPayModalBooking(null)}
                  className="absolute top-4 right-4 text-stone-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="space-y-1">
                  <span className="font-mono text-[9px] text-brand-sage uppercase tracking-widest block font-bold">
                    ONLINE PAYMENT SETTLEMENT
                  </span>
                  <h3 className="font-serif text-xl text-white">
                    Settle Order {payModalBooking.id}
                  </h3>
                  <p className="text-stone-400 text-xs">
                    Amount Due: <strong className="text-brand-sage font-mono text-sm font-bold">₵{payModalBooking.amount || 35}.00 GHS</strong>
                  </p>
                </div>

                {/* Payment Option Selector */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMethod('Paystack')}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                      payMethod === 'Paystack'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-extrabold shadow-lg'
                        : 'bg-black/50 border-white/10 text-stone-400 hover:text-white'
                    }`}
                  >
                    <span>Paystack (MoMo & Cards)</span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono uppercase font-bold">Online</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayMethod('Wallet')}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                      payMethod === 'Wallet'
                        ? 'bg-brand-gold/20 border-brand-gold text-brand-gold font-extrabold shadow-lg'
                        : 'bg-black/50 border-white/10 text-stone-400 hover:text-white'
                    }`}
                  >
                    <span>Patron Wallet</span>
                    <span className="text-[9px] font-mono text-brand-gold">₵{walletBalance.toFixed(2)}</span>
                  </button>
                </div>

                {/* Paystack Payment Panel */}
                {payMethod === 'Paystack' && (
                  <div className="space-y-3 bg-black/60 p-4 rounded-xl border border-emerald-500/30">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        Paystack Gateway
                      </span>
                      <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">
                        MTN • Telecel • AT • Cards
                      </span>
                    </div>

                    {paystackError && (
                      <p className="text-xs text-red-400 font-mono">⚠️ {paystackError}</p>
                    )}

                    <button
                      type="button"
                      onClick={handlePortalPaystackInit}
                      disabled={paystackLoading}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider hover:from-emerald-500 hover:to-teal-400 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      {paystackLoading ? 'Connecting...' : `Pay ₵${payModalBooking.amount || 35}.00 GHS via Paystack`}
                    </button>

                    {paystackAuthUrl && (
                      <div className="pt-2 border-t border-white/10 space-y-2">
                        <a
                          href={paystackAuthUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs font-mono font-bold text-emerald-400 underline"
                        >
                          Open Paystack Checkout Window ↗
                        </a>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handlePortalPaystackVerify}
                            disabled={paystackLoading}
                            className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-mono font-bold hover:bg-emerald-500/30 transition-all cursor-pointer"
                          >
                            Verify Payment
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCompletePayment(payModalBooking.id)}
                            className="px-3 py-2 bg-white/10 text-stone-300 rounded-lg text-xs font-mono font-bold hover:bg-white/20 transition-all cursor-pointer"
                          >
                            Mark Paid
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Wallet Payment Panel */}
                {payMethod === 'Wallet' && (
                  <div className="space-y-3 bg-black/50 p-4 rounded-xl border border-brand-gold/30">
                    <div className="flex justify-between text-xs">
                      <span className="text-stone-300">Wallet Balance:</span>
                      <span className="font-mono text-brand-gold font-bold">₵{walletBalance.toFixed(2)} GHS</span>
                    </div>
                    {walletBalance < (payModalBooking.amount || 35) ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-red-400 font-mono">
                          Insufficient wallet balance. Top up your wallet securely via Paystack.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setPayModalBooking(null);
                            setTopUpModalOpen(true);
                          }}
                          className="w-full py-2 bg-brand-gold/20 text-brand-gold border border-brand-gold/40 rounded-xl text-xs font-bold font-mono hover:bg-brand-gold/30 transition-all cursor-pointer"
                        >
                          Top Up Wallet via Paystack
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCompletePayment(payModalBooking.id)}
                        className="w-full py-2.5 bg-brand-gold text-black rounded-xl text-xs font-bold font-mono uppercase tracking-wider hover:bg-yellow-400 transition-all cursor-pointer"
                      >
                        Deduct ₵{payModalBooking.amount || 35}.00 GHS from Wallet
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal 2: Wallet Top Up Modal via Paystack */}
        <AnimatePresence>
          {topUpModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            >
              <div className="bg-[#181818] border border-brand-gold/40 rounded-2xl max-w-md w-full p-6 text-left space-y-5 shadow-2xl relative">
                <button
                  type="button"
                  onClick={() => {
                    setTopUpModalOpen(false);
                    setTopUpPaystackAuthUrl('');
                    setTopUpPaystackError('');
                  }}
                  className="absolute top-4 right-4 text-stone-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="space-y-1">
                  <span className="font-mono text-[9px] text-brand-gold uppercase tracking-widest block font-bold">
                    FRESHFOLD PATRON WALLET
                  </span>
                  <h3 className="font-serif text-xl text-white">
                    Top Up Wallet Balance
                  </h3>
                  <p className="text-stone-400 text-xs">
                    Current Balance: <strong className="text-brand-gold font-mono text-sm font-bold">₵{walletBalance.toFixed(2)} GHS</strong>
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-mono text-stone-400 uppercase font-bold">Select Amount (GHS)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['50', '100', '200', '500'].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTopUpAmount(amt)}
                        className={`py-2 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                          topUpAmount === amt
                            ? 'bg-brand-gold text-black border-brand-gold'
                            : 'bg-black/50 border-white/10 text-stone-400 hover:text-white'
                        }`}
                      >
                        ₵{amt}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    placeholder="Custom amount"
                    className="w-full bg-black text-brand-gold text-xs p-3 rounded-xl border border-white/10 font-mono focus:border-brand-gold focus:outline-none"
                  />
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" /> Paystack Online Gateway
                    </span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">
                      Ghana MoMo & Cards
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-300">
                    Top-ups are safely processed using Paystack. Supports MTN MoMo, Telecel Cash, AT Money, Visa, & Mastercard.
                  </p>
                </div>

                {topUpPaystackError && (
                  <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-xs font-mono">
                    ⚠️ {topUpPaystackError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleWalletPaystackInit}
                  disabled={topUpPaystackLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>{topUpPaystackLoading ? 'Connecting to Paystack...' : `Top Up ₵${topUpAmount || '0'}.00 GHS via Paystack`}</span>
                </button>

                {topUpPaystackAuthUrl && (
                  <div className="p-3 bg-black/80 rounded-xl border border-white/10 space-y-2 text-left">
                    <p className="text-[11px] text-stone-300 font-mono">
                      Paystack payment window initialized:
                    </p>
                    <a
                      href={topUpPaystackAuthUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs font-bold text-emerald-400 underline font-mono break-all"
                    >
                      Open Paystack Top Up Checkout ↗
                    </a>
                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={handleWalletPaystackVerify}
                        disabled={topUpPaystackLoading}
                        className="flex-1 py-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-mono font-bold hover:bg-emerald-500/30 transition-all cursor-pointer"
                      >
                        {topUpPaystackLoading ? 'Checking...' : 'Verify Wallet Top-Up'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Concierge Desk Drawer Modal */}
        <AnimatePresence>
          {conciergeOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 text-left"
            >
              <div className="bg-[#181818] border border-brand-gold/40 rounded-2xl max-w-md w-full p-6 text-left space-y-4 shadow-2xl relative flex flex-col max-h-[85vh]">
                <button
                  type="button"
                  onClick={() => { setConciergeOpen(false); setConciergeSuccess(''); }}
                  className="absolute top-4 right-4 text-stone-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="space-y-1 shrink-0">
                  <span className="font-mono text-[9px] text-brand-gold uppercase tracking-widest block font-bold">
                    FRESHFOLD PATRON CONCIERGE DESK
                  </span>
                  <h3 className="font-serif text-xl text-white">
                    Direct Artisan Assistance
                  </h3>
                  <p className="text-stone-400 text-xs leading-relaxed">
                    {threadOrderId
                      ? <>Live thread with your courier and the Bomso dispatch desk for order <strong className="text-brand-gold font-mono">{threadOrderId}</strong>. Replies appear here as they are sent.</>
                      : <>Schedule a pickup to open a live thread with your courier. In the meantime, the desk is reachable on WhatsApp or the hotline below.</>}
                  </p>
                </div>

                {conciergeSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-xs flex items-center gap-2 shrink-0">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{conciergeSuccess}</span>
                  </div>
                )}

                {threadOrderId && (
                  <div className="flex-1 min-h-[140px] overflow-y-auto bg-black/50 border border-white/10 rounded-xl p-3 space-y-2.5">
                    {thread.length === 0 ? (
                      <p className="text-stone-500 text-[11px] text-center py-8 font-sans">
                        No messages yet. Send the first note to your courier.
                      </p>
                    ) : (
                      thread.map((message) => {
                        const mine = message.sender === 'customer';
                        return (
                          <div
                            key={message.id}
                            className={`flex flex-col max-w-[85%] ${mine ? 'ml-auto items-end' : 'items-start'}`}
                          >
                            <span className="font-mono text-[8px] uppercase tracking-widest text-stone-500 mb-1">
                              {mine ? 'You' : SENDER_LABELS[message.sender]} · {message.timestamp}
                            </span>
                            <div
                              className={`px-3 py-2 rounded-xl text-[11px] leading-relaxed font-sans ${
                                mine
                                  ? 'bg-brand-gold text-black rounded-tr-sm'
                                  : 'bg-[#232323] text-stone-200 border border-white/10 rounded-tl-sm'
                              }`}
                            >
                              {message.text}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                <div className="space-y-2 shrink-0">
                  <label className="block text-[10px] font-mono text-stone-400 uppercase font-bold">
                    Garment / Dispatch Instruction Note
                  </label>
                  <textarea
                    rows={3}
                    value={conciergeText}
                    onChange={(e) => setConciergeText(e.target.value)}
                    placeholder="e.g., Special care for hand-woven Kente trim, or the buzzer number for the hostel gate..."
                    className="w-full bg-black text-white text-xs p-3 rounded-xl border border-white/10 font-sans focus:border-brand-gold focus:outline-none"
                  />
                </div>

                <div className="space-y-2 pt-1 shrink-0">
                  <button
                    type="button"
                    disabled={!threadOrderId}
                    onClick={() => {
                      const text = conciergeText.trim();
                      if (!text || !threadOrderId) return;

                      store.sendMessage(text, threadOrderId);
                      setConciergeText('');
                      setConciergeSuccess(
                        store.isOnline()
                          ? 'Sent to your courier and the Bomso dispatch desk.'
                          : 'Saved — it will send as soon as you are back online.'
                      );
                      setTimeout(() => setConciergeSuccess(''), 4000);
                    }}
                    className="w-full py-3 bg-brand-gold text-black rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-yellow-400 font-mono transition-all flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-gold"
                  >
                    <Send className="w-3.5 h-3.5" /> {threadOrderId ? 'Send to Courier & Desk' : 'No Active Order'}
                  </button>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] font-mono">
                    <a
                      href="https://wa.me/233244123456?text=Hello%20FreshFold%20Concierge%20Desk"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-center font-bold block"
                    >
                      💬 WhatsApp HQ
                    </a>
                    <a
                      href="tel:+233244123456"
                      className="p-2.5 bg-brand-sage/10 hover:bg-brand-sage/20 text-brand-sage border border-brand-sage/30 rounded-xl text-center font-bold block"
                    >
                      📞 Direct Hotline
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal: Itemized Receipt Display */}
        <AnimatePresence>
          {receiptModalBooking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            >
              <div className="bg-[#181818] border border-brand-gold/40 rounded-2xl max-w-md w-full p-6 text-left space-y-5 shadow-2xl relative">
                <button
                  type="button"
                  onClick={() => setReceiptModalBooking(null)}
                  className="absolute top-4 right-4 text-stone-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="text-center space-y-1 pb-3 border-b border-white/10">
                  <span className="font-mono text-[9px] text-brand-gold uppercase tracking-widest block font-bold">FRESHFOLD BESPOKE TEXTILE CARE</span>
                  <h3 className="font-serif text-xl text-white">Itemized Receipt</h3>
                  <p className="text-[10px] font-mono text-stone-400">Order Ref: {receiptModalBooking.id} • Kumasi, Ghana</p>
                </div>

                <div className="space-y-3 font-sans text-xs">
                  <div className="flex justify-between text-stone-300">
                    <span>Service Tier:</span>
                    <strong className="text-white">{receiptModalBooking.serviceType}</strong>
                  </div>
                  <div className="flex justify-between text-stone-300">
                    <span>Pickup Suburb:</span>
                    <span className="text-stone-200">{receiptModalBooking.suburb} ({receiptModalBooking.address})</span>
                  </div>
                  <div className="flex justify-between text-stone-300">
                    <span>Aroma/Fragrance Choice:</span>
                    <span className="text-brand-gold font-medium">{receiptModalBooking.specialtyAddons ? receiptModalBooking.specialtyAddons.join(', ') : 'Organic French Lavender'}</span>
                  </div>

                  <div className="pt-3 border-t border-white/10 space-y-2 font-mono text-xs">
                    <div className="flex justify-between text-stone-400">
                      <span>Base Care Package:</span>
                      <span>₵{(receiptModalBooking.amount || 45) - 10}.00 GHS</span>
                    </div>
                    <div className="flex justify-between text-stone-400">
                      <span>Express Dispatch Fee:</span>
                      <span>₵10.00 GHS</span>
                    </div>
                    <div className="flex justify-between text-white font-bold pt-2 border-t border-white/10 text-sm">
                      <span>Total Paid/Due:</span>
                      <span className="text-brand-gold">₵{receiptModalBooking.amount || 45}.00 GHS</span>
                    </div>
                  </div>

                  <div className="p-3 bg-black/50 rounded-xl border border-white/5 text-[10px] font-mono text-stone-400 flex justify-between items-center">
                    <span>Payment Status:</span>
                    <span className={`px-2 py-0.5 rounded font-bold uppercase ${receiptModalBooking.paymentStatus === 'Paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {receiptModalBooking.paymentStatus || 'Pending / COD'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="w-full py-2.5 bg-brand-sage text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-brand-sage-light transition-all cursor-pointer font-mono flex items-center justify-center gap-1.5"
                >
                  <Receipt className="w-4 h-4" /> Print / Save PDF Receipt
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
