/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import {
  MIN_PASSWORD_LENGTH,
  PHONE_LENGTH_MESSAGE,
  isCompletePhone,
  passwordProblem,
  phoneDigits,
  phoneKey,
} from '@freshfold/core';
import { bearerToken, createSession, requireAuth, revokeSession } from '../auth';
import { passwordResetMail, sendMail, verificationMail, type Mail } from '../email';
import { settleAccountByEmail } from '../membership';
import { hashPassword, needsRehash, sanitize, verifyPassword } from '../passwords';
import { credentialLimit, rateLimit } from '../rateLimit';
import {
  EMAIL_SHAPE,
  findSetupToken,
  hashSetupToken,
  mailBookingConfirmation,
} from '../setup-links';
import { store, type StoredAccount } from '../store';
import { accountBlocked, bookingView, guard } from '../helpers';
import { cspNonce } from '../headers';

/**
 * Sign-up and sign-in.
 *
 * These routes exist so that a password is compared on the server. The client
 * portal used to fetch every account and check the password in the browser,
 * which meant the whole credential table had to be readable by anyone. Now the
 * only thing that crosses the wire is the attempt and a yes/no.
 */
export const authRouter = Router();

/** How long a confirmation link stays good for. */
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The gap enforced between confirmation emails for one account.
 *
 * The resend button is unauthenticated in effect — anyone holding a session can
 * press it — and each press costs a real email against a real quota. A minute
 * is long enough that a mistyped-address panic cannot empty the month's
 * allowance, and short enough that a customer who genuinely did not receive the
 * first one is not left waiting.
 */
const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * How long a reset link stays good for.
 *
 * An hour rather than the confirmation link's twenty-four: this one takes over
 * an account rather than confirming an address, and it sits in an inbox that
 * may itself be the thing that was compromised. Long enough for somebody to
 * find the mail on another device, short enough that a forgotten one is dead
 * before it is found.
 */
const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * The gap enforced between reset emails for one account.
 *
 * `/auth/forgot` is unauthenticated by necessity, so without this anyone could
 * use it to mail a customer repeatedly, and to burn the sending quota while
 * they were at it.
 */
const RESET_COOLDOWN_MS = 60 * 1000;

/**
 * Mints a confirmation link, records its digest and returns the mail to send.
 *
 * The raw token exists only inside this function and inside the email; what
 * lands in the database is a sha-256 of it.
 *
 * Minting and sending are separate steps on purpose. The digest and its clock
 * have to be in the row before the caller answers — the resend cooldown is
 * armed by that write, and a customer who pressed the button the moment the
 * form returned would otherwise be handed a second link for free. The send is a
 * call to a third party with a ten-second budget of its own, and whether it
 * belongs before or after the response is the caller's decision to make.
 */
async function mintVerification(account: StoredAccount): Promise<Mail> {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();

  await store.accounts.setVerificationToken(account.email, {
    hash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(now + VERIFICATION_TTL_MS).toISOString(),
    sentAt: new Date(now).toISOString(),
  });

  const base = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
  const link = `${base}/api/auth/verify?token=${token}`;

  return verificationMail(account.email, account.name, link);
}

/**
 * The ceiling on creating accounts.
 *
 * This route had no limit at all, and the note by `/login` explaining the
 * omission — "`/register` creates rather than guesses" — was true about
 * guessing and wrong about cost. Three things a caller got for free here:
 *
 *  - **Mail to somebody else's inbox.** Registering an address sends it a
 *    FreshFold confirmation from a verified sender. Repeat it and FreshFold is
 *    the one delivering the flood. The 60-second cooldown guards
 *    `/resend-verification`, which is a different route.
 *  - **The month's sending quota.** A few thousand of these empties the Brevo
 *    allowance, after which real confirmations and real reset links stop
 *    arriving — silently, because the send happens after the response and is
 *    only logged.
 *  - **A membership oracle.** The 409 below distinguishes an address that
 *    exists from one that does not, at whatever rate somebody cares to ask.
 *    `/login` and `/forgot` both work hard to avoid saying exactly this.
 *
 * And a fourth that is not about email: every attempt runs a blocking
 * `scryptSync` before it looks anything up, so an unbounded register is an
 * unbounded way to occupy the event loop of a single-process server.
 *
 * Three buckets, because there are three things worth counting separately.
 * `credentialLimit` supplies the first two — one address (stops a flood aimed
 * at one inbox) and one caller (stops a walk across many). The phone bucket is
 * the third, and it is here because the 409 fires on *either* identifier: a
 * caller with a fresh email each time and a target's number in the box is
 * enumerating phone numbers, and the email bucket never fills.
 *
 * An hour rather than the sign-in routes' quarter of one, and three rather than
 * fifteen: registering is something a person does once. Somebody who mistypes
 * their address, corrects it, and hits a duplicate-phone conflict has used
 * three, which is the honest worst case for a real customer and the reason it
 * is not two.
 */
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

