/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  ArrowLeft,
  Ban,
  Camera,
  Check,
  ChevronRight,
  Layers,
  MessageSquare,
  PenLine,
  Phone,
  QrCode,
  Receipt,
  RefreshCcw,
  Share2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bagsForJob, humanizeStatus, type JobStatus } from '@freshfold/core';

/**
 * Dispatch states in which the bags are still with the customer. `unassigned`
 * is included so the code is visible from the moment the booking exists —
 * customers look for it before a courier is even allocated.
 */
const COLLECTION_PENDING = new Set<JobStatus>([
  'unassigned',
  'assigned',
  'navigating_to_pickup',
  'arrived_at_pickup',
]);
import { CONTACT } from '../../src/data/catalogue';
import BagScanner from '../../src/components/BagScanner';
import DeliveryConfirm from '../../src/components/DeliveryConfirm';
import HandoffCard from '../../src/components/HandoffCard';
import IssueReporter from '../../src/components/IssueReporter';
import { StageTimeline } from '../../src/components/StageTimeline';
import TrackingMap from '../../src/components/TrackingMap';
import { paymentTone } from '../../src/components/OrderCard';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  SectionLabel,
  Sheet,
} from '../../src/components/ui';
import { useClient } from '../../src/store/ClientStore';
import {
  colors,
  courierName,
  courierVehicle,
  formatCedis,
  formatDate,
  radius,
  shadow,
  tints,
} from '../../src/theme';

/**
 * One order, in full.
 *
 * Everything the client portal's detail view shows — stages, manifest,
 * finishing choices, proof of service, receipt — plus the three capabilities
 * lifted from the rider console: scan the bags, photograph a problem, sign at
 * the door.
 *
 * The `action` param lets the Track tab and a notification deep-link straight
 * into one of those sheets.
 */
