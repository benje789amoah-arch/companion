/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The website's domain types now live in `@freshfold/core`, shared with the
 * dispatch server and the rider app so a `Booking` here and an `Order` there
 * are provably two views of one record.
 *
 * This file stays as a re-export so existing `from './types'` imports keep
 * working; new code can import from `@freshfold/core` directly.
 */

export type {
  Booking,
  BookingRiderView,
  BookingStatus,
  Coords,
  JobStatus,
  LoyaltyTier,
  MomoNetwork,
  PaymentStatus,
  PaymentTransaction,
  ServiceItem,
  StatItem,
  SubscriptionPlan,
  Testimonial,
  UserAccount,
} from '@freshfold/core';
