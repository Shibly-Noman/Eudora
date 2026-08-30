import { api } from '@/core/api/api';
import type { ChildScoped } from '@/features/catalog/catalogApi';
import type { Story } from '@/core/contracts';

/**
 * Keyed by module item rather than story id, because that is what the course
 * outline links to and what the API's entitlement check is expressed in terms
 * of.
 *
 * Child-scoped for the same reason every catalog query is: the server decides
 * whose entitlement to check from the `x-acting-student-id` header, which RTK
 * Query does not see when it builds a cache key. Without the id in the
 * argument, a guardian with two children would get one cache entry for both.
 */
export const storyApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getStoryByModuleItem: builder.query<Story, { moduleItemId: string } & ChildScoped>({
      query: ({ moduleItemId }) => `/stories/by-module-item/${moduleItemId}`,
      providesTags: (_r, _e, { moduleItemId, actingChildId }) => [
        { type: 'Story', id: `${moduleItemId}:${actingChildId ?? 'self'}` },
      ],
    }),
  }),
});

export const { useGetStoryByModuleItemQuery } = storyApi;
