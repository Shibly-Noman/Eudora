import { configureStore, createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { createApi, fetchBaseQuery, setupListeners } from '@reduxjs/toolkit/query/react';

import { API_URL, register as registerRequest, restoreTokens, signIn as signInRequest, signOut as signOutRequest, type Story, type StoryCard, type Tokens } from '@/api';

type SessionState = {
  tokens: Tokens | null;
  status: 'loading' | 'ready';
};

const initialState: SessionState = { tokens: null, status: 'loading' };

export const restoreSession = createAsyncThunk('session/restore', async () => {
  try {
    return await restoreTokens();
  } catch {
    await signOutRequest();
    return null;
  }
});
export const signInSession = createAsyncThunk('session/signIn', async ({ email, password }: { email: string; password: string }) => signInRequest(email, password));
export const registerSession = createAsyncThunk('session/register', async (payload: { firstName: string; lastName: string; email: string; password: string }) => registerRequest(payload));
export const signOutSession = createAsyncThunk('session/signOut', async () => {
  await signOutRequest();
});

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.pending, (state) => { state.status = 'loading'; })
      .addCase(restoreSession.fulfilled, (state, action) => { state.tokens = action.payload; state.status = 'ready'; })
      .addCase(restoreSession.rejected, (state) => { state.tokens = null; state.status = 'ready'; })
      .addCase(signInSession.fulfilled, (state, action) => { state.tokens = action.payload; state.status = 'ready'; })
      .addCase(registerSession.fulfilled, (state, action) => { state.tokens = action.payload; state.status = 'ready'; })
      .addCase(signOutSession.fulfilled, (state) => { state.tokens = null; state.status = 'ready'; });
  },
});

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) return (payload as { data: T }).data;
  return payload as T;
}

export const storyApi = createApi({
  reducerPath: 'storyApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api`,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as { session: SessionState }).session.tokens?.accessToken;
      if (token) headers.set('authorization', `Bearer ${token}`);
      headers.set('accept', 'application/json');
      return headers;
    },
  }),
  tagTypes: ['Library', 'Story'],
  endpoints: (builder) => ({
    getLibrary: builder.query<StoryCard[], void>({
      query: () => '/stories/library',
      transformResponse: (response) => unwrap<StoryCard[]>(response),
      providesTags: ['Library'],
    }),
    getStory: builder.query<Story, string>({
      query: (id) => `/stories/library/${id}`,
      transformResponse: (response) => unwrap<Story>(response),
      providesTags: (_result, _error, id) => [{ type: 'Story', id }],
    }),
  }),
});

export const store = configureStore({
  reducer: {
    session: sessionSlice.reducer,
    [storyApi.reducerPath]: storyApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(storyApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const { useGetLibraryQuery, useGetStoryQuery } = storyApi;
