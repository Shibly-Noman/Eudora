"use client";

import {
  ArrowLeft,
  ArrowUpToLine,
  BookOpen,
  Check,
  Globe,
  Library,
  SplitIcon,
  Trash2,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { StoryArtwork } from "@/components/story/story-artwork";
import { StoryDetails } from "@/components/story/story-details";
import { Button } from "@/components/ui/button";
import {
  useDetachStoryMutation,
  useGetStoryQuery,
  useMergeSegmentUpMutation,
  useNarrateStoryMutation,
  useRemoveChapterMutation,
  useRemoveSegmentMutation,
  useSetPublicDemoMutation,
  useSetStoryStatusMutation,
  useSplitSegmentMutation,
  useUpdateChapterMutation,
  useUpdateSegmentMutation,
} from "@/features/stories/storiesApi";
import type { Story, StoryChapter, StorySegment } from "@/features/stories/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

/** The tags the narrator understands. Offered as buttons so nobody has to remember them. */
const TAGS = [
  "excited",
  "nervously",
  "sadly",
  "whispers",
  "laughs",
  "curious",
  "gently",
  "proudly",
];

export default function StoryEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: story, isLoading } = useGetStoryQuery(id);
  const [narrate, { isLoading: narrating }] = useNarrateStoryMutation();
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const segments = React.useMemo(() => (story?.chapters ?? []).flatMap((c) => c.segments), [story]);
  const narrated = segments.filter((s) => s.narrationUrl).length;

  const handleNarrate = async (force: boolean) => {
    setError(null);
    setResult(null);
    try {
      const r = await narrate({ storyId: id, force }).unwrap();
      setResult(
        `${r.generated} narrated, ${r.skipped} already done${
          r.failed ? `, ${r.failed} failed` : ""
        }.`,
      );
    } catch (e: any) {
      setError(e?.data?.errors?.[0]?.message ?? e?.data?.message ?? "Narration failed.");
    }
  };

  if (isLoading) {
    return <p className="text-muted-foreground animate-pulse p-6 text-xs">Loading story…</p>;
  }
  if (!story) {
    return <p className="text-muted-foreground p-6 text-xs">Story not found.</p>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/stories">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="space-y-1">
            <h1 className="font-display text-foreground text-2xl font-bold">{story.title}</h1>
            <p className="text-muted-foreground text-xs">
              {segments.length} section{segments.length === 1 ? "" : "s"} ·{" "}
              <span className={narrated === segments.length ? "text-success" : ""}>
                {narrated} narrated
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => handleNarrate(false)} disabled={narrating} size="sm">
            <Volume2 className="mr-1.5 h-4 w-4" />
            {narrating ? "Recording…" : "Narrate missing"}
          </Button>
          <Button
            onClick={() => handleNarrate(true)}
            disabled={narrating}
            variant="outline"
            size="sm"
          >
            Re-record all
          </Button>
        </div>
      </div>

      {result ? (
        <p className="border-success/30 bg-success/5 text-success rounded-lg border px-3 py-2 text-xs">
          {result}
        </p>
      ) : null}
      {error ? (
        <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-xs">
          {error}
        </p>
      ) : null}

      <StoryDetails
        key={`${story.id}:${story.title}:${story.synopsis}:${story.narratorVoiceId}:${(story.topics ?? []).join("|")}`}
        story={story}
      />
      <StoryArtwork storyId={story.id} assets={story.cover ? [story.cover] : []} />

      <StoryPlacement story={story} narrated={narrated} pages={segments.length} />

      <div className="space-y-6">
        {story.chapters.map((chapter) => (
          <div key={chapter.id} className="space-y-3">
            <ChapterHeading chapter={chapter} />
            {chapter.segments.map((segment, index) => (
              <SegmentRow
                storyId={story.id}
                key={segment.id}
                segment={segment}
                index={index + 1}
                isFirst={index === 0}
              />
            ))}
            {chapter.segments.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-[10px]">
                No sections in this chapter.
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Where this story is used, and who can reach it.
 *
 * Three independent facts, one row each rather than a single status, because
 * they answer different questions: which course uses it, whether signed-in
 * children can find it in the library, and whether it is the one story a
 * stranger meets on the marketing page. Any combination is valid, including
 * none of them while it is still being written.
 */
function StoryPlacement({
  story,
  narrated,
  pages,
}: {
  story: Story;
  narrated: number;
  pages: number;
}) {
  const [setStatus, { isLoading: saving }] = useSetStoryStatusMutation();
  const [detach, { isLoading: detaching }] = useDetachStoryMutation();
  const [setPublicDemo, { isLoading: demoSaving }] = useSetPublicDemoMutation();
  const [error, setError] = React.useState<string | null>(null);

  const published = story.status === "PUBLISHED";
  const isDemo = story.isPublicDemo === true;
  const fullyNarrated = pages > 0 && narrated === pages;
  const issues = story.publication?.issues ?? ["Checking publication readiness…"];

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.data?.message ?? "That did not work.");
    }
  };

  return (
    <div className="border-border bg-card space-y-2 rounded-xl border p-4">
      <h2 className="font-semibold">Eudora Moon · Publication</h2>
      <p className="text-muted-foreground text-sm">
        {story.publication?.revision
          ? "Latest edition: " +
            story.publication.revision +
            ". Saved draft changes become visible when you publish again."
          : "Complete the cover, section artwork and narration before publishing."}
      </p>
      {issues.length > 0 && (
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {published && (
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => run(() => setStatus({ storyId: story.id, status: "DRAFT" }).unwrap())}
        >
          Withdraw from library and demo
        </Button>
      )}
      {/* In a course */}
      <div className="flex flex-wrap items-center gap-3">
        <BookOpen className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="text-foreground text-xs">
          {story.moduleItem ? (
            <>
              In a course as <strong className="font-bold">{story.moduleItem.title}</strong>
            </>
          ) : (
            "Not in any course"
          )}
        </span>
        {story.moduleItem ? (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={detaching}
            onClick={() => run(() => detach(story.id).unwrap())}
          >
            {detaching ? "Removing…" : "Take out of course"}
          </Button>
        ) : null}
      </div>

      {/* In the library */}
      <div className="border-border/60 flex flex-wrap items-center gap-3 border-t pt-2">
        <Library className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="text-foreground text-xs">
          {published ? "Published — any student can read it" : "Not published to the story library"}
        </span>
        <Button
          variant={published ? "outline" : "default"}
          size="sm"
          className="ml-auto"
          // Publishing a half-narrated story gives a child a page of text
          // where they expected a voice, and the library filters those out
          // anyway — so it would publish to nowhere.
          disabled={saving || issues.length > 0}
          onClick={() =>
            run(() =>
              setStatus({
                storyId: story.id,
                status: "PUBLISHED",
              }).unwrap(),
            )
          }
        >
          {saving ? "Publishing…" : published ? "Publish changes" : "Publish"}
        </Button>
      </div>

      {/* On the marketing page */}
      <div className="border-border/60 flex flex-wrap items-center gap-3 border-t pt-2">
        <Globe className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="text-foreground text-xs">
          {isDemo ? "Shown on the public demo — no sign-in needed" : "Not the public demo story"}
        </span>
        <Button
          variant={isDemo ? "outline" : "default"}
          size="sm"
          className="ml-auto"
          disabled={demoSaving || (!isDemo && !published)}
          onClick={() =>
            run(() =>
              setPublicDemo({
                storyId: story.id,
                isPublicDemo: !isDemo,
              }).unwrap(),
            )
          }
        >
          {demoSaving ? "Saving…" : isDemo ? "Remove from demo" : "Make it the demo"}
        </Button>
      </div>

      {!isDemo ? (
        <p className="text-muted-foreground text-[10px]">
          Only one story can be the demo — choosing this one replaces whichever is there now.
        </p>
      ) : null}
      {(!published || !isDemo) && !fullyNarrated ? (
        <p className="text-muted-foreground text-[10px]">
          Narrate every section first — {narrated} of {pages} done.
        </p>
      ) : null}
      {error ? <p className="text-destructive text-[10px]">{error}</p> : null}
    </div>
  );
}

/**
 * A chapter heading, renameable in place and removable.
 *
 * Deleting one takes every section under it — the database cascades — so the
 * confirmation says how many, and how many carry recordings. An empty chapter
 * is the common case here and goes on one click; the leftovers from splitting
 * a story up are exactly what an author wants to tidy away.
 */
function ChapterHeading({ chapter }: { chapter: StoryChapter }) {
  const [updateChapter, { isLoading: saving }] = useUpdateChapterMutation();
  const [removeChapter, { isLoading: removing }] = useRemoveChapterMutation();
  const [title, setTitle] = React.useState(chapter.title ?? "");
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setTitle(chapter.title ?? ""), [chapter.title]);

  const count = chapter.segments.length;
  const narrated = chapter.segments.filter((s) => s.narrationUrl).length;
  const dirty = title !== (chapter.title ?? "");

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.data?.message ?? "That did not work.");
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Chapter title"
          className="text-foreground hover:border-border focus:border-border focus:bg-background flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold transition-colors"
        />
        {dirty ? (
          <button
            type="button"
            onClick={() => run(() => updateChapter({ chapterId: chapter.id, title }).unwrap())}
            disabled={saving || !title.trim()}
            className="border-border text-foreground hover:bg-muted rounded-md border px-2 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-40"
          >
            {saving ? "Saving…" : "Rename"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (count === 0 || confirming) {
              void run(() => removeChapter(chapter.id).unwrap());
              return;
            }
            setConfirming(true);
          }}
          onBlur={() => setConfirming(false)}
          disabled={removing}
          className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-40 ${
            confirming
              ? "border-destructive bg-destructive/10 text-destructive font-bold"
              : "border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          }`}
        >
          <Trash2 className="h-3 w-3" />
          {confirming ? `Delete ${count} section${count === 1 ? "" : "s"} too?` : "Delete chapter"}
        </button>
      </div>
      {confirming && narrated > 0 ? (
        <p className="text-destructive text-[10px]">
          {narrated} of them {narrated === 1 ? "has" : "have"} narration that will be discarded with
          the words.
        </p>
      ) : null}
      {error ? <p className="text-destructive text-[10px]">{error}</p> : null}
    </div>
  );
}

/**
 * One page of the story: the words a child reads, and the performed version
 * spoken over them.
 *
 * The two are edited together because they are only valid as a pair — the
 * server refuses narration whose tags do not strip back to the displayed text,
 * so an editor that let them drift apart would just produce failures later.
 */
function SegmentRow({
  storyId,
  segment,
  index,
  isFirst,
}: {
  storyId: string;
  segment: StorySegment;
  index: number;
  /** First in its chapter: there is nothing above it to merge into. */
  isFirst: boolean;
}) {
  const [updateSegment, { isLoading: saving }] = useUpdateSegmentMutation();
  const [mergeUp, { isLoading: merging }] = useMergeSegmentUpMutation();
  const [splitSegment, { isLoading: splitting }] = useSplitSegmentMutation();
  const [removeSegment, { isLoading: removing }] = useRemoveSegmentMutation();
  const textRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = React.useState(segment.text);
  const [narrationText, setNarrationText] = React.useState(segment.narrationText ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  React.useEffect(() => {
    setText(segment.text);
    setNarrationText(segment.narrationText ?? "");
  }, [segment.text, segment.narrationText]);

  const dirty = text !== segment.text || narrationText !== (segment.narrationText ?? "");

  /** Mirrors the server's rule, so the mismatch is visible before saving. */
  const stripped = narrationText.replace(/\[[^\]]*\]\s*/g, "");
  const mismatch = narrationText.trim() !== "" && stripped !== text;

  const insertTag = (tag: string) => {
    const base = narrationText.trim() === "" ? text : narrationText;
    setNarrationText(`[${tag}] ${base}`);
  };

  const save = async () => {
    setError(null);
    try {
      await updateSegment({
        segmentId: segment.id,
        text,
        narrationText: narrationText.trim() === "" ? null : narrationText,
      }).unwrap();
    } catch (e: any) {
      setError(e?.data?.message ?? "Could not save.");
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.data?.message ?? "That did not work.");
    }
  };

  /**
   * Splits where the caret is. Reading the textarea directly rather than
   * tracking selection in state: the caret moves on every keystroke and click,
   * and mirroring that into React would re-render the field the author is
   * typing in.
   */
  const splitHere = () => {
    const at = textRef.current?.selectionStart ?? 0;
    if (at <= 0 || at >= text.length) {
      setError("Put the cursor where the break should go first.");
      return;
    }
    void run(() => splitSegment({ segmentId: segment.id, at }).unwrap());
  };

  const busy = merging || splitting || removing;

  return (
    <div className="border-border bg-card space-y-2 rounded-xl border p-4">
      <StoryArtwork storyId={storyId} segmentId={segment.id} assets={segment.assets} />
      <div className="flex items-start gap-3">
        <span className="text-muted-foreground mt-2 w-5 shrink-0 text-right text-[10px] tabular-nums">
          {index}
        </span>
        <div className="flex-1 space-y-2">
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="border-border bg-background w-full rounded-lg border p-2 text-xs leading-relaxed"
          />

          {/* Reshaping the section itself, as opposed to its words. Changing
              any of these discards the recording, so they sit apart from the
              tag buttons rather than among them. */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => run(() => mergeUp(segment.id).unwrap())}
              disabled={isFirst || busy || dirty}
              title={
                isFirst
                  ? "Nothing above this in the chapter"
                  : dirty
                    ? "Save your edits first"
                    : "Join this section into the one above"
              }
              className="border-border text-muted-foreground hover:bg-muted flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-40"
            >
              <ArrowUpToLine className="h-3 w-3" /> Merge up
            </button>
            <button
              type="button"
              onClick={splitHere}
              disabled={busy || dirty}
              title={dirty ? "Save your edits first" : "Break this section where the cursor is"}
              className="border-border text-muted-foreground hover:bg-muted flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-40"
            >
              <SplitIcon className="h-3 w-3" /> Split at cursor
            </button>
            {/* Two steps, because deleting a section destroys the only copy
                of its words — there is no soft-delete behind this and nothing
                to undo it with. An empty section goes on one click; one with
                writing in it asks first. */}
            <button
              type="button"
              onClick={() => {
                if (!segment.text.trim() || confirmingDelete) {
                  void run(() => removeSegment(segment.id).unwrap());
                  return;
                }
                setConfirmingDelete(true);
              }}
              onBlur={() => setConfirmingDelete(false)}
              disabled={busy}
              className={`ml-auto flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-40 ${
                confirmingDelete
                  ? "border-destructive bg-destructive/10 text-destructive font-bold"
                  : "border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              }`}
            >
              <Trash2 className="h-3 w-3" />
              {confirmingDelete ? "Delete for good?" : "Delete"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => insertTag(tag)}
                className="border-border text-muted-foreground hover:bg-muted rounded-full border px-2 py-0.5 text-[10px] transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>

          <textarea
            value={narrationText}
            onChange={(e) => setNarrationText(e.target.value)}
            rows={2}
            placeholder="Performed version — same words, plus [tags]. Leave blank to read it plainly."
            className={`bg-background w-full rounded-lg border p-2 font-mono text-[11px] leading-relaxed ${
              mismatch ? "border-destructive" : "border-border"
            }`}
          />

          {mismatch ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-destructive text-[10px]">
                Tags may be added, but the words must stay the same — this will be refused.
              </p>
              {/* The usual way to reach this state is editing the words and
                  leaving the performance describing the old ones. Rewriting
                  the tags by hand to match is work; reading the line plainly
                  is a fine answer, and re-tagging it afterwards is easy. */}
              <button
                type="button"
                onClick={() => setNarrationText("")}
                className="border-border text-muted-foreground hover:bg-muted rounded-md border px-2 py-0.5 text-[10px] transition-colors"
              >
                Clear the performance
              </button>
              <button
                type="button"
                onClick={() => setNarrationText(text)}
                className="border-border text-muted-foreground hover:bg-muted rounded-md border px-2 py-0.5 text-[10px] transition-colors"
              >
                Start again from the words
              </button>
            </div>
          ) : null}
          {error ? <p className="text-destructive text-[10px]">{error}</p> : null}

          <div className="flex items-center gap-3">
            <Button
              onClick={save}
              disabled={!dirty || mismatch || saving}
              size="sm"
              variant={dirty ? "default" : "outline"}
            >
              {saving ? "Saving…" : dirty ? "Save page" : <Check className="h-4 w-4" />}
            </Button>

            {segment.narrationUrl ? (
              <audio
                controls
                preload="none"
                crossOrigin="use-credentials"
                src={`${API_URL}${segment.narrationUrl}`}
                className="h-8 flex-1"
              />
            ) : (
              <span className="text-muted-foreground text-[10px]">Not narrated yet</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
