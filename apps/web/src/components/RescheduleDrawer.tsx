import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarClock, X } from 'lucide-react';
import {
  DELIVERY_TIME_SLOTS,
  MAX_RESCHEDULES,
  PICKUP_TIME_SLOTS,
  deliverySlotsFor,
  isoPlusDays,
  todayIso,
  type Booking,
} from '@freshfold/core';
import * as store from '../services/store';

/**
 * Moving a booking that is already on the board.
 *
 * The alternative until this existed was cancel and rebook, which cost the
 * customer their reference, their three hand-off codes and — if they had paid —
 * a trip through the refund flow to come back as a new order. Nothing here
 * reprices: the same order moves, and the total on the receipt does not change.
 *
 * The rules are core's `checkReschedule`, and the server runs them again on a
 * locked row. This drawer shows them early so the customer is not walked into a
 * refusal; when the two disagree the server wins, and the sentence it wrote is
 * what appears under the buttons.
 */

interface RescheduleDrawerProps {
  booking: Booking;
  onClose: () => void;
  onMoved?: (booking: Booking) => void;
}

/** How many days the strip offers. The server's horizon is 30. */
const DAYS = 14;

type Windows = Record<string, { remaining: number; full: boolean }>;

export default function RescheduleDrawer({ booking, onClose, onMoved }: RescheduleDrawerProps) {
  const [pickupDate, setPickupDate] = useState(booking.pickupDate);
  const [pickupTime, setPickupTime] = useState(booking.pickupTime || PICKUP_TIME_SLOTS[0]);
  const [deliveryTime, setDeliveryTime] = useState(booking.deliveryTime || DELIVERY_TIME_SLOTS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const deliveryDate = useMemo(() => isoPlusDays(pickupDate, 1) ?? pickupDate, [pickupDate]);

  const returnOptions = useMemo(
    () => deliverySlotsFor(pickupDate, pickupTime, deliveryDate),
    [pickupDate, pickupTime, deliveryDate]
  );

  /**
   * The next fortnight, starting today.
   *
   * Today is on it because the cut-off rather than the calendar is what rules
   * out a same-day move — at 9am this evening's window is still bookable, and a
   * strip starting tomorrow would hide a slot the server would accept.
   */
  const days = useMemo(() => {
    const first = todayIso();
    return Array.from({ length: DAYS }, (_, index) => isoPlusDays(first, index) ?? first);
  }, []);

  const [slots, setSlots] = useState<Windows>({});
  const [returns, setReturns] = useState<Windows>({});

  useEffect(() => {
    let cancelled = false;

    store.api
      // `exclude` is this booking, so the window it already holds is not counted
      // against itself — otherwise a customer on a nearly-full morning sees
      // their own collection listed as unavailable.
      .slotAvailability(pickupDate, { deliveryDate, exclude: booking.id })
      .then((answer) => {
        if (cancelled) return;

        const next: Windows = {};
        for (const row of answer.slots) next[row.slot] = { remaining: row.remaining, full: row.full };
        setSlots(next);

        const back: Windows = {};
        for (const row of answer.deliverySlots ?? []) {
          back[row.slot] = { remaining: row.remaining, full: row.full };
        }
        setReturns(back);
      })
      .catch(() => {
        // Optimistic on failure, like the booking form: an unreachable server
        // should not grey out every window and make the drawer look broken.
        if (cancelled) return;
        setSlots({});
        setReturns({});
      });

    return () => {
      cancelled = true;
    };
  }, [pickupDate, deliveryDate, booking.id]);

  // Follow the collection when the return it had stops being reachable.
  useEffect(() => {
    const reachable = returnOptions.some((slot) => slot.label === deliveryTime);
    if (reachable && !returns[deliveryTime]?.full) return;

    const open = returnOptions.find((slot) => !returns[slot.label]?.full);
    if (open) setDeliveryTime(open.label);
  }, [returnOptions, returns, deliveryTime]);

  const unchanged =
    pickupDate === booking.pickupDate &&
    pickupTime === booking.pickupTime &&
    deliveryTime === (booking.deliveryTime ?? deliveryTime);

  const movesLeft = Math.max(0, MAX_RESCHEDULES - (booking.rescheduleCount ?? 0));

  const submit = async () => {
    setBusy(true);
    setError('');

    try {
      const moved = await store.rescheduleBooking(booking.id, {
        pickupDate,
        pickupTime,
        // Left off when the collection leaves no room for one, rather than sent
        // and refused — losing the whole move over the return window would be
        // the wrong trade.
        deliveryTime: returnOptions.some((slot) => slot.label === deliveryTime)
          ? deliveryTime
          : undefined,
      });

      onMoved?.(moved);
      onClose();
    } catch (failure) {
      // The server writes these for the customer — "that window filled up",
      // "your courier is already on the way" — so they are shown as they arrive.
      setError(
        failure instanceof Error && failure.message
          ? failure.message
          : 'That could not be moved just now. Try again.'
      );
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="bg-[#181818] border border-brand-sage/40 rounded-2xl max-w-md w-full p-6 text-left space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-white cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-brand-sage" />
            <h4 className="font-serif text-lg text-white font-medium">Move this pickup</h4>
          </div>
          <p className="font-sans text-[11px] font-light text-[#8E9299] leading-relaxed">
            {movesLeft <= 1
              ? 'This is the last time this booking can be moved. After that, cancel and rebook.'
              : `You can move this booking ${movesLeft} more times.`}{' '}
            Nothing is repriced — same order, same total, same reference {booking.id}.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider">
            New collection date
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {days.map((day) => {
              const date = new Date(`${day}T00:00:00Z`);
              const active = day === pickupDate;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setPickupDate(day)}
                  className={`shrink-0 px-3 py-2 rounded-xl border text-center transition-all cursor-pointer ${
                    active
                      ? 'bg-brand-sage border-brand-sage text-white'
                      : 'bg-black/40 border-white/10 text-stone-400 hover:text-white'
                  }`}
                >
                  <span className="block font-mono text-[8px] uppercase tracking-widest">
                    {date.toLocaleDateString('en-GH', { weekday: 'short', timeZone: 'UTC' })}
                  </span>
                  <span className="block text-sm font-bold">{date.getUTCDate()}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider">
            Collection window
          </label>
          <select
            value={pickupTime}
            onChange={(e) => setPickupTime(e.target.value)}
            className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs"
          >
            {PICKUP_TIME_SLOTS.map((slot) => {
              const state = slots[slot];
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

        <div className="space-y-2">
          <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider">
            Return window
            <span className="ml-2 normal-case font-normal tracking-normal text-stone-500">
              back to you on {deliveryDate}
            </span>
          </label>
          <select
            value={deliveryTime}
            onChange={(e) => setDeliveryTime(e.target.value)}
            className="w-full bg-[#161616] text-white rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs"
          >
            {DELIVERY_TIME_SLOTS.map((slot) => {
              const state = returns[slot];
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

        {!!error && (
          <p className="text-[11px] font-sans leading-relaxed text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            {error}
          </p>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={submit}
            disabled={busy || unchanged}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold font-sans uppercase tracking-widest transition-all ${
              busy || unchanged
                ? 'bg-white/10 text-stone-500 cursor-not-allowed'
                : 'bg-brand-sage text-white hover:bg-brand-sage-light cursor-pointer'
            }`}
          >
            {busy ? 'Moving…' : 'Move pickup'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 rounded-xl text-[10px] font-bold font-sans uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            Keep it
          </button>
        </div>
      </div>
    </motion.div>
  );
}
