import { authApi } from "../auth/authApi";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface LessonSummary {
  id: string;
  conceptId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  xpReward: number;
  concept: { name: string };
}

export interface QuestionOption {
  id: string;
  optionLabel: string; // A, B, C, D
  optionText: string;
  isCorrect: boolean;
}

export interface ClioQuestion {
  id: string;
  prompt: string;
  promptImageUrl: string | null;
  questionType: string;
  widgetType: string | null;
  widgetConfig: Record<string, any> | null;
  explanation: string | null;
  hints: string[];
  correctAnswer: string | null;
  options: QuestionOption[];
}

export interface ClioCard {
  id: string;
  lessonId: string;
  title: string;
  sortOrder: number;
  cardType: "CONCEPTUAL" | "INTERACTIVE" | "CHECKPOINT";
  content: string; // Plain text or markdown body
  question: ClioQuestion | null;
}

export interface LessonAttempt {
  id: string;
  lessonId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  xpEarned: number;
  cardResponses: { cardId: string; isCorrect: boolean }[];
}

export interface LessonFlowResponse {
  lesson: LessonSummary & { cards: ClioCard[] };
  attempt: LessonAttempt;
}

export interface SubmitCardPayload {
  timeSpentSeconds: number;
  interactionState?: Record<string, any>;
  selectedOptionId?: string;
  responseText?: string;
}

export interface SubmitCardResult {
  isCorrect: boolean;
  explanation: string;
  xpEarned: number;
  isLessonComplete: boolean;
  // Sent by gradeWidgetSubmission for the widget types with a post-answer
  // reveal (slider, coordinate plotter, grid matching) — present whether the
  // submission was right or wrong, but never before one exists. Absent
  // entirely for widget types with no reveal UI.
  correctReveal?: {
    correctValue?: number;
    correctPoints?: { x: number; y: number }[];
    tolerance?: number;
    correctPairs?: [string, string][];
  };
}

export interface ConceptSummary {
  id: string;
  name: string;
  description: string | null;
  course: { id: string; title: string } | null;
}

export interface CreateConceptPayload {
  name: string;
  description?: string;
  courseId?: string;
  sortOrder?: number;
  kind?: "CHAPTER" | "CHECKPOINT";
  passThresholdPercent?: number;
}

export interface CreateLessonPayload {
  conceptId: string;
  title: string;
  description?: string;
  sortOrder?: number;
  xpReward?: number;
}

export interface CreateCardPayload {
  lessonId: string;
  title: string;
  sortOrder?: number;
  cardType: "CONCEPTUAL" | "INTERACTIVE" | "CHECKPOINT";
  content: string;
  questionId?: string;
}

// ─── RTK Query Endpoints ──────────────────────────────────────────────────────

export const clioApi = authApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    // List all available lessons (optionally filtered by conceptId)
    getLessons: builder.query<
      { items: LessonSummary[]; total: number },
      | { conceptId?: string; page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: string }
      | void
    >({
      query: (params: any) => {
        const q = new URLSearchParams();
        if (params?.conceptId) q.set("conceptId", params.conceptId);
        if (params?.page) q.set("page", String(params.page));
        if (params?.limit) q.set("limit", String(params.limit));
        if (params?.search) q.set("search", params.search);
        if (params?.sortBy) {
          q.set("sortBy", params.sortBy);
          q.set("sortOrder", params.sortOrder ?? "asc");
        }
        const query = q.toString();
        return `/lessons${query ? `?${query}` : ""}`;
      },
      providesTags: ["Lessons"],
    } as any),

    // Fetch the full lesson flow (cards + active attempt) for a student
    getLessonFlow: builder.query<LessonFlowResponse, string>({
      query: (lessonId: string) => `/lessons/${lessonId}/flow`,
      providesTags: (_result: any, _err: any, lessonId: any) => [
        { type: "LessonFlow" as any, id: lessonId },
      ],
    } as any),

    // Submit a card response; backend evaluates correctness + awards XP
    submitCard: builder.mutation<SubmitCardResult, { cardId: string; body: SubmitCardPayload }>({
      query: ({ cardId, body }: any) => ({
        url: `/lessons/cards/${cardId}/submit`,
        method: "POST",
        body,
      }),
      // Gamification too: completing a lesson updates the learner's streak and
      // XP server-side (LessonsService), so without this the streak shown in
      // the HUD and completion modal would be the value from page load — real,
      // but one behind the lesson they just finished.
      invalidatesTags: ["LessonFlow" as any, "Gamification" as any],
    } as any),

    // Fetch curriculum concepts for dropdown selection
    getConcepts: builder.query<ConceptSummary[], void>({
      query: () => "/evaluation/concepts",
    } as any),

    // Create a new concept (chapter/checkpoint) — SUPER_ADMIN/ADMIN only on
    // the backend (deliberate RBAC, not TEACHER). Invalidates the owning
    // course's catalog detail so a newly-created chapter shows up there.
    createConcept: builder.mutation<ConceptSummary, CreateConceptPayload>({
      query: (body: any) => ({
        url: "/evaluation/concepts",
        method: "POST",
        body,
      }),
      invalidatesTags: (_result: any, _err: any, arg: any) =>
        arg.courseId ? [{ type: "CourseDetail" as any, id: arg.courseId }] : [],
    } as any),

    // Create a new lesson unit
    createLesson: builder.mutation<LessonSummary, CreateLessonPayload>({
      query: (body: any) => ({
        url: "/lessons",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Lessons" as any],
    } as any),

    // Create a new card inside a lesson
    createCard: builder.mutation<any, CreateCardPayload>({
      query: (body: any) => ({
        url: "/lessons/cards",
        method: "POST",
        body,
      }),
      invalidatesTags: ["LessonFlow" as any],
    } as any),

    // Update lesson metadata
    updateLesson: builder.mutation<LessonSummary, { id: string; body: Partial<CreateLessonPayload> }>({
      query: ({ id, body }: any) => ({
        url: `/lessons/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Lessons" as any, "LessonFlow" as any],
    } as any),

    // Update card metadata & content
    updateCard: builder.mutation<any, { cardId: string; body: any }>({
      query: ({ cardId, body }: any) => ({
        url: `/lessons/cards/${cardId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["LessonFlow" as any],
    } as any),

    // Reorder cards in a lesson
    reorderCards: builder.mutation<any, { id: string; body: { cards: { cardId: string; sortOrder: number }[] } }>({
      query: ({ id, body }: any) => ({
        url: `/lessons/${id}/cards/reorder`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["LessonFlow" as any],
    } as any),

    // Delete card from a lesson
    deleteCard: builder.mutation<any, string>({
      query: (cardId: string) => ({
        url: `/lessons/cards/${cardId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["LessonFlow" as any],
    } as any),
  }),
});

export const {
  useGetLessonsQuery,
  useGetLessonFlowQuery,
  useSubmitCardMutation,
  useGetConceptsQuery,
  useCreateConceptMutation,
  useCreateLessonMutation,
  useCreateCardMutation,
  useUpdateLessonMutation,
  useUpdateCardMutation,
  useReorderCardsMutation,
  useDeleteCardMutation,
} = clioApi;
