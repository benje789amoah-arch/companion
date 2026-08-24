/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Settlement: what has been paid, what has not, and the receipt for either.
 *
 * Unpaid orders sort to the top. This pane exists to chase money, so the rows
 * that need action should not be interleaved with the twenty settled ones a
 * supervisor has no reason to look at.
 */

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Printer, Receipt, Wallet, X } from 'lucide-react';
import { decodeFinish, priceBreakdown, describeItems } from '@freshfold/core';
import type { Booking } from '../../types';
import { Badge, Button, EmptyState, Panel, TableHead, formatCedis } from './ui';
import { displayAmount } from '../../services/amount';

const COLS =
  'md:grid md:grid-cols-[112px_minmax(140px,1.4fr)_minmax(150px,1.4fr)_100px_96px_76px] md:items-center md:gap-3';

export default function FinancialsPanel({
  bookings,
  totalRevenue,
  outstanding,
  receiptFor,
  onOpenReceipt,
  onTogglePayment,
  onRefund,
}: {
  bookings: Booking[];
  totalRevenue: number;
  outstanding: number;
  receiptFor: Booking | null;
  onOpenReceipt: (booking: Booking | null) => void;
  onTogglePayment: (bookingId: string) => Promise<void>;
  /** Returns a settled bill to the patron's wallet. Supervisor only. */
  onRefund: (bookingId: string) => Promise<void>;
}) {
  const ordered = useMemo(() => {
    // Unpaid first, then by amount descending — the biggest debt at the top.
    return [...bookings].sort((a, b) => {
      const aPaid = a.paymentStatus === 'Paid' ? 1 : 0;
      const bPaid = b.paymentStatus === 'Paid' ? 1 : 0;
      if (aPaid !== bPaid) return aPaid - bPaid;
      return displayAmount(b) - displayAmount(a);
    });
  }, [bookings]);

  return (
    <>
      <Panel
        title="Settlement"
        description="Unpaid orders are listed first."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="ok" mono>
              Collected {formatCedis(totalRevenue)}
            </Badge>
            <Badge tone="warn" mono>
              Outstanding {formatCedis(outstanding)}
            </Badge>
          </div>
        }
      >
        {ordered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nothing to settle"
            detail="Orders appear here as soon as they are booked."
          />
        ) : (
          <>
            <TableHead
              className={COLS}
              columns={[
                { label: 'Order' },
                { label: 'Customer' },
                { label: 'Service' },
                { label: 'Amount', className: 'text-right' },
                { label: 'Status' },
                { label: '', className: '' },
              ]}
            />
            <div className="divide-y divide-admin-line">
              {ordered.map((b) => {
                const paid = b.paymentStatus === 'Paid';
                const refunded = b.paymentStatus === 'Refunded';
                // Only a cash collection is the desk's to take back. A wallet
                // debit or a Paystack charge moved real money and needs a
                // refund, which the button beside it now performs.
                const reversible = b.paymentMethod === 'Cash';
                return (
                  <div key={b.id} className={`px-5 py-3 hover:bg-admin-hover ${COLS}`}>
                    <span className="font-mono text-[12px] tabular-nums text-admin-accent">
                      {b.id}
                    </span>

                    <div className="mt-0.5 min-w-0 md:mt-0">
                      <span className="block truncate text-[13px] font-medium text-admin-fg">
                        {b.name}
                      </span>
                      {b.transactionRef && (
                        <span className="block truncate font-mono text-[11px] text-admin-fg-3">
                          {b.transactionRef}
                        </span>
                      )}
                    </div>

                    <span className="mt-0.5 block truncate text-[12px] text-admin-fg-2 md:mt-0">
                      {describeItems(b) || b.serviceType} · {b.suburb}
                    </span>

                    <span className="mt-1 block font-mono text-[13px] tabular-nums text-admin-fg md:mt-0 md:text-right">
                      {formatCedis(displayAmount(b))}
                    </span>

                    <div className="mt-1.5 md:mt-0">
                      {/* Three states, not two: a refunded booking is neither
                          owed nor collected, and showing it as "Unpaid" would
                          put it back on the desk's list of things to chase. */}
                      <Badge tone={refunded ? 'neutral' : paid ? 'ok' : 'warn'} dot>
                        {refunded ? 'Refunded' : paid ? 'Paid' : 'Unpaid'}
                      </Badge>
                    </div>

                    <div className="mt-2 flex items-center gap-1 md:mt-0 md:justify-self-end">
                      <Button
                        size="sm"
                        variant={paid ? 'ghost' : 'primary'}
                        onClick={() => void onTogglePayment(b.id)}
                        disabled={paid && !reversible}
                        title={
                          paid
                            ? reversible
                              ? 'Undo the cash collection recorded on this order'
                              : `Paid by ${b.paymentMethod ?? 'gateway'} — use Refund instead`
                            : 'Record that a courier collected this bill in cash'
                        }
                      >
                        {paid ? 'Revert' : 'Settle'}
                      </Button>

                      {/*
                        Offered only on a settled booking, which is the only
                        thing there is to refund — and never on a cash one,
                        where Revert beside it is the honest act: no money left
                        the building, so none needs returning to a wallet.
                      */}
                      {paid && !reversible && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void onRefund(b.id)}
                          title={`Return ${formatCedis(displayAmount(b))} to ${b.name}'s FreshFold wallet`}
                        >
                          Refund
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Printer}
                        aria-label={`Receipt for ${b.id}`}
                        title="Itemised receipt"
                        onClick={() => onOpenReceipt(b)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Panel>

      <AnimatePresence>
        {receiptFor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => onOpenReceipt(null)}
          >
            <motion.div
              initial={{ scale: 0.97, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="admin-card w-full max-w-sm rounded-2xl border border-admin-line bg-admin-panel"
            >
              <header className="flex items-center justify-between border-b border-admin-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-admin-accent" />
                  <h2 className="text-[13px] font-semibold text-admin-fg">Itemised receipt</h2>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenReceipt(null)}
                  aria-label="Close receipt"
                  className="cursor-pointer rounded p-0.5 text-admin-fg-3 hover:text-admin-fg"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="space-y-3 px-4 py-4 text-[12px]">
                <ReceiptRow label="Order" value={receiptFor.id} mono />
                <ReceiptRow label="Customer" value={receiptFor.name} />
                <ReceiptRow label="Service" value={describeItems(receiptFor) || receiptFor.serviceType} />
                <ReceiptRow
                  label="Pickup"
                  value={`${receiptFor.address}, ${receiptFor.suburb}`}
                />

                {/*
                  Itemised from the booking. This used to print a "Care package"
                  of the total minus ten and a flat "Dispatch fee" of ₵10.00 on
                  every order — a split that matched no booking and no fee this
                  business charges. These are the lines the quote was built from.
                */}
                {(() => {
                  const finish = decodeFinish(receiptFor.specialInstructions);
                  // The lines matter here as much as the finish: a receipt
                  // that itemises one load against a total charged for three
                  // does not add up, and the difference lands in the reduction
                  // row as though a discount had been applied.
                  const lines = priceBreakdown({
                    serviceType: receiptFor.serviceType,
                    scent: finish.scent,
                    starch: finish.starch,
                    addonIds: receiptFor.specialtyAddons,
                    items: receiptFor.items,
                    quantity: receiptFor.quantity,
                  });
                  const total = displayAmount(receiptFor);
                  // Below list price means an included pickup, the member rate
                  // or a loyalty tier took its cut. Its own line, not folded in.
                  const reduction = Math.max(0, lines.gross - total);

                  return (
                    <>
                      <div className="space-y-2 border-t border-admin-line pt-3">
                        <ReceiptRow label="Care package" value={formatCedis(lines.base)} mono />
                        {lines.finishes > 0 && (
                          <ReceiptRow
                            label="Scent & starch"
                            value={formatCedis(lines.finishes)}
                            mono
                          />
                        )}
                        {lines.addons > 0 && (
                          <ReceiptRow
                            label="Specialty add-ons"
                            value={formatCedis(lines.addons)}
                            mono
                          />
                        )}
                        {reduction > 0 && (
                          <ReceiptRow
                            label="Membership & loyalty"
                            value={`-${formatCedis(reduction)}`}
                            mono
                          />
                        )}
                      </div>

                      <div className="flex items-baseline justify-between border-t border-admin-line pt-3">
                        <span className="text-[13px] font-medium text-admin-fg">Total</span>
                        <span className="font-mono text-[15px] font-semibold tabular-nums text-admin-accent">
                          {formatCedis(total)}
                        </span>
                      </div>
                    </>
                  );
                })()}

                <div className="flex items-center justify-between">
                  <span className="text-admin-fg-2">Status</span>
                  <Badge tone={receiptFor.paymentStatus === 'Paid' ? 'ok' : 'warn'} dot>
                    {receiptFor.paymentStatus ?? 'Pending'}
                  </Badge>
                </div>
              </div>

              <footer className="border-t border-admin-line px-4 py-3">
                <Button
                  variant="primary"
                  icon={Printer}
                  className="w-full"
                  onClick={() => window.print()}
                >
                  Print / save PDF
                </Button>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ReceiptRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-admin-fg-2">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-admin-fg ${mono ? 'font-mono tabular-nums' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
