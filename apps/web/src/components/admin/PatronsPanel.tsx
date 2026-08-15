/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The patron directory and its points adjuster.
 *
 * Two-column cards became a table for the same reason the pipeline did: this
 * is a lookup surface. Someone is on the phone, they are owed points, and the
 * job is to find them and adjust the balance — not to browse.
 *
 * The adjuster docks beside the table on wide screens and slides up as a sheet
 * on narrow ones, because on a laptop the old right-hand column pushed the
 * directory down to a third of the viewport.
 */

import { Award, Minus, Plus, Search, Users, X } from 'lucide-react';
import type { UserAccount } from '../../types';
import { Badge, Button, EmptyState, Field, Input, Panel, TableHead } from './ui';

/**
 * The panel clips its overflow, so the row must never be wider than it: whatever
 * the tracks demand past the panel edge is taken out of the Adjust button.
 *
 * Hence the low floors on Name and Contact — both truncate, so they can give up
 * width without losing the row — and Tier/Points sized to their content (a badge
 * and a number) rather than to a comfortable-looking column.
 */
const COLS = 'md:grid md:grid-cols-[minmax(90px,1.4fr)_minmax(120px,1.6fr)_88px_64px_112px] md:items-center md:gap-3';

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
}) {
  const q = query.trim().toLowerCase();
  const filtered = accounts.filter(
    (a) =>
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      a.phone.toLowerCase().includes(q),
  );
  const selected = accounts.find((a) => a.email === selectedEmail) ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
      <Panel
        title="Patron directory"
        description={`${accounts.length} registered account${accounts.length === 1 ? '' : 's'}`}
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
                { label: 'Tier' },
                { label: 'Points', className: 'text-right' },
                { label: '', className: '' },
              ]}
            />
            <div className="divide-y divide-admin-line">
              {filtered.map((acc) => {
                const isSelected = selectedEmail === acc.email;
                return (
                  <div
                    key={acc.email}
                    className={`px-5 py-2.5 transition-colors ${COLS} ${
                      isSelected ? 'bg-admin-accent/10' : 'hover:bg-admin-hover'
                    }`}
                  >
                    <span className="truncate text-[13px] font-medium text-admin-fg">
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
                      <Badge tone="accent">Bespoke</Badge>
                    </div>

                    <span className="mt-1 block font-mono text-[13px] font-medium tabular-nums text-admin-fg md:mt-0 md:text-right">
                      {acc.points ?? 0}
                    </span>

                    <div className="mt-2 md:mt-0 md:justify-self-end">
                      <Button
                        size="sm"
                        icon={Award}
                        onClick={() => onSelect(isSelected ? null : acc.email)}
                      >
                        Adjust
                      </Button>
                    </div>
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
