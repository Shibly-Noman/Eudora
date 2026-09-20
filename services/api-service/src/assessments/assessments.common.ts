import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WidgetConfig, InteractionState } from './types/widget-config';
import { generateWidgetInstance } from '../common/widgets/widget-generator';
import { gradeWidgetSubmission } from '../common/widgets/widget-grader';
import { deriveSeed } from '../common/widgets/seed.util';

export const lookupSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

export const classSelect = {
  ...lookupSelect,
  slug: true,
  description: true,
  sortOrder: true,
};

export const assessmentSelect = {
  id: true,
  assessmentTypeId: true,
  subjectId: true,
  classId: true,
  termId: true,
  weekNumber: true,
  title: true,
  description: true,
  totalMarks: true,
  estimatedDurationMinutes: true,
  status: true,
  countsTowardGrade: true,
  maxAttempts: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  assessmentType: { select: { id: true, code: true, name: true } },
  subject: { select: { id: true, code: true, name: true } },
  class: { select: { id: true, code: true, name: true } },
  term: { select: { id: true, name: true } },
  sections: {
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, title: true, sortOrder: true },
  },
  questions: {
    orderBy: { questionNumber: 'asc' as const },
    select: {
      id: true,
      questionId: true,
      questionNumber: true,
      marksAvailable: true,
      sectionId: true,
      question: {
        select: {
          id: true,
          questionType: true,
          prompt: true,
          promptImageUrl: true,
          difficulty: true,
          status: true,
          widgetType: true,
          widgetConfig: true,
          correctAnswer: true,
          explanation: true,
          hints: true,
          options: {
            orderBy: { optionLabel: 'asc' as const },
            select: {
              id: true,
              optionLabel: true,
              optionText: true,
              isCorrect: true,
            },
          },
        },
      },
    },
  },
};

export const questionSelect = {
  id: true,
  subjectId: true,
  classId: true,
  // The relation was never selected, so the questions list rendered
  // "Unassigned" in its level column for every row regardless of the data.
  class: { select: { id: true, code: true, name: true } },
  questionType: true,
  prompt: true,
  promptImageUrl: true,
  correctAnswer: true,
  difficulty: true,
  status: true,
  widgetType: true,
  widgetConfig: true,
  explanation: true,
  hints: true,
  createdAt: true,
  updatedAt: true,
  options: {
    orderBy: { optionLabel: 'asc' as const },
    select: {
      id: true,
      questionId: true,
      optionLabel: true,
      optionText: true,
      isCorrect: true,
    },
  },
};

export const assignmentSelect = {
  id: true,
  assessmentId: true,
  studentProfileId: true,
  lessonId: true,
  assignedByUserId: true,
  opensAt: true,
  dueAt: true,
  status: true,
  reminderCount: true,
  createdAt: true,
  updatedAt: true,
  assessment: {
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      totalMarks: true,
      estimatedDurationMinutes: true,
      countsTowardGrade: true,
      maxAttempts: true,
    },
  },
  studentProfile: { select: { id: true, fullName: true } },
};

/**
 * Raw question data for an attempt — includes `correctAnswer` and
 * `option.isCorrect` because `generateWidgetInstance` needs them to resolve
 * the per-attempt instance. Never send this select's result to a student
 * directly; pass it through `toStudentSafeAttemptQuestions` first.
 */
export const attemptQuestionsSelect = {
  id: true,
  sectionId: true,
  questionNumber: true,
  marksAvailable: true,
  section: { select: { id: true, title: true, sortOrder: true } },
  question: {
    select: {
      id: true,
      questionType: true,
      prompt: true,
      promptImageUrl: true,
      correctAnswer: true,
      widgetType: true,
      widgetConfig: true,
      hints: true,
      options: {
        orderBy: { optionLabel: 'asc' as const },
        select: {
          id: true,
          optionLabel: true,
          optionText: true,
          isCorrect: true,
        },
      },
    },
  },
};

type RawAttemptQuestion = {
  id: string;
  sectionId: string;
  questionNumber: number;
  marksAvailable: number;
  section: { id: string; title: string; sortOrder: number };
  question: Parameters<typeof generateWidgetInstance>[0] & {
    id: string;
    prompt: string;
    promptImageUrl: string | null;
    hints: string[];
  };
};

