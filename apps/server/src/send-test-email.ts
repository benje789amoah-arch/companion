/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import { emailConfigured, sendMail, verificationMail } from './email';

/**
 * One-off check that the Resend credentials actually deliver.
 *
 * Goes through the same `sendMail` the register route uses, so a success here
 * means the real flow works — but it writes nothing and creates no account, so
 * running it leaves no trace in the database.
 *
 *   npx tsx apps/server/src/send-test-email.ts you@example.com
 */

dotenv.config({ path: 'apps/server/.env' });

const to = process.argv[2];

if (!to) {
  console.error('Usage: tsx apps/server/src/send-test-email.ts <recipient>');
  process.exit(1);
}

console.log(`[test] RESEND_API_KEY ${emailConfigured() ? 'is set' : 'is NOT set'}`);
console.log(`[test] EMAIL_FROM = ${process.env.EMAIL_FROM ?? '(unset)'}`);
console.log(`[test] sending to ${to}…`);

const link = `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/auth/verify?token=test-link-not-real`;

sendMail(verificationMail(to, 'Test Recipient', link))
  .then((ok) => {
    console.log(ok ? '[test] RESULT: accepted by Resend' : '[test] RESULT: NOT sent — see error above');
    process.exit(ok ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error('[test] threw:', error);
    process.exit(1);
  });
