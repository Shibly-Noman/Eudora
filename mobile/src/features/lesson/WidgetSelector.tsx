import React from 'react';
import { View } from 'react-native';

import type { CardQuestion } from '@/core/contracts';
import { Card } from '@/ui/primitives/Card';
import { Text } from '@/ui/primitives/Text';
import { AngleProtractorWidget, type AngleProtractorValue } from './AngleProtractorWidget';
import { CoordinatePlotterWidget, type CoordinatePlotterValue } from './CoordinatePlotterWidget';
import { DragDropWidget, type DragDropValue } from './DragDropWidget';
import { GridMatchingWidget, type GridMatchingValue } from './GridMatchingWidget';
import { McqWidget } from './McqWidget';
import { ShapeShadingWidget, type ShapeShadingValue } from './ShapeShadingWidget';
import { SliderWidget } from './SliderWidget';

interface WidgetSelectorProps {
  question: CardQuestion;
  currentState: any;
  onStateChange: (state: any) => void;
  locked: boolean;
  isCorrect?: boolean;
  correctReveal?: {
    correctValue?: number;
    correctAngle?: number;
    classification?: string | null;
  };
}

/**
 * Prop contract mirrors the web WidgetSelector
 * (`client/src/features/clio/widgets/WidgetSelector.tsx`): `question`,
 * `currentState`, `onStateChange`, `locked`, `isCorrect`, `correctReveal`.
 * Only rendering differs per widget; state shapes are shared with the
 * server-side grader.
 *
 * `CODE_PLAYGROUND` is the one widget type still deliberately unhandled —
 * it stays retired server-side (`widget-generator.ts`'s
 * `resolveLegacyInstance` always resolves it to `UNSUPPORTED`), so any
 * answer a widget collected for it would never be gradeable regardless of
 * what the student did. `DRAG_AND_DROP_LABELS` used to be in the same
 * boat but has been gradeable since the widget-matrix repair
 * (`widget-grader.ts`'s `DRAG_AND_DROP_LABELS` case) — this was just the
 * last place still treating it as unsupported.
 */
export function WidgetSelector({
  question,
  currentState,
  onStateChange,
  locked,
  isCorrect,
  correctReveal,
}: WidgetSelectorProps) {
  switch (question.widgetType) {
    case 'STANDARD_MCQ':
      return (
        <McqWidget
          question={question}
          selectedOptionId={currentState?.selectedOptionId ?? null}
          onSelect={(optionId) => onStateChange({ selectedOptionId: optionId })}
          locked={locked}
          isCorrect={isCorrect}
        />
      );

    case 'SLIDER_MANIPULATIVE':
      return (
        <SliderWidget
          config={question.widgetConfig as any}
          value={currentState?.finalValue ?? null}
          onChange={(finalValue) => onStateChange({ finalValue })}
          locked={locked}
          isCorrect={isCorrect}
          correctValue={correctReveal?.correctValue}
        />
      );

    case 'GRID_MATCHING':
      return (
        <GridMatchingWidget
          config={question.widgetConfig as any}
          value={(currentState as GridMatchingValue) ?? null}
          onChange={onStateChange}
          locked={locked}
          isCorrect={isCorrect}
        />
      );

    case 'DRAG_AND_DROP_LABELS':
      return (
        <DragDropWidget
          config={question.widgetConfig as any}
          value={(currentState as DragDropValue) ?? null}
          onChange={onStateChange}
          locked={locked}
          isCorrect={isCorrect}
        />
      );

    case 'COORDINATE_PLOTTER':
      return (
        <CoordinatePlotterWidget
          config={question.widgetConfig as any}
          value={(currentState as CoordinatePlotterValue) ?? null}
          onChange={onStateChange}
          locked={locked}
          isCorrect={isCorrect}
        />
      );

    case 'SHAPE_SHADING':
      return (
        <ShapeShadingWidget
          config={question.widgetConfig as any}
          value={(currentState as ShapeShadingValue) ?? null}
          onChange={onStateChange}
          locked={locked}
          isCorrect={isCorrect}
        />
      );

    case 'ANGLE_PROTRACTOR':
      return (
        <AngleProtractorWidget
          value={(currentState as AngleProtractorValue) ?? null}
          onChange={onStateChange}
          locked={locked}
          isCorrect={isCorrect}
          correctReveal={
            correctReveal?.correctAngle !== undefined
              ? {
                  correctAngle: correctReveal.correctAngle,
                  classification: correctReveal.classification ?? null,
                }
              : undefined
          }
        />
      );

    default:
      return (
        <Card>
          <Text variant="label">
            {question.widgetType ?? 'This question type'} isn&apos;t supported on
            mobile yet
          </Text>
          <View style={{ height: 4 }} />
          <Text variant="caption" color="mutedForeground">
            Open this lesson on the web to answer it.
          </Text>
        </Card>
      );
  }
}
