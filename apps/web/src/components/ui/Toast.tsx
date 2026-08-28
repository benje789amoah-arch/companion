import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

/**
 * Short confirmations that do not deserve a dialog.
 *
 * The site had two ways to tell somebody what just happened: a `Banner` inside
 * a panel, which needs a panel to sit in and stays until something re-renders
 * it, and a label on the button that was pressed. Neither fits an outcome that
 * arrives *after* the button has been let go, or that has to report a failure
 * the button cannot show.
 *
 * The copy control in `RosterPanel` is the case that prompted this. It swapped
 * its own label to "Copied" — but it did so unconditionally, next to a
 * `navigator.clipboard?.writeText()` whose promise nothing awaited. On a
 * browser with no clipboard API, or one that refused the write because the
 * document was not focused, it reported success for something that had not
 * happened, and a supervisor read a rider their PIN off an empty paste.
 *
 * A toast is the right size for that class of thing: it happened, here is
 * whether it worked, and you do not need to acknowledge it. Anything a
 * customer must act on is a `Banner` or a dialog and stays on the screen.
 *
 * `--z-toast` has been in the token stack since it was written and nothing had
 * ever used it. This is what it was for.
 */

export type ToastTone = 'ok' | 'bad' | 'note';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

/** Long enough to read a short sentence twice, which is the usual advice. */
const DISMISS_MS = 4200;

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

/**
 * Raise a toast.
 *
 * Safe to call from anywhere below the provider, including from a component
 * that may be rendered outside it — it returns a no-op rather than throwing,
 * because a missing toast is never worth taking a screen down for.
 */
export function useToast(): (message: string, tone?: ToastTone) => void {
  const show = useContext(ToastContext);
  return show ?? noop;
}

const noop = () => {};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: ToastTone = 'ok') => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-2), { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, DISMISS_MS);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  // `show` is stable, so this context value never changes identity and no
  // consumer re-renders because a toast appeared somewhere else on the page.
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        Bottom-left on a phone, bottom-right on a desk.

        Not bottom-right on a phone: that is where the sticky booking bar's
        button is, and a toast that covers "Book a pickup" for four seconds is
        worse than no toast. `bottom-24` clears the bar itself.
      */}
      <div
        // The region is always mounted and always announced, so a toast that
        // arrives into it is read out. A live region created at the same
        // moment as its content is not reliably announced by any screen
        // reader — the region has to exist first.
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-24 left-4 right-4 z-[var(--z-toast)] flex flex-col items-start gap-2 font-ui sm:bottom-5 sm:left-auto sm:right-5 sm:items-end"
      >
        {toasts.map((toast) => {
          const skin = {
            ok: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
            bad: 'border-red-500/25 bg-red-500/10 text-red-200',
            note: 'border-brand-gold/30 bg-brand-gold/10 text-brand-gold-light',
          }[toast.tone];
          const Icon = toast.tone === 'ok' ? Check : toast.tone === 'bad' ? AlertTriangle : Info;

          return (
            <div
              key={toast.id}
              className={`toast-in pointer-events-auto flex max-w-[24rem] items-start gap-2.5 rounded-md border bg-brand-card px-4 py-3 text-[14px] leading-relaxed shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-sm ${skin}`}
            >
              <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="-mr-1 -mt-1 shrink-0 rounded p-1 opacity-60 transition-opacity duration-200 hover:opacity-100"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
