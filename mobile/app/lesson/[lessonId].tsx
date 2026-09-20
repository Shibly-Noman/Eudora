import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, Volume2, X, XCircle } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveUploadUrl } from '@/core/api/baseQuery';
import type { SubmitCardPayload, SubmitCardResult } from '@/core/contracts';
import { playSoundEffect } from '@/core/sound/soundEffects';
import { playText, playVoiceLine } from '@/core/sound/voiceFeedback';
import { useActingChild } from '@/features/guardian/useActingChild';
import { LessonCompleteOverlay } from '@/features/lesson/LessonCompleteOverlay';
import { WidgetSelector } from '@/features/lesson/WidgetSelector';
import {
  useGetLessonFlowQuery,
  useSubmitCardMutation,
} from '@/features/lesson/lessonApi';
import { XpBurst, type XpBurstHandle } from '@/features/gamification/XpBurst';
import { Button } from '@/ui/primitives/Button';
import { Mascot, type MascotState } from '@/ui/mascot/Mascot';
import { MathText } from '@/ui/primitives/MathText';
import { ProgressBar } from '@/ui/primitives/ProgressBar';
import { Text } from '@/ui/primitives/Text';
import { useTheme } from '@/ui/theme/ThemeProvider';

// The web version delays the completion celebration so the student can read
// the last card's correct/incorrect feedback before it's covered.
const LESSON_COMPLETE_DELAY_MS = 1500;

