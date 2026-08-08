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
import { useApp } from '../src/store/AppStore';
import { colors, radius, shadow } from '../src/theme';

const QUICK_REPLIES = [
  'I have arrived at the concierge lobby.',
  'Placing delicate garments in security sleeves.',
  'GPS recalculation requested.',
  'Please confirm the building entry buzzer number.',
];

type ChatTarget = 'dispatcher' | 'customer';

export default function ChatScreen() {
  const router = useRouter();
  const { messages, sendRiderMessage } = useApp();

  const [target, setTarget] = useState<ChatTarget>('dispatcher');
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);

  const thread = useMemo(
    () => messages.filter((msg) => msg.sender === 'rider' || msg.sender === target),
    [messages, target]
  );

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [thread.length]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
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
          <Text style={styles.headerTitle}>Communication core</Text>
          <Text style={styles.headerSubtitle}>Connected with {target}</Text>
        </View>

        <View style={styles.livePill}>
          <Activity size={14} color={colors.brandSage} />
        </View>
      </View>

      <View style={styles.targetToggle}>
        {(['dispatcher', 'customer'] as ChatTarget[]).map((option) => (
          <Pressable
            key={option}
            onPress={() => setTarget(option)}
            style={[styles.targetButton, target === option && styles.targetButtonActive]}
          >
            <Text style={[styles.targetLabel, target === option && styles.targetLabelActive]}>
              {option}
            </Text>
          </Pressable>
        ))}
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
          {thread.length === 0 ? (
            <Text style={styles.emptyThread}>
              No messages with {target} yet. Say hello below.
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
                    {mine ? 'Me' : msg.sender} • {msg.timestamp}
                  </Text>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                    {msg.text}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>

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

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Send a message to ${target}…`}
            placeholderTextColor={colors.textSlate}
            style={styles.input}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable
            onPress={send}
            accessibilityLabel="Send message"
            style={({ pressed }) => [styles.sendButton, pressed && { opacity: 0.85 }]}
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

  targetToggle: {
    flexDirection: 'row',
    gap: 4,
    margin: 14,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.bgLinen,
  },
  targetButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm },
  targetButtonActive: { backgroundColor: colors.cardPure, ...shadow.xs },
  targetLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textSlate,
    textTransform: 'capitalize',
  },
  targetLabelActive: { color: colors.textCharcoal },

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
