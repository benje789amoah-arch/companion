/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The supervisor desk.
 *
 * This component is only mounted for a supervisor whose token the server has
 * just verified — see the gate in `App.tsx`. The demo passcode screen that used
 * to live here ("type 1212, or click Demo Bypass") is gone: it guarded nothing,
 * since the ledger was already loaded behind it.
 *
 * Structurally it is a shell: session state, the handlers that mutate the
 * ledger, and a chrome of sidebar + toolbar. Each pane lives in `./admin/`.
 * The shell owns the data because the panes share it — a payment settled from
 * the financials table has to move the pipeline row and the header metric in
 * the same tick.
 *
 * On the design: the desk has its own palette (`--color-admin-*` in
 * `index.css`) rather than the marketing brand's. It is an instrument someone
 * stares at for a whole shift, so colour is reserved for meaning — a late job,
 * an unpaid order — and the one warm accent marks selection. Navigation is a
 * left rail rather than a tab strip because the strip plus the old metric
 * banner spent ~340px of vertical space before the first order appeared.
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bike,
  Check,
  LayoutList,
  LogOut,
  Menu,
  MessageSquare,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Truck,
  Users,
  Wallet,
  FileText,
  ShieldQuestion,
  TicketPercent,
  WashingMachine,
  X,
} from 'lucide-react';
import { BOOKING_STAGE_SEQUENCE, type AuditEvent, type Message } from '@freshfold/core';
import type { Booking, UserAccount } from '../types';
import * as store from '../services/store';
import { displayAmount } from '../services/amount';
import RosterPanel from './RosterPanel';
import PipelinePanel, { filterBookings, useSuburbs } from './admin/PipelinePanel';
import HubPanel from './admin/HubPanel';
import ClaimsPanel from './admin/ClaimsPanel';
import OffersPanel from './admin/OffersPanel';
import BillingPanel from './admin/BillingPanel';
import MessagesPanel, { inboundThreadCount } from './admin/MessagesPanel';
import PatronsPanel from './admin/PatronsPanel';
import FinancialsPanel from './admin/FinancialsPanel';
import SettingsPanel from './admin/SettingsPanel';
import { Button, Input, Metric, Panel, Select, formatCedis } from './admin/ui';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Revokes the desk token and drops back to the login. */
  onSignOut: () => void;
  activeBookings: Booking[];
  onUpdateBookings: (bookings: Booking[]) => void;
}

type TabId =
  | 'pipeline'
  | 'hub'
  | 'claims'
  | 'offers'
  | 'billing'
  | 'inbox'
  | 'patrons'
  | 'financials'
  | 'roster'
  | 'settings';

