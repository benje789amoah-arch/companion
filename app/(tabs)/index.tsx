/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import {
  Bell,
  Camera as CameraIcon,
  CheckCircle2,
  MapPin,
  MessageSquare,
  QrCode,
  Sparkles,
  UserCheck,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CameraCapture from '../../src/components/CameraCapture';
import LiveMap from '../../src/components/LiveMap';
import NotificationsSheet from '../../src/components/NotificationsSheet';
import QRScanner from '../../src/components/QRScanner';
import SignaturePad from '../../src/components/SignaturePad';
import { Avatar, Badge, Button } from '../../src/components/ui';
import { useApp } from '../../src/store/AppStore';
import { colors, formatCedis, humanizeStatus, radius, shadow, tints } from '../../src/theme';

/** Delivery OTPs the mock customers hand over. */
const VALID_DELIVERY_OTPS = ['7809', '4019', '1234'];

type ActiveModal = 'scanner' | 'pickup-camera' | 'delivery-camera' | 'signature' | null;

export default function HomeScreen() {
  const router = useRouter();
  const {
    rider,
    orders,
    notifications,
    activeOrder,
    backlogOrders,
    unreadCount,
    navigationTarget,
    arriveAtDestination,
    updateRider,
    acceptOrder,
    updateOrderStatus,
    sendRiderMessage,
    markNotificationRead,
  } = useApp();

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);

  // Delivery hand-off gate.
  const [otpInput, setOtpInput] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState(false);

  // Offers the rider waved away this session.
  const [dismissedOfferIds, setDismissedOfferIds] = useState<string[]>([]);

  // A fresh order starts its delivery gate closed again.
  useEffect(() => {
    setOtpInput('');
    setOtpVerified(false);
    setOtpError(false);
  }, [activeOrder?.id]);

  const offer = useMemo(
    () =>
      rider.isOnline && !activeOrder
        ? backlogOrders.find((o) => !dismissedOfferIds.includes(o.id))
        : undefined,
    [rider.isOnline, activeOrder, backlogOrders, dismissedOfferIds]
  );

  const handleQrVerified = () => {
    if (!activeOrder) return;
    setActiveModal(null);

    if (activeOrder.status === 'arrived_at_pickup') {
      updateOrderStatus(activeOrder.id, 'pickup_scanned');
    } else if (activeOrder.status === 'arrived_at_laundry') {
      updateOrderStatus(activeOrder.id, 'dropped_off');
    }
  };

  const handlePhotoCaptured = (uri: string) => {
    if (!activeOrder) return;
    setActiveModal(null);
    // Re-asserting the current status attaches the photo to the right slot.
    updateOrderStatus(activeOrder.id, activeOrder.status, uri);
  };

  const handleSignatureCaptured = (signature: string) => {
    if (!activeOrder) return;
    setActiveModal(null);

    if (activeOrder.status === 'pickup_scanned') {
      updateOrderStatus(activeOrder.id, 'picked_up', undefined, signature);
      updateRider({ todayDistance: rider.todayDistance + 2.1 });
    } else if (activeOrder.status === 'arrived_at_delivery') {
      updateOrderStatus(activeOrder.id, 'delivered', undefined, signature);
      updateRider({
        todayDistance: rider.todayDistance + activeOrder.distance,
        todayEarnings: rider.todayEarnings + activeOrder.price,
        completedCount: rider.completedCount + 1,
      });
    }
  };

  const verifyDeliveryOtp = () => {
    if (VALID_DELIVERY_OTPS.includes(otpInput)) {
      setOtpError(false);
      setOtpVerified(true);
    } else {
      setOtpError(true);
    }
  };

  return (
    <View style={styles.container}>
      <LiveMap
        rider={rider}
        orders={orders}
        activeOrder={activeOrder}
        navigationTarget={navigationTarget}
        focusedOrderId={focusedOrderId}
        onSelectOrder={(order) => setFocusedOrderId(order.id)}
        onAcceptOrder={acceptOrder}
      />

      {/* Floating identity + alerts */}
      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <View style={styles.identityChip}>
          <Avatar uri={rider.avatar} size={32} />
          <View style={{ maxWidth: 120 }}>
            <Text style={styles.identityName} numberOfLines={1}>
              {rider.name || 'Setup profile'}
            </Text>
            <Text style={styles.identityId} numberOfLines={1}>
              {rider.employeeId ? `ID: ${rider.employeeId}` : 'No identity'}
            </Text>
          </View>
        </View>

        <View style={styles.topActions}>
          <Pressable
            onPress={() => setShowNotifications(true)}
            accessibilityLabel="Open notifications"
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
          >
            <Bell size={16} color={colors.textCharcoal} />
            {unreadCount > 0 && (
              <View style={styles.badgeDot}>
                <Text style={styles.badgeDotText}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push('/chat')}
            accessibilityLabel="Open dispatch chat"
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
          >
            <MessageSquare size={16} color={colors.textCharcoal} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Shift control sheet */}
      <View style={styles.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 14 }}
          style={{ maxHeight: 330 }}
        >
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>
                {rider.isOnline ? 'Scooter shift active' : 'Operational offline'}
              </Text>
              <Text style={styles.sheetSubtitle}>
                {rider.isOnline
                  ? 'Awaiting white-glove orders…'
                  : 'Go online to receive premium orders'}
              </Text>
            </View>

            <Pressable
              onPress={() => updateRider({ isOnline: !rider.isOnline })}
              style={({ pressed }) => [
                styles.onlinePill,
                rider.isOnline ? styles.onlinePillOn : styles.onlinePillOff,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.onlinePillLabel,
                  { color: rider.isOnline ? colors.statusSuccess : '#FFFFFF' },
                ]}
              >
                {rider.isOnline ? '• Online' : 'Go online'}
              </Text>
            </Pressable>
          </View>

          {rider.isOnline && (
            <View style={styles.statsRow}>
              <StatTile label="Complete" value={`${rider.completedCount} jobs`} />
              <StatTile
                label="Est. earnings"
                value={formatCedis(rider.todayEarnings)}
                accent
              />
              <StatTile label="Shift distance" value={`${rider.todayDistance.toFixed(1)} km`} />
            </View>
          )}

          {rider.isOnline && activeOrder && (
            <View style={styles.workflow}>
              <View style={styles.workflowHeader}>
                <Text style={styles.workflowLabel}>Active assignment workflow</Text>
                <Badge
                  label={humanizeStatus(activeOrder.status)}
                  tone={activeOrder.priority === 'elite' ? 'gold' : 'sage'}
                />
              </View>

              {/* --- transit legs --- */}
              {activeOrder.status === 'assigned' && (
                <>
                  <Text style={styles.workflowBody}>
                    Proceed to <Text style={styles.strong}>{activeOrder.pickupAddress}</Text> for
                    pickup.
                  </Text>
                  <Button
                    label="Start GPS navigation"
                    onPress={() => updateOrderStatus(activeOrder.id, 'navigating_to_pickup')}
                  />
                </>
              )}

              {navigationTarget && (
                <>
                  <Text style={styles.workflowMuted}>
                    Scooter in transit — simulated GPS is driving the route.
                  </Text>
                  <Button
                    label={
                      activeOrder.status === 'navigating_to_pickup'
                        ? 'Arrived at pickup'
                        : activeOrder.status === 'navigating_to_laundry'
                          ? 'Confirm arrival at hub'
                          : 'Confirm arrival at destination'
                    }
                    variant="outline"
                    onPress={arriveAtDestination}
                  />
                </>
              )}

              {/* --- pickup checklist --- */}
              {activeOrder.status === 'arrived_at_pickup' && (
                <>
                  <StepRow step={1} text="Scan FreshFold QR codes on the linen bags" />
                  <Button
                    label="Open QR bag scanner"
                    icon={<QrCode size={15} color="#FFFFFF" />}
                    onPress={() => setActiveModal('scanner')}
                  />
                </>
              )}

              {activeOrder.status === 'pickup_scanned' && !activeOrder.pickupPhoto && (
                <>
                  <StepRow step={2} text="Take the garment documentation photo" />
                  <Button
                    label="Document garment state"
                    icon={<CameraIcon size={15} color="#FFFFFF" />}
                    onPress={() => setActiveModal('pickup-camera')}
                  />
                </>
              )}

              {activeOrder.status === 'pickup_scanned' && !!activeOrder.pickupPhoto && (
                <>
                  <StepRow step={3} text="Capture the digital signature approval" />
                  <Button
                    label="Acquire digital signature"
                    icon={<UserCheck size={15} color="#FFFFFF" />}
                    onPress={() => setActiveModal('signature')}
                  />
                </>
              )}

              {/* --- transit to the hub --- */}
              {activeOrder.status === 'picked_up' && (
                <>
                  <Text style={styles.workflowBody}>
                    Garments packed and secured. Proceed to the laundry hub.
                  </Text>
                  <Button
                    label="Navigate to laundry centre"
                    onPress={() => updateOrderStatus(activeOrder.id, 'navigating_to_laundry')}
                  />
                </>
              )}

              {activeOrder.status === 'arrived_at_laundry' && (
                <>
                  <Text style={styles.workflowBody}>
                    Unload the garments and scan the barcodes for the validation receipt.
                  </Text>
                  <Button
                    label="Verify drop-off barcodes"
                    icon={<QrCode size={15} color="#FFFFFF" />}
                    onPress={() => setActiveModal('scanner')}
                  />
                </>
              )}

              {(activeOrder.status === 'dropped_off' ||
                activeOrder.status === 'processing') && (
                <View style={styles.processingCard}>
                  <CheckCircle2 size={22} color={colors.statusSuccess} />
                  <Text style={styles.processingTitle}>Processing active</Text>
                  <Text style={styles.processingBody}>
                    FreshFold artisans are caring for the linens now. Check back shortly.
                  </Text>
                </View>
              )}

              {activeOrder.status === 'ready_for_delivery' && (
                <>
                  <Text style={styles.workflowBody}>
                    Clean, folded garments are sealed and ready to deliver.
                  </Text>
                  <Button
                    label="Navigate to delivery"
                    variant="gold"
                    onPress={() => updateOrderStatus(activeOrder.id, 'navigating_to_delivery')}
                  />
                </>
              )}

              {/* --- delivery checklist --- */}
              {activeOrder.status === 'arrived_at_delivery' && !otpVerified && (
                <>
                  <View style={styles.otpHeader}>
                    <Text style={styles.workflowBody}>Enter the customer security OTP</Text>
                    <Pressable
                      onPress={() =>
                        sendRiderMessage(
                          'Hello, I have arrived outside with your fresh laundry. Your delivery OTP is 7809.'
                        )
                      }
                      hitSlop={6}
                    >
                      <Text style={styles.otpRequest}>Request OTP</Text>
                    </Pressable>
                  </View>

                  <View style={styles.otpRow}>
                    <TextInput
                      value={otpInput}
                      onChangeText={setOtpInput}
                      placeholder="4-digit OTP"
                      placeholderTextColor={colors.textSlate}
                      keyboardType="number-pad"
                      maxLength={4}
                      style={styles.otpInput}
                    />
                    <Button label="Verify" onPress={verifyDeliveryOtp} style={{ flex: 1 }} />
                  </View>

                  {otpError && (
                    <Text style={styles.otpError}>Incorrect pin. Try '7809' or '4019'.</Text>
                  )}
                </>
              )}

              {activeOrder.status === 'arrived_at_delivery' &&
                otpVerified &&
                !activeOrder.deliveryPhoto && (
                  <>
                    <StepRow step={2} text="Upload the proof-of-delivery photo" />
                    <Button
                      label="Take receipt photo"
                      icon={<CameraIcon size={15} color="#FFFFFF" />}
                      onPress={() => setActiveModal('delivery-camera')}
                    />
                  </>
                )}

              {activeOrder.status === 'arrived_at_delivery' &&
                otpVerified &&
                !!activeOrder.deliveryPhoto && (
                  <>
                    <StepRow step={3} text="Obtain the recipient's signature" />
                    <Button
                      label="Collect drop signature"
                      icon={<UserCheck size={15} color="#FFFFFF" />}
                      onPress={() => setActiveModal('signature')}
                    />
                  </>
                )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Incoming job offer */}
      {offer && (
        <View style={styles.offerCard}>
          <View style={styles.offerHeader}>
            <View style={styles.offerEyebrowRow}>
              <Sparkles size={12} color={colors.brandGold} />
              <Text style={styles.offerEyebrow}>Premium incoming job</Text>
            </View>
            <Text style={styles.offerTimeout}>Tap to respond</Text>
          </View>

          <View style={styles.offerTitleRow}>
            <Text style={styles.offerName} numberOfLines={1}>
              {offer.customerName}
            </Text>
            <Text style={styles.offerPrice}>{formatCedis(offer.price)}</Text>
          </View>

          <View style={styles.offerMetaRow}>
            <MapPin size={12} color={colors.brandSage} />
            <Text style={styles.offerMeta} numberOfLines={1}>
              {offer.pickupAddress}
            </Text>
          </View>
          <Text style={styles.offerSubMeta}>
            {offer.laundryType} • {offer.bagCount} bags • {offer.distance} km
          </Text>

          <View style={styles.offerActions}>
            <Button
              label="Decline"
              variant="ghost"
              onPress={() => setDismissedOfferIds((prev) => [...prev, offer.id])}
              style={{ flex: 1 }}
            />
            <Button
              label="Accept job"
              onPress={() => acceptOrder(offer.id)}
              style={{ flex: 1.3 }}
            />
          </View>
        </View>
      )}

      {/* Workflow modals */}
      <Modal
        visible={activeModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal(null)}
      >
        <Pressable style={styles.modalScrim} onPress={() => setActiveModal(null)}>
          <Pressable style={styles.modalBody} onPress={(e) => e.stopPropagation()}>
            {activeModal === 'scanner' && activeOrder && (
              <QRScanner
                order={activeOrder}
                onScanComplete={handleQrVerified}
                onCancel={() => setActiveModal(null)}
              />
            )}

            {(activeModal === 'pickup-camera' || activeModal === 'delivery-camera') && (
              <CameraCapture
                context={activeModal === 'pickup-camera' ? 'pickup' : 'delivery'}
                title={
                  activeModal === 'pickup-camera'
                    ? 'Document garment condition'
                    : 'Proof of delivery'
                }
                onCapture={handlePhotoCaptured}
                onCancel={() => setActiveModal(null)}
              />
            )}

            {activeModal === 'signature' && activeOrder && (
              <SignaturePad
                customerName={activeOrder.customerName}
                title={
                  activeOrder.status === 'pickup_scanned'
                    ? 'Pickup signature verification'
                    : 'Delivery receipt slip'
                }
                onSave={handleSignatureCaptured}
                onCancel={() => setActiveModal(null)}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <NotificationsSheet
        visible={showNotifications}
        notifications={notifications}
        onClose={() => setShowNotifications(false)}
        onSelect={(notif) => {
          markNotificationRead(notif.id);
          setShowNotifications(false);
          if (notif.orderId) {
            setFocusedOrderId(notif.orderId);
            router.push('/(tabs)/assignments');
          }
        }}
      />
    </View>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: colors.brandGold }]}>{value}</Text>
    </View>
  );
}

