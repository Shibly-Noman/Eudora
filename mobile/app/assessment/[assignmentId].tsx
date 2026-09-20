import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, X, XCircle } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveUploadUrl } from '@/core/api/baseQuery';
import type {
  AssessmentAttempt,
  AttemptQuestionQuestion,
  CardQuestion,
} from '@/core/contracts';
import {
  useGetAssignmentQuery,
  useGetAttemptQuestionsQuery,
  useSaveResponseMutation,
  useStartAttemptMutation,
  useSubmitAttemptMutation,
} from '@/features/assessment/assessmentApi';
import { WidgetSelector } from '@/features/lesson/WidgetSelector';
import { Button } from '@/ui/primitives/Button';
import { MathText } from '@/ui/primitives/MathText';
import { ProgressBar } from '@/ui/primitives/ProgressBar';
import { Text } from '@/ui/primitives/Text';
import { useTheme } from '@/ui/theme/ThemeProvider';

/**
 * A student-safe question never carries `correctAnswer`/`option.isCorrect`
 * (see `toStudentSafeAttemptQuestions` on the backend) — `WidgetSelector`'s
 * `CardQuestion` type still declares those fields since lessons use the same
 * component, so they're backfilled here with values that are never read
 * while `locked` stays false (assessments show no per-question reveal until
 * the whole attempt is graded).
 */
function toCardQuestion(q: AttemptQuestionQuestion): CardQuestion {
  return {
    id: q.id,
    prompt: q.prompt,
    promptImageUrl: q.promptImageUrl,
    questionType: q.questionType,
    widgetType: q.widgetType,
    widgetConfig: q.widgetConfig,
    explanation: null,
    hints: q.hints,
    correctAnswer: null,
    options: q.options.map((o) => ({ ...o, isCorrect: false })),
  };
}

function buildResponsePayload(question: CardQuestion, widgetState: any) {
  return question.widgetType === 'STANDARD_MCQ'
    ? { selectedOptionId: widgetState?.selectedOptionId }
    : { interactionState: widgetState };
}

function elapsedSeconds(startedAtMs: number): number {
  return Math.max(0, Math.round((Date.now() - startedAtMs) / 1000));
}

