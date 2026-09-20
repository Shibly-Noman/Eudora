import { Parser } from 'expr-eval';
import {
  AngleClassification,
  AngleProtractorFixedConfig,
  CoordinatePlotterFixedConfig,
  DragDropFixedConfig,
  GridMatchingFixedConfig,
  McqParameterizedConfig,
  ShapeShadingFixedConfig,
  SliderParameterizedConfig,
  parseWidgetConfig,
} from './widget-config.schema';
import { mulberry32, randomInt, shuffleWithRng } from './seed.util';

const exprParser = new Parser();

export type ResolvedAnswer =
  | { widgetType: 'STANDARD_MCQ'; correctOptionId: string }
  | {
      widgetType: 'SLIDER_MANIPULATIVE';
      correctValue: number;
      tolerance: number;
    }
  | {
      widgetType: 'COORDINATE_PLOTTER';
      correctPoints: { x: number; y: number }[];
      tolerance: number;
    }
  | { widgetType: 'GRID_MATCHING'; correctPairs: [string, string][] }
  | {
      widgetType: 'DRAG_AND_DROP_LABELS';
      correctPlacements: Record<string, string>;
    }
  | {
      widgetType: 'SHAPE_SHADING';
      targetNumerator: number;
      totalRegions: number;
      shapeKind: 'polygon' | 'bar';
      requireContiguous: boolean;
    }
  | {
      widgetType: 'NUMERIC_OR_TEXT';
      correctAnswer: string | null;
      isNumeric: boolean;
    }
  | {
      widgetType: 'ANGLE_PROTRACTOR';
      correctAngle: number;
      tolerance: number;
      classification: AngleClassification | null;
    }
  | { widgetType: 'UNSUPPORTED' };

export interface GeneratedOption {
  id: string;
  optionLabel?: string;
  optionText?: string;
  isCorrect: boolean;
}

export interface GeneratedInstance {
  displayConfig: unknown;
  options?: GeneratedOption[];
  resolvedAnswer: ResolvedAnswer;
}

export interface QuestionLike {
  questionType: string;
  correctAnswer: string | null;
  widgetType?: string | null;
  widgetConfig?: unknown;
  options: {
    id: string;
    optionLabel?: string;
    optionText?: string;
    isCorrect: boolean;
  }[];
}

export function generateWidgetInstance(
  question: QuestionLike,
  seed: number,
): GeneratedInstance {
  const parsed = parseWidgetConfig(question.widgetType, question.widgetConfig);

  if (parsed.version === 2 && 'config' in parsed) {
    if (
      parsed.widgetType === 'STANDARD_MCQ' &&
      parsed.mode === 'parameterized'
    ) {
      return generateMcqInstance(parsed.config, seed);
    }

    if (parsed.widgetType === 'SLIDER_MANIPULATIVE') {
      if (parsed.mode === 'parameterized') {
        return generateSliderInstance(parsed.config, seed);
      }
      if (parsed.mode === 'fixed') {
        const c = parsed.config;
        return {
          displayConfig: { min: c.min, max: c.max, step: c.step, unit: c.unit },
          resolvedAnswer: {
            widgetType: 'SLIDER_MANIPULATIVE',
            correctValue: c.correctValue,
            tolerance: c.tolerance ?? 0.1,
          },
        };
      }
    }

    if (parsed.widgetType === 'SHAPE_SHADING' && parsed.mode === 'fixed') {
      return generateShapeShadingInstance(parsed.config);
    }

    if (parsed.widgetType === 'GRID_MATCHING' && parsed.mode === 'fixed') {
      return generateGridMatchingInstance(parsed.config);
    }

    if (parsed.widgetType === 'COORDINATE_PLOTTER' && parsed.mode === 'fixed') {
      return generateCoordinatePlotterInstance(parsed.config);
    }

    if (
      parsed.widgetType === 'DRAG_AND_DROP_LABELS' &&
      parsed.mode === 'fixed'
    ) {
      return generateDragDropInstance(parsed.config);
    }

    if (parsed.widgetType === 'ANGLE_PROTRACTOR' && parsed.mode === 'fixed') {
      return generateAngleProtractorInstance(parsed.config);
    }
  }

  // Legacy passthrough — v1, or v2 for widget types without a generator yet:
  // resolve today's fixed shape unchanged, no randomization.
  return resolveLegacyInstance(question);
}

