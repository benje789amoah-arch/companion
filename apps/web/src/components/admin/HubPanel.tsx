/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The hub console.
 *
 * The two stages between the courier's drop-off and the courier's return — the
 * wash and the press-and-fold — used to advance on a timer. Two minutes in
 * `apps/server/src/hub.ts`, and each expiry fired the real customer message and
 * the real timeline entry: "Your laundry is being pressed", on the evidence that
 * a clock had passed a number. Nothing in the system recorded that a garment had
 * been washed, because nothing in the system knew.
 *
 * This is where somebody says so. Two lists and two buttons, and pressing one is
 * a claim a named supervisor is making — it goes through the same
 * `PATCH /orders/:id/status` a courier's tap uses, so the customer sees exactly
 * what the timer used to produce, and the audit trail records who confirmed it.
 *
 * It reads **orders** rather than the booking mirror the rest of this dashboard
 * uses. A `Booking` is the customer's view and carries no bags, no bag count and
 * no hub deadline; the `Order` projection carries all three plus the exact
 * dispatch status. The person confirming a wash needs the bag labels in front of
 * them, which is the whole argument.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  PackageCheck,
  RefreshCw,
  Shirt,
  Sparkles,
  WashingMachine,
} from 'lucide-react';
import type { JobStatus, Order } from '@freshfold/core';
import * as store from '../../services/store';
import CheckInDrawer from './CheckInDrawer';
import { Badge, Button, EmptyState, Input, Panel, TableHead } from './ui';

/** The two stages this pane owns, and what confirming one means. */
const SECTIONS: {
  /** Where the load is now. */
  from: JobStatus;
  /** Where confirming puts it. */
  to: JobStatus;
  title: string;
  description: string;
  /** What the supervisor is attesting to when they press it. */
  cta: string;
  icon: typeof WashingMachine;
  emptyTitle: string;
  emptyDetail: string;
}[] = [
  {
    from: 'dropped_off',
    to: 'processing',
    title: 'Awaiting wash',
    description: 'Checked in at the hub. Confirm once the load is out of the machine.',
    cta: 'Washed',
    icon: WashingMachine,
    emptyTitle: 'Nothing waiting to be washed',
    emptyDetail: 'Loads appear here when a courier checks them in at the hub desk.',
  },
  {
    from: 'processing',
    to: 'ready_for_delivery',
    title: 'Awaiting press & fold',
    description:
      'Washed and confirmed. Confirming this tells the courier there is a delivery waiting.',
    cta: 'Finished & folded',
    icon: Shirt,
    emptyTitle: 'Nothing on the press table',
    emptyDetail: 'Loads appear here once somebody has confirmed the wash above.',
  },
];

const COLS_MD =
  'md:grid-cols-[112px_minmax(150px,1.4fr)_minmax(140px,1.2fr)_minmax(90px,0.7fr)_minmax(120px,1fr)_150px] md:items-center md:gap-3';

const ROW_GRID = `grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:grid ${COLS_MD}`;

/** "14:20, 19 Aug" — a hub deadline is a time first and a date second. */
function shortWhen(iso: string | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });
}

/** "3 bags · 12 items", or the bag types when there are few enough to name. */
function bagSummary(order: Order): string {
  const bags = order.bags ?? [];
  if (bags.length === 0) {
    return order.bagCount === 1 ? '1 bag' : `${order.bagCount} bags`;
  }

  const items = bags.reduce((sum, bag) => sum + (bag.itemCount || 0), 0);
  const count = `${bags.length} bag${bags.length === 1 ? '' : 's'}`;
  return items > 0 ? `${count} · ${items} item${items === 1 ? '' : 's'}` : count;
}

/** How many of this order's bags somebody has actually counted. */
function countedBags(order: Order): number {
  return (order.bags ?? []).filter((bag) => bag.itemCount !== undefined).length;
}

