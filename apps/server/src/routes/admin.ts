/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { bearerToken, createSession, requireSupervisor, revokeSession } from '../auth';
import { verifySecret } from '../passwords';
import { store, type StoredSupervisor, type SupervisorProfile } from '../store';
import { guard } from '../helpers';

/**
 * The supervisor desk.
 *
 * The dashboard behind this is the surface that can edit and delete the whole
 * ledger, and until now it was reachable by anyone who knew a URL fragment.
 * Supervisors are provisioned like couriers — there is no register route here —
 * and this session is what the roster-management endpoints require.
 */
export const adminRouter = Router();

/** Strips credentials so a supervisor record can be sent to the browser. */
function profile(supervisor: StoredSupervisor): SupervisorProfile {
  return { id: supervisor.id, name: supervisor.name, email: supervisor.email };
}

adminRouter.post(
  '/login',
  guard(async (req, res) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: 'An email and password are required.' });
      return;
    }

    const supervisor = await store.supervisors.findByEmail(email);

    // One message whether the address is unknown or the password is wrong, so
    // the response cannot be used to discover who works here.
    if (
      !supervisor ||
      !verifySecret(password, {
        salt: supervisor.passwordSalt,
        hash: supervisor.passwordHash,
      })
    ) {
      res.status(401).json({ error: 'Those credentials do not match.' });
      return;
    }

    if (supervisor.active === false) {
      res.status(403).json({ error: 'This supervisor account has been closed.' });
      return;
    }

    const session = await createSession('admin', supervisor.email);
    res.json({ token: session.token, supervisor: profile(supervisor) });
  })
);

/** Re-validates a stored token on load, and says whose desk it is. */
adminRouter.get('/me', requireSupervisor, (req, res) => {
  res.json(profile(req.supervisor!));
});

adminRouter.post(
  '/logout',
  guard(async (req, res) => {
    const token = bearerToken(req);
    if (token) await revokeSession(token);
    res.json({ ok: true });
  })
);
