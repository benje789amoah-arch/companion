/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The desk's inbox.
 *
 * There was no desk. A courier writing to dispatch from the companion app got an
 * answer three seconds later, composed on their own phone by a `setTimeout` that
 * picked one of four sentences — "Copy that. Operational details synchronized
 * with the Admin Dashboard." — under a comment saying it was there so the console
 * would feel staffed. It was worse than a placeholder: `postMessage` sends no
 * `sender` and the server derives one from the token, so that reply was filed as
 * the *courier's own words* and the customer read it in their portal attributed
 * to the person carrying their laundry.
 *
 * This is the other half of deleting it, and it needed no new server route. A
 * supervisor-scoped `GET /messages` answering every thread, and `senderFor`
 * stamping anything written with a desk token as `dispatcher`, were both already
 * written and called by nobody. A reply typed here is the same POST the customer
 * and the courier make; it carries the desk's voice because of who holds the
 * token, not because it claims to.
 *
 * Two things this pane deliberately does not claim.
 *
 * **There is no unread count.** `Message` has no read state — no column, no
 * field — so any number would be invented, which is the failure being repaired.
 * What it shows instead is who spoke last in each thread, which is a fact about
 * the rows themselves.
 *
 * **"The desk spoke last" includes the server talking.** Status narration is
 * filed as `dispatcher` as well (`STATUS_SCRIPT` in `routes/orders.ts`), so a job
 * advancing a stage looks from here like somebody answered. Telling those apart
 * needs a sender the ledger does not have; until it does, this pane reports the
 * senders it can see rather than inferring who is owed a reply.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, MessageSquare, RefreshCw, Send } from 'lucide-react';
import type { Message } from '@freshfold/core';
import type { Booking } from '../../types';
import * as store from '../../services/store';
import { Badge, Button, EmptyState, Panel, TableHead, type Tone } from './ui';

/**
 * Who a message is from, in the desk's vocabulary rather than the customer's.
 * `ClientPortal` labels the same four senders for the other end of the thread —
 * "Your Courier", "Dispatch Desk" — and the difference is the point: each party
 * sees the conversation from where they are standing in it.
 */
const SENDER_LABELS: Record<Message['sender'], string> = {
  customer: 'Customer',
  rider: 'Courier',
  dispatcher: 'This desk',
  laundry_center: 'Hub',
};

const SENDER_TONES: Record<Message['sender'], Tone> = {
  customer: 'accent',
  rider: 'info',
  dispatcher: 'neutral',
  laundry_center: 'ok',
};

const COLS_MD =
  'md:grid-cols-[124px_minmax(140px,1.1fr)_minmax(200px,2fr)_minmax(150px,1fr)_40px] md:items-center md:gap-3';

const ROW_GRID = `grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:grid ${COLS_MD}`;

/** A voice from outside the desk. */
function isInbound(message: Message): boolean {
  return message.sender === 'customer' || message.sender === 'rider';
}

/**
 * One job's conversation.
 *
 * `messages` holds the order the server sent, which is the order they were
 * written. A `Message` timestamp is a wall-clock label like "14:20" — the
 * server's locale, no date — so it cannot be parsed and must not be sorted by.
 * Position in the array is the only sequence there is.
 */
export interface Thread {
  /** The job, or `null` for rows that predate messages having to name one. */
  orderId: string | null;
  messages: Message[];
  last: Message;
}

/**
 * Threads, with the ones a counterparty spoke into last ahead of the rest, and
 * newest activity first within each half.
 */
export function groupThreads(messages: Message[]): Thread[] {
  const byOrder = new Map<string, Message[]>();
  const loose: Message[] = [];

  messages.forEach((message) => {
    if (!message.orderId) {
      loose.push(message);
      return;
    }
    const existing = byOrder.get(message.orderId);
    if (existing) existing.push(message);
    else byOrder.set(message.orderId, [message]);
  });

  const threads: Thread[] = [...byOrder.entries()].map(([orderId, thread]) => ({
    orderId,
    messages: thread,
    last: thread[thread.length - 1],
  }));

  if (loose.length > 0) {
    threads.push({ orderId: null, messages: loose, last: loose[loose.length - 1] });
  }

  // Recency is where a thread's last message sits in the page the server
  // answered, for the reason given on `Thread` above.
  const written = new Map(messages.map((message, index) => [message.id, index]));

  return threads.sort((a, b) => {
    const waiting = Number(isInbound(b.last)) - Number(isInbound(a.last));
    if (waiting !== 0) return waiting;
    return (written.get(b.last.id) ?? 0) - (written.get(a.last.id) ?? 0);
  });
}

