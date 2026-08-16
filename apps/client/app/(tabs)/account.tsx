/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  Bell,
  Bot,
  ChevronRight,
  Fingerprint,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  UserCog,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deriveSuburb } from '@freshfold/core';
import NotificationsSheet from '../../src/components/NotificationsSheet';
import OrderCard from '../../src/components/OrderCard';
import {
  Badge,
  Button,
  Card,
  ConnectionPill,
  Divider,
  EmptyState,
  Field,
  InitialsAvatar,
  SectionHeader,
  SectionLabel,
  Sheet,
} from '../../src/components/ui';
import { CONTACT, tierForPoints } from '../../src/data/catalogue';
import { useClient, type SavedAddress } from '../../src/store/ClientStore';
import { useSession } from '../../src/store/SessionStore';
import { colors, formatCedis, radius, tints } from '../../src/theme';
import { API_BASE_URL } from '../../src/services/api';

/**
 * Account.
 *
 * Profile, saved addresses, the security switches, recent orders and the ways
 * to reach a human. Signed out it is a short pitch and a sign-in button — the
 * app stays usable either way, so there is nothing to lock.
 */
export default function AccountScreen() {
  const router = useRouter();
  const {
    account,
    isAuthenticated,
    signOut,
    resendVerification,
    biometricAvailable,
    biometricEnabled,
    setBiometricEnabled,
  } = useSession();
  const {
    bookings,
    activeBookings,
    pastBookings,
    addresses,
    saveAddress,
    removeAddress,
    points,
    walletBalance,
    unreadCount,
    online,
  } = useClient();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);

  // The unconfirmed-email notice. `verifyNotice` holds whatever the server last
  // said — a cooldown message answers the question the customer is about to ask.
  const [verifySending, setVerifySending] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState('');

  const [draftLabel, setDraftLabel] = useState('');
  const [draftAddress, setDraftAddress] = useState('');
  const [draftCity, setDraftCity] = useState('Kumasi');

  /**
   * The collection zone, read out of the address rather than picked.
   *
   * This editor has no pin of its own, so the landmark table is all there is
   * to go on — and it is enough for the addresses people actually save, which
   * are the halls and hostels it already knows. Blank otherwise, which the job
   * model tolerates; the booking screen fills it in properly once a pin is
   * placed against this address.
   */
  const draftSuburb = useMemo(() => deriveSuburb(null, draftAddress), [draftAddress]);

  const tier = useMemo(() => tierForPoints(points), [points]);
  const recent = useMemo(() => [...activeBookings, ...pastBookings].slice(0, 3), [
    activeBookings,
    pastBookings,
  ]);

  const lifetimeSpend = useMemo(
    () =>
      bookings
        .filter((booking) => booking.paymentStatus === 'Paid')
        .reduce((total, booking) => total + (booking.amount ?? 0), 0),
    [bookings]
  );

  const handleResendVerification = useCallback(async () => {
    setVerifySending(true);
    setVerifyNotice('');
    try {
      await resendVerification();
      setVerifyNotice('Sent. Check your inbox — and your spam folder.');
    } catch (error) {
      // The server's own wording, which carries the cooldown countdown.
      setVerifyNotice(
        error instanceof Error ? error.message : 'Could not send the link. Try again shortly.'
      );
    } finally {
      setVerifySending(false);
    }
  }, [resendVerification]);

  const confirmSignOut = useCallback(() => {
    Alert.alert('Sign out?', 'Your orders stay on the account and come back when you sign in.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [signOut]);

  const commitAddress = useCallback(() => {
    if (!draftAddress.trim()) return;

    saveAddress({
      id: `addr-${Date.now()}`,
      label: draftLabel.trim() || draftSuburb || 'Pickup address',
      address: draftAddress.trim(),
      suburb: draftSuburb,
      city: draftCity.trim(),
      isDefault: addresses.length === 0,
    });

    setDraftLabel('');
    setDraftAddress('');
    setAddressSheetOpen(false);
  }, [draftAddress, draftLabel, draftSuburb, draftCity, addresses.length, saveAddress]);

  const confirmRemoveAddress = useCallback(
    (saved: SavedAddress) => {
      Alert.alert('Remove this address?', saved.address, [
        { text: 'Keep', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeAddress(saved.id) },
      ]);
    },
    [removeAddress]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Account</Text>
        <ConnectionPill online={online} />
        <Pressable
          onPress={() => setNotificationsOpen(true)}
          hitSlop={8}
          style={styles.bell}
          accessibilityLabel="Notifications"
        >
          <Bell size={17} color={colors.textCharcoal} />
          {unreadCount > 0 && <View style={styles.bellDot} />}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/*
          ------------------------------------------- unconfirmed email
          Above the profile card, because the server refuses a booking from an
          unconfirmed account. Finding that out on the Book tab, with the form
          already filled in, is the version of this that loses the order.
        */}
        {isAuthenticated && account?.emailVerified === false && (
          <Card style={styles.verifyCard}>
            <View style={styles.verifyHeader}>
              <Mail size={16} color={colors.brandGold} />
              <Text style={styles.verifyTitle}>Confirm your email</Text>
            </View>
            <Text style={styles.verifyBody}>
              {verifyNotice ||
                `We sent a link to ${account.email}. Confirm it to start booking pickups.`}
            </Text>
            <Button
              label={verifySending ? 'Sending…' : 'Resend link'}
              onPress={handleResendVerification}
              loading={verifySending}
            />
          </Card>
        )}

        {/* --------------------------------------------------------- profile */}
        {isAuthenticated && account ? (
          <Card style={{ gap: 14 }}>
            <View style={styles.profileRow}>
              <InitialsAvatar name={account.name} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>{account.name}</Text>
                <Text style={styles.profileContact} numberOfLines={1}>
                  {account.email}
                </Text>
                <Text style={styles.profileContact}>{account.phone}</Text>
              </View>
              <Badge label={tier.cardName} tone="gold" />
            </View>

            <Divider />

            <View style={styles.statRow}>
              <Stat label="Orders" value={String(bookings.length)} />
              <Stat label="Points" value={points.toLocaleString()} />
              <Stat label="Wallet" value={formatCedis(walletBalance)} />
              <Stat label="Spent" value={formatCedis(lifetimeSpend)} />
            </View>
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <View style={styles.profileRow}>
              <InitialsAvatar name="Guest" size={52} />
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>Browsing as a guest</Text>
                <Text style={styles.profileContact}>
                  Bookings work without an account — an account is what keeps them, along with your
                  wallet and loyalty tier.
                </Text>
              </View>
            </View>
            <Button label="Sign in or create an account" onPress={() => router.push('/auth')} />
          </Card>
        )}

        {/* ---------------------------------------------------------- orders */}
        <View style={styles.section}>
          <SectionHeader
            title="Recent orders"
            caption={`${activeBookings.length} active · ${pastBookings.length} completed`}
            action={bookings.length > 0 ? 'See all' : undefined}
            onAction={() => router.push('/orders')}
          />

          {recent.length === 0 ? (
            <EmptyState
              icon={<Package size={24} color={colors.brandStone} />}
              title="No orders yet"
              body="Your first pickup is a minute away."
              action="Schedule a pickup"
              onAction={() => router.push('/(tabs)/book')}
            />
          ) : (
            <View style={{ gap: 11 }}>
              {recent.map((booking) => (
                <OrderCard
                  key={booking.id}
                  booking={booking}
                  onPress={() =>
                    router.push({ pathname: '/order/[id]', params: { id: booking.id } })
                  }
                />
              ))}
            </View>
          )}
        </View>

        {/* ------------------------------------------------------- addresses */}
        <View style={styles.section}>
          <SectionHeader
            title="Saved addresses"
            caption="Pre-fills the booking form."
            action="Add"
            onAction={() => setAddressSheetOpen(true)}
          />

          {addresses.length === 0 ? (
            <Pressable onPress={() => setAddressSheetOpen(true)}>
              <Card tone="sunken" style={styles.addRow}>
                <Plus size={16} color={colors.brandSage} />
                <Text style={styles.addLabel}>Add your first address</Text>
              </Card>
            </Pressable>
          ) : (
            <View style={{ gap: 9 }}>
              {addresses.map((saved) => (
                <View key={saved.id} style={styles.addressRow}>
                  <View style={styles.addressIcon}>
                    <MapPin size={15} color={colors.brandSage} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.addressTitleRow}>
                      <Text style={styles.addressLabel}>{saved.label}</Text>
                      {saved.isDefault && <Badge label="Default" tone="sage" />}
                    </View>
                    <Text style={styles.addressText} numberOfLines={2}>
                      {[saved.address, saved.suburb, saved.city].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => confirmRemoveAddress(saved)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${saved.label}`}
                  >
                    <Trash2 size={15} color={colors.statusError} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* -------------------------------------------------------- security */}
        {isAuthenticated && (
          <View style={styles.section}>
            <SectionHeader title="Security" />
            <Card style={{ gap: 4 }}>
              <View style={styles.switchRow}>
                <View style={styles.switchIcon}>
                  <Fingerprint size={15} color={colors.brandSage} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Unlock with biometrics</Text>
                  <Text style={styles.switchCaption}>
                    {biometricAvailable
                      ? 'Use Face ID or your fingerprint instead of typing your password.'
                      : 'No biometric enrolled on this device.'}
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={setBiometricEnabled}
                  disabled={!biometricAvailable}
                  trackColor={{ true: colors.brandSage, false: colors.bgSand }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <Divider style={{ marginVertical: 6 }} />

              <View style={styles.assuranceRow}>
                <ShieldCheck size={14} color={colors.brandSage} />
                <Text style={styles.assuranceText}>
                  Your password is compared on our servers and never stored on this device — only a
                  session token is, and signing out revokes it.
                </Text>
              </View>
            </Card>
          </View>
        )}

        {/* --------------------------------------------------------- support */}
        <View style={styles.section}>
          <SectionHeader title="Help" caption="A person, not a form." />
          <Card style={{ gap: 2 }}>
            <SupportRow
              icon={<Bot size={15} color={colors.brandSage} />}
              label="Ask Foldie"
              caption="Concierge assistant, in-app"
              onPress={() => router.push('/concierge')}
            />
            <SupportRow
              icon={<MessageCircle size={15} color={colors.brandSage} />}
              label="WhatsApp the desk"
              caption="Fastest for a quick question"
              onPress={() => Linking.openURL(`https://wa.me/${CONTACT.whatsapp}`)}
            />
            <SupportRow
              icon={<Phone size={15} color={colors.brandSage} />}
              label={CONTACT.phone}
              caption={CONTACT.hours}
              onPress={() => Linking.openURL(`tel:${CONTACT.phone.replace(/\s/g, '')}`)}
            />
            <SupportRow
              icon={<Mail size={15} color={colors.brandSage} />}
              label={CONTACT.email}
              caption="Contracts and invoicing"
              onPress={() => Linking.openURL(`mailto:${CONTACT.email}`)}
            />
            <SupportRow
              icon={<Star size={15} color={colors.brandSage} />}
              label="Rate FreshFold"
              caption="Tell us how we are doing"
              onPress={() =>
                Linking.openURL(
                  `mailto:${CONTACT.email}?subject=${encodeURIComponent('Feedback on FreshFold')}`
                )
              }
            />
          </Card>
        </View>

        {/* --------------------------------------------------------- session */}
        {isAuthenticated && (
          <View style={styles.section}>
            <Button
              label="Sign out"
              variant="danger"
              onPress={confirmSignOut}
              icon={<LogOut size={15} color={colors.statusError} />}
            />
          </View>
        )}

        <View style={styles.buildInfo}>
          <UserCog size={12} color={colors.textMuted} />
          <Text style={styles.buildText}>
            FreshFold client 1.0.0 · dispatch at {API_BASE_URL}
          </Text>
        </View>
      </ScrollView>

      {/* --------------------------------------------------------- sheets */}
      <NotificationsSheet visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />

      <Sheet visible={addressSheetOpen} onClose={() => setAddressSheetOpen(false)}>
        <ScrollView contentContainerStyle={styles.addressSheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Add an address</Text>

          <Field
            label="Label"
            value={draftLabel}
            onChangeText={setDraftLabel}
            placeholder="Home, hostel, office…"
          />
          <Field
            label="Address"
            value={draftAddress}
            onChangeText={setDraftAddress}
            placeholder="Evandy Hostel, Block B, Room 304"
            multiline
          />

          {/* The suburb sheet used to sit here. It is read out of the address
              now rather than asked for separately. */}
          <Field label="City" value={draftCity} onChangeText={setDraftCity} placeholder="Kumasi" />

          <SectionLabel>
            The courier navigates to a pin derived from this text — the more specific, the closer
            they land.
          </SectionLabel>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setAddressSheetOpen(false)}
              style={{ flex: 1 }}
            />
            <Button
              label="Save address"
              onPress={commitAddress}
              disabled={!draftAddress.trim()}
              style={{ flex: 1.3 }}
            />
          </View>
        </ScrollView>
      </Sheet>

    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SupportRow({
  icon,
  label,
  caption,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  caption: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.supportRow, pressed && { opacity: 0.78 }]}
    >
      <View style={styles.supportIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.supportLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.supportCaption} numberOfLines={1}>
          {caption}
        </Text>
      </View>
      <ChevronRight size={14} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: colors.textCharcoal,
    letterSpacing: -0.5,
  },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgLinen,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brandGold,
    borderWidth: 1.5,
    borderColor: colors.bgLinen,
  },

  scroll: { padding: 20, paddingTop: 4, paddingBottom: 40 },
  section: { marginTop: 28 },

  verifyCard: {
    gap: 10,
    backgroundColor: tints.gold08,
    borderColor: tints.gold35,
    marginBottom: 14,
  },
  verifyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verifyTitle: { fontSize: 13, fontWeight: '800', color: colors.textCharcoal },
  verifyBody: { fontSize: 10.5, color: colors.textSlate, lineHeight: 16 },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  profileName: { fontSize: 15, fontWeight: '800', color: colors.textCharcoal },
  profileContact: { fontSize: 10.5, color: colors.textSlate, marginTop: 2, lineHeight: 15 },

  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 3 },
  statValue: { fontSize: 14, fontWeight: '800', color: colors.textCharcoal, letterSpacing: -0.3 },
  statLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 15 },
  addLabel: { fontSize: 12, fontWeight: '700', color: colors.brandSage },

  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.cardPure,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 13,
  },
  addressIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: tints.sage08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  addressLabel: { fontSize: 12.5, fontWeight: '800', color: colors.textCharcoal },
  addressText: { fontSize: 10.5, color: colors.textSlate, marginTop: 2, lineHeight: 14.5 },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  switchIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: tints.sage08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTitle: { fontSize: 12.5, fontWeight: '700', color: colors.textCharcoal },
  switchCaption: { fontSize: 10, color: colors.textSlate, marginTop: 2, lineHeight: 14 },

  assuranceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  assuranceText: { flex: 1, fontSize: 10, color: colors.textMuted, lineHeight: 14.5 },

  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  supportIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: tints.sage08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportLabel: { fontSize: 12, fontWeight: '700', color: colors.textCharcoal },
  supportCaption: { fontSize: 10, color: colors.textMuted, marginTop: 1 },

  buildInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 30,
  },
  buildText: { fontSize: 9, color: colors.textMuted },

  addressSheet: { padding: 20, paddingTop: 8, gap: 13 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: colors.textCharcoal },
});