const TABS: { id: TabId; label: string; icon: typeof LayoutList }[] = [
  { id: 'pipeline', label: 'Pipeline', icon: LayoutList },
  { id: 'hub', label: 'Hub', icon: WashingMachine },
  { id: 'claims', label: 'Claims', icon: ShieldQuestion },
  { id: 'offers', label: 'Offers', icon: TicketPercent },
  { id: 'billing', label: 'Billing', icon: FileText },
  { id: 'inbox', label: 'Inbox', icon: MessageSquare },
  { id: 'patrons', label: 'Patrons', icon: Users },
  { id: 'financials', label: 'Settlement', icon: Receipt },
  { id: 'roster', label: 'Couriers', icon: Bike },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function AdminDashboard({
  isOpen,
  onClose,
  onSignOut,
  activeBookings,
  onUpdateBookings,
}: AdminDashboardProps) {
  const currentSupervisor = useMemo(
    () => store.readAdminSupervisor()?.name ?? 'Supervisor desk',
    [],
  );

  const [activeTab, setActiveTab] = useState<TabId>('pipeline');
  const [navOpen, setNavOpen] = useState(false);

  // Pipeline filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [suburbFilter, setSuburbFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Patron adjuster
  const [selectedPatronEmail, setSelectedPatronEmail] = useState<string | null>(null);
  const [pointsChangeAmount, setPointsChangeAmount] = useState('150');
  const [pointsReason, setPointsReason] = useState('Specialist stain-treatment compensation');
  const [patronSearchQuery, setPatronSearchQuery] = useState('');

  const [receiptModalBooking, setReceiptModalBooking] = useState<Booking | null>(null);

  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [successNotif, setSuccessNotif] = useState('');

  /**
   * The trail, and whether we managed to read it.
   *
   * Three pieces of state rather than one array, because the failure matters.
   * The old log was local, so it was always readable and always complete; this
   * one is a request that can fail, and a trail that came back empty because the
   * server was unreachable must not render as a trail with nothing in it.
   *
   * `auditNonce` is bumped by every handler that writes an entry, which is what
   * re-runs the fetch. The desk no longer composes entries, so this is how the
   * pane learns about the one the server just filed.
   */
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditNonce, setAuditNonce] = useState(0);
  const bumpAudit = () => setAuditNonce((n) => n + 1);

  /**
   * The board's message threads, for the Inbox pane and the figure beside its
   * tab.
   *
   * Held here rather than in the pane, and read on every dashboard open rather
   * than when the tab is selected — the opposite of the audit trail below. The
   * whole point of an inbox is that the desk notices somebody is waiting without
   * clicking into it, and a count fetched only once the pane is mounted would
   * read "nobody is waiting" until you had already looked.
   *
   * The failure is held for the same reason the trail's is: an empty inbox and an
   * inbox that could not be read are different answers.
   */
  const [inboxMessages, setInboxMessages] = useState<Message[]>([]);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxNonce, setInboxNonce] = useState(0);
  const bumpInbox = () => setInboxNonce((n) => n + 1);

  // Master stage cycle — shared with the client portal and with the mapping
  // that turns a rider's dispatch status into one of these stages.
  const statusCycle = BOOKING_STAGE_SEQUENCE;

  const loadDatabase = () => {
    try {
      const savedAccounts: UserAccount[] = store.readAccounts();

      /**
       * The directory is whatever the server says it is.
       *
       * This used to invent an account for every email in the ledger whenever
       * the list came back empty — with 750 points attached — and write them
       * back through the sync queue. That predates real registration, and it
       * fights the delete button below it: removing the last patron would have
       * them resurrected, with a loyalty balance nobody awarded, the next time
       * this pane loaded.
       */
      setAccounts(savedAccounts);
    } catch (e) {
      console.warn('Error syncing ledger data.', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDatabase();
    }
  }, [isOpen, activeBookings]);

  // Escape closes the nav drawer first, then nothing — leaving the desk is a
  // deliberate click, not a stray keypress over a ledger.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  /**
   * Courier contact numbers, by rider id.
   *
   * The jobs themselves carry `rider` — name, vehicle, plate, rating, dispatch
   * status — but deliberately not a phone number: that object is sent to the
   * customer too, and a courier's personal number is not the customer's to have.
   * This desk administers the roster, so it reads the numbers from there.
   */
  const [riderPhones, setRiderPhones] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;

    const token = store.readAdminToken();
    if (!token) return;

    let cancelled = false;
    store.api
      .listRiders(token)
      .then((roster) => {
        if (cancelled) return;
        setRiderPhones(Object.fromEntries(roster.map((r) => [r.id, r.phone])));
      })
      .catch(() => {
        // No roster, no rider numbers — the row still names the courier.
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  /**
   * The audit trail, from the server.
   *
   * Fetched when the Settings tab is opened rather than on every dashboard load:
   * it is a few hundred rows nobody is looking at from the Pipeline pane, and
   * `auditNonce` brings it back the moment a handler writes to it.
   *
   * A failure is held, not swallowed. This pane's whole claim is that it shows
   * what happened; "nothing happened" and "we could not find out what happened"
   * are different answers and the panel says which one it has.
   */
  useEffect(() => {
    if (!isOpen || activeTab !== 'settings') return;

    const token = store.readAdminToken();
    if (!token) {
      setAuditError('This desk is not signed in, so the trail cannot be read.');
      return;
    }

    let cancelled = false;
    store.api
      .listAuditEvents(token)
      .then((events) => {
        if (cancelled) return;
        setAuditEvents(events);
        setAuditError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setAuditError(
          e instanceof Error ? e.message : 'The trail could not be read from the server.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, auditNonce]);

  /**
   * The message threads.
   *
   * `listAllMessages` is the supervisor-scoped `GET /messages`, which answers a
   * page of the most recent traffic across the whole ledger — the table gets a
   * line for every status change on every job, so it is paged rather than read
   * whole. `inboxNonce` brings it back after the desk replies.
   */
  useEffect(() => {
    if (!isOpen) return;

    const token = store.readAdminToken();
    if (!token) {
      setInboxError('This desk is not signed in, so the threads cannot be read.');
      setInboxLoading(false);
      return;
    }

    let cancelled = false;
    store.api
      .listAllMessages(token)
      .then((threads) => {
        if (cancelled) return;
        setInboxMessages(threads);
        setInboxError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setInboxError(
          e instanceof Error ? e.message : 'The threads could not be read from the server.',
        );
      })
      .finally(() => {
        if (!cancelled) setInboxLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, inboxNonce]);

  const triggerFlashNotification = (msg: string) => {
    setSuccessNotif(msg);
    setTimeout(() => setSuccessNotif(''), 4000);
  };

  const handleUpdateStatus = (bookingId: string, newStatus: Booking['status']) => {
    try {
      const updated = activeBookings.map((booking) =>
        booking.id === bookingId ? { ...booking, status: newStatus } : booking,
      );

      store.writeBookings(updated);
      onUpdateBookings(updated);
      triggerFlashNotification(`${bookingId} moved to ${newStatus}`);
      bumpAudit();
    } catch (e) {
      console.error(e);
    }
  };

  /**
   * Records that a courier was handed cash for an order, or takes that record
   * back.
   *
   * Both directions ask the server and report what it says. This used to flip
   * `paymentStatus` in the local mirror and stamp `TXN-ADMIN-######` on the way
   * past — a gateway confirmation for a payment no gateway ever saw — and
   * because the sync queue diffs whole records and this desk holds a supervisor
   * token, that invented reference landed in the real ledger.
   *
   * Cash is the one payment a supervisor can actually attest to, so it is the
   * one this button records: `POST /bookings/:id/payment` with `Cash`, which
   * writes a statement row naming whoever recorded it and leaves
   * `transactionRef` empty, because nothing outside this building confirmed
   * anything. The reversal is cash-only for the same reason — money that moved
   * through Paystack or a wallet needs a refund, not a flag flip, and the
   * server will refuse.
   *
   * Nothing is written locally on failure. A settlement that did not happen must
   * not look like one, which is the reasoning in `ClientPortal`'s payment path
   * too.
   */
  /**
   * Returns a settled bill to the customer's wallet.
   *
   * Confirmed first, and deliberately: this is the one desk action that moves
   * money *outward*, it is idempotent rather than reversible — a refund cannot
   * be un-refunded from here — and the amount is worth reading back before it
   * goes. The other payment controls are recoverable in a click.
   */
  const handleRefundBooking = async (bookingId: string) => {
    const target = activeBookings.find((b) => b.id === bookingId);
    if (!target) return;

    const owed = formatCedis(displayAmount(target));
    const confirmed = window.confirm(
      `Refund ${owed} to ${target.name}'s FreshFold wallet?\n\n` +
        `Order ${bookingId} will be marked Refunded. This cannot be undone from the desk.`
    );
    if (!confirmed) return;

    try {
      const refunded = await store.refundBooking(bookingId);
      onUpdateBookings(activeBookings.map((b) => (b.id === bookingId ? refunded : b)));
      triggerFlashNotification(`${bookingId} refunded — ${owed} returned to the patron's wallet`);
      bumpAudit();
    } catch (e) {
      triggerFlashNotification(
        e instanceof Error ? e.message : `Could not reach the server. ${bookingId} is unchanged.`
      );
    }
  };

  const handleTogglePaymentStatus = async (bookingId: string) => {
    const target = activeBookings.find((b) => b.id === bookingId);
    if (!target) return;

    const wasPaid = target.paymentStatus === 'Paid';

    try {
      const settled = wasPaid
        ? await store.reverseCashPayment(bookingId)
        : await store.payForBooking(bookingId, 'Cash');

      onUpdateBookings(activeBookings.map((b) => (b.id === bookingId ? settled : b)));

      triggerFlashNotification(
        wasPaid
          ? `${bookingId} back to pay on pickup — cash collection reversed`
          : `${bookingId} settled — ${formatCedis(displayAmount(settled))} collected in cash`,
      );

      bumpAudit();
    } catch (e) {
      triggerFlashNotification(
        e instanceof Error ? e.message : `Could not reach the server. ${bookingId} is unchanged.`,
      );
      console.warn(e);
    }
  };

  const handleDeleteBooking = (bookingId: string) => {
    if (!window.confirm(`Delete order ${bookingId} from the ledger? This cannot be undone.`)) {
      return;
    }
    try {
      const updated = activeBookings.filter((b) => b.id !== bookingId);
      store.writeBookings(updated);
      onUpdateBookings(updated);
      triggerFlashNotification(`${bookingId} removed from the ledger`);
      bumpAudit();
    } catch (e) {
      console.error(e);
    }
  };

  /**
   * Awards or deducts care points.
   *
   * Sent to the server as a delta and applied there, on a locked row. The desk
   * used to work the new total out from its own copy of the account and PUT it
   * back, which meant two supervisors adjusting at once lost one of the two
   * grants — and meant points a customer earned between the page loading and
   * the button being pressed were quietly overwritten.
   */
  const handleAdjustPoints = async (email: string, action: 'add' | 'subtract') => {
    try {
      const amount = parseInt(pointsChangeAmount, 10);
      if (isNaN(amount) || amount <= 0) {
        triggerFlashNotification('Enter a positive number of points to adjust.');
        return;
      }

      const patronName =
        accounts.find((acc) => acc.email.toLowerCase() === email.toLowerCase())?.name || email;

      const updated = await store.adjustPatronPoints(
        email,
        action === 'add' ? amount : -amount,
        pointsReason,
      );

      setAccounts((current) =>
        current.map((acc) =>
          acc.email.toLowerCase() === email.toLowerCase() ? { ...acc, ...updated } : acc,
        ),
      );

      triggerFlashNotification(
        `${action === 'add' ? '+' : '−'}${amount} pts for ${patronName} — now ${updated.points ?? 0}`,
      );

      bumpAudit();
      setSelectedPatronEmail(null);
    } catch (e) {
      triggerFlashNotification(
        e instanceof Error ? e.message : 'Could not adjust points. Try again in a moment.',
      );
      console.warn(e);
    }
  };

  /**
   * Suspends a patron, or lifts it.
   *
   * Deliberately not caught here. Every other handler on this desk writes to
   * the local mirror first and syncs later, so failure is invisible and
   * recoverable; these two go straight to the server with the desk's token, and
   * a supervisor who has just blocked somebody needs to know whether it took.
   * The panel renders whatever this throws.
   */
  const handleSetPatronBlocked = async (email: string, blocked: boolean, reason: string) => {
    const patron = accounts.find((acc) => acc.email.toLowerCase() === email.toLowerCase());
    const who = patron?.name || email;

    if (!blocked && !window.confirm(`Restore access for ${who}?`)) return;

    await store.setAccountBlocked(email, blocked, reason);
    loadDatabase();

    triggerFlashNotification(blocked ? `${who} blocked` : `${who} reinstated`);
    bumpAudit();
  };

  /** Erases the account. Their orders stay in the ledger; the identity goes. */
  const handleDeletePatron = async (email: string) => {
    const patron = accounts.find((acc) => acc.email.toLowerCase() === email.toLowerCase());
    const who = patron?.name || email;

    if (
      !window.confirm(
        `Delete ${who} (${email}) from the system? Their past orders stay in the ledger, ` +
          'but the account, its wallet and its points are gone. This cannot be undone.',
      )
    ) {
      return;
    }

    await store.deleteAccount(email);

    if (selectedPatronEmail?.toLowerCase() === email.toLowerCase()) setSelectedPatronEmail(null);
    loadDatabase();

    triggerFlashNotification(`${who} deleted`);
    bumpAudit();
  };

  const suburbs = useSuburbs(activeBookings);
  const filteredBookings = useMemo(
    () =>
      filterBookings(activeBookings, {
        query: searchQuery,
        status: statusFilter,
        suburb: suburbFilter,
        payment: paymentFilter,
      }),
    [activeBookings, searchQuery, statusFilter, suburbFilter, paymentFilter],
  );

  // `displayAmount`, not `amount || 50`. The fallback used to be a different
  // invented number on every pane, and `||` counted a genuinely free order — a
  // complimentary `Fast Pickup & Delivery` is ₵0 — as a booking with no price,
  // adding ₵50 of money nobody was ever charged to both totals.
  const totalRevenue = activeBookings
    .filter((b) => b.paymentStatus === 'Paid')
    .reduce((sum, b) => sum + displayAmount(b), 0);
  const unpaid = activeBookings.filter((b) => b.paymentStatus !== 'Paid');
  const outstanding = unpaid.reduce((sum, b) => sum + displayAmount(b), 0);
  const inTransit = activeBookings.filter(
    (b) => b.status !== 'Delivered' && b.status !== 'Cancelled' && b.status !== 'Scheduled',
  ).length;

  const filtersActive =
    searchQuery.trim() !== '' ||
    statusFilter !== 'all' ||
    suburbFilter !== 'all' ||
    paymentFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSuburbFilter('all');
    setPaymentFilter('all');
  };

  if (!isOpen) return null;

  const activeTabMeta = TABS.find((t) => t.id === activeTab)!;

  /**
   * The rail's nav list.
   *
   * The selected row is a pill cut out of the rail in the page colour, so the
   * rail and the content area join into one shape — `.admin-rail-active` in
   * `index.css` draws the two inverted corners that make that join read.
   */
  const navList = (
    <nav className="flex flex-col gap-1 py-3 pl-3">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const count =
          tab.id === 'pipeline'
            ? activeBookings.length
            : tab.id === 'inbox'
              ? // Threads a customer or a courier spoke into last. Not an unread
                // count — `Message` has no read state, so there is none to show.
                inboundThreadCount(inboxMessages)
              : tab.id === 'patrons'
                ? accounts.length
                : tab.id === 'financials'
                  ? unpaid.length
                  : undefined;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setNavOpen(false);
            }}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex h-11 cursor-pointer items-center gap-3 rounded-l-2xl pl-4 pr-3 text-[13px] transition-colors ${
              isActive
                ? 'admin-rail-active bg-admin-bg font-semibold text-admin-fg'
                : 'text-admin-fg-2 hover:bg-white/[0.04] hover:text-admin-fg'
            }`}
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${isActive ? 'text-admin-accent' : 'text-admin-fg-3'}`}
            />
            <span className="flex-1 text-left">{tab.label}</span>
            {count !== undefined && count > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums ${
                  tab.id === 'financials'
                    ? 'bg-admin-warn/15 text-admin-warn'
                    : isActive
                      ? 'bg-admin-accent/15 text-admin-accent'
                      : 'bg-white/[0.06] text-admin-fg-3'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const signOutButton = (
    <button
      type="button"
      onClick={onSignOut}
      className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-full px-4 text-[13px] text-admin-fg-2 transition-colors hover:bg-admin-danger/10 hover:text-admin-danger"
    >
      <LogOut className="h-4 w-4 shrink-0" />
      Sign out
    </button>
  );

  return (
    <div className="below-banner fixed inset-0 z-[60] flex bg-admin-rail font-sans text-admin-fg antialiased">
      {/* ---------------------------------------------------------------
          Left rail. Fixed on lg+, a drawer below it.
          --------------------------------------------------------------- */}
      <aside className="hidden w-60 shrink-0 flex-col bg-admin-rail lg:flex">
        <DeskIdentity supervisor={currentSupervisor} />
        {navList}
        <div className="mt-auto p-3">{signOutButton}</div>
      </aside>

      <AnimatePresence>
        {navOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNavOpen(false)}
              className="fixed inset-0 z-40 bg-black/70 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.18 }}
              className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-admin-rail shadow-2xl lg:hidden"
            >
              <DeskIdentity supervisor={currentSupervisor} onDismiss={() => setNavOpen(false)} />
              {navList}
              <div className="mt-auto p-3">{signOutButton}</div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------------------
          Content area — a rounded panel laid over the rail, so the rail's
          active pill runs into it.
          --------------------------------------------------------------- */}
      <div className="admin-scroll flex min-w-0 flex-1 flex-col overflow-y-auto bg-admin-bg lg:rounded-l-3xl">
        {/* Top bar. Sticky, because the search that finds an order should not
            scroll away while you are scrolling to look for it. */}
        <header className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-3 bg-admin-bg/95 px-5 py-4 backdrop-blur lg:rounded-tl-3xl">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            className="-ml-1 cursor-pointer rounded-full p-2 text-admin-fg-2 hover:bg-white/[0.06] hover:text-admin-fg lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold leading-tight">
              {activeTabMeta.label}
            </h1>
            <p className="mt-0.5 truncate text-[12px] text-admin-fg-3">
              <span className="text-admin-accent">Supervisor desk</span> / {activeTabMeta.label}
            </p>
          </div>

          {activeTab === 'pipeline' && (
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order, name, phone or suburb…"
              className="hidden min-w-0 flex-1 md:mx-4 md:block md:max-w-lg"
              icon={Search}
            />
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              icon={RefreshCw}
              variant="ghost"
              onClick={loadDatabase}
              title="Reload the ledger from the server"
            >
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button icon={X} onClick={onClose} title="Leave the desk">
              <span className="hidden sm:inline">Exit</span>
            </Button>

            {/* Who is signed in, mirroring the rail so the identity stays
                visible once the rail collapses on narrow screens. */}
            <div className="ml-1 flex items-center gap-2.5 border-l border-admin-line pl-3">
              <div className="hidden text-right sm:block">
                <span className="block max-w-40 truncate text-[13px] font-semibold leading-tight">
                  {currentSupervisor}
                </span>
                <span className="block text-[11px] leading-tight text-admin-fg-3">
                  Kumasi operations
                </span>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-admin-accent/30 bg-admin-accent/10 text-[13px] font-semibold text-admin-accent">
                {initialsOf(currentSupervisor)}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-4 px-5 pb-6">
          {/* Metric strip. Four numbers, one row — this used to be a grid of
              2xl serif numerals that pushed the first order below the fold. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              icon={LayoutList}
              label="Active orders"
              value={activeBookings.length}
              hint="in pipeline"
            />
            <Metric
              icon={Truck}
              label="In transit"
              value={inTransit}
              hint="being worked"
              tone="info"
            />
            <Metric icon={Wallet} label="Collected" value={formatCedis(totalRevenue)} tone="ok" />
            <Metric
              icon={Receipt}
              label="Outstanding"
              value={formatCedis(outstanding)}
              hint={`${unpaid.length} unpaid`}
              tone={outstanding > 0 ? 'warn' : 'neutral'}
            />
          </div>

          {activeTab === 'pipeline' && (
            <Panel
              title="Live pipeline"
              description={`Showing ${filteredBookings.length} of ${activeBookings.length}`}
              actions={
                <>
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter by stage"
                  >
                    <option value="all">All stages</option>
                    {statusCycle.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </Select>

                  <Select
                    value={suburbFilter}
                    onChange={(e) => setSuburbFilter(e.target.value)}
                    aria-label="Filter by suburb"
                  >
                    <option value="all">All suburbs</option>
                    {suburbs.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </Select>

                  <Select
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                    aria-label="Filter by payment"
                  >
                    <option value="all">Any payment</option>
                    <option value="Paid">Paid</option>
                    <option value="Unpaid">Unpaid / COD</option>
                  </Select>

                  {filtersActive && (
                    <Button size="sm" variant="ghost" onClick={clearFilters}>
                      Clear
                    </Button>
                  )}
                </>
              }
            >
              {/* The top-bar search hides below md; small screens get their own. */}
              <div className="px-5 pb-4 md:hidden">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search orders…"
                  icon={Search}
                />
              </div>

              <PipelinePanel
                bookings={filteredBookings}
                stageSequence={statusCycle}
                riderPhones={riderPhones}
                onUpdateStatus={handleUpdateStatus}
                onTogglePayment={handleTogglePaymentStatus}
                onDelete={handleDeleteBooking}
              />
            </Panel>
          )}

          {activeTab === 'patrons' && (
            <PatronsPanel
              accounts={accounts}
              query={patronSearchQuery}
              onQueryChange={setPatronSearchQuery}
              selectedEmail={selectedPatronEmail}
              onSelect={setSelectedPatronEmail}
              amount={pointsChangeAmount}
              onAmountChange={setPointsChangeAmount}
              reason={pointsReason}
              onReasonChange={setPointsReason}
              onAdjust={handleAdjustPoints}
              onSetBlocked={handleSetPatronBlocked}
              onDelete={handleDeletePatron}
            />
          )}

          {activeTab === 'hub' && (
            <HubPanel
              onConfirmed={(message) => {
                triggerFlashNotification(message);
                bumpAudit();
              }}
            />
          )}

          {activeTab === 'inbox' && (
            <MessagesPanel
              messages={inboxMessages}
              error={inboxError}
              loading={inboxLoading}
              bookings={activeBookings}
              onRefresh={bumpInbox}
              onReplied={(message) => {
                triggerFlashNotification(message);
                // The pane keeps no copy of what it sent, so the thread it wrote
                // into comes back from the server with the desk's line in it.
                bumpInbox();
              }}
            />
          )}

          {activeTab === 'financials' && (
            <FinancialsPanel
              bookings={activeBookings}
              totalRevenue={totalRevenue}
              outstanding={outstanding}
              receiptFor={receiptModalBooking}
              onOpenReceipt={setReceiptModalBooking}
              onTogglePayment={handleTogglePaymentStatus}
              onRefund={handleRefundBooking}
            />
          )}

          {activeTab === 'claims' && (
            <ClaimsPanel
              onHandled={(message) => {
                triggerFlashNotification(message);
                bumpAudit();
              }}
            />
          )}

          {activeTab === 'offers' && (
            <OffersPanel
              onSaved={(message) => {
                triggerFlashNotification(message);
                bumpAudit();
              }}
            />
          )}

          {activeTab === 'billing' && (
            <BillingPanel
              onSaved={(message) => {
                triggerFlashNotification(message);
                bumpAudit();
              }}
            />
          )}

          {activeTab === 'roster' && <RosterPanel />}

          {activeTab === 'settings' && (
            <SettingsPanel
              supervisor={currentSupervisor}
              auditEvents={auditEvents}
              auditError={auditError}
            />
          )}
        </main>
      </div>

      {/* Toast. Bottom-right and quiet — the old one was a spinning-sparkle
          pill across the top centre, over the row you had just acted on. */}
      <AnimatePresence>
        {successNotif && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="admin-card fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-full border border-admin-line-strong bg-admin-panel px-4 py-2.5 text-[13px] text-admin-fg"
          >
            <Check className="h-4 w-4 text-admin-ok" />
            {successNotif}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** `Ama Boateng` → `AB`. Falls back to one letter, never to an empty circle. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Wordmark and who is signed in, at the top of the rail. */
function DeskIdentity({
  supervisor,
  onDismiss,
}: {
  supervisor: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex h-[72px] shrink-0 items-center gap-3 px-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-admin-accent">
        <Shield className="h-4 w-4 text-black" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight">FreshFold</span>
        <span className="block truncate text-[11px] leading-tight text-admin-fg-3">
          {supervisor}
        </span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close navigation"
          className="cursor-pointer rounded-full p-1 text-admin-fg-3 hover:text-admin-fg"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

