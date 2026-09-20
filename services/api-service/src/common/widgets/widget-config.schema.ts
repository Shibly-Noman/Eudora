import { z } from 'zod';

// ─── Shared building blocks ──────────────────────────────────────────────────

const RangeSchema = z.object({ min: z.number(), max: z.number() });

// A "secret" (answer-key) value is either randomized within a range, or
// derived from a formula string evaluated over the other generated values
// (e.g. "a * x + b") — never interpolated into the visible prompt template.
const SecretEntrySchema = z.union([RangeSchema, z.string()]);

// ─── STANDARD_MCQ (parameterized) ────────────────────────────────────────────
//
// Three-way split, resolved in this order:
//   given   — author-set ranges, randomized, always safe to display.
//   secret  — the answer variable(s): randomized (range) or a formula over
//             given values. NEVER safe to display (this is what's graded).
//   derived — formulas over given+secret that describe the problem statement
//             itself (e.g. an equation's right-hand side, computed FROM the
//             secret answer) — safe to display, but must never re-derive or
//             leak the secret value itself.
// `display.template` may only interpolate `given`/`derived` names.

export const McqParameterizedConfigSchema = z.object({
  configVersion: z.literal(2),
  mode: z.literal('parameterized'),
  params: z.object({
    given: z.record(z.string(), RangeSchema),
    secret: z.record(z.string(), SecretEntrySchema),
    derived: z.record(z.string(), z.string()).optional(),
  }),
  display: z.object({ template: z.string().min(1) }),
  answerKey: z.object({ correct: z.string().min(1) }),
  distractors: z.array(z.object({ expr: z.string().min(1) })).min(1),
});

export type McqParameterizedConfig = z.infer<
  typeof McqParameterizedConfigSchema
>;

// ─── SLIDER_MANIPULATIVE (fixed + parameterized) ─────────────────────────────

export const SliderFixedConfigSchema = z.object({
  configVersion: z.literal(2),
  mode: z.literal('fixed'),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  unit: z.string().optional(),
  correctValue: z.number(),
  tolerance: z.number().optional(),
});

export type SliderFixedConfig = z.infer<typeof SliderFixedConfigSchema>;

export const SliderParameterizedConfigSchema = z.object({
  configVersion: z.literal(2),
  mode: z.literal('parameterized'),
  params: z.object({
    given: z.object({
      min: z.number(),
      max: z.number(),
      step: z.number(),
      unit: z.string().optional(),
    }),
    hidden: z.object({ correctValue: RangeSchema }),
  }),
  tolerance: z.number().optional(),
});

export type SliderParameterizedConfig = z.infer<
  typeof SliderParameterizedConfigSchema
>;

// ─── SHAPE_SHADING (fixed only — no parameterized mode yet) ──────────────────
//
// Two shape kinds, not arbitrary custom SVG — kept bounded, same discipline
// as COORDINATE_PLOTTER's fixed grid rather than an open-ended shape editor.
// Denominator is always the shape's `regions` count — never a separately
// authored field, so numerator/denominator can't drift out of sync with what
// the shape can actually represent.

export const ShapeShadingFixedConfigSchema = z
  .object({
    configVersion: z.literal(2),
    mode: z.literal('fixed'),
    shape: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('polygon'),
        regions: z.number().int().min(3).max(12),
      }),
      z.object({
        kind: z.literal('bar'),
        regions: z.number().int().min(2).max(12),
      }),
    ]),
    targetNumerator: z.number().int().min(0),
    requireContiguous: z.boolean().default(false),
  })
  // The grader compares the submitted shaded-region count to targetNumerator
  // exactly (widget-grader.ts's SHAPE_SHADING case) — a target above the
  // shape's own region count could never be satisfied by any answer, so it's
  // rejected here rather than saved as a silently unanswerable question.
  .refine((data) => data.targetNumerator <= data.shape.regions, {
    message: "targetNumerator cannot exceed the shape's regions",
    path: ['targetNumerator'],
  });

export type ShapeShadingFixedConfig = z.infer<
  typeof ShapeShadingFixedConfigSchema
>;

// ─── GRID_MATCHING (fixed only — no parameterized mode yet) ─────────────────

const GridMatchingItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const GridMatchingFixedConfigSchema = z
  .object({
    configVersion: z.literal(2),
    mode: z.literal('fixed'),
    left: z.array(GridMatchingItemSchema).min(1),
    right: z.array(GridMatchingItemSchema).min(1),
    correctPairs: z.array(z.tuple([z.string(), z.string()])).min(1),
  })
  .refine(
    (data) => new Set(data.left.map((i) => i.id)).size === data.left.length,
    { message: 'left item ids must be unique', path: ['left'] },
  )
  .refine(
    (data) => new Set(data.right.map((i) => i.id)).size === data.right.length,
    { message: 'right item ids must be unique', path: ['right'] },
  )
  // Every pair must reference items that actually exist — a stale id (e.g.
  // left/right edited after correctPairs was set) would make the grader's
  // exact-match check (widget-grader.ts's GRID_MATCHING case) unsatisfiable
  // by any student action, the same failure mode SHAPE_SHADING's
  // targetNumerator refine already guards against.
  .refine(
    (data) => {
      const leftIds = new Set(data.left.map((i) => i.id));
      const rightIds = new Set(data.right.map((i) => i.id));
      return data.correctPairs.every(
        ([l, r]) => leftIds.has(l) && rightIds.has(r),
      );
    },
    {
      message:
        'every correctPairs entry must reference an existing left and right item id',
      path: ['correctPairs'],
    },
  );

export type GridMatchingFixedConfig = z.infer<
  typeof GridMatchingFixedConfigSchema
>;

// ─── COORDINATE_PLOTTER (fixed only — no parameterized mode yet) ────────────

const CoordinatePointSchema = z.object({ x: z.number(), y: z.number() });

export const CoordinatePlotterFixedConfigSchema = z
  .object({
    configVersion: z.literal(2),
    mode: z.literal('fixed'),
    xRange: z.tuple([z.number(), z.number()]),
    yRange: z.tuple([z.number(), z.number()]),
    gridStep: z.number().positive(),
    correctPoints: z.array(CoordinatePointSchema).min(1),
    tolerance: z.number().nonnegative().default(0.1),
  })
  .refine((data) => data.xRange[0] < data.xRange[1], {
    message: 'xRange must be [min, max] with min < max',
    path: ['xRange'],
  })
  .refine((data) => data.yRange[0] < data.yRange[1], {
    message: 'yRange must be [min, max] with min < max',
    path: ['yRange'],
  })
  // A correct point outside the plottable grid can never be placed by a
  // student confined to it — same "can never be satisfied" class of bug as
  // GRID_MATCHING's dangling-id check above.
  .refine(
    (data) =>
      data.correctPoints.every(
        (p) =>
          p.x >= data.xRange[0] &&
          p.x <= data.xRange[1] &&
          p.y >= data.yRange[0] &&
          p.y <= data.yRange[1],
      ),
    {
      message: 'every correctPoints entry must fall within xRange and yRange',
      path: ['correctPoints'],
    },
  );

export type CoordinatePlotterFixedConfig = z.infer<
  typeof CoordinatePlotterFixedConfigSchema
>;

// ─── DRAG_AND_DROP_LABELS (fixed only — no parameterized mode yet) ──────────

const DragDropTargetSchema = z.object({
  id: z.string().min(1),
  placeholder: z.string(),
  correctLabel: z.string().min(1).optional(),
});

export const DragDropFixedConfigSchema = z
  .object({
    configVersion: z.literal(2),
    mode: z.literal('fixed'),
    labels: z.array(z.string().min(1)).min(1),
    targets: z.array(DragDropTargetSchema).min(1),
  })
  .refine(
    (data) =>
      new Set(data.targets.map((t) => t.id)).size === data.targets.length,
    { message: 'target ids must be unique', path: ['targets'] },
  )
  // Mirrors widget-generator.ts's legacy UNSUPPORTED fallback for this exact
  // condition, but catches it at authoring time instead of leaving a
  // half-authored question to silently resolve as ungradeable.
  .refine((data) => data.targets.some((t) => t.correctLabel), {
    message:
      'at least one target must have a correctLabel, or this question can never be graded',
    path: ['targets'],
  })
  .refine(
    (data) => {
      const labelSet = new Set(data.labels);
      return data.targets.every(
        (t) => !t.correctLabel || labelSet.has(t.correctLabel),
      );
    },
    {
      message:
        "every target's correctLabel must match one of the authored labels",
      path: ['targets'],
    },
  );

