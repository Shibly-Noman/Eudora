import { authApi } from "../auth/authApi";

export interface QuestionOption {
  id?: string;
  optionLabel: string;
  optionText: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  subjectId: string;
  classId: string;
  questionType: "mcq" | "short_answer" | "numeric" | "written";
  prompt: string;
  promptImageUrl?: string | null;
  correctAnswer?: string | null;
  difficulty: "easy" | "medium" | "hard" | "extension";
  status: "draft" | "active" | "archived";
  widgetType?: string | null;
  widgetConfig?: any;
  explanation?: string | null;
  hints?: string[];
  options: QuestionOption[];
  subject?: { id: string; name: string; code: string };
  class?: { id: string; name: string; code: string };
}

export interface ListQuestionsParams {
  search?: string;
  subjectId?: string;
  classId?: string;
  questionType?: string;
  difficulty?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface ListQuestionsResponse {
  items: Question[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LookupItem {
  id: string;
  code: string;
  name: string;
  status: string;
}

export type CatalogStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface ClassItem {
  id: string;
  code: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  status: CatalogStatus;
}

export interface ClassListResponse {
  items: ClassItem[];
  total: number;
}

export interface CreateClassPayload {
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
  status?: CatalogStatus;
}

export interface ListLookupResponse {
  items: LookupItem[];
  total: number;
}

export interface PreviewWidgetInstanceResult {
  seed: number;
  displayConfig: any;
  options?: { id: string; optionLabel?: string; optionText?: string; isCorrect: boolean }[];
  resolvedAnswer: any;
}

export const questionsApi = authApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getQuestions: builder.query<ListQuestionsResponse, ListQuestionsParams | void>({
      query: (params) => {
        const queryParams = new URLSearchParams();
        if (params) {
          Object.entries(params).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== "") {
              queryParams.append(key, String(val));
            }
          });
        }
        return `/questions?${queryParams.toString()}`;
      },
      providesTags: ["Questions" as any],
    }),
    getQuestion: builder.query<Question, string>({
      query: (id) => `/questions/${id}`,
      providesTags: (_result, _err, id) => [{ type: "Questions" as any, id }],
    }),
    createQuestion: builder.mutation<Question, Partial<Question>>({
      query: (body) => ({
        url: "/questions",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Questions" as any],
    }),
    updateQuestion: builder.mutation<Question, { id: string; body: Partial<Question> }>({
      query: ({ id, body }) => ({
        url: `/questions/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _err, { id }) => [
        "Questions" as any,
        { type: "Questions" as any, id },
      ],
    }),
    archiveQuestion: builder.mutation<void, string>({
      query: (id) => ({
        url: `/questions/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Questions" as any],
    }),
    previewWidgetInstance: builder.mutation<
      PreviewWidgetInstanceResult,
      { widgetType: string; widgetConfig: any; seed?: number }
    >({
      query: (body) => ({
        url: "/questions/preview-widget-instance",
        method: "POST",
        body,
      }),
    }),
    /**
     * The `Class` taxonomy master — grade levels, the top of
     * Class -> Program -> Course. Still served from `/assessments/classes`
     * because it grew out of the old `Level` lookup; moving it to its own
     * route is queued with the wider Class/ClassSection/Batch renaming.
     */
    getClasses: builder.query<ClassListResponse, void>({
      query: () => "/classes?pageSize=100",
      providesTags: ["Classes"],
    }),

    createClass: builder.mutation<ClassItem, CreateClassPayload>({
      query: (body) => ({
        url: "/classes",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Classes"],
    }),

    updateClass: builder.mutation<
      ClassItem,
      { id: string } & Partial<Omit<CreateClassPayload, "code">>
    >({
      query: ({ id, ...body }) => ({
        url: `/classes/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Classes"],
    }),
    getSubjects: builder.query<ListLookupResponse, void>({
      query: () => "/subjects?pageSize=100",
    }),
  }),
});

export const {
  useGetQuestionsQuery,
  useGetQuestionQuery,
  useCreateQuestionMutation,
  useUpdateQuestionMutation,
  useArchiveQuestionMutation,
  usePreviewWidgetInstanceMutation,
  useGetClassesQuery,
  useCreateClassMutation,
  useUpdateClassMutation,
  useGetSubjectsQuery,
} = questionsApi;
