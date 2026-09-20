import { authApi } from "../auth/authApi";

export interface AssessmentSection {
  id: string;
  title: string;
  sortOrder: number;
}

export interface AssessmentQuestion {
  id: string;
  questionId: string;
  questionNumber: number;
  marksAvailable: number;
  sectionId: string;
  question: {
    id: string;
    questionType: "mcq" | "short_answer" | "numeric" | "written";
    prompt: string;
    promptImageUrl?: string | null;
    difficulty: "easy" | "medium" | "hard" | "extension";
    status: "draft" | "active" | "archived";
    widgetType?: string | null;
    widgetConfig?: any;
    options?: any[];
    correctAnswer?: string | null;
    explanation?: string | null;
    hints?: string[];
  };
}

export interface Assessment {
  id: string;
  assessmentTypeId: string;
  subjectId: string;
  classId: string;
  termId?: string | null;
  weekNumber?: number | null;
  title: string;
  description?: string | null;
  totalMarks: number;
  estimatedDurationMinutes: number;
  status: "draft" | "published" | "archived";
  countsTowardGrade?: boolean;
  maxAttempts?: number | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assessmentType?: { id: string; code: string; name: string };
  subject?: { id: string; code: string; name: string };
  class?: { id: string; code: string; name: string };
  term?: { id: string; name: string } | null;
  sections?: AssessmentSection[];
  questions?: AssessmentQuestion[];
}

export interface Assignment {
  id: string;
  assessmentId: string;
  studentProfileId: string;
  classSectionId: string;
  opensAt: string;
  dueAt: string;
  status: "assigned" | "started" | "submitted" | "overdue" | "exempted" | "cancelled";
  reminderCount: number;
  createdAt: string;
  assessment?: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    totalMarks: number;
    countsTowardGrade?: boolean;
    maxAttempts?: number | null;
  };
  studentProfile?: { id: string; fullName: string };
  classSection?: { id: string; code: string; name: string };
}

export interface StudentResponse {
  id: string;
  questionId: string;
  selectedOptionId?: string | null;
  responseText?: string | null;
  interactionState?: any;
  isCorrect?: boolean | null;
  marksAwarded?: number | null;
  marksAvailable: number;
  timeSpentSeconds: number;
  feedback?: string | null;
}

export interface Attempt {
  id: string;
  assessmentAssignmentId: string;
  studentProfileId: string;
  attemptNumber: number;
  startedAt: string;
  submittedAt?: string | null;
  timeSpentSeconds: number;
  rawScore?: number | null;
  maxScore?: number | null;
  percentageScore?: number | null;
  resultStatus: "in_progress" | "submitted" | "marked" | "needs_review";
  isLatest: boolean;
  isBest: boolean;
  markedByUserId?: string | null;
  teacherComment?: string | null;
  parentComment?: string | null;
  createdAt: string;
  updatedAt: string;
  responses: StudentResponse[];
}

