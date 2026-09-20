"use client";

import { ArrowLeft, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetCourseDetailQuery, useGetCoursesQuery } from "@/features/catalog/catalogApi";
import { useCreateModuleItemMutation } from "@/features/catalog/catalogApi";
import {
  useDraftStoryMutation,
  useImportStoryMutation,
} from "@/features/stories/storiesApi";
import type { StoryDraft } from "@/features/stories/types";

/**
 * Authoring in two steps: the model proposes a shape, a person accepts it.
 *
 * The draft is held in component state and never saved on its own. Splitting
 * someone's writing at the wrong beat is a normal outcome, so the review step
 * is the feature — not a confirmation dialog bolted onto an import.
 */
export default function CreateStoryPage() {
  const router = useRouter();

  const [source, setSource] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [topics, setTopics] = React.useState("");
  const [draft, setDraft] = React.useState<StoryDraft | null>(null);
  const [courseId, setCourseId] = React.useState("");
  const [conceptId, setConceptId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const [draftStory, { isLoading: drafting }] = useDraftStoryMutation();
  const [importStory, { isLoading: importing }] = useImportStoryMutation();
  const [createModuleItem] = useCreateModuleItemMutation();

  const { data: coursesData } = useGetCoursesQuery({ page: 1, limit: 100 });
  const { data: course } = useGetCourseDetailQuery(courseId, {
    skip: !courseId,
  });

  const courses = coursesData?.items ?? [];
  const concepts = (course as any)?.concepts ?? [];

  const handleDraft = async () => {
    setError(null);
    try {
      const result = await draftStory({
        source: source.trim(),
        title: title.trim() || undefined,
      }).unwrap();
      setDraft(result);
      if (!title.trim()) setTitle(result.title);
    } catch (e: any) {
      setError(
        e?.data?.errors?.[0]?.message ??
          e?.data?.message ??
          "The story could not be prepared.",
      );
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setError(null);
    try {
      // Only when the author has actually chosen somewhere. A story with no
      // course is the normal case, not an unfinished one.
      let moduleItemId: string | undefined;
      if (conceptId) {
        const item: any = await createModuleItem({
          conceptId,
          title: title.trim() || draft.title,
          kind: "STORY",
          status: "DRAFT",
        }).unwrap();
        moduleItemId = item.id;
      }

      const story: any = await importStory({
        ...(moduleItemId ? { moduleItemId } : {}),
        title: title.trim() || draft.title,
        synopsis: draft.synopsis || undefined,
        topics: [...new Set(topics.split(",").map((topic) => topic.trim()).filter(Boolean))],
        characters: draft.characters.map((c) => ({
          name: c.name,
          description: c.description || undefined,
        })),
        chapters: draft.chapters,
      }).unwrap();

      router.push(`/stories/${story.id}`);
    } catch (e: any) {
      setError(
        e?.data?.errors?.[0]?.message ??
          e?.data?.message ??
          "The story could not be saved.",
      );
    }
  };

  const sectionCount =
    draft?.chapters.reduce((n, c) => n + c.segments.length, 0) ?? 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/stories">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-foreground">
            New Story
          </h1>
          <p className="text-xs text-muted-foreground">
            Paste the story as you wrote it. It gets split into sections and given a
            performance, which you can edit before anything is saved.
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Source ─────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional — taken from the story if left blank)"
            className="h-10 rounded-xl text-xs"
          />
          <Input
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            placeholder="Topics (comma-separated, optional)"
            maxLength={500}
            className="h-10 rounded-xl text-xs"
            aria-label="Story topics"
          />
          <p className="text-[10px] text-muted-foreground">
            Add topics such as space, friendship, or adventure so families can find this story later.
          </p>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Paste the whole story here…"
            rows={18}
            className="w-full rounded-xl border border-border bg-card p-3 text-xs leading-relaxed"
          />
          <div className="flex items-center gap-3">
            <Button
              onClick={handleDraft}
              disabled={!source.trim() || drafting}
              size="sm"
            >
              <Wand2 className="mr-1.5 h-4 w-4" />
              {drafting ? "Reading it…" : "Split into sections"}
            </Button>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {source.trim().length} characters
            </span>
          </div>
        </div>

        {/* ── Review ─────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {!draft ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
              <Sparkles className="h-7 w-7 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                The sections will appear here for you to check.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span className="font-bold text-foreground">
                  {draft.chapters.length} chapter
                  {draft.chapters.length === 1 ? "" : "s"} · {sectionCount} section
                  {sectionCount === 1 ? "" : "s"}
                </span>
                {draft.droppedNarrationCount > 0 ? (
                  // Surfaced rather than hidden: those lines will be read flat,
                  // and the author is the only one who can decide if that matters.
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 font-bold text-warning">
                    {draft.droppedNarrationCount} performance
                    {draft.droppedNarrationCount === 1 ? "" : "s"} discarded for
                    changing the words
                  </span>
                ) : null}
              </div>

              <div className="max-h-[26rem] space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-4">
                {draft.chapters.map((chapter, ci) => (
                  <div key={ci} className="space-y-2">
                    <h3 className="text-xs font-bold text-foreground">
                      {chapter.title}
                    </h3>
                    {chapter.segments.map((segment, si) => (
                      <div
                        key={si}
                        className="rounded-lg border border-border/60 p-2"
                      >
                        <p className="text-xs leading-relaxed text-foreground">
                          {segment.text}
                        </p>
                        {segment.narrationText ? (
                          <p className="mt-1 font-mono text-[10px] text-primary">
                            {segment.narrationText}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-foreground">
                    Add it to a course? <span className="font-normal text-muted-foreground">Optional</span>
                  </p>
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    A story stands on its own. Leave this blank and it lives in
                    the story library; you can drop it into a chapter later, or
                    never.
                  </p>
                </div>
                <select
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value);
                    setConceptId("");
                  }}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs"
                >
                  <option value="">Choose a course…</option>
                  {courses.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <select
                  value={conceptId}
                  onChange={(e) => setConceptId(e.target.value)}
                  disabled={!courseId}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs disabled:opacity-50"
                >
                  <option value="">Choose a chapter…</option>
                  {concepts.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <Button
                  onClick={handleSave}
                  disabled={importing}
                  size="sm"
                  className="w-full"
                >
                  {importing ? "Saving…" : "Save story"}
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Saved as a draft. Narration is generated on the next screen,
                  once you are happy with the words.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