export default function HubPanel({
  onConfirmed,
}: {
  /**
   * Called after the server accepts a confirmation, with a sentence for the
   * dashboard's flash strip. The dashboard also uses it to refresh the booking
   * mirror and the audit trail — this pane does not reach for either.
   */
  onConfirmed: (message: string) => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** The order id currently in flight, so its button can say so. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** The order whose check-in drawer is open, if any. */
  const [checkingIn, setCheckingIn] = useState<Order | null>(null);

  /**
   * The machine and batch this operator is working through, per stage.
   *
   * Set once at the top of a section rather than per row, because that is how
   * the work goes: somebody loads Washer 3 with four customers' bags and then
   * confirms all four. Typing the same machine four times is how the field ends
   * up empty by the second week.
   *
   * Carried into every confirmation made while it is filled in, which is what
   * makes `hub_events` able to answer "everything that went through Washer 3 on
   * Tuesday" — the query you run when three customers report the same
   * discolouration.
   */
  const [machine, setMachine] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState<Record<string, string>>({});

  const load = useCallback(async (): Promise<void> => {
    const token = store.readAdminToken();
    if (!token) {
      setError('This desk is not signed in.');
      setLoading(false);
      return;
    }

    try {
      const all = await store.api.listOrders(token);
      // Filtered here rather than server-side: `GET /orders` with a desk token
      // answers the whole board, which the Pipeline pane also wants, and two
      // stages' worth of jobs is not a payload worth a second route.
      setOrders(all.filter((o) => o.status === 'dropped_off' || o.status === 'processing'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The hub board could not be read.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Confirms one stage.
   *
   * Nothing is written locally first. Every other handler on this desk mirrors
   * optimistically and syncs later, which is right for a filter or a note and
   * wrong for this: the customer is told their laundry is pressed the moment the
   * server accepts it, and a row that moved on screen because a request was
   * *sent* would be the timer's problem all over again.
   */
  const confirm = async (order: Order, to: JobStatus, label: string): Promise<void> => {
    const token = store.readAdminToken();
    if (!token) {
      setError('This desk is not signed in.');
      return;
    }

    setConfirming(order.id);
    try {
      await store.api.updateOrderStatus(
        order.id,
        {
          status: to,
          // Recorded in `hub_events` beside the audit line. The trail answers
          // who confirmed the wash; this answers what washed it.
          hub: { machine: machine[to]?.trim(), batch: batch[to]?.trim() },
        },
        { token },
      );
      await load();
      // The Pipeline pane reads the booking mirror, not this board, so it needs
      // the pull to follow the row across.
      void store.pull();
      onConfirmed(`${order.orderNumber} — ${label.toLowerCase()}, confirmed`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `${order.orderNumber} could not be moved. It is still where it was.`,
      );
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-admin-danger/25 bg-admin-danger/10 px-4 py-3">
          <p className="text-[12px] leading-relaxed text-admin-danger">{error}</p>
          <Button size="sm" icon={RefreshCw} onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {SECTIONS.map((section) => {
        const rows = orders.filter((o) => o.status === section.from);

        return (
          <Panel
            key={section.from}
            title={
              <span className="flex items-center gap-2">
                <section.icon className="h-4 w-4 text-admin-fg-3" />
                {section.title}
              </span>
            }
            description={section.description}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {/*
                  Set once for the run rather than per row: an operator loads one
                  washer with four customers' bags and confirms all four. Typing
                  the machine four times is how the field ends up empty.
                */}
                <Input
                  className="w-32"
                  placeholder={section.to === 'processing' ? 'Washer' : 'Press'}
                  value={machine[section.to] ?? ''}
                  onChange={(e) =>
                    setMachine((current) => ({ ...current, [section.to]: e.target.value }))
                  }
                />
                <Input
                  className="w-28"
                  placeholder="Batch"
                  value={batch[section.to] ?? ''}
                  onChange={(e) =>
                    setBatch((current) => ({ ...current, [section.to]: e.target.value }))
                  }
                />
                <Badge mono>
                  {rows.length} load{rows.length === 1 ? '' : 's'}
                </Badge>
              </div>
            }
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={section.icon}
                title={loading ? 'Reading the hub board…' : section.emptyTitle}
                detail={loading ? undefined : section.emptyDetail}
              />
            ) : (
              <div>
                <TableHead
                  className={COLS_MD}
                  columns={[
                    { label: 'Order' },
                    { label: 'Customer' },
                    { label: 'Service' },
                    { label: 'Load' },
                    { label: 'Due back' },
                    { label: '', className: 'text-right' },
                  ]}
                />

                <div className="divide-y divide-admin-line">
                  {rows.map((order) => (
                    <div key={order.id} className={`px-5 py-3 ${ROW_GRID}`}>
                      <span className="order-1 font-mono text-[12px] font-medium tabular-nums text-admin-accent md:order-none">
                        {order.orderNumber}
                      </span>

                      <div className="order-3 col-span-2 min-w-0 md:order-none md:col-span-1">
                        <span className="block truncate text-[13px] font-medium text-admin-fg">
                          {order.customerName}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-admin-fg-3">
                          {order.customerPhone}
                        </span>
                      </div>

                      <span className="order-4 block truncate text-[12px] text-admin-fg-2 md:order-none">
                        {order.laundryType}
                      </span>

                      <span className="order-2 block whitespace-nowrap text-right text-[12px] text-admin-fg-2 md:order-none md:text-left">
                        {bagSummary(order)}
                        {/*
                          A load nobody has counted is the one to count. Said
                          plainly rather than shown as "0 items", which is what
                          an uncounted bag would otherwise total to and is a
                          different claim entirely.
                        */}
                        {(order.bags?.length ?? 0) > 0 && countedBags(order) === 0 && (
                          <span className="block text-[10px] text-admin-warn">not counted</span>
                        )}
                      </span>

                      <div className="order-5 min-w-0 md:order-none">
                        <span className="block whitespace-nowrap font-mono text-[11px] tabular-nums text-admin-fg-2">
                          {shortWhen(order.deadline)}
                        </span>
                        {/*
                          When the courier collected it — the closest thing on
                          record to how long this load has been in the building,
                          because an `Order` carries no hub check-in stamp.
                        */}
                        <span className="block whitespace-nowrap text-[10px] text-admin-fg-3">
                          {order.pickedUpAt
                            ? `collected ${shortWhen(order.pickedUpAt)}`
                            : 'no collection time'}
                        </span>
                      </div>

                      <div className="order-6 flex justify-self-end gap-1.5 md:order-none">
                        {/*
                          Offered on the wash queue only. Counting happens once,
                          as the bags come out of the courier's hands and onto
                          the bench — by the press table the load is already
                          counted, and a second count there would be a different
                          and more useful feature than this one.
                        */}
                        {section.from === 'dropped_off' && (
                          <Button
                            size="sm"
                            icon={ClipboardList}
                            onClick={() => setCheckingIn(order)}
                          >
                            {countedBags(order) > 0 ? 'Counts' : 'Check in'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="primary"
                          icon={section.to === 'processing' ? Sparkles : PackageCheck}
                          disabled={confirming !== null}
                          onClick={() => void confirm(order, section.to, section.cta)}
                        >
                          {confirming === order.id ? 'Confirming…' : section.cta}
                        </Button>
                      </div>

                      {/*
                        The bag labels, on their own line. A load is confirmed by
                        somebody standing over it, and "3 bags" is not enough to
                        know you are looking at the right three.
                      */}
                      {(order.bags?.length ?? 0) > 0 && (
                        <div className="order-7 col-span-2 flex flex-wrap gap-1.5 md:col-span-6 md:pt-1">
                          {order.bags.map((bag) => (
                            <span
                              key={bag.id}
                              className="inline-flex items-center gap-1 rounded-full border border-admin-line bg-admin-raised px-2 py-0.5 text-[10px] text-admin-fg-3"
                            >
                              {bag.scanned && (
                                <CheckCircle2 className="h-3 w-3 text-admin-ok" />
                              )}
                              <span className="font-mono">{bag.qrCode || bag.id}</span>
                              <span>
                                {bag.type}
                                {bag.weight ? ` · ${bag.weight}` : ''}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        );
      })}

      {checkingIn && (
        <CheckInDrawer
          order={checkingIn}
          onClose={() => setCheckingIn(null)}
          onCheckedIn={(message) => {
            onConfirmed(message);
            void load();
          }}
        />
      )}
    </div>
  );
}
