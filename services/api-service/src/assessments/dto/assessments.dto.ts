import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsUUID,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WidgetType } from '../../lessons/dto/lessons.dto';
import { IsValidWidgetConfig } from '../../common/widgets/widget-config.validator';

export class ListAssessmentsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  assessmentTypeId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsString()
  weekNumber?: string;

  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class LookupQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive', 'archived'])
  status?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreateLookupDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number | null;
}

export class UpdateLookupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive', 'archived'])
  status?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number | null;
}

export class CreateAssessmentSectionDto {
  @IsString()
  title: string;

  @IsInt()
  @Min(1)
  sortOrder: number;
}

export class CreateAssessmentDto {
  @IsUUID()
  assessmentTypeId: string;

  @IsUUID()
  subjectId: string;

  @IsUUID()
  classId: string;

  @IsOptional()
  @IsUUID()
  termId?: string | null;

  @IsOptional()
  @IsInt()
  weekNumber?: number | null;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsInt()
  totalMarks: number;

  @IsOptional()
  @IsInt()
  estimatedDurationMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  countsTowardGrade?: boolean;

  @IsOptional()
  @IsInt()
  maxAttempts?: number | null;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateAssessmentSectionDto)
  sections?: CreateAssessmentSectionDto[];
}

export class UpdateAssessmentDto {
  @IsOptional()
  @IsUUID()
  assessmentTypeId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string | null;

  @IsOptional()
  @IsInt()
  weekNumber?: number | null;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  totalMarks?: number;

  @IsOptional()
  @IsInt()
  estimatedDurationMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  countsTowardGrade?: boolean;

  @IsOptional()
  @IsInt()
  maxAttempts?: number | null;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateAssessmentSectionDto)
  sections?: CreateAssessmentSectionDto[];
}

export class QuestionOptionDto {
  @IsString()
  optionLabel: string;

  @IsString()
  optionText: string;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}

export class ListQuestionsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsEnum(['mcq', 'short_answer', 'numeric', 'written'])
  questionType?: string;

  @IsOptional()
  @IsEnum(['easy', 'medium', 'hard', 'extension'])
  difficulty?: string;

  @IsOptional()
  @IsEnum(['draft', 'active', 'archived'])
  status?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class CreateQuestionDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsUUID()
  classId?: string | null;

  @IsEnum(['mcq', 'short_answer', 'numeric', 'written'])
  questionType: string;

  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  promptImageUrl?: string | null;

  @IsOptional()
  @IsString()
  correctAnswer?: string | null;

  @IsEnum(['easy', 'medium', 'hard', 'extension'])
  difficulty: string;

  @IsOptional()
  @IsEnum(['draft', 'active', 'archived'])
  status?: string;

  @IsOptional()
  @IsEnum(WidgetType)
  widgetType?: WidgetType;

  @IsOptional()
  @IsValidWidgetConfig()
  widgetConfig?: any;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
}

export class PreviewWidgetInstanceDto {
  @IsEnum(WidgetType)
  widgetType: WidgetType;

  @IsNotEmpty()
  widgetConfig: any;

  @IsOptional()
  @IsInt()
  seed?: number;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsUUID()
  classId?: string | null;

  @IsOptional()
  @IsEnum(['mcq', 'short_answer', 'numeric', 'written'])
  questionType?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  promptImageUrl?: string | null;

  @IsOptional()
  @IsString()
  correctAnswer?: string | null;

  @IsOptional()
  @IsEnum(['easy', 'medium', 'hard', 'extension'])
  difficulty?: string;

  @IsOptional()
  @IsEnum(['draft', 'active', 'archived'])
  status?: string;

  @IsOptional()
  @IsEnum(WidgetType)
  widgetType?: WidgetType;

  @IsOptional()
  @IsValidWidgetConfig()
  widgetConfig?: any;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
}

export class AddAssessmentQuestionDto {
  @IsUUID()
  questionId: string;

  @IsInt()
  questionNumber: number;

  @IsInt()
  marksAvailable: number;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;
}

