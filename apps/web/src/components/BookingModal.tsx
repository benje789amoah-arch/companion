import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, MapPin, Sparkles, Clock, ShieldCheck, CheckCircle, Smartphone, CreditCard, Wallet, Banknote, Lock, CheckCircle2, QrCode } from 'lucide-react';
import {
  DEFAULT_SCENT,
  DEFAULT_STARCH,
  DELIVERY_TIME_SLOTS,
  PHONE_DIGITS,
  PHONE_LENGTH_MESSAGE,
  PICKUP_TIME_SLOTS,
  SCENTS,
  STARCH_LEVELS,
  deliverySlotsFor,
  encodeFinish,
  isCompletePhone,
  isGarmentService,
  isoDaysFromNow,
  isoPlusDays,
  limitPhoneInput,
  newJobId,
  describeItems,
  quoteBooking,
  samePhone,
  serviceTakesQuantity,
  serviceUnit,
  clampQuantity,
  pluraliseUnit,
  MAX_ITEMS,
  MAX_QUANTITY,
  type BookingItem,
  deriveSuburb,
  type Coords,
  type UserAccount,
} from '@freshfold/core';
import { ApiError } from '@freshfold/core';
import { Booking } from '../types';
import * as store from '../services/store';
import { BOOKABLE_SERVICE_ITEMS } from '../data';
import AddressAutocomplete from './AddressAutocomplete';
import PickupPinField, { type PinOrigin } from './PickupPinField';
import { usePaystackReturn } from './PaystackReturn';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedService?: string;
  onBookingCreated: (booking: Booking) => void;
}

