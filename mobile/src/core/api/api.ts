import { createApi } from '@reduxjs/toolkit/query/react';

import { baseQueryWithReauth } from './baseQuery';

/**
 * One API slice, with a tag list scoped to the student and guardian surfaces.
 *
 * Deliberately not a port of the web client's single api with 45+ tags — most
 * of those (Campuses, Leads, Placements, TeacherPortal…) describe admin screens
 * this app will never have. Feature files extend this via injectEndpoints.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  // Persisted queries (see core/persist) are placeholders, not a source of
  // truth — both of these keep them from ever going stale-and-trusted.
  refetchOnMountOrArgChange: true,
  refetchOnReconnect: true,
  tagTypes: [
    'Me',
    'Subjects',
    'Courses',
    'CourseDetail',
    'LessonFlow',
    'Gamification',
    'GamificationToday',
    'Badges',
    'Leaderboard',
    'ModuleItem',
    'Discussion',
    'Children',
    'Assignment',
    'AssessmentAttempt',
    'Billing',
    'Homework',
    'ItemHomework',
    'LiveSession',
    'Entitlements',
    'Orders',
    'Story',
  ],
  endpoints: () => ({}),
});
