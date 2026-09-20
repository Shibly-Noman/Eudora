"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { MathRenderer } from "@/components/MathRenderer";
import { ClioCard,useGetLessonFlowQuery, useSubmitCardMutation } from "@/features/clio/clioApi";
import { ClioMascot, type MascotState } from "@/features/clio/ClioMascot";
import { GamificationHUD } from "@/features/clio/GamificationHUD";
import { LessonCompleteModal } from "@/features/clio/LessonCompleteModal";
import {
  jumpToCard,
  nextCard,
  prevCard,
  resetLesson,
  revealNextHint,
  selectCardStartedAt,
  selectCurrentCardIndex,
  selectHintIndex,
  selectLastResult,
  selectSessionXp,
  selectShowExplanation,
  selectWidgetState as selectCardWidgetState,
  setWidgetState,
  showExplanation,
} from "@/features/clio/lessonSlice";
import { useClioVoice } from "@/features/clio/sound/useClioVoice";
import { WidgetSelector } from "@/features/clio/widgets/WidgetSelector";
import { useGetGamificationMeQuery } from "@/features/student/studentApi";
import { resolveUploadUrl } from "@/lib/uploads";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function LessonFlowPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();

  const lessonId = params.lessonId as string;

  // Fetch lesson data and current attempts
  const { data, isLoading, error, refetch } = useGetLessonFlowQuery(lessonId, {
    skip: !lessonId,
  });

  // The learner's real streak. Both the HUD and the completion modal used to
  // show `data.attempt?.id ? 4 : 3` — a number invented on the spot, to a
  // child, as a motivational promise. `/gamification/me` has always returned
  // the true value and is what /student and the mobile app already read.
  const { data: gamification } = useGetGamificationMeQuery();

  const [submitCard, { isLoading: isSubmitting }] = useSubmitCardMutation();

  // Local state selectors
  const currentCardIndex = useAppSelector(selectCurrentCardIndex);
  const showExpPanel = useAppSelector(selectShowExplanation);
  const lastResult = useAppSelector(selectLastResult);
  const hintIndex = useAppSelector(selectHintIndex);
  const sessionXp = useAppSelector(selectSessionXp);
  const cardStartedAt = useAppSelector(selectCardStartedAt);

  const [mascotState, setMascotState] = useState<MascotState>("idle");

  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);

  const { isMuted, isSpeaking, toggleMute, playPhrase, speakText, stop } = useClioVoice();

  const cards = React.useMemo(() => data?.lesson?.cards ?? [], [data]);
  const currentCard: ClioCard | undefined = cards[currentCardIndex];

  // Selected state for the current widget
  const currentWidgetState = useAppSelector(selectCardWidgetState(currentCard?.id ?? ""));

  // Resume progress from previous attempt cardResponses
  useEffect(() => {
    if (cards.length > 0 && data?.attempt?.cardResponses) {
      const answeredCardIds = data.attempt.cardResponses.map((r) => r.cardId);
      // Find first card that hasn't been answered yet
      const firstUnansweredIndex = cards.findIndex((card) => !answeredCardIds.includes(card.id));

      if (firstUnansweredIndex > 0) {
        dispatch(jumpToCard(firstUnansweredIndex));
      } else if (firstUnansweredIndex === -1) {
        // If all are answered, go to the last card or show completed screen
        dispatch(jumpToCard(cards.length - 1));
      }
    }
    return () => {
      // Clean up lesson state on unmount
      dispatch(resetLesson());
    };
  }, [data, cards, dispatch]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  // Set companion mascot reaction state
  useEffect(() => {
    if (showExpPanel && lastResult) {
      if (lastResult.isCorrect) {
        setMascotState("celebrate");
      } else {
        setMascotState("wrong");
      }
    } else if (isSpeaking) {
      setMascotState("hint");
    } else if (currentWidgetState) {
      setMascotState("thinking");
    } else {
      setMascotState("idle");
    }
  }, [showExpPanel, lastResult, isSpeaking, currentWidgetState]);

  if (isLoading) {
    return (
      <div className="bg-background text-foreground flex h-screen w-full flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground mt-4 text-sm font-semibold">
          Loading your immersive math journey...
        </p>
      </div>
    );
  }

  if (error || !data || !currentCard) {
    return (
      <div className="bg-background text-foreground flex h-screen w-full flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
        <h2 className="text-foreground mb-2 text-xl font-bold">Failed to load lesson flow</h2>
        <p className="text-muted-foreground mb-6 max-w-sm text-sm">
          There was an error retrieving the details for this active learning lesson. Please try
          again.
        </p>
        <button
          onClick={() => refetch()}
          className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Retry Load
        </button>
      </div>
    );
  }

  const handleWidgetStateChange = (newState: any) => {
    dispatch(
      setWidgetState({
        cardId: currentCard.id,
        state: newState,
      }),
    );
  };

  const handleCheckAnswer = async () => {
    if (isSubmitting || !currentCard) return;

    const timeSpent = Math.max(1, Math.round((Date.now() - (cardStartedAt ?? Date.now())) / 1000));

    // Build submission body depending on widget type
    const payload: any = {
      timeSpentSeconds: timeSpent,
    };

    if (currentCard.question?.widgetType === "STANDARD_MCQ") {
      payload.selectedOptionId = currentWidgetState?.selectedOptionId;
    } else {
      payload.interactionState = currentWidgetState;
    }

    try {
      const result = await submitCard({
        cardId: currentCard.id,
        body: payload,
      }).unwrap();

      dispatch(showExplanation(result));

      if (result.isCorrect) {
        playPhrase("CORRECT");
      } else {
        playPhrase("INCORRECT");
      }

      if (result.isLessonComplete) {
        // Delay opening modal slightly to let user celebrate/read correct state
        setTimeout(() => {
          setIsCompleteModalOpen(true);
          playPhrase("LESSON_COMPLETE");
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to submit card response:", err);
    }
  };

  const handleContinue = () => {
    if (currentCardIndex < cards.length - 1) {
      dispatch(nextCard());
    } else {
      setIsCompleteModalOpen(true);
    }
  };

  const handleExitToHub = () => {
    // Exiting a lesson always returns to the learning hub — a predictable
    // "leave focus mode" affordance for every role.
    router.push("/learning");
  };

  const hasQuestion = !!currentCard.question;
  const isAnswered = showExpPanel;
  const isCorrectAnswer = lastResult?.isCorrect;

  // Speech bubble text based on mascot states and hints
  const getMascotSpeech = () => {
    if (showExpPanel) {
      return isCorrectAnswer
        ? "Incredible! You solved it correctly! 🎉 Keep it up!"
        : "Not quite, but don't worry! Let's read the explanation together.";
    }
    if (hintIndex >= 0) {
      return "Aha! Hope this hint sheds some light on the concept! 💡";
    }
    if (currentWidgetState) {
      return "Hmm... interesting choice. Let's see if we can get this right!";
    }
    return "Hi, I'm Clio! Let's figure this out together. Ready when you are!";
  };

  return (
    <>
      {/* Immersive Gamification HUD Header */}
      <GamificationHUD
        lessonTitle={data.lesson.title}
        sessionXp={sessionXp}
        streakCount={gamification?.streak.currentStreak}
        lessonProgress={
          cards.length > 0 ? (currentCardIndex + (showExpPanel ? 1 : 0)) / cards.length : 0
        }
        onClose={handleExitToHub}
      />

      <main className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Left Workspace: Content, Widget, Controls */}
        <div className="flex flex-1 flex-col space-y-6 overflow-y-auto p-4 select-text md:space-y-8 md:p-8">
          {/* Card Meta / Navigation Header */}
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-bold">
              <span className="tracking-widest uppercase">Card</span>
              <span className="bg-muted text-foreground rounded-md px-2 py-0.5 text-[10px]">
                {currentCardIndex + 1} of {cards.length}
              </span>
              <span className="bg-border h-1.5 w-1.5 rounded-full" />
              <span className="tracking-wider text-primary uppercase">
                {currentCard.cardType}
              </span>
            </div>
            {currentCardIndex > 0 && !showExpPanel && (
              <button
                onClick={() => dispatch(prevCard())}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-bold transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}
          </div>

          {/* Card Body & Rich Content */}
          <div className="prose dark:prose-invert max-w-2xl">
            <h2 className="text-foreground mb-4 text-xl leading-tight font-black md:text-2xl">
              {currentCard.title}
            </h2>
            <div className="text-foreground/90 text-sm leading-relaxed font-normal whitespace-pre-wrap md:text-base">
              <MathRenderer text={currentCard.content} />
            </div>
          </div>

          {/* Interactive Widget Layer */}
          {hasQuestion && currentCard.question && (
            <div className="border-border max-w-2xl border-t py-4">
              <div className="mb-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold tracking-widest text-primary uppercase">
                    Question
                  </span>
                  <button
                    type="button"
                    onClick={() => speakText(currentCard.question?.prompt || "")}
                    title="Listen to question"
                    className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary transition-all hover:bg-primary/10 active:scale-95 cursor-pointer"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Listen</span>
                  </button>
                </div>
                <div className="text-foreground mt-1 text-sm font-semibold">
                  <MathRenderer text={currentCard.question.prompt} />
                </div>
                {currentCard.question.promptImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveUploadUrl(currentCard.question.promptImageUrl) || undefined}
                    alt="Question prompt"
                    className="mt-3 max-h-72 w-full rounded-2xl border border-border object-contain"
                  />
                )}
              </div>

              <WidgetSelector
                question={currentCard.question}
                currentState={currentWidgetState}
                onStateChange={handleWidgetStateChange}
                locked={showExpPanel}
                isCorrect={lastResult?.isCorrect}
                correctReveal={lastResult?.correctReveal}
              />
            </div>
          )}

          {/* Hints Section */}
          {hasQuestion &&
            currentCard.question &&
            currentCard.question.hints.length > 0 &&
            !showExpPanel && (
              <div className="max-w-2xl space-y-2.5">
                {Array.from({ length: hintIndex + 1 }).map((_, idx) => {
                  const hintText = currentCard.question?.hints[idx];
                  if (!hintText) return null;
                  return (
                    <div
                      key={idx}
                      className="animate-fade-in flex items-start justify-between gap-3 rounded-xl border border-warning/20 bg-warning/10 p-3.5 text-xs font-medium text-warning"
                    >
                      <div className="flex items-start gap-2.5">
                        <Lightbulb className="h-4.5 w-4.5 shrink-0 text-warning" />
                        <div>
                          <span className="font-bold">Hint {idx + 1}:</span> {hintText}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => speakText(`Hint ${idx + 1}: ${hintText}`)}
                        title="Listen to hint"
                        className="shrink-0 cursor-pointer p-1 text-warning hover:opacity-80 transition-opacity"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}

                {hintIndex < currentCard.question.hints.length - 1 && (
                  <button
                    onClick={() => {
                      const nextIdx = hintIndex + 1;
                      dispatch(revealNextHint());
                      playPhrase("TAKE_A_HINT");
                      const nextHintText = currentCard.question?.hints[nextIdx];
                      if (nextHintText) {
                        speakText(nextHintText);
                      }
                    }}
                    className="flex cursor-pointer items-center gap-1.5 py-1 text-xs font-bold text-warning transition-colors hover:text-warning focus:outline-none"
                  >
                    <Lightbulb className="h-4 w-4" /> Get Hint
                  </button>
                )}
              </div>
            )}

          {/* Action Footer controls */}
          <div className="border-border flex max-w-2xl items-center justify-between border-t pt-6">
            <div>{/* Reset card interaction or status message */}</div>

            {!hasQuestion || currentCard.cardType === "CONCEPTUAL" ? (
              // Conceptual card navigation
              <button
                onClick={handleContinue}
                className="flex cursor-pointer items-center gap-1.5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-primary/20 transition-all hover:opacity-90"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            ) : !isAnswered ? (
              // Question state before submission
              <button
                onClick={handleCheckAnswer}
                disabled={isSubmitting || !currentWidgetState}
                className={[
                  "cursor-pointer rounded-2xl px-6 py-3 text-xs font-bold text-white shadow-lg transition-all",
                  currentWidgetState
                    ? "bg-primary shadow-primary/20 hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking...
                  </span>
                ) : (
                  "Check Answer"
                )}
              </button>
            ) : (
              // Question state after submission
              <button
                onClick={handleContinue}
                className="flex cursor-pointer items-center gap-1.5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-primary/20 transition-all hover:opacity-90"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Right Companion Panel: Rive Mascot with Live Chat bubble */}
        <div className="border-border bg-card z-10 flex w-full flex-row items-center justify-center gap-4 border-t p-6 select-none md:w-80 md:flex-col md:justify-start md:gap-6 md:border-t-0 md:border-l">
          {/* Mascot speech bubble */}
          <div className="border-border bg-background relative max-w-xs flex-1 rounded-2xl border p-4 shadow-md backdrop-blur-md md:max-w-none md:flex-initial">
            {/* Custom bubble tail for desktop (left tail) and mobile (bottom tail) */}
            <div className="border-border bg-background absolute bottom-6 -left-2 hidden h-4 w-4 rotate-45 border-b border-l md:block" />
            <div className="border-border bg-background absolute -bottom-2 left-6 h-4 w-4 rotate-45 border-r border-b md:hidden" />

            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 mb-2">
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Clio AI Companion
              </span>
              <button
                type="button"
                onClick={toggleMute}
                className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={isMuted ? "Unmute Clio's voice" : "Mute Clio's voice"}
              >
                {isMuted ? (
                  <>
                    <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Muted</span>
                  </>
                ) : (
                  <>
                    <Volume2
                      className={`h-3.5 w-3.5 ${isSpeaking ? "text-primary animate-pulse" : ""}`}
                    />
                    <span className={isSpeaking ? "text-primary font-bold" : ""}>
                      {isSpeaking ? "Speaking" : "Voice On"}
                    </span>
                  </>
                )}
              </button>
            </div>
            <div
              className="flex items-start gap-2.5 cursor-pointer"
              onClick={() => speakText(getMascotSpeech())}
              title="Click to hear Clio speak"
            >
              <Sparkles className="mt-0.5 h-4.5 w-4.5 shrink-0 animate-pulse text-primary" />
              <p className="text-foreground/90 text-xs leading-relaxed font-medium">
                {getMascotSpeech()}
              </p>
            </div>
          </div>

          {/* Mascot canvas container */}
          <div className="border-border bg-muted/40 flex shrink-0 flex-col items-center justify-center rounded-2xl border p-2 shadow-inner backdrop-blur-sm">
            <ClioMascot state={mascotState} variant="chair" size={150} />
            <span className="text-muted-foreground/50 mt-2 text-[10px] font-bold tracking-widest uppercase">
              CLIO COMPANION
            </span>
          </div>
        </div>

        {/* Interactive result slide-up panel */}
        {showExpPanel && lastResult && (
          <div
            className={[
              "absolute right-0 bottom-0 left-0 z-30 flex flex-col items-start justify-between gap-4 border-t px-6 py-5 shadow-2xl backdrop-blur-md transition-transform duration-300 select-text md:flex-row md:items-center md:py-6",
              isCorrectAnswer
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="max-w-2xl space-y-2">
              <div className="flex items-center gap-2">
                {isCorrectAnswer ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                )}
                <span className="text-sm font-bold tracking-wider uppercase">
                  {isCorrectAnswer ? "Correct! Well Done!" : "Not Quite, but keep trying!"}
                </span>
                {isCorrectAnswer && (
                  <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-bold text-success">
                    +{lastResult.xpEarned} XP
                  </span>
                )}
              </div>
              <div className="text-foreground/80 text-xs leading-relaxed font-normal md:text-sm">
                <MathRenderer
                  text={lastResult.explanation || currentCard.question?.explanation || ""}
                />
              </div>
            </div>

            <button
              onClick={handleContinue}
              className={[
                "shrink-0 cursor-pointer rounded-2xl px-6 py-3 text-xs font-bold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-98",
                isCorrectAnswer
                  ? "bg-success shadow-success/40 hover:bg-success"
                  : "bg-destructive shadow-destructive/40 hover:bg-destructive",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              Continue
            </button>
          </div>
        )}
      </main>

      {/* Lesson Complete Modal */}
      <LessonCompleteModal
        isOpen={isCompleteModalOpen}
        totalXp={sessionXp}
        streakCount={gamification?.streak.currentStreak}
        lessonTitle={data.lesson.title}
        onBackToLessons={handleExitToHub}
      />
    </>
  );
}
