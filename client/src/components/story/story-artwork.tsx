"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { useRemoveArtworkMutation, useUploadArtworkMutation } from "@/features/stories/storiesApi";
import type { StoryAsset } from "@/features/stories/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

export function StoryArtwork({
  storyId,
  segmentId,
  assets,
}: {
  storyId: string;
  segmentId?: string;
  assets: StoryAsset[];
}) {
  const [upload, { isLoading }] = useUploadArtworkMutation();
  const [remove, { isLoading: removing }] = useRemoveArtworkMutation();
  const [file, setFile] = React.useState<File | null>(null);
  const [altText, setAltText] = React.useState("");
  const [kind, setKind] = React.useState("ILLUSTRATION");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function failure(error: unknown) {
    const value = error as { data?: { message?: string | string[] } };
    setError([value.data?.message ?? "Artwork could not be saved. Please retry."].flat().join(" "));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !altText.trim()) return;
    setError(null);
    setNotice(null);
    const body = new FormData();
    body.append("file", file);
    body.append("purpose", segmentId ? "SECTION" : "COVER");
    body.append("kind", kind);
    body.append("altText", altText.trim());
    if (segmentId) body.append("segmentId", segmentId);
    try {
      await upload({ storyId, body }).unwrap();
      setFile(null);
      setAltText("");
      if (input.current) input.current.value = "";
      setNotice(segmentId ? "Section artwork saved." : "Story-card cover saved.");
    } catch (error) {
      failure(error);
    }
  }
  return (
    <section
      className="bg-card space-y-3 rounded-xl border p-4"
      aria-label={segmentId ? "Section artwork" : "Story cover"}
    >
      <div>
        <h3 className="font-semibold">
          {segmentId ? "Section artwork" : "Eudora Moon · Story cover"}
        </h3>
        <p className="text-muted-foreground text-sm">
          {segmentId
            ? "These images appear with this section’s narration. Add an illustration or a background; multiple images appear in upload order."
            : "Upload the cover illustration shown on the story card. Each narration section has its own artwork below."}
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        {assets
          .filter((a) => a.kind !== "AUDIO")
          .map((asset) => (
            <figure key={asset.id} className="w-44 space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${API_URL}${asset.url}`}
                alt={asset.altText}
                crossOrigin="use-credentials"
                className="bg-muted aspect-[3/2] w-full rounded-lg object-contain"
              />
              <figcaption className="text-xs">
                {asset.kind === "BACKGROUND" ? "Background · " : ""}
                {asset.altText}
              </figcaption>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={removing || isLoading}
                onClick={async () => {
                  setError(null);
                  try {
                    await remove(asset.id).unwrap();
                    setNotice("Artwork removed from the draft.");
                  } catch (error) {
                    failure(error);
                  }
                }}
              >
                Remove
              </Button>
            </figure>
          ))}
      </div>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm">
          {segmentId ? "Add artwork" : assets.length ? "Replace cover" : "Choose cover"}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={isLoading}
            className="mt-1 block w-full rounded border p-2"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setError(null);
              setNotice(null);
              if (
                next &&
                (next.size > 10 * 1024 * 1024 ||
                  !["image/png", "image/jpeg", "image/webp"].includes(next.type))
              ) {
                setError("Choose a PNG, JPEG or WebP up to 10 MB.");
                setFile(null);
                event.target.value = "";
                return;
              }
              setFile(next);
            }}
          />
        </label>
        <p className="text-muted-foreground text-xs">
          PNG, JPEG or WebP · up to 10 MB and 40 megapixels.
        </p>
        {preview && (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Selected artwork preview"
              className="max-h-48 rounded-lg object-contain"
            />
            {segmentId && (
              <label className="block text-sm">
                Artwork role
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  disabled={isLoading}
                  className="bg-background ml-3 rounded border p-2"
                >
                  <option value="ILLUSTRATION">Illustration</option>
                  <option value="BACKGROUND">Background</option>
                </select>
              </label>
            )}
            <label className="block text-sm">
              Describe what is pictured
              <textarea
                required
                maxLength={300}
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                disabled={isLoading}
                className="bg-background mt-1 block w-full rounded border p-2"
                placeholder="For example: A young astronaut watches Earth through the spacecraft window."
              />
            </label>
            <Button type="submit" disabled={isLoading || !altText.trim()}>
              {isLoading ? "Uploading…" : segmentId ? "Save section artwork" : "Save cover"}
            </Button>
          </div>
        )}
      </form>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-muted-foreground text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
