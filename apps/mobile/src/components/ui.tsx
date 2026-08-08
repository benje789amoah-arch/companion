/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { DEFAULT_AVATAR, colors, radius, shadow, tints } from '../theme';

/* ------------------------------------------------------------------ layout */

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

/* ----------------------------------------------------------------- buttons */

type ButtonVariant = 'primary' | 'gold' | 'outline' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  textStyle,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        buttonVariants[variant].container,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={buttonVariants[variant].label.color} />
      ) : (
        <>
          {icon}
          <Text style={[styles.buttonLabel, buttonVariants[variant].label, textStyle]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ badges */

export function Badge({
  label,
  tone = 'sage',
  style,
}: {
  label: string;
  tone?: 'sage' | 'gold' | 'success' | 'muted' | 'error';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.badge, badgeTones[tone].container, style]}>
      <Text style={[styles.badgeLabel, badgeTones[tone].label]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ avatar */

export function Avatar({
  uri,
  size = 40,
  style,
}: {
  uri?: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={{ uri: uri || DEFAULT_AVATAR }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: colors.brandSage,
          backgroundColor: colors.bgLinen,
        },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------- empty state */

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card style={styles.emptyState}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </Card>
  );
}

/* ------------------------------------------------------------------ styles */

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardPure,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
    ...shadow.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  badgeLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textCharcoal,
  },
  emptyBody: {
    fontSize: 11,
    color: colors.textSlate,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});

const buttonVariants: Record<ButtonVariant, { container: ViewStyle; label: TextStyle }> = {
  primary: {
    container: { backgroundColor: colors.brandSage, borderColor: colors.brandSage },
    label: { color: '#FFFFFF' },
  },
  gold: {
    container: { backgroundColor: colors.brandGold, borderColor: colors.brandGold },
    label: { color: '#FFFFFF' },
  },
  outline: {
    container: { backgroundColor: 'transparent', borderColor: colors.brandSage },
    label: { color: colors.brandSage },
  },
  ghost: {
    container: { backgroundColor: colors.bgLinen, borderColor: colors.borderSoft },
    label: { color: colors.textCharcoal },
  },
  danger: {
    container: { backgroundColor: 'transparent', borderColor: tints.error30 },
    label: { color: colors.statusError },
  },
};

const badgeTones: Record<string, { container: ViewStyle; label: TextStyle }> = {
  sage: { container: { backgroundColor: tints.sage15 }, label: { color: colors.brandSage } },
  gold: { container: { backgroundColor: tints.gold15 }, label: { color: colors.brandGold } },
  success: {
    container: { backgroundColor: tints.success10 },
    label: { color: colors.statusSuccess },
  },
  muted: {
    container: { backgroundColor: tints.stone30 },
    label: { color: colors.textSlate },
  },
  error: {
    container: { backgroundColor: tints.error05 },
    label: { color: colors.statusError },
  },
};
