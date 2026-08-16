/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  ArrowRight,
  Bell,
  Bot,
  ChevronRight,
  Clock,
  Mail,
  MapPin,
  Phone,
  Quote,
  Star,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CONTACT,
  CUSTOMER_SEGMENTS,
  HOW_IT_WORKS,
  SERVICES,
  SERVICE_CATEGORIES,
  TESTIMONIALS,
  WHY_CHOOSE_US,
  tierForPoints,
  type ClientService,
  type ServiceCategory,
} from '../../src/data/catalogue';
import { Icon } from '../../src/components/Icon';
import NotificationsSheet from '../../src/components/NotificationsSheet';
import { StageTimeline } from '../../src/components/StageTimeline';
import {
  Badge,
  Button,
  Card,
  ConnectionPill,
  IconButton,
  InitialsAvatar,
  SectionHeader,
} from '../../src/components/ui';
import { useClient } from '../../src/store/ClientStore';
import { useSession } from '../../src/store/SessionStore';
import { colors, courierName, formatCedis, radius, shadow, tints } from '../../src/theme';

/**
 * Home.
 *
 * The website's landing page is a long scroll — hero, services, why us, how it
 * works, who it's for, testimonials, contact — and all of it is here, in the
 * same order, because that sequence is the sales argument. What is added on
 * top is the part a website cannot do well: the live strip for the order
 * currently in flight, pinned above the fold.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { account, isAuthenticated } = useSession();
  const { primaryBooking, activeBookings, unreadCount, online, probed, points, refresh } = useClient();

  const [category, setCategory] = useState<ServiceCategory>('core');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const tier = useMemo(() => tierForPoints(points), [points]);

  const visibleServices = useMemo(
    () => SERVICES.filter((service) => service.category === category),
    [category]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const bookService = useCallback(
    (service?: ClientService) => {
      router.push({
        pathname: '/(tabs)/book',
        params: service ? { serviceId: service.id } : undefined,
      });
    },
    [router]
  );

  const greeting = greetingFor(new Date());
  const firstName = account?.name?.split(/\s+/)[0];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandSage} />
        }
      >
        {/* ------------------------------------------------------ top bar */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {greeting}
              {firstName ? `, ${firstName}` : ''}
            </Text>
            <View style={styles.topMeta}>
              <ConnectionPill online={online} pending={!probed} />
              {isAuthenticated && <Badge label={tier.cardName} tone="gold" />}
            </View>
          </View>

          <IconButton
            accessibilityLabel="Notifications"
            onPress={() => setNotificationsOpen(true)}
          >
            <Bell size={17} color={colors.textCharcoal} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </IconButton>

          <Pressable onPress={() => router.push('/(tabs)/account')} hitSlop={6}>
            <InitialsAvatar name={account?.name ?? 'Guest'} size={38} />
          </Pressable>
        </View>

        {/* -------------------------------------------------- active order */}
        {primaryBooking ? (
          <Pressable
            onPress={() => router.push('/(tabs)/track')}
            style={({ pressed }) => [styles.liveCard, pressed && { opacity: 0.94 }]}
          >
            <View style={styles.liveHead}>
              <View style={styles.livePulse} />
              <Text style={styles.liveLabel}>In progress</Text>
              <Text style={styles.liveRef}>{primaryBooking.id}</Text>
            </View>

            <Text style={styles.liveService} numberOfLines={1}>
              {primaryBooking.serviceType}
            </Text>

            <View style={{ marginTop: 12 }}>
              <StageTimeline
                stage={primaryBooking.status}
                dispatchStatus={primaryBooking.rider?.jobStatus}
                compact
              />
            </View>

            <View style={styles.liveFoot}>
              <Text style={styles.liveFootText}>
                {primaryBooking.rider
                  ? `${courierName(primaryBooking.rider)} · ${primaryBooking.rider.etaMinutes ?? '—'} min away`
                  : 'Assigning a courier'}
              </Text>
              <View style={styles.liveCta}>
                <Text style={styles.liveCtaLabel}>Track live</Text>
                <ArrowRight size={13} color={colors.brandSage} />
              </View>
            </View>

            {activeBookings.length > 1 && (
              <Text style={styles.liveMore}>
                +{activeBookings.length - 1} more order{activeBookings.length > 2 ? 's' : ''} running
              </Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>FreshFold Laundry Co.</Text>
            <Text style={styles.heroTitle}>
              Boutique fabric care,{'\n'}collected from your door.
            </Text>
            <Text style={styles.heroBody}>
              Hand-finished washing, pressing and specialist treatment across Kumasi — booked in a
              minute, tracked to the doorstep.
            </Text>
            <View style={styles.heroActions}>
              <Button
                label="Schedule a pickup"
                onPress={() => bookService()}
                iconRight={<ArrowRight size={15} color="#FFFFFF" />}
                style={{ flex: 1 }}
              />
              <Button
                label="Plans"
                variant="ghost"
                onPress={() => router.push('/plans')}
              />
            </View>
          </View>
        )}

        {/* ------------------------------------------------ quick actions */}
        <View style={styles.quickRow}>
          <QuickAction
            label="Book"
            iconName="CalendarClock"
            onPress={() => bookService()}
          />
          <QuickAction label="Track" iconName="Radar" onPress={() => router.push('/(tabs)/track')} />
          <QuickAction
            label="Wallet"
            iconName="Wallet"
            onPress={() => router.push('/(tabs)/wallet')}
          />
          <QuickAction label="Foldie" iconName="Sparkles" onPress={() => router.push('/concierge')} />
        </View>

        {/* ------------------------------------------------------ services */}
        <View style={styles.section}>
          <SectionHeader
            title="Our services"
            caption="Priced up front. No surprises at the door."
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {SERVICE_CATEGORIES.map((entry) => {
              const active = entry.id === category;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => setCategory(entry.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                    {entry.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.categoryBlurb}>
            {SERVICE_CATEGORIES.find((entry) => entry.id === category)?.blurb}
          </Text>

          <View style={{ gap: 10, marginTop: 12 }}>
            {visibleServices.map((service) => (
              <Pressable
                key={service.id}
                onPress={() => bookService(service)}
                style={({ pressed }) => [styles.serviceCard, pressed && { opacity: 0.92 }]}
              >
                <Image source={{ uri: service.imageUrl }} style={styles.serviceImage} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.serviceName} numberOfLines={1}>
                    {service.name}
                  </Text>
                  <Text style={styles.serviceBody} numberOfLines={2}>
                    {service.description}
                  </Text>
                  <Text style={styles.servicePrice}>{service.priceInfo}</Text>
                </View>
                <ChevronRight size={15} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* -------------------------------------------------- how it works */}
        <View style={styles.section}>
          <SectionHeader title="How it works" caption="Four steps, start to closet." />
          <View style={{ gap: 9 }}>
            {HOW_IT_WORKS.map((step, index) => (
              <View key={step.id} style={styles.stepCard}>
                <View style={styles.stepIndex}>
                  <Text style={styles.stepIndexLabel}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepBody}>{step.body}</Text>
                </View>
                <Icon name={step.iconName} size={17} color={colors.brandStone} />
              </View>
            ))}
          </View>
        </View>

        {/* ------------------------------------------------------- why us */}
        <View style={styles.section}>
          <SectionHeader title="Why FreshFold" caption="What you get that a laundrette doesn’t." />
          <View style={styles.grid}>
            {WHY_CHOOSE_US.map((reason) => (
              <Card key={reason.id} style={styles.gridCard}>
                <View style={styles.gridIcon}>
                  <Icon name={reason.iconName} size={16} color={colors.brandSage} />
                </View>
                <Text style={styles.gridTitle}>{reason.title}</Text>
                <Text style={styles.gridBody}>{reason.body}</Text>
              </Card>
            ))}
          </View>
        </View>

        {/* ----------------------------------------------------- segments */}
        <View style={styles.section}>
          <SectionHeader title="Built for" caption="Tap one to start a booking shaped around it." />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingRight: 20 }}
          >
            {CUSTOMER_SEGMENTS.map((segment) => (
              <Pressable
                key={segment.id}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/book',
                    params: { serviceId: segment.serviceId },
                  })
                }
                style={({ pressed }) => [styles.segmentCard, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.segmentIcon}>
                  <Icon name={segment.iconName} size={17} color={colors.brandGold} />
                </View>
                <Text style={styles.segmentTitle}>{segment.title}</Text>
                <Text style={styles.segmentBody}>{segment.body}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* ------------------------------------------------- testimonials */}
        <View style={styles.section}>
          <SectionHeader title="From our patrons" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingRight: 20 }}
          >
            {TESTIMONIALS.map((testimonial) => (
              <Card key={testimonial.id} style={styles.testimonial}>
                <Quote size={17} color={colors.brandStone} />
                <Text style={styles.testimonialQuote}>{testimonial.quote}</Text>
                <View style={styles.testimonialFoot}>
                  <Image source={{ uri: testimonial.avatarUrl }} style={styles.testimonialAvatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.testimonialName}>{testimonial.name}</Text>
                    <Text style={styles.testimonialRole} numberOfLines={1}>
                      {testimonial.role}
                    </Text>
                  </View>
                </View>
                <View style={styles.stars}>
                  {Array.from({ length: testimonial.rating }).map((_, index) => (
                    <Star key={index} size={11} color={colors.brandGold} fill={colors.brandGold} />
                  ))}
                </View>
              </Card>
            ))}
          </ScrollView>
        </View>

        {/* ------------------------------------------------------ contact */}
        <View style={styles.section}>
          <SectionHeader title="Talk to us" caption="A person, not a form." />
          <Card style={{ gap: 4 }}>
            <ContactRow
              icon={<Phone size={15} color={colors.brandSage} />}
              label={CONTACT.phone}
              caption="Call the concierge desk"
              onPress={() => Linking.openURL(`tel:${CONTACT.phone.replace(/\s/g, '')}`)}
            />
            {/* WhatsApp row hidden for now. */}
            <ContactRow
              icon={<Bot size={15} color={colors.brandSage} />}
              label="Ask Foldie"
              caption="Our concierge assistant, in-app"
              onPress={() => router.push('/concierge')}
            />
            <ContactRow
              icon={<Mail size={15} color={colors.brandSage} />}
              label={CONTACT.email}
              caption="For contracts and invoicing"
              onPress={() => Linking.openURL(`mailto:${CONTACT.email}`)}
            />
            <ContactRow
              icon={<MapPin size={15} color={colors.brandSage} />}
              label={CONTACT.address}
              caption="Where your garments are cared for"
            />
            <ContactRow
              icon={<Clock size={15} color={colors.brandSage} />}
              label={CONTACT.hours}
              caption="Collection windows run to close"
            />
          </Card>
        </View>

        <Text style={styles.footer}>
          FreshFold Laundry Co. · Bomso Junction, Kumasi{'\n'}Every order priced before you confirm.
        </Text>
      </ScrollView>

      <NotificationsSheet
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </SafeAreaView>
  );
}

