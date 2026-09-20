import { circularAngleDifference, classifyAngle } from './widget-config.schema';
import { ResolvedAnswer } from './widget-generator';

export interface WidgetSubmission {
  selectedOptionId?: string | null;
  responseText?: string | null;
  interactionState?: {
    finalValue?: number;
    points?: { x: number; y: number }[];
    pairs?: [string, string][];
    shadedRegionIds?: string[];
    placements?: Record<string, string>;
    angle?: number;
    [key: string]: unknown;
  } | null;
}

export interface GradeResult {
  isCorrect?: boolean;
  // The correct-answer reveal data for widgets whose answer isn't already
  // visible client-side pre-submission (unlike MCQ, where every option's
  // `isCorrect` flag is already sent up front) — callers should only forward
  // this to the client after a submission, never before.
  correctReveal?: unknown;
}

// The single grading implementation shared by LessonsService.submitCardResponse
// and assessments.common.ts's autoMarkResponse — replaces the two independent,
// already-divergent branches that used to live in each.
export function gradeWidgetSubmission(
  resolvedAnswer: ResolvedAnswer,
  submission: WidgetSubmission,
): GradeResult {
  switch (resolvedAnswer.widgetType) {
    case 'STANDARD_MCQ':
      return {
        isCorrect:
          submission.selectedOptionId === resolvedAnswer.correctOptionId,
      };

    case 'SLIDER_MANIPULATIVE': {
      const raw = submission.interactionState?.finalValue;
      const inputVal = raw === undefined || raw === null ? NaN : Number(raw);
      if (Number.isNaN(inputVal)) {
        return { isCorrect: false };
      }
      return {
        isCorrect:
          Math.abs(inputVal - resolvedAnswer.correctValue) <=
          resolvedAnswer.tolerance,
        correctReveal: { correctValue: resolvedAnswer.correctValue },
      };
    }

    case 'COORDINATE_PLOTTER': {
      const studentPoints = submission.interactionState?.points ?? [];
      const { correctPoints, tolerance } = resolvedAnswer;
      // Narrowing displayConfig (widget-generator.ts) took the answer out of
      // the pre-submission payload; CoordinatePlotterWidget's post-submission
      // reveal marker now reads it from here instead of from config.
      const correctReveal = { correctPoints, tolerance };
      if (correctPoints.length !== studentPoints.length) {
        return { isCorrect: false, correctReveal };
      }
      const allMatched = correctPoints.every((cp) =>
        studentPoints.some(
          (sp) => Math.hypot(cp.x - sp.x, cp.y - sp.y) <= tolerance,
        ),
      );
      return { isCorrect: allMatched, correctReveal };
    }

    case 'GRID_MATCHING': {
      const studentPairs = submission.interactionState?.pairs ?? [];
      const { correctPairs } = resolvedAnswer;
      // Same reason as COORDINATE_PLOTTER above — GridMatchingWidget's
      // per-slot correctness styling reads this post-submission now.
      const correctReveal = { correctPairs };
      if (correctPairs.length !== studentPairs.length) {
        return { isCorrect: false, correctReveal };
      }
      const allMatched = correctPairs.every(([left, right]) =>
        studentPairs.some(
          ([sl, sr]) =>
            (sl === left && sr === right) || (sl === right && sr === left),
        ),
      );
      return { isCorrect: allMatched, correctReveal };
    }

    case 'DRAG_AND_DROP_LABELS': {
      const studentPlacements = submission.interactionState?.placements ?? {};
      const { correctPlacements } = resolvedAnswer;
      // Only the targets that carry an authored answer are graded — a
      // target with no correctLabel is decorative (see widget-generator.ts)
      // and a student placing something on it is neither rewarded nor
      // penalised.
      const allMatched = Object.entries(correctPlacements).every(
        ([targetId, label]) => studentPlacements[targetId] === label,
      );
      return { isCorrect: allMatched };
    }

    case 'SHAPE_SHADING': {
      const shadedIds = submission.interactionState?.shadedRegionIds ?? [];
      const { targetNumerator, totalRegions, shapeKind, requireContiguous } =
        resolvedAnswer;

      if (shadedIds.length !== targetNumerator) {
        return { isCorrect: false };
      }

      if (requireContiguous && shadedIds.length > 1) {
        // region-N ids (see ShapeShadingWidget). For `polygon` (wedges form a
        // ring), a sorted set of indices is a contiguous arc iff exactly one
        // gap between consecutive elements is >1 — that gap is the "outside"
        // of the arc, closing the ring; a wrap-around selection like
        // [4,5,0] on a 6-wedge polygon needs the wrap gap (from the last
        // index back to the first, +totalRegions) counted too, or it's
        // wrongly rejected. For `bar` (segments don't wrap), there's no
        // ring to close, so *zero* gaps may exceed 1 — otherwise a 2-element
        // selection would trivially "pass" regardless of how far apart the
        // two segments actually are (only one gap exists between any pair,
        // so "at most one large gap" is meaningless without a wrap to
        // compare against).
        const indices = shadedIds
          .map((id) => parseInt(id.replace('region-', ''), 10))
          .filter((n) => !Number.isNaN(n))
          .sort((a, b) => a - b);

        if (indices.length !== shadedIds.length) {
          return { isCorrect: false };
        }

        const gaps: number[] = [];
        for (let i = 1; i < indices.length; i++) {
          gaps.push(indices[i] - indices[i - 1]);
        }
        if (shapeKind === 'polygon') {
          gaps.push(indices[0] + totalRegions - indices[indices.length - 1]);
        }

        const allowedLargeGaps = shapeKind === 'polygon' ? 1 : 0;
        const largeGaps = gaps.filter((g) => g !== 1).length;
        if (largeGaps > allowedLargeGaps) {
          return { isCorrect: false };
        }
      }

      return { isCorrect: true };
    }

    case 'ANGLE_PROTRACTOR': {
      const raw = submission.interactionState?.angle;
      const measured = raw === undefined || raw === null ? NaN : Number(raw);
      const { correctAngle, tolerance, classification } = resolvedAnswer;
      const correctReveal = { correctAngle, classification };
      if (Number.isNaN(measured)) {
        return { isCorrect: false, correctReveal };
      }
      const withinTolerance =
        circularAngleDifference(measured, correctAngle) <= tolerance;
      // A submission that's numerically close but reads as the wrong kind
      // of angle (e.g. drifted from acute into the right-angle band) hasn't
      // actually demonstrated the classification the question is testing —
      // both checks must hold, not just the numeric one.
      const classificationMatches =
        !classification ||
        classifyAngle(measured, tolerance) === classification;
      return {
        isCorrect: withinTolerance && classificationMatches,
        correctReveal,
      };
    }

    case 'NUMERIC_OR_TEXT': {
      const cleanCorrect = (resolvedAnswer.correctAnswer ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (!cleanCorrect) {
        return {};
      }
      const cleanResponse = (submission.responseText ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

      if (resolvedAnswer.isNumeric) {
        const numResponse = parseFloat(cleanResponse);
        const numCorrect = parseFloat(cleanCorrect);
        if (!Number.isNaN(numResponse) && !Number.isNaN(numCorrect)) {
          return { isCorrect: Math.abs(numResponse - numCorrect) <= 0.001 };
        }
      }
      return { isCorrect: cleanResponse === cleanCorrect };
    }

    case 'UNSUPPORTED':
    default:
      return {};
  }
}
