import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Docker publishes the shared Eudora API on port 3000 for local web development.
// Device-specific setups can still override this with EXPO_PUBLIC_API_URL.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const ACCESS_TOKEN_KEY = 'eudora-moon-access-token';
const REFRESH_TOKEN_KEY = 'eudora-moon-refresh-token';

async function getStored(key: string) {
  if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function setStored(key: string, value: string) {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteStored(key: string) {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export type User = { id: string; firstName: string; lastName: string; email: string; roles: string[] };
export type Tokens = { accessToken: string; refreshToken: string; user: User };
export type StoryAsset = { id: string; url: string; altText: string; kind?: 'ILLUSTRATION' | 'BACKGROUND' | 'AUDIO' };
export type NarrationTimings = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};
export type StorySegment = {
  id: string;
  text: string;
  narrationUrl: string | null;
  narrationDurationMs?: number | null;
  narrationTimings?: NarrationTimings | null;
  assets: StoryAsset[];
};
export type Story = { id: string; title: string; synopsis: string | null; topics?: string[]; cover: StoryAsset | null; releaseId?: string; chapters: { id: string; title: string | null; segments: StorySegment[] }[] };
export type StoryCard = {
  id: string;
  title: string;
  synopsis: string | null;
  topics?: string[];
  gradeBand?: string | null;
  coverUrl: string | null;
  pageCount: number;
  narrated: boolean;
};

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) return (payload as { data: T }).data;
  return payload as T;
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message;
    throw new Error(Array.isArray(message) ? message.join(' ') : message || 'Something went wrong. Please try again.');
  }
  return unwrap<T>(payload);
}

export async function restoreTokens(): Promise<Tokens | null> {
  const [accessToken, refreshToken] = await Promise.all([getStored(ACCESS_TOKEN_KEY), getStored(REFRESH_TOKEN_KEY)]);
  return accessToken && refreshToken ? { accessToken, refreshToken, user: await request<User>('/auth/me', {}, accessToken) } : null;
}

export async function signIn(email: string, password: string): Promise<Tokens> {
  const tokens = await request<Tokens>('/auth/token', { method: 'POST', body: JSON.stringify({ email, password }) });
  await Promise.all([setStored(ACCESS_TOKEN_KEY, tokens.accessToken), setStored(REFRESH_TOKEN_KEY, tokens.refreshToken)]);
  return tokens;
}

export async function register({ firstName, lastName, email, password }: { firstName: string; lastName: string; email: string; password: string }): Promise<Tokens> {
  const tokens = await request<Tokens>('/auth/token/register', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, email, password, role: 'USER' }),
  });
  await Promise.all([setStored(ACCESS_TOKEN_KEY, tokens.accessToken), setStored(REFRESH_TOKEN_KEY, tokens.refreshToken)]);
  return tokens;
}

export async function signOut(): Promise<void> {
  await Promise.all([deleteStored(ACCESS_TOKEN_KEY), deleteStored(REFRESH_TOKEN_KEY)]);
}

export type MediaSource = { uri: string; headers?: { authorization: string }; sourcePath?: string };
export function mediaUrl(path: string): string { return /^https?:/i.test(path) ? path : `${API_URL}${path}`; }
export function mediaSource(path: string, token: string | null): MediaSource {
  return { uri: mediaUrl(path), headers: token ? { authorization: `Bearer ${token}` } : undefined, sourcePath: path };
}

/**
 * React Native Web cannot pass request headers to its HTML image and audio tags.
 * Fetching protected media ourselves produces an object URL for web, while native
 * platforms continue to use the optimized header-aware React Native source.
 */
export function useMediaSource(path: string | null | undefined, token: string | null) {
  const [source, setSource] = React.useState<MediaSource | null>(null);

  React.useEffect(() => {
    if (!path) { setSource(null); return; }
    if (Platform.OS !== 'web') { setSource(mediaSource(path, token)); return; }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setSource(null);
    void fetch(mediaUrl(path), { headers: token ? { authorization: `Bearer ${token}` } : undefined, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Media request failed (${response.status})`);
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSource({ uri: objectUrl, sourcePath: path });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setSource(null);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, token]);

  return source;
}
export const stories = {
  library: (token: string) => request<StoryCard[]>('/stories/library', {}, token),
  get: (id: string, token: string) => request<Story>(`/stories/library/${id}`, {}, token),
};
