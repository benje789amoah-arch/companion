/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Promo codes.
 *
 * The product had a four-tier loyalty ladder and four membership plans before it
 * had any of this, and both of those reward somebody for already being a
 * customer. There was nothing at all for getting them to become one: a grep for
 * `coupon`, `promo`, `voucher` or `referral` returned nothing across the whole
 * repository — no launch offer, no student discount, no way for the desk to make
 * good on a bad week with a code.
 *
 * The two fields worth understanding are the cap and the minimum. A percentage
 * with no cap is an unbounded liability the first time somebody books a ₵180
 * office clean; a fixed amount with no minimum is a campaign that loses money
 * per redemption on small orders. Both are optional and both are the difference
 * between a campaign and a leak.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Tag, TicketPercent } from 'lucide-react';
import { promoLabel, type PromoCode } from '@freshfold/core';
import * as store from '../../services/store';
import { Badge, Button, EmptyState, Field, Input, Panel, formatCedis } from './ui';

/** A blank code, as the form holds it. Strings throughout — these are inputs. */
const BLANK = {
  code: '',
  label: '',
  kind: 'percent' as 'percent' | 'amount',
  value: '',
  maxDiscount: '',
  minSpend: '',
  expiresAt: '',
  maxUses: '',
  maxPerCustomer: '1',
  firstOrderOnly: false,
  active: true,
};