const REGISTER_LIMIT_MESSAGE =
  'Too many sign-up attempts from here. Try again in an hour, or sign in if you already have an account.';

const registerLimit: RequestHandler[] = [
  ...credentialLimit({
    perIdentifier: 3,
    perAddress: 10,
    windowMs: REGISTER_WINDOW_MS,
    field: 'email',
    message: REGISTER_LIMIT_MESSAGE,
  }),
  rateLimit({
    max: 3,
    windowMs: REGISTER_WINDOW_MS,
    message: REGISTER_LIMIT_MESSAGE,
    // Keyed on the comparable part of the number, the same nine digits
    // `phone_key` is generated from, so `0244 000 000`, `+233244000000` and
    // `244000000` share one bucket rather than buying three. A body with no
    // usable number returns null and skips this limiter; the route refuses it a
    // few lines later for not being a whole number.
    key: (req) => {
      const phone = (req.body as { phone?: unknown } | undefined)?.phone;
      if (typeof phone !== 'string') return null;
      const key = phoneKey(phone);
      return key.length === 9 ? `phone:${key}` : null;
    },
  }),
];

authRouter.post(
  '/register',
  ...registerLimit,
  guard(async (req, res) => {
    const { email, phone, name, password } = req.body as {
      email?: string;
      phone?: string;
      name?: string;
      password?: string;
    };

    if (!email || !phone || !password) {
      res.status(400).json({ error: 'Email, phone and password are all required.' });
      return;
    }
    // Length *and* the common-password list, from `@freshfold/core` so the two
    // apps refuse the same passwords this does rather than each keeping their
    // own idea of the rule — which is how the website came to accept five
    // characters while the customer app insisted on six.
    const weak = passwordProblem(password);
    if (weak) {
      res.status(400).json({ error: weak, reason: 'weak-password' });
      return;
    }
    if (!isCompletePhone(phone)) {
      res.status(400).json({ error: PHONE_LENGTH_MESSAGE });
      return;
    }

    const { salt, hash } = await hashPassword(password);

    const outcome = await store.tx(async (t) => {
      const existing = await t.accounts.findByEmailOrPhone(email, phone);

      // A suspended customer cannot register their way back in — neither by
      // claiming the blocked account, which is what a passwordless one would
      // allow, nor by putting a new address on the same phone number, which is
      // the branch below that carries the old record's details across.
      if (existing?.blockedAt) return { kind: 'blocked' } as const;

      // An account created by a booking has no password yet — claiming it is
      // the normal path from the "set up your tracking login" link, not a
      // conflict.
      if (existing?.passwordHash) return { kind: 'taken' } as const;

      const claimable = existing && existing.email.toLowerCase() === email.trim().toLowerCase();

      if (claimable) {
        const account = await t.accounts.setPassword(existing.email, {
          salt,
          hash,
          name: name || undefined,
          phone: phoneDigits(phone),
        });
        // The fallback covers the row being deleted between the read and the
        // write. Two registrations racing for the same address is the unique
        // index on lower(email)'s problem, and it fails the loser rather than
        // letting both through.
        return { kind: 'ok', account: account ?? existing } as const;
      }

      // The match was on the phone number of an account under a different
      // email. That becomes a new account carrying the name and join date of
      // the record it was recognised from.
      const account = await t.accounts.insert({
        email,
        phone: phoneDigits(phone),
        name: name || existing?.name || '',
        createdAt: existing?.createdAt || new Date().toISOString(),
        passwordSalt: salt,
        passwordHash: hash,
      });

      return { kind: 'ok', account } as const;
    });

    if (outcome.kind === 'blocked') {
      accountBlocked(res);
      return;
    }

    if (outcome.kind === 'taken') {
      res
        .status(409)
        .json({ error: 'An account already exists for this email or phone. Please sign in.' });
      return;
    }

    const session = await createSession('customer', outcome.account.email);

    // Already-confirmed accounts are left alone. That covers the ones this
    // feature grandfathered in, and the customer who set a password, confirmed,
    // and is now claiming a second account on the same address.
    const mail = outcome.account.emailVerified ? null : await mintVerification(outcome.account);

    // `outcome.account` is the row the transaction returned, and everything
    // `mintVerification` wrote on top of it is stripped by `sanitize` — so
    // re-reading here would cost a round trip to say the same thing.
    res.status(201).json({
      token: session.token,
      account: sanitize(outcome.account),
    });

    // The send happens *after* the response, deliberately.
    //
    // By this point the account exists, the session is minted and the link is
    // recorded — everything the customer is about to be told. Waiting on Resend
    // before answering put a third party's ten-second budget on the critical
    // path of the one route that cannot be safely retried: a connection that
    // drops while we sit there leaves somebody holding an account they were
    // told had failed, and a 409 when they try again. Nothing in the 201
    // depends on the outcome, and a link that never arrives is what the resend
    // button is for.
    //
    // Logged rather than returned, for the same reason `/auth/forgot` logs its
    // failure: this is the only place it is visible.
    if (mail) {
      void sendMail(mail).then((sent) => {
        if (!sent) console.error(`[auth] verification mail failed for ${outcome.account.email}`);
      });
    }
  })
);