export type DragDropFixedConfig = z.infer<typeof DragDropFixedConfigSchema>;

// ─── ANGLE_PROTRACTOR (fixed only — no parameterized mode yet) ──────────────
//
// One ray is fixed along the baseline (0°) and the student drags only the
// other, so the measured angle is anchored to a real orientation rather than
// being reproducible at any rotation — a free two-ray drag would let "make a
// 45° angle" and "make it point northeast" both read as correct for the same
// gesture, which throws away exactly what the widget is meant to test.

export const AngleClassificationSchema = z.enum([
  'acute',
  'right',
  'obtuse',
  'straight',
  'reflex',
]);
export type AngleClassification = z.infer<typeof AngleClassificationSchema>;

// The angle a straight or right classification is centred on tolerates the
// same `tolerance` window as the numeric check — one dial, not two — so a
// submission that passes the distance check can never fail the
// classification check it's paired with, or vice-versa. Order matters: the
// narrow right/straight bands are tested before the open acute/obtuse/reflex
// ranges so they aren't shadowed by them.
export function classifyAngle(
  angleDegrees: number,
  tolerance: number,
): AngleClassification {
  const a = ((angleDegrees % 360) + 360) % 360;
  if (Math.abs(a - 90) <= tolerance) return 'right';
  if (Math.abs(a - 180) <= tolerance) return 'straight';
  if (a > 0 && a < 90) return 'acute';
  if (a > 90 && a < 180) return 'obtuse';
  return 'reflex';
}

