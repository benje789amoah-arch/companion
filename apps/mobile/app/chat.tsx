/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRouter } from 'expo-router';
import { Activity, ArrowLeft, Send } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MessageSender } from '@freshfold/core';
import { useApp } from '../src/store/AppStore';
import { colors, radius, shadow } from '../src/theme';

const QUICK_REPLIES = [
  'I have arrived at the concierge lobby.',
  'Placing delicate garments in security sleeves.',
  'GPS recalculation requested.',
  'Please confirm the building entry buzzer number.',
];

/** Who a message is from, in the courier's language. */
const SENDER_LABELS: Record<MessageSender, string> = {
  rider: 'Me',
  customer: 'Customer',
  dispatcher: 'Dispatch',
  laundry_center: 'The hub',
};

export default function ChatScreen() {
  const router = useRouter();
  const { messages, activeOrder, sendRiderMessage } = useApp();

  // The job in hand is the conversation. Screens that open this one used to
  // name a recipient, which is no longer a thing the thread has.
  const orderId = activeOrder?.id;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);

  /**
   * The whole thread for this job — every sender, not just one.
   *
   * There is one conversation per order and the customer, dispatch and the hub
   * all write into it. Splitting it by recipient meant a courier sitting on the
   * default tab never saw the customer's messages at all, which is exactly the
   * moment ("which buzzer?") the thread exists for.
   *
   * Scoping to the order matters too: the poll fetches every conversation, so
   * without it a courier on their fourth pickup reads three earlier customers'
   * notes as if they were about the bags they are holding.
   */
  const thread = useMemo(
    () => messages.filter((msg) => msg.orderId === orderId),
    [messages, orderId]
  );

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [thread.length]);

  const send = () => {
    const text = draft.trim();
    if (!text || !orderId) return;
    sendRiderMessage(text);
    setDraft('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={17} color={colors.textCharcoal} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {activeOrder ? activeOrder.customerName : 'Communication core'}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {activeOrder ? `${activeOrder.orderNumber} • customer & dispatch` : 'No active job'}
          </Text>
        </View>

        <View style={styles.livePill}>
          <Activity size={14} color={colors.brandSage} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
        >
          {!orderId ? (
            <Text style={styles.emptyThread}>
              Accept a job to open its thread. Every message you send here reaches that
              customer and the dispatch desk.
            </Text>
          ) : thread.length === 0 ? (
            <Text style={styles.emptyThread}>
              Nothing said yet on this job. Say hello below.
            </Text>
          ) : (
            thread.map((msg) => {
              const mine = msg.sender === 'rider';
              return (
                <View
                  key={msg.id}
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                >
                  <Text style={[styles.bubbleMeta, mine && styles.bubbleMetaMine]}>
                    {SENDER_LABELS[msg.sender]} • {msg.timestamp}
                  </Text>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                    {msg.text}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>

        {!!orderId && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
            style={styles.quickBar}
          >
            {QUICK_REPLIES.map((reply) => (
              <Pressable
                key={reply}
                onPress={() => sendRiderMessage(reply)}
                style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.quickLabel}>{reply}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={orderId ? 'Write a message…' : 'Accept a job to start a thread'}
            placeholderTextColor={colors.textSlate}
            style={styles.input}
            editable={!!orderId}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable
            onPress={send}
            disabled={!orderId}
            accessibilityLabel="Send message"
            style={({ pressed }) => [
              styles.sendButton,
              !orderId && { opacity: 0.4 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Send size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgIvory },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.cardPure,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgLinen,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 12.5, fontWeight: '800', color: colors.textCharcoal },
  headerSubtitle: { fontSize: 9, color: colors.textSlate, marginTop: 1 },
  livePill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(111, 122, 99, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  thread: { flex: 1 },
  threadContent: { padding: 16, gap: 10, paddingBottom: 8 },
  emptyThread: {
    fontSize: 11,
    color: colors.textSlate,
    textAlign: 'center',
    marginTop: 28,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 3,
    ...shadow.xs,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brandSage,
    borderTopRightRadius: 4,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.cardPure,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderTopLeftRadius: 4,
  },
  bubbleMeta: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textSlate,
  },
  bubbleMetaMine: { color: 'rgba(255,255,255,0.8)' },
  bubbleText: { fontSize: 11.5, lineHeight: 16, color: colors.textCharcoal },
  bubbleTextMine: { color: '#FFFFFF' },

  quickBar: {
    maxHeight: 46,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.cardPure,
  },
  quickRow: { gap: 7, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  quickChip: {
    backgroundColor: colors.bgLinen,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  quickLabel: { fontSize: 9.5, fontWeight: '600', color: colors.textCharcoal },

  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.cardPure,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    padding: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.bgIvory,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 12.5,
    color: colors.textCharcoal,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSage,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
