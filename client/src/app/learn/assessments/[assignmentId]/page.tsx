"use client";

import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  GraduationCap,
  HelpCircle,
  Play,
  Send} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect,useState } from "react";
import { toast } from "sonner";

import { MathRenderer } from "@/components/MathRenderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useGetAssignmentQuery,
  useGetAttemptQuery,
  useListAssignmentAttemptsQuery,
  useSaveStudentResponseMutation,
  useStartAttemptMutation,
  useSubmitAttemptMutation} from "@/features/assessments/assessmentsApi";
import { useGetAssessmentQuery } from "@/features/assessments/assessmentsApi";
import { WidgetSelector } from "@/features/clio/widgets/WidgetSelector";
import { resolveUploadUrl } from "@/lib/uploads";

export default function StudentAssessmentPlayerPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.assignmentId as string;

  // 1. Fetch assignment details
  const { data: assignment, isLoading: isLoadingAssignment } = useGetAssignmentQuery(assignmentId);

  // 2. Fetch attempts
  const { data: attemptsData, isLoading: isLoadingAttempts, refetch: refetchAttempts } =
    useListAssignmentAttemptsQuery(assignmentId, { skip: !assignmentId });

  const attempts = attemptsData?.items || [];
  const activeAttemptInfo = attempts.find((a) => a.resultStatus === "in_progress");
  const latestCompletedAttempt = attempts.find((a) => a.resultStatus === "submitted" || a.resultStatus === "marked" || a.resultStatus === "needs_review");

  // 3. Fetch active attempt details if there is one
  const { data: attemptDetails, isLoading: isLoadingAttemptDetails } =
    useGetAttemptQuery(activeAttemptInfo?.id || "", { skip: !activeAttemptInfo?.id });

  // 4. Fetch assessment details
  const assessmentId = assignment?.assessmentId;
  const { data: assessment, isLoading: isLoadingAssessment } =
    useGetAssessmentQuery(assessmentId || "", { skip: !assessmentId });

  // Mutations
  const [startAttempt, { isLoading: isStarting }] = useStartAttemptMutation();
  const [saveResponse] = useSaveStudentResponseMutation();
  const [submitAttempt, { isLoading: isSubmitting }] = useSubmitAttemptMutation();

  // Local state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responsesState, setResponsesState] = useState<Record<string, {
    selectedOptionId?: string | null;
    responseText?: string | null;
    interactionState?: any;
  }>>({});
  const [savingState, setSavingState] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  const questions = assessment?.questions || [];
  const currentQuestion = questions[currentIndex];

  // Real time-on-task, replacing a hardcoded `timeSpentSeconds: 10` sent on
  // every save. Seconds accumulate per question so revisiting one adds to its
  // total rather than restarting it; the server overwrites the field on each
  // save, so the cumulative figure is what it wants.
  const timePerQuestionRef = React.useRef<Record<string, number>>({});
  const questionEnteredAtRef = React.useRef<number>(Date.now());
  const previousQuestionIdRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    const previousId = previousQuestionIdRef.current;
    const now = Date.now();
    if (previousId && previousId !== currentQuestion?.id) {
      const elapsed = Math.round((now - questionEnteredAtRef.current) / 1000);
      timePerQuestionRef.current[previousId] =
        (timePerQuestionRef.current[previousId] ?? 0) + elapsed;
    }
    if (previousId !== currentQuestion?.id) {
      questionEnteredAtRef.current = now;
      previousQuestionIdRef.current = currentQuestion?.id;
    }
  }, [currentQuestion?.id]);

  /** Total seconds on a question, including the dwell still in progress. */
  const secondsSpentOn = (questionId: string) => {
    const banked = timePerQuestionRef.current[questionId] ?? 0;
    if (questionId !== currentQuestion?.id) return banked;
    return banked + Math.round((Date.now() - questionEnteredAtRef.current) / 1000);
  };

  // Initialize responses state when attempt details load
  useEffect(() => {
    if (attemptDetails?.responses) {
      const stateMap: typeof responsesState = {};
      attemptDetails.responses.forEach((res) => {
        stateMap[res.questionId] = {
          selectedOptionId: res.selectedOptionId,
          responseText: res.responseText,
          interactionState: res.interactionState,
        };
      });
      setResponsesState(stateMap);
    }
  }, [attemptDetails]);

  // Action: Timer expired auto submit
  const handleAutoSubmit = React.useCallback(async () => {
    if (!attemptDetails) return;
    try {
      await submitAttempt(attemptDetails.id).unwrap();
      toast.error("Time limit reached! Your paper was auto-submitted.", { duration: 10000 });
      refetchAttempts();
    } catch (err) {
      console.error(err);
    }
  }, [attemptDetails, submitAttempt, refetchAttempts]);

  // Set up test timer countdown
  useEffect(() => {
    if (!attemptDetails || !assessment) return;

    const start = new Date(attemptDetails.startedAt).getTime();
    const limit = start + assessment.estimatedDurationMinutes * 60 * 1000;
    let expired = false;

    const tick = () => {
      const diff = Math.max(0, Math.floor((limit - Date.now()) / 1000));
      setTimeLeft(diff);
      if (diff <= 0 && !expired) {
        expired = true;
        clearInterval(timerInterval);
        handleAutoSubmit();
      }
    };

    const timerInterval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timerInterval);
  }, [attemptDetails, assessment, handleAutoSubmit]);

  if (isLoadingAssignment || isLoadingAttempts || isLoadingAssessment || (activeAttemptInfo && isLoadingAttemptDetails)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-muted-foreground font-medium">Entering assessment portal...</p>
        </div>
      </div>
    );
  }

  if (!assignment || !assessment) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <HelpCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
          <h3 className="text-base font-bold text-foreground">Assignment Not Found</h3>
          <Button onClick={() => router.push("/learning")} className="mt-4 bg-primary">
            Back to Student Portal
          </Button>
        </div>
      </div>
    );
  }

  // Action: Start Test Attempt
  const handleStartAttempt = async () => {
    try {
      await startAttempt({ assessmentAssignmentId: assignmentId }).unwrap();
      toast.success("Assessment started! Good luck!");
      refetchAttempts();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.data?.message || "Failed to start assessment.");
    }
  };

  // Action: Save a Response
  const handleSaveResponse = async (qId: string, stateUpdate: Partial<typeof responsesState[string]>) => {
    if (!attemptDetails) return;

    // Merge new fields into local state
    const current = responsesState[qId] || {};
    const updated = { ...current, ...stateUpdate };
    setResponsesState((prev) => ({ ...prev, [qId]: updated }));
    setSavingState((prev) => ({ ...prev, [qId]: "saving" }));

    try {
      await saveResponse({
        assessmentAttemptId: attemptDetails.id,
        questionId: qId,
        selectedOptionId: updated.selectedOptionId || null,
        responseText: updated.responseText || null,
        interactionState: updated.interactionState || null,
        timeSpentSeconds: secondsSpentOn(qId),
      }).unwrap();

      setSavingState((prev) => ({ ...prev, [qId]: "saved" }));
      setTimeout(() => {
        setSavingState((prev) => ({ ...prev, [qId]: "idle" }));
      }, 1500);
    } catch (err) {
      console.error(err);
      setSavingState((prev) => ({ ...prev, [qId]: "error" }));
    }
  };

  // Action: Submit Attempt
  const handleSubmitTest = async () => {
    if (!attemptDetails) return;
    setConfirmSubmitOpen(false);

    try {
      await submitAttempt(attemptDetails.id).unwrap();
      toast.success("Assessment submitted successfully!");
      refetchAttempts();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.data?.message || "Failed to submit assessment.");
    }
  };

  // Format time remaining MM:SS
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Check if a question is answered
  const isQuestionAnswered = (qId: string) => {
    const state = responsesState[qId];
    if (!state) return false;
    return (
      state.selectedOptionId !== undefined && state.selectedOptionId !== null ||
      state.responseText !== undefined && state.responseText !== null && state.responseText.trim() !== "" ||
      state.interactionState !== undefined && state.interactionState !== null
    );
  };

  // --- STATE 1: Completed Assessment Splash ---
  if (latestCompletedAttempt) {
    const isMarked = latestCompletedAttempt.resultStatus === "marked";
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-foreground text-background min-h-screen">
        <Card className="max-w-md w-full rounded-3xl border border-border bg-background p-6 text-center shadow-2xl">
          <CheckCircle className="mx-auto h-16 w-16 text-success mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-1">Assessment Submitted</h2>
          <p className="text-xs text-muted-foreground">
            You completed: <span className="font-semibold">{assessment.title}</span>
          </p>

          <div className="my-6 p-4 rounded-2xl bg-muted border border-border/80 space-y-3">
            <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
              <span>Time Taken</span>
              <span className="text-foreground font-semibold">
                {Math.ceil(latestCompletedAttempt.timeSpentSeconds / 60)} minutes
              </span>
            </div>
            {isMarked ? (
              <>
                <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
                  <span>Score Awarded</span>
                  <span className="text-success font-bold text-sm">
                    {latestCompletedAttempt.rawScore} / {latestCompletedAttempt.maxScore} ({latestCompletedAttempt.percentageScore}%)
                  </span>
                </div>
                {latestCompletedAttempt.teacherComment && (
                  <div className="text-left pt-2 border-t border-border/80">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Teacher Feedback</p>
                    <p className="text-xs text-muted-foreground bg-background/60 p-2.5 rounded-xl border border-border/50 italic">
                      &quot;{latestCompletedAttempt.teacherComment}&quot;
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1.5 justify-center text-xs text-warning py-1 font-semibold">
                <Clock className="h-4 w-4" />
                Awaiting manual review / grading.
              </div>
            )}
          </div>

          <Button
            onClick={() => router.push("/learning")}
            className="w-full h-11 rounded-xl bg-muted text-xs font-semibold text-foreground border border-border hover:bg-muted"
          >
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  // --- STATE 2: Rules / Welcome Screen (Not Started) ---
  if (!attemptDetails) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-foreground text-background min-h-screen">
        <Card className="max-w-lg w-full rounded-3xl border border-border bg-background p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-primary">Assignment Portal</span>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground mb-1">{assessment.title}</h1>
          <p className="text-xs text-muted-foreground">
            Subject: {assessment.subject?.name} • Grade: {assessment.class?.name}
          </p>

          <div className="grid grid-cols-3 gap-3 my-6">
            <div className="rounded-2xl bg-muted border border-border p-3 text-center">
              <Clock className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
              <p className="text-[10px] text-muted-foreground font-semibold">Duration</p>
              <p className="text-sm font-bold text-foreground mt-0.5">{assessment.estimatedDurationMinutes}m</p>
            </div>
            <div className="rounded-2xl bg-muted border border-border p-3 text-center">
              <Award className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
              <p className="text-[10px] text-muted-foreground font-semibold">Max Score</p>
              <p className="text-sm font-bold text-foreground mt-0.5">{assessment.totalMarks} Marks</p>
            </div>
            <div className="rounded-2xl bg-muted border border-border p-3 text-center">
              <BookOpen className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
              <p className="text-[10px] text-muted-foreground font-semibold">Questions</p>
              <p className="text-sm font-bold text-foreground mt-0.5">{questions.length} Items</p>
            </div>
          </div>

          <div className="space-y-3 mb-8 text-muted-foreground text-xs leading-relaxed bg-muted/40 p-4 border border-border rounded-2xl">
            <h3 className="font-bold text-foreground">Important Rules:</h3>
            <ul className="list-disc pl-4 space-y-1.5 text-[11px]">
              <li>Once you start, the timer cannot be paused or stopped.</li>
              <li>Your answers are autosaved in real-time as you progress.</li>
              <li>If the timer runs out, your responses will be submitted automatically.</li>
              <li>Ensure you have a stable internet connection before starting.</li>
            </ul>
          </div>

          <Button
            onClick={handleStartAttempt}
            disabled={isStarting}
            className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 font-bold text-xs text-primary-foreground shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2"
          >
            <Play className="h-4 w-4 fill-current" />
            {isStarting ? "Initializing..." : "Start Assessment Now"}
          </Button>
        </Card>
      </div>
    );
  }

  // --- STATE 3: Test Player Canvas ---
  const answeredCount = questions.filter((q) => isQuestionAnswered(q.questionId)).length;
  const progressPercent = Math.round((answeredCount / questions.length) * 100);

  const currentResponse = responsesState[currentQuestion?.questionId] || {};
  const currentSaving = savingState[currentQuestion?.questionId] || "idle";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-foreground text-background select-none">
      {/* Test Player Header */}
      <div className="h-16 border-b border-border bg-background px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-sm font-bold tracking-tight text-foreground truncate max-w-[200px]">
              {assessment.title}
            </h1>
          </div>
          {/* Progress Indicator */}
          <div className="hidden sm:flex items-center gap-2.5">
            <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary/100 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-muted-foreground font-bold">
              {answeredCount}/{questions.length} Answered
            </span>
          </div>
        </div>

        {/* Timer, Saving Status, and Submit */}
        <div className="flex items-center gap-4">
          {/* Saving Status Tag */}
          <div className="text-[10px] font-bold">
            {currentSaving === "saving" && <span className="text-muted-foreground">Saving...</span>}
            {currentSaving === "saved" && <span className="text-success">Saved</span>}
            {currentSaving === "error" && <span className="text-destructive">Save Error</span>}
          </div>

          {/* Countdown Clock */}
          {timeLeft !== null && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold text-xs ${
                timeLeft < 300
                  ? "bg-destructive/10 text-destructive border-destructive/20 animate-pulse"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>{formatTimer(timeLeft)}</span>
            </div>
          )}

          <Button
            onClick={() => setConfirmSubmitOpen(true)}
            className="h-9 rounded-xl bg-primary hover:bg-primary/90 text-xs font-bold text-primary-foreground px-4 shrink-0 shadow-md shadow-primary/10"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" /> Submit Test
          </Button>
        </div>
      </div>

      {/* Workspace Area split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Question Navigation panel */}
        <div className="w-64 border-r border-border bg-background/60 p-5 flex flex-col overflow-y-auto shrink-0">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-4">
            Navigation Grid
          </h2>

          <div className="space-y-6 flex-1">
            {assessment.sections?.map((section) => {
              const secQuestions = questions.filter((q) => q.sectionId === section.id);
              if (secQuestions.length === 0) return null;

              return (
                <div key={section.id} className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground">{section.title}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {secQuestions.map((q) => {
                      const absoluteIdx = questions.findIndex((item) => item.id === q.id);
                      const isCurrent = absoluteIdx === currentIndex;
                      const isAnswered = isQuestionAnswered(q.questionId);

                      return (
                        <button
                          key={q.id}
                          onClick={() => setCurrentIndex(absoluteIdx)}
                          className={`h-9 w-9 rounded-xl text-xs font-bold flex items-center justify-center border transition-all ${
                            isCurrent
                              ? "bg-muted border-primary text-primary shadow-md shadow-primary/5"
                              : isAnswered
                              ? "bg-primary border-primary text-primary-foreground"
                              : "bg-muted border-border text-muted-foreground hover:border-border"
                          }`}
                        >
                          {q.questionNumber}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center Main area: Current Question Panel */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col justify-between bg-card/10">
          {currentQuestion ? (
            <div className="max-w-3xl w-full mx-auto space-y-6">
              {/* Question Meta Header */}
              <div className="flex justify-between items-center pb-4 border-b border-border">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  Question {currentQuestion.questionNumber} • {currentQuestion.marksAvailable} Marks
                </span>
                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground">
                  {currentQuestion.question.questionType.toUpperCase()}
                </span>
              </div>

              {/* Prompt Stem Text */}
              <div className="text-sm font-medium leading-relaxed text-foreground select-text">
                <MathRenderer text={currentQuestion.question.prompt} />
              </div>
              {currentQuestion.question.promptImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveUploadUrl(currentQuestion.question.promptImageUrl) || undefined}
                  alt="Question prompt"
                  className="max-h-72 w-full rounded-2xl border border-border object-contain"
                />
              )}

              {/* Interaction Panel */}
              <div className="pt-4">
                {currentQuestion.question.widgetType ? (
                  /* Render Interactive Widget */
                  <div className="border border-border rounded-3xl bg-muted/30 p-6">
                    <WidgetSelector
                      question={currentQuestion.question as any}
                      currentState={currentResponse.interactionState || null}
                      onStateChange={(newState) =>
                        handleSaveResponse(currentQuestion.questionId, { interactionState: newState })
                      }
                      locked={false}
                    />
                  </div>
                ) : (
                  /* Render Standard Answer Interfaces */
                  <div className="space-y-4">
                    {/* MCQ Interface */}
                    {currentQuestion.question.questionType === "mcq" && (
                      <div className="grid grid-cols-1 gap-3 max-w-xl">
                        {currentQuestion.question.options?.map((opt) => {
                          const isSelected = currentResponse.selectedOptionId === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() =>
                                handleSaveResponse(currentQuestion.questionId, { selectedOptionId: opt.id })
                              }
                              className={`p-4 rounded-2xl border text-left text-xs font-semibold flex items-center gap-3 transition-all ${
                                isSelected
                                  ? "bg-primary/10 border-primary text-primary shadow-md shadow-primary/5"
                                  : "bg-muted border-border/80 text-muted-foreground hover:border-border"
                              }`}
                            >
                              <div
                                className={`h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                                  isSelected
                                    ? "border-primary bg-primary/100 text-primary-foreground"
                                    : "border-border text-muted-foreground"
                                }`}
                              >
                                {opt.optionLabel}
                              </div>
                              <div>
                                <MathRenderer text={opt.optionText} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Numeric Answer Interface */}
                    {currentQuestion.question.questionType === "numeric" && (
                      <div className="space-y-1.5 max-w-sm">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Numeric Answer
                        </Label>
                        <Input
                          type="number"
                          placeholder="Type your numeric response here..."
                          value={currentResponse.responseText || ""}
                          onChange={(e) =>
                            setResponsesState((prev) => ({
                              ...prev,
                              [currentQuestion.questionId]: {
                                ...currentResponse,
                                responseText: e.target.value,
                              },
                            }))
                          }
                          onBlur={(e) =>
                            handleSaveResponse(currentQuestion.questionId, { responseText: e.target.value })
                          }
                          className="h-11 rounded-xl text-xs bg-muted border-border text-foreground"
                        />
                      </div>
                    )}

                    {/* Short Answer Interface */}
                    {currentQuestion.question.questionType === "short_answer" && (
                      <div className="space-y-1.5 max-w-md">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Short Answer Text
                        </Label>
                        <Input
                          placeholder="Type your brief response..."
                          value={currentResponse.responseText || ""}
                          onChange={(e) =>
                            setResponsesState((prev) => ({
                              ...prev,
                              [currentQuestion.questionId]: {
                                ...currentResponse,
                                responseText: e.target.value,
                              },
                            }))
                          }
                          onBlur={(e) =>
                            handleSaveResponse(currentQuestion.questionId, { responseText: e.target.value })
                          }
                          className="h-11 rounded-xl text-xs bg-muted border-border text-foreground"
                        />
                      </div>
                    )}

                    {/* Written / Free Text Essay Interface */}
                    {currentQuestion.question.questionType === "written" && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Essay / Written Response
                        </Label>
                        <textarea
                          placeholder="Write your explanation or detailed response here..."
                          value={currentResponse.responseText || ""}
                          onChange={(e) =>
                            setResponsesState((prev) => ({
                              ...prev,
                              [currentQuestion.questionId]: {
                                ...currentResponse,
                                responseText: e.target.value,
                              },
                            }))
                          }
                          onBlur={(e) =>
                            handleSaveResponse(currentQuestion.questionId, { responseText: e.target.value })
                          }
                          className="h-48 w-full resize-none rounded-2xl border border-border bg-muted p-4 text-xs text-foreground focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <HelpCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2 animate-bounce" />
              <p className="text-xs text-muted-foreground">No active question to display.</p>
            </div>
          )}

          {/* Bottom Navigation Toolbar */}
          <div className="max-w-3xl w-full mx-auto flex justify-between pt-6 border-t border-border/60 mt-12 shrink-0">
            <Button
              variant="ghost"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(currentIndex - 1)}
              className="h-10 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>

            {currentIndex === questions.length - 1 ? (
              <Button
                onClick={() => setConfirmSubmitOpen(true)}
                className="h-10 rounded-xl bg-success hover:bg-success font-bold text-xs text-success-foreground px-5"
              >
                Submit Paper <Send className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                onClick={() => setCurrentIndex(currentIndex + 1)}
                className="h-10 rounded-xl bg-muted hover:bg-muted text-xs font-semibold text-muted-foreground border border-border"
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Submit Modal */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full rounded-3xl border border-border bg-background p-6 shadow-2xl text-center text-foreground">
            <AlertTriangle className="mx-auto h-12 w-12 text-warning mb-3 animate-pulse" />
            <h3 className="text-base font-bold text-foreground mb-1">Submit Assessment?</h3>
            <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
              Are you sure you want to finalize and submit your assessment paper? You have answered {answeredCount} out of {questions.length} questions. You cannot undo this action.
            </p>

            <div className="flex gap-3">
              <Button
                onClick={() => setConfirmSubmitOpen(false)}
                className="flex-1 h-10 rounded-xl bg-muted border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Back to Test
              </Button>
              <Button
                onClick={handleSubmitTest}
                disabled={isSubmitting}
                className="flex-1 h-10 rounded-xl bg-primary hover:bg-primary/90 text-xs font-semibold text-primary-foreground"
              >
                {isSubmitting ? "Submitting..." : "Yes, Submit"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
