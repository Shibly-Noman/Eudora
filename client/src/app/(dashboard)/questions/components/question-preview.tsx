"use client";

import React, { useEffect,useState } from "react";

import { MathRenderer } from "@/components/MathRenderer";
import type { Question } from "@/features/assessments/questionsApi";
import { WidgetSelector } from "@/features/clio/widgets/WidgetSelector";
import { resolveUploadUrl } from "@/lib/uploads";

interface QuestionPreviewProps {
  question: Partial<Question>;
}

export function QuestionPreview({ question }: QuestionPreviewProps) {
  const [widgetState, setWidgetState] = useState<any>(null);

  // Reset widget state when type or config changes
  useEffect(() => {
    setWidgetState(null);
  }, [question.widgetType, question.widgetConfig]);

  if (!question) return null;

  const difficultyColors: Record<string, string> = {
    easy: "bg-success/10 text-success border-success/20",
    medium: "bg-warning/10 text-warning border-warning/20/30",
    hard: "bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 border-orange-200 dark:border-orange-900/30",
    extension: "bg-primary/10 text-primary border-primary/20/30",
  };

  const formattedType = (question.questionType ?? "written")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-6">
      {/* Header Info Badges */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-lg border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
          {formattedType}
        </span>
        {question.difficulty && (
          <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${difficultyColors[question.difficulty] || ""}`}>
            {question.difficulty}
          </span>
        )}
      </div>

      {/* Math Prompt Render */}
      <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-foreground shadow-sm/30">
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Prompt
        </h4>
        <MathRenderer text={question.prompt || "No prompt entered."} className="font-medium" />
        {question.promptImageUrl && (
          // Plain <img>, same as story-reader.tsx: prompt images come from
          // arbitrary upload-provider origins, so next/image's remote-domain
          // allowlist would need a new entry per provider.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveUploadUrl(question.promptImageUrl) || undefined}
            alt="Question prompt"
            className="mt-3 max-h-64 w-full rounded-xl border border-border object-contain"
          />
        )}
      </div>

      {/* Widget Render */}
      {question.widgetType && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground pl-1">
            Interactive Playable Widget
          </h4>
          <WidgetSelector
            question={{
              id: question.id || "preview-id",
              prompt: question.prompt || "",
              promptImageUrl: question.promptImageUrl || null,
              questionType: question.questionType || "mcq",
              widgetType: question.widgetType,
              widgetConfig: question.widgetConfig || null,
              explanation: question.explanation || null,
              hints: question.hints || [],
              correctAnswer: question.correctAnswer || null,
              options: (question.options || []).map((o, idx) => ({
                id: o.id || `temp-${idx}`,
                optionLabel: o.optionLabel,
                optionText: o.optionText,
                isCorrect: o.isCorrect,
              })),
            }}
            currentState={widgetState}
            onStateChange={setWidgetState}
            locked={false}
          />
        </div>
      )}

      {/* Options preview for MCQ */}
      {question.questionType === "mcq" && !question.widgetType && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Options
          </h4>
          <div className="grid gap-2">
            {(question.options || []).map((opt, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between rounded-xl border p-3 text-xs font-semibold transition-all ${
                  opt.isCorrect
                    ? "border-success/20 bg-success/10/10 text-success/35"
                    : "border-border bg-card text-foreground"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-bold ${
                    opt.isCorrect
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {opt.optionLabel || String.fromCharCode(65 + idx)}
                  </span>
                  <span>{opt.optionText}</span>
                </div>
                {opt.isCorrect && (
                  <span className="text-[10px] uppercase font-bold tracking-wider text-success">
                    Correct Option
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Answer Key */}
      {question.correctAnswer && (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm/30">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Correct Answer Key
          </h4>
          <span className="font-mono text-xs text-foreground font-bold">
            {question.correctAnswer}
          </span>
        </div>
      )}

      {/* Hints List */}
      {question.hints && question.hints.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Hints ({question.hints.length})
          </h4>
          <ul className="list-inside list-decimal space-y-1.5 text-xs text-muted-foreground">
            {question.hints.map((hint, idx) => (
              <li key={idx} className="font-medium">
                {hint}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Explanation Render */}
      {question.explanation && (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm/30">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Explanation
          </h4>
          <MathRenderer text={question.explanation} className="text-xs text-muted-foreground font-medium" />
        </div>
      )}
    </div>
  );
}