/**
 * Confirms an address from the link in the email.
 *
 * A GET returning HTML rather than JSON, because what opens this is a mail
 * client handing the URL to a browser — there is no application code on the
 * other end to render a response. Both apps learn the outcome from their next
 * `/api/auth/me`, not from here.
 *
 * Deliberately not behind `requireAuth`: the customer may well confirm on a
 * phone that has never signed in, or from a desktop while the app sits on their
 * other device. Holding the token is the proof; that is the whole point of it.
 */
authRouter.get(
  '/verify',
  guard(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';

    if (!token) {
      res.status(400).type('html').send(verificationPage(false, 'That link is incomplete.'));
      return;
    }

    const hash = createHash('sha256').update(token).digest('hex');
    const account = await store.accounts.findByVerificationToken(hash);

    // One message for "no such token", "already spent" and "expired" alike.
    // Telling them apart would let somebody probe which links were real.
    if (!account) {
      res
        .status(400)
        .type('html')
        .send(
          verificationPage(
            false,
            'That link has expired or has already been used. Sign in and ask for a new one.'
          )
        );
      return;
    }

    await store.accounts.markEmailVerified(account.email);
    res.type('html').send(verificationPage(true, 'Your email address is confirmed.'));
  })
);

/**
 * Sends another confirmation link to the signed-in account.
 *
 * Behind `requireAuth` so this cannot be pointed at an address the caller does
 * not hold a session for — an open version would be a way to have FreshFold
 * mail anybody repeatedly.
 */
authRouter.post(
  '/resend-verification',
  requireAuth,
  guard(async (req, res) => {
    const account = req.account!;

    if (account.emailVerified) {
      res.status(409).json({ error: 'This address is already confirmed.' });
      return;
    }

    const last = account.verificationSentAt ? Date.parse(account.verificationSentAt) : 0;
    const waitMs = last + RESEND_COOLDOWN_MS - Date.now();

    if (waitMs > 0) {
      res.status(429).json({
        error: `Another link was just sent. Try again in ${Math.ceil(waitMs / 1000)} seconds.`,
      });
      return;
    }

    // Awaited here, unlike in `/register`: telling the customer whether the
    // message got out is this route's entire job, and there is no half-created
    // account riding on the answer.
    const sent = await sendMail(await mintVerification(account));

    if (!sent) {
      res
        .status(502)
        .json({ error: 'We could not send the email just now. Please try again shortly.' });
      return;
    }

    res.json({ ok: true });
  })
);

/**
 * The page the confirmation link lands on.
 *
 * Self-contained HTML with no assets: it is served by the API, which in
 * development is a different origin from the website and has no stylesheet to
 * offer. `APP_URL` is where the button goes, so the customer ends up back in
 * the product rather than staring at a dead end on the API host.
 */
function verificationPage(ok: boolean, message: string): string {
  const home = (process.env.APP_URL || '').replace(/\/$/, '');
  const accent = ok ? '#7d8b7f' : '#b4472f';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? 'Email confirmed' : 'Link not valid'} — FreshFold</title>
