"use client";

import { arrayMove } from "@dnd-kit/sortable";
import { Plus, Trash2 } from "lucide-react";
import React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { DragHandle, SortableListContext, SortableRow } from "./sortable-list";

interface QuestionOption {
  id?: string;
  optionLabel: string;
  optionText: string;
  isCorrect: boolean;
}

interface QuestionTypeFieldsProps {
  questionType: string;
  options: QuestionOption[];
  onOptionsChange: (newOptions: QuestionOption[]) => void;
  correctAnswer: string;
  onCorrectAnswerChange: (newAnswer: string) => void;
}

export function QuestionTypeFields({
  questionType,
  options,
  onOptionsChange,
  correctAnswer,
  onCorrectAnswerChange,
}: QuestionTypeFieldsProps) {
  
  if (questionType === "mcq") {
    const handleAddOption = () => {
      const label = String.fromCharCode(65 + options.length); // A, B, C...
      onOptionsChange([...options, { optionLabel: label, optionText: "", isCorrect: false }]);
    };

    const handleUpdateOption = (idx: number, key: keyof QuestionOption, val: any) => {
      const newOptions = options.map((opt, i) => {
        if (i === idx) {
          return { ...opt, [key]: val };
        }
        // If single correct option and we set this to true, set others to false
        if (key === "isCorrect" && val === true) {
          return { ...opt, isCorrect: false };
        }
        return opt;
      });
      
      // Update specific target index after mapping
      if (key === "isCorrect" && val === true) {
        newOptions[idx].isCorrect = true;
      }

      onOptionsChange(newOptions);
    };

    const handleRemoveOption = (idx: number) => {
      const filtered = options.filter((_, i) => i !== idx);
      // Re-label options sequentially
      const relabeled = filtered.map((opt, i) => ({
        ...opt,
        optionLabel: String.fromCharCode(65 + i),
      }));
      onOptionsChange(relabeled);
    };

    // Labels are positional (A, B, C...), not attached to a specific option,
    // so a pure array move without relabeling would leave option A's text
    // sitting under label C after a drag — relabel in the same update as the
    // move so a row's letter always matches where it now sits.
    const handleReorderOptions = (fromIndex: number, toIndex: number) => {
      const moved = arrayMove(options, fromIndex, toIndex);
      const relabeled = moved.map((opt, i) => ({
        ...opt,
        optionLabel: String.fromCharCode(65 + i),
      }));
      onOptionsChange(relabeled);
    };

    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm/40">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            MCQ Options Choices
          </Label>
          <button
            type="button"
            onClick={handleAddOption}
            className="flex items-center gap-1 text-xs font-bold text-primary"
          >
            <Plus className="h-4 w-4" /> Add Option
          </button>
        </div>

        <SortableListContext
          ids={options.map((_, idx) => `option-${idx}`)}
          onReorder={handleReorderOptions}
        >
          <div className="space-y-3">
            {options.map((opt, idx) => (
              <SortableRow key={idx} id={`option-${idx}`} className="flex items-center gap-3">
                {(handle) => (
                  <>
                    <DragHandle {...handle} className="flex h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing" />

                    {/* Option Label Indicator */}
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-bold text-muted-foreground">
                      {opt.optionLabel}
                    </span>

                    {/* Option Text Input */}
                    <Input
                      type="text"
                      placeholder={`Option ${opt.optionLabel} text...`}
                      value={opt.optionText}
                      onChange={(e) => handleUpdateOption(idx, "optionText", e.target.value)}
                      className="h-10 rounded-xl text-xs flex-1 border-border"
                    />

                    {/* Is Correct Checkbox */}
                    <div className="flex items-center gap-2 border border-border bg-muted/50 rounded-xl px-3 h-10 select-none">
                      <Checkbox
                        id={`iscorrect-${idx}`}
                        checked={opt.isCorrect}
                        onCheckedChange={(checked) => handleUpdateOption(idx, "isCorrect", !!checked)}
                        className="rounded-md border-border"
                      />
                      <label
                        htmlFor={`iscorrect-${idx}`}
                        className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer"
                      >
                        Correct
                      </label>
                    </div>

                    {/* Delete Button */}
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </SortableRow>
            ))}
          </div>
        </SortableListContext>
      </div>
    );
  }

  if (questionType === "numeric" || questionType === "short_answer") {
    return (
      <div className="space-y-1.5 rounded-2xl border border-border bg-card p-5 shadow-sm/40">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {questionType === "numeric" ? "Correct Numeric Answer" : "Correct Short-Answer Key"}
        </Label>
        <Input
          type={questionType === "numeric" ? "number" : "text"}
          step="any"
          placeholder={questionType === "numeric" ? "e.g. 42" : "e.g. photosynthesis"}
          value={correctAnswer}
          onChange={(e) => onCorrectAnswerChange(e.target.value)}
          className="h-10 rounded-xl text-xs border-border"
          required
        />
      </div>
    );
  }

  return null;
}
