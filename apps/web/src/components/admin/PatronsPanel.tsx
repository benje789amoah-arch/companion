/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The patron directory, its points adjuster, and the two ways an account stops
 * being a customer's.
 *
 * Two-column cards became a table for the same reason the pipeline did: this
 * is a lookup surface. Someone is on the phone, they are owed points, and the
 * job is to find them and adjust the balance — not to browse.
 *
 * The adjuster docks beside the table on wide screens and slides up as a sheet
 * on narrow ones, because on a laptop the old right-hand column pushed the
 * directory down to a third of the viewport.
 *
 * Block and Delete sit at opposite ends of one decision, so they read
 * differently on purpose. Blocking asks for a reason first, is reversible from
 * the same button, and is the one to reach for while anything is still in
 * flight. Deleting is a plain confirm and does not come back, so it is the
 * quietest control in the row rather than the loudest.
 */

import { useState } from 'react';
import { Award, Ban, Minus, Plus, Search, Trash2, Undo2, Users, X } from 'lucide-react';
import { ApiError, type UserAccount } from '@freshfold/core';
import { Badge, Button, EmptyState, Field, Input, Panel, TableHead } from './ui';

/**
 * The panel clips its overflow, so the row must never be wider than it: whatever
 * the tracks demand past the panel edge is taken out of the action buttons.
 *
 * Hence the low floors on Name and Contact — both truncate, so they can give up
 * width without losing the row — and Standing/Points sized to their content (a
 * badge and a number) rather than to a comfortable-looking column. The actions
 * get a fixed track because two of the three are icon-only and a squeezed icon
 * button is a target nobody can hit.
 */
const COLS =
  'md:grid md:grid-cols-[minmax(90px,1.2fr)_minmax(120px,1.4fr)_88px_64px_186px] md:items-center md:gap-3';

