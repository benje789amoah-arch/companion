/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Calendar,
  Check,
  ChevronRight,
  CircleAlert,
  MapPin,
  Sparkles,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ApiError,
  PHONE_DIGITS,
  PHONE_LENGTH_MESSAGE,
  SERVICE_SUBURBS,
  isCompletePhone,
  limitPhoneInput,
  membershipBookingQuote,
  membershipPlan,
  newJobId,
  type Booking,
  type Coords,
  type PaymentStatus,
} from '@freshfold/core';
import AddressAutocomplete from '../../src/components/AddressAutocomplete';
import { Icon } from '../../src/components/Icon';
import type { PinOrigin } from '../../src/components/PickupPinPanel';
import PickupPinPicker from '../../src/components/PickupPinPicker';
import {
  Badge,
  Button,
  Card,
  Divider,
  Field,
  OptionRow,
  ProgressBar,
  ScrollSheet,
  SectionLabel,
  Sheet,
} from '../../src/components/ui';
import {
  PAYMENT_METHODS,
  PICKUP_TIME_SLOTS,
  SCENTS,
  SERVICES,
  SPECIALTY_ADDONS,
  STARCH_LEVELS,
  isGarmentService,
  isPlanCoverable,
  priceBreakdown,
  tierForPoints,
  type PaymentChoice,
} from '../../src/data/catalogue';
import { api } from '../../src/services/api';
import { useClient } from '../../src/store/ClientStore';
import { useSession } from '../../src/store/SessionStore';
import { colors, formatCedis, radius, shadow, tints } from '../../src/theme';

/**
 * The booking flow.
 *
 * The website does this in one long modal; on a phone that is a wall, so it is
 * five steps with a running quote pinned to the bottom. The quote itself comes
 * from `priceBreakdown`, which reproduces the website's arithmetic exactly —
 * the same selections give the same number on both surfaces, which matters
 * because a customer can start on the site and finish here. It is itemised so a
 * membership can cover the laundry without also making the add-ons free.
 *
 * A booking does not require an account. Signed in, the contact step is
 * pre-filled and skippable; signed out, it is where the details are collected.
 */

type Step = 0 | 1 | 2 | 3 | 4;

const STEP_TITLES = ['Service', 'Schedule', 'Address', 'Finishing', 'Payment'] as const;