export default function LessonPlayerScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();

  const { actingChildId } = useActingChild();
  const { data: flow, isLoading } = useGetLessonFlowQuery(
    { lessonId: lessonId!, actingChildId },
    { skip: !lessonId },
  );
  const [submitCard, { isLoading: submitting }] = useSubmitCardMutation();

  const [cardIndex, setCardIndex] = useState(0);
  // Generic per-card answer state, matching the web player's
  // `widgetState: Record<cardId, any>` — shape depends on the widget type
  // (`{selectedOptionId}` for MCQ, `{finalValue}` for slider, `{pairs}` for
  // grid matching), which WidgetSelector and the submit payload builder below
  // both switch on.
  const [widgetState, setWidgetState] = useState<any>(null);
  const [result, setResult] = useState<SubmitCardResult | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [complete, setComplete] = useState(false);
  const [showCompleteOverlay, setShowCompleteOverlay] = useState(false);
  const cardStartedAt = useRef(Date.now());
  const xpBurstRef = useRef<XpBurstHandle>(null);
  const completeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (completeTimeout.current) clearTimeout(completeTimeout.current);
    };
  }, []);

  const cards = flow?.lesson.cards ?? [];
  const card = cards[cardIndex];
  const hasQuestion = Boolean(card?.question);
  const progress = cards.length ? (cardIndex + (result ? 1 : 0)) / cards.length : 0;

  // Mirrors the web player's mascot-state effect: celebrate/wrong once
  // feedback is showing, thinking while a widget is mid-interaction, idle
  // otherwise.
  const mascotState: MascotState = result
    ? result.isCorrect
      ? 'celebrate'
      : 'wrong'
    : widgetState
      ? 'thinking'
      : 'idle';

  if (isLoading || !flow) {
    return (
      <View style={centered(t.colors.background)}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  if (!card) {
    return (
      <View style={centered(t.colors.background)}>
        <Text variant="body" color="mutedForeground">
          This lesson has no cards yet.
        </Text>
      </View>
    );
  }

  const handleSubmit = async () => {
    if (!card) return;
    const timeSpentSeconds = Math.max(
      1,
      Math.round((Date.now() - cardStartedAt.current) / 1000),
    );

    try {
      const payload: SubmitCardPayload = { timeSpentSeconds };
      if (hasQuestion) {
        // MCQ is the one widget type the backend reads from a dedicated field
        // rather than the generic bag — matches web's handleCheckAnswer.
        if (card.question?.widgetType === 'STANDARD_MCQ') {
          payload.selectedOptionId = widgetState?.selectedOptionId;
        } else {
          payload.interactionState = widgetState;
        }
      }

      const res = await submitCard({
        cardId: card.id,
        lessonId: flow.lesson.id,
        body: payload,
      }).unwrap();

      setResult(res);
      setSessionXp((xp) => xp + res.xpEarned);

      // Answer feedback is the moment the app should feel physical.
      void Haptics.notificationAsync(
        res.isCorrect
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );
      playSoundEffect(res.isCorrect ? 'correct' : 'incorrect');
      playVoiceLine(res.isCorrect ? 'CORRECT' : 'INCORRECT');
      if (!res.isCorrect && res.correctReveal) {
        // Same result-shown moment as the "Try again" line above, not a
        // separate reveal step — queued rather than interrupting it.
        playVoiceLine('ANSWER_REVEALED', { interrupt: false });
      }
      if (res.xpEarned > 0) xpBurstRef.current?.play();

      if (res.isLessonComplete) {
        setComplete(true);
        completeTimeout.current = setTimeout(() => {
          setShowCompleteOverlay(true);
          playSoundEffect('levelUp');
          playVoiceLine('LESSON_COMPLETE');
        }, LESSON_COMPLETE_DELAY_MS);
      }
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  const handleNext = () => {
    if (complete) {
      router.back();
      return;
    }
    setResult(null);
    setWidgetState(null);
    setHintShown(false);
    cardStartedAt.current = Date.now();
    setCardIndex((i) => Math.min(i + 1, cards.length - 1));
  };

  const canSubmit = hasQuestion ? Boolean(widgetState) : true;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      {/* Header: exit + progress + running XP */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          paddingHorizontal: t.spacing.lg,
          paddingTop: insets.top + t.spacing.sm,
          paddingBottom: t.spacing.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Exit lesson"
          hitSlop={8}
        >
          <X size={22} color={t.colors.mutedForeground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar value={progress} />
        </View>
        <View>
          <Text variant="label" color="primary">
            +{sessionXp} XP
          </Text>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: -32, right: -32 }}
          >
            <XpBurst ref={xpBurstRef} size={80} />
          </View>
        </View>
      </View>

      <View style={{ alignItems: 'center', paddingBottom: t.spacing.sm }}>
        <Mascot state={mascotState} size={96} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: t.spacing.xl,
          paddingBottom: t.spacing.xxxl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: t.spacing.md,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="mutedForeground">
              Card {cardIndex + 1} of {cards.length} · {card.cardType.toLowerCase()}
            </Text>
            <Text variant="heading" style={{ marginTop: t.spacing.xs }}>
              {card.title}
            </Text>
          </View>
          {/* For pre-readers who can't yet read the card themselves — narrates
              the raw prompt/content text on demand rather than auto-playing,
              since card text isn't guaranteed short (unlike the fixed
              feedback phrases voiceFeedback.ts otherwise plays). */}
          <Pressable
            onPress={() =>
              playText(
                card.question ? `${card.content} ${card.question.prompt}` : card.content,
              )
            }
            accessibilityRole="button"
            accessibilityLabel="Listen to this card"
            hitSlop={8}
            style={{
              width: 40,
              height: 40,
              borderRadius: t.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.colors.accent,
            }}
          >
            <Volume2 size={18} color={t.colors.primary} />
          </Pressable>
        </View>

        <View style={{ height: t.spacing.lg }} />
        <MathText variant="body">{card.content}</MathText>

        {card.question ? (
          <>
            <View style={{ height: t.spacing.xl }} />
            <MathText variant="label">{card.question.prompt}</MathText>
            {card.question.promptImageUrl ? (
              <>
                <View style={{ height: t.spacing.md }} />
                <Image
                  source={{ uri: resolveUploadUrl(card.question.promptImageUrl) ?? undefined }}
                  accessibilityLabel="Question prompt"
                  resizeMode="contain"
                  style={{
                    width: '100%',
                    height: 200,
                    borderRadius: t.radius.lg,
                    backgroundColor: t.colors.muted,
                  }}
                />
              </>
            ) : null}

            {card.question.hints && card.question.hints.length > 0 && !result ? (
              <>
                <View style={{ height: t.spacing.md }} />
                {hintShown ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: t.spacing.md,
                      borderRadius: t.radius.md,
                      backgroundColor: t.colors.accent + '1a',
                    }}
                  >
                    <Text variant="caption" color="mutedForeground" style={{ flex: 1 }}>
                      💡 {card.question.hints[0]}
                    </Text>
                    <Pressable
                      onPress={() => playText(card.question?.hints?.[0] || '')}
                      accessibilityRole="button"
                      accessibilityLabel="Listen to hint"
                      hitSlop={8}
                    >
                      <Volume2 size={16} color={t.colors.primary} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      setHintShown(true);
                      playVoiceLine('TAKE_A_HINT');
                      if (card.question?.hints?.[0]) {
                        playText(card.question.hints[0], { interrupt: false });
                      }
                    }}
                    accessibilityRole="button"
                  >
                    <Text variant="label" color="primary">
                      Show a hint
                    </Text>
                  </Pressable>
                )}
              </>
            ) : null}

            <View style={{ height: t.spacing.lg }} />

            <WidgetSelector
              question={card.question}
              currentState={widgetState}
              onStateChange={setWidgetState}
              locked={Boolean(result)}
              isCorrect={result?.isCorrect}
              correctReveal={result?.correctReveal}
            />
          </>
        ) : null}

        {result ? (
          <View
            style={{
              marginTop: t.spacing.xl,
              padding: t.spacing.lg,
              borderRadius: t.radius.lg,
              backgroundColor:
                (result.isCorrect ? t.colors.success : t.colors.destructive) +
                '14',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.sm,
              }}
            >
              {result.isCorrect ? (
                <CheckCircle2 size={20} color={t.colors.success} />
              ) : (
                <XCircle size={20} color={t.colors.destructive} />
              )}
              <Text
                variant="label"
                color={result.isCorrect ? 'success' : 'destructive'}
              >
                {result.isCorrect ? 'Correct' : 'Not quite'}
                {result.xpEarned > 0 ? ` · +${result.xpEarned} XP` : ''}
              </Text>
            </View>
            {result.explanation ? (
              <View style={{ marginTop: t.spacing.sm }}>
                <MathText variant="body">{result.explanation}</MathText>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Action footer */}
      <View
        style={{
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.lg,
          borderTopWidth: 1,
          borderTopColor: t.colors.border,
          backgroundColor: t.colors.card,
        }}
      >
        {result ? (
          <Button
            title={
              complete
                ? 'Finish lesson'
                : cardIndex >= cards.length - 1
                  ? 'Done'
                  : 'Continue'
            }
            onPress={handleNext}
            fullWidth
          />
        ) : (
          <Button
            title={hasQuestion ? 'Check answer' : 'Continue'}
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
            fullWidth
          />
        )}
      </View>

      {showCompleteOverlay ? (
        <LessonCompleteOverlay xpEarned={sessionXp} onContinue={() => router.back()} />
      ) : null}
    </View>
  );
}

function centered(background: string) {
  return {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: background,
  };
}