export default function OrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; action?: string }>();
  const {
    bookingById,
    loadBookingProof,
    verifiedBags,
    verifyBags,
    confirmDelivery,
    reportIssue,
    cancelBooking,
    messagesFor,
  } = useClient();

  const [sheet, setSheet] = useState<'scan' | 'issue' | 'sign' | 'receipt' | null>(null);

  const booking = bookingById(params.id);

  // This screen is the only one that shows the proof photographs, so it is the
  // one that pays for them. The polled list carries everything else.
  useEffect(() => {
    if (params.id) void loadBookingProof(params.id);
  }, [params.id, loadBookingProof]);

  // A deep link opens its sheet once the record is in the mirror.
  useEffect(() => {
    if (!booking || !params.action) return;
    if (params.action === 'scan' || params.action === 'issue' || params.action === 'sign') {
      setSheet(params.action);
    }
  }, [booking, params.action]);

  /**
   * The bag manifest.
   *
   * `Booking` is the customer projection and deliberately carries no dispatch
   * detail, so the bags are re-derived here with the very function the server
   * used to create them. It is deterministic on `(id, amount, serviceType)`,
   * which means these are the same codes printed on the same bags — no extra
   * endpoint, and no chance of the two lists disagreeing.
   */
  const bags = useMemo(
    () =>
      booking
        ? bagsForJob(booking.id, booking.amount ?? 0, booking.serviceType)
        : [],
    [booking]
  );

  const verified = booking ? (verifiedBags[booking.id] ?? []) : [];
  const thread = booking ? messagesFor(booking.id) : [];

  /** Whatever was actually captured at the two handovers, in the order it happened. */
  const proofShots = useMemo(() => {
    const proof = booking?.proof;
    if (!proof) return [];

    const shots: { label: string; uri?: string }[] = [
      { label: 'Collected', uri: proof.pickupPhoto },
      { label: 'Signed at pickup', uri: proof.pickupSignature },
      { label: 'Delivered', uri: proof.deliveryPhoto },
      { label: 'Signed on delivery', uri: proof.deliverySignature },
    ];

    return shots.filter((shot): shot is { label: string; uri: string } => !!shot.uri);
  }, [booking?.proof]);

  const atTheDoor = booking?.rider?.jobStatus === 'arrived_at_delivery';
  const closed = booking?.status === 'Delivered' || booking?.status === 'Cancelled';

  /** Before the courier has taken the bags — the window the code is for. */
  const awaitingCollection =
    !closed &&
    !!booking &&
    COLLECTION_PENDING.has(booking.rider?.jobStatus ?? 'unassigned');

  const onCancel = useCallback(() => {
    if (!booking) return;

    Alert.alert(
      'Cancel this order?',
      'The courier will be stood down. Anything already paid is refunded to your wallet by the concierge desk.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: () => {
            cancelBooking(booking.id);
            router.back();
          },
        },
      ]
    );
  }, [booking, cancelBooking, router]);

  if (!booking) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header title="Order" onBack={() => router.back()} />
        <View style={{ padding: 20 }}>
          <EmptyState
            title="Order not found"
            body="This reference is not in your history. If you booked it on the website, sign in with the same email to see it here."
            action="Back"
            onAction={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        title={booking.id}
        subtitle={booking.serviceType}
        onBack={() => router.back()}
        onShare={() =>
          Linking.openURL(
            `https://wa.me/?text=${encodeURIComponent(
              `Tracking my FreshFold order ${booking.id} — ${booking.status}.`
            )}`
          )
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* --------------------------------------------------------- status */}
        <Card style={{ gap: 12 }}>
          <View style={styles.statusHead}>
            <Badge
              label={booking.status}
              tone={
                booking.status === 'Delivered'
                  ? 'success'
                  : booking.status === 'Cancelled'
                    ? 'error'
                    : 'sage'
              }
            />
            <Badge label={booking.paymentStatus ?? 'Pending'} tone={paymentTone(booking)} />
            <Text style={styles.amount}>{formatCedis(booking.amount ?? 0)}</Text>
          </View>

          <StageTimeline stage={booking.status} dispatchStatus={booking.rider?.jobStatus} />
        </Card>

        {/* ------------------------------------------------------------ map */}
        {!closed && <TrackingMap booking={booking} />}

        {/* Only until the bags are actually collected — after that the code
            has done its job and leaving it on screen just invites confusion
            with the delivery hand-off. */}
        {awaitingCollection && <HandoffCard booking={booking} />}

        {/* -------------------------------------------------------- actions */}
        {!closed && (
          <View>
            <SectionLabel>Things you can do</SectionLabel>
            <View style={{ gap: 9, marginTop: 10 }}>
              {atTheDoor && (
                <ActionRow
                  icon={<PenLine size={16} color={colors.brandSage} />}
                  title="Sign for delivery"
                  /*
                    Readable, because the whole point is that the customer
                    reads it out. It used to be masked to `••••`, which left
                    the one person who is supposed to hold the code unable to
                    see it — and the courier's app carrying it instead.
                  */
                  caption={
                    booking.deliveryOtp
                      ? `Your courier is at the door. Read them code ${booking.deliveryOtp}.`
                      : 'Your courier is at the door.'
                  }
                  onPress={() => setSheet('sign')}
                  emphasis
                />
              )}
              <ActionRow
                icon={<QrCode size={16} color={colors.brandSage} />}
                title="Verify the bag manifest"
                caption={
                  verified.length > 0
                    ? `${verified.length} of ${bags.length} checked by you`
                    : `${bags.length} bag${bags.length === 1 ? '' : 's'} on this order`
                }
                onPress={() => setSheet('scan')}
              />
              <ActionRow
                icon={<Camera size={16} color={colors.brandSage} />}
                title="Report an issue"
                caption="Photograph a garment and tell us what happened"
                onPress={() => setSheet('issue')}
              />
              <ActionRow
                icon={<MessageSquare size={16} color={colors.brandSage} />}
                title="Conversation"
                caption={thread.length > 0 ? `${thread.length} messages` : 'Message the courier or dispatch'}
                onPress={() => router.push({ pathname: '/chat', params: { id: booking.id } })}
              />
              {/*
                This said "Call {courier}" and dialled `booking.phone` — the
                customer's own number, so tapping it rang the phone in their
                hand. Couriers ride on their own handsets and their numbers are
                not the customer's to have, so the courier is reachable through
                the message thread above and the desk is reachable by phone.
              */}
              {!!booking.rider && (
                <ActionRow
                  icon={<Phone size={16} color={colors.brandSage} />}
                  title="Call the concierge desk"
                  caption={`About ${courierName(booking.rider)} · ${courierVehicle(booking.rider)}`}
                  onPress={() =>
                    Linking.openURL(`tel:${CONTACT.phone.replace(/\s/g, '')}`)
                  }
                />
              )}
            </View>
          </View>
        )}

        {/* -------------------------------------------------------- manifest */}
        <Card style={{ gap: 11 }}>
          <View style={styles.cardHead}>
            <SectionLabel>Bag manifest</SectionLabel>
            <Text style={styles.cardHeadMeta}>
              {verified.length}/{bags.length} verified by you
            </Text>
          </View>

          {bags.map((bag) => {
            const isVerified = verified.includes(bag.qrCode);
            return (
              <View key={bag.id} style={styles.bagRow}>
                <View style={[styles.bagIcon, isVerified && { backgroundColor: tints.success10 }]}>
                  <Layers
                    size={13}
                    color={isVerified ? colors.statusSuccess : colors.textSlate}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bagType} numberOfLines={1}>
                    {bag.type}
                  </Text>
                  <Text style={styles.bagMeta}>
                    {bag.qrCode} · {bag.itemCount} items · {bag.weight}
                  </Text>
                </View>
                {isVerified && <Check size={14} color={colors.statusSuccess} strokeWidth={3} />}
              </View>
            );
          })}
        </Card>

        {/* ---------------------------------------------------------- detail */}
        <Card style={{ gap: 10 }}>
          <SectionLabel>Details</SectionLabel>
          <Row label="Service" value={booking.serviceType} />
          <Row label="Collection" value={`${formatDate(booking.pickupDate)} · ${booking.pickupTime}`} />
          <Row label="Return" value={formatDate(booking.deliveryDate)} />
          <Row label="Address" value={[booking.address, booking.suburb, booking.city].filter(Boolean).join(', ')} />
          <Row label="Booked" value={formatDate(booking.createdAt)} />
          {!!booking.planId && <Row label="Plan" value={booking.planId} />}
          {!!booking.specialInstructions && (
            <Row label="Care notes" value={booking.specialInstructions} />
          )}
          {!!booking.specialtyAddons?.length && (
            <Row label="Add-ons" value={booking.specialtyAddons.join(', ')} />
          )}
          {!!booking.riderNote && <Row label="Courier note" value={booking.riderNote} />}
          {!!booking.rider && (
            <Row
              label="Courier"
              value={`${courierName(booking.rider)} · ${humanizeStatus(booking.rider.jobStatus)}`}
            />
          )}
        </Card>

        {/* ----------------------------------------------------------- proof */}
        {proofShots.length > 0 && (
          <Card style={{ gap: 10 }}>
            <SectionLabel>Proof of service</SectionLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 9 }}
            >
              {proofShots.map((shot) => (
                <View key={shot.label} style={{ gap: 5 }}>
                  {/* A signature saved as a raw path — the fallback when the pad
                      could not rasterise — is a string, not an image source. */}
                  {shot.uri.startsWith('freshfold-signature:') ? (
                    <View style={[styles.proofImage, styles.proofVector]}>
                      <PenLine size={18} color={colors.brandStone} />
                      <Text style={styles.proofVectorLabel}>Signature on file</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: shot.uri }} style={styles.proofImage} />
                  )}
                  <Text style={styles.proofCaption}>{shot.label}</Text>
                </View>
              ))}
            </ScrollView>
          </Card>
        )}

        {/* --------------------------------------------------------- closing */}
        <View style={{ gap: 9 }}>
          <Button
            label="View receipt"
            variant="ghost"
            onPress={() => setSheet('receipt')}
            icon={<Receipt size={15} color={colors.textCharcoal} />}
          />
          {closed ? (
            <Button
              label="Book this again"
              onPress={() =>
                router.push({ pathname: '/(tabs)/book', params: { serviceId: booking.serviceType } })
              }
              icon={<RefreshCcw size={15} color="#FFFFFF" />}
            />
          ) : (
            <Button
              label="Cancel this order"
              variant="danger"
              onPress={onCancel}
              icon={<Ban size={15} color={colors.statusError} />}
            />
          )}
        </View>
      </ScrollView>

      {/* ---------------------------------------------------------- sheets */}
      <Sheet visible={sheet === 'scan'} onClose={() => setSheet(null)}>
        <BagScanner
          bags={bags}
          reference={booking.id}
          onCancel={() => setSheet(null)}
          onConfirm={(scanned) => {
            verifyBags(booking.id, scanned);
            setSheet(null);
          }}
        />
      </Sheet>

      <Sheet visible={sheet === 'issue'} onClose={() => setSheet(null)}>
        <IssueReporter
          onCancel={() => setSheet(null)}
          onSubmit={(note, photoUri) => {
            reportIssue(booking.id, note, photoUri);
            setSheet(null);
          }}
        />
      </Sheet>

      <Sheet visible={sheet === 'sign'} onClose={() => setSheet(null)}>
        <DeliveryConfirm
          customerName={booking.name}
          bagCount={bags.length}
          deliveryCode={booking.deliveryOtp}
          onCancel={() => setSheet(null)}
          onConfirm={async (signature, code) => {
            const ok = await confirmDelivery(booking.id, signature, code);
            if (ok) setSheet(null);
            return ok;
          }}
        />
      </Sheet>

      <Sheet visible={sheet === 'receipt'} onClose={() => setSheet(null)}>
        <View style={styles.receipt}>
          <Text style={styles.receiptTitle}>FreshFold Laundry Co.</Text>
          <Text style={styles.receiptRef}>{booking.id}</Text>
          <Divider style={{ marginVertical: 12 }} />

          <Row label="Service" value={booking.serviceType} />
          <Row label="Collected" value={formatDate(booking.pickupDate)} />
          <Row label="Returned" value={formatDate(booking.deliveryDate)} />
          <Row label="Method" value={booking.paymentMethod ?? '—'} />
          <Row label="Status" value={booking.paymentStatus ?? 'Pending'} />
          {!!booking.transactionRef && <Row label="Reference" value={booking.transactionRef} />}

          <Divider style={{ marginVertical: 12 }} />
          <Row label="Total" value={formatCedis(booking.amount ?? 0)} emphasis />

          <Button
            label="Close"
            variant="ghost"
            onPress={() => setSheet(null)}
            style={{ marginTop: 18 }}
          />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