export default function PatronsPanel({
  accounts,
  query,
  onQueryChange,
  selectedEmail,
  onSelect,
  amount,
  onAmountChange,
  reason,
  onReasonChange,
  onAdjust,
  onSetBlocked,
  onDelete,
}: {
  accounts: UserAccount[];
  query: string;
  onQueryChange: (value: string) => void;
  selectedEmail: string | null;
  onSelect: (email: string | null) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  onAdjust: (email: string, action: 'add' | 'subtract') => void;
  /** Suspends a patron, or lifts it. Rejects if the server refused. */
  onSetBlocked: (email: string, blocked: boolean, reason: string) => Promise<void>;
  /** Erases the account. Rejects if the server refused — a live order does. */
  onDelete: (email: string) => Promise<void>;
}) {
  /** The patron whose block form is open, and what has been typed into it. */
  const [blocking, setBlocking] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  /** The row with a request in flight, so its buttons cannot be pressed twice. */
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState('');

  const run = async (email: string, action: () => Promise<void>) => {
    setBusyEmail(email);
    setError('');
    try {
      await action();
      setBlocking(null);
      setBlockReason('');
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'That did not work. Try again.',
      );
    } finally {
      setBusyEmail(null);
    }
  };

  const openBlockForm = (email: string) => {
    setBlocking(email);
    setBlockReason('');
    setError('');
  };

  const q = query.trim().toLowerCase();
  const filtered = accounts
    .filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q),
    )
    // Blocked accounts first: they are the exceptions, and the reason anybody
    // opens this pane twice. The rest keep the order the server sent them in.
    .sort((a, b) => Number(Boolean(b.blockedAt)) - Number(Boolean(a.blockedAt)));

  const selected = accounts.find((a) => a.email === selectedEmail) ?? null;
  const blockedCount = accounts.filter((a) => a.blockedAt).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
      <Panel
        title="Patron directory"
        description={
          `${accounts.length} registered account${accounts.length === 1 ? '' : 's'}` +
          (blockedCount > 0 ? ` · ${blockedCount} blocked` : '')
        }
        actions={
          <Input
            icon={Search}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Name, email, phone"
            className="w-full sm:w-56"
          />
        }
      >
        {!!error && (
          <div className="mx-5 mb-3 flex items-start gap-2 rounded-2xl border border-admin-danger/30 bg-admin-danger/10 p-3">
            <p className="text-[12px] leading-relaxed text-admin-danger">{error}</p>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patrons found"
            detail={
              accounts.length === 0
                ? 'Accounts appear here once customers register on the website or in the app.'
                : 'No account matches that search.'
            }
          />
        ) : (
          <>
            <TableHead
              className={COLS}
              columns={[
                { label: 'Name' },
                { label: 'Contact' },
                { label: 'Standing' },
                { label: 'Points', className: 'text-right' },
                { label: '', className: '' },
              ]}
            />
            <div className="divide-y divide-admin-line">
              {filtered.map((acc) => {
                const isSelected = selectedEmail === acc.email;
                const isBlocked = Boolean(acc.blockedAt);
                const isBusy = busyEmail === acc.email;

                return (
                  <div
                    key={acc.email}
                    className={`px-5 py-2.5 transition-colors ${
                      isSelected ? 'bg-admin-accent/10' : 'hover:bg-admin-hover'
                    }`}
                  >
                    <div className={COLS}>
                      {/* Dimmed rather than struck through: this account still
                          exists and can be handed back. Deletion is the one
                          that ends a name, and it removes the row. */}
                      <span
                        className={`truncate text-[13px] font-medium ${
                          isBlocked ? 'text-admin-fg-3' : 'text-admin-fg'
                        }`}
                      >
                        {acc.name}
                      </span>

                      <div className="mt-0.5 min-w-0 md:mt-0">
                        <span className="block truncate text-[12px] text-admin-fg-2">
                          {acc.email}
                        </span>
                        <span className="block font-mono text-[11px] text-admin-fg-3">
                          {acc.phone}
                        </span>
                      </div>

                      <div className="mt-1.5 md:mt-0">
                        {isBlocked ? (
                          <Badge tone="danger" dot>
                            Blocked
                          </Badge>
                        ) : (
                          <Badge tone="accent">Bespoke</Badge>
                        )}
                      </div>

                      <span className="mt-1 block font-mono text-[13px] font-medium tabular-nums text-admin-fg md:mt-0 md:text-right">
                        {acc.points ?? 0}
                      </span>

                      <div className="mt-2 flex items-center gap-1 md:mt-0 md:justify-self-end">
                        <Button
                          size="sm"
                          icon={Award}
                          onClick={() => onSelect(isSelected ? null : acc.email)}
                          title={`Award or deduct points for ${acc.name || acc.email}`}
                        >
                          Adjust
                        </Button>

                        {isBlocked ? (
                          <Button
                            size="sm"
                            icon={Undo2}
                            disabled={isBusy}
                            onClick={() =>
                              void run(acc.email, () => onSetBlocked(acc.email, false, ''))
                            }
                            title={`Restore access for ${acc.name || acc.email}`}
                          >
                            Unblock
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Ban}
                            disabled={isBusy}
                            onClick={() => openBlockForm(acc.email)}
                            title={`Block ${acc.name || acc.email} from signing in and booking`}
                            aria-label={`Block ${acc.name || acc.email}`}
                          />
                        )}

                        <Button
                          size="sm"
                          variant="danger"
                          icon={Trash2}
                          disabled={isBusy}
                          onClick={() => void run(acc.email, () => onDelete(acc.email))}
                          title={`Delete ${acc.name || acc.email} from the system`}
                          aria-label={`Delete ${acc.name || acc.email}`}
                        />
                      </div>
                    </div>

                    {/* Why, before the block — the desk's record of it, and the
                        line a supervisor reads back when the customer calls. */}
                    {blocking === acc.email && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void run(acc.email, () => onSetBlocked(acc.email, true, blockReason));
                        }}
                        className="mt-3 space-y-2 rounded-xl border border-admin-line bg-admin-raised p-3"
                      >
                        <Input
                          autoFocus
                          value={blockReason}
                          onChange={(event) => setBlockReason(event.target.value)}
                          placeholder="Reason — e.g. three collections booked and never handed over"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="danger" type="submit" disabled={isBusy}>
                            {isBusy ? 'Blocking…' : 'Block this patron'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setBlocking(null)}
                            disabled={isBusy}
                          >
                            Cancel
                          </Button>
                          <span className="text-[11px] leading-relaxed text-admin-fg-3">
                            Signs them out at once. They cannot sign in, book, or register again
                            on this email or number until you unblock them.
                          </span>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Panel>

      {/* The adjuster. Docked on xl, a bottom sheet below it. */}
      <div
        className={
          selected
            ? 'fixed inset-x-0 bottom-0 z-40 border-t border-admin-line bg-admin-panel p-4 shadow-2xl xl:static xl:z-auto xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none'
            : 'hidden xl:block'
        }
      >
        <Panel
          title="Adjust care points"
          description="Every change is written to the audit trail with its reason."
          className="xl:sticky xl:top-4"
          bodyClassName="p-4"
        >
          {selected ? (
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-2 rounded-xl border border-admin-line bg-admin-raised px-3 py-2">
                <div className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-admin-fg">
                    {selected.name}
                  </span>
                  <span className="block truncate text-[11px] text-admin-fg-3">
                    {selected.email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelect(null)}
                  aria-label="Clear selection"
                  className="shrink-0 cursor-pointer rounded p-0.5 text-admin-fg-3 hover:text-admin-fg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-admin-fg-2">Current balance</span>
                <span className="font-mono text-[15px] font-semibold tabular-nums text-admin-accent">
                  {selected.points ?? 0} pts
                </span>
              </div>

              <Field label="Amount">
                <Input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                />
              </Field>

              <Field label="Reason" hint="Shown in the audit trail.">
                <Input
                  value={reason}
                  onChange={(e) => onReasonChange(e.target.value)}
                  placeholder="e.g. Stain treatment compensation"
                />
              </Field>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => onAdjust(selected.email, 'add')}
                >
                  Award
                </Button>
                <Button icon={Minus} onClick={() => onAdjust(selected.email, 'subtract')}>
                  Deduct
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-[12px] leading-relaxed text-admin-fg-3">
              Select a patron to award or deduct care points.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
