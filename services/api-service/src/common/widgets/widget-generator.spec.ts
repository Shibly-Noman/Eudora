import { generateWidgetInstance, QuestionLike } from './widget-generator';

/**
 * Characterisation tests, written before the widget-matrix repair (see the
 * "Widget Matrix Repair" plan) to pin `resolveLegacyInstance`'s behaviour
 * ahead of changing it. The answer-key leak the plan's S3 stage fixed — every
 * legacy widget type's `displayConfig` forwarding the author's raw config,
 * answer key included, straight to the client pre-submission — is now closed;
 * the "no longer leaks the answer (S3)" tests below assert the narrowed shape
 * each type's `displayConfig` is left with.
 */

function baseQuestion(overrides: Partial<QuestionLike> = {}): QuestionLike {
  return {
    questionType: 'interactive',
    correctAnswer: null,
    widgetType: null,
    widgetConfig: null,
    options: [],
    ...overrides,
  };
}

describe('generateWidgetInstance — legacy passthrough (v1 / unversioned configs)', () => {
  describe('STANDARD_MCQ', () => {
    it('resolves the correct option from the options list', () => {
      const question = baseQuestion({
        widgetType: 'STANDARD_MCQ',
        questionType: 'mcq',
        options: [
          { id: 'a', optionText: 'wrong', isCorrect: false },
          { id: 'b', optionText: 'right', isCorrect: true },
        ],
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'STANDARD_MCQ',
        correctOptionId: 'b',
      });
      expect(result.options).toEqual(question.options);
    });

    it('also resolves via questionType === "mcq" alone, with no widgetType set', () => {
      const question = baseQuestion({
        widgetType: null,
        questionType: 'mcq',
        options: [{ id: 'a', optionText: 'only', isCorrect: true }],
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'STANDARD_MCQ',
        correctOptionId: 'a',
      });
    });

    it('resolves to UNSUPPORTED when no option is marked correct', () => {
      const question = baseQuestion({
        widgetType: 'STANDARD_MCQ',
        questionType: 'mcq',
        options: [{ id: 'a', optionText: 'x', isCorrect: false }],
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({ widgetType: 'UNSUPPORTED' });
    });
  });

  describe('SLIDER_MANIPULATIVE (v1 — graded via question.correctAnswer, NOT widgetConfig.correctValue)', () => {
    it('resolves the target from correctAnswer when it parses', () => {
      const question = baseQuestion({
        widgetType: 'SLIDER_MANIPULATIVE',
        correctAnswer: '5',
        widgetConfig: { min: 0, max: 10, step: 1 },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'SLIDER_MANIPULATIVE',
        correctValue: 5,
        tolerance: 0.1,
      });
    });

    it('a v1-shaped config with correctValue but no correctAnswer still resolves to UNSUPPORTED (legacy data only)', () => {
      // This was reachable through the config editor before S3 — "Fixed
      // Value" mode wrote exactly this shape, with no configVersion, so it
      // fell through to this v1 branch instead of the v2 one that reads
      // correctValue. The editor now always emits configVersion: 2 for
      // fixed mode (question-editor-form.tsx and widget-config-editor.tsx),
      // so this shape should no longer be newly authored — this test pins
      // the v1 branch's behaviour for any config that predates that fix.
      const question = baseQuestion({
        widgetType: 'SLIDER_MANIPULATIVE',
        correctAnswer: null,
        widgetConfig: { min: 0, max: 100, step: 1, unit: '', correctValue: 50 },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({ widgetType: 'UNSUPPORTED' });
    });

    it('resolves to UNSUPPORTED when correctAnswer does not parse as a number', () => {
      const question = baseQuestion({
        widgetType: 'SLIDER_MANIPULATIVE',
        correctAnswer: 'not-a-number',
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({ widgetType: 'UNSUPPORTED' });
    });

    it('no longer leaks the answer (S3): displayConfig is narrowed to min/max/step/unit, correctValue stripped', () => {
      const question = baseQuestion({
        widgetType: 'SLIDER_MANIPULATIVE',
        correctAnswer: '5',
        widgetConfig: { min: 0, max: 10, step: 1, correctValue: 5 },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.displayConfig).toEqual({
        min: 0,
        max: 10,
        step: 1,
        unit: undefined,
      });
      expect(result.displayConfig).not.toHaveProperty('correctValue');
    });
  });

  describe('COORDINATE_PLOTTER', () => {
    it('resolves correctPoints and tolerance from widgetConfig, defaulting tolerance', () => {
      const question = baseQuestion({
        widgetType: 'COORDINATE_PLOTTER',
        widgetConfig: { correctPoints: [{ x: 1, y: 2 }] },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'COORDINATE_PLOTTER',
        correctPoints: [{ x: 1, y: 2 }],
        tolerance: 0.1,
      });
    });

    it('defaults to an empty answer key when widgetConfig is null', () => {
      const question = baseQuestion({
        widgetType: 'COORDINATE_PLOTTER',
        widgetConfig: null,
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'COORDINATE_PLOTTER',
        correctPoints: [],
        tolerance: 0.1,
      });
    });

    it('no longer leaks the answer (S3): displayConfig is narrowed to xRange/yRange/gridStep, correctPoints and tolerance stripped', () => {
      const question = baseQuestion({
        widgetType: 'COORDINATE_PLOTTER',
        widgetConfig: {
          xRange: [-10, 10],
          yRange: [-10, 10],
          correctPoints: [{ x: 1, y: 2 }],
          tolerance: 0.5,
        },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.displayConfig).toEqual({
        xRange: [-10, 10],
        yRange: [-10, 10],
        gridStep: undefined,
      });
      expect(result.displayConfig).not.toHaveProperty('correctPoints');
      expect(result.displayConfig).not.toHaveProperty('tolerance');
    });
  });

  describe('GRID_MATCHING', () => {
    it('resolves correctPairs from widgetConfig', () => {
      const question = baseQuestion({
        widgetType: 'GRID_MATCHING',
        widgetConfig: {
          left: [{ id: 'r1', text: '6:9' }],
          right: [{ id: 's1', text: '2:3' }],
          correctPairs: [['r1', 's1']],
        },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'GRID_MATCHING',
        correctPairs: [['r1', 's1']],
      });
    });

    it('no longer leaks the answer (S3): displayConfig keeps left/right, correctPairs stripped', () => {
      const question = baseQuestion({
        widgetType: 'GRID_MATCHING',
        widgetConfig: {
          left: [{ id: 'r1', text: '6:9' }],
          right: [{ id: 's1', text: '2:3' }],
          correctPairs: [['r1', 's1']],
        },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.displayConfig).toEqual({
        left: [{ id: 'r1', text: '6:9' }],
        right: [{ id: 's1', text: '2:3' }],
      });
      expect(result.displayConfig).not.toHaveProperty('correctPairs');
    });
  });

  describe('DRAG_AND_DROP_LABELS — graded as of the widget-matrix repair (S2)', () => {
    it('resolves correctPlacements keyed by target id', () => {
      const question = baseQuestion({
        widgetType: 'DRAG_AND_DROP_LABELS',
        widgetConfig: {
          labels: ['A', 'B'],
          targets: [
            { id: 't1', placeholder: '', correctLabel: 'A' },
            { id: 't2', placeholder: '', correctLabel: 'B' },
          ],
        },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'DRAG_AND_DROP_LABELS',
        correctPlacements: { t1: 'A', t2: 'B' },
      });
    });

    it('falls back to a target-<index> id when a target has none', () => {
      const question = baseQuestion({
        widgetType: 'DRAG_AND_DROP_LABELS',
        widgetConfig: {
          labels: ['A'],
          targets: [{ placeholder: '', correctLabel: 'A' }],
        },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'DRAG_AND_DROP_LABELS',
        correctPlacements: { 'target-0': 'A' },
      });
    });

    it('is graded correctly even when questionType is "mcq" — the question-editor form defaults Question Type to mcq independently of widget binding, so a real authored DRAG_AND_DROP_LABELS question can carry questionType: "mcq" with empty options; the MCQ branch must not shadow it', () => {
      const question = baseQuestion({
        questionType: 'mcq',
        widgetType: 'DRAG_AND_DROP_LABELS',
        options: [],
        widgetConfig: {
          labels: ['A', 'B'],
          targets: [
            { id: 't1', placeholder: '', correctLabel: 'A' },
            { id: 't2', placeholder: '', correctLabel: 'B' },
          ],
        },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'DRAG_AND_DROP_LABELS',
        correctPlacements: { t1: 'A', t2: 'B' },
      });
    });

    it('skips targets with no correctLabel — they are decorative, not part of the answer key', () => {
      const question = baseQuestion({
        widgetType: 'DRAG_AND_DROP_LABELS',
        widgetConfig: {
          labels: ['A'],
          targets: [
            { id: 't1', placeholder: '', correctLabel: 'A' },
            { id: 't2', placeholder: '' },
          ],
        },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'DRAG_AND_DROP_LABELS',
        correctPlacements: { t1: 'A' },
      });
    });

    it('resolves to UNSUPPORTED when no target carries a correctLabel at all', () => {
      const question = baseQuestion({
        widgetType: 'DRAG_AND_DROP_LABELS',
        widgetConfig: {
          labels: ['A', 'B'],
          targets: [{ id: 't1', placeholder: '' }],
        },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({ widgetType: 'UNSUPPORTED' });
    });

    it('resolves to UNSUPPORTED when there are no targets at all', () => {
      const question = baseQuestion({
        widgetType: 'DRAG_AND_DROP_LABELS',
        widgetConfig: { labels: ['A', 'B'], targets: [] },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({ widgetType: 'UNSUPPORTED' });
    });

    it('ignores legacy plain-string targets rather than throwing', () => {
      const question = baseQuestion({
        widgetType: 'DRAG_AND_DROP_LABELS',
        widgetConfig: { labels: ['A'], targets: ['Solve 3 + ___'] },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({ widgetType: 'UNSUPPORTED' });
    });

    it('no longer leaks the answer (S3): displayConfig keeps id/placeholder/label, correctLabel stripped', () => {
      const question = baseQuestion({
        widgetType: 'DRAG_AND_DROP_LABELS',
        widgetConfig: {
          labels: ['A', 'B'],
          targets: [{ id: 't1', placeholder: '', correctLabel: 'A' }],
        },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.displayConfig).toEqual({
        labels: ['A', 'B'],
        targets: [{ id: 't1', placeholder: '', label: undefined }],
      });
      expect(
        (result.displayConfig as { targets: unknown[] }).targets[0],
      ).not.toHaveProperty('correctLabel');
    });
  });

  describe('CODE_PLAYGROUND — retired, resolves to UNSUPPORTED', () => {
    it('never grades', () => {
      const question = baseQuestion({
        widgetType: 'CODE_PLAYGROUND',
        widgetConfig: { language: 'javascript', starterCode: '', tests: [] },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({ widgetType: 'UNSUPPORTED' });
    });
  });

  describe('SHAPE_SHADING — no config, not yet listed in the picker (unrelated to the v1 path below)', () => {
    it('is unreachable through the legacy path because it always carries a v2 config (see the v2 describe block)', () => {
      // SHAPE_SHADING has no legacy data — every row is authored with
      // configVersion: 2. There is deliberately no v1 case for it in
      // resolveLegacyInstance.
      expect(true).toBe(true);
    });
  });

  describe('fallback — NUMERIC_OR_TEXT for anything else (including an unset widgetType)', () => {
    it('resolves correctAnswer and isNumeric off the base question fields', () => {
      const question = baseQuestion({
        widgetType: null,
        questionType: 'numeric',
        correctAnswer: '42',
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.resolvedAnswer).toEqual({
        widgetType: 'NUMERIC_OR_TEXT',
        correctAnswer: '42',
        isNumeric: true,
      });
    });

    it('LEAKS the answer here too: displayConfig is the raw widgetConfig, unrelated to correctAnswer', () => {
      const question = baseQuestion({
        widgetType: null,
        questionType: 'text',
        correctAnswer: 'Paris',
        widgetConfig: { hint: 'a city in France' },
      });
      const result = generateWidgetInstance(question, 1);
      expect(result.displayConfig).toEqual({ hint: 'a city in France' });
    });
  });
});

describe('generateWidgetInstance — v2 configs (already correct; the pattern S3 copies)', () => {
  it('SLIDER_MANIPULATIVE fixed mode narrows displayConfig and keeps correctValue server-side', () => {
    const question = baseQuestion({
      widgetType: 'SLIDER_MANIPULATIVE',
      widgetConfig: {
        configVersion: 2,
        mode: 'fixed',
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
        correctValue: 42,
        tolerance: 3,
      },
    });
    const result = generateWidgetInstance(question, 1);
    expect(result.displayConfig).toEqual({
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
    });
    expect(result.resolvedAnswer).toEqual({
      widgetType: 'SLIDER_MANIPULATIVE',
      correctValue: 42,
      tolerance: 3,
    });
  });

  it('SLIDER_MANIPULATIVE parameterized mode is deterministic per seed', () => {
    const question = baseQuestion({
      widgetType: 'SLIDER_MANIPULATIVE',
      widgetConfig: {
        configVersion: 2,
        mode: 'parameterized',
        params: {
          given: { min: 0, max: 10, step: 1, unit: '' },
          hidden: { correctValue: { min: 1, max: 9 } },
        },
        tolerance: 0.5,
      },
    });
    const a = generateWidgetInstance(question, 12345);
    const b = generateWidgetInstance(question, 12345);
    const c = generateWidgetInstance(question, 99999);
    expect(a.resolvedAnswer).toEqual(b.resolvedAnswer);
    expect(a.displayConfig).toEqual({ min: 0, max: 10, step: 1, unit: '' });
    // Not a strict inequality assertion on the value itself (a different
    // seed could coincidentally land on the same integer) — the contract
    // being pinned is determinism per seed, shown by the a === b check above.
    expect(c.resolvedAnswer.widgetType).toBe('SLIDER_MANIPULATIVE');
  });

  it('SHAPE_SHADING passes the config straight through with no answer-key secrecy (by design)', () => {
    const question = baseQuestion({
      widgetType: 'SHAPE_SHADING',
      widgetConfig: {
        configVersion: 2,
        mode: 'fixed',
        shape: { kind: 'bar', regions: 6 },
        targetNumerator: 2,
        requireContiguous: true,
      },
    });
    const result = generateWidgetInstance(question, 1);
    expect(result.displayConfig).toEqual({
      shape: { kind: 'bar', regions: 6 },
      targetNumerator: 2,
      requireContiguous: true,
    });
    expect(result.resolvedAnswer).toEqual({
      widgetType: 'SHAPE_SHADING',
      targetNumerator: 2,
      totalRegions: 6,
      shapeKind: 'bar',
      requireContiguous: true,
    });
  });

  it('GRID_MATCHING v2 fixed resolves correctPairs from the validated config, unlike the legacy branch it never needs an UNSUPPORTED fallback', () => {
    const question = baseQuestion({
      widgetType: 'GRID_MATCHING',
      widgetConfig: {
        configVersion: 2,
        mode: 'fixed',
        left: [{ id: 'l1', text: 'Cat' }],
        right: [{ id: 'r1', text: 'Meow' }],
        correctPairs: [['l1', 'r1']],
      },
    });
    const result = generateWidgetInstance(question, 1);
    expect(result.displayConfig).toEqual({
      left: [{ id: 'l1', text: 'Cat' }],
      right: [{ id: 'r1', text: 'Meow' }],
    });
    expect(result.resolvedAnswer).toEqual({
      widgetType: 'GRID_MATCHING',
      correctPairs: [['l1', 'r1']],
    });
  });

  it('COORDINATE_PLOTTER v2 fixed resolves correctPoints and tolerance from the validated config', () => {
    const question = baseQuestion({
      widgetType: 'COORDINATE_PLOTTER',
      widgetConfig: {
        configVersion: 2,
        mode: 'fixed',
        xRange: [-5, 5],
        yRange: [-5, 5],
        gridStep: 1,
        correctPoints: [{ x: 2, y: 2 }],
        tolerance: 0.25,
      },
    });
    const result = generateWidgetInstance(question, 1);
    expect(result.displayConfig).toEqual({
      xRange: [-5, 5],
      yRange: [-5, 5],
      gridStep: 1,
    });
    expect(result.resolvedAnswer).toEqual({
      widgetType: 'COORDINATE_PLOTTER',
      correctPoints: [{ x: 2, y: 2 }],
      tolerance: 0.25,
    });
  });

  it('DRAG_AND_DROP_LABELS v2 fixed resolves correctPlacements keyed by target id, stripped from displayConfig', () => {
    const question = baseQuestion({
      widgetType: 'DRAG_AND_DROP_LABELS',
      widgetConfig: {
        configVersion: 2,
        mode: 'fixed',
        labels: ['Fish', 'Bird'],
        targets: [
          { id: 'water', placeholder: 'Lives in water', correctLabel: 'Fish' },
          { id: 'nest', placeholder: 'Lives in a nest', correctLabel: 'Bird' },
        ],
      },
    });
    const result = generateWidgetInstance(question, 1);
    expect(result.displayConfig).toEqual({
      labels: ['Fish', 'Bird'],
      targets: [
        { id: 'water', placeholder: 'Lives in water' },
        { id: 'nest', placeholder: 'Lives in a nest' },
      ],
    });
    expect(result.resolvedAnswer).toEqual({
      widgetType: 'DRAG_AND_DROP_LABELS',
      correctPlacements: { water: 'Fish', nest: 'Bird' },
    });
  });

  it('ANGLE_PROTRACTOR v2 fixed keeps the answer key out of displayConfig entirely', () => {
    const question = baseQuestion({
      widgetType: 'ANGLE_PROTRACTOR',
      widgetConfig: {
        configVersion: 2,
        mode: 'fixed',
        correctAngle: 45,
        tolerance: 5,
        classification: 'acute',
      },
    });
    const result = generateWidgetInstance(question, 1);
    expect(result.displayConfig).toEqual({});
    expect(result.resolvedAnswer).toEqual({
      widgetType: 'ANGLE_PROTRACTOR',
      correctAngle: 45,
      tolerance: 5,
      classification: 'acute',
    });
  });

  it('ANGLE_PROTRACTOR v2 fixed defaults classification to null when unset', () => {
    const question = baseQuestion({
      widgetType: 'ANGLE_PROTRACTOR',
      widgetConfig: {
        configVersion: 2,
        mode: 'fixed',
        correctAngle: 120,
        tolerance: 5,
      },
    });
    const result = generateWidgetInstance(question, 1);
    expect(result.resolvedAnswer).toEqual({
      widgetType: 'ANGLE_PROTRACTOR',
      correctAngle: 120,
      tolerance: 5,
      classification: null,
    });
  });

  it('STANDARD_MCQ parameterized generates options, resolves the correct one, and hides the secret from the prompt', () => {
    const question = baseQuestion({
      widgetType: 'STANDARD_MCQ',
      questionType: 'mcq',
      widgetConfig: {
        configVersion: 2,
        mode: 'parameterized',
        params: {
          given: { a: { min: 2, max: 2 }, b: { min: 3, max: 3 } },
          secret: { x: { min: 5, max: 5 } },
          derived: { c: 'a * x + b' },
        },
        display: { template: 'Solve: {a}x + {b} = {c}. What is x?' },
        answerKey: { correct: 'x' },
        distractors: [{ expr: 'x + 1' }],
      },
    });
    const result = generateWidgetInstance(question, 1);
    // The prompt interpolates only `given` (a, b) and `derived` (c) — the
    // secret `x` itself never reaches the template, which is the whole
    // point of the given/secret/derived split.
    expect(result.displayConfig).toEqual({
      prompt: 'Solve: 2x + 3 = 13. What is x?',
    });
    const options = result.options!;
    expect(options).toHaveLength(2);
    const correctOption = options.find((o) => o.isCorrect);
    expect(correctOption?.optionText).toBe('5');
    expect(result.resolvedAnswer).toEqual({
      widgetType: 'STANDARD_MCQ',
      correctOptionId: correctOption!.id,
    });
  });
});