function Header({
  title,
  subtitle,
  onBack,
  onShare,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onShare?: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.headerButton}>
        <ArrowLeft size={17} color={colors.textCharcoal} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {!!subtitle && (
          <Text style={styles.headerSub} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!onShare && (
        <Pressable onPress={onShare} hitSlop={10} style={styles.headerButton}>
          <Share2 size={16} color={colors.textCharcoal} />
        </Pressable>
      )}
    </View>
  );
}

function ActionRow({
  icon,
  title,
  caption,
  onPress,
  emphasis,
}: {
  icon: React.ReactNode;
  title: string;
  caption: string;
  onPress: () => void;
  emphasis?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        emphasis && styles.actionRowEmphasis,
        pressed && { opacity: 0.87 },
      ]}
    >
      <View style={[styles.actionIcon, emphasis && { backgroundColor: colors.cardPure }]}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionCaption} numberOfLines={1}>
          {caption}
        </Text>
      </View>
      <ChevronRight size={15} color={colors.textMuted} />
    </Pressable>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasis && styles.rowValueStrong]}>{value || '—'}</Text>
    </View>
  );
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
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgLinen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.textCharcoal,
  },
  headerSub: { fontSize: 10.5, color: colors.textSlate, marginTop: 2 },

  scroll: { padding: 20, paddingTop: 4, paddingBottom: 40, gap: 14 },

  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  amount: { flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '800', color: colors.textCharcoal },

  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeadMeta: { fontSize: 10, color: colors.textMuted },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.cardPure,
    ...shadow.xs,
  },
  actionRowEmphasis: { borderColor: tints.sage40, backgroundColor: tints.sage08 },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: tints.sage08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { fontSize: 12.5, fontWeight: '800', color: colors.textCharcoal },
  actionCaption: { fontSize: 10.5, color: colors.textSlate, marginTop: 2 },

  bagRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  bagIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    backgroundColor: tints.stone35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bagType: { fontSize: 12, fontWeight: '700', color: colors.textCharcoal },
  bagMeta: { fontSize: 9.5, color: colors.textMuted, marginTop: 2 },

  proofImage: { width: 128, height: 96, borderRadius: radius.md, backgroundColor: colors.bgSand },
  proofVector: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brandStone,
  },
  proofVectorLabel: { fontSize: 9, color: colors.textMuted },
  proofCaption: { fontSize: 9.5, color: colors.textSlate, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowLabel: { width: 88, fontSize: 10.5, color: colors.textMuted },
  rowValue: { flex: 1, fontSize: 11.5, color: colors.textCharcoal, textAlign: 'right', lineHeight: 16 },
  rowValueStrong: { fontSize: 16, fontWeight: '800' },

  receipt: { padding: 24, paddingTop: 12, gap: 9 },
  receiptTitle: { fontSize: 16, fontWeight: '800', color: colors.textCharcoal, textAlign: 'center' },
  receiptRef: {
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
});
