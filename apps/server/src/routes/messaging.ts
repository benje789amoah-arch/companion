/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { Message, Notification } from '@freshfold/core';
import { store } from '../store';
import { nowLabel, notFound } from '../helpers';

/**
 * One conversation per job, visible from all three surfaces: the customer
 * writes from the client portal, the rider from the companion app's chat, and
 * dispatch narration is appended automatically as the job's status advances
 * (see `routes/orders.ts`).
 */
export const messagesRouter = Router();

messagesRouter.get('/', (req, res) => {
  const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : null;
  const messages = store.read().messages.filter((m) => !orderId || m.orderId === orderId);
  res.json(messages);
});

messagesRouter.post('/', (req, res) => {
  const incoming = req.body as Partial<Message>;
  if (!incoming?.text || !incoming.sender) {
    return res.status(400).json({ error: 'A message needs a sender and text.' });
  }

  const message: Message = {
    id: incoming.id || `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sender: incoming.sender,
    text: incoming.text,
    timestamp: incoming.timestamp || nowLabel(),
    orderId: incoming.orderId,
  };

  store.mutate((db) => db.messages.push(message));
  res.status(201).json(message);
});

export const notificationsRouter = Router();

notificationsRouter.get('/', (_req, res) => {
  res.json(store.read().notifications);
});

notificationsRouter.post('/', (req, res) => {
  const incoming = req.body as Partial<Notification>;
  if (!incoming?.title || !incoming.body) {
    return res.status(400).json({ error: 'A notification needs a title and body.' });
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

  store.mutate((db) => db.notifications.unshift(notification));
  res.status(201).json(notification);
});

notificationsRouter.post('/:id/read', (req, res) => {
  const notification = store.mutate((db) => {
    const match = db.notifications.find((candidate) => candidate.id === req.params.id);
    if (!match) return null;
    match.read = true;
    return match;
  });

  if (!notification) return notFound(res, 'Notification');
  res.json(notification);
});