export default function AssessmentPlayerScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();

  const { data: assignment, isLoading: loadingAssignment } =
    useGetAssignmentQuery(assignmentId!, { skip: !assignmentId });

  const [startAttempt, { isLoading: starting, error: startError }] =
    useStartAttemptMutation();
  const [saveResponse] = useSaveResponseMutation();
  const [submitAttempt, { isLoading: submitting }] = useSubmitAttemptMutation();

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [result, setResult] = useState<AssessmentAttempt | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const startedAtMs = useRef<number | null>(null);
  // The backend's per-question save endpoint 400s if `timeSpentSeconds` is
  // omitted entirely (a real bug — omitting it errors, but explicit `0`
  // doesn't) — always sending a real elapsed value sidesteps it and is
  // useful data regardless.
  const questionStartedAtMs = useRef<number>(Date.now());

  const { data: rawQuestions, isLoading: loadingQuestions } =
    useGetAttemptQuestionsQuery(attemptId!, { skip: !attemptId });

  const questions = (rawQuestions ?? []).map((q) => ({
    ...q,
    question: toCardQuestion(q.question),
  }));
  const card = questions[cardIndex];

  const handleSubmitTest = React.useCallback(async () => {
    if (!attemptId) return;
    if (card && answers[card.question.id] !== undefined) {
      await saveResponse({
        assessmentAttemptId: attemptId,
        questionId: card.question.id,
        timeSpentSeconds: elapsedSeconds(questionStartedAtMs.current),
        ...buildResponsePayload(card.question, answers[card.question.id]),
      });
    }
    const res = await submitAttempt(attemptId).unwrap();
    setResult(res);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, card, answers, saveResponse, submitAttempt]);

  // Countdown + auto-submit once the assessment's estimated duration elapses.
  useEffect(() => {
    const minutes = assignment?.assessment.estimatedDurationMinutes;
    if (!minutes || !startedAtMs.current || result) return;
    const deadline = startedAtMs.current + minutes * 60_000;

    const tick = () => {
      const secondsLeft = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemainingSeconds(secondsLeft);
      if (secondsLeft === 0) void handleSubmitTest();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [assignment, attemptId, result, handleSubmitTest]);

  if (loadingAssignment || !assignment) {
    return (
      <View style={centered(t.colors.background)}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  const handleStart = async () => {
    try {
      const attempt = await startAttempt({
        assessmentAssignmentId: assignment.id,
      }).unwrap();
      startedAtMs.current = new Date(attempt.startedAt).getTime();
      questionStartedAtMs.current = Date.now();
      setAttemptId(attempt.id);
    } catch {
      // Surfaced via startError below (e.g. maxAttempts already used).
    }
  };

  // ─── Rules screen ──────────────────────────────────────────────────────
  if (!attemptId) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: t.colors.background }}
        contentContainerStyle={{
          padding: t.spacing.xl,
          paddingTop: insets.top + t.spacing.xl,
        }}
      >
        <Text variant="title">{assignment.assessment.title}</Text>
        {assignment.assessment.description ? (
          <>
            <View style={{ height: t.spacing.md }} />
            <Text variant="body" color="mutedForeground">
              {assignment.assessment.description}
            </Text>
          </>
        ) : null}

        <View style={{ height: t.spacing.xl }} />
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <RuleStat label="Total marks" value={String(assignment.assessment.totalMarks)} />
          {assignment.assessment.estimatedDurationMinutes ? (
            <RuleStat
              label="Time limit"
              value={`${assignment.assessment.estimatedDurationMinutes} min`}
            />
          ) : null}
          {assignment.assessment.maxAttempts ? (
            <RuleStat label="Max attempts" value={String(assignment.assessment.maxAttempts)} />
          ) : null}
        </View>

        {startError ? (
          <>
            <View style={{ height: t.spacing.lg }} />
            <Text variant="label" color="destructive">
              {(startError as any)?.data?.message ?? 'Could not start the assessment.'}
            </Text>
          </>
        ) : null}

        <View style={{ height: t.spacing.xxl }} />
        <Button
          title="Start Assessment"
          onPress={handleStart}
          loading={starting}
          fullWidth
        />
      </ScrollView>
    );
  }

  // ─── Result screen ─────────────────────────────────────────────────────
  if (result) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: t.colors.background }}
        contentContainerStyle={{
          padding: t.spacing.xl,
          paddingTop: insets.top + t.spacing.xl,
          paddingBottom: insets.bottom + t.spacing.xxl,
        }}
      >
        <Text variant="title">Assessment submitted</Text>
        <View style={{ height: t.spacing.xs }} />
        <Text variant="heading" color="primary">
          {result.rawScore} / {result.maxScore} ({Math.round(result.percentageScore ?? 0)}%)
        </Text>

        <View style={{ height: t.spacing.xl }} />
        <View style={{ gap: t.spacing.md }}>
          {result.responses.map((r: any, i: number) => (
            <View
              key={r.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.sm,
                padding: t.spacing.md,
                borderRadius: t.radius.lg,
                backgroundColor: t.colors.card,
                borderWidth: 1,
                borderColor: t.colors.border,
              }}
            >
              {r.isCorrect ? (
                <CheckCircle2 size={18} color={t.colors.success} />
              ) : (
                <XCircle size={18} color={t.colors.destructive} />
              )}
              <Text variant="body" style={{ flex: 1 }}>
                Question {i + 1}
              </Text>
              <Text variant="caption" color="mutedForeground">
                {r.marksAwarded ?? 0}/{r.marksAvailable}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ height: t.spacing.xl }} />
        <Button title="Done" onPress={() => router.back()} fullWidth />
      </ScrollView>
    );
  }

  // ─── Taking the assessment ─────────────────────────────────────────────
  if (loadingQuestions || !card) {
    return (
      <View style={centered(t.colors.background)}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  const goTo = async (nextIndex: number) => {
    const currentAnswer = answers[card.question.id];
    if (currentAnswer !== undefined) {
      void saveResponse({
        assessmentAttemptId: attemptId,
        questionId: card.question.id,
        timeSpentSeconds: elapsedSeconds(questionStartedAtMs.current),
        ...buildResponsePayload(card.question, currentAnswer),
      });
    }
    questionStartedAtMs.current = Date.now();
    setCardIndex(Math.max(0, Math.min(nextIndex, questions.length - 1)));
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
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
          accessibilityLabel="Exit assessment"
          hitSlop={8}
        >
          <X size={22} color={t.colors.mutedForeground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar value={(cardIndex + 1) / questions.length} />
        </View>
        {remainingSeconds != null ? (
          <Text variant="label" color={remainingSeconds < 60 ? 'destructive' : 'mutedForeground'}>
            {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}
          </Text>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.xl, paddingBottom: t.spacing.xxxl }}
      >
        <Text variant="caption" color="mutedForeground">
          {card.section.title} · Question {cardIndex + 1} of {questions.length} ·{' '}
          {card.marksAvailable} {card.marksAvailable === 1 ? 'mark' : 'marks'}
        </Text>
        <View style={{ height: t.spacing.md }} />
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
        <View style={{ height: t.spacing.lg }} />

        <WidgetSelector
          question={card.question}
          currentState={answers[card.question.id] ?? null}
          onStateChange={(state) =>
            setAnswers((prev) => ({ ...prev, [card.question.id]: state }))
          }
          locked={false}
        />
      </ScrollView>

      <View
        style={{
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.lg,
          borderTopWidth: 1,
          borderTopColor: t.colors.border,
          backgroundColor: t.colors.card,
          gap: t.spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          <Button
            title="Previous"
            variant="secondary"
            onPress={() => goTo(cardIndex - 1)}
            disabled={cardIndex === 0}
            style={{ flex: 1 }}
          />
          <Button
            title="Next"
            variant="secondary"
            onPress={() => goTo(cardIndex + 1)}
            disabled={cardIndex >= questions.length - 1}
            style={{ flex: 1 }}
          />
        </View>
        <Button
          title="Submit Test"
          onPress={handleSubmitTest}
          loading={submitting}
          fullWidth
        />
      </View>
    </View>
  );
}

function RuleStat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: t.spacing.md,
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.card,
        borderWidth: 1,
        borderColor: t.colors.border,
        alignItems: 'center',
      }}
    >
      <Text variant="heading">{value}</Text>
      <Text variant="caption" color="mutedForeground">
        {label}
      </Text>
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
