import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query';

import type { TokenResponse } from '../contracts';
import { getActingChildId } from './actingChildStore';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './tokenStore';

export const API_BASE_URL = resolveBaseUrl();

function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  return 'http://localhost:5000';
}

/**
 * Local-disk storage on the API returns a root-relative URL —
 * `/api/uploads/<key>` — with nothing to resolve it against on this side;
 * unlike a browser there is no "current origin" to fall back on, so used
 * bare it fails outright rather than merely 404ing. Production storage
 * (R2/S3) already returns an absolute URL, which this leaves untouched. A
 * `data:` URI (seed content with no uploaded file behind it at all) is
 * self-contained and must be left alone too — prefixing it with
 * API_BASE_URL would corrupt it into a string that isn't a valid URL of
 * any kind.
 */
export function resolveUploadUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:)/i.test(url)) return url;
  return `${API_BASE_URL}${url}`;
}

/**
 * Cookies are disabled deliberately. React Native's fetch has a native cookie
 * jar (OkHttp on Android, NSHTTPCookieStorage on iOS), so a cookie-based login
 * would appear to work in development and then behave unpredictably — the app
 * would be holding a session it never explicitly manages. Bearer tokens only.
 */
const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${API_BASE_URL}/api`,
  credentials: 'omit',
  prepareHeaders: (headers) => {
    const token = getAccessToken();
    if (token) headers.set('authorization', `Bearer ${token}`);

    // Tells the API which child a guardian is acting for. Purely a hint — the
    // server re-checks the guardian-child link on every request and ignores it
    // entirely for callers who are themselves students, so sending it
    // unconditionally is safe and keeps this off every individual call site.
    //
    // Sending the header is NOT sufficient on its own: RTK Query keys its cache
    // on the endpoint argument, which knows nothing about this. Every
    // child-varying query must also carry the child id in its arg, or two
    // siblings share one cache entry. See `useActingChild`.
    const actingChildId = getActingChildId();
    if (actingChildId) headers.set('x-acting-student-id', actingChildId);

    return headers;
  },
});

// ─── Envelope unwrapping ─────────────────────────────────────────────────────

function isEnvelope(value: unknown): value is Record<string, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in (value as any) &&
    'data' in (value as any)
  );
}

/**
 * The API wraps every response as {success, code, message, data, meta}. Callers
 * only ever want `data`, except for paginated responses, where `meta.pagination`
 * is the only place the totals exist.
 */
function unwrap(payload: unknown): unknown {
  if (!isEnvelope(payload)) return payload;
  const pagination = payload.meta?.pagination;
  if (pagination && Array.isArray(payload.data)) {
    return { items: payload.data, pagination };
  }
  return payload.data;
}

// ─── Single-flight refresh ───────────────────────────────────────────────────

/**
 * Every concurrent 401 must await the *same* refresh call.
 *
 * The backend rotates the refresh token on each use and treats a token that no
 * longer matches a stored session as theft — which revokes every session the
 * user has, on every device. Firing N parallel refreshes would present N-1
 * already-rotated tokens and log the student out everywhere. Phase 0 added a
 * short server-side grace window as a second line of defence, but this mutex is
 * what keeps the app from relying on it.
 */
let inFlightRefresh: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;

    const envelope = await response.json();
    const tokens = (envelope?.data ?? envelope) as TokenResponse;
    if (!tokens?.accessToken || !tokens?.refreshToken) return false;

    await setTokens(tokens.accessToken, tokens.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = performRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

/** Paths that must never trigger a refresh — they are how a session begins. */
const NO_REFRESH_PATHS = ['/auth/token', '/auth/token/refresh'];

export type AppBaseQuery = BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
>;

let onSessionExpired: (() => void) | null = null;

/**
 * Navigation lives in the app layer, so `core` cannot route on its own. The
 * app registers a callback instead of this module importing a navigator.
 */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export const baseQueryWithReauth: AppBaseQuery = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  const url = typeof args === 'string' ? args : args.url;
  const skipRefresh = NO_REFRESH_PATHS.some((p) => url.startsWith(p));

  if (result.error?.status === 401 && !skipRefresh) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      await clearTokens();
      onSessionExpired?.();
    }
  }

  if (result.data !== undefined) {
    return { ...result, data: unwrap(result.data) };
  }
  return result;
};
