"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  useNarratorVoicesQuery,
  useUpdateStoryDetailsMutation,
} from "@/features/stories/storiesApi";
import type { Story } from "@/features/stories/types";

export function StoryDetails({ story }: { story: Story }) {
  const [title, setTitle] = React.useState(story.title);
  const [synopsis, setSynopsis] = React.useState(story.synopsis ?? "");
  const [topics, setTopics] = React.useState((story.topics ?? []).join(", "));
  const [voice, setVoice] = React.useState(story.narratorVoiceId ?? "");
  const [search, setSearch] = React.useState("");
  const [submittedSearch, setSubmittedSearch] = React.useState("");
  const [loadVoices, setLoadVoices] = React.useState(false);
  const { data, isFetching, isError, refetch } = useNarratorVoicesQuery(submittedSearch, {
    skip: !loadVoices,
  });
  const [update, { isLoading }] = useUpdateStoryDetailsMutation();
  const [error, setError] = React.useState<string | null>(null);
  const dirty =
    title !== story.title ||
    synopsis !== (story.synopsis ?? "") ||
    topics !== (story.topics ?? []).join(", ") ||
    voice !== (story.narratorVoiceId ?? "");
  const sample = data?.voices.find((v) => v.id === voice)?.previewUrl;

  return (
    <section className="bg-card space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Story details</h2>
      <label className="block text-sm">
        Title
        <input
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isLoading}
          className="bg-background mt-1 block w-full rounded border p-2"
        />
      </label>
      <label className="block text-sm">
        Story-card description
        <textarea
          maxLength={500}
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          disabled={isLoading}
          className="bg-background mt-1 block w-full rounded border p-2"
        />
      </label>
      <label className="block text-sm">
        Topics
        <input
          maxLength={500}
          value={topics}
          onChange={(e) => setTopics(e.target.value)}
          disabled={isLoading}
          placeholder="Space, friendship, adventure"
          className="bg-background mt-1 block w-full rounded border p-2"
          aria-describedby="story-topics-help"
        />
        <span id="story-topics-help" className="text-muted-foreground mt-1 block text-xs">
          Add up to 8 topics, separated by commas. They help families discover related stories.
        </span>
      </label>
      <label className="block text-sm">
        Narrator
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          disabled={isLoading}
          className="bg-background mt-1 block w-full rounded border p-2"
        >
          <option value="">Configured default narrator</option>
          {voice && !data?.voices.some((v) => v.id === voice) && (
            <option value={voice}>Saved narrator ({voice})</option>
          )}
          {data?.voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      {!loadVoices ? (
        <Button variant="outline" size="sm" onClick={() => setLoadVoices(true)}>
          Browse ElevenLabs narrators
        </Button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (submittedSearch === search) void refetch();
            else setSubmittedSearch(search);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="text-sm">
            Find a narrator
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
              className="bg-background ml-2 rounded border p-2"
            />
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={isFetching}>
            {isFetching ? "Loading…" : "Search voices"}
          </Button>
        </form>
      )}
      {isError && (
        <p role="alert" className="text-destructive text-sm">
          Narrators could not be loaded. Check the ElevenLabs configuration and try searching again.
          Your saved selection is retained.
        </p>
      )}
      {data?.hasMore && (
        <p className="text-muted-foreground text-xs">
          More voices are available. Refine your search to find a specific narrator.
        </p>
      )}
      {data && !data.voices.length && (
        <p className="text-muted-foreground text-sm">No narrators matched this search.</p>
      )}
      {sample && (
        <audio
          key={sample}
          controls
          src={sample}
          preload="none"
          aria-label="Narrator sample"
          className="w-full max-w-sm"
        />
      )}
      {voice !== (story.narratorVoiceId ?? "") && (
        <p className="text-muted-foreground text-sm">
          Saving this narrator clears the draft recordings. Generate and review them again before
          publishing.
        </p>
      )}
      <Button
        disabled={!dirty || !title.trim() || isLoading}
        onClick={async () => {
          setError(null);
          try {
            await update({
              storyId: story.id,
              title: title.trim(),
              synopsis: synopsis.trim(),
              narratorVoiceId: voice || null,
              topics: [...new Set(topics.split(",").map((topic) => topic.trim()).filter(Boolean))],
            }).unwrap();
          } catch (error) {
            const failure = error as { data?: { message?: string | string[] } };
            setError(
              [failure.data?.message ?? "Story details could not be saved. Please retry."]
                .flat()
                .join(" "),
            );
          }
        }}
      >
        {isLoading ? "Saving…" : "Save story details"}
      </Button>
      {dirty && (
        <p className="text-muted-foreground text-xs">Save these changes before publishing.</p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