/**
 * Maps raw attempt questions (server-side shape, includes the answer key) to
 * what a student taking the assessment receives — regenerates each
 * question's widget instance from the same per-(attempt, question) seed used
 * for grading (mirrors `LessonsService.enrichCardsForAttempt`), so a
 * parameterized widget's answer can never be read off the raw config, and
 * explicitly omits `correctAnswer`/`option.isCorrect` rather than relying on
 * the generated instance alone to withhold them.
 */
export function toStudentSafeAttemptQuestions(
  assessmentQuestions: RawAttemptQuestion[],
  attemptId: string,
) {
  return assessmentQuestions.map((aq) => {
    const seed = deriveSeed(attemptId, aq.question.id);
    const instance = generateWidgetInstance(aq.question, seed);
    const options = instance.options ?? aq.question.options;
    return {
      id: aq.id,
      sectionId: aq.sectionId,
      questionNumber: aq.questionNumber,
      marksAvailable: aq.marksAvailable,
      section: aq.section,
      question: {
        id: aq.question.id,
        questionType: aq.question.questionType,
        prompt: aq.question.prompt,
        promptImageUrl: aq.question.promptImageUrl,
        widgetType: aq.question.widgetType,
        widgetConfig: instance.displayConfig,
        hints: aq.question.hints,
        options: options.map((o) => ({
          id: o.id,
          optionLabel: o.optionLabel,
          optionText: o.optionText,
        })),
      },
    };
  });
}

export const attemptSelect = {
  id: true,
  assessmentAssignmentId: true,
  studentProfileId: true,
  attemptNumber: true,
  startedAt: true,
  submittedAt: true,
  timeSpentSeconds: true,
  rawScore: true,
  maxScore: true,
  percentageScore: true,
  resultStatus: true,
  isLatest: true,
  isBest: true,
  markedByUserId: true,
  teacherComment: true,
  parentComment: true,
  rawImportPayload: true,
  createdAt: true,
  updatedAt: true,
  responses: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      questionId: true,
      selectedOptionId: true,
      responseText: true,
      interactionState: true,
      isCorrect: true,
      marksAwarded: true,
      marksAvailable: true,
      timeSpentSeconds: true,
      feedback: true,
    },
  },
};

export const responseSelect = {
  id: true,
  assessmentAttemptId: true,
  questionId: true,
  selectedOptionId: true,
  responseText: true,
  interactionState: true,
  isCorrect: true,
  marksAwarded: true,
  marksAvailable: true,
  timeSpentSeconds: true,
  feedback: true,
  createdAt: true,
  updatedAt: true,
  question: {
    select: {
      id: true,
      questionType: true,
      prompt: true,
      promptImageUrl: true,
      difficulty: true,
    },
  },
  selectedOption: { select: { id: true, optionLabel: true, optionText: true } },
};

export function normalizePagination(query: {
  page?: string | number;
  pageSize?: string | number;
}): { page: number; pageSize: number; skip: number } {
  const page = clampNumber(query.page, 1, 1, 100_000);
  const pageSize = clampNumber(query.pageSize, 25, 1, 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function toPage<T>(
  items: T[],
  total: number,
  pagination: { page: number; pageSize: number },
) {
  return { items, total, page: pagination.page, pageSize: pagination.pageSize };
}

export function searchFilter(
  search: string | undefined,
  fields: string[],
): object {
  const value = search?.trim();
  if (!value) {
    return {};
  }
  return {
    OR: fields.map((field) => ({
      [field]: { contains: value, mode: 'insensitive' },
    })),
  };
}

export function idFilter(field: string, value: string | undefined): object {
  const id = value?.trim();
  return id ? { [field]: id } : {};
}

export function numberFilter(
  field: string,
  value: string | number | undefined,
): object {
  if (value === undefined || value === '') {
    return {};
  }
  return { [field]: clampNumber(value, 0, 0, 10_000) };
}

export function enumFilter(
  field: string,
  value: string | undefined,
  allowed: string[],
): object {
  return value ? { [field]: enumValue(value, allowed, field) } : {};
}

export function enumValue<T extends string>(
  value: string,
  allowed: T[],
  field: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new BadRequestException(
      `${field} must be one of: ${allowed.join(', ')}`,
    );
  }
  return value as T;
}

export function clampNumber(
  value: string | number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const numericValue =
    typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numericValue));
}

export function normalizeCode(value: string): string {
  return requireText(value, 'code').toLowerCase();
}

export function requireText(
  value: string | undefined | null,
  field: string,
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new BadRequestException(`${field} is required`);
  }
  return trimmed;
}

