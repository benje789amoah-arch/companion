/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Desk settings and the audit trail.
 *
 * The audit trail is the reason this tab exists, so it gets the width. Entries
 * are colour-coded by kind — a payment reversal and a stage confirmation are not
 * the same event, and scanning for the former in a wall of identical grey rows is
 * what the colour is for.
 *
 * What is rendered here is the server's record, shared by every desk. It used to
 * be this browser's: `AdminDashboard` composed each entry itself, kept fifty of
 * them in `localStorage`, and showed them to nobody else — so a colleague could
 * not see what you had changed, and clearing site data erased the lot. Entries
 * are now written by the route that performs the action and read back through
 * `GET /api/admin/audit`, which also means the timestamp is the database's and
 * carries a date rather than being a bare `14:32` from whatever this machine's
 * clock said.
 */

import { AlertTriangle, FileText, ScrollText, ShieldCheck } from 'lucide-react';
import type { AuditEvent } from '@freshfold/core';
import { Badge, EmptyState, Panel, type Tone } from './ui';

const LOG_TONE: Record<AuditEvent['type'], Tone> = {
  payment: 'ok',
  points: 'accent',
  stage: 'info',
  order: 'danger',
  account: 'warn',
  roster: 'info',
  /**
   * Nobody did it, and that is the point of the colour.
   *
   * A `system` entry is the hub's timer advancing a stage on elapsed time —
   * telling a customer their laundry was washed on no evidence at all. Left
   * neutral so it reads as what it is: the absence of somebody's confirmation,
   * not an action with a name behind it.
   */
  system: 'neutral',
};

/** The database's instant, as a date and a time. */
function when(at: string): string {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime())
    ? at
    : parsed.toLocaleString([], {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export default function SettingsPanel({
  supervisor,
  auditEvents,
  auditError,
}: {
  supervisor: string;
  auditEvents: AuditEvent[];
  /** Why the trail could not be read, when it could not be. */
  auditError: string | null;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
      <div className="space-y-4">
        <Panel title="Session" bodyClassName="divide-y divide-admin-line">
          <Row label="Signed in as" value={supervisor} />
          <Row label="Region" value="Kumasi operations" />
          <Row label="Authentication" value="Server-verified desk token" />
        </Panel>

        <Panel title="Credentials" bodyClassName="p-4">
          {/*
            A "master desk PIN" form used to live here. It stored `1212` in
            component state, guarded nothing, and changing it changed nothing —
            the real credential is the supervisor password the server checks
            and hashes.
          */}
          <div className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-admin-fg-3" />
            <p className="text-[12px] leading-relaxed text-admin-fg-2">
              Passwords are set per supervisor and verified on the server. To change yours, or
              to add another supervisor, speak to whoever administers the dispatch server —
              nothing on this screen can alter a credential.
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        title="Audit trail"
        description="The server's record of every desk action, newest first. Shared by every supervisor."
        actions={
          auditError ? (
            <Badge tone="danger">Unavailable</Badge>
          ) : (
            <Badge mono>
              last {auditEvents.length} event{auditEvents.length === 1 ? '' : 's'}
            </Badge>
          )
        }
      >
        {/*
          Three states, not two. An empty trail and an unreadable one look
          identical if you only check `length`, and this pane's entire claim is
          that it shows what happened — so it has to be able to say when it does
          not know.
        */}
        {auditError ? (
          <EmptyState
            icon={AlertTriangle}
            title="The trail could not be read"
            detail={`${auditError} Nothing has been lost — the record is on the server, and this pane will show it again once the server answers.`}
          />
        ) : auditEvents.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No events recorded yet"
            detail="Stage confirmations, payment settlements, points adjustments and roster changes are recorded here as they are made."
          />
        ) : (
          <div className="admin-scroll max-h-[calc(100vh-320px)] divide-y divide-admin-line overflow-y-auto">
            {auditEvents.map((event) => (
              <div key={event.id} className="flex gap-3 px-5 py-2.5">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-admin-fg-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={LOG_TONE[event.type]}>{event.action}</Badge>
                    <span className="font-mono text-[11px] tabular-nums text-admin-fg-3">
                      {when(event.at)}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-admin-fg-2">
                    {event.details}
                  </p>
                  <span className="mt-0.5 block text-[11px] text-admin-fg-3">
                    {event.actorName}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-[12px]">
      <span className="shrink-0 text-admin-fg-3">{label}</span>
      <span className="min-w-0 truncate text-right text-admin-fg">{value}</span>
    </div>
  );
}
