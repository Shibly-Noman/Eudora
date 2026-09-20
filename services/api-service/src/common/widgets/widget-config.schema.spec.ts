import {
  AngleProtractorFixedConfigSchema,
  CoordinatePlotterFixedConfigSchema,
  DragDropFixedConfigSchema,
  GridMatchingFixedConfigSchema,
  ShapeShadingFixedConfigSchema,
  classifyAngle,
  circularAngleDifference,
  parseWidgetConfig,
} from './widget-config.schema';

describe('ShapeShadingFixedConfigSchema', () => {
  const valid = {
    configVersion: 2 as const,
    mode: 'fixed' as const,
    shape: { kind: 'bar' as const, regions: 4 },
    targetNumerator: 2,
    requireContiguous: false,
  };

  it("accepts a target within the shape's region count", () => {
    expect(() => ShapeShadingFixedConfigSchema.parse(valid)).not.toThrow();
  });

  it('accepts a target equal to the region count (shade everything)', () => {
    expect(() =>
      ShapeShadingFixedConfigSchema.parse({ ...valid, targetNumerator: 4 }),
    ).not.toThrow();
  });

  it('accepts a target of zero (shade nothing)', () => {
    expect(() =>
      ShapeShadingFixedConfigSchema.parse({ ...valid, targetNumerator: 0 }),
    ).not.toThrow();
  });

  it('rejects a target greater than the region count — this was the unbounded gap', () => {
    expect(() =>
      ShapeShadingFixedConfigSchema.parse({ ...valid, targetNumerator: 8 }),
    ).toThrow(/targetNumerator/);
  });

  it('rejects the same over-target on a polygon shape', () => {
    expect(() =>
      ShapeShadingFixedConfigSchema.parse({
        ...valid,
        shape: { kind: 'polygon', regions: 6 },
        targetNumerator: 7,
      }),
    ).toThrow(/targetNumerator/);
  });

  it('rejects a region count below the per-kind minimum (bar < 2, polygon < 3)', () => {
    expect(() =>
      ShapeShadingFixedConfigSchema.parse({
        ...valid,
        shape: { kind: 'polygon', regions: 2 },
      }),
    ).toThrow();
  });
});

describe('parseWidgetConfig — SHAPE_SHADING', () => {
  it('routes a valid v2 fixed config to the SHAPE_SHADING branch', () => {
    const result = parseWidgetConfig('SHAPE_SHADING', {
      configVersion: 2,
      mode: 'fixed',
      shape: { kind: 'bar', regions: 4 },
      targetNumerator: 2,
      requireContiguous: false,
    });
    expect(result.version).toBe(2);
    if (
      result.version === 2 &&
      'config' in result &&
      result.widgetType === 'SHAPE_SHADING'
    ) {
      expect(result.config.targetNumerator).toBe(2);
    } else {
      throw new Error('expected a parsed v2 SHAPE_SHADING config');
    }
  });

  it('throws when the out-of-range config reaches the parser (authoring-time validation gate)', () => {
    expect(() =>
      parseWidgetConfig('SHAPE_SHADING', {
        configVersion: 2,
        mode: 'fixed',
        shape: { kind: 'bar', regions: 4 },
        targetNumerator: 9,
        requireContiguous: false,
      }),
    ).toThrow();
  });

  it('treats an unversioned config as v1 passthrough, unvalidated', () => {
    const result = parseWidgetConfig('SHAPE_SHADING', {
      shape: { kind: 'bar', regions: 4 },
    });
    expect(result.version).toBe(1);
  });
});