</head>
<body style="margin:0;background:#faf8f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2f3437">
  <div style="max-width:460px;margin:0 auto;padding:64px 24px;text-align:center">
    <p style="font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:${accent};margin:0 0 10px">
      FreshFold
    </p>
    <h1 style="font-size:23px;font-weight:800;margin:0 0 14px">
      ${ok ? 'Email confirmed' : 'That link did not work'}
    </h1>
    <p style="font-size:14px;line-height:22px;color:#5b6560;margin:0 0 28px">${message}</p>
    ${
      home
        ? `<a href="${home}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:700">Continue to FreshFold</a>`
        : ''
    }
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/**
 * Asks for a reset link.
 *
 * Always answers `{ ok: true }` — for an address with no account, for one on
 * cooldown, and for a send that failed. The response cannot be used to work out
 * who banks here, which matters more than telling the one honest caller in a
 * thousand why nothing arrived. The rate limit is silent for the same reason:
 * "try again in 40 seconds" confirms the account exists.
 *
 * `identifier` may be an email or a phone number, because that is what the
 * sign-in field accepts and somebody who cannot get in should not have to
 * remember which one they used. The link only ever goes to the address on the
 * account, never to anything supplied in the request.
 */
authRouter.post(
  '/forgot',
  guard(async (req, res) => {
    const { identifier } = req.body as { identifier?: string };

    if (!identifier?.trim()) {
      res.status(400).json({ error: 'An email or phone number is required.' });
      return;
    }

    const account = await store.accounts.findByIdentifier(identifier.trim());

    // Everything below is best-effort and deliberately invisible to the caller.
    // A suspended account is skipped in the same silence as an address with no
    // account at all: the new password could not be used to sign in anyway, and
    // saying so here would confirm both that the account exists and what has
    // happened to it.
    if (account?.email && !account.blockedAt) {
      const last = account.resetSentAt ? Date.parse(account.resetSentAt) : 0;

      if (Date.now() - last >= RESET_COOLDOWN_MS) {
        const token = randomBytes(32).toString('hex');
        const now = Date.now();

        await store.accounts.setResetToken(account.email, {
          hash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(now + RESET_TTL_MS).toISOString(),
          sentAt: new Date(now).toISOString(),
        });

        const base = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
        const sent = await sendMail(
          passwordResetMail(account.email, account.name, `${base}/api/auth/reset?token=${token}`)
        );

        // Logged, not returned: the customer is told to check their inbox
        // either way, and this is the only place the failure is visible.
        if (!sent) console.error(`[auth] reset mail failed for ${account.email}`);
      }
    }

    res.json({ ok: true });
  })
);

/**
 * The page the reset link lands on.
 *
 * Server-rendered for the reason the confirmation page is: a mail client hands
 * this URL to a browser, and there is no application code on the other end. The
 * token is validated before the form is drawn, so a dead link says so rather
 * than letting somebody type a new password into a form that cannot work.
 *
 * The form posts JSON to the route below with `fetch` rather than as a normal
 * form submission, so the API stays JSON-only and both apps can drive the same
 * endpoint.
 */
authRouter.get(
  '/reset',
  guard(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const hash = token ? createHash('sha256').update(token).digest('hex') : '';
    const account = hash ? await store.accounts.findByResetToken(hash) : null;

    if (!account) {
      res
        .status(400)
        .type('html')
        .send(
          resetPage(
            null,
            'That link has expired or has already been used. Ask for a new one from the app.',
            cspNonce(res)
          )
        );
      return;
    }

    res.type('html').send(resetPage(token, '', cspNonce(res)));
  })
);

/**
 * Sets the new password.
 *
 * Holding the token is the proof, so this is not behind `requireAuth` — the
 * customer cannot sign in, which is the entire problem. Three things happen
 * together: the password is replaced, the link is spent, and every existing
 * session for the account is revoked.
 */