// No RNG needed — SHAPE_SHADING has no legacy data to migrate (no
// `resolveLegacyInstance` case) and no parameterized mode yet, so the config
// the author wrote is passed straight through, same as SLIDER_MANIPULATIVE's
// `fixed` branch above. The target fraction is inherently visible to the
// student (it's the instruction text itself, e.g. "Color 1/2") — unlike
// Slider's `correctValue`, there's nothing to keep secret pre-submission.
function generateShapeShadingInstance(
  config: ShapeShadingFixedConfig,
): GeneratedInstance {
  return {
    displayConfig: {
      shape: config.shape,
      targetNumerator: config.targetNumerator,
      requireContiguous: config.requireContiguous,
    },
    resolvedAnswer: {
      widgetType: 'SHAPE_SHADING',
      targetNumerator: config.targetNumerator,
      totalRegions: config.shape.regions,
      shapeKind: config.shape.kind,
      requireContiguous: config.requireContiguous,
    },
  };
}

// No RNG, no legacy migration, no parameterized mode — same rationale as
// generateShapeShadingInstance above. The schema's own refine() rules
// already guarantee correctPairs only references real left/right ids, so
// (unlike resolveLegacyInstance's GRID_MATCHING branch) there's nothing left
// to defensively default here.
function generateGridMatchingInstance(
  config: GridMatchingFixedConfig,
): GeneratedInstance {
  return {
    displayConfig: { left: config.left, right: config.right },
    resolvedAnswer: {
      widgetType: 'GRID_MATCHING',
      correctPairs: config.correctPairs,
    },
  };
}

function generateCoordinatePlotterInstance(
  config: CoordinatePlotterFixedConfig,
): GeneratedInstance {
  return {
    displayConfig: {
      xRange: config.xRange,
      yRange: config.yRange,
      gridStep: config.gridStep,
    },
    resolvedAnswer: {
      widgetType: 'COORDINATE_PLOTTER',
      correctPoints: config.correctPoints,
      tolerance: config.tolerance,
    },
  };
}

// The schema's refine() rules guarantee at least one target carries a
// correctLabel, so — unlike resolveLegacyInstance's DRAG_AND_DROP_LABELS
// branch — this never needs an UNSUPPORTED fallback for an empty answer key.
function generateDragDropInstance(
  config: DragDropFixedConfig,
): GeneratedInstance {
  const correctPlacements: Record<string, string> = {};
  for (const target of config.targets) {
    if (target.correctLabel) {
      correctPlacements[target.id] = target.correctLabel;
    }
  }
  return {
    displayConfig: {
      labels: config.labels,
      targets: config.targets.map((t) => ({
        id: t.id,
        placeholder: t.placeholder,
      })),
    },
    resolvedAnswer: { widgetType: 'DRAG_AND_DROP_LABELS', correctPlacements },
  };
}

// correctAngle/tolerance/classification are the answer key — nothing about
// them belongs in displayConfig, the same reasoning as SLIDER_MANIPULATIVE's
// fixed branch above. The widget starts from an empty protractor; there is
// no visual state to strip here at all.
function generateAngleProtractorInstance(
  config: AngleProtractorFixedConfig,
): GeneratedInstance {
  return {
    displayConfig: {},
    resolvedAnswer: {
      widgetType: 'ANGLE_PROTRACTOR',
      correctAngle: config.correctAngle,
      tolerance: config.tolerance,
      classification: config.classification ?? null,
    },
  };
}