describe('GridMatchingFixedConfigSchema', () => {
  const valid = {
    configVersion: 2 as const,
    mode: 'fixed' as const,
    left: [
      { id: 'l1', text: 'Cat' },
      { id: 'l2', text: 'Dog' },
    ],
    right: [
      { id: 'r1', text: 'Meow' },
      { id: 'r2', text: 'Woof' },
    ],
    correctPairs: [
      ['l1', 'r1'],
      ['l2', 'r2'],
    ] as [string, string][],
  };

  it('accepts a well-formed config', () => {
    expect(() => GridMatchingFixedConfigSchema.parse(valid)).not.toThrow();
  });

  it('rejects empty left or right columns', () => {
    expect(() =>
      GridMatchingFixedConfigSchema.parse({ ...valid, left: [] }),
    ).toThrow();
  });

  it('rejects zero correctPairs — an unanswerable question', () => {
    expect(() =>
      GridMatchingFixedConfigSchema.parse({ ...valid, correctPairs: [] }),
    ).toThrow();
  });

  it('rejects a correctPairs entry referencing a left id that does not exist', () => {
    expect(() =>
      GridMatchingFixedConfigSchema.parse({
        ...valid,
        correctPairs: [['stale-id', 'r1']],
      }),
    ).toThrow(/correctPairs/);
  });

  it('rejects a correctPairs entry referencing a right id that does not exist', () => {
    expect(() =>
      GridMatchingFixedConfigSchema.parse({
        ...valid,
        correctPairs: [['l1', 'stale-id']],
      }),
    ).toThrow(/correctPairs/);
  });

  it('rejects duplicate ids within left', () => {
    expect(() =>
      GridMatchingFixedConfigSchema.parse({
        ...valid,
        left: [
          { id: 'l1', text: 'Cat' },
          { id: 'l1', text: 'Dog' },
        ],
      }),
    ).toThrow(/left/);
  });
});

describe('CoordinatePlotterFixedConfigSchema', () => {
  const valid = {
    configVersion: 2 as const,
    mode: 'fixed' as const,
    xRange: [-10, 10] as [number, number],
    yRange: [-10, 10] as [number, number],
    gridStep: 1,
    correctPoints: [{ x: 2, y: 2 }],
    tolerance: 0.1,
  };

  it('accepts a well-formed config', () => {
    expect(() => CoordinatePlotterFixedConfigSchema.parse(valid)).not.toThrow();
  });

  it('rejects zero correctPoints — an unanswerable question', () => {
    expect(() =>
      CoordinatePlotterFixedConfigSchema.parse({
        ...valid,
        correctPoints: [],
      }),
    ).toThrow();
  });

  it('rejects a correctPoints entry outside xRange', () => {
    expect(() =>
      CoordinatePlotterFixedConfigSchema.parse({
        ...valid,
        correctPoints: [{ x: 20, y: 2 }],
      }),
    ).toThrow(/correctPoints/);
  });

  it('rejects a correctPoints entry outside yRange', () => {
    expect(() =>
      CoordinatePlotterFixedConfigSchema.parse({
        ...valid,
        correctPoints: [{ x: 2, y: -20 }],
      }),
    ).toThrow(/correctPoints/);
  });

  it('rejects an inverted xRange (min >= max)', () => {
    expect(() =>
      CoordinatePlotterFixedConfigSchema.parse({
        ...valid,
        xRange: [10, -10],
      }),
    ).toThrow(/xRange/);
  });
});