export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseOptionalDate(
  value: string | null | undefined,
  field: string,
): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
  return date;
}

export function assertPositiveNumber(
  value: number | null | undefined,
  field: string,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${field} must be greater than 0`);
  }
}

export function assertPositiveInteger(
  value: number | null | undefined,
  field: string,
): void {
  if (!IsInteger(value) || Number(value) <= 0) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
}

export function assertNullablePositiveInteger(
  value: number | null | undefined,
  field: string,
): void {
  if (value === undefined || value === null) {
    return;
  }
  assertPositiveInteger(value, field);
}

export function nullableNumber(
  value: number | null,
  field: string,
): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${field} must be a valid number`);
  }
  return value;
}

export function nullablePositiveNumber(
  value: number | null,
  field: string,
): number | null {
  if (value === null) {
    return null;
  }
  assertPositiveNumber(value, field);
  return value;
}

export function nullableNonNegativeNumber(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`${field} must be 0 or greater`);
  }
  return value;
}

export function nullableNonNegativeInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === null || value === undefined) {
    return value ?? null;
  }
  if (!IsInteger(value) || value < 0) {
    throw new BadRequestException(`${field} must be a non-negative integer`);
  }
  return value;
}

export function normalizeSections(
  sections: { title: string; sortOrder: number }[],
): { title: string; sortOrder: number }[] {
  const sortOrders = new Set<number>();
  return sections.map((section) => {
    assertPositiveInteger(section.sortOrder, 'sortOrder');
    if (sortOrders.has(section.sortOrder)) {
      throw new BadRequestException('section sortOrder values must be unique');
    }
    sortOrders.add(section.sortOrder);
    return {
      title: requireText(section.title, 'section title'),
      sortOrder: section.sortOrder,
    };
  });
}

export function normalizeOptions(
  options: { optionLabel: string; optionText: string; isCorrect?: boolean }[],
  questionType: string,
): { optionLabel: string; optionText: string; isCorrect: boolean }[] {
  if (questionType === 'mcq' && options.length < 2) {
    throw new BadRequestException('MCQ questions require at least two options');
  }
  const labels = new Set<string>();
  const normalized = options.map((option) => {
    const optionLabel = requireText(
      option.optionLabel,
      'optionLabel',
    ).toUpperCase();
    if (labels.has(optionLabel)) {
      throw new BadRequestException(
        'optionLabel values must be unique per question',
      );
    }
    labels.add(optionLabel);
    return {
      optionLabel,
      optionText: requireText(option.optionText, 'optionText'),
      isCorrect: option.isCorrect ?? false,
    };
  });
  if (
    questionType === 'mcq' &&
    !normalized.some((option) => option.isCorrect)
  ) {
    throw new BadRequestException(
      'MCQ questions require at least one correct option',
    );
  }
  return normalized;
}

export function autoMarkResponse(
  question: {
    questionType: string;
    correctAnswer: string | null;
    widgetType?: string | null;
    widgetConfig?: WidgetConfig;
    options: { id: string; isCorrect: boolean }[];
  },
  selectedOptionId: string | null | undefined,
  responseText: string | null | undefined,
  interactionState: InteractionState | undefined,
  marksAvailable: number = 0,
  seed: number,
): { isCorrect?: boolean; marksAwarded?: number } {
  // Delegates to the same generator+grader LessonsService uses, so a widget
  // behaves identically whether it's answered in a lesson or a formal
  // assessment. `seed` resolves any parameterized question deterministically
  // for this specific (assessmentAttempt, question) pair; fixed/legacy
  // questions resolve to their stored answer unchanged either way.
  const instance = generateWidgetInstance(
    { ...question, widgetConfig: question.widgetConfig },
    seed,
  );
  const graded = gradeWidgetSubmission(instance.resolvedAnswer, {
    selectedOptionId,
    responseText,
    interactionState,
  });
  if (graded.isCorrect === undefined) {
    return {};
  }
  return {
    isCorrect: graded.isCorrect,
    marksAwarded: graded.isCorrect ? marksAvailable : 0,
  };
}

export function requireRecord<T>(
  record: T | null | undefined,
  message: string,
): T {
  if (!record) {
    throw new NotFoundException(message);
  }
  return record;
}

function IsInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value);
}

export async function audit(
  prisma: PrismaService,
  actorUserId: string,
  event: string,
  targetType?: string | null,
  targetId?: string | null,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId,
      event,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      metadata: metadata
        ? (JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue)
        : undefined,
    },
  });
}