function generateMcqInstance(
  config: McqParameterizedConfig,
  seed: number,
): GeneratedInstance {
  const rng = mulberry32(seed);
  const scope: Record<string, number> = {};

  // Resolution order matters: secrets may reference given values, and
  // derived (display-safe) values may reference either — e.g. an equation's
  // right-hand side is *computed from* the secret answer, but must still be
  // shown to the student as part of the problem statement.
  for (const [name, range] of Object.entries(config.params.given)) {
    scope[name] = randomInt(rng, range.min, range.max);
  }
  for (const [name, entry] of Object.entries(config.params.secret)) {
    scope[name] =
      typeof entry === 'string'
        ? exprParser.parse(entry).evaluate(scope)
        : randomInt(rng, entry.min, entry.max);
  }
  for (const [name, expr] of Object.entries(config.params.derived ?? {})) {
    scope[name] = exprParser.parse(expr).evaluate(scope);
  }

  const correctValue = scope[config.answerKey.correct];
  const distractorValues = config.distractors.map((d) =>
    exprParser.parse(d.expr).evaluate(scope),
  );

  const shuffled = shuffleWithRng(
    [correctValue, ...distractorValues].map((value, i) => ({
      value,
      isCorrect: i === 0,
    })),
    rng,
  );

  const options: GeneratedOption[] = shuffled.map((entry, idx) => ({
    id: `gen-${idx}`,
    optionLabel: String.fromCharCode(65 + idx),
    optionText: String(entry.value),
    isCorrect: entry.isCorrect,
  }));

  const visibleValues: Record<string, number> = {};
  for (const name of [
    ...Object.keys(config.params.given),
    ...Object.keys(config.params.derived ?? {}),
  ]) {
    visibleValues[name] = scope[name];
  }
  const prompt = substituteTemplate(config.display.template, visibleValues);

  return {
    displayConfig: { prompt },
    options,
    resolvedAnswer: {
      widgetType: 'STANDARD_MCQ',
      correctOptionId: options.find((o) => o.isCorrect)!.id,
    },
  };
}

function generateSliderInstance(
  config: SliderParameterizedConfig,
  seed: number,
): GeneratedInstance {
  const rng = mulberry32(seed);
  const { given, hidden } = config.params;
  const correctValue = randomInt(
    rng,
    hidden.correctValue.min,
    hidden.correctValue.max,
  );

  return {
    displayConfig: {
      min: given.min,
      max: given.max,
      step: given.step,
      unit: given.unit,
    },
    resolvedAnswer: {
      widgetType: 'SLIDER_MANIPULATIVE',
      correctValue,
      tolerance: config.tolerance ?? 0.1,
    },
  };
}

