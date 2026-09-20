"use client";

import { arrayMove } from "@dnd-kit/sortable";
import { Eye, ImageOff, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

import { FileUploader } from "@/components/file-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Question,
  useCreateQuestionMutation,
  useGetClassesQuery,
  useGetSubjectsQuery,
  useUpdateQuestionMutation,
} from "@/features/assessments/questionsApi";
import { resolveUploadUrl } from "@/lib/uploads";

import { QuestionPreview } from "./question-preview";
import { QuestionTypeFields } from "./question-type-fields";
import { DragHandle, SortableListContext, SortableRow } from "./sortable-list";
import { WidgetConfigEditor } from "./widget-config-editor";

interface QuestionEditorFormProps {
  questionId?: string | null; // Null/undefined means create, non-null means edit
  initialQuestion?: Question | null;
}

/** Shared by /questions/create and /questions/[id] — a full-page editor, not a modal, since the split edit/preview layout wants real screen space. */
export function QuestionEditorForm({ questionId, initialQuestion }: QuestionEditorFormProps) {
  const router = useRouter();
  const { data: subjectsData } = useGetSubjectsQuery();
  const { data: classesData } = useGetClassesQuery();

  const subjects = React.useMemo(() => subjectsData?.items ?? [], [subjectsData]);
  const classes = React.useMemo(() => classesData?.items ?? [], [classesData]);

  const [createQuestion, { isLoading: isCreating }] = useCreateQuestionMutation();
  const [updateQuestion, { isLoading: isUpdating }] = useUpdateQuestionMutation();

  const [subjectId, setSubjectId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [questionType, setQuestionType] = useState<string>("mcq");
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [status, setStatus] = useState<string>("draft");
  const [prompt, setPrompt] = useState<string>("");
  const [promptImageUrl, setPromptImageUrl] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string>("");
  const [options, setOptions] = useState<any[]>([]);
  const [explanation, setExplanation] = useState<string>("");
  const [hints, setHints] = useState<string[]>([]);
  const [widgetType, setWidgetType] = useState<string>("");
  const [widgetConfig, setWidgetConfig] = useState<any>(null);

  const [activePane, setActivePane] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (questionId && initialQuestion) {
      setSubjectId(initialQuestion.subjectId || "");
      setClassId(initialQuestion.classId || "");
      setQuestionType(initialQuestion.questionType || "mcq");
      setDifficulty(initialQuestion.difficulty || "medium");
      setStatus(initialQuestion.status || "draft");
      setPrompt(initialQuestion.prompt || "");
      setPromptImageUrl(initialQuestion.promptImageUrl || null);
      setCorrectAnswer(initialQuestion.correctAnswer || "");
      setOptions(initialQuestion.options || []);
      setExplanation(initialQuestion.explanation || "");
      setHints(initialQuestion.hints || []);
      setWidgetType(initialQuestion.widgetType || "");
      setWidgetConfig(initialQuestion.widgetConfig || null);
    } else {
      setSubjectId(subjects[0]?.id || "");
      setClassId(classes[0]?.id || "");
      setOptions([
        { optionLabel: "A", optionText: "", isCorrect: false },
        { optionLabel: "B", optionText: "", isCorrect: false },
      ]);
    }
    // Only re-seed when the identity of the record being edited changes, or once subjects/levels
    // arrive for the create-mode defaults — not on every keystroke of the fields above.
  }, [questionId, initialQuestion, subjects, classes]);

  const handleWidgetTypeChange = (value: string) => {
    const type = value === "none" ? "" : value;
    setWidgetType(type);

    if (type === "STANDARD_MCQ") {
      setWidgetConfig({
        configVersion: 2,
        mode: "parameterized",
        params: {
          given: { a: { min: 2, max: 9 }, b: { min: 1, max: 20 } },
          secret: { x: { min: 1, max: 10 } },
          derived: { c: "a * x + b" },
        },
        display: { template: "Solve: {a}x + {b} = {c}. What is x?" },
        answerKey: { correct: "x" },
        distractors: [{ expr: "x + 1" }, { expr: "x - 1" }],
      });
    } else if (type === "SLIDER_MANIPULATIVE") {
      // configVersion: 2 routes this to widget-generator.ts's v2 fixed-mode
      // branch, which grades against this correctValue directly. Without it,
      // the config falls through to the legacy v1 path, which grades against
      // a separate `correctAnswer` field this form never sets — an
      // unwinnable question that looks fine in the editor.
      setWidgetConfig({ configVersion: 2, mode: "fixed", min: 0, max: 100, step: 1, unit: "", correctValue: 50 });
    } else if (type === "DRAG_AND_DROP_LABELS") {
      // configVersion: 2 routes this to widget-config.schema.ts's
      // DragDropFixedConfigSchema, which rejects a save with zero targets or
      // no correctLabel anywhere — the exact half-authored shape that used
      // to save silently and misgrade every real submission.
      setWidgetConfig({ configVersion: 2, mode: "fixed", labels: ["A", "B", "C"], targets: [] });
    } else if (type === "COORDINATE_PLOTTER") {
      setWidgetConfig({
        configVersion: 2,
        mode: "fixed",
        xRange: [-10, 10],
        yRange: [-10, 10],
        gridStep: 1,
        correctPoints: [],
        tolerance: 0.1,
      });
    } else if (type === "GRID_MATCHING") {
      setWidgetConfig({ configVersion: 2, mode: "fixed", left: [], right: [], correctPairs: [] });
    } else if (type === "SHAPE_SHADING") {
      setWidgetConfig({
        configVersion: 2,
        mode: "fixed",
        shape: { kind: "bar", regions: 4 },
        targetNumerator: 1,
        requireContiguous: false,
      });
    } else if (type === "CODE_PLAYGROUND") {
      setWidgetConfig({ language: "javascript", starterCode: "", tests: [] });
    } else if (type === "ANGLE_PROTRACTOR") {
      setWidgetConfig({ configVersion: 2, mode: "fixed", correctAngle: 45, tolerance: 5 });
    } else {
      setWidgetConfig(null);
    }
  };

  const handleAddHint = () => setHints([...hints, ""]);
  const handleUpdateHint = (idx: number, text: string) => {
    const newHints = [...hints];
    newHints[idx] = text;
    setHints(newHints);
  };
  const handleRemoveHint = (idx: number) => setHints(hints.filter((_, i) => i !== idx));
  const handleReorderHints = (fromIndex: number, toIndex: number) =>
    setHints(arrayMove(hints, fromIndex, toIndex));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subjectId) return toast.error("Please select a subject.");
    if (!classId) return toast.error("Please select a level.");
    if (!prompt.trim()) return toast.error("Prompt cannot be empty.");

    const isParameterizedMcq = questionType === "mcq" && widgetType === "STANDARD_MCQ";
    if (questionType === "mcq" && !widgetType) {
      if (options.length < 2) return toast.error("MCQ questions require at least 2 options.");
      if (!options.some((o) => o.isCorrect))
        return toast.error("Please mark at least one option as correct.");
    }
    if (isParameterizedMcq) {
      if (!widgetConfig?.answerKey?.correct)
        return toast.error("Select which variable holds the correct answer.");
      if (!widgetConfig?.distractors?.length)
        return toast.error("Add at least one distractor formula.");
    }

    const payload: Partial<Question> = {
      subjectId,
      classId,
      questionType: questionType as any,
      prompt,
      promptImageUrl,
      correctAnswer: questionType === "mcq" ? null : correctAnswer,
      difficulty: difficulty as any,
      status: status as any,
      widgetType: widgetType || null,
      widgetConfig,
      explanation: explanation || null,
      hints: hints.filter(Boolean),
      options: questionType === "mcq" && !widgetType ? options : [],
    };

    try {
      if (questionId) {
        await updateQuestion({ id: questionId, body: payload }).unwrap();
        toast.success("Question updated successfully!");
      } else {
        await createQuestion(payload).unwrap();
        toast.success("Question created successfully!");
      }
      router.push("/questions");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.data?.message || "Failed to save question.");
    }
  };

  const draftQuestion: Partial<Question> = {
    prompt,
    promptImageUrl,
    questionType: questionType as any,
    widgetType: widgetType || null,
    widgetConfig,
    correctAnswer,
    options,
    explanation,
    hints,
    difficulty: difficulty as any,
  };

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[560px] flex-col overflow-hidden">
      {/* Mobile split toggle */}
      <div className="mr-8 flex rounded-xl bg-muted p-0.5 md:hidden">
        <button
          onClick={() => setActivePane("edit")}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
            activePane === "edit" ? "bg-card shadow" : "text-muted-foreground"
          }`}
        >
          Edit
        </button>
        <button
          onClick={() => setActivePane("preview")}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
            activePane === "preview" ? "bg-card shadow" : "text-muted-foreground"
          }`}
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Editor Pane */}
        <form
          onSubmit={handleSave}
          className={`flex-1 space-y-6 overflow-y-auto border-border/50 p-6 md:block md:border-r ${
            activePane === "edit" ? "block" : "hidden"
          }`}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Subject
              </Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger className="h-10 rounded-xl bg-muted/50 text-xs">
                  <SelectValue placeholder="Select subject..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {subjects.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Grade Level
              </Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="h-10 rounded-xl bg-muted/50 text-xs">
                  <SelectValue placeholder="Select level..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {classes.map((lvl) => (
                    <SelectItem key={lvl.id} value={lvl.id}>
                      {lvl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Question Type
              </Label>
              <Select value={questionType} onValueChange={setQuestionType}>
                <SelectTrigger className="h-10 rounded-xl bg-muted/50 text-xs">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="mcq">Multiple Choice (MCQ)</SelectItem>
                  <SelectItem value="numeric">Numeric Answer</SelectItem>
                  <SelectItem value="short_answer">Short Answer</SelectItem>
                  <SelectItem value="written">Written / Free Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Difficulty
              </Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="h-10 rounded-xl bg-muted/50 text-xs">
                  <SelectValue placeholder="Select difficulty..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                  <SelectItem value="extension">Extension</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Status
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-10 rounded-xl bg-muted/50 text-xs">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Question Prompt (Supports LaTeX via $inline$ or $$block$$)
            </Label>
            <textarea
              placeholder="Write the question prompt here..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="h-28 w-full resize-none rounded-xl border border-border bg-muted/50 p-3 text-xs text-foreground focus:outline-none"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Prompt Image (Optional)
            </Label>
            {promptImageUrl ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 p-3">
                {/* Plain <img>: uploaded images come from arbitrary storage-provider origins, so next/image's allowlist would need a new entry per provider. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveUploadUrl(promptImageUrl) || undefined}
                  alt="Question prompt"
                  className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    Image attached
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{promptImageUrl}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setPromptImageUrl(null)}
                  className="h-8 w-8 shrink-0 cursor-pointer rounded-full hover:bg-muted"
                >
                  <ImageOff className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </Button>
              </div>
            ) : (
              <FileUploader
                label="Upload a prompt image"
                accept="image/*"
                onUploadSuccess={setPromptImageUrl}
              />
            )}
          </div>

          {!(questionType === "mcq" && widgetType === "STANDARD_MCQ") && (
            <QuestionTypeFields
              questionType={questionType}
              options={options}
              onOptionsChange={setOptions}
              correctAnswer={correctAnswer}
              onCorrectAnswerChange={setCorrectAnswer}
            />
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Bind Interactive Widget (Optional)
            </Label>
            <Select value={widgetType || "none"} onValueChange={handleWidgetTypeChange}>
              <SelectTrigger className="h-10 rounded-xl bg-muted/50 text-xs">
                <SelectValue placeholder="None (Standard Question)" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="none">None (Standard Question)</SelectItem>
                <SelectItem value="STANDARD_MCQ">MCQ Widget</SelectItem>
                <SelectItem value="SLIDER_MANIPULATIVE">Slider Widget</SelectItem>
                <SelectItem value="DRAG_AND_DROP_LABELS">Drag and Drop Labels</SelectItem>
                <SelectItem value="COORDINATE_PLOTTER">Coordinate Plotter</SelectItem>
                <SelectItem value="GRID_MATCHING">Grid Matching</SelectItem>
                <SelectItem value="CODE_PLAYGROUND">Code Playground (practice · not marked)</SelectItem>
                <SelectItem value="SHAPE_SHADING">Shape Shading</SelectItem>
                <SelectItem value="ANGLE_PROTRACTOR">Angle Protractor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {widgetType && (
            <WidgetConfigEditor widgetType={widgetType} value={widgetConfig} onChange={setWidgetConfig} />
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Solution Explanation (Supports LaTeX)
            </Label>
            <textarea
              placeholder="Explain the solution details..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="h-24 w-full resize-none rounded-xl border border-border bg-muted/50 p-3 text-xs text-foreground focus:outline-none"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Hints / Clues
              </Label>
              <button
                type="button"
                onClick={handleAddHint}
                className="flex items-center gap-1 text-xs font-bold text-primary"
              >
                <Plus className="h-4 w-4" /> Add Hint
              </button>
            </div>
            <SortableListContext
              ids={hints.map((_, idx) => `hint-${idx}`)}
              onReorder={handleReorderHints}
            >
              <div className="space-y-2">
                {hints.map((hint, idx) => (
                  <SortableRow key={idx} id={`hint-${idx}`} className="flex items-center gap-2">
                    {(handle) => (
                      <>
                        <DragHandle {...handle} />
                        <span className="text-xs font-bold text-muted-foreground">{idx + 1}.</span>
                        <Input
                          type="text"
                          placeholder="Hint details..."
                          value={hint}
                          onChange={(e) => handleUpdateHint(idx, e.target.value)}
                          className="h-9 flex-1 rounded-xl text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveHint(idx)}
                          className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </SortableRow>
                ))}
              </div>
            </SortableListContext>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/questions")}
              className="h-10 cursor-pointer rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isCreating || isUpdating}
              className="h-10 cursor-pointer rounded-xl bg-primary px-5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {isCreating || isUpdating ? "Saving..." : "Save Question"}
            </Button>
          </div>
        </form>

        {/* Right Live Preview Pane */}
        <div
          className={`flex-1 overflow-y-auto bg-muted/50 p-6 md:block ${
            activePane === "preview" ? "block" : "hidden"
          }`}
        >
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-muted-foreground uppercase">
            <Eye className="h-4 w-4 text-primary" /> Live Editor Preview
          </h3>
          <QuestionPreview question={draftQuestion} />
        </div>
      </div>
    </div>
  );
}
