import { gradeWidgetSubmission } from './widget-grader';
import { ResolvedAnswer } from './widget-generator';

describe('gradeWidgetSubmission', () => {
  describe('STANDARD_MCQ', () => {
    const answer: ResolvedAnswer = {
      widgetType: 'STANDARD_MCQ',
      correctOptionId: 'opt-1',
    };

    it('is correct when the selected option matches', () => {
      expect(
        gradeWidgetSubmission(answer, { selectedOptionId: 'opt-1' }),
      ).toEqual({
        isCorrect: true,
      });
    });

    it('is incorrect when the selected option does not match', () => {
      expect(
        gradeWidgetSubmission(answer, { selectedOptionId: 'opt-2' }),
      ).toEqual({
        isCorrect: false,
      });
    });

    it('is incorrect when nothing was selected', () => {
      expect(gradeWidgetSubmission(answer, {})).toEqual({ isCorrect: false });
    });
  });

  describe('SLIDER_MANIPULATIVE', () => {
    const answer: ResolvedAnswer = {
      widgetType: 'SLIDER_MANIPULATIVE',
      correctValue: 50,
      tolerance: 2,
    };

    it('is correct exactly on the value', () => {
      expect(
        gradeWidgetSubmission(answer, { interactionState: { finalValue: 50 } }),
      ).toEqual({ isCorrect: true, correctReveal: { correctValue: 50 } });
    });

    it('is correct within tolerance', () => {
      expect(
        gradeWidgetSubmission(answer, { interactionState: { finalValue: 52 } }),
      ).toEqual({ isCorrect: true, correctReveal: { correctValue: 50 } });
    });

    it('is incorrect just outside tolerance', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { finalValue: 52.1 },
        }),
      ).toEqual({ isCorrect: false, correctReveal: { correctValue: 50 } });
    });

    it('always returns correctReveal, win or lose', () => {
      const wrong = gradeWidgetSubmission(answer, {
        interactionState: { finalValue: 0 },
      });
      expect(wrong.correctReveal).toEqual({ correctValue: 50 });
    });

    it('is incorrect (not thrown) when finalValue is missing', () => {
      expect(gradeWidgetSubmission(answer, { interactionState: {} })).toEqual({
        isCorrect: false,
      });
    });

    it('is incorrect when finalValue is not a number', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { finalValue: 'not-a-number' as unknown as number },
        }),
      ).toEqual({ isCorrect: false });
    });

    it('is incorrect when interactionState is entirely absent', () => {
      expect(gradeWidgetSubmission(answer, {})).toEqual({ isCorrect: false });
    });
  });

  describe('COORDINATE_PLOTTER', () => {
    const answer: ResolvedAnswer = {
      widgetType: 'COORDINATE_PLOTTER',
      correctPoints: [
        { x: 1, y: 1 },
        { x: 3, y: 4 },
      ],
      tolerance: 0.5,
    };

    const correctReveal = {
      correctPoints: answer.correctPoints,
      tolerance: answer.tolerance,
    };

    it('is correct when every point matches within tolerance, any order', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: {
            points: [
              { x: 3.2, y: 4.1 },
              { x: 0.8, y: 1.2 },
            ],
          },
        }),
      ).toEqual({ isCorrect: true, correctReveal });
    });

    it('is incorrect when the count of points differs', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { points: [{ x: 1, y: 1 }] },
        }),
      ).toEqual({ isCorrect: false, correctReveal });
    });

    it('is incorrect when a point is outside tolerance', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: {
            points: [
              { x: 1, y: 1 },
              { x: 10, y: 10 },
            ],
          },
        }),
      ).toEqual({ isCorrect: false, correctReveal });
    });

    it('is incorrect (both empty counts equal, zero required) — no points submitted against a zero-point answer key', () => {
      const emptyAnswer: ResolvedAnswer = {
        widgetType: 'COORDINATE_PLOTTER',
        correctPoints: [],
        tolerance: 0.5,
      };
      expect(gradeWidgetSubmission(emptyAnswer, {})).toEqual({
        isCorrect: true,
        correctReveal: { correctPoints: [], tolerance: 0.5 },
      });
    });

    it('always returns correctReveal now — narrowing displayConfig (S3) moved the answer here', () => {
      const result = gradeWidgetSubmission(answer, {
        interactionState: { points: [{ x: 1, y: 1 }] },
      });
      expect(result.correctReveal).toEqual(correctReveal);
    });
  });

  describe('GRID_MATCHING', () => {
    const answer: ResolvedAnswer = {
      widgetType: 'GRID_MATCHING',
      correctPairs: [
        ['r1', 's1'],
        ['r2', 's2'],
      ],
    };

    const correctReveal = { correctPairs: answer.correctPairs };

    it('is correct when pairs match regardless of left/right order within a pair', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: {
            pairs: [
              ['s2', 'r2'],
              ['r1', 's1'],
            ],
          },
        }),
      ).toEqual({ isCorrect: true, correctReveal });
    });

    it('is incorrect when a pair is wrong', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: {
            pairs: [
              ['r1', 's2'],
              ['r2', 's1'],
            ],
          },
        }),
      ).toEqual({ isCorrect: false, correctReveal });
    });

    it('is incorrect when the count differs', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { pairs: [['r1', 's1']] },
        }),
      ).toEqual({ isCorrect: false, correctReveal });
    });

    it('always returns correctReveal now — narrowing displayConfig (S3) moved the answer here', () => {
      const result = gradeWidgetSubmission(answer, {
        interactionState: { pairs: [['r1', 's1']] },
      });
      expect(result.correctReveal).toEqual(correctReveal);
    });
  });

  describe('DRAG_AND_DROP_LABELS', () => {
    const answer: ResolvedAnswer = {
      widgetType: 'DRAG_AND_DROP_LABELS',
      correctPlacements: { t1: 'A', t2: 'B' },
    };

    it('is correct when every graded target has the right label', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { placements: { t1: 'A', t2: 'B' } },
        }),
      ).toEqual({ isCorrect: true });
    });

    it('is incorrect when a graded target has the wrong label', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { placements: { t1: 'B', t2: 'B' } },
        }),
      ).toEqual({ isCorrect: false });
    });

    it('is incorrect when a graded target is left empty', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { placements: { t1: 'A' } },
        }),
      ).toEqual({ isCorrect: false });
    });

    it('ignores an extra placement on a target with no answer key', () => {
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: {
            placements: { t1: 'A', t2: 'B', decorative: 'X' },
          },
        }),
      ).toEqual({ isCorrect: true });
    });

    it('is incorrect when interactionState is entirely absent', () => {
      expect(gradeWidgetSubmission(answer, {})).toEqual({ isCorrect: false });
    });

    it('returns no correctReveal — DragDropWidget has no post-submission reveal UI to feed', () => {
      const result = gradeWidgetSubmission(answer, {
        interactionState: { placements: { t1: 'A', t2: 'B' } },
      });
      expect(result.correctReveal).toBeUndefined();
    });
  });

  describe('SHAPE_SHADING', () => {
    it('is correct when the shaded count matches and contiguity is not required', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'SHAPE_SHADING',
        targetNumerator: 2,
        totalRegions: 6,
        shapeKind: 'bar',
        requireContiguous: false,
      };
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { shadedRegionIds: ['region-0', 'region-4'] },
        }),
      ).toEqual({ isCorrect: true });
    });

    it('is incorrect when the shaded count does not match the target', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'SHAPE_SHADING',
        targetNumerator: 2,
        totalRegions: 6,
        shapeKind: 'bar',
        requireContiguous: false,
      };
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { shadedRegionIds: ['region-0'] },
        }),
      ).toEqual({ isCorrect: false });
    });

    describe('contiguity — bar (no wrap)', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'SHAPE_SHADING',
        targetNumerator: 2,
        totalRegions: 6,
        shapeKind: 'bar',
        requireContiguous: true,
      };

      it('accepts adjacent regions', () => {
        expect(
          gradeWidgetSubmission(answer, {
            interactionState: { shadedRegionIds: ['region-2', 'region-3'] },
          }),
        ).toEqual({ isCorrect: true });
      });

      it('rejects non-adjacent regions', () => {
        expect(
          gradeWidgetSubmission(answer, {
            interactionState: { shadedRegionIds: ['region-0', 'region-5'] },
          }),
        ).toEqual({ isCorrect: false });
      });

      it('rejects wrap-around on a bar (no ring to close)', () => {
        const wrapAnswer: ResolvedAnswer = {
          widgetType: 'SHAPE_SHADING',
          targetNumerator: 2,
          totalRegions: 6,
          shapeKind: 'bar',
          requireContiguous: true,
        };
        expect(
          gradeWidgetSubmission(wrapAnswer, {
            interactionState: { shadedRegionIds: ['region-0', 'region-5'] },
          }),
        ).toEqual({ isCorrect: false });
      });
    });

    describe('contiguity — polygon (wraps)', () => {
      it('accepts adjacent wedges', () => {
        const answer: ResolvedAnswer = {
          widgetType: 'SHAPE_SHADING',
          targetNumerator: 3,
          totalRegions: 6,
          shapeKind: 'polygon',
          requireContiguous: true,
        };
        expect(
          gradeWidgetSubmission(answer, {
            interactionState: {
              shadedRegionIds: ['region-1', 'region-2', 'region-3'],
            },
          }),
        ).toEqual({ isCorrect: true });
      });

      it('accepts a wrap-around arc that closes the ring', () => {
        const answer: ResolvedAnswer = {
          widgetType: 'SHAPE_SHADING',
          targetNumerator: 3,
          totalRegions: 6,
          shapeKind: 'polygon',
          requireContiguous: true,
        };
        expect(
          gradeWidgetSubmission(answer, {
            interactionState: {
              shadedRegionIds: ['region-4', 'region-5', 'region-0'],
            },
          }),
        ).toEqual({ isCorrect: true });
      });

      it('rejects two separate arcs (more than one large gap)', () => {
        const answer: ResolvedAnswer = {
          widgetType: 'SHAPE_SHADING',
          targetNumerator: 4,
          totalRegions: 8,
          shapeKind: 'polygon',
          requireContiguous: true,
        };
        expect(
          gradeWidgetSubmission(answer, {
            interactionState: {
              shadedRegionIds: ['region-0', 'region-1', 'region-4', 'region-5'],
            },
          }),
        ).toEqual({ isCorrect: false });
      });
    });

    it('ignores contiguity when only one region is shaded', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'SHAPE_SHADING',
        targetNumerator: 1,
        totalRegions: 6,
        shapeKind: 'polygon',
        requireContiguous: true,
      };
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { shadedRegionIds: ['region-3'] },
        }),
      ).toEqual({ isCorrect: true });
    });

    it('is incorrect when a region id does not parse to an index', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'SHAPE_SHADING',
        targetNumerator: 2,
        totalRegions: 6,
        shapeKind: 'bar',
        requireContiguous: true,
      };
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { shadedRegionIds: ['region-2', 'not-a-region'] },
        }),
      ).toEqual({ isCorrect: false });
    });
  });

  describe('NUMERIC_OR_TEXT', () => {
    it('is correct on an exact case/space-insensitive text match', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'NUMERIC_OR_TEXT',
        correctAnswer: 'Paris',
        isNumeric: false,
      };
      expect(
        gradeWidgetSubmission(answer, { responseText: '  paris  ' }),
      ).toEqual({
        isCorrect: true,
      });
    });

    it('is incorrect on a text mismatch', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'NUMERIC_OR_TEXT',
        correctAnswer: 'Paris',
        isNumeric: false,
      };
      expect(gradeWidgetSubmission(answer, { responseText: 'London' })).toEqual(
        {
          isCorrect: false,
        },
      );
    });

    it('is correct on a numeric match within a small epsilon', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'NUMERIC_OR_TEXT',
        correctAnswer: '3.14',
        isNumeric: true,
      };
      expect(gradeWidgetSubmission(answer, { responseText: '3.1401' })).toEqual(
        {
          isCorrect: true,
        },
      );
    });

    it('is incorrect on a numeric mismatch', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'NUMERIC_OR_TEXT',
        correctAnswer: '3.14',
        isNumeric: true,
      };
      expect(gradeWidgetSubmission(answer, { responseText: '2.71' })).toEqual({
        isCorrect: false,
      });
    });

    it('falls back to text comparison when the numeric response does not parse', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'NUMERIC_OR_TEXT',
        correctAnswer: '3.14',
        isNumeric: true,
      };
      expect(gradeWidgetSubmission(answer, { responseText: 'pi' })).toEqual({
        isCorrect: false,
      });
    });

    it('returns an empty result (ungraded) when there is no correct answer on file', () => {
      const answer: ResolvedAnswer = {
        widgetType: 'NUMERIC_OR_TEXT',
        correctAnswer: null,
        isNumeric: false,
      };
      expect(
        gradeWidgetSubmission(answer, { responseText: 'anything' }),
      ).toEqual({});
    });
  });

  describe('ANGLE_PROTRACTOR', () => {
    const answer: ResolvedAnswer = {
      widgetType: 'ANGLE_PROTRACTOR',
      correctAngle: 45,
      tolerance: 5,
      classification: null,
    };

    it('is correct exactly on the angle', () => {
      expect(
        gradeWidgetSubmission(answer, { interactionState: { angle: 45 } }),
      ).toEqual({
        isCorrect: true,
        correctReveal: { correctAngle: 45, classification: null },
      });
    });

    it('is correct within tolerance', () => {
      expect(
        gradeWidgetSubmission(answer, { interactionState: { angle: 49 } }),
      ).toEqual({
        isCorrect: true,
        correctReveal: { correctAngle: 45, classification: null },
      });
    });

    it('is incorrect outside tolerance', () => {
      expect(
        gradeWidgetSubmission(answer, { interactionState: { angle: 55 } }),
      ).toEqual({
        isCorrect: false,
        correctReveal: { correctAngle: 45, classification: null },
      });
    });

    it('is incorrect when no angle was submitted', () => {
      expect(gradeWidgetSubmission(answer, {})).toEqual({
        isCorrect: false,
        correctReveal: { correctAngle: 45, classification: null },
      });
    });

    // The exact bug flagged in review: naive Math.abs(measured - correct)
    // reads 358 vs 1 as 357° apart and wrongly fails a submission that's
    // actually 3° off around the wrap. Picking the shorter arc is what
    // makes this pass.
    it('is correct across the 360°/0° wrap-around', () => {
      const wrapAnswer: ResolvedAnswer = {
        widgetType: 'ANGLE_PROTRACTOR',
        correctAngle: 358,
        tolerance: 5,
        classification: null,
      };
      expect(
        gradeWidgetSubmission(wrapAnswer, { interactionState: { angle: 1 } }),
      ).toEqual({
        isCorrect: true,
        correctReveal: { correctAngle: 358, classification: null },
      });
    });

    it('is incorrect across the wrap when actually far apart', () => {
      const wrapAnswer: ResolvedAnswer = {
        widgetType: 'ANGLE_PROTRACTOR',
        correctAngle: 358,
        tolerance: 5,
        classification: null,
      };
      expect(
        gradeWidgetSubmission(wrapAnswer, {
          interactionState: { angle: 200 },
        }),
      ).toEqual({
        isCorrect: false,
        correctReveal: { correctAngle: 358, classification: null },
      });
    });

    describe('with a classification requirement', () => {
      const rightAnswer: ResolvedAnswer = {
        widgetType: 'ANGLE_PROTRACTOR',
        correctAngle: 90,
        tolerance: 5,
        classification: 'right',
      };

      it('is correct when both the angle and its classification match', () => {
        expect(
          gradeWidgetSubmission(rightAnswer, {
            interactionState: { angle: 91 },
          }),
        ).toEqual({
          isCorrect: true,
          correctReveal: { correctAngle: 90, classification: 'right' },
        });
      });

      it('is incorrect when within tolerance but the classification no longer matches — drifted into "obtuse"', () => {
        const obtuseLeaning: ResolvedAnswer = {
          widgetType: 'ANGLE_PROTRACTOR',
          correctAngle: 88,
          tolerance: 3,
          classification: 'acute',
        };
        // 91 is within 3° of 88 (numerically "close enough"), but 91 itself
        // classifies as right (|91-90|<=3), not acute — the classification
        // check must still fail this even though the distance check alone
        // would pass it.
        expect(
          gradeWidgetSubmission(obtuseLeaning, {
            interactionState: { angle: 91 },
          }),
        ).toEqual({
          isCorrect: false,
          correctReveal: { correctAngle: 88, classification: 'acute' },
        });
      });
    });
  });

  describe('UNSUPPORTED', () => {
    it('returns an empty result — the widget-matrix gap this whole plan is about', () => {
      const answer: ResolvedAnswer = { widgetType: 'UNSUPPORTED' };
      expect(
        gradeWidgetSubmission(answer, {
          interactionState: { placements: { t1: 'A' } },
        }),
      ).toEqual({});
    });
  });
});
