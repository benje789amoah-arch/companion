/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { Message, Notification } from '@freshfold/core';
import { store } from '../store';
import { guard, nowLabel, notFound } from '../helpers';

/**
 * One conversation per job, visible from all three surfaces: the customer
 * writes from the client portal, the rider from the companion app's chat, and
 * dispatch narration is appended automatically as the job's status advances
 * (see `routes/orders.ts`).
 */
export const messagesRouter = Router();

/**
 * Both collections carry a foreign key to the job they belong to, so an id
 * that names no job is rejected here rather than surfacing as a constraint
 * violation and a 500. The key is what makes deleting a booking take its
 * conversation with it instead of leaving messages addressed to nothing.
 */
async function unknownOrder(orderId: string | undefined): Promise<boolean> {
  if (!orderId) return false;
  return (await store.jobs.find(orderId)) === null;
}

messagesRouter.get(
  '/',
  guard(async (req, res) => {
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : null;
    res.json(await store.messages.list(orderId));
  })
);

messagesRouter.post(
  '/',
  guard(async (req, res) => {
    const incoming = req.body as Partial<Message>;
    if (!incoming?.text || !incoming.sender) {
      res.status(400).json({ error: 'A message needs a sender and text.' });
      return;
    }

    if (await unknownOrder(incoming.orderId)) {
      notFound(res, 'Order');
      return;
    }

    const message: Message = {
      id: incoming.id || `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sender: incoming.sender,
      text: incoming.text,
      timestamp: incoming.timestamp || nowLabel(),
      orderId: incoming.orderId,
    };

    res.status(201).json(await store.messages.insert(message));
  })
);

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  guard(async (_req, res) => {
    res.json(await store.notifications.list());
  })
);

notificationsRouter.post(
  '/',
  guard(async (req, res) => {
    const incoming = req.body as Partial<Notification>;
    if (!incoming?.title || !incoming.body) {
      res.status(400).json({ error: 'A notification needs a title and body.' });
      return;
    }

    if (await unknownOrder(incoming.orderId)) {
      notFound(res, 'Order');
      return;
    }

    const notification: Notification = {
      id: incoming.id || `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: incoming.title,
      body: incoming.body,
      timestamp: incoming.timestamp || nowLabel(),
      type: incoming.type ?? 'system',
      orderId: incoming.orderId,
      read: incoming.read ?? false,
    };

    res.status(201).json(await store.notifications.insert(notification));
  })
);

notificationsRouter.post(
  '/:id/read',
  guard(async (req, res) => {
    const notification = await store.notifications.markRead(req.params.id);

    if (!notification) {
      notFound(res, 'Notification');
      return;
    }
    res.json(notification);
  })
);
