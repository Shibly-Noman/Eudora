import { api } from '@/core/api/api';
import type { Story, StoryLibraryItem } from '@/core/contracts';
import type { ChildScoped } from '@/features/catalog/catalogApi';

export const storyApi = api.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Keyed by module item rather than story id, because that is what the
     * course outline links to and what the API's entitlement check is
     * expressed in terms of.
     *
     * Child-scoped for the same reason every catalog query is: the server
     * decides whose entitlement to check from the `x-acting-student-id`
     * header, which RTK Query does not see when it builds a cache key.
     * Without the id in the argument, a guardian with two children would get
     * one cache entry for both.
     */
    getStoryByModuleItem: builder.query<Story, { moduleItemId: string } & ChildScoped>({
      query: ({ moduleItemId }) => `/stories/by-module-item/${moduleItemId}`,
      providesTags: (_r, _e, { moduleItemId, actingChildId }) => [
        { type: 'Story', id: `${moduleItemId}:${actingChildId ?? 'self'}` },
      ],
    }),

    /**
     * Every published story. Not child-scoped, and deliberately so: the
     * library is free to anyone signed in, so the answer does not vary by
     * which child a guardian is acting as. Scoping it would split one cache
     * entry into two identical ones.
     */
    getStoryLibrary: builder.query<StoryLibraryItem[], void>({
      query: () => '/stories/library',
      providesTags: [{ type: 'Story', id: 'LIBRARY' }],
    }),

    /**
     * A library story's content. A separate route from the staff-only
     * `/stories/:id`, which 403s for a student — this one runs the read gate
     * that lets PUBLISHED through.
     */
    getLibraryStory: builder.query<Story, string>({
      query: (storyId) => `/stories/library/${storyId}`,
      providesTags: (_r, _e, storyId) => [{ type: 'Story', id: `library:${storyId}` }],
    }),
  }),
});

export const {
  useGetStoryByModuleItemQuery,
  useGetStoryLibraryQuery,
  useGetLibraryStoryQuery,
} = storyApi;