function StepRow({ step, text }: { step: number; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBubble}>
        <Text style={styles.stepNumber}>{step}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  identityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    paddingLeft: 5,
    paddingRight: 14,
    paddingVertical: 5,
    ...shadow.md,
  },
  identityName: { fontSize: 10.5, fontWeight: '800', color: colors.textCharcoal },
  identityId: { fontSize: 8, color: colors.textSlate, marginTop: 1 },
  topActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  circleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  badgeDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.statusError,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDotText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800' },

  sheet: {
    backgroundColor: colors.cardPure,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    ...shadow.lg,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetTitle: { fontSize: 14, fontWeight: '800', color: colors.textCharcoal },
  sheetSubtitle: { fontSize: 10, color: colors.textSlate, marginTop: 2 },
  onlinePill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  onlinePillOn: { backgroundColor: tints.success10, borderColor: tints.success30 },
  onlinePillOff: { backgroundColor: colors.textCharcoal, borderColor: colors.textCharcoal },
  onlinePillLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  statsRow: { flexDirection: 'row', gap: 8 },
  statTile: {
    flex: 1,
    backgroundColor: colors.bgIvory,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  statValue: { fontSize: 13, fontWeight: '800', color: colors.textCharcoal, marginTop: 4 },

  workflow: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: 14,
  },
  workflowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  workflowLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  workflowBody: { fontSize: 11.5, color: colors.textCharcoal, lineHeight: 16 },
  workflowMuted: { fontSize: 11, color: colors.textSlate },
  strong: { fontWeight: '700' },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgLinen,
    borderRadius: radius.lg,
    padding: 9,
  },
  stepBubble: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brandSage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 10.5, color: colors.textCharcoal },

  processingCard: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bgLinen,
    borderWidth: 1,
    borderColor: colors.brandStone,
    borderRadius: radius.lg,
    padding: 14,
  },
  processingTitle: { fontSize: 12, fontWeight: '700', color: colors.textCharcoal },
  processingBody: { fontSize: 10, color: colors.textSlate, textAlign: 'center' },

  otpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  otpRequest: { fontSize: 9.5, fontWeight: '700', color: colors.brandGold },
  otpRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  otpInput: {
    flex: 1.4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    backgroundColor: colors.bgIvory,
    paddingVertical: 11,
    textAlign: 'center',
    letterSpacing: 5,
    fontWeight: '700',
    color: colors.textCharcoal,
  },
  otpError: { fontSize: 9.5, fontWeight: '700', color: colors.statusError },

  offerCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 24,
    backgroundColor: colors.cardPure,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.brandGold,
    padding: 16,
    gap: 6,
    ...shadow.lg,
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingBottom: 8,
  },
  offerEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  offerEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.brandGold,
  },
  offerTimeout: { fontSize: 9, color: colors.textSlate },
  offerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  offerName: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.textCharcoal },
  offerPrice: { fontSize: 13, fontWeight: '800', color: colors.brandSage },
  offerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  offerMeta: { flex: 1, fontSize: 10.5, color: colors.textSlate },
  offerSubMeta: { fontSize: 9.5, color: colors.textSlate },
  offerActions: { flexDirection: 'row', gap: 10, marginTop: 8 },

  modalScrim: { flex: 1, backgroundColor: tints.scrim, justifyContent: 'flex-end' },
  modalBody: { width: '100%' },
});