authRouter.post(
  '/reset',
  guard(async (req, res) => {
    const { token, password } = req.body as { token?: string; password?: string };

    if (!token || !password) {
      res.status(400).json({ error: 'A reset link and a new password are both required.' });
      return;
    }
    // Length *and* the common-password list, from `@freshfold/core` so the two
    // apps refuse the same passwords this does rather than each keeping their
    // own idea of the rule — which is how the website came to accept five
    // characters while the customer app insisted on six.
    const weak = passwordProblem(password);
    if (weak) {
      res.status(400).json({ error: weak, reason: 'weak-password' });
      return;
    }

    const hash = createHash('sha256').update(token).digest('hex');
    const { salt, hash: passwordHash } = await hashPassword(password);

    const account = await store.tx(async (t) => {
      // Re-read inside the transaction: two tabs submitting the same link
      // should not both succeed, and the second finds the token already spent.
      const found = await t.accounts.findByResetToken(hash);
      if (!found) return null;

      await t.accounts.setPassword(found.email, { salt, hash: passwordHash });
      await t.accounts.clearResetToken(found.email);

      // Confirming the address as a side effect is sound rather than lax: the
      // link went to that mailbox and came back, which is the same proof
      // /auth/verify asks for. A customer who reset from an unconfirmed address
      // should not then be told to go and prove it again.
      if (!found.emailVerified) await t.accounts.markEmailVerified(found.email);

      return found;
    });

    if (!account) {
      res.status(400).json({ error: 'That link has expired or has already been used.' });
      return;
    }

    // Outside the transaction: sessions are a separate concern, and a failure
    // here must not roll back a password the customer has already been told
    // about. Whoever held the old one is signed out.
    await store.sessions.revokeAllFor('customer', account.email);

    res.json({ ok: true });
  })
);

/**
 * The reset form, or the reason there isn't one.
 *
 * `token` null renders the dead-link message instead of the form. The token is
 * echoed into a hidden field rather than read back out of `location.search` by
 * the script, so nothing here depends on the URL surviving a redirect.
 *
 * The inline script is the only JavaScript FreshFold serves from the API host.
 * It posts to `/api/auth/reset` and swaps the panel for the outcome — no
 * framework, no assets, nothing to load from a third party into a page that is
 * about to hold somebody's new password.
 */
