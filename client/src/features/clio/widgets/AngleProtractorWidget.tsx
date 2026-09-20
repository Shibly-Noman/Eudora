"use client";

import React from "react";

import type { AngleProtractorConfig } from "../../assessments/widgetConfigSchemas";

export type AngleProtractorValue = { angle: number };

interface AngleProtractorWidgetProps {
  config: AngleProtractorConfig;
  value: AngleProtractorValue | null;
  onChange: (value: AngleProtractorValue) => void;
  locked: boolean;
  isCorrect?: boolean | null;
  // The answer key, sent by the server only after an incorrect submission
  // (see gradeWidgetSubmission's ANGLE_PROTRACTOR case) — never present
  // beforehand, since displayConfig carries nothing but `{}`.
  correctReveal?: { correctAngle: number; classification: string | null };
}

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 100;

// SVG y grows downward, so subtracting sin() turns "increasing angle" into
// the counter-clockwise sweep a protractor reads — the same convention as
// the fixed baseline ray this widget always draws at 0°.
function rayEndpoint(angleDegrees: number) {
  const rad = (angleDegrees * Math.PI) / 180;
  return {
    x: CENTER + RADIUS * Math.cos(rad),
    y: CENTER - RADIUS * Math.sin(rad),
  };
}

/**
 * One ray is fixed along the baseline; the student only ever moves the
 * other, via a 0-359° range input (drag) or the paired number field (exact
 * entry) — both write the same `{ angle }` value, so there's one grading
 * path regardless of how a student answered. A free two-ray drag was
 * deliberately not built: it would make the same relative angle correct at
 * any orientation, which defeats what "set the angle from this baseline" is
 * meant to test (see widget-config.schema.ts's ANGLE_PROTRACTOR comment).
 */
export function AngleProtractorWidget({
  value,
  onChange,
  locked,
  isCorrect,
  correctReveal,
}: AngleProtractorWidgetProps) {
  const angle = value?.angle ?? 90;
  const showReveal = locked && isCorrect === false && !!correctReveal;

  const setAngle = (next: number) => {
    if (locked || Number.isNaN(next)) return;
    onChange({ angle: ((next % 360) + 360) % 360 });
  };

  const tip = rayEndpoint(angle);
  const revealTip = showReveal ? rayEndpoint(correctReveal!.correctAngle) : null;

  return (
    <div className="border-border bg-card flex flex-col items-center gap-5 rounded-3xl border p-6 shadow-sm select-none">
      <div className="text-center">
        <span className="text-xs font-medium text-muted-foreground">
          {locked ? "Locked" : "Drag the slider or type a value to set the angle"}
        </span>
        {locked && isCorrect !== undefined && isCorrect !== null && (
          <div className={`mt-1 text-xs font-bold ${isCorrect ? "text-success" : "text-destructive"}`}>
            {isCorrect ? "Correct!" : "Incorrect"}
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-56 w-56">
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          className="fill-none stroke-border"
          strokeWidth="1"
          strokeDasharray="3,3"
        />

        {/* Fixed baseline ray (0°) */}
        <line
          x1={CENTER}
          y1={CENTER}
          x2={CENTER + RADIUS}
          y2={CENTER}
          className="stroke-muted-foreground"
          strokeWidth="2"
        />

        {revealTip && (
          <line
            x1={CENTER}
            y1={CENTER}
            x2={revealTip.x}
            y2={revealTip.y}
            className="stroke-success"
            strokeWidth="2"
            strokeDasharray="4,3"
          />
        )}

        {/* The student's ray */}
        <line
          x1={CENTER}
          y1={CENTER}
          x2={tip.x}
          y2={tip.y}
          className={locked ? (isCorrect ? "stroke-success" : "stroke-destructive") : "stroke-primary"}
          strokeWidth="3"
        />
        <circle
          cx={tip.x}
          cy={tip.y}
          r="6"
          className={locked ? (isCorrect ? "fill-success" : "fill-destructive") : "fill-primary"}
        />
        <circle cx={CENTER} cy={CENTER} r="4" className="fill-foreground" />
      </svg>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={angle}
          disabled={locked}
          onChange={(e) => setAngle(Number(e.target.value))}
          className={`w-full accent-primary ${locked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        />
        <div className="flex items-center justify-center gap-2">
          <input
            type="number"
            min={0}
            max={360}
            value={Math.round(angle)}
            disabled={locked}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="h-9 w-20 rounded-lg border border-border bg-muted/50 text-center text-sm font-bold text-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="text-sm font-semibold text-muted-foreground">degrees</span>
        </div>
      </div>

      {showReveal && correctReveal && (
        <div className="text-xs font-semibold text-success">
          Correct angle: {correctReveal.correctAngle}°
          {correctReveal.classification ? ` (${correctReveal.classification})` : ""}
        </div>
      )}
    </div>
  );
}