// Plain `Math.abs(a - b)` breaks at the wrap: 350° and 10° are 20° apart, not
// 340°. The shorter arc around the circle is always the true difference.
export function circularAngleDifference(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

export const AngleProtractorFixedConfigSchema = z
  .object({
    configVersion: z.literal(2),
    mode: z.literal('fixed'),
    correctAngle: z.number().min(0).max(360),
    // A tolerance of 0 would make a continuous drag gesture unwinnable by
    // any real student, the same "unanswerable by construction" class of
    // gap SHAPE_SHADING's targetNumerator refine guards against below.
    tolerance: z.number().min(1).max(45).default(5),
    classification: AngleClassificationSchema.optional(),
  })
  // An authored classification that doesn't actually describe correctAngle
  // would make the two grading checks (see widget-grader.ts) permanently
  // disagree — a submission close enough to pass the angle check could
  // still fail the classification check no correct answer could ever
  // satisfy.
  .refine(
    (data) =>
      !data.classification ||
      classifyAngle(data.correctAngle, data.tolerance) === data.classification,
    {
      message:
        'classification does not match the actual classification of correctAngle at this tolerance',
      path: ['classification'],
    },
  );

export type AngleProtractorFixedConfig = z.infer<
  typeof AngleProtractorFixedConfigSchema
>;

// ─── Discriminated parse result ──────────────────────────────────────────────
//
// No `configVersion` field, or `configVersion !== 2`, means today's exact
// per-widget-type shape — returned untouched as a "v1" passthrough forever,
// regardless of widgetType. `configVersion: 2` is Zod-validated for the
// widget types that have a schema (STANDARD_MCQ, SLIDER_MANIPULATIVE,
// SHAPE_SHADING, GRID_MATCHING, COORDINATE_PLOTTER, DRAG_AND_DROP_LABELS,
// ANGLE_PROTRACTOR);
// other widget types with configVersion: 2 are accepted as an opaque v2
// passthrough until their own phase adds a schema.

export type ParsedWidgetConfig =
  | { version: 1; raw: unknown }
  | {
      version: 2;
      widgetType: 'STANDARD_MCQ';
      mode: 'parameterized';
      config: McqParameterizedConfig;
    }
  | {
      version: 2;
      widgetType: 'SLIDER_MANIPULATIVE';
      mode: 'fixed';
      config: SliderFixedConfig;
    }
  | {
      version: 2;
      widgetType: 'SLIDER_MANIPULATIVE';
      mode: 'parameterized';
      config: SliderParameterizedConfig;
    }
  | {
      version: 2;
      widgetType: 'SHAPE_SHADING';
      mode: 'fixed';
      config: ShapeShadingFixedConfig;
    }
  | {
      version: 2;
      widgetType: 'GRID_MATCHING';
      mode: 'fixed';
      config: GridMatchingFixedConfig;
    }
  | {
      version: 2;
      widgetType: 'COORDINATE_PLOTTER';
      mode: 'fixed';
      config: CoordinatePlotterFixedConfig;
    }
  | {
      version: 2;
      widgetType: 'DRAG_AND_DROP_LABELS';
      mode: 'fixed';
      config: DragDropFixedConfig;
    }
  | {
      version: 2;
      widgetType: 'ANGLE_PROTRACTOR';
      mode: 'fixed';
      config: AngleProtractorFixedConfig;
    }
  | { version: 2; widgetType: string; mode: string; raw: unknown };

// Parameterized MCQ questions generate their options fresh per attempt —
// they never have static QuestionOption rows, so authoring-time validation
// that normally requires literal options must be skipped for them.
export function isParameterizedWidgetConfig(raw: unknown): boolean {
  return (
    !!raw &&
    typeof raw === 'object' &&
    (raw as Record<string, unknown>).configVersion === 2 &&
    (raw as Record<string, unknown>).mode === 'parameterized'
  );
}

export function parseWidgetConfig(
  widgetType: string | null | undefined,
  raw: unknown,
): ParsedWidgetConfig {
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as Record<string, unknown>).configVersion !== 2
  ) {
    return { version: 1, raw };
  }

  const obj = raw as Record<string, unknown>;
  const mode = typeof obj.mode === 'string' ? obj.mode : 'fixed';

  if (widgetType === 'STANDARD_MCQ' && mode === 'parameterized') {
    return {
      version: 2,
      widgetType: 'STANDARD_MCQ',
      mode: 'parameterized',
      config: McqParameterizedConfigSchema.parse(obj),
    };
  }

  if (widgetType === 'SLIDER_MANIPULATIVE' && mode === 'fixed') {
    return {
      version: 2,
      widgetType: 'SLIDER_MANIPULATIVE',
      mode: 'fixed',
      config: SliderFixedConfigSchema.parse(obj),
    };
  }

  if (widgetType === 'SLIDER_MANIPULATIVE' && mode === 'parameterized') {
    return {
      version: 2,
      widgetType: 'SLIDER_MANIPULATIVE',
      mode: 'parameterized',
      config: SliderParameterizedConfigSchema.parse(obj),
    };
  }

  if (widgetType === 'SHAPE_SHADING' && mode === 'fixed') {
    return {
      version: 2,
      widgetType: 'SHAPE_SHADING',
      mode: 'fixed',
      config: ShapeShadingFixedConfigSchema.parse(obj),
    };
  }

  if (widgetType === 'GRID_MATCHING' && mode === 'fixed') {
    return {
      version: 2,
      widgetType: 'GRID_MATCHING',
      mode: 'fixed',
      config: GridMatchingFixedConfigSchema.parse(obj),
    };
  }

  if (widgetType === 'COORDINATE_PLOTTER' && mode === 'fixed') {
    return {
      version: 2,
      widgetType: 'COORDINATE_PLOTTER',
      mode: 'fixed',
      config: CoordinatePlotterFixedConfigSchema.parse(obj),
    };
  }

  if (widgetType === 'DRAG_AND_DROP_LABELS' && mode === 'fixed') {
    return {
      version: 2,
      widgetType: 'DRAG_AND_DROP_LABELS',
      mode: 'fixed',
      config: DragDropFixedConfigSchema.parse(obj),
    };
  }

  if (widgetType === 'ANGLE_PROTRACTOR' && mode === 'fixed') {
    return {
      version: 2,
      widgetType: 'ANGLE_PROTRACTOR',
      mode: 'fixed',
      config: AngleProtractorFixedConfigSchema.parse(obj),
    };
  }

  return { version: 2, widgetType: widgetType ?? '', mode, raw: obj };
}