function resolveLegacyInstance(question: QuestionLike): GeneratedInstance {
  const widgetType = question.widgetType ?? null;
  const rawConfig = question.widgetConfig ?? null;

  // `questionType === 'mcq'` is only a valid MCQ signal when no widget is
  // bound at all — it's the fallback for legacy questions authored before
  // widgetType existed. Once a widgetType is set, it is authoritative: the
  // question-editor form's "Question Type" field defaults to 'mcq' and is
  // independent of "Bind Interactive Widget", so an author binding e.g.
  // DRAG_AND_DROP_LABELS while leaving Question Type unchanged used to fall
  // into this branch anyway (`question.options` is empty for a widget-bound
  // question, so `correct` was always undefined) — resolving to UNSUPPORTED
  // and silently misgrading every real submission, not just previews (the
  // same root cause `previewWidgetInstance`'s hardcoded 'mcq' had).
  if (
    widgetType === 'STANDARD_MCQ' ||
    (!widgetType && question.questionType === 'mcq')
  ) {
    const correct = question.options.find((o) => o.isCorrect);
    return {
      displayConfig: rawConfig,
      options: question.options,
      resolvedAnswer: correct
        ? { widgetType: 'STANDARD_MCQ', correctOptionId: correct.id }
        : { widgetType: 'UNSUPPORTED' },
    };
  }

  if (widgetType === 'SLIDER_MANIPULATIVE') {
    // Legacy shape carries other authoring-time fields (defaultValue,
    // displayFormula, visualizationType, and sometimes a stray correctValue
    // the editor never actually wires up here — see the v2 fixed-mode path
    // above for the one that does) — none of them are read by SliderWidget,
    // which only destructures min/max/step/unit. Narrowing to just those
    // stops forwarding whatever else an author's config happened to carry.
    const cfg = (rawConfig ?? {}) as {
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    };
    const target =
      question.correctAnswer !== null
        ? parseFloat(question.correctAnswer)
        : NaN;
    return {
      displayConfig: {
        min: cfg.min,
        max: cfg.max,
        step: cfg.step,
        unit: cfg.unit,
      },
      resolvedAnswer: Number.isNaN(target)
        ? { widgetType: 'UNSUPPORTED' }
        : {
            widgetType: 'SLIDER_MANIPULATIVE',
            correctValue: target,
            tolerance: 0.1,
          },
    };
  }

  if (widgetType === 'COORDINATE_PLOTTER') {
    const cfg = (rawConfig ?? {}) as {
      xRange?: [number, number];
      yRange?: [number, number];
      gridStep?: number;
      correctPoints?: { x: number; y: number }[];
      tolerance?: number;
    };
    return {
      // correctPoints/tolerance move to correctReveal (widget-grader.ts) so
      // CoordinatePlotterWidget's post-submission reveal marker still works
      // without the answer sitting in the pre-submission network payload.
      displayConfig: {
        xRange: cfg.xRange,
        yRange: cfg.yRange,
        gridStep: cfg.gridStep,
      },
      resolvedAnswer: {
        widgetType: 'COORDINATE_PLOTTER',
        correctPoints: cfg.correctPoints ?? [],
        tolerance: cfg.tolerance ?? 0.1,
      },
    };
  }

  if (widgetType === 'GRID_MATCHING') {
    const cfg = (rawConfig ?? {}) as {
      left?: unknown;
      right?: unknown;
      correctPairs?: [string, string][];
    };
    return {
      // correctPairs moves to correctReveal (widget-grader.ts) — same reason
      // as COORDINATE_PLOTTER above.
      displayConfig: { left: cfg.left, right: cfg.right },
      resolvedAnswer: {
        widgetType: 'GRID_MATCHING',
        correctPairs: cfg.correctPairs ?? [],
      },
    };
  }

  // DRAG_AND_DROP_LABELS: the answer key is each target's authored
  // `correctLabel` (see widget-config-editor.tsx's target editor). A target
  // with no correctLabel is ambiguous — decorative slot vs. half-authored
  // question — so if *none* of them carry one, the question resolves to
  // UNSUPPORTED rather than silently grading everything as wrong.
  if (widgetType === 'DRAG_AND_DROP_LABELS') {
    type RawTarget =
      | {
          id?: string;
          placeholder?: string;
          label?: string;
          correctLabel?: string;
        }
      | string;
    const cfg = (rawConfig ?? {}) as {
      labels?: string[];
      targets?: RawTarget[];
    };
    const correctPlacements: Record<string, string> = {};
    (cfg.targets ?? []).forEach((t, idx) => {
      if (typeof t === 'object' && t.correctLabel) {
        correctPlacements[t.id ?? `target-${idx}`] = t.correctLabel;
      }
    });
    // Every field DragDropWidget actually renders (id/placeholder/label)
    // stays; correctLabel — the answer key DragDropWidget never reads and
    // has no reveal UI for — does not.
    const strippedTargets = (cfg.targets ?? []).map((t) =>
      typeof t === 'string'
        ? t
        : { id: t.id, placeholder: t.placeholder, label: t.label },
    );
    return {
      displayConfig: { labels: cfg.labels, targets: strippedTargets },
      resolvedAnswer:
        Object.keys(correctPlacements).length > 0
          ? { widgetType: 'DRAG_AND_DROP_LABELS', correctPlacements }
          : { widgetType: 'UNSUPPORTED' },
    };
  }

  // CODE_PLAYGROUND stays retired: grading it honestly needs untrusted code
  // executed server-side, which is out of proportion to the feature. Its
  // client-side test-runner result is authored-only feedback, never a mark
  // (see the isGraded wiring in S4 of the widget-matrix repair plan) — the
  // enum value is kept so existing rows stay readable.
  if (widgetType === 'CODE_PLAYGROUND') {
    return {
      displayConfig: rawConfig,
      resolvedAnswer: { widgetType: 'UNSUPPORTED' },
    };
  }

  return {
    displayConfig: rawConfig,
    resolvedAnswer: {
      widgetType: 'NUMERIC_OR_TEXT',
      correctAnswer: question.correctAnswer,
      isNumeric: question.questionType === 'numeric',
    },
  };
}

function substituteTemplate(
  template: string,
  values: Record<string, number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}