describe('DragDropFixedConfigSchema', () => {
  const valid = {
    configVersion: 2 as const,
    mode: 'fixed' as const,
    labels: ['Fish', 'Bird'],
    targets: [
      { id: 'water', placeholder: 'Lives in water', correctLabel: 'Fish' },
      { id: 'nest', placeholder: 'Lives in a nest', correctLabel: 'Bird' },
    ],
  };

  it('accepts a well-formed config', () => {
    expect(() => DragDropFixedConfigSchema.parse(valid)).not.toThrow();
  });

  it('accepts a decorative target with no correctLabel, as long as another target has one', () => {
    expect(() =>
      DragDropFixedConfigSchema.parse({
        ...valid,
        targets: [
          ...valid.targets,
          { id: 'decor', placeholder: 'Just for show' },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects zero targets', () => {
    expect(() =>
      DragDropFixedConfigSchema.parse({ ...valid, targets: [] }),
    ).toThrow();
  });

  it('rejects when no target carries a correctLabel — this was the silent-UNSUPPORTED gap', () => {
    expect(() =>
      DragDropFixedConfigSchema.parse({
        ...valid,
        targets: [{ id: 'water', placeholder: 'Lives in water' }],
      }),
    ).toThrow(/correctLabel/);
  });

  it("rejects a correctLabel that doesn't match any authored label", () => {
    expect(() =>
      DragDropFixedConfigSchema.parse({
        ...valid,
        targets: [
          { id: 'water', placeholder: 'Lives in water', correctLabel: 'Frog' },
        ],
      }),
    ).toThrow(/correctLabel/);
  });

  it('rejects duplicate target ids', () => {
    expect(() =>
      DragDropFixedConfigSchema.parse({
        ...valid,
        targets: [
          ...valid.targets,
          { id: 'water', placeholder: 'dup', correctLabel: 'Fish' },
        ],
      }),
    ).toThrow(/target/);
  });
});

describe('classifyAngle', () => {
  it('classifies the open ranges', () => {
    expect(classifyAngle(45, 5)).toBe('acute');
    expect(classifyAngle(135, 5)).toBe('obtuse');
    expect(classifyAngle(270, 5)).toBe('reflex');
  });

  it('classifies right and straight within the tolerance band', () => {
    expect(classifyAngle(90, 5)).toBe('right');
    expect(classifyAngle(94, 5)).toBe('right');
    expect(classifyAngle(180, 5)).toBe('straight');
    expect(classifyAngle(176, 5)).toBe('straight');
  });

  it('does not let the right/straight bands leak into the open ranges just past them', () => {
    expect(classifyAngle(96, 5)).toBe('obtuse');
    expect(classifyAngle(186, 5)).toBe('reflex');
  });

  it('wraps 0°/360° correctly', () => {
    expect(classifyAngle(360, 5)).toBe(classifyAngle(0, 5));
  });
});

describe('circularAngleDifference', () => {
  it('measures the plain difference when there is no wrap', () => {
    expect(circularAngleDifference(45, 50)).toBe(5);
  });

  it('measures the short way around the wrap, not the long way', () => {
    // Naive |a - b| would read this as 357°.
    expect(circularAngleDifference(358, 1)).toBe(3);
  });

  it('is symmetric', () => {
    expect(circularAngleDifference(10, 350)).toBe(
      circularAngleDifference(350, 10),
    );
  });
});

describe('AngleProtractorFixedConfigSchema', () => {
  const valid = {
    configVersion: 2 as const,
    mode: 'fixed' as const,
    correctAngle: 45,
    tolerance: 5,
  };

  it('accepts a well-formed config with no classification', () => {
    expect(() => AngleProtractorFixedConfigSchema.parse(valid)).not.toThrow();
  });

  it('accepts a classification that matches the actual angle', () => {
    expect(() =>
      AngleProtractorFixedConfigSchema.parse({
        ...valid,
        classification: 'acute',
      }),
    ).not.toThrow();
  });

  it('rejects a classification that contradicts the actual angle — this was the config-time gap', () => {
    expect(() =>
      AngleProtractorFixedConfigSchema.parse({
        ...valid,
        classification: 'obtuse',
      }),
    ).toThrow(/classification/);
  });

  it('rejects a tolerance of zero — unwinnable by any real drag gesture', () => {
    expect(() =>
      AngleProtractorFixedConfigSchema.parse({ ...valid, tolerance: 0 }),
    ).toThrow();
  });

  it('rejects an angle outside 0-360', () => {
    expect(() =>
      AngleProtractorFixedConfigSchema.parse({ ...valid, correctAngle: 400 }),
    ).toThrow();
  });
});
