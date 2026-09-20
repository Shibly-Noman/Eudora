const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

/**
 * Local-disk storage (`LocalStorageService`) returns a root-relative URL —
 * `/api/uploads/<key>` — with no Next.js proxy rewriting `/api/*` to the
 * API's origin (see authApi.ts), so used bare it resolves against the
 * client's own origin and 404s. Production storage (R2/S3) already returns
 * an absolute URL, which this leaves untouched. A `data:` URI (seed content
 * with no uploaded file behind it at all) is self-contained and must be
 * left alone too — prefixing it with API_URL would corrupt it into a
 * string that isn't a valid URL of any kind.
 */
export function resolveUploadUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:)/i.test(url)) return url;
  return `${API_URL}${url}`;
}