export class UpdateAssessmentQuestionDto {
  @IsOptional()
  @IsInt()
  questionNumber?: number;

  @IsOptional()
  @IsInt()
  marksAvailable?: number;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;
}

export class ListAssignmentsQueryDto {
  @IsOptional()
  @IsUUID()
  assessmentId?: string;

  @IsOptional()
  @IsUUID()
  studentProfileId?: string;

  /** Matches assignments held by anyone enrolled in this batch. */
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsEnum([
    'assigned',
    'started',
    'submitted',
    'overdue',
    'exempted',
    'cancelled',
  ])
  status?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreateAssignmentDto {
  @IsUUID()
  assessmentId: string;

  @IsOptional()
  @IsUUID()
  studentProfileId?: string | null;

  /** Bulk-assign target: every actively enrolled student in this batch. */
  @IsOptional()
  @IsUUID()
  batchId?: string | null;

  @IsOptional()
  @IsUUID()
  lessonId?: string | null;

  @IsOptional()
  @IsDateString()
  opensAt?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsEnum([
    'assigned',
    'started',
    'submitted',
    'overdue',
    'exempted',
    'cancelled',
  ])
  status?: string;
}

export class UpdateAssignmentDto {
  @IsOptional()
  @IsDateString()
  opensAt?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsEnum([
    'assigned',
    'started',
    'submitted',
    'overdue',
    'exempted',
    'cancelled',
  ])
  status?: string;
}

export class ListAttemptsQueryDto {
  @IsOptional()
  @IsUUID()
  assessmentAssignmentId?: string;

  @IsOptional()
  @IsUUID()
  studentProfileId?: string;

  @IsOptional()
  @IsEnum(['in_progress', 'submitted', 'marked', 'needs_review'])
  resultStatus?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class CreateAttemptDto {
  @IsUUID()
  assessmentAssignmentId: string;

  @IsOptional()
  @IsUUID()
  studentProfileId?: string;

  @IsOptional()
  rawImportPayload?: any;
}

export class UpdateAttemptDto {
  @IsOptional()
  @IsInt()
  timeSpentSeconds?: number | null;

  @IsOptional()
  @IsNumber()
  rawScore?: number | null;

  @IsOptional()
  @IsNumber()
  maxScore?: number | null;

  @IsOptional()
  @IsNumber()
  percentageScore?: number | null;

  @IsOptional()
  @IsEnum(['in_progress', 'submitted', 'marked', 'needs_review'])
  resultStatus?: string;

  @IsOptional()
  @IsString()
  teacherComment?: string | null;

  @IsOptional()
  @IsString()
  parentComment?: string | null;

  @IsOptional()
  rawImportPayload?: any;
}

export class MarkAttemptDto {
  @IsOptional()
  @IsEnum(['auto', 'manual'])
  mode?: string;

  @IsOptional()
  @IsString()
  teacherComment?: string | null;

  @IsOptional()
  @IsString()
  parentComment?: string | null;
}

export class ListResponsesQueryDto {
  @IsOptional()
  @IsUUID()
  assessmentAttemptId?: string;

  @IsOptional()
  @IsUUID()
  questionId?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class SaveStudentResponseDto {
  @IsUUID()
  assessmentAttemptId: string;

  @IsUUID()
  questionId: string;

  @IsOptional()
  @IsUUID()
  selectedOptionId?: string | null;

  @IsOptional()
  @IsString()
  responseText?: string | null;

  @IsOptional()
  interactionState?: any;

  @IsOptional()
  @IsInt()
  timeSpentSeconds?: number | null;
}

export class UpdateStudentResponseDto {
  @IsOptional()
  @IsUUID()
  selectedOptionId?: string | null;

  @IsOptional()
  @IsString()
  responseText?: string | null;

  @IsOptional()
  @IsInt()
  timeSpentSeconds?: number | null;

  @IsOptional()
  @IsString()
  feedback?: string | null;
}

export class MarkStudentResponseDto {
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean | null;

  @IsOptional()
  @IsNumber()
  marksAwarded?: number | null;

  @IsOptional()
  @IsString()
  feedback?: string | null;
}