function resetPage(token: string | null, message: string, nonce: string): string {
  const home = (process.env.APP_URL || '').replace(/\/$/, '');
  const accent = token ? '#7d8b7f' : '#b4472f';

  const body = token
    ? `
    <form id="form" style="text-align:left">
      <input type="hidden" id="token" value="${escapeAttribute(token)}">
      <label for="password" style="display:block;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#7d8b7f;font-weight:700;margin:0 0 7px">
        New password
      </label>
      <input type="password" id="password" required minlength="${MIN_PASSWORD_LENGTH}" autocomplete="new-password"
             style="width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #e2ded7;border-radius:12px;font-size:15px;margin:0 0 16px">
      <label for="confirm" style="display:block;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#7d8b7f;font-weight:700;margin:0 0 7px">
        Type it again
      </label>
      <input type="password" id="confirm" required minlength="${MIN_PASSWORD_LENGTH}" autocomplete="new-password"
             style="width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #e2ded7;border-radius:12px;font-size:15px;margin:0 0 20px">
      <p id="error" style="display:none;font-size:13px;line-height:20px;color:#b4472f;margin:0 0 16px"></p>
      <button type="submit" id="submit"
              style="width:100%;background:${accent};color:#fff;border:0;padding:14px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer">
        Set new password
      </button>
    </form>
    <script nonce="${nonce}">
      (function () {
        var form = document.getElementById('form');
        var error = document.getElementById('error');
        var submit = document.getElementById('submit');

        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var password = document.getElementById('password').value;
          var confirm = document.getElementById('confirm').value;

          if (password !== confirm) {
            error.textContent = 'Those two do not match.';
            error.style.display = 'block';
            return;
          }

          error.style.display = 'none';
          submit.disabled = true;
          submit.textContent = 'Saving…';

          fetch('/api/auth/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: document.getElementById('token').value, password: password })
          })
            .then(function (response) {
              return response.json().then(function (body) {
                return { ok: response.ok, body: body };
              });
            })
            .then(function (result) {
              if (!result.ok) throw new Error((result.body && result.body.error) || 'That did not work.');
              document.getElementById('panel').innerHTML =
                '<h1 style="font-size:23px;font-weight:800;margin:0 0 14px">Password changed</h1>' +
                '<p style="font-size:14px;line-height:22px;color:#5b6560;margin:0 0 28px">' +
                'Sign in with your new password. Any device that was already signed in has been signed out.</p>' +
                ${home ? `'<a href="${escapeAttribute(home)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:700">Continue to FreshFold</a>'` : "''"};
            })
            .catch(function (failure) {
              error.textContent = failure.message;
              error.style.display = 'block';
              submit.disabled = false;
              submit.textContent = 'Set new password';
            });
        });
      })();
    </script>`
    : `
    <p style="font-size:14px;line-height:22px;color:#5b6560;margin:0 0 28px">${escapeAttribute(message)}</p>
    ${
      home
        ? `<a href="${escapeAttribute(home)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:700">Continue to FreshFold</a>`
        : ''
    }`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${token ? 'Choose a new password' : 'Link not valid'} — FreshFold</title>
</head>
<body style="margin:0;background:#faf8f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2f3437">
  <div id="panel" style="max-width:420px;margin:0 auto;padding:56px 24px;text-align:center">
    <p style="font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:${accent};margin:0 0 10px">
      FreshFold
    </p>
    <h1 style="font-size:23px;font-weight:800;margin:0 0 14px">
      ${token ? 'Choose a new password' : 'That link did not work'}
    </h1>
    ${body}
  </div>
</body>
</html>`;
}

/**
 * Escapes a value going into an HTML attribute or a JS string literal.
 *
 * The token is hex from `randomBytes` and `APP_URL` is our own configuration,
 * so neither is hostile today — but this page holds a password field, and a
 * template that interpolates without escaping is one config change away from
 * being the wrong kind of interesting.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sign in.
 *
 * The loosest of the three credential limits, because it guards the strongest
 * credential and the largest population: a password of at least
 * `MIN_PASSWORD_LENGTH`, held by every customer, several of whom will be behind
 * one university NAT at the same time. Fifteen tries a quarter-hour is well past
 * what somebody who has forgotten which of two passwords they used needs, and
 * nowhere near enough to walk a dictionary.
 *
 * `/register`, `/forgot` and `/reset` are deliberately not limited here.
 * `/forgot` has its own per-account cooldown and answers identically either
 * way, `/reset` needs a 32-byte token before it does anything at all, and
 * `/register` creates rather than guesses.
 */
authRouter.post(
  '/login',
  ...credentialLimit({
    perIdentifier: 15,
    perAddress: 50,
    windowMs: 15 * 60 * 1000,
    field: 'identifier',
  }),
  guard(async (req, res) => {
    const { identifier, password } = req.body as { identifier?: string; password?: string };

    if (!identifier || !password) {
      res.status(400).json({ error: 'Credentials cannot be left empty.' });
      return;
    }

    const account = await store.accounts.findByIdentifier(identifier);

    /**
     * One message for "no such account" and "wrong password" alike, so this
     * endpoint can't be used to enumerate who has an account.
     *
     * `verifyPassword` is called even when there is no account, and the missing
     * `!account ||` short-circuit is the point rather than an omission: it used
     * to skip the hash entirely, so an unknown address answered in about a
     * millisecond while a real one paid the full scrypt cost. The message was
     * identical and the clock was not. `verifyPassword` now burns the same time
     * against a dummy credential — see the note beside it — so the two branches
     * cost the same and the wording is doing what it claims.
     */
    const credentialsMatch = await verifyPassword(password, account);
    if (!account || !credentialsMatch) {
      res.status(401).json({ error: 'No matching patron credentials found.' });
      return;
    }

    // Checked after the password, like the courier console checks an expired
    // PIN after the hash: somebody who does not already hold the credential
    // learns nothing about who has been suspended.
    if (account.blockedAt) {
      accountBlocked(res);
      return;
    }

    if (needsRehash(account.passwordHash)) {
      /**
       * Upgrade the stored hash, if it was made under weaker parameters.
       *
       * This is the only moment the plain secret is in hand to re-derive from, so
       * it is the only moment the cost can be raised without asking anybody to
       * change anything. Deliberately not awaited and deliberately not fatal — a
       * failed upgrade must not fail the sign-in that triggered it, and the next
       * sign-in will try again.
       */
      void hashPassword(password)
        .then((upgraded) => store.accounts.setPassword(account.email, upgraded))
        .catch((error: unknown) => console.error('[auth] password re-hash failed:', error));
    }

    const session = await createSession('customer', account.email);

    // Settled on the way in: a membership that renewed — or ran out of wallet
    // and lapsed — while the customer was away is resolved before they are
    // shown a balance or a plan.
    const settled = (await settleAccountByEmail(account.email)) ?? account;

    res.json({ token: session.token, account: sanitize(settled) });
  })
);

authRouter.post(
  '/logout',
  guard(async (req, res) => {
    const token = bearerToken(req);
    if (token) await revokeSession(token);
    res.json({ ok: true });
  })
);

/**
 * The account behind the token, with its membership brought up to date.
 *
 * The app polls this, which is what makes lazy renewal feel like a scheduler:
 * a plan whose month is up renews (or lapses) the next time the customer opens
 * the app, and the balance they see already reflects it.
 */
authRouter.get(
  '/me',
  requireAuth,
  guard(async (req, res) => {
    const settled = (await settleAccountByEmail(req.account!.email)) ?? req.account!;
    res.json(sanitize(settled));
  })
);

// ---------------------------------------------------------------------------
// Claiming an account from a booking
// ---------------------------------------------------------------------------

/**
 * The booking behind a setup link.
 *
 * What the password screen draws before anybody types anything: the customer
 * should see which pickup they are about to attach a login to, and the app has
 * nothing else to identify it by — the link carries a token and no booking id.
 *
 * Holding the token is the proof, so this is not behind `requireAuth`; the
 * whole point is that the caller has no account yet. It is also why the details
 * are safe to return: this route answers the mailbox the booking named, and it
 * says nothing at all to a caller who guessed.
 */
authRouter.get(
  '/claim',
  guard(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const link = await findSetupToken(token);
    const job = link ? await store.jobs.find(link.bookingId) : null;

    // One message for "no such token", "expired", "already spent" and "the
    // order was deleted" alike, so this cannot be used to probe which links
    // were ever real.
    if (!job) {
      res.status(400).json({
        error: 'That link has expired or has already been used.',
        code: 'SETUP_LINK_INVALID',
      });
      return;
    }

    res.json({
      booking: {
        id: job.id,
        name: job.customer.name,
        email: job.customer.email,
        phone: job.customer.phone,
      },
    });
  })
);

/**
 * Sets the first password on the account behind a booking, and signs them in.
 *
 * This is how a customer who booked as a guest gets a login. `/auth/register`
 * can still do it — that is the path for somebody signing up on their own — but
 * it will take any booking's email and phone from anyone who types them. This
 * one requires the token that was mailed to the address on the order, which is
 * the difference between a stranger being able to claim a pickup they guessed
 * the reference of and not.
 *
 * The link is spent inside the transaction, before anything is written, so two
 * tabs submitting it cannot both create an account. It stays spent even on the
 * refusals below: a link is only ever the right to set a *first* password, and
 * once there is one it can never do anything again.
 */
authRouter.post(
  '/claim',
  guard(async (req, res) => {
    const { token, password } = req.body as { token?: string; password?: string };

    if (!token || !password) {
      res.status(400).json({ error: 'A setup link and a password are both required.' });
      return;
    }
    // Length *and* the common-password list, from `@freshfold/core` so the two
    // apps refuse the same passwords this does rather than each keeping their
    // own idea of the rule — which is how the website came to accept five
    // characters while the customer app insisted on six.
    const weak = passwordProblem(password);
    if (weak) {
      res.status(400).json({ error: weak, reason: 'weak-password' });
      return;
    }

    const { salt, hash } = await hashPassword(password);

    const outcome = await store.tx(async (t) => {
      // Spent on the transaction's own connection, not the pool's: the delete
      // has to roll back with everything below it if any of this fails.
      const link = await t.setupTokens.spend(hashSetupToken(token));
      const job = link ? await t.jobs.find(link.bookingId) : null;
      if (!link || !job) return { kind: 'dead' } as const;

      const email = (job.customer.email || link.email).trim();
      const phone = phoneDigits(job.customer.phone ?? '');
      const existing = await t.accounts.findByEmailOrPhone(email, phone);

      if (existing?.blockedAt) return { kind: 'blocked' } as const;

      // Somebody already set one — on this address or on this number under
      // another address. Same answer as `/auth/register` gives, and for the
      // same reason: a link cannot take an account over, only open a new one.
      if (existing?.passwordHash) return { kind: 'taken' } as const;

      const account = existing
        ? await t.accounts.setPassword(existing.email, {
            salt,
            hash,
            name: job.customer.name || undefined,
            phone: phone || undefined,
          })
        : await t.accounts.insert({
            email,
            phone,
            name: job.customer.name || '',
            // Dated from the pickup that created it rather than from this
            // moment, so "patron since" reads as the first order rather than
            // as whenever they got round to opening the email.
            createdAt: job.createdAt,
            passwordSalt: salt,
            passwordHash: hash,
          });

      const claimed = account ?? existing;
      if (!claimed) return { kind: 'dead' } as const;

      // Confirming the address as a side effect is sound rather than lax: the
      // link went to that mailbox and came back, which is the same proof
      // `/auth/verify` asks for. Only when the account *is* that address —
      // matching on the phone number can land on a different one, and nothing
      // has been proven about that inbox.
      if (!claimed.emailVerified && claimed.email.toLowerCase() === link.email.trim().toLowerCase()) {
        await t.accounts.markEmailVerified(claimed.email);
      }

      return { kind: 'ok', account: claimed } as const;
    });

    if (outcome.kind === 'blocked') {
      accountBlocked(res);
      return;
    }
    if (outcome.kind === 'taken') {
      res.status(409).json({
        error: 'This contact already has a password. Please sign in, or use the reset link.',
      });
      return;
    }
    if (outcome.kind === 'dead') {
      res.status(400).json({
        error:
          'That link has expired or has already been used. If you set a password already, sign in.',
        code: 'SETUP_LINK_INVALID',
      });
      return;
    }

    const session = await createSession('customer', outcome.account.email);

    // Re-read for the membership only. `markEmailVerified` wrote after the row
    // this closure is holding, and the account is about to be drawn as the
    // patron's profile.
    const settled = (await settleAccountByEmail(outcome.account.email)) ?? outcome.account;

    res.status(201).json({ token: session.token, account: sanitize(settled) });
  })
);

/**
 * The gap enforced between setup links for one booking.
 *
 * `/auth/resend-setup` is unauthenticated by necessity — the caller has no
 * account yet, which is the entire problem — so without this it is a way to
 * have FreshFold mail a customer repeatedly and to burn the sending quota
 * doing it.
 */
const SETUP_RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Sends the setup link again, to the address on the booking.
 *
 * The counterpart to `/auth/forgot` for somebody who has never had a password:
 * a reset link only exists for an account, and a guest who lost their
 * confirmation email has a booking and nothing else. Without this, one deleted
 * message would mean that pickup could never be tracked — the in-browser
 * shortcut that used to cover it was exactly the hole the token closed.
 *
 * Always answers `{ ok: true }`: for a contact with no booking, for one already
 * holding a password, for a link still inside its cooldown and for a send that
 * failed. Any of those distinctions would turn this into a way to ask which
 * addresses have booked with FreshFold.
 *
 * An email address only, unlike the sign-in field. The link has to go to an
 * inbox, and a phone number does not name one.
 */
authRouter.post(
  '/resend-setup',
  guard(async (req, res) => {
    const { identifier } = req.body as { identifier?: string };

    if (!identifier?.trim()) {
      res.status(400).json({ error: 'An email address is required.' });
      return;
    }

    const email = identifier.trim();

    // Everything below is best-effort and deliberately invisible to the caller.
    if (EMAIL_SHAPE.test(email)) {
      const account = await store.accounts.find(email);

      // Somebody with a password does not need a setup link, and sending one
      // would be a way to mail an existing customer on demand. They have
      // `/auth/forgot`.
      if (!account?.passwordHash) {
        // The most recent booking on the address — `list` orders by creation
        // date, newest first — because that is the one they are chasing.
        const [job] = await store.jobs.list({ email });

        if (job) {
          const outstanding = await store.setupTokens.findForBooking(job.id);
          const last = outstanding ? Date.parse(outstanding.createdAt) : 0;

          if (Date.now() - last >= SETUP_RESEND_COOLDOWN_MS) {
            // Mints a fresh token, which retires the one in any earlier mail:
            // the newest message in the inbox is the one that works.
            await mailBookingConfirmation(await bookingView(job));
          }
        }
      }
    }

    res.json({ ok: true });
  })
);

/**
 * Whether a contact already has a login, so the portal can route someone to
 * sign-in versus password setup. Returns only a boolean — never a name, never
 * an email, so it reveals nothing an attacker could not already guess.
 */
authRouter.post(
  '/status',
  guard(async (req, res) => {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier) {
      res.status(400).json({ error: 'An identifier is required.' });
      return;
    }

    const account = await store.accounts.findByIdentifier(identifier);
    res.json({ exists: Boolean(account), hasPassword: Boolean(account?.passwordHash) });
  })
);
