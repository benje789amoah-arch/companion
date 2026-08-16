/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import {
  Bell,
  Camera as CameraIcon,
  CheckCircle2,
  IdCard,
  MapPin,
  MessageSquare,
  QrCode,
  ScanLine,
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
import CustomerStage from '../../src/components/CustomerStage';
import DropoffVerify from '../../src/components/DropoffVerify';
import HandoffVerify from '../../src/components/HandoffVerify';
import LiveMap from '../../src/components/LiveMap';
import NotificationsSheet from '../../src/components/NotificationsSheet';
import QRScanner from '../../src/components/QRScanner';
import SignaturePad from '../../src/components/SignaturePad';
import { Avatar, Badge, Button, ConnectionPill } from '../../src/components/ui';
import { toBookingStatus } from '@freshfold/core';
import { useApp } from '../../src/store/AppStore';
import { colors, formatCedis, humanizeStatus, radius, shadow, tints } from '../../src/theme';

type ActiveModal =
  | 'handoff'
  | 'dropoff'
  | 'scanner'
  | 'pickup-camera'
  | 'delivery-camera'
  | 'signature'
  | null;

/** Avatar (32) + vertical padding (5 × 2) + border (1 × 2). */
const IDENTITY_CHIP_HEIGHT = 44;

export default function HomeScreen() {
  const router = useRouter();
  const {
    rider,
    orders,
    notifications,
    myOrders,
    activeOrder,
    focusedOrderId,
    focusOrder,
    canTakeMore,
    backlogOrders,
    connected,
    locationDenied,
    arrivalAutoConfirms,
    profileComplete,
    unreadCount,
    navigationTarget,
    arriveAtDestination,
    completeDelivery,
    completeDropoff,
    updateRider,
    acceptOrder,
    updateOrderStatus,
    sendRiderMessage,
    markNotificationRead,
  } = useApp();

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  /** Order whose collection code this courier has checked, this session. */
  const [handoffVerifiedFor, setHandoffVerifiedFor] = useState<string | null>(null);
  /**
   * Order whose bags this courier has counted off at the hub, this session.
   *
   * Local on purpose. The manifest check is the courier satisfying themselves
   * that what came off the bike is what went on it; the transition itself is
   * the hub's code, and that is dispatch's call, not this flag's.
   */
  const [dropoffBagsCheckedFor, setDropoffBagsCheckedFor] = useState<string | null>(null);

  // Delivery hand-off gate. The code is never on this device — it is typed
  // from what the customer says and checked by the server, so what is held
  // here is the attempt and whatever dispatch said about it.
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [handoverBusy, setHandoverBusy] = useState(false);
  /** True once the courier has said they cannot get a code at all. */
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  // Offers the rider waved away this session.
  const [dismissedOfferIds, setDismissedOfferIds] = useState<string[]>([]);

  // A fresh order starts its gates closed again.
  useEffect(() => {
    setOtpInput('');
    setOtpError('');
    setOverrideMode(false);
    setOverrideReason('');
    setDropoffBagsCheckedFor(null);
  }, [activeOrder?.id]);

  /**
   * Enough to attempt the handover: four digits from the customer, or a
   * written reason for not having them. Whether the digits are *right* is
   * dispatch's call, not this console's.
   */
  const handoverReady = overrideMode ? overrideReason.trim().length >= 8 : otpInput.length === 4;

  /**
   * The next job worth putting in front of the courier.
   *
   * Gated on `canTakeMore` rather than on having no job at all: a round trip
   * parks a job at the hub for as long as the washing takes, and a courier
   * standing idle through that was capacity this console used to throw away.
   * What still blocks an offer is being mid-leg — on the road or at a door.
   */
  const offer = useMemo(
    () =>
      rider.isOnline && canTakeMore
        ? backlogOrders.find((o) => !dismissedOfferIds.includes(o.id))
        : undefined,
    [rider.isOnline, canTakeMore, backlogOrders, dismissedOfferIds]
  );

  /**
   * Whether the courier may proceed to the bags.
   *
   * A job carrying no `pickupOtp` predates this check — anything already in
   * the ledger before collection codes existed. Those are let through rather
   * than stranded at a gate they can never satisfy.
   */
  const handoffCleared =
    !activeOrder?.pickupOtp || handoffVerifiedFor === activeOrder?.id;

  const handleQrVerified = () => {
    if (!activeOrder) return;
    setActiveModal(null);

    if (activeOrder.status === 'arrived_at_pickup') {
      updateOrderStatus(activeOrder.id, 'pickup_scanned');
    } else if (activeOrder.status === 'arrived_at_laundry') {
      // Counting the bags off no longer moves the job. It used to, which meant
      // the middle hand-off completed on nothing but a manifest this phone had
      // generated for itself — the hub's code is what checks the load in now.
      setDropoffBagsCheckedFor(activeOrder.id);
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
      void finishDelivery(signature);
    }
  };

  /**
   * The handover itself.
   *
   * Everything else in this workflow is optimistic — the console moves and the
   * server catches up. This one waits, because the code is checked there and a
   * job shown as delivered that dispatch does not agree was delivered is worse
   * than a spinner.
   */
  const finishDelivery = async (signature?: string) => {
    if (!activeOrder) return;

    setHandoverBusy(true);
    const result = await completeDelivery(activeOrder.id, {
      code: overrideMode ? undefined : otpInput.trim(),
      overrideReason: overrideMode ? overrideReason.trim() : undefined,
      signature,
    });
    setHandoverBusy(false);

    if (!result.ok) {
      setOtpError(result.error);
      return;
    }

    setOtpError('');
    setOtpInput('');
    setOverrideMode(false);
    setOverrideReason('');
    updateRider({
      todayDistance: rider.todayDistance + activeOrder.distance,
      todayEarnings: rider.todayEarnings + activeOrder.price,
      completedCount: rider.completedCount + 1,
    });
  };

  return (
    <View style={styles.container}>
      <LiveMap
        rider={rider}
        orders={orders}
        activeOrder={activeOrder}
        navigationTarget={navigationTarget}
        focusedOrderId={focusedOrderId ?? activeOrder?.id ?? null}
        // Selecting one of this courier's own pins moves the workflow sheet to
        // it as well, so the map and the sheet never disagree about which job
        // is in front of them. Tapping a pin from the open pool only previews.
        onSelectOrder={(order) => {
          if (myOrders.some((o) => o.id === order.id)) focusOrder(order.id);
        }}
        // Withheld until the profile is complete, so the map simply offers no
        // accept rather than one that refuses. The banner on Tasks and the
        // offer card above both explain why.
        onAcceptOrder={profileComplete ? acceptOrder : undefined}
        // Clears the floating identity chip and alert buttons below, which
        // occupy the same corner as the map's own GPS badge and controls.
        overlayTopOffset={IDENTITY_CHIP_HEIGHT + 10}
      />

      {/* Floating identity + alerts */}
      <SafeAreaView style={[styles.topBar, { pointerEvents: 'box-none' }]} edges={['top']}>
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
          <ConnectionPill online={connected} />
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

          {/*
            The job strip. Only worth the space once there is a choice to make —
            with one job it says nothing the workflow header does not.
          */}
          {rider.isOnline && myOrders.length > 1 && (
            <View style={styles.stripWrap}>
              <Text style={styles.stripLabel}>
                {myOrders.length} jobs in hand · tap to switch
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.stripScroll}
                contentContainerStyle={styles.strip}
              >
                {myOrders.map((job) => {
                  const selected = job.id === activeOrder?.id;
                  const riding = navigationTarget?.orderId === job.id;

                  return (
                    <Pressable
                      key={job.id}
                      onPress={() => focusOrder(job.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${job.orderNumber}, ${toBookingStatus(job.status)}`}
                      style={({ pressed }) => [
                        styles.jobChip,
                        selected && styles.jobChipOn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.jobChipTop}>
                        {riding && <View style={styles.ridingDot} />}
                        <Text
                          style={[styles.jobChipRef, selected && styles.jobChipRefOn]}
                          numberOfLines={1}
                        >
                          {job.orderNumber}
                        </Text>
                      </View>
                      <Text
                        style={[styles.jobChipStage, selected && styles.jobChipStageOn]}
                        numberOfLines={1}
                      >
                        {toBookingStatus(job.status)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {rider.isOnline && activeOrder && (
            <View style={styles.workflow}>
              <View style={styles.workflowHeader}>
                <Text style={styles.workflowLabel} numberOfLines={1}>
                  {myOrders.length > 1 ? activeOrder.orderNumber : 'Active assignment workflow'}
                </Text>
                <Badge
                  label={humanizeStatus(activeOrder.status)}
                  tone={activeOrder.priority === 'elite' ? 'gold' : 'sage'}
                />
              </View>

              {/* The same job in the customer's six stages, so a stage moved
                  from the supervisor's desk shows up here too. */}
              <CustomerStage status={activeOrder.status} />

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

              {/* Only for the job whose road it is — the courier may be
                  looking at a different card while riding this one. */}
              {navigationTarget?.orderId === activeOrder.id && (
                <>
                  <Text style={styles.workflowMuted}>
                    {locationDenied
                      ? 'Location is off, so the customer cannot see you moving. Confirm arrival by hand.'
                      : arrivalAutoConfirms
                        ? `In transit to ${navigationTarget.label}. Arrival is confirmed automatically as you reach it.`
                        : `In transit to ${navigationTarget.label}. Your GPS fix is too rough to confirm arrival on its own — use the button when you get there.`}
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
              {activeOrder.status === 'arrived_at_pickup' && !handoffCleared && (
                <>
                  <StepRow step={1} text="Check the customer's collection code" />
                  <Button
                    label="Verify collection code"
                    icon={<ScanLine size={15} color="#FFFFFF" />}
                    onPress={() => setActiveModal('handoff')}
                  />
                </>
              )}

              {activeOrder.status === 'arrived_at_pickup' && handoffCleared && (
                <>
                  <StepRow step={2} text="Scan FreshFold QR codes on the linen bags" />
                  <Button
                    label="Open QR bag scanner"
                    icon={<QrCode size={15} color="#FFFFFF" />}
                    onPress={() => setActiveModal('scanner')}
                  />
                </>
              )}

              {activeOrder.status === 'pickup_scanned' && !activeOrder.pickupPhoto && (
                <>
                  <StepRow step={3} text="Take the garment documentation photo" />
                  <Button
                    label="Document garment state"
                    icon={<CameraIcon size={15} color="#FFFFFF" />}
                    onPress={() => setActiveModal('pickup-camera')}
                  />
                </>
              )}

              {activeOrder.status === 'pickup_scanned' && !!activeOrder.pickupPhoto && (
                <>
                  <StepRow step={4} text="Capture the digital signature approval" />
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

              {activeOrder.status === 'arrived_at_laundry' &&
                dropoffBagsCheckedFor !== activeOrder.id && (
                  <>
                    <StepRow step={1} text="Count the bags off against the manifest" />
                    <Button
                      label="Verify drop-off barcodes"
                      icon={<QrCode size={15} color="#FFFFFF" />}
                      onPress={() => setActiveModal('scanner')}
                    />
                  </>
                )}

              {activeOrder.status === 'arrived_at_laundry' &&
                dropoffBagsCheckedFor === activeOrder.id && (
                  <>
                    <StepRow step={2} text="Ask the hub desk for their drop-off code" />
                    <Text style={styles.formNote}>
                      It is on the desk’s dispatch screen. This console is never told it —
                      dispatch checks what you send.
                    </Text>
                    <Button
                      label="Check the bags in"
                      icon={<ScanLine size={15} color="#FFFFFF" />}
                      onPress={() => setActiveModal('dropoff')}
                    />
                  </>
                )}

              {/* The hub's own leg. Nothing here is the courier's to press —
                  dispatch moves it through washing and finishing on its own
                  and files an alert when there is a delivery to ride. */}
              {(activeOrder.status === 'dropped_off' ||
                activeOrder.status === 'processing') && (
                <View style={styles.processingCard}>
                  <CheckCircle2 size={22} color={colors.statusSuccess} />
                  <Text style={styles.processingTitle}>
                    {activeOrder.status === 'dropped_off'
                      ? 'Checked in at the hub'
                      : 'Pressing and folding'}
                  </Text>
                  <Text style={styles.processingBody}>
                    FreshFold artisans are caring for the linens now. Dispatch will alert you
                    when they pass quality check and are ready to ride back — you can close the
                    app until then.
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
              {activeOrder.status === 'arrived_at_delivery' && !overrideMode && (
                <>
                  <View style={styles.otpHeader}>
                    <Text style={styles.workflowBody}>Ask for the customer's delivery code</Text>
                    <Pressable
                      onPress={() => {
                        sendRiderMessage(
                          'Hello, I am outside with your fresh laundry. Please read me the delivery code from your FreshFold app.',
                          'customer'
                        );
                        // Open the thread the message just went into. Sending
                        // silently from here looked like a dead button, and the
                        // courier is standing at a door waiting on a reply.
                        router.push('/chat');
                      }}
                      hitSlop={6}
                    >
                      <Text style={styles.otpRequest}>Ask in chat</Text>
                    </Pressable>
                  </View>

                  <View style={styles.otpRow}>
                    <TextInput
                      value={otpInput}
                      onChangeText={(text) => {
                        setOtpInput(text.replace(/\D/g, '').slice(0, 4));
                        setOtpError('');
                      }}
                      placeholder="4-digit code"
                      placeholderTextColor={colors.textSlate}
                      keyboardType="number-pad"
                      maxLength={4}
                      style={styles.otpInput}
                    />
                  </View>

                  <Text style={styles.formNote}>
                    It is on their order screen. This console is never told it — dispatch checks
                    what you type.
                  </Text>

                  <Pressable onPress={() => setOverrideMode(true)} hitSlop={6}>
                    <Text style={styles.otpRequest}>They cannot give me a code</Text>
                  </Pressable>
                </>
              )}

              {/* The documented exception: nobody in, a porter took it. */}
              {activeOrder.status === 'arrived_at_delivery' && overrideMode && (
                <>
                  <Text style={styles.workflowBody}>What happened at the door?</Text>
                  <TextInput
                    value={overrideReason}
                    onChangeText={(text) => {
                      setOverrideReason(text);
                      setOtpError('');
                    }}
                    placeholder="e.g. Nobody answered; left with the hostel porter, Mr Antwi"
                    placeholderTextColor={colors.textSlate}
                    multiline
                    style={[styles.otpInput, styles.overrideInput]}
                  />
                  <Text style={styles.formNote}>
                    This goes to the concierge desk and onto the order permanently, and the
                    customer is told. Take the photo below whatever you write.
                  </Text>

                  <Pressable
                    onPress={() => {
                      setOverrideMode(false);
                      setOverrideReason('');
                      setOtpError('');
                    }}
                    hitSlop={6}
                  >
                    <Text style={styles.otpRequest}>They can give me the code after all</Text>
                  </Pressable>
                </>
              )}

              {activeOrder.status === 'arrived_at_delivery' && !!otpError && (
                <Text style={styles.otpError}>{otpError}</Text>
              )}

              {activeOrder.status === 'arrived_at_delivery' &&
                handoverReady &&
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
                handoverReady &&
                !!activeOrder.deliveryPhoto && (
                  <>
                    <StepRow
                      step={3}
                      text={
                        overrideMode
                          ? 'Sign it off yourself and complete the drop'
                          : "Obtain the recipient's signature"
                      }
                    />
                    <Button
                      label={handoverBusy ? 'Confirming with dispatch…' : 'Collect drop signature'}
                      icon={<UserCheck size={15} color="#FFFFFF" />}
                      disabled={handoverBusy}
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
            {profileComplete ? (
              <Button
                label="Accept job"
                onPress={() => acceptOrder(offer.id)}
                style={{ flex: 1.3 }}
              />
            ) : (
              // Sending the rider somewhere useful beats a dead button: the
              // offer is real and they want it, they just cannot take it yet.
              <Button
                label="Finish profile first"
                variant="gold"
                icon={<IdCard size={15} color="#FFFFFF" />}
                onPress={() => router.push('/(tabs)/profile')}
                style={{ flex: 1.3 }}
              />
            )}
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
            {activeModal === 'handoff' && activeOrder && (
              <HandoffVerify
                order={activeOrder}
                onVerified={() => {
                  setHandoffVerifiedFor(activeOrder.id);
                  // Straight on to the bags — the courier is standing at the
                  // door and the two checks are one interaction to them.
                  setActiveModal('scanner');
                }}
                onCancel={() => setActiveModal(null)}
              />
            )}

            {activeModal === 'scanner' && activeOrder && (
              <QRScanner
                order={activeOrder}
                onScanComplete={handleQrVerified}
                onCancel={() => setActiveModal(null)}
              />
            )}

            {activeModal === 'dropoff' && activeOrder && (
              <DropoffVerify
                order={activeOrder}
                onSubmit={(handover) => completeDropoff(activeOrder.id, handover)}
                onDone={() => setActiveModal(null)}
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
            focusOrder(notif.orderId);
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
    // Tighter than the 14 it was: the connection pill now sits on this edge and
    // carries its own padding.
    paddingRight: 6,
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

  stripWrap: {
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: 14,
  },
  stripLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  // Cancels the sheet's own 18 of padding so the chips bleed to the screen
  // edges as they scroll — a half-visible chip reads as "more this way"
  // rather than as a clipping mistake — and puts it back inside the content.
  stripScroll: { marginHorizontal: -18 },
  strip: { gap: 8, paddingHorizontal: 18 },
  jobChip: {
    minWidth: 116,
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgLinen,
  },
  jobChipOn: {
    borderColor: colors.brandSage,
    backgroundColor: tints.sage15,
  },
  jobChipTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  /** Marks the job the courier is actually riding for. */
  ridingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandGold,
  },
  jobChipRef: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: colors.textSlate,
  },
  jobChipRefOn: { color: colors.textCharcoal },
  jobChipStage: { fontSize: 9, fontWeight: '600', color: colors.textSlate },
  jobChipStageOn: { color: colors.brandSage },
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
  overrideInput: {
    flex: undefined,
    minHeight: 68,
    textAlign: 'left',
    letterSpacing: 0,
    fontWeight: '500',
    fontSize: 11.5,
    paddingHorizontal: 11,
    textAlignVertical: 'top',
  },
  formNote: { fontSize: 9.5, color: colors.textSlate, lineHeight: 13.5 },

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
