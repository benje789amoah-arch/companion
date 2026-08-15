/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Desk settings and the audit trail.
 *
 * The audit trail is the reason this tab exists, so it gets the width. Log
 * entries are colour-coded by kind — a payment override and a stage advance
 * are not the same event, and scanning for the former in a wall of identical
 * grey rows is what the colour is for.
 */

import { FileText, ScrollText, ShieldCheck } from 'lucide-react';
import type { AuditLog } from '../../services/store';
import { Badge, EmptyState, Panel, type Tone } from './ui';

const LOG_TONE: Record<AuditLog['type'], Tone> = {
  payment: 'ok',
  points: 'accent',
  stage: 'info',
  system: 'neutral',
};

export default function SettingsPanel({
  supervisor,
  auditLogs,
}: {
  supervisor: string;
  auditLogs: AuditLog[];
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
        description="Every override this desk has made, newest first."
        actions={
          <Badge mono>
            {auditLogs.length} event{auditLogs.length === 1 ? '' : 's'}
          </Badge>
        }
      >
        {auditLogs.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No events recorded yet"
            detail="Stage advances, payment overrides and points adjustments are logged here as you make them."
          />
        ) : (
          <div className="admin-scroll max-h-[calc(100vh-320px)] divide-y divide-admin-line overflow-y-auto">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex gap-3 px-5 py-2.5">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-admin-fg-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={LOG_TONE[log.type]}>{log.action}</Badge>
                    <span className="font-mono text-[11px] tabular-nums text-admin-fg-3">
                      {log.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-admin-fg-2">
                    {log.details}
                  </p>
                  <span className="mt-0.5 block text-[11px] text-admin-fg-3">
                    {log.supervisor}
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