export default function BookingModal({ isOpen, onClose, preselectedService = '', onBookingCreated }: BookingModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  /**
   * The doorstep, when the customer places one. Left null the dispatch server
   * derives a pin from the typed address, which lands in the right suburb and
   * the wrong street.
   */
  const [pickupPin, setPickupPin] = useState<Coords | null>(null);
  /** How that pin came to be, so the field can say so under the map. */
  const [pinOrigin, setPinOrigin] = useState<PinOrigin>(null);

  /**
   * The collection zone this booking is filed under.
   *
   * Derived, never typed. The dispatch board still groups by suburb and the
   * supervisor still filters on it, but it is a fact about where the pin is,
   * not a separate answer the customer can get wrong — and they routinely did,
   * because "Ayeduase" and a pin on campus were both accepted and nothing
   * reconciled them.
   */
  const suburb = useMemo(() => deriveSuburb(pickupPin, address), [pickupPin, address]);
  /**
   * The services on this order, and how many of each.
   *
   * A list rather than a single service: "two loads of washing and a set of bed
   * linen" is one collection, one courier and one doorstep, and making the
   * customer book it twice produced two jobs for one visit. The first line is
   * the order's primary service — it is what `serviceType` is submitted as, and
   * what the rider app and the desk board display.
   *
   * Quantities are clamped on the way in here and again by `quoteBooking` and
   * the server: this is a form, and a form is not the only thing that can post
   * a booking.
   */
  const [items, setItems] = useState<BookingItem[]>(() => [
    { serviceType: BOOKABLE_SERVICE_ITEMS[0]?.name || 'Washing (Machine & Hand Wash)', quantity: 1 },
  ]);

  /** The primary line, which the rest of the form still speaks in terms of. */
  const service = items[0]?.serviceType ?? '';

  const setItemService = (index: number, next: string) =>
    setItems((current) =>
      current.map((item, i) =>
        // A new service starts at one: four loads of washing is not four car
        // details, and carrying the count across would quote ₵600 for a change
        // of mind.
        i === index ? { serviceType: next, quantity: 1 } : item
      )
    );

  const setItemQuantity = (index: number, next: number) =>
    setItems((current) =>
      current.map((item, i) =>
        i === index ? { ...item, quantity: clampQuantity(next, item.serviceType) } : item
      )
    );

  const addItem = () =>
    setItems((current) =>
      current.length >= MAX_ITEMS
        ? current
        : [
            ...current,
            {
              // The first service they have not already added, so a second line
              // does not open as a duplicate of the first.
              serviceType:
                BOOKABLE_SERVICE_ITEMS.find(
                  (candidate) => !current.some((item) => item.serviceType === candidate.name)
                )?.name ?? BOOKABLE_SERVICE_ITEMS[0].name,
              quantity: 1,
            },
          ]
    );

  // Never below one line: an order with no service is not an order.
  const removeItem = (index: number) =>
    setItems((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTimeSlot, setPickupTimeSlot] = useState<string>(PICKUP_TIME_SLOTS[0]);

  /**
   * How full each window is on the chosen day.
   *
   * Advisory: the booking route enforces the same ceiling regardless, so a form
   * working from a stale answer is refused rather than allowed to overbook. What
   * this buys is the customer finding out *before* they fill in the rest of the
   * form rather than after they press Confirm.
   *
   * Empty while it loads and on any failure — an unreachable server should not
   * grey out every window and make the form look broken.
   */
  const [slotState, setSlotState] = useState<Record<string, { remaining: number; full: boolean }>>({});

  /**
   * The return leg, and the window the customer wants it in.
   *
   * Until this existed the return was `pickupDate + 1` with no time on it and
   * nothing the customer could say about it — they chose the hour their clothes
   * left and had no say at all in the hour they came back.
   *
   * The date is still derived rather than chosen: a standard 24-hour turnaround
   * is what the whole product is written around, and the express service is the
   * exception the desk arranges. What is new is the hour.
   */
  const deliveryDate = useMemo(
    () => isoPlusDays(pickupDate, 1) ?? isoDaysFromNow(2),
    [pickupDate]
  );

  const returnOptions = useMemo(
    () => deliverySlotsFor(pickupDate, pickupTimeSlot, deliveryDate),
    [pickupDate, pickupTimeSlot, deliveryDate]
  );

  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState<string>(DELIVERY_TIME_SLOTS[0]);
  const [deliveryState, setDeliveryState] = useState<
    Record<string, { remaining: number; full: boolean }>
  >({});

  useEffect(() => {
    if (!isOpen || !pickupDate) return;

    let cancelled = false;
    store.api
      .slotAvailability(pickupDate, { deliveryDate })
      .then((answer) => {
        if (cancelled) return;
        const next: Record<string, { remaining: number; full: boolean }> = {};
        for (const row of answer.slots) next[row.slot] = { remaining: row.remaining, full: row.full };
        setSlotState(next);

        const back: Record<string, { remaining: number; full: boolean }> = {};
        for (const row of answer.deliverySlots ?? []) {
          back[row.slot] = { remaining: row.remaining, full: row.full };
        }
        setDeliveryState(back);
      })
      .catch(() => {
        if (cancelled) return;
        setSlotState({});
        setDeliveryState({});
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, pickupDate, deliveryDate]);

  /**
   * Keep the return on a window the collection can actually reach.
   *
   * Two ways it stops being reachable — it fills up, or the customer moves the
   * collection later and a same-day return now falls before the laundry is back.
   * `returnOptions` already accounts for the second, so both are one check.
   */
  useEffect(() => {
    const reachable = returnOptions.some((slot) => slot.label === deliveryTimeSlot);
    if (reachable && !deliveryState[deliveryTimeSlot]?.full) return;

    const open = returnOptions.find((slot) => !deliveryState[slot.label]?.full);
    if (open) setDeliveryTimeSlot(open.label);
  }, [returnOptions, deliveryState, deliveryTimeSlot]);

  /**
   * Move off a window that filled up while the form was open.
   *
   * Without this the customer keeps a selection the server will refuse, and
   * finds out at the end. Falls back to leaving it alone when every window is
   * full — there is nowhere to move them to, and the error on submit is then
   * the honest answer.
   */
  useEffect(() => {
    if (!slotState[pickupTimeSlot]?.full) return;
    const open = PICKUP_TIME_SLOTS.find((slot) => !slotState[slot]?.full);
    if (open) setPickupTimeSlot(open);
  }, [slotState, pickupTimeSlot]);
  const [specialScent, setSpecialScent] = useState(DEFAULT_SCENT);
  const [starchLevel, setStarchLevel] = useState(DEFAULT_STARCH);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [riderNote, setRiderNote] = useState('');

  /**
   * The booking's id, allocated before anything is paid.
   *
   * It used to be minted at the bottom of `handleSubmit`, which was too late:
   * Paystack checkout happens *before* the form is submitted, and the server will
   * only settle a payment whose `metadata.booking_id` names the booking it is
   * settling. Without that binding a customer could pay for one ₵30 wash and quote
   * its reference against every other booking they hold.
   *
   * So the id exists from the moment the form opens and travels into the checkout.
   * A fresh one per booking — see the reset in the `isOpen` effect.
   */
  const [bookingId, setBookingId] = useState(() => newJobId());

  // Payment states
  const [paymentMethod, setPaymentMethod] = useState<'Paystack' | 'Wallet' | 'Pay on Pickup'>('Paystack');
  /**
   * Whether Paystack has confirmed the money arrived.
   *
   * A gate on *offering* to submit, and no longer a claim that gets written down:
   * the booking's `paymentStatus` is the server's, settled through
   * `store.payForBooking`. This used to be set by selecting the wallet tab and by
   * a "Mark Paid" button, and then sent as `paymentStatus: 'Paid'` — so the record
   * said settled because the browser said so.
   */
  const [isPaid, setIsPaid] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  /** Where the settle call's failure is reported, so it is never silent. */
  const [settleError, setSettleError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Paystack states
  const [paystackLoading, setPaystackLoading] = useState(false);
  const [paystackAuthUrl, setPaystackAuthUrl] = useState('');
  const [paystackRef, setPaystackRef] = useState('');
  const [paystackError, setPaystackError] = useState('');

  const handlePaystackInit = async () => {
    setPaystackLoading(true);
    setPaystackError('');
    try {
      // No invented fallback. This ran with `'patron@freshfold.com'` when the
      // form and the session were both blank, and that address is wrong twice
      // over: Paystack mails the receipt to it, and `/accounts/wallet` matches
      // the payer against the session before it credits anything — so a
      // customer who paid under the placeholder is refused their own money with
      // `reference-not-yours`. Asked for here rather than discovered there.
      const userEmail = email.trim() || loggedInUser?.email || '';
      if (!userEmail) {
        throw new Error('Add your email address above before paying — the receipt is sent there.');
      }
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          amount: estimatedPrice,
          // Where Paystack sends the customer back to. This page knows its own
          // origin; the server's APP_URL is a single fixed guess that is wrong
          // for everyone not running the site on the machine it names.
          callback_url: `${window.location.origin}/#paystack-success`,
          metadata: {
            // What binds this payment to this booking. The server refuses to
            // settle a bill with a reference that names a different one, so
            // without this the payment cannot be applied at all.
            booking_id: bookingId,
            customer_name: name || 'Patron',
            phone: phone,
            service: service,
          }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.error || 'Failed to initialize Paystack checkout.');
      }
      setPaystackAuthUrl(data.authorization_url);
      setPaystackRef(data.reference);
      setTransactionRef(data.reference);
      
      // Open Paystack authorization URL
      window.open(data.authorization_url, '_blank', 'width=600,height=750');
    } catch (err: any) {
      setPaystackError(err.message || 'Error connecting to Paystack payment gateway.');
    } finally {
      setPaystackLoading(false);
    }
  };

  /**
   * Asks the server what became of the reference this screen opened.
   *
   * `announce` is what separates the two callers. The button below is a
   * question the customer just asked, so every outcome deserves an answer —
   * including "still pending", which is the one that tells them the checkout is
   * not finished. The automatic call from `usePaystackReturn` is not a
   * question: the redirect fires for an abandoned checkout as readily as a paid
   * one, so a pending result there is the ordinary case and popping an alert
   * over it would be scolding somebody for closing a window.
   */
  const runPaystackVerify = async (announce: boolean) => {
    if (!paystackRef) return;
    setPaystackLoading(true);
    setPaystackError('');
    try {
      const res = await fetch(`/api/paystack/verify/${encodeURIComponent(paystackRef)}`);
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.error || 'Paystack payment verification failed.');
      }
      if (data.data && data.data.status === 'success') {
        setIsPaid(true);
        setTransactionRef(data.data.reference || paystackRef);
        if (announce) alert('Paystack payment verified successfully!');
      } else if (announce) {
        alert(`Paystack transaction status: ${data.data?.status || 'pending'}. Please complete payment on Paystack checkout and try again.`);
      }
    } catch (err: any) {
      // Surfaced on the panel either way — it is the one outcome the customer
      // cannot act on without being told.
      setPaystackError(err.message || 'Error verifying Paystack payment.');
    } finally {
      setPaystackLoading(false);
    }
  };

  const handlePaystackVerify = () => runPaystackVerify(true);

  // The checkout popup coming back is as good a moment to check as the button.
  // Gated on there being a reference at all, so this window is not listening
  // for messages before it has opened anything.
  usePaystackReturn(useCallback(() => void runPaystackVerify(false), [paystackRef]), !!paystackRef);
  
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  /**
   * The signed-in customer, kept in step with the store.
   *
   * Typed, and subscribed rather than read once. The wallet balance below comes
   * off this: it used to be a `useState(0)` that nothing ever wrote to, so the
   * wallet tab advertised "Bal: ₵0.00" to every customer regardless of what they
   * actually held, and the guard in `handleSubmit` rejected every wallet payment
   * for any service that cost anything. A top-up made in the customer app now
   * lands here on the next poll.
   */
  const [loggedInUser, setLoggedInUser] = useState<UserAccount | null>(null);

  useEffect(() => {
    const sync = () => setLoggedInUser(store.readCurrentUser());
    sync();
    return store.subscribe(sync);
  }, []);

  /** The real balance, from the account. Never a local subtraction. */
  const walletBalance = loggedInUser?.walletBalance ?? 0;

  /**
   * Whether the booking on the confirmation screen has reached the server yet.
   *
   * A write that cannot be sent is kept in a queue and retried, and the screen
   * used to promise an email regardless — so a booking made while the dispatch
   * server was unreachable sat in this browser claiming a receipt was on its
   * way. It stays subscribed rather than reading once, because the queue
   * usually drains a moment later and the panel should stop warning by itself.
   */
  const [awaitingServer, setAwaitingServer] = useState(false);

  useEffect(() => {
    if (!createdBooking) return;
    const check = () => setAwaitingServer(store.isBookingPending(createdBooking.id));
    check();
    return store.subscribe(check);
  }, [createdBooking]);

  // Check for active logged in session on open and pre-fill credentials & logistics
  useEffect(() => {
    if (isOpen) {
      // A fresh id per booking, and the payment state that hangs off it. Without
      // the reset a second booking in the same session would carry the first
      // one's id and its Paystack reference.
      setBookingId(newJobId());
      setIsPaid(false);
      setTransactionRef('');
      setPaystackRef('');
      setPaystackAuthUrl('');
      setSettleError('');

      try {
        const user = store.readCurrentUser();
        if (user) {
          setLoggedInUser(user);
          setName(user.name || '');
          setEmail(user.email || '');
          setPhone(user.phone || '');

          // Look for past bookings under this email or phone to pre-fill address, city, suburb
          const allBookings: Booking[] = store.readBookings();
          const matched = allBookings.filter(
            b => 
              (b.email && user.email && b.email.toLowerCase() === user.email.toLowerCase()) || 
              samePhone(b.phone, user.phone)
          );
          if (matched.length > 0) {
            // Sort by createdAt descending to get the most recent one
            matched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const latest = matched[0];
            if (latest.address) setAddress(latest.address);
            if (latest.city) setCity(latest.city);
            // The pin travels with the address it was placed for. A patron
            // booking the same pickup again should not have to aim it twice.
            setPickupPin(latest.pickupCoords ?? null);
            setPinOrigin(latest.pickupCoords ? 'map' : null);
          } else {
            setPickupPin(null);
            setPinOrigin(null);
          }
        } else {
          setLoggedInUser(null);
          setName('');
          setEmail('');
          setPhone('');
          setAddress('');
          setCity('');
          setPickupPin(null);
          setPinOrigin(null);
        }
      } catch (e) {
        console.warn('Could not read existing session state for booking prefill', e);
      }
    }
  }, [isOpen]);

  // Sync preselected services on open
  useEffect(() => {
    if (preselectedService) {
      // Replaces the first line rather than appending: this is the card the
      // visitor clicked on the marketing page, so it is the order's subject.
      setItemService(0, preselectedService);
    }
  }, [preselectedService, isOpen]);

  /**
   * The quote, from the shared table.
   *
   * This used to be a cascade of `service.includes(…)` branches with the scent
   * and starch surcharges bolted on, duplicating the customer app's
   * `priceBreakdown` — and disagreeing with it, because the test for the
   * unscented option was `specialScent !== 'Fragrance-Free'` while the option's
   * value is `'Fragrance-Free (Pure Hypoallergenic Soap)'`. The two are never
   * equal, so the website charged ₵5 for the one scent that is free and the app
   * did not. Same selections, two prices, depending on where you booked.
   *
   * `quoteBooking` rather than `priceBreakdown`, and with the same two arguments
   * the server passes: this showed the list price while the server recorded the
   * discounted total, so a member was quoted one number and billed another. It
   * was not only cosmetic — `handlePaystackInit` sends this figure to Paystack,
   * so a member paying by card was charged the gross for a booking the ledger
   * had already marked down.
   *
   * The plan and the points come off the signed-in account, which is where the
   * server reads them too. Signed out, neither is passed and the answer is the
   * list price, which is what a guest pays.
   */
  /**
   * A promo code the customer has typed, and what the server said it is worth.
   *
   * The *server's* answer, never this form's arithmetic. `checkPromoCode` runs
   * the same `checkPromo` the booking route runs, against the same row and the
   * same redemption counts — a form that worked out its own discount would
   * promise 20% where the server gives 20% capped at ₵15, and be wrong for
   * exactly the length of one checkout.
   */
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<{ code: string; discount: number; label: string } | null>(
    null
  );
  const [promoError, setPromoError] = useState('');
  const [promoChecking, setPromoChecking] = useState(false);

  const estimate = useMemo(
    () =>
      quoteBooking({
        selections: {
          serviceType: service,
          scent: specialScent,
          starch: starchLevel,
          items,
        },
        plan: loggedInUser?.plan ?? null,
        points: loggedInUser ? (loggedInUser.points ?? 0) : undefined,
        promo,
      }),
    [service, specialScent, starchLevel, items, loggedInUser, promo]
  );
  const estimatedPrice = estimate.total;

  /**
   * Re-checks a held code whenever the order changes.
   *
   * A code with a minimum spend, or a percentage one, is worth a different
   * amount on a different basket — and a customer who applied a code and then
   * removed a service would otherwise carry a discount the server is about to
   * refuse. Dropped rather than recomputed locally, for the reason above.
   */
  const applyPromo = useCallback(
    async (code: string) => {
      const typed = code.trim();
      if (!typed) {
        setPromo(null);
        setPromoError('');
        return;
      }

      setPromoChecking(true);
      setPromoError('');

      try {
        // Checked against the bill *before* any code, which is what the server
        // checks it against too.
        const bill = quoteBooking({
          selections: { serviceType: service, scent: specialScent, starch: starchLevel, items },
          plan: loggedInUser?.plan ?? null,
          points: loggedInUser ? (loggedInUser.points ?? 0) : undefined,
        }).total;

        const answer = await store.api.checkPromoCode({
          code: typed,
          subtotal: bill,
          email: email.trim() || undefined,
        });

        if (answer.ok) {
          setPromo({ code: answer.code, discount: answer.discount, label: answer.label });
        } else {
          setPromo(null);
          setPromoError(answer.error);
        }
      } catch {
        setPromo(null);
        setPromoError('Could not check that code. You can still book without it.');
      } finally {
        setPromoChecking(false);
      }
    },
    [service, specialScent, starchLevel, items, loggedInUser, email]
  );

  /**
   * Opens on tomorrow.
   *
   * Through `isoDaysFromNow` rather than `new Date()` + `setDate` +
   * `toISOString`, which was three timezone frames in three lines and landed on
   * the wrong day either side of Greenwich: on a phone in Tokyo it offered
   * *today* all morning, and on one in Los Angeles it skipped to the day after
   * tomorrow from six in the evening. Correct in Accra at every hour, which is
   * why nothing here ever saw it.
   */
  useEffect(() => {
    setPickupDate(isoDaysFromNow(1));
  }, [isOpen]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !address || !pickupDate) {
      alert('Please fill out all required physical details to coordinate transport.');
      return;
    }

    // The confirmation — and with it the link that sets the portal password —
    // is emailed, so a booking without an address to send it to leaves the
    // patron with no way into their own tracking terminal.
    if (!email.trim()) {
      alert('Please add your email address. Your booking receipt and portal setup link are sent there.');
      return;
    }

    // The courier rings this number from the doorstep, so a partial one is
    // worse than none: it looks like a contact and reaches nobody.
    if (!isCompletePhone(phone)) {
      alert(PHONE_LENGTH_MESSAGE);
      return;
    }

    /**
     * A wallet that cannot cover it is worth saying up front.
     *
     * Advisory only now — the server checks the balance again when it takes the
     * money, on a locked row, against the price it worked out itself. This is here
     * so the customer is told before they commit rather than after.
     */
    if (paymentMethod === 'Wallet' && walletBalance < estimatedPrice) {
      alert(
        `Insufficient wallet balance (₵${walletBalance.toFixed(2)} GHS) for this ₵${estimatedPrice.toFixed(2)} booking. ` +
          'Top up from the patron portal, or pay by card or mobile money.'
      );
      return;
    }

    const newBooking: Booking = {
      id: bookingId,
      name,
      email: email.trim(),
      phone,
      // The lines the quote was computed from, and the primary pair derived
      // from the first of them — the server rewrites both the same way.
      items: estimate.items,
      serviceType: estimate.items[0].serviceType,
      quantity: estimate.items[0].quantity,
      pickupDate,
      pickupTime: pickupTimeSlot,
      /**
       * Standard 24h turnaround, as calendar arithmetic with no timezone in it.
       *
       * `isoPlusDays` replaced three lines that added one *local* day to a UTC
       * midnight. That happened to agree everywhere, but it was right by
       * cancellation rather than by construction and sat one edit from not
       * being. The fallback covers a blank or half-typed date, which
       * `handleSubmit` has already refused above.
       */
      deliveryDate,
      // Left off when the collection leaves no room for one — an evening
      // collection has no same-day return to offer — rather than sent and
      // refused, which would lose the whole booking over the return window.
      deliveryTime: returnOptions.some((slot) => slot.label === deliveryTimeSlot)
        ? deliveryTimeSlot
        : undefined,
      /**
       * The code as typed, not the discount.
       *
       * What it is worth is the server's to decide — a client that sent an
       * amount would be stating its own price, which is the mistake `amount`
       * and `paymentStatus` are already stripped for.
       */
      promoCode: promo?.code,
      specialInstructions: encodeFinish({
        serviceType: service,
        scent: specialScent,
        starch: starchLevel,
        notes: specialInstructions,
      }),
      riderNote: riderNote.trim() || undefined,
      address,
      city: city || 'Boutique Care District',
      suburb,
      // Optional by design. The server falls back to a pin derived from the
      // address when there is none, and refuses one outside the service area.
      pickupCoords: pickupPin ?? undefined,
      status: 'Scheduled',
      createdAt: new Date().toISOString(),
      /**
       * How they intend to pay. Not whether they have.
       *
       * `paymentStatus`, `amount`, `paidAt` and `transactionRef` are all the
       * server's now and are dropped from anything sent here — it prices the
       * booking with `quoteBooking` and will not mark one `Paid` outside
       * `POST /bookings/:id/payment`. This screen used to send
       * `paymentStatus: 'Paid'` with a reference it had generated locally
       * (`'TXN-' + Math.random()`), which is a record of a payment that never
       * happened anywhere.
       */
      paymentMethod,
    };

    // Hand the booking to the dispatch server. It derives the pickup pin, bag
    // manifest, priority and price, and the job appears on the rider app's board.
    store.createBooking(newBooking);

    onBookingCreated(newBooking);
    setCreatedBooking(newBooking);
    setIsSuccess(true);

    /**
     * Now settle it, if anything is owed up front.
     *
     * After the optimistic create rather than before, so the confirmation screen
     * appears immediately and the pickup is never lost to a payment that failed —
     * the booking is real and dispatchable either way, and an unpaid one reads
     * `Pending` to the desk, which is true.
     *
     * `payForBooking` drains the write queue first, so the booking is on the
     * server before anything tries to pay for it.
     */
    if (paymentMethod === 'Pay on Pickup') return;
    if (paymentMethod === 'Paystack' && !isPaid) return;

    setSubmitting(true);
    setSettleError('');

    try {
      const settled = await store.payForBooking(
        newBooking.id,
        paymentMethod,
        paymentMethod === 'Paystack' ? (transactionRef || paystackRef) : undefined
      );
      setCreatedBooking(settled);
    } catch (error) {
      // Said out loud on the confirmation screen. The pickup stands; the bill
      // does not, and the customer needs to know which.
      setSettleError(
        error instanceof ApiError
          ? error.message
          : 'Your pickup is booked, but we could not take the payment just now. Settle it from the patron portal.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Compile WhatsApp redirect URL based on form data.
  //
  // Hidden for now, along with the button on the success screen. The confirmation
  // email already carries this detail, so nothing is lost while it is switched off.
  //
  // A note to the desk about the order, and nothing more. The portal setup link
  // used to ride along in this message; it is emailed now, so it no longer sits
  // in a chat thread that anyone holding the phone can scroll back through.
  // const triggerWhatsAppRedirect = () => {
  //   if (!createdBooking) return;
  //   const formatMsg = [
  //     'Hi FreshFold Laundry Co.! I would like to confirm my premium clothing pickup:',
  //     `• Booking ID: ${createdBooking.id}`,
  //     `• Patron: ${createdBooking.name}`,
  //     `• Fabric Treatment: ${createdBooking.serviceType}`,
  //     `• Pickup: ${createdBooking.pickupDate} @ ${createdBooking.pickupTime}`,
  //     `• Scent: ${specialScent}`,
  //     `• Delivery: ${createdBooking.deliveryDate}`,
  //     `• Surcharges Estimate: ₵${estimatedPrice}.00 GHS`,
  //     `• Address: ${createdBooking.address}, ${createdBooking.suburb}`,
  //     createdBooking.riderNote ? `• Note for Rider: ${createdBooking.riderNote}` : '',
  //   ].filter(Boolean).join('\n');
  //
  //   const encoded = encodeURIComponent(formatMsg);
  //   window.open(`https://wa.me/233200957165?text=${encoded}`, '_blank');
  // };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-brand-charcoal/90 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Dialog Frame - Curved block container matching the premium theme */}
      <div className="relative w-full max-w-2xl bg-[#0C0C0C] rounded-2xl border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden z-10 text-left">
        
        {/* Modal Brand Border Line */}
        <div className="h-1.5 bg-brand-sage" />

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-left">
            <span className="font-mono text-[9px] tracking-[0.25em] text-brand-sage uppercase font-bold">
              Secure Scheduling Engine
            </span>
            <h3 className="font-serif text-lg text-white font-medium">
              Schedule Garment Concierge Pickup
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.form 
              key="booking-form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6 space-y-5 max-h-[80vh] overflow-y-auto"
            >
              
              {/* Form segment - Personal Credentials */}
              <div className="space-y-3">
                <h4 className="font-sans text-[10px] uppercase tracking-wider text-stone-500 font-bold">
                  01. Patron Credentials
                </h4>
                {loggedInUser ? (
                  <div className="bg-[#161616]/70 border border-brand-sage/20 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center space-x-3.5 text-left">
                      <div className="p-2.5 rounded-lg bg-brand-sage/10 text-brand-sage border border-brand-sage/20 shrink-0">
                        <ShieldCheck className="w-5 h-5 text-brand-sage" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-xs font-semibold text-white uppercase tracking-wider">{loggedInUser.name}</span>
                          <span className="text-[7.5px] tracking-widest uppercase bg-brand-sage/20 text-brand-sage px-1.5 py-0.5 rounded border border-brand-sage/30 font-mono font-black">
                            Portal Patron Linked
                          </span>
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                          {loggedInUser.email} • {loggedInUser.phone}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[7.5px] text-stone-500 uppercase font-mono tracking-[0.15em] block">Status: Verified</span>
                      <span className="text-[9.5px] text-brand-sage font-sans font-light">Credentials locked</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Paapa Cobbold"
                          className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                          Phone Number (for Courier SMS) *
                        </label>
                        <input
                          type="tel"
                          required
                          inputMode="numeric"
                          maxLength={PHONE_DIGITS}
                          value={phone}
                          onChange={(e) => setPhone(limitPhoneInput(e.target.value))}
                          placeholder={`${PHONE_DIGITS} digits — e.g. 0244000000`}
                          className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                        Email Address (for Receipt & Portal Password Link) *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. PCobbold@yahoo.com"
                        className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Form segment - Pickup Logistics */}
              <div className="space-y-3 pt-2">
                <h4 className="font-sans text-[10px] uppercase tracking-wider text-stone-500 font-bold">
                  02. Transit Logistics
                </h4>
                <div>
                  <label
                    htmlFor="booking-address"
                    className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5"
                  >
                    Contactless Doorstep / Locker Pickup Address *
                  </label>
                  {/* Choosing a suggestion places the pin on the building, so
                      the room number gets typed onto an address that is
                      already in the right place. Typing straight past the list
                      still works — it is a text field first. */}
                  <AddressAutocomplete
                    id="booking-address"
                    value={address}
                    onChange={setAddress}
                    onPlaceSelected={(detail) => {
                      setAddress(detail.address);
                      setPickupPin(detail.coords);
                      setPinOrigin('place');
                    }}
                    placeholder="e.g. Victory Towers Hostel (Tabua's Court)"
                    className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                  />
                </div>
                {/* The suburb used to be a required box here. It is derived
                    from the pin now — see `suburb` above — because a customer
                    who has chosen a building or dropped a pin has already said
                    where they are, and asking them to also sort it into a
                    collection zone was asking them to do our filing. */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Kumasi"
                    className="w-full bg-[#161616] text-white placeholder-[#8E9299]/50 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                  />
                </div>

                {/* The doorstep itself, which the typed address above cannot
                    give us: a hostel block and room number is something no
                    geocoder knows. */}
                <PickupPinField
                  value={pickupPin}
                  onChange={setPickupPin}
                  suburb={suburb}
                  address={address}
                  origin={pinOrigin}
                  onOriginChange={setPinOrigin}
                />

                {/* Short note for the rider */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Short Note for Courier Rider (Optional)</span>
                    <span className="text-[9.5px] font-mono text-brand-gold uppercase tracking-wider font-semibold">Courier Navigation Tip</span>
                  </label>
                  <textarea
                    rows={2}
                    value={riderNote}
                    onChange={(e) => setRiderNote(e.target.value)}
                    placeholder="e.g. Call when outside hostel gate, ask for Kwame, leave with security at reception, or door 4B."
                    className="w-full bg-[#161616] text-white placeholder-[#8E9299]/40 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors resize-none"
                  />
                </div>
              </div>

              {/* Form segment - Fabric Selection and custom variables */}
              <div className="space-y-3 pt-2">
                <h4 className="font-sans text-[10px] uppercase tracking-wider text-stone-500 font-bold">
                  03. Garment specifications & Scent matching
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/*
                    One row per service. A single-service order is the common
                    case and looks like one row; "two loads and a set of linen"
                    is two, and travels as one collection rather than two
                    bookings for one doorstep.
                  */}
                  <div className="md:col-span-2 space-y-3">
                    {items.map((item, index) => {
                      const itemUnit = serviceUnit(item.serviceType);
                      const itemCountable = serviceTakesQuantity(item.serviceType);

                      return (
                        <div
                          key={index}
                          className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end"
                        >
                          <div>
                            <label
                              htmlFor={`booking-service-${index}`}
                              className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5"
                            >
                              {index === 0 ? 'Primary Service Treatment' : `Service ${index + 1}`}
                            </label>
                            <select
                              id={`booking-service-${index}`}
                              value={item.serviceType}
                              onChange={(e) => setItemService(index, e.target.value)}
                              className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors text-left"
                            >
                              {BOOKABLE_SERVICE_ITEMS.map((srv) => (
                                <option key={srv.id} value={srv.name}>
                                  {srv.name} ({srv.priceInfo})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-end gap-2">
                            {/* The stepper, only for a service priced per
                                countable thing — an order is one order however
                                much of it there is. */}
                            {itemCountable && (
                              <div>
                                <label
                                  htmlFor={`booking-quantity-${index}`}
                                  className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5"
                                >
                                  {pluraliseUnit(itemUnit, 2)}
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setItemQuantity(index, item.quantity - 1)}
                                    disabled={item.quantity <= 1}
                                    aria-label={`One fewer ${itemUnit}`}
                                    className={`w-10 h-11 shrink-0 rounded-xl border text-lg font-bold transition-colors ${
                                      item.quantity <= 1
                                        ? 'bg-white/5 border-white/5 text-stone-600 cursor-not-allowed'
                                        : 'bg-[#161616] border-white/10 text-white hover:border-brand-sage cursor-pointer'
                                    }`}
                                  >
                                    &minus;
                                  </button>
                                  <input
                                    id={`booking-quantity-${index}`}
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={MAX_QUANTITY}
                                    value={item.quantity}
                                    onChange={(e) => setItemQuantity(index, Number(e.target.value))}
                                    className="w-16 bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs text-center font-mono"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setItemQuantity(index, item.quantity + 1)}
                                    disabled={item.quantity >= MAX_QUANTITY}
                                    aria-label={`One more ${itemUnit}`}
                                    className={`w-10 h-11 shrink-0 rounded-xl border text-lg font-bold transition-colors ${
                                      item.quantity >= MAX_QUANTITY
                                        ? 'bg-white/5 border-white/5 text-stone-600 cursor-not-allowed'
                                        : 'bg-[#161616] border-white/10 text-white hover:border-brand-sage cursor-pointer'
                                    }`}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Never on the first row: an order needs a service. */}
                            {items.length > 1 && index > 0 && (
                              <button
                                type="button"
                                onClick={() => removeItem(index)}
                                aria-label={`Remove ${item.serviceType}`}
                                className="w-10 h-11 shrink-0 rounded-xl border border-white/10 bg-[#161616] text-stone-400 hover:text-red-400 hover:border-red-400/40 transition-colors cursor-pointer"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {items.length < MAX_ITEMS && (
                      <button
                        type="button"
                        onClick={addItem}
                        className="text-[11px] font-semibold uppercase tracking-wider text-brand-sage hover:text-brand-sage-light transition-colors cursor-pointer"
                      >
                        + Add another service
                      </button>
                    )}
                  </div>
                  {/*
                    A car detail and an office clean take no fabric finish, and
                    the app hides these pickers for them. The website used to
                    show them, charge for them, and write "Organic Lavender
                    scent, None starch" onto the courier's card for a car.
                  */}
                  {isGarmentService(service) && (
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Earthy Essential Oil Scent
                    </label>
                    <select
                      value={specialScent}
                      onChange={(e) => setSpecialScent(e.target.value)}
                      className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors text-left"
                    >
                      {SCENTS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.id}
                          {option.surcharge > 0 ? ` (+ ₵${option.surcharge.toFixed(2)})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Urgency Timeline
                    </label>
                    <input
                      type="date"
                      required
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Pickup Window Timeslot
                    </label>
                    <select
                      value={pickupTimeSlot}
                      onChange={(e) => setPickupTimeSlot(e.target.value)}
                      className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors text-left"
                    >
                      {PICKUP_TIME_SLOTS.map((slot) => {
                        const state = slotState[slot];
                        return (
                          <option key={slot} value={slot} disabled={state?.full}>
                            {slot}
                            {state?.full
                              ? ' — full'
                              : state && state.remaining <= 3
                                ? ` — ${state.remaining} left`
                                : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Return Window
                      {pickupDate && (
                        <span className="ml-2 normal-case font-normal tracking-normal text-stone-500">
                          back to you on {deliveryDate}
                        </span>
                      )}
                    </label>
                    <select
                      value={deliveryTimeSlot}
                      onChange={(e) => setDeliveryTimeSlot(e.target.value)}
                      className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors text-left"
                    >
                      {DELIVERY_TIME_SLOTS.map((slot) => {
                        const state = deliveryState[slot];
                        // Unreachable and full are different refusals, and
                        // saying which is more use than one word for both.
                        const reachable = returnOptions.some((option) => option.label === slot);

                        return (
                          <option key={slot} value={slot} disabled={!reachable || state?.full}>
                            {slot}
                            {!reachable
                              ? ' — too early'
                              : state?.full
                                ? ' — full'
                                : state && state.remaining <= 3
                                  ? ` — ${state.remaining} left`
                                  : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isGarmentService(service) && (
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Starch Level Treatment (Ironed items)
                    </label>
                    <div className="flex gap-2.5">
                      {STARCH_LEVELS.map((level) => (
                        <button
                          type="button"
                          key={level.id}
                          onClick={() => setStarchLevel(level.id)}
                          className={`flex-1 py-2 text-xs rounded-xl border cursor-pointer transition-all duration-300 ${
                            starchLevel === level.id
                              ? 'bg-brand-sage border-brand-sage text-white font-bold'
                              : 'bg-[#161616] border-white/10 text-[#8E9299] hover:text-white'
                          }`}
                        >
                          {level.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  )}
                  <div>
                    <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                      Special Garment instructions ?
                    </label>
                    <input
                      type="text"
                      value={specialInstructions}
                      onChange={(e) => setSpecialInstructions(e.target.value)}
                      placeholder="e.g. Leave bag inside locker 12, code 1902"
                      className="w-full bg-[#161616] text-white placeholder-[#8E9299]/40 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Form segment - 04. Payment Method Integration */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <h4 className="font-sans text-[10px] uppercase tracking-wider text-stone-500 font-bold flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-brand-sage" />
                    <span>04. Payment Settlement & Guarantee</span>
                  </h4>
                  {isPaid ? (
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg font-mono font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> PAID ON-THE-FLY ({transactionRef})
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-mono text-brand-gold uppercase tracking-wider">
                      Ghana MoMo & Cards Supported
                    </span>
                  )}
                </div>

                {/* Payment Option Selector Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('Paystack'); setIsPaid(false); }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'Paystack'
                        ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-lg'
                        : 'bg-[#161616] border-white/10 text-stone-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                      <span className="text-[7.5px] bg-emerald-500/20 text-emerald-400 font-mono px-1 rounded font-bold uppercase">Online</span>
                    </div>
                    <div>
                      <p className="font-bold text-[11px] leading-tight text-emerald-400">Paystack</p>
                      <p className="text-[8.5px] text-stone-400 font-mono">MoMo & Cards</p>
                    </div>
                  </button>

                  {/*
                    Selecting the wallet tab used to set `isPaid`, which then went
                    out as `paymentStatus: 'Paid'` — so choosing how to pay was
                    the same act as having paid. The debit happens in
                    `payForBooking`, after the booking exists.
                  */}
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('Wallet'); setIsPaid(false); }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'Wallet'
                        ? 'bg-brand-sage/15 border-brand-sage text-white'
                        : 'bg-[#161616] border-white/10 text-stone-400 hover:text-white'
                    }`}
                  >
                    <Wallet className="w-4 h-4 text-brand-gold mb-1.5" />
                    <div>
                      <p className="font-bold text-[11px] leading-tight">Patron Wallet</p>
                      <p className="text-[8.5px] text-brand-gold font-mono">Bal: ₵{walletBalance}.00</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('Pay on Pickup'); setIsPaid(false); }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between col-span-2 sm:col-span-1 ${
                      paymentMethod === 'Pay on Pickup'
                        ? 'bg-brand-sage/15 border-brand-sage text-white'
                        : 'bg-[#161616] border-white/10 text-stone-400 hover:text-white'
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-amber-400 mb-1.5" />
                    <div>
                      <p className="font-bold text-[11px] leading-tight">Pay on Pickup</p>
                      <p className="text-[8.5px] text-stone-400 font-mono">Cash/Rider</p>
                    </div>
                  </button>
                </div>

                {/* Sub-Panel for Paystack Online Gateway */}
                {paymentMethod === 'Paystack' && (
                  <div className="bg-[#161616] p-4 rounded-xl border border-emerald-500/30 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                          Paystack Ghana Live Gateway
                        </span>
                      </div>
                      <span className="text-[9.5px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold">
                        MTN • Telecel • AT • Cards
                      </span>
                    </div>

                    <p className="text-xs text-stone-300">
                      Amount to settle via Paystack: <strong className="text-emerald-400 font-mono font-bold">₵{estimatedPrice.toFixed(2)} GHS</strong>
                    </p>

                    {paystackError && (
                      <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-xs font-mono">
                        ⚠️ {paystackError}
                      </div>
                    )}

                    {!isPaid ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={handlePaystackInit}
                          disabled={paystackLoading}
                          className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2"
                        >
                          <Lock className="w-4 h-4 text-white" />
                          <span>{paystackLoading ? 'Connecting to Paystack...' : `Pay ₵${estimatedPrice.toFixed(2)} GHS via Paystack`}</span>
                        </button>

                        {paystackAuthUrl && (
                          <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-2 text-left">
                            <p className="text-[11px] text-stone-300 font-mono">
                              Checkout page opened! If pop-up was blocked, click below:
                            </p>
                            <a
                              href={paystackAuthUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block text-xs font-bold text-emerald-400 underline font-mono break-all"
                            >
                              Open Paystack Checkout Link ↗
                            </a>
                            <div className="pt-2 flex gap-2">
                              {/*
                                "Verify" asks Paystack. There used to be a
                                "Mark Paid" button beside it that simply set the
                                flag, and the flag went out as
                                `paymentStatus: 'Paid'` — a settled booking on
                                nobody's word at all. Asking is the only option
                                now, and the server asks again before it takes
                                anything.
                              */}
                              <button
                                type="button"
                                onClick={handlePaystackVerify}
                                disabled={paystackLoading}
                                className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-mono font-bold hover:bg-emerald-500/30 transition-all cursor-pointer"
                              >
                                {paystackLoading ? 'Checking...' : 'Verify Paystack Payment'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 font-mono">
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
                        <span>Paystack Payment Approved ({transactionRef})</span>
                      </div>
                    )}
                  </div>
                )}


                {/* Sub-Panel for Mobile Money Details */}
                {paymentMethod === 'Wallet' && (
                  <div className="bg-[#161616] p-4 rounded-xl border border-brand-gold/30 space-y-2 text-left">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-stone-300 font-medium">FreshFold Digital Wallet Balance:</span>
                      <span className="font-mono font-bold text-brand-gold">₵{walletBalance.toFixed(2)} GHS</span>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-white/10">
                      <span className="text-stone-400">Amount to deduct:</span>
                      <span className="font-mono font-bold text-brand-sage">- ₵{estimatedPrice.toFixed(2)} GHS</span>
                    </div>
                    <p className="text-[10px] text-stone-400 pt-1">
                      Payment will be automatically debited from your patron wallet balance on confirmation.
                    </p>
                  </div>
                )}
              </div>


              {/* Cost Preview estimation panel */}
              <div className="p-4 bg-[#161616] rounded-xl border border-white/10 text-left flex justify-between items-center">
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-stone-500 block">
                    Estimated Transit & Soap Charges *
                  </span>
                  <span className="font-serif text-lg text-white font-medium mt-1 inline-flex items-center gap-1">
                    <Sparkles className="w-4 h-4 text-brand-sage" />
                    Estimated: <span className="text-brand-sage font-bold">₵{estimatedPrice.toFixed(2)} GHS</span>
                  </span>
                  {/* What the total is *for*, itemised — a customer who set a
                      stepper three screens ago can see it is still counted, and
                      one who added a second service can see both lines. Silent
                      for the ordinary single-unit order, where it would only
                      repeat the service name above. */}
                  {(estimate.items.length > 1 || estimate.quantity > 1) && (
                    <span className="block font-mono text-[9px] text-stone-400 mt-1">
                      {describeItems({ items: estimate.items, serviceType: service })}
                    </span>
                  )}

                  {/*
                    The tax already inside that figure.
                    
                    Disclosed rather than added: prices in this product have
                    always been quoted to customers as the number they pay, so
                    the default mode is inclusive and this is the extraction.
                    Before it existed, no price anywhere in the product carried a
                    tax line at all.
                  */}
                  {estimate.tax.tax > 0 && (
                    <span className="block font-mono text-[9px] text-stone-500 mt-1">
                      includes ₵{estimate.tax.tax.toFixed(2)} tax
                      {' ('}
                      {estimate.tax.lines.map((line) => line.label).join(' + ')}
                      {')'}
                    </span>
                  )}

                  {estimate.promoDiscount > 0 && (
                    <span className="block font-mono text-[9px] text-brand-sage mt-1">
                      {estimate.promoCode} — ₵{estimate.promoDiscount.toFixed(2)} off
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className={`font-sans text-[9px] px-2.5 py-1 rounded-lg uppercase border font-bold ${
                    isPaid || paymentMethod === 'Wallet'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-brand-sage/10 text-brand-sage border-brand-sage/20'
                  }`}>
                    {isPaid || paymentMethod === 'Wallet' ? '✓ Instant Online Paid' : `Payment: ${paymentMethod}`}
                  </span>
                </div>
              </div>

              {/* ------------------------------------------------ promo code */}
              <div className="pt-4 border-t border-white/10 space-y-2">
                <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider">
                  Promo or referral code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    placeholder="FRESHERS24"
                    className="flex-1 bg-[#161616] text-white placeholder-[#8E9299]/40 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs font-mono uppercase transition-colors"
                  />
                  {promo ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPromo(null);
                        setPromoInput('');
                        setPromoError('');
                      }}
                      className="px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-stone-300 text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={promoChecking || !promoInput.trim()}
                      onClick={() => void applyPromo(promoInput)}
                      className={`px-4 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                        promoChecking || !promoInput.trim()
                          ? 'border-white/10 bg-white/5 text-stone-500 cursor-not-allowed'
                          : 'border-brand-sage bg-brand-sage text-white hover:bg-brand-sage-light cursor-pointer'
                      }`}
                    >
                      {promoChecking ? 'Checking…' : 'Apply'}
                    </button>
                  )}
                </div>

                {promo && (
                  <p className="text-[11px] text-brand-sage">
                    {promo.code} applied — {promo.label}, ₵{estimate.promoDiscount.toFixed(2)} off
                    this order.
                  </p>
                )}
                {!!promoError && <p className="text-[11px] text-red-400">{promoError}</p>}
              </div>

              {/* Form submission CTAs */}
              <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3.5 rounded-xl font-sans text-xs font-semibold tracking-wider uppercase bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-all cursor-pointer w-full sm:w-1/3 text-center border border-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3.5 rounded-xl font-sans text-xs font-bold tracking-widest uppercase bg-white text-black hover:bg-brand-sage hover:text-white hover:border-brand-sage transition-all cursor-pointer w-full sm:w-2/3 border border-white/10"
                >
                  Confirm & Schedule Pickup
                </button>
              </div>

            </motion.form>
          ) : (
            <motion.div 
              key="booking-success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 text-center space-y-6"
            >
              <div className="inline-flex p-4 bg-brand-sage/15 rounded-full border border-brand-sage/20 mb-2">
                <CheckCircle className="w-12 h-12 text-brand-sage" />
              </div>

              <div className="space-y-2">
                <span className="font-mono text-[9px] tracking-[0.3em] text-brand-sage uppercase font-bold">
                  Receipt Codified
                </span>
                <h4 className="font-serif text-2xl text-white font-light">
                  Garment Concierge Confirmed!
                </h4>
                <p className="font-sans text-stone-400 text-xs sm:text-sm font-light max-w-md mx-auto leading-relaxed">
                  Your pickup booking is recorded in our local ledger. We have generated a secure tracking ID: <strong className="text-brand-sage font-mono">{createdBooking?.id}</strong>.
                </p>
              </div>

              {/* Booking receipt */}
              <div className="max-w-md mx-auto bg-[#161616] p-5 rounded-2xl border border-white/10 text-left text-xs space-y-2.5">
                <div className="flex justify-between border-b border-white/10 pb-2 text-[10px] text-stone-500 font-mono">
                  <span>ORDER LEDGER REPORT</span>
                  <span>{createdBooking?.createdAt.substring(0, 10)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Patron Name:</span>
                  <span className="text-white font-medium">{createdBooking?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Garment Treatment:</span>
                  <span className="text-white font-medium">
                    {(createdBooking && describeItems(createdBooking)) || createdBooking?.serviceType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Pickup Schedule:</span>
                  <span className="text-brand-sage font-semibold">{createdBooking?.pickupDate} during slot</span>
                </div>
                <div className="flex justify-between text-[11px] text-stone-400 pl-4">
                  <span>↳ Timeslot:</span>
                  <span className="text-white">{createdBooking?.pickupTime.split(' ')[0]} {createdBooking?.pickupTime.split(' ')[1]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Address Location:</span>
                  <span className="text-white font-medium max-w-[200px] text-right truncate">{createdBooking?.address}</span>
                </div>
                {createdBooking?.riderNote && (
                  <div className="flex justify-between">
                    <span className="text-stone-400">Note for Rider:</span>
                    <span className="text-brand-gold font-medium max-w-[220px] text-right truncate">{createdBooking.riderNote}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/10 pt-2">
                  <span className="text-stone-400">Payment Channel:</span>
                  <span className="text-stone-200 font-mono font-medium">{createdBooking?.paymentMethod || 'Pay on Pickup'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Payment Status:</span>
                  {/*
                    Read off the record the server returned, not off what this
                    form intended. It used to say PAID whenever the browser had
                    set its own flag, and anything else was labelled
                    "PAY ON PICKUP" — including a card payment that was still
                    pending, and a wallet debit that had never happened.
                  */}
                  <span className={`font-mono font-bold ${createdBooking?.paymentStatus === 'Paid' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {submitting
                      ? 'SETTLING…'
                      : createdBooking?.paymentStatus === 'Paid'
                        ? `PAID (${createdBooking.transactionRef || 'ONLINE'})`
                        : (createdBooking?.paymentStatus ?? 'PENDING').toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-2 font-serif text-sm">
                  <span className="text-stone-400">Total:</span>
                  {/*
                    The server's figure once it has answered. `estimatedPrice` is
                    this form's arithmetic, and the two agree — same
                    `quoteBooking` — but only one of them is what the customer
                    owes, and a member's discount is applied server-side.
                  */}
                  <span className="text-brand-sage font-bold">
                    ₵{(createdBooking?.amount ?? estimatedPrice).toFixed(2)} GHS
                  </span>
                </div>
              </div>

              {settleError && (
                <div className="mt-3 p-3 bg-amber-500/15 border border-amber-500/40 rounded-xl text-left">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                    Pickup booked — payment outstanding
                  </p>
                  <p className="text-[11px] leading-relaxed text-amber-200/90">{settleError}</p>
                </div>
              )}

              {/* Portal setup link section */}
              <div className="max-w-md mx-auto bg-brand-sage/5 border border-brand-sage/20 rounded-2xl p-4 text-xs text-left space-y-2 mt-4">
                <span className="font-mono text-[9px] text-brand-gold uppercase tracking-widest block font-bold">DIGITAL CLIENT PORTAL DISPATCH</span>
                <div className="text-[#8E9299] font-light leading-relaxed text-[11px]">
                  {awaitingServer ? (
                    /* The email is sent by the dispatch server once it has the
                       booking, so while the write is still queued there is
                       nothing in any inbox to look for. Saying "check your
                       email" here sends the customer hunting for a message that
                       was never sent. */
                    <p>
                      Saved on this device, but we have not been able to reach FreshFold yet — so{' '}
                      <strong className="text-brand-gold">no email has gone out</strong>. Keep this tab
                      open and it will send itself the moment the connection is back. Your booking is not
                      lost.
                    </p>
                  ) : loggedInUser ? (
                    <p>This pickup order is saved under your patron profile. You can view and track it here:</p>
                  ) : (
                    /* No shortcut into the password screen from here: the link
                       in the email carries a single-use token, and it is the
                       only thing that opens one. A button on this panel could
                       only be a booking id in a URL, which is what anybody
                       could have typed. */
                    <p>
                      Your receipt and a secure link for setting your portal password are on their way to{' '}
                      <strong className="text-brand-sage font-mono">{createdBooking?.email}</strong>. Open it from
                      your inbox to choose a password and follow your courier live.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setIsSuccess(false);
                    onClose();
                    window.location.hash = '#portal';
                  }}
                  className="w-full mt-1 px-4 py-2.5 bg-brand-sage hover:bg-brand-sage-light text-white text-[10px] font-bold uppercase tracking-widest rounded-xl flex items-center justify-center space-x-1 transition-all cursor-pointer border border-white/5"
                >
                  <span>{loggedInUser ? 'Go directly to active portal' : 'Open the patron portal'}</span>
                </button>
              </div>

              {/* WhatsApp routing call link — hidden for now. */}
              <div className="space-y-3 max-w-sm mx-auto pt-2">
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setIsSuccess(false);
                      onClose();
                    }}
                    className="text-stone-400 hover:text-white text-xs font-sans tracking-wide cursor-pointer uppercase font-semibold"
                  >
                    Done & Return to Site
                  </button>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