export default function BookScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ serviceId?: string; planId?: string }>();
  const { account, isAuthenticated } = useSession();
  const {
    createBooking,
    chargeWallet,
    recordTransaction,
    walletBalance,
    points,
    addresses,
    defaultAddress,
    saveAddress,
    plan,
  } = useClient();

  const [step, setStep] = useState<Step>(0);

  // -- selections ----------------------------------------------------------
  const [serviceId, setServiceId] = useState(params.serviceId ?? SERVICES[0].id);
  const [pickupDate, setPickupDate] = useState(() => isoDaysFromNow(1));
  const [timeSlot, setTimeSlot] = useState<string>(PICKUP_TIME_SLOTS[0]);
  const [address, setAddress] = useState('');
  const [suburb, setSuburb] = useState(SERVICE_SUBURBS[0]);
  const [city, setCity] = useState('Kumasi');
  /**
   * The doorstep, as the customer placed it. Null until they do — the booking
   * carries it so the courier navigates to a real point rather than to a pin
   * the server derived from the words they typed.
   */
  const [pickupPin, setPickupPin] = useState<Coords | null>(null);
  /** How that pin came to be, so the picker can say so under the map. */
  const [pinOrigin, setPinOrigin] = useState<PinOrigin>(null);
  const [saveThisAddress, setSaveThisAddress] = useState(false);
  const [scent, setScent] = useState<string>(SCENTS[0].id);
  const [starch, setStarch] = useState<string>(STARCH_LEVELS[0]);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [riderNote, setRiderNote] = useState('');

  // -- contact -------------------------------------------------------------
  const [name, setName] = useState(account?.name ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');

  // -- payment -------------------------------------------------------------
  const [method, setMethod] = useState<PaymentChoice>('Paystack');
  const [paystackRef, setPaystackRef] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState('');

  // -- ui ------------------------------------------------------------------
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [suburbPickerOpen, setSuburbPickerOpen] = useState(false);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Booking | null>(null);

  const service = useMemo(
    () => SERVICES.find((candidate) => candidate.id === serviceId) ?? SERVICES[0],
    [serviceId]
  );

  const tier = useMemo(() => tierForPoints(points), [points]);

  const quote = useMemo(
    () => priceBreakdown({ serviceName: service.name, scent, starch, addonIds }),
    [service.name, scent, starch, addonIds]
  );
  const gross = quote.gross;

  /**
   * What the membership takes off this booking.
   *
   * A plan used to buy nothing at the till: the monthly fee bought an `elite`
   * tag and the member still paid the full catalogue price, while the plans
   * screen said "Regular laundry, one monthly price". While the period's
   * included pickups last, the laundry is already paid for and only the extras
   * are billed; after that the member rate applies to the whole quote.
   */
  const planDefinition = useMemo(() => membershipPlan(plan?.planId), [plan?.planId]);

  const membership = useMemo(
    () =>
      membershipBookingQuote({
        plan: isAuthenticated ? plan : null,
        gross,
        laundry: quote.laundry,
        coverable: isPlanCoverable(service.name),
      }),
    [isAuthenticated, plan, gross, quote.laundry, service.name]
  );

  /**
   * The loyalty discount is applied to the quote rather than shown as a
   * post-hoc credit, so the number the customer approves is the number charged.
   *
   * It is taken on what is left after the membership rather than on the gross,
   * so the two never compound into more than the booking is worth.
   */
  const afterPlan = Math.max(0, Number((gross - membership.waived - membership.discount).toFixed(2)));
  const discount = useMemo(
    () => (isAuthenticated ? Number((afterPlan * tier.discountRate).toFixed(2)) : 0),
    [afterPlan, tier.discountRate, isAuthenticated]
  );
  const total = Math.max(0, Number((afterPlan - discount).toFixed(2)));


  // Prefill from the account and the default saved address once they load.
  useEffect(() => {
    if (account) {
      setName((current) => current || account.name);
      setEmail((current) => current || account.email);
      setPhone((current) => current || account.phone);
    }
  }, [account]);

  /**
   * The saved address fills the form once, when it arrives.
   *
   * It used to depend on `address` and run whenever `address` was empty, which
   * made clearing the field the very thing that refilled it: blank the box,
   * the effect re-runs, the guard passes, and the saved address is written
   * straight back. There was no way to end up with an empty address field
   * while a default existed.
   *
   * So: once per saved address, and only into a form nobody has typed into.
   * `address` is read through a ref to keep that second guard without making
   * the customer's own edits a trigger.
   */
  const addressRef = useRef(address);
  addressRef.current = address;
  const prefilledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!defaultAddress) return;
    if (prefilledFor.current === defaultAddress.id) return;
    if (addressRef.current.trim()) return;

    prefilledFor.current = defaultAddress.id;
    setAddress(defaultAddress.address);
    setSuburb(defaultAddress.suburb);
    if (defaultAddress.city) setCity(defaultAddress.city);
    if (defaultAddress.coords) {
      setPickupPin({ ...defaultAddress.coords });
      // A saved pin was placed deliberately last time, so it outranks the
      // landmark match — otherwise restoring a saved address would move the
      // pin off the gate the customer chose and back to the building.
      setPinOrigin('map');
    }
  }, [defaultAddress]);

  // Arriving from a service card or a segment tile preselects the service.
  useEffect(() => {
    if (params.serviceId) setServiceId(params.serviceId);
  }, [params.serviceId]);

  const stepValid = useCallback(
    (candidate: Step): string | null => {
      switch (candidate) {
        case 0:
          return null; // A service is always selected.
        case 1:
          return pickupDate ? null : 'Choose a pickup date.';
        case 2:
          if (!address.trim()) return 'We need an address to collect from.';
          if (!pickupPin) return 'Set the pickup pin so the courier knows where to knock.';
          if (!name.trim()) return 'Tell us who to ask for at the door.';
          if (!phone.trim()) return 'A phone number lets the courier reach you.';
          if (!isCompletePhone(phone)) return PHONE_LENGTH_MESSAGE;
          return null;
        case 3:
          return null; // Finishing choices all have defaults.
        case 4:
          if (method === 'Wallet' && !isAuthenticated) {
            return 'Sign in to pay from your FreshFold wallet.';
          }
          if (method === 'Wallet' && walletBalance < total) {
            return `Your wallet holds ${formatCedis(walletBalance)}. Choose another method or top up.`;
          }
          return null;
      }
    },
    [
      pickupDate,
      address,
      pickupPin,
      name,
      phone,
      method,
      isAuthenticated,
      walletBalance,
      total,
    ]
  );

  const advance = useCallback(() => {
    const problem = stepValid(step);
    if (problem) {
      setError(problem);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setError('');
    Haptics.selectionAsync().catch(() => {});
    setStep((current) => Math.min(4, current + 1) as Step);
  }, [step, stepValid]);

  const retreat = useCallback(() => {
    setError('');
    if (step === 0) router.back();
    else setStep((current) => Math.max(0, current - 1) as Step);
  }, [step, router]);

  // ------------------------------------------------------------- payments

  const startPaystack = useCallback(async () => {
    setPaymentBusy(true);
    setPaymentNotice('');

    /**
     * Two things can fail here and they are not the same thing.
     *
     * Creating the transaction is the gateway; opening the checkout page is
     * this device's browser. Both used to land in one catch that said "could
     * not reach the payment gateway, try another method" — so a blocked popup
     * sent the customer off to pay by another route while a perfectly good
     * Paystack transaction sat there waiting for them.
     */
    let checkout: { reference: string; authorization_url: string };

    try {
      checkout = await api.initializePayment({
        email: email || 'patron@freshfold.com',
        amount: total,
        // Back into this app, not to a website. Without it Paystack follows
        // the server's `APP_URL` and drops a phone on a localhost page that
        // does not exist on that phone.
        callback_url: Linking.createURL('paystack-success'),
        metadata: { customer_name: name || 'Patron', phone, service: service.name },
      });
    } catch (err) {
      setPaymentBusy(false);
      // The server says why when it knows why — no key configured, Paystack
      // refused the amount — and that is worth more than a generic line.
      setPaymentNotice(
        err instanceof ApiError
          ? `Payment gateway: ${err.message}`
          : 'Could not reach the payment gateway. Check your connection, or choose Pay on Pickup.'
      );
      return;
    }

    setPaystackRef(checkout.reference);

    try {
      await WebBrowser.openBrowserAsync(checkout.authorization_url);
      setPaymentNotice('Finish on the Paystack page, then tap “I have paid” to verify.');
    } catch {
      setPaymentNotice(
        `Could not open the checkout page here. Reference ${checkout.reference} is live — open Paystack, pay, then tap “I have paid”.`
      );
    } finally {
      setPaymentBusy(false);
    }
  }, [email, total, name, phone, service.name]);

  const verifyPaystack = useCallback(async () => {
    if (!paystackRef) return;
    setPaymentBusy(true);

    try {
      const result = await api.verifyPayment(paystackRef);
      const status = (result.data as { status?: string } | undefined)?.status;

      if (result.status && status === 'success') {
        setIsPaid(true);
        setPaymentNotice('Payment confirmed.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        setPaymentNotice(`Paystack says: ${status ?? 'pending'}. Complete the checkout and retry.`);
      }
    } catch {
      setPaymentNotice('Verification failed. If you were charged, contact the concierge desk.');
    } finally {
      setPaymentBusy(false);
    }
  }, [paystackRef]);

  // --------------------------------------------------------------- submit

  const submit = useCallback(async () => {
    const problem = stepValid(4);
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const id = newJobId();
      let paid = isPaid;
      let reference = paystackRef;

      if (method === 'Wallet') {
        const ok = await chargeWallet(total, `Booking ${id} — ${service.name}`, id);
        if (!ok) {
          setError('Your wallet balance moved. Refresh and try again.');
          return;
        }
        paid = true;
        reference = `TXN-W-${id.replace(/\D/g, '')}`;
      }

      const paymentStatus: PaymentStatus = paid
        ? 'Paid'
        : method === 'Pay on Pickup'
          ? 'Pay on Pickup'
          : 'Pending';

      const booking: Booking = {
        id,
        name: name.trim(),
        email: (email || 'patron@freshfold.com').trim().toLowerCase(),
        phone: phone.trim(),
        serviceType: service.name,
        // No `planId` here on purpose. The server reads the membership off the
        // session and writes it onto the job itself — a plan sent from the app
        // was a claim it had no way to check, and `elite` priority for anyone
        // who set the field.
        pickupDate,
        pickupTime: timeSlot,
        deliveryDate: isoDaysAfter(pickupDate, 1),
        // Same composed sentence the website writes, so the rider's job card
        // and the admin dashboard read identically whichever surface booked it.
        // The finish prefix is dropped for services it cannot apply to — the
        // website writes "Organic Lavender scent, None starch" onto a car
        // detailing job, which is noise on the courier's card.
        specialInstructions: (isGarmentService(service.name)
          ? `${scent} scent, ${starch} starch. ${instructions}`
          : instructions
        ).trim(),
        specialtyAddons: addonIds.length > 0 ? addonIds : undefined,
        riderNote: riderNote.trim() || undefined,
        address: address.trim(),
        city: city.trim() || 'Kumasi',
        suburb,
        // Where the courier is actually sent. Without it the server falls back
        // to hashing the address, which is a point in the right suburb and the
        // wrong street.
        pickupCoords: pickupPin ?? undefined,
        status: 'Scheduled',
        createdAt: new Date().toISOString(),
        paymentStatus,
        paymentMethod: method,
        amount: total,
        transactionRef: paid ? reference || `TXN-${id.replace(/\D/g, '')}` : undefined,
        paidAt: paid ? new Date().toISOString() : undefined,
      };

      const saved = await createBooking(booking);

      // A card or mobile-money charge is ledgered here; the wallet path already
      // ledgered itself inside `chargeWallet`.
      if (paid && method !== 'Wallet' && account) {
        recordTransaction({
          id: `txn-${Date.now()}`,
          bookingId: saved.id,
          userEmail: account.email,
          amount: total,
          method,
          status: 'Successful',
          reference: booking.transactionRef!,
          timestamp: new Date().toISOString(),
          description: `Booking ${saved.id} — ${service.name}`,
        });
      }

      if (saveThisAddress) {
        saveAddress({
          id: `addr-${Date.now()}`,
          label: suburb,
          address: address.trim(),
          suburb,
          city: city.trim(),
          // The pin is the useful half of a saved address: next time the
          // customer picks it, the courier goes to the same doorstep rather
          // than to wherever the text hashes to.
          coords: pickupPin ?? undefined,
          isDefault: addresses.length === 0,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCreated(saved);
    } catch {
      setError('Could not save that booking. It is queued and will send when you reconnect.');
    } finally {
      setSubmitting(false);
    }
  }, [
    stepValid,
    isPaid,
    paystackRef,
    method,
    chargeWallet,
    total,
    service.name,
    name,
    email,
    phone,
    plan?.planId,
    pickupDate,
    timeSlot,
    scent,
    starch,
    instructions,
    addonIds,
    riderNote,
    address,
    city,
    suburb,
    pickupPin,
    createBooking,
    account,
    recordTransaction,
    saveThisAddress,
    saveAddress,
    addresses.length,
  ]);

  const reset = useCallback(() => {
    setCreated(null);
    setStep(0);
    setIsPaid(false);
    setPaystackRef('');
    setPaymentNotice('');
    setInstructions('');
    setRiderNote('');
    setAddonIds([]);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={retreat} hitSlop={10} style={styles.back}>
          <ArrowLeft size={17} color={colors.textCharcoal} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Schedule a pickup</Text>
          <Text style={styles.headerStep}>
            Step {step + 1} of 5 · {STEP_TITLES[step]}
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <ProgressBar percent={((step + 1) / 5) * 100} height={4} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 && (
            <View style={{ gap: 14 }}>
              <SectionLabel>What needs care?</SectionLabel>

              <Pressable onPress={() => setServicePickerOpen(true)}>
                <Card tone="sage" style={styles.selectedService}>
                  <View style={styles.serviceIcon}>
                    <Icon name={service.iconName} size={20} color={colors.brandSage} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedServiceName}>{service.name}</Text>
                    <Text style={styles.selectedServiceBody} numberOfLines={3}>
                      {service.description}
                    </Text>
                    <Badge label={service.priceInfo} tone="sage" style={{ marginTop: 7 }} />
                  </View>
                  <ChevronRight size={16} color={colors.brandSage} />
                </Card>
              </Pressable>

              <Text style={styles.helper}>
                Tap to change. Every service is quoted before you confirm, and the courier is
                complimentary on all of them.
              </Text>

              {!!plan && (
                <Card tone="gold" style={{ gap: 4 }}>
                  <Text style={styles.planTitle}>
                    {membership.covered
                      ? 'This pickup is included in your membership'
                      : 'Booked under your membership'}
                  </Text>
                  <Text style={styles.planBody}>
                    {membership.covered
                      ? `The laundry is already paid for — ${membership.remainingPickups} of ${planDefinition?.includedPickups ?? 0} pickups left this month. Add-ons are charged at your member rate, and the order is prioritised in dispatch.`
                      : membership.discount > 0
                        ? `Your included pickups are spent for this month, so this one is at your member rate. It is still prioritised in dispatch, and your allowance resets on ${new Date(plan.renewsOn).toLocaleDateString()}.`
                        : 'This order is prioritised in dispatch.'}
                  </Text>
                </Card>
              )}
            </View>
          )}

          {step === 1 && (
            <View style={{ gap: 18 }}>
              <View style={{ gap: 10 }}>
                <SectionLabel>Pickup date</SectionLabel>
                <View style={styles.dateRow}>
                  {[0, 1, 2, 3, 4].map((offset) => {
                    const iso = isoDaysFromNow(offset);
                    const date = new Date(iso);
                    const active = iso === pickupDate;

                    return (
                      <Pressable
                        key={iso}
                        onPress={() => setPickupDate(iso)}
                        style={[styles.dateCell, active && styles.dateCellActive]}
                      >
                        <Text style={[styles.dateDow, active && styles.dateTextActive]}>
                          {offset === 0
                            ? 'Today'
                            : offset === 1
                              ? 'Tmrw'
                              : date.toLocaleDateString([], { weekday: 'short' })}
                        </Text>
                        <Text style={[styles.dateNum, active && styles.dateTextActive]}>
                          {date.getDate()}
                        </Text>
                        <Text style={[styles.dateMon, active && styles.dateTextActive]}>
                          {date.toLocaleDateString([], { month: 'short' })}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Field
                  label="Or type a date"
                  value={pickupDate}
                  onChangeText={setPickupDate}
                  placeholder="YYYY-MM-DD"
                  icon={<Calendar size={15} color={colors.textMuted} />}
                  hint="Delivery is scheduled for the following day."
                />
              </View>

              <View style={{ gap: 9 }}>
                <SectionLabel>Collection window</SectionLabel>
                {PICKUP_TIME_SLOTS.map((slot) => (
                  <OptionRow
                    key={slot}
                    title={slot.split(' (')[0]}
                    subtitle={slot.match(/\((.*)\)/)?.[1]}
                    selected={timeSlot === slot}
                    onPress={() => setTimeSlot(slot)}
                    trailing={
                      timeSlot === slot ? <Check size={16} color={colors.brandSage} /> : undefined
                    }
                  />
                ))}
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 16 }}>
              {addresses.length > 0 && (
                <Pressable onPress={() => setAddressPickerOpen(true)}>
                  <Card tone="sunken" style={styles.savedRow}>
                    <Bookmark size={15} color={colors.brandSage} />
                    <Text style={styles.savedLabel}>Use a saved address</Text>
                    <ChevronRight size={15} color={colors.textMuted} />
                  </Card>
                </Pressable>
              )}

              {/* Choosing a suggestion puts the pin on the building, so the
                  block and room get typed onto an address already in the right
                  place. Typing straight past the list still works. */}
              <AddressAutocomplete
                value={address}
                onChangeText={setAddress}
                onPlaceSelected={(detail) => {
                  setAddress(detail.address);
                  setPickupPin(detail.coords);
                  setPinOrigin('place');
                }}
                placeholder="Evandy Hostel, Block B, Room 304"
                hint="Include the block and room — this is what the courier reads at the door."
              />

              <Pressable onPress={() => setSuburbPickerOpen(true)}>
                <View pointerEvents="none">
                  <Field
                    label="Suburb"
                    value={suburb}
                    onChangeText={() => {}}
                    editable={false}
                    icon={<MapPin size={15} color={colors.textMuted} />}
                  />
                </View>
              </Pressable>

              <Field label="City" value={city} onChangeText={setCity} placeholder="Kumasi" />

              <View style={{ gap: 8 }}>
                <SectionLabel>Where should the courier knock?</SectionLabel>
                <Text style={styles.pinIntro}>
                  An address is a sentence; a courier needs a point. Drop the pin on your gate or
                  hostel entrance — it is what their navigation follows and what confirms their
                  arrival.
                </Text>
                <PickupPinPicker
                  value={pickupPin}
                  onChange={setPickupPin}
                  suburb={suburb}
                  address={address}
                  origin={pinOrigin}
                  onOriginChange={setPinOrigin}
                  onAddressSuggested={setAddress}
                />
              </View>

              <Pressable
                onPress={() => setSaveThisAddress((current) => !current)}
                style={styles.checkRow}
              >
                <View style={[styles.checkbox, saveThisAddress && styles.checkboxOn]}>
                  {saveThisAddress && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <Text style={styles.checkLabel}>Save this address for next time</Text>
              </Pressable>

              <Divider />

              <SectionLabel>Who should the courier ask for?</SectionLabel>
              <Field label="Full name" value={name} onChangeText={setName} placeholder="Ama Mensah" />
              <Field
                label="Phone"
                value={phone}
                onChangeText={(next) => setPhone(limitPhoneInput(next))}
                placeholder={`${PHONE_DIGITS} digits — e.g. 0550001234`}
                keyboardType="phone-pad"
                maxLength={PHONE_DIGITS}
              />
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                hint={
                  isAuthenticated
                    ? undefined
                    : 'Optional — but it is how we link this order to an account later.'
                }
              />
            </View>
          )}

          {step === 3 && (
            <View style={{ gap: 18 }}>
              {isGarmentService(service.name) ? (
                <>
                  <View style={{ gap: 9 }}>
                    <SectionLabel>Scent</SectionLabel>
                    {SCENTS.map((option) => (
                      <OptionRow
                        key={option.id}
                        title={option.label}
                        subtitle={option.surcharge > 0 ? `+ ${formatCedis(option.surcharge)}` : 'No surcharge'}
                        selected={scent === option.id}
                        onPress={() => setScent(option.id)}
                        trailing={
                          scent === option.id ? <Check size={16} color={colors.brandSage} /> : undefined
                        }
                      />
                    ))}
                  </View>

                  <View style={{ gap: 9 }}>
                    <SectionLabel>Starch on ironed items</SectionLabel>
                    <View style={styles.starchRow}>
                      {STARCH_LEVELS.map((level) => (
                        <Pressable
                          key={level}
                          onPress={() => setStarch(level)}
                          style={[styles.starchCell, starch === level && styles.starchCellActive]}
                        >
                          <Text
                            style={[
                              styles.starchLabel,
                              starch === level && styles.starchLabelActive,
                            ]}
                          >
                            {level}
                          </Text>
                          {level !== 'None' && (
                            <Text
                              style={[
                                styles.starchMeta,
                                starch === level && { color: 'rgba(255,255,255,0.75)' },
                              ]}
                            >
                              + ₵5
                            </Text>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </>
              ) : (
                <Card tone="sunken" style={{ gap: 4 }}>
                  <Text style={styles.planTitle}>No finishing options here</Text>
                  <Text style={styles.planBody}>
                    Scent and starch apply to garments. {service.shortName} is quoted on the work
                    itself — add a note below if there is anything specific.
                  </Text>
                </Card>
              )}

              <View style={{ gap: 9 }}>
                <SectionLabel>Specialist add-ons</SectionLabel>
                {SPECIALTY_ADDONS.map((addon) => {
                  const on = addonIds.includes(addon.id);
                  return (
                    <OptionRow
                      key={addon.id}
                      title={addon.label}
                      subtitle={`${addon.description} · ${formatCedis(addon.price)}`}
                      icon={<Icon name={addon.iconName} size={15} color={colors.brandSage} />}
                      selected={on}
                      onPress={() =>
                        setAddonIds((current) =>
                          on ? current.filter((id) => id !== addon.id) : [...current, addon.id]
                        )
                      }
                      trailing={on ? <Check size={16} color={colors.brandSage} /> : undefined}
                    />
                  );
                })}
              </View>

              <Field
                label="Care instructions"
                value={instructions}
                onChangeText={setInstructions}
                placeholder="The navy blazer has a coffee stain on the left cuff."
                multiline
              />
              <Field
                label="Note for the courier"
                value={riderNote}
                onChangeText={setRiderNote}
                placeholder="Call when you reach the gate — the buzzer is broken."
                multiline
                hint="Shown on the courier's job card, not to the laundry team."
              />
            </View>
          )}

          {step === 4 && (
            <View style={{ gap: 16 }}>
              <Card style={{ gap: 10 }}>
                <SectionLabel>Summary</SectionLabel>
                <SummaryRow label="Service" value={service.name} />
                <SummaryRow label="Pickup" value={`${pickupDate} · ${timeSlot.split(' (')[0]}`} />
                <SummaryRow
                  label="Address"
                  value={[address, suburb].filter(Boolean).join(', ') || '—'}
                />
                <SummaryRow
                  label="Pickup pin"
                  value={
                    pickupPin
                      ? `${pickupPin.lat.toFixed(5)}° N, ${Math.abs(pickupPin.lng).toFixed(5)}° W`
                      : 'Not set'
                  }
                />
                {isGarmentService(service.name) && (
                  <SummaryRow label="Finish" value={`${scent}, ${starch} starch`} />
                )}
                {addonIds.length > 0 && (
                  <SummaryRow label="Add-ons" value={addonIds.join(', ')} />
                )}

                <Divider style={{ marginVertical: 4 }} />

                <SummaryRow label="Subtotal" value={formatCedis(gross)} />
                {membership.waived > 0 && (
                  <SummaryRow
                    label={`${planDefinition?.name ?? 'Membership'} — pickup included`}
                    value={`− ${formatCedis(membership.waived)}`}
                    tone="success"
                  />
                )}
                {membership.discount > 0 && (
                  <SummaryRow
                    label="Member rate"
                    value={`− ${formatCedis(membership.discount)}`}
                    tone="success"
                  />
                )}
                {discount > 0 && (
                  <SummaryRow
                    label={`${tier.name} discount`}
                    value={`− ${formatCedis(discount)}`}
                    tone="success"
                  />
                )}
                <SummaryRow label="Total" value={formatCedis(total)} emphasis />
              </Card>

              <View style={{ gap: 9 }}>
                <SectionLabel>How would you like to pay?</SectionLabel>
                {PAYMENT_METHODS.map((option) => {
                  const walletShort = option.id === 'Wallet' && walletBalance < total;
                  return (
                    <OptionRow
                      key={option.id}
                      title={option.label}
                      subtitle={
                        option.id === 'Wallet'
                          ? `Balance ${formatCedis(walletBalance)}${walletShort ? ' — not enough' : ''}`
                          : option.blurb
                      }
                      icon={<Icon name={option.iconName} size={15} color={colors.brandSage} />}
                      selected={method === option.id}
                      onPress={() => {
                        setMethod(option.id);
                        setIsPaid(false);
                        setPaymentNotice('');
                        setError('');
                      }}
                      disabled={option.id === 'Wallet' && !isAuthenticated}
                      trailing={
                        method === option.id ? <Check size={16} color={colors.brandSage} /> : undefined
                      }
                    />
                  );
                })}
              </View>

              {/* Method-specific detail */}
              {method === 'Paystack' && (
                <Card style={{ gap: 10 }}>
                  <Text style={styles.payTitle}>Paystack secure checkout</Text>
                  <Text style={styles.payBody}>
                    Opens Paystack in a browser. Nothing about your card is entered in this app or
                    stored by FreshFold.
                  </Text>
                  <Button
                    label={paystackRef ? 'Reopen checkout' : 'Open checkout'}
                    variant="outline"
                    onPress={startPaystack}
                    loading={paymentBusy}
                  />
                  {!!paystackRef && !isPaid && (
                    <Button label="I have paid — verify" onPress={verifyPaystack} loading={paymentBusy} />
                  )}
                </Card>
              )}

              {method === 'Pay on Pickup' && (
                <Card tone="sunken" style={{ gap: 4 }}>
                  <Text style={styles.payTitle}>Settle at the door</Text>
                  <Text style={styles.payBody}>
                    The courier carries a card reader and accepts mobile money. Your order is
                    confirmed either way.
                  </Text>
                </Card>
              )}

              {!!paymentNotice && (
                <View style={styles.notice}>
                  <Sparkles size={13} color={colors.brandSage} />
                  <Text style={styles.noticeText}>{paymentNotice}</Text>
                </View>
              )}
            </View>
          )}

          {!!error && (
            <View style={styles.errorBox}>
              <CircleAlert size={14} color={colors.statusError} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* ------------------------------------------------------ quote bar */}
        <View style={styles.quoteBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.quoteLabel}>{step === 4 ? 'Total due' : 'Running quote'}</Text>
            <Text style={styles.quoteValue}>{formatCedis(total)}</Text>
            {total < gross && (
              <Text style={styles.quoteStrike}>
                {formatCedis(gross)} before your{' '}
                {membership.waived > 0
                  ? 'included pickup'
                  : membership.discount > 0 && discount > 0
                    ? 'member and tier rates'
                    : membership.discount > 0
                      ? 'member rate'
                      : 'tier discount'}
              </Text>
            )}
          </View>

          {step < 4 ? (
            <Button
              label="Continue"
              onPress={advance}
              size="lg"
              iconRight={<ArrowRight size={15} color="#FFFFFF" />}
              style={{ minWidth: 148 }}
            />
          ) : (
            <Button
              label="Confirm booking"
              onPress={submit}
              loading={submitting}
              size="lg"
              style={{ minWidth: 158 }}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ---------------------------------------------------------- pickers */}
      <ScrollSheet
        visible={servicePickerOpen}
        onClose={() => setServicePickerOpen(false)}
        title="Choose a service"
      >
        {SERVICES.map((option) => (
          <OptionRow
            key={option.id}
            title={option.name}
            subtitle={`${option.priceInfo} · ${option.description}`}
            icon={<Icon name={option.iconName} size={15} color={colors.brandSage} />}
            selected={option.id === serviceId}
            onPress={() => {
              setServiceId(option.id);
              setServicePickerOpen(false);
            }}
          />
        ))}
      </ScrollSheet>

      <ScrollSheet
        visible={suburbPickerOpen}
        onClose={() => setSuburbPickerOpen(false)}
        title="Which suburb?"
      >
        {SERVICE_SUBURBS.map((option) => (
          <OptionRow
            key={option}
            title={option}
            selected={option === suburb}
            onPress={() => {
              setSuburb(option);
              setSuburbPickerOpen(false);
            }}
            trailing={option === suburb ? <Check size={16} color={colors.brandSage} /> : undefined}
          />
        ))}
      </ScrollSheet>

      <ScrollSheet
        visible={addressPickerOpen}
        onClose={() => setAddressPickerOpen(false)}
        title="Saved addresses"
      >
        {addresses.map((saved) => (
          <OptionRow
            key={saved.id}
            title={saved.label}
            subtitle={[saved.address, saved.suburb].filter(Boolean).join(', ')}
            icon={<MapPin size={15} color={colors.brandSage} />}
            onPress={() => {
              setAddress(saved.address);
              setSuburb(saved.suburb);
              if (saved.city) setCity(saved.city);
              // Addresses saved before pins existed have none; the customer
              // places one and this address learns it on the next save.
              setPickupPin(saved.coords ? { ...saved.coords } : null);
              // A saved pin was aimed deliberately last time, so it outranks
              // the landmark match the address would otherwise trigger.
              setPinOrigin(saved.coords ? 'map' : null);
              setAddressPickerOpen(false);
            }}
          />
        ))}
      </ScrollSheet>

      {/* ----------------------------------------------------- confirmation */}
      <Sheet visible={!!created} onClose={reset}>
        {!!created && (
          <View style={styles.confirm}>
            <View style={styles.confirmMark}>
              <Check size={26} color="#FFFFFF" strokeWidth={3} />
            </View>
            <Text style={styles.confirmTitle}>Booked</Text>
            <Text style={styles.confirmBody}>
              Reference <Text style={styles.confirmRef}>{created.id}</Text> is on the dispatch board.
              A courier will accept it shortly and you can follow them from the Track tab.
            </Text>

            <Card tone="sunken" style={{ width: '100%', gap: 8, marginTop: 4 }}>
              <SummaryRow label="Collection" value={`${created.pickupDate} · ${timeSlot.split(' (')[0]}`} />
              <SummaryRow label="Return" value={created.deliveryDate} />
              <SummaryRow label="Paid" value={created.paymentStatus ?? 'Pending'} />
              <SummaryRow label="Total" value={formatCedis(created.amount ?? 0)} emphasis />
            </Card>

            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 }}>
              <Button label="Book another" variant="ghost" onPress={reset} style={{ flex: 1 }} />
              <Button
                label="Track it"
                onPress={() => {
                  const id = created.id;
                  reset();
                  router.push({ pathname: '/order/[id]', params: { id } });
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

function SummaryRow({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: 'success';
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          emphasis && styles.summaryValueStrong,
          tone === 'success' && { color: colors.statusSuccess },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}


function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function isoDaysAfter(iso: string, days: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return isoDaysFromNow(days + 1);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgLinen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textCharcoal, letterSpacing: -0.3 },
  headerStep: { fontSize: 10.5, color: colors.textSlate, marginTop: 2 },

  scroll: { padding: 20, paddingTop: 14, paddingBottom: 30 },

  selectedService: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  serviceIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.cardPure,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedServiceName: { fontSize: 14, fontWeight: '800', color: colors.textCharcoal },
  selectedServiceBody: { fontSize: 11, color: colors.textSlate, marginTop: 4, lineHeight: 15.5 },
  helper: { fontSize: 11, color: colors.textMuted, lineHeight: 15.5 },
  planTitle: { fontSize: 12.5, fontWeight: '800', color: colors.textCharcoal },
  planBody: { fontSize: 11, color: colors.textSlate, lineHeight: 15.5 },

  dateRow: { flexDirection: 'row', gap: 7 },
  dateCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.cardPure,
    gap: 1,
  },
  dateCellActive: { backgroundColor: colors.brandSage, borderColor: colors.brandSage },
  dateDow: { fontSize: 8.5, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  dateNum: { fontSize: 16, fontWeight: '800', color: colors.textCharcoal },
  dateMon: { fontSize: 8.5, color: colors.textMuted },
  dateTextActive: { color: '#FFFFFF' },

  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  savedLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.textCharcoal },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: {
    width: 19,
    height: 19,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.brandStone,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.brandSage, borderColor: colors.brandSage },
  checkLabel: { fontSize: 11.5, color: colors.textCharcoal },
  pinIntro: { fontSize: 10.5, color: colors.textSlate, lineHeight: 14.5 },

  starchRow: { flexDirection: 'row', gap: 8 },
  starchCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.cardPure,
    gap: 2,
  },
  starchCellActive: { backgroundColor: colors.brandSage, borderColor: colors.brandSage },
  starchLabel: { fontSize: 12, fontWeight: '700', color: colors.textCharcoal },
  starchLabelActive: { color: '#FFFFFF' },
  starchMeta: { fontSize: 9, color: colors.textMuted },

  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  summaryLabel: { width: 92, fontSize: 10.5, color: colors.textMuted },
  summaryValue: { flex: 1, fontSize: 11.5, color: colors.textCharcoal, textAlign: 'right' },
  summaryValueStrong: { fontSize: 14, fontWeight: '800' },

  payTitle: { fontSize: 12.5, fontWeight: '800', color: colors.textCharcoal },
  payBody: { fontSize: 11, color: colors.textSlate, lineHeight: 15.5 },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tints.sage05,
    borderWidth: 1,
    borderColor: tints.sage18,
    borderRadius: radius.md,
    padding: 11,
  },
  noticeText: { flex: 1, fontSize: 11, color: colors.textCharcoal, lineHeight: 15 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tints.error08,
    borderWidth: 1,
    borderColor: tints.error25,
    borderRadius: radius.md,
    padding: 11,
    marginTop: 16,
  },
  errorText: { flex: 1, fontSize: 11, color: colors.statusError, lineHeight: 15 },

  quoteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.cardPure,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingHorizontal: 20,
    paddingVertical: 13,
    ...shadow.lg,
  },
  quoteLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  quoteValue: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.textCharcoal,
    letterSpacing: -0.5,
    marginTop: 1,
  },
  quoteStrike: { fontSize: 9.5, color: colors.textMuted, marginTop: 1 },

  confirm: { alignItems: 'center', gap: 10, padding: 24, paddingTop: 12 },
  confirmMark: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.statusSuccess,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: { fontSize: 21, fontWeight: '800', color: colors.textCharcoal, letterSpacing: -0.4 },
  confirmBody: {
    fontSize: 11.5,
    color: colors.textSlate,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  confirmRef: { fontWeight: '800', color: colors.brandSage },
});