function QuickAction({
  label,
  iconName,
  onPress,
}: {
  label: string;
  iconName: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.quickIcon}>
        <Icon name={iconName} size={17} color={colors.brandSage} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function ContactRow({
  icon,
  label,
  caption,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  caption: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.contactRow, pressed && onPress && { opacity: 0.75 }]}
    >
      <View style={styles.contactIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.contactLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.contactCaption}>{caption}</Text>
      </View>
      {!!onPress && <ChevronRight size={14} color={colors.textMuted} />}
    </Pressable>
  );
}

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory },
  scroll: { padding: 20, paddingBottom: 40, gap: 4 },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  greeting: { fontSize: 19, fontWeight: '800', color: colors.textCharcoal, letterSpacing: -0.4 },
  topMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brandGold,
    borderWidth: 1.5,
    borderColor: colors.bgLinen,
  },

  hero: {
    backgroundColor: colors.textCharcoal,
    borderRadius: radius.xxl,
    padding: 22,
    gap: 8,
    ...shadow.md,
  },
  heroEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.brandGold,
  },
  heroTitle: {
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.7,
    color: '#FFFFFF',
    lineHeight: 31,
  },
  heroBody: { fontSize: 12.5, color: 'rgba(255,255,255,0.7)', lineHeight: 18 },
  heroActions: { flexDirection: 'row', gap: 9, marginTop: 8 },

  liveCard: {
    backgroundColor: colors.cardPure,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: tints.sage25,
    padding: 18,
    ...shadow.md,
  },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  livePulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.statusSuccess },
  liveLabel: {
    flex: 1,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.statusSuccess,
  },
  liveRef: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted },
  liveService: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textCharcoal,
    marginTop: 8,
    letterSpacing: -0.3,
  },
  liveFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  liveFootText: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.textSlate },
  liveCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveCtaLabel: { fontSize: 11, fontWeight: '800', color: colors.brandSage },
  liveMore: { fontSize: 10, color: colors.textMuted, marginTop: 8 },

  quickRow: { flexDirection: 'row', gap: 9, marginTop: 16 },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.cardPure,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    ...shadow.xs,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: tints.sage08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 10, fontWeight: '700', color: colors.textCharcoal },

  section: { marginTop: 30 },

  chipRow: { gap: 7, paddingRight: 20 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.bgLinen,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  chipActive: { backgroundColor: colors.brandSage, borderColor: colors.brandSage },
  chipLabel: { fontSize: 11, fontWeight: '700', color: colors.textSlate },
  chipLabelActive: { color: '#FFFFFF' },
  categoryBlurb: { fontSize: 11, color: colors.textMuted, marginTop: 10 },

  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.cardPure,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 11,
    ...shadow.xs,
  },
  serviceImage: { width: 58, height: 58, borderRadius: radius.md, backgroundColor: colors.bgSand },
  serviceName: { fontSize: 12.5, fontWeight: '800', color: colors.textCharcoal },
  serviceBody: { fontSize: 10.5, color: colors.textSlate, lineHeight: 14.5 },
  servicePrice: { fontSize: 10.5, fontWeight: '800', color: colors.brandSage, marginTop: 1 },

  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.cardPure,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 13,
  },
  stepIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: tints.sage12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexLabel: { fontSize: 11, fontWeight: '800', color: colors.brandSage },
  stepTitle: { fontSize: 12.5, fontWeight: '800', color: colors.textCharcoal },
  stepBody: { fontSize: 10.5, color: colors.textSlate, marginTop: 2, lineHeight: 14.5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: { width: '48%', gap: 6, padding: 14 },
  gridIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: tints.sage08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTitle: { fontSize: 12, fontWeight: '800', color: colors.textCharcoal, marginTop: 2 },
  gridBody: { fontSize: 10.5, color: colors.textSlate, lineHeight: 14.5 },

  segmentCard: {
    width: 190,
    gap: 6,
    padding: 15,
    borderRadius: radius.xl,
    backgroundColor: colors.cardPure,
    borderWidth: 1,
    borderColor: tints.gold35,
    ...shadow.xs,
  },
  segmentIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: tints.gold08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTitle: { fontSize: 12.5, fontWeight: '800', color: colors.textCharcoal, marginTop: 2 },
  segmentBody: { fontSize: 10.5, color: colors.textSlate, lineHeight: 14.5 },

  testimonial: { width: 250, gap: 9 },
  testimonialQuote: { fontSize: 11.5, color: colors.textCharcoal, lineHeight: 17 },
  testimonialFoot: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  testimonialAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgSand },
  testimonialName: { fontSize: 11.5, fontWeight: '800', color: colors.textCharcoal },
  testimonialRole: { fontSize: 9.5, color: colors.textMuted },
  stars: { flexDirection: 'row', gap: 2 },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  contactIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: tints.sage08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: { fontSize: 12, fontWeight: '700', color: colors.textCharcoal },
  contactCaption: { fontSize: 10, color: colors.textMuted, marginTop: 1 },

  footer: {
    fontSize: 9.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 34,
    lineHeight: 15,
  },
});
