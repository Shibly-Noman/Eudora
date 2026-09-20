import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveSort } from '../common/sort.util';
import {
  AddAssessmentQuestionDto,
  CreateQuestionDto,
  ListQuestionsQueryDto,
  PreviewWidgetInstanceDto,
  UpdateAssessmentQuestionDto,
  UpdateQuestionDto,
} from './dto/assessments.dto';
import { WidgetType } from '../lessons/dto/lessons.dto';
import { generateWidgetInstance } from '../common/widgets/widget-generator';
import { isParameterizedWidgetConfig } from '../common/widgets/widget-config.schema';
import {
  assertPositiveInteger,
  assertPositiveNumber,
  emptyToNull,
  enumFilter,
  enumValue,
  idFilter,
  normalizeOptions,
  normalizePagination,
  questionSelect,
  requireRecord,
  requireText,
  searchFilter,
  toPage,
  audit,
} from './assessments.common';

const QUESTION_SORTABLE_FIELDS = [
  'prompt',
  'questionType',
  'difficulty',
  'status',
  'createdAt',
] as const;

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  // Stateless: generates one sample instance from a draft (unsaved) config so
  // authors can sanity-check a template before saving. Reuses the exact same
  // generator that resolves real attempts, so the preview is never a "lie".
  previewWidgetInstance(input: PreviewWidgetInstanceDto) {
    const seed = input.seed ?? Math.floor(Math.random() * 0xffffffff);
    const instance = generateWidgetInstance(
      {
        // resolveLegacyInstance's first branch matches on
        // `widgetType === 'STANDARD_MCQ' || questionType === 'mcq'` — a
        // hardcoded 'mcq' here used to satisfy that OR-clause for every
        // widget type, not just STANDARD_MCQ, so every non-MCQ preview took
        // the MCQ path (with no options to find a correct one among) and
        // resolved to UNSUPPORTED regardless of the actual config. Only
        // claim 'mcq' when the widget being previewed actually is one;
        // 'interactive' is what every other widget-backed question is
        // stored as (see prisma/seed.ts).
        questionType:
          input.widgetType === WidgetType.STANDARD_MCQ ? 'mcq' : 'interactive',
        correctAnswer: null,
        widgetType: input.widgetType,
        widgetConfig: input.widgetConfig,
        options: [],
      },
      seed,
    );
    return { seed, ...instance };
  }

  async listQuestions(query: ListQuestionsQueryDto = {}) {
    const pagination = normalizePagination(query);
    const where = {
      ...searchFilter(query.search, ['prompt', 'correctAnswer']),
      ...idFilter('subjectId', query.subjectId),
      ...idFilter('classId', query.classId),
      ...enumFilter('questionType', query.questionType, [
        'mcq',
        'short_answer',
        'numeric',
        'written',
      ]),
      ...enumFilter('difficulty', query.difficulty, [
        'easy',
        'medium',
        'hard',
        'extension',
      ]),
      ...enumFilter('status', query.status, ['draft', 'active', 'archived']),
    };
    const orderBy = resolveSort(
      query.sortBy,
      query.sortOrder,
      QUESTION_SORTABLE_FIELDS,
      'createdAt',
      'desc',
    );

    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize,
        select: questionSelect,
      }),
      this.prisma.question.count({ where }),
    ]);

    return toPage(items, total, pagination);
  }

  async getQuestion(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      select: questionSelect,
    });
    return requireRecord(question, 'Question not found');
  }

  async createQuestion(input: CreateQuestionDto, actorUserId: string) {
    const questionType = enumValue(
      input.questionType,
      ['mcq', 'short_answer', 'numeric', 'written'],
      'questionType',
    );
    const difficulty = enumValue(
      input.difficulty,
      ['easy', 'medium', 'hard', 'extension'],
      'difficulty',
    );
    const options = isParameterizedWidgetConfig(input.widgetConfig)
      ? []
      : normalizeOptions(input.options ?? [], questionType);
    const question = await this.prisma.question.create({
      data: {
        subjectId: emptyToNull(input.subjectId),
        classId: emptyToNull(input.classId),
        questionType,
        prompt: requireText(input.prompt, 'prompt'),
        promptImageUrl: emptyToNull(input.promptImageUrl),
        correctAnswer: emptyToNull(input.correctAnswer),
        difficulty,
        status: enumValue(
          input.status ?? 'draft',
          ['draft', 'active', 'archived'],
          'status',
        ),
        widgetType: input.widgetType ?? null,
        widgetConfig: input.widgetConfig ?? null,
        explanation: emptyToNull((input as any).explanation),
        hints: (input as any).hints ?? [],
        ...(options.length > 0 ? { options: { create: options } } : {}),
      } as any,
      select: questionSelect,
    });
    await audit(
      this.prisma,
      actorUserId,
      'assessments.question.created',
      'question',
      question.id,
    );
    return question;
  }

  async updateQuestion(
    id: string,
    input: UpdateQuestionDto,
    actorUserId: string,
  ) {
    const questionType = input.questionType
      ? enumValue(
          input.questionType,
          ['mcq', 'short_answer', 'numeric', 'written'],
          'questionType',
        )
      : undefined;
    let effectiveQuestionType = questionType;
    if (input.options && !effectiveQuestionType) {
      const existingQuestion = await this.prisma.question.findUnique({
        where: { id },
        select: { questionType: true },
      });
      effectiveQuestionType = requireRecord(
        existingQuestion,
        'Question not found',
      ).questionType as 'mcq' | 'short_answer' | 'numeric' | 'written';
    }
    const options = input.options
      ? normalizeOptions(input.options, effectiveQuestionType ?? 'mcq')
      : undefined;
    const question = await this.prisma.$transaction(async (tx) => {
      if (options) {
        await tx.questionOption.deleteMany({ where: { questionId: id } });
      }
      return tx.question.update({
        where: { id },
        data: {
          ...(input.subjectId !== undefined
            ? { subjectId: emptyToNull(input.subjectId) }
            : {}),
          ...(input.classId !== undefined
            ? { classId: emptyToNull(input.classId) }
            : {}),
          ...(questionType !== undefined ? { questionType } : {}),
          ...(input.prompt !== undefined
            ? { prompt: requireText(input.prompt, 'prompt') }
            : {}),
          ...(input.promptImageUrl !== undefined
            ? { promptImageUrl: emptyToNull(input.promptImageUrl) }
            : {}),
          ...(input.correctAnswer !== undefined
            ? { correctAnswer: emptyToNull(input.correctAnswer) }
            : {}),
          ...(input.difficulty !== undefined
            ? {
                difficulty: enumValue(
                  input.difficulty,
                  ['easy', 'medium', 'hard', 'extension'],
                  'difficulty',
                ),
              }
            : {}),
          ...(input.status !== undefined
            ? {
                status: enumValue(
                  input.status,
                  ['draft', 'active', 'archived'],
                  'status',
                ),
              }
            : {}),
          ...(input.widgetType !== undefined
            ? { widgetType: input.widgetType }
            : {}),
          ...(input.widgetConfig !== undefined
            ? { widgetConfig: input.widgetConfig }
            : {}),
          ...((input as any).explanation !== undefined
            ? { explanation: emptyToNull((input as any).explanation) }
            : {}),
          ...((input as any).hints !== undefined
            ? { hints: (input as any).hints }
            : {}),
          ...(options ? { options: { create: options } } : {}),
        } as any,
        select: questionSelect,
      });
    });
    await audit(
      this.prisma,
      actorUserId,
      'assessments.question.updated',
      'question',
      question.id,
    );
    return question;
  }

  async archiveQuestion(id: string, actorUserId: string) {
    const question = await this.prisma.question.update({
      where: { id },
      data: { status: 'archived' },
      select: questionSelect,
    });
    await audit(
      this.prisma,
      actorUserId,
      'assessments.question.archived',
      'question',
      question.id,
    );
    return question;
  }

  async addQuestionToAssessment(
    assessmentId: string,
    input: AddAssessmentQuestionDto,
    actorUserId: string,
  ) {
    await this.assertSectionBelongsToAssessment(assessmentId, input.sectionId);
    assertPositiveInteger(input.questionNumber, 'questionNumber');
    assertPositiveNumber(input.marksAvailable, 'marksAvailable');
    const assessmentQuestion = await this.prisma.assessmentQuestion.create({
      data: {
        assessmentId,
        questionId: requireText(input.questionId, 'questionId'),
        questionNumber: input.questionNumber,
        marksAvailable: input.marksAvailable,
        sectionId: requireText(input.sectionId, 'sectionId'),
      },
      select: {
        id: true,
        assessmentId: true,
        questionId: true,
        questionNumber: true,
        marksAvailable: true,
        sectionId: true,
      },
    });
    await audit(
      this.prisma,
      actorUserId,
      'assessments.assessmentQuestion.created',
      'assessment',
      assessmentId,
    );
    return assessmentQuestion;
  }

  async updateAssessmentQuestion(
    assessmentId: string,
    questionId: string,
    input: UpdateAssessmentQuestionDto,
    actorUserId: string,
  ) {
    if (input.sectionId !== undefined) {
      await this.assertSectionBelongsToAssessment(
        assessmentId,
        input.sectionId,
      );
    }
    if (input.questionNumber !== undefined) {
      assertPositiveInteger(input.questionNumber, 'questionNumber');
    }
    if (input.marksAvailable !== undefined) {
      assertPositiveNumber(input.marksAvailable, 'marksAvailable');
    }
    const assessmentQuestion = await this.prisma.assessmentQuestion.update({
      where: { assessmentId_questionId: { assessmentId, questionId } },
      data: {
        ...(input.questionNumber !== undefined
          ? { questionNumber: input.questionNumber }
          : {}),
        ...(input.marksAvailable !== undefined
          ? { marksAvailable: input.marksAvailable }
          : {}),
        ...(input.sectionId !== undefined
          ? { sectionId: requireText(input.sectionId, 'sectionId') }
          : {}),
      },
      select: {
        id: true,
        assessmentId: true,
        questionId: true,
        questionNumber: true,
        marksAvailable: true,
        sectionId: true,
      },
    });
    await audit(
      this.prisma,
      actorUserId,
      'assessments.assessmentQuestion.updated',
      'assessment',
      assessmentId,
    );
    return assessmentQuestion;
  }

  async removeQuestionFromAssessment(
    assessmentId: string,
    questionId: string,
    actorUserId: string,
  ) {
    const assessmentQuestion = await this.prisma.assessmentQuestion.delete({
      where: { assessmentId_questionId: { assessmentId, questionId } },
      select: { id: true, assessmentId: true, questionId: true },
    });
    await audit(
      this.prisma,
      actorUserId,
      'assessments.assessmentQuestion.removed',
      'assessment',
      assessmentId,
    );
    return assessmentQuestion;
  }

  private async assertSectionBelongsToAssessment(
    assessmentId: string,
    sectionId: string | null | undefined,
  ): Promise<void> {
    const resolvedSectionId = requireText(sectionId, 'sectionId');
    const section = await this.prisma.assessmentSection.findFirst({
      where: { id: resolvedSectionId, assessmentId },
      select: { id: true },
    });
    if (!section) {
      throw new BadRequestException(
        'sectionId does not belong to this assessment',
      );
    }
  }
}