export default function OffersPanel({ onSaved }: { onSaved: (message: string) => void }) {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const token = store.readAdminToken();
    if (!token) {
      setError('This desk is not signed in.');
      setLoading(false);
      return;
    }

    try {
      setCodes(await store.api.listPromoCodes(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The codes could not be read.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const edit = (promo: PromoCode) =>
    setDraft({
      code: promo.code,
      label: promo.label,
      kind: promo.kind,
      // A percentage is stored as a fraction and shown as a percentage: nobody
      // types "0.2" meaning a fifth off, and a form that asked them to would
      // collect "20" and give everything away.
      value: promo.kind === 'percent' ? String(Math.round(promo.value * 100)) : String(promo.value),
      maxDiscount: promo.maxDiscount ? String(promo.maxDiscount) : '',
      minSpend: promo.minSpend ? String(promo.minSpend) : '',
      expiresAt: promo.expiresAt ? promo.expiresAt.slice(0, 10) : '',
      maxUses: promo.maxUses ? String(promo.maxUses) : '',
      maxPerCustomer: String(promo.maxPerCustomer),
      firstOrderOnly: promo.firstOrderOnly,
      active: promo.active,
    });

  const save = async (): Promise<void> => {
    const token = store.readAdminToken();
    if (!token) {
      setError('This desk is not signed in.');
      return;
    }

    const typed = Number(draft.value);
    if (!Number.isFinite(typed) || typed <= 0) {
      setError('A code has to be worth something.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await store.api.savePromoCode(
        draft.code.trim().toUpperCase(),
        {
          label: draft.label,
          kind: draft.kind,
          // Back to a fraction on the way out — see the note in `edit`.
          value: draft.kind === 'percent' ? typed / 100 : typed,
          maxDiscount: Number(draft.maxDiscount) || undefined,
          minSpend: Number(draft.minSpend) || 0,
          // A date with no time is the start of that day; a code expiring "on
          // the 30th" should work through the 30th, so it expires at the end of
          // it.
          expiresAt: draft.expiresAt ? `${draft.expiresAt}T23:59:59Z` : undefined,
          maxUses: Number(draft.maxUses) || undefined,
          maxPerCustomer: Number(draft.maxPerCustomer) || 1,
          firstOrderOnly: draft.firstOrderOnly,
          active: draft.active,
        },
        token,
      );

      setDraft(BLANK);
      await load();
      onSaved(`${draft.code.toUpperCase()} saved`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code could not be saved.');
    } finally {
      setBusy(false);
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <TicketPercent className="h-4 w-4 text-admin-fg-3" />
              Codes
            </span>
          }
          description="A percentage without a cap is an unbounded liability. A fixed amount without a minimum loses money on small orders."
          actions={<Badge mono>{codes.length}</Badge>}
        >
          {codes.length === 0 ? (
            <EmptyState
              icon={Tag}
              title={loading ? 'Reading the codes…' : 'No codes yet'}
              detail={loading ? undefined : 'Create one beside this panel to run your first offer.'}
            />
          ) : (
            <div className="divide-y divide-admin-line">
              {codes.map((promo) => (
                <div key={promo.code} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-admin-fg">
                        {promo.code}
                      </span>
                      <Badge tone={promo.active ? 'ok' : 'neutral'}>
                        {promo.active ? promoLabel(promo) : 'Withdrawn'}
                      </Badge>
                      {promo.firstOrderOnly && <Badge tone="info">First order</Badge>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-admin-fg-3">
                      {promo.label || 'No description'}
                      {promo.maxDiscount ? ` · capped at ${formatCedis(promo.maxDiscount)}` : ''}
                      {promo.minSpend ? ` · orders over ${formatCedis(promo.minSpend)}` : ''}
                      {promo.maxUses ? ` · ${promo.uses ?? 0}/${promo.maxUses} claimed` : ` · ${promo.uses ?? 0} claimed`}
                      {promo.expiresAt ? ` · until ${promo.expiresAt.slice(0, 10)}` : ''}
                    </p>
                  </div>

                  <Button size="sm" onClick={() => edit(promo)}>
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={draft.code ? `Editing ${draft.code}` : 'New code'}>
          <div className="space-y-3 p-5">
            <Field label="Code" hint="What the customer types. Case does not matter.">
              <Input
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                placeholder="FRESHERS24"
                className="[&_input]:font-mono [&_input]:uppercase"
              />
            </Field>

            <Field label="Description" hint="Internal. The customer never sees this.">
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Freshers week 2026"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind">
                <select
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft({ ...draft, kind: e.target.value as 'percent' | 'amount' })
                  }
                  className="h-9 w-full cursor-pointer rounded-full border border-admin-line bg-admin-raised px-3.5 text-[13px] text-admin-fg-2 focus:border-admin-accent/60 focus:outline-none"
                >
                  <option value="percent">Percentage off</option>
                  <option value="amount">Amount off</option>
                </select>
              </Field>

              <Field label={draft.kind === 'percent' ? 'Percent (%)' : 'Amount (GHS)'}>
                <Input
                  type="number"
                  min={0}
                  step={draft.kind === 'percent' ? 1 : 0.01}
                  value={draft.value}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  placeholder={draft.kind === 'percent' ? '20' : '15.00'}
                />
              </Field>
            </div>

            {draft.kind === 'percent' && (
              <Field
                label="Cap (GHS)"
                hint="The most this can take off one order. Blank is uncapped."
              >
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.maxDiscount}
                  onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })}
                  placeholder="15.00"
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Minimum order (GHS)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.minSpend}
                  onChange={(e) => setDraft({ ...draft, minSpend: e.target.value })}
                  placeholder="0.00"
                />
              </Field>

              <Field label="Expires">
                <Input
                  type="date"
                  value={draft.expiresAt}
                  onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Total claims" hint="Blank for unlimited.">
                <Input
                  type="number"
                  min={1}
                  value={draft.maxUses}
                  onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })}
                  placeholder="100"
                />
              </Field>

              <Field label="Per customer">
                <Input
                  type="number"
                  min={1}
                  value={draft.maxPerCustomer}
                  onChange={(e) => setDraft({ ...draft, maxPerCustomer: e.target.value })}
                />
              </Field>
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={draft.firstOrderOnly}
                onChange={(e) => setDraft({ ...draft, firstOrderOnly: e.target.checked })}
                className="h-3.5 w-3.5 accent-admin-accent"
              />
              <span className="text-[12px] text-admin-fg-2">First order only</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                className="h-3.5 w-3.5 accent-admin-accent"
              />
              <span className="text-[12px] text-admin-fg-2">Accepting redemptions</span>
            </label>

            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                disabled={busy || !draft.code.trim()}
                onClick={() => void save()}
              >
                {busy ? 'Saving…' : 'Save code'}
              </Button>
              {draft.code && (
                <Button onClick={() => setDraft(BLANK)} disabled={busy}>
                  New
                </Button>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