/**
 * How many threads a customer or a courier spoke into last.
 *
 * The figure beside the tab in the dashboard rail. Not an unread count, and not
 * a count of unanswered questions — see the note at the top of this file — but a
 * true statement about the page the server answered.
 */
export function inboundThreadCount(messages: Message[]): number {
  return groupThreads(messages).filter((thread) => isInbound(thread.last)).length;
}

export default function MessagesPanel({
  messages,
  error,
  loading,
  bookings,
  onRefresh,
  onReplied,
}: {
  /** Every thread the desk can see, in the order the rows were written. */
  messages: Message[];
  /** Why the inbox could not be read, when that is why it looks empty. */
  error: string | null;
  loading: boolean;
  /** The ledger mirror, for putting a name against a job id. */
  bookings: Booking[];
  onRefresh: () => void;
  /**
   * Called once the server has accepted a reply, with a sentence for the flash
   * strip. The dashboard also uses it to re-read the inbox — this pane keeps no
   * copy of the thread it just wrote into.
   */
  onReplied: (message: string) => void;
}) {
  const threads = useMemo(() => groupThreads(messages), [messages]);

  /** The thread that is open, by job id — `''` for the orderless group. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // A half-typed reply belongs to the thread it was being typed into.
  useEffect(() => {
    setDraft('');
    setSendError(null);
  }, [openId]);

  /** Job id to the customer behind it, for the rows. */
  const customers = useMemo(
    () => new Map(bookings.map((booking) => [booking.id, booking])),
    [bookings],
  );

  /**
   * Sends the reply, as the desk.
   *
   * Nothing is rendered locally first, for `HubPanel`'s reason: a customer is
   * about to read this, and a bubble that appeared because a request was *sent*
   * would be the canned dispatcher all over again. No `sender` is passed — the
   * server stamps it from the token and ignores one in the body.
   */
  const send = async (orderId: string): Promise<void> => {
    const text = draft.trim();
    if (!text) return;

    const token = store.readAdminToken();
    if (!token) {
      setSendError('This desk is not signed in, so nothing was sent.');
      return;
    }

    setSending(true);
    try {
      await store.api.postMessage({ text, orderId }, { token });
      setDraft('');
      setSendError(null);
      onReplied(`${orderId} — replied`);
    } catch (e) {
      setSendError(
        e instanceof Error ? e.message : 'The reply was not sent. Nobody has read it.',
      );
    } finally {
      setSending(false);
    }
  };

  const waiting = threads.filter((thread) => isInbound(thread.last)).length;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-admin-danger/25 bg-admin-danger/10 px-4 py-3">
          <p className="text-[12px] leading-relaxed text-admin-danger">{error}</p>
          <Button size="sm" icon={RefreshCw} onClick={onRefresh}>
            Try again
          </Button>
        </div>
      )}

      <Panel
        title={
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-admin-fg-3" />
            Inbox
          </span>
        }
        description="Every thread on the board. A reply here reaches the customer's portal and the courier's app as Dispatch."
        actions={
          <>
            {waiting > 0 && (
              <Badge tone="warn" dot>
                {waiting} spoke last
              </Badge>
            )}
            <Badge mono>
              {threads.length} thread{threads.length === 1 ? '' : 's'}
            </Badge>
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={onRefresh}>
              Refresh
            </Button>
          </>
        }
      >
        {threads.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={loading ? 'Reading the board’s threads…' : 'No messages on the board'}
            detail={
              loading
                ? undefined
                : 'A thread appears here as soon as a customer or a courier writes into one — and as soon as a job advances a stage, which the server narrates into the same thread.'
            }
          />
        ) : (
          <div>
            <TableHead
              className={COLS_MD}
              columns={[
                { label: 'Order' },
                { label: 'Customer' },
                { label: 'Last message' },
                { label: 'Last in' },
                { label: '', className: 'text-right' },
              ]}
            />

            <div className="divide-y divide-admin-line">
              {threads.map((thread) => {
                const key = thread.orderId ?? '';
                const isOpen = openId === key;
                const booking = thread.orderId ? customers.get(thread.orderId) : undefined;

                return (
                  <div key={key} className={isOpen ? 'bg-admin-raised/60' : ''}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId(isOpen ? null : key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpenId(isOpen ? null : key);
                        }
                      }}
                      className={`cursor-pointer px-5 py-3 transition-colors hover:bg-white/[0.02] ${ROW_GRID}`}
                    >
                      <span className="order-1 font-mono text-[12px] font-medium tabular-nums text-admin-accent md:order-none">
                        {thread.orderId ?? 'No order'}
                      </span>

                      <div className="order-3 col-span-2 min-w-0 md:order-none md:col-span-1">
                        {/*
                          The name comes from the ledger mirror, not the message.
                          A thread outlives the order it belongs to — deleting a
                          booking leaves its messages behind — so this falls back
                          to saying so rather than rendering a blank row.
                        */}
                        <span className="block truncate text-[13px] font-medium text-admin-fg">
                          {booking?.name ??
                            (thread.orderId ? 'Order no longer on the board' : '—')}
                        </span>
                        <span className="block truncate text-[11px] text-admin-fg-3">
                          {booking?.suburb ??
                            `${thread.messages.length} message${
                              thread.messages.length === 1 ? '' : 's'
                            }`}
                        </span>
                      </div>

                      <span className="order-4 col-span-2 block truncate text-[12px] text-admin-fg-2 md:order-none md:col-span-1">
                        {thread.last.text}
                      </span>

                      <div className="order-2 justify-self-end md:order-none md:justify-self-start">
                        <Badge tone={SENDER_TONES[thread.last.sender]}>
                          {SENDER_LABELS[thread.last.sender]} · {thread.last.timestamp}
                        </Badge>
                      </div>

                      <div className="order-5 justify-self-end md:order-none">
                        <ChevronRight
                          className={`h-4 w-4 text-admin-fg-3 transition-transform ${
                            isOpen ? 'rotate-90' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {isOpen && (
                      <div className="space-y-3 border-t border-admin-line px-5 py-4">
                        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                          {thread.messages.map((message) => (
                            <div
                              key={message.id}
                              className="rounded-xl border border-admin-line bg-admin-panel px-3.5 py-2.5"
                            >
                              <div className="mb-1 flex items-center gap-2">
                                <Badge tone={SENDER_TONES[message.sender]}>
                                  {SENDER_LABELS[message.sender]}
                                </Badge>
                                <span className="font-mono text-[10px] tabular-nums text-admin-fg-3">
                                  {message.timestamp}
                                </span>
                              </div>
                              <p className="text-[13px] leading-relaxed text-admin-fg-2">
                                {message.text}
                              </p>
                            </div>
                          ))}
                        </div>

                        {thread.orderId ? (
                          <div className="space-y-2">
                            <textarea
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                // Enter sends, shift+Enter breaks the line. The
                                // desk is typing one sentence to a courier, not
                                // drafting a paragraph.
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  void send(thread.orderId as string);
                                }
                              }}
                              rows={2}
                              placeholder={`Reply to ${booking?.name ?? thread.orderId} as Dispatch…`}
                              className="w-full resize-y rounded-xl border border-admin-line bg-admin-raised px-3.5 py-2.5 text-[13px] text-admin-fg placeholder:text-admin-fg-3 transition-colors focus:border-admin-accent/60 focus:outline-none focus:ring-2 focus:ring-admin-accent/15"
                            />

                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] text-admin-fg-3">
                                Sent as <span className="text-admin-fg-2">Dispatch Desk</span>, to
                                the customer and the courier on this job.
                              </p>
                              <Button
                                size="sm"
                                variant="primary"
                                icon={Send}
                                disabled={sending || draft.trim() === ''}
                                onClick={() => void send(thread.orderId as string)}
                              >
                                {sending ? 'Sending…' : 'Send'}
                              </Button>
                            </div>

                            {sendError && (
                              <p className="text-[11px] leading-relaxed text-admin-danger">
                                {sendError}
                              </p>
                            )}
                          </div>
                        ) : (
                          /*
                            No composer. A message belongs to a job — the server
                            rejects a POST without one — so these rows can be read
                            but not answered. They are the ones written before
                            that rule existed.
                          */
                          <p className="text-[11px] leading-relaxed text-admin-fg-3">
                            These messages name no order, so there is no thread to reply into.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
