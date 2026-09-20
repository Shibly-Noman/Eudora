"use client";

import React from "react";

import type { ClioQuestion } from "../clioApi";
import { AngleProtractorWidget } from "./AngleProtractorWidget";
import { CodePlaygroundWidget } from "./CodePlaygroundWidget";
import { ComingSoonWidget } from "./ComingSoonWidget";
import { CoordinatePlotterWidget } from "./CoordinatePlotterWidget";
import { DragDropWidget } from "./DragDropWidget";
import { GridMatchingWidget } from "./GridMatchingWidget";
import { MCQWidget } from "./MCQWidget";
import { ShapeShadingWidget } from "./ShapeShadingWidget";
import { SliderWidget } from "./SliderWidget";

export interface WidgetSelectorProps {
  question: ClioQuestion;
  currentState: any;
  onStateChange: (newState: any) => void;
  locked: boolean;
  isCorrect?: boolean | null;
  // Correct-answer reveal data. Shape varies by widget type; each field is
  // only present after a submission (see gradeWidgetSubmission), never
  // before — that is the whole reason it travels as a separate prop instead
  // of living in the widget's config.
  correctReveal?: {
    correctValue?: number;
    correctPoints?: { x: number; y: number }[];
    tolerance?: number;
    correctPairs?: [string, string][];
    correctAngle?: number;
    classification?: string | null;
  };
}

export function WidgetSelector({
  question,
  currentState,
  onStateChange,
  locked,
  isCorrect,
  correctReveal,
}: WidgetSelectorProps) {
  const widgetType = question.widgetType ?? "STANDARD_MCQ";

  switch (widgetType) {
    case "STANDARD_MCQ":
      return (
        <MCQWidget
          options={question.options}
          selectedId={currentState?.selectedOptionId ?? null}
          onSelect={(id) => onStateChange({ selectedOptionId: id })}
          locked={locked}
          isCorrect={isCorrect}
        />
      );

    case "SLIDER_MANIPULATIVE":
      return (
        <SliderWidget
          config={(question.widgetConfig as any) ?? { min: 0, max: 100, step: 1 }}
          value={currentState?.finalValue ?? question.widgetConfig?.min ?? 0}
          onChange={(val) => onStateChange({ finalValue: val })}
          locked={locked}
          isCorrect={isCorrect}
          correctValue={correctReveal?.correctValue}
        />
      );

    case "DRAG_AND_DROP_LABELS":
      return (
        <DragDropWidget
          config={(question.widgetConfig as any) ?? { labels: [], targets: [] }}
          placements={currentState?.placements ?? {}}
          onChange={(placements) => onStateChange({ placements })}
          locked={locked}
        />
      );

    case "COORDINATE_PLOTTER":
      return (
        <CoordinatePlotterWidget
          config={(question.widgetConfig as any) ?? { xRange: [-10, 10], yRange: [-10, 10], gridStep: 1, correctPoints: [] }}
          value={currentState}
          onChange={(newValue) => onStateChange(newValue)}
          locked={locked}
          isCorrect={isCorrect}
          correctReveal={
            correctReveal?.correctPoints
              ? { correctPoints: correctReveal.correctPoints, tolerance: correctReveal.tolerance ?? 0.1 }
              : undefined
          }
        />
      );

    case "GRID_MATCHING":
      return (
        <GridMatchingWidget
          config={(question.widgetConfig as any) ?? { left: [], right: [], correctPairs: [] }}
          value={currentState}
          onChange={(newValue) => onStateChange(newValue)}
          locked={locked}
          isCorrect={isCorrect}
          correctReveal={correctReveal?.correctPairs ? { correctPairs: correctReveal.correctPairs } : undefined}
        />
      );

    case "CODE_PLAYGROUND":
      return (
        <CodePlaygroundWidget
          config={(question.widgetConfig as any) ?? { language: "javascript", starterCode: "", tests: [] }}
          value={currentState}
          onChange={(newValue) => onStateChange(newValue)}
          locked={locked}
          isCorrect={isCorrect}
        />
      );

    case "SHAPE_SHADING":
      return (
        <ShapeShadingWidget
          config={(question.widgetConfig as any) ?? { shape: { kind: "bar", regions: 4 }, targetNumerator: 1 }}
          value={currentState}
          onChange={(newValue) => onStateChange(newValue)}
          locked={locked}
          isCorrect={isCorrect}
        />
      );

    case "ANGLE_PROTRACTOR":
      return (
        <AngleProtractorWidget
          config={(question.widgetConfig as any) ?? {}}
          value={currentState}
          onChange={(newValue) => onStateChange(newValue)}
          locked={locked}
          isCorrect={isCorrect}
          correctReveal={
            correctReveal?.correctAngle !== undefined
              ? { correctAngle: correctReveal.correctAngle, classification: correctReveal.classification ?? null }
              : undefined
          }
        />
      );

    default:
      return <ComingSoonWidget widgetType={widgetType} />;
  }
}
