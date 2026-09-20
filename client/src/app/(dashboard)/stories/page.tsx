"use client";

import { BookHeadphones, Filter, Globe, Plus, Volume2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { useGetStoriesQuery } from "@/features/stories/storiesApi";

export default function StoriesPage() {
  const { data: stories, isLoading } = useGetStoriesQuery();
  const [topic, setTopic] = React.useState("all");
  const topics = React.useMemo(
    () => Array.from(new Set((stories ?? []).flatMap((story) => story.topics ?? []))).sort(),
    [stories],
  );
  const visibleStories = React.useMemo(
    () => (stories ?? []).filter((story) => topic === "all" || (story.topics ?? []).includes(topic)),
    [stories, topic],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Stories
          </h1>
          <p className="text-xs text-muted-foreground">
            Narrated stories a child can listen to and ask questions about.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/stories/create">
            <Plus className="mr-1.5 h-4 w-4" />
            New Story
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="animate-pulse rounded-xl border p-8 text-center text-xs text-muted-foreground">
          Loading stories…
        </p>
      ) : !stories?.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <BookHeadphones className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-bold text-foreground">
            No stories yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Paste a story you have written and it will be split into pages, given
            a performance, and read aloud.
          </p>
          <Button asChild size="sm" className="mt-5">
            <Link href="/stories/create">Write the first one</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <label className="text-xs font-semibold text-foreground" htmlFor="story-topic-filter">Topic</label>
            <select
              id="story-topic-filter"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
            >
              <option value="all">All topics</option>
              {topics.map((value) => <option key={value} value={value}>{topicLabel(value)}</option>)}
            </select>
            {topic !== "all" ? <span className="text-[10px] text-muted-foreground">{visibleStories.length} matching {visibleStories.length === 1 ? "story" : "stories"}</span> : null}
          </div>
          {visibleStories.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              No stories have been assigned to this topic yet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleStories.map((story) => {
            const fullyNarrated =
              story.segmentCount > 0 &&
              story.narratedCount === story.segmentCount;
            return (
              <Link
                key={story.id}
                href={`/stories/${story.id}`}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-bold text-foreground">
                    {story.title}
                  </h2>
                  {story.isPublicDemo ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      <Globe className="h-3 w-3" /> Public
                    </span>
                  ) : null}
                </div>

                {story.synopsis ? (
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {story.synopsis}
                  </p>
                ) : null}

                {story.topics?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {story.topics.map((value) => <span key={value} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{topicLabel(value)}</span>)}
                  </div>
                ) : null}

                <div className="mt-auto flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="tabular-nums">
                    {story.chapterCount} chapter
                    {story.chapterCount === 1 ? "" : "s"} · {story.segmentCount}{" "}
                    page{story.segmentCount === 1 ? "" : "s"}
                  </span>
                  {/* Narration is the expensive, slow part of authoring, so how
                      much of it is done is the status that actually matters. */}
                  <span
                    className={`ml-auto flex items-center gap-1 font-bold tabular-nums ${
                      fullyNarrated ? "text-success" : "text-muted-foreground"
                    }`}
                  >
                    <Volume2 className="h-3 w-3" />
                    {story.narratedCount}/{story.segmentCount}
                  </span>
                </div>
              </Link>
            );
          })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function topicLabel(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
