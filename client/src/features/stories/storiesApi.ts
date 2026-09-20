import { authApi } from "../auth/authApi";
import type {
  AgentReply,
  AskPayload,
  Story,
  StoryDraft,
  StoryLibraryItem,
  StorySummary,
} from "./types";

/**
 * The authenticated half of the story module. The public demo deliberately does
 * not go through here: it must work with no session at all, and routing it via
 * the authenticated base query would attach credentials a visitor does not have
 * and trip the reauth interceptor on every call.
 */
export const storiesApi = authApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    narratorVoices: builder.query<
      {
        voices: { id: string; name: string; previewUrl: string | null }[];
        defaultVoiceId: string;
        hasMore: boolean;
      },
      string
    >({
      query: (search) => "/stories/narrator-voices?search=" + encodeURIComponent(search),
    }),
    updateStoryDetails: builder.mutation<
      Story,
      { storyId: string; title: string; synopsis: string; narratorVoiceId: string | null; topics: string[] }
    >({
      query: ({ storyId, ...body }) => ({ url: "/stories/" + storyId, method: "PATCH", body }),
      invalidatesTags: [{ type: "StoryContent" } as any, "StoryList" as any],
    }),
    uploadArtwork: builder.mutation<Story, { storyId: string; body: FormData }>({
      query: ({ storyId, body }) => ({
        url: "/stories/" + storyId + "/artwork",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "StoryContent" } as any, "StoryList" as any],
    }),
    removeArtwork: builder.mutation<Story, string>({
      query: (id) => ({ url: "/stories/assets/" + id, method: "DELETE" }),
      invalidatesTags: [{ type: "StoryContent" } as any, "StoryList" as any],
    }),
    /**
     * Keyed by module item rather than story id because that is what the course
     * outline links to, and what the entitlement check is expressed in terms
     * of. The acting-student header is added by the shared base query, so a
     * guardian reading with their child resolves correctly without this
     * endpoint knowing anything about it.
     */
    getStoryByModuleItem: builder.query<Story, string>({
      query: (moduleItemId: string) => `/stories/by-module-item/${moduleItemId}`,
      providesTags: ["StoryContent" as any],
    } as any),

    /**
     * Every published story, for the library. Free to any signed-in child —
     * this is the one story surface that does not depend on owning a course.
     */
    getStoryLibrary: builder.query<StoryLibraryItem[], void>({
      query: () => "/stories/library",
      providesTags: ["StoryList" as any],
    } as any),

    /**
     * A library story's content. Deliberately not `getStory`, which is the
     * staff authoring route and 403s for a student.
     */
    getLibraryStory: builder.query<Story, string>({
      query: (id: string) => `/stories/library/${id}`,
      providesTags: (_r: any, _e: any, id: string) => [{ type: "StoryContent", id }],
    } as any),

    askStory: builder.mutation<AgentReply, { storyId: string } & AskPayload>({
      query: ({ storyId, ...body }: { storyId: string } & AskPayload) => ({
        url: `/stories/${storyId}/ask`,
        method: "POST",
        body,
      }),
      // Deliberately invalidates nothing: a question does not change the story,
      // and the transcript is held in component state for the length of the
      // sitting rather than refetched.
    } as any),

    // ─── Authoring ──────────────────────────────────────────────────────────

    getStories: builder.query<StorySummary[], void>({
      query: () => "/stories/all",
      providesTags: ["StoryList" as any],
    } as any),

    getStory: builder.query<Story, string>({
      query: (id: string) => `/stories/${id}`,
      // Tagged per story, not as one global "StoryContent": narrating one
      // story should not discard every other story cached in the editor, and
      // an untagged pair here silently failed to refetch at all.
      providesTags: (_r: any, _e: any, id: string) => [{ type: "StoryContent", id }],
    } as any),

    /**
     * Splits pasted prose into pages and proposes emotion markup. Writes
     * nothing — the editor holds the result until an author accepts it.
     */
    draftStory: builder.mutation<StoryDraft, { source: string; title?: string }>({
      query: (body: { source: string; title?: string }) => ({
        url: "/stories/draft",
        method: "POST",
        body,
      }),
    } as any),

    importStory: builder.mutation<Story, Record<string, unknown>>({
      query: (body: Record<string, unknown>) => ({
        url: "/stories/import",
        method: "POST",
        body,
      }),
      invalidatesTags: ["StoryList" as any],
    } as any),

    updateSegment: builder.mutation<
      Story,
      { segmentId: string; text?: string; narrationText?: string | null }
    >({
      query: ({ segmentId, ...body }: { segmentId: string }) => ({
        url: `/stories/segments/${segmentId}`,
        method: "PATCH",
        body,
      }),
      // Only the segment id is known here, not the story it belongs to, so
      // this invalidates every cached story. Acceptable: an author edits one
      // story at a time, and a stale page in the editor is worse than a refetch.
      invalidatesTags: [{ type: "StoryContent" } as any, "StoryList" as any],
    } as any),

    setStoryStatus: builder.mutation<
      Story,
      { storyId: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }
    >({
      query: ({ storyId, status }: { storyId: string; status: string }) => ({
        url: `/stories/${storyId}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: (_r: any, _e: any, arg: { storyId: string }) => [
        { type: "StoryContent", id: arg.storyId },
        "StoryList",
      ],
    } as any),

    updateChapter: builder.mutation<Story, { chapterId: string; title: string }>({
      query: ({ chapterId, title }: { chapterId: string; title: string }) => ({
        url: `/stories/chapters/${chapterId}`,
        method: "PATCH",
        body: { title },
      }),
      invalidatesTags: [{ type: "StoryContent" } as any, "StoryList" as any],
    } as any),

    removeChapter: builder.mutation<Story, string>({
      query: (chapterId: string) => ({
        url: `/stories/chapters/${chapterId}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "StoryContent" } as any, "StoryList" as any],
    } as any),

    mergeSegmentUp: builder.mutation<Story, string>({
      query: (segmentId: string) => ({
        url: `/stories/segments/${segmentId}/merge-up`,
        method: "POST",
      }),
      invalidatesTags: [{ type: "StoryContent" } as any, "StoryList" as any],
    } as any),

    splitSegment: builder.mutation<Story, { segmentId: string; at: number }>({
      query: ({ segmentId, at }: { segmentId: string; at: number }) => ({
        url: `/stories/segments/${segmentId}/split`,
        method: "POST",
        body: { at },
      }),
      invalidatesTags: [{ type: "StoryContent" } as any, "StoryList" as any],
    } as any),

    removeSegment: builder.mutation<Story, string>({
      query: (segmentId: string) => ({
        url: `/stories/segments/${segmentId}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "StoryContent" } as any, "StoryList" as any],
    } as any),

    setPublicDemo: builder.mutation<Story, { storyId: string; isPublicDemo: boolean }>({
      query: ({ storyId, isPublicDemo }: { storyId: string; isPublicDemo: boolean }) => ({
        url: `/stories/${storyId}/public-demo`,
        method: "PATCH",
        body: { isPublicDemo },
      }),
      // Clears the flag on every other story, so the whole list is stale —
      // not just this one.
      invalidatesTags: [{ type: "StoryContent" } as any, "StoryList" as any],
    } as any),

    detachStory: builder.mutation<Story, string>({
      query: (storyId: string) => ({
        url: `/stories/${storyId}/detach`,
        method: "POST",
      }),
      invalidatesTags: (_r: any, _e: any, storyId: string) => [
        { type: "StoryContent", id: storyId },
        "StoryList",
      ],
    } as any),

    narrateStory: builder.mutation<
      { generated: number; skipped: number; failed: number },
      { storyId: string; force?: boolean }
    >({
      query: ({ storyId, force }: { storyId: string; force?: boolean }) => ({
        url: `/stories/${storyId}/narrate`,
        method: "POST",
        body: { force },
      }),
      invalidatesTags: (_r: any, _e: any, arg: { storyId: string }) => [
        { type: "StoryContent", id: arg.storyId },
        "StoryList",
      ],
    } as any),
  }),
});

export const {
  useNarratorVoicesQuery,
  useUpdateStoryDetailsMutation,
  useUploadArtworkMutation,
  useRemoveArtworkMutation,
  useGetStoryByModuleItemQuery,
  useGetStoryLibraryQuery,
  useGetLibraryStoryQuery,
  useAskStoryMutation,
  useGetStoriesQuery,
  useGetStoryQuery,
  useDraftStoryMutation,
  useImportStoryMutation,
  useUpdateSegmentMutation,
  useNarrateStoryMutation,
  useSetStoryStatusMutation,
  useDetachStoryMutation,
  useSetPublicDemoMutation,
  useMergeSegmentUpMutation,
  useSplitSegmentMutation,
  useRemoveSegmentMutation,
  useUpdateChapterMutation,
  useRemoveChapterMutation,
} = storiesApi;