export interface ListAssessmentsParams {
  search?: string;
  subjectId?: string;
  classId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface ListAssessmentsResponse {
  items: Assessment[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateAssignmentPayload {
  assessmentId: string;
  studentProfileId?: string | null;
  /** Bulk-assign: fans out to every actively enrolled student in the batch. */
  batchId?: string | null;
  opensAt?: string;
  dueAt?: string;
}

export const assessmentsApi = authApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getAssessments: builder.query<ListAssessmentsResponse, ListAssessmentsParams | void>({
      query: (params) => {
        const queryParams = new URLSearchParams();
        if (params) {
          Object.entries(params).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== "") {
              queryParams.append(key, String(val));
            }
          });
        }
        return `/assessments?${queryParams.toString()}`;
      },
      providesTags: ["Assessments" as any],
    }),
    getAssessment: builder.query<Assessment, string>({
      query: (id) => `/assessments/${id}`,
      providesTags: (_result, _err, id) => [{ type: "Assessments" as any, id }],
    }),
    createAssessment: builder.mutation<Assessment, Partial<Assessment>>({
      query: (body) => ({
        url: "/assessments",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Assessments" as any],
    }),
    updateAssessment: builder.mutation<Assessment, { id: string; body: Partial<Assessment> }>({
      query: ({ id, body }) => ({
        url: `/assessments/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _err, { id }) => [
        "Assessments" as any,
        { type: "Assessments" as any, id },
      ],
    }),
    archiveAssessment: builder.mutation<void, string>({
      query: (id) => ({
        url: `/assessments/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Assessments" as any],
    }),
    publishAssessment: builder.mutation<Assessment, string>({
      query: (id) => ({
        url: `/assessments/${id}/publish`,
        method: "POST",
      }),
      invalidatesTags: (_result, _err, id) => [
        "Assessments" as any,
        { type: "Assessments" as any, id },
      ],
    }),
    getAssessmentTypes: builder.query<{ items: any[] }, void>({
      query: () => "/assessments/types?pageSize=100",
    }),
    addQuestionToAssessment: builder.mutation<any, { assessmentId: string; body: any }>({
      query: ({ assessmentId, body }) => ({
        url: `/assessments/${assessmentId}/questions`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _err, { assessmentId }) => [
        { type: "Assessments" as any, id: assessmentId },
      ],
    }),
    removeQuestionFromAssessment: builder.mutation<any, { assessmentId: string; questionId: string }>({
      query: ({ assessmentId, questionId }) => ({
        url: `/assessments/${assessmentId}/questions/${questionId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, { assessmentId }) => [
        { type: "Assessments" as any, id: assessmentId },
      ],
    }),
    updateAssessmentQuestion: builder.mutation<any, { assessmentId: string; questionId: string; body: any }>({
      query: ({ assessmentId, questionId, body }) => ({
        url: `/assessments/${assessmentId}/questions/${questionId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _err, { assessmentId }) => [
        { type: "Assessments" as any, id: assessmentId },
      ],
    }),
    createAssignment: builder.mutation<Assignment, CreateAssignmentPayload>({
      query: (body) => ({
        url: "/assignments",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Assignments" as any],
    }),
    getAssignments: builder.query<{ items: Assignment[]; total: number }, { assessmentId?: string; classSectionId?: string; status?: string } | void>({
      query: (params) => {
        const queryParams = new URLSearchParams();
        if (params) {
          Object.entries(params).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== "") {
              queryParams.append(key, String(val));
            }
          });
        }
        return `/assignments?${queryParams.toString()}`;
      },
      providesTags: ["Assignments" as any],
    }),
    listStudentAssignments: builder.query<{ items: Assignment[] }, string>({
      query: (studentId) => `/students/${studentId}/assignments`,
      providesTags: ["Assignments" as any],
    }),
    listAssignmentAttempts: builder.query<{ items: Attempt[] }, string>({
      query: (assignmentId) => `/assignments/${assignmentId}/attempts`,
      providesTags: ["Attempts" as any],
    }),
    getAttempt: builder.query<Attempt, string>({
      query: (id) => `/attempts/${id}`,
      providesTags: (_result, _err, id) => [{ type: "Attempts" as any, id }],
    }),
    startAttempt: builder.mutation<Attempt, { assessmentAssignmentId: string }>({
      query: (body) => ({
        url: "/attempts",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Attempts" as any],
    }),
    saveStudentResponse: builder.mutation<any, { assessmentAttemptId: string; questionId: string; selectedOptionId?: string | null; responseText?: string | null; interactionState?: any; timeSpentSeconds?: number }>({
      query: (body) => ({
        url: "/responses",
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _err, { assessmentAttemptId }) => [
        { type: "Attempts" as any, id: assessmentAttemptId },
      ],
    }),
    submitAttempt: builder.mutation<Attempt, string>({
      query: (id) => ({
        url: `/attempts/${id}/submit`,
        method: "POST",
      }),
      invalidatesTags: (_result, _err, id) => [
        "Attempts" as any,
        { type: "Attempts" as any, id },
        "Assignments" as any,
      ],
    }),
    markAttempt: builder.mutation<Attempt, { id: string; body: { teacherComment?: string; mode?: string } }>({
      query: ({ id, body }) => ({
        url: `/attempts/${id}/mark`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _err, { id }) => [
        "Attempts" as any,
        { type: "Attempts" as any, id },
        "Gradebook" as any,
      ],
    }),
    markStudentResponse: builder.mutation<any, { id: string; body: { isCorrect?: boolean; marksAwarded?: number; feedback?: string } }>({
      query: ({ id, body }) => ({
        url: `/responses/${id}/mark`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Attempts" as any],
    }),
    /**
     * Bulk-assign target. Assignments are per-student; a batch is just the
     * roster the fan-out reads from, via StudentCourseEnrollment.
     */
    getBatches: builder.query<{ items: any[] }, void>({
      query: () => "/batches?limit=100",
      transformResponse: (response: any) => ({
        items: response?.data ?? response?.items ?? [],
      }),
    }),
    getStudents: builder.query<{ items: any[] }, void>({
      query: () => "/student-profiles?limit=500",
    }),
    getTerms: builder.query<{ items: any[] }, void>({
      query: () => "/terms?limit=100",
    }),
    getAssignment: builder.query<Assignment, string>({
      query: (id) => `/assignments/${id}`,
      providesTags: (_result, _err, id) => [{ type: "Assignments" as any, id }],
    }),
  }),
});

export const {
  useGetAssessmentsQuery,
  useGetAssessmentQuery,
  useCreateAssessmentMutation,
  useUpdateAssessmentMutation,
  useArchiveAssessmentMutation,
  usePublishAssessmentMutation,
  useGetAssessmentTypesQuery,
  useAddQuestionToAssessmentMutation,
  useRemoveQuestionFromAssessmentMutation,
  useUpdateAssessmentQuestionMutation,
  useCreateAssignmentMutation,
  useListStudentAssignmentsQuery,
  useListAssignmentAttemptsQuery,
  useGetAttemptQuery,
  useStartAttemptMutation,
  useSaveStudentResponseMutation,
  useSubmitAttemptMutation,
  useMarkAttemptMutation,
  useMarkStudentResponseMutation,
  useGetBatchesQuery,
  useGetStudentsQuery,
  useGetTermsQuery,
  useGetAssignmentQuery,
  useGetAssignmentsQuery,
} = assessmentsApi;
