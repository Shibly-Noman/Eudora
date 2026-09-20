import type { Timings } from "./narration-timings";

/**
 * The story payload, identical whether it came from the authenticated route or
 * the public demo. Media URLs arrive relative and already pointing at the right
 * route family — the server decides which, so the reader never has to know
 * which surface it is running on.
 */
export interface StoryAsset {
  kind?: "ILLUSTRATION" | "BACKGROUND" | "AUDIO";
  sortOrder?: number;
  id: string;
  url: string;
  altText: string;
}

export interface StorySegment {
  id: string;
  text: string;
  /** The same words with emotion markup, or null for plain delivery. */
  narrationText: string | null;
  narrationUrl: string | null;
  narrationDurationMs: number | null;
  narrationTimings: Timings | null;
  assets: StoryAsset[];
}

export interface StoryChapter {
  id: string;
  title: string | null;
  segments: StorySegment[];
}

export interface Story {
  narratorVoiceId?: string | null;
  releaseId?: string;
  publication?: { revision: number | null; createdAt: string | null; issues: string[] };
  id: string;
  title: string;
  synopsis: string | null;
  /** Lowercase browse topics assigned by the author. */
  topics?: string[];
  /** True when this is the story the public demo serves. */
  isPublicDemo?: boolean;
  /** PUBLISHED means it is in the student-facing library. */
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** The course slot it fills, or null when it stands on its own. */
  moduleItem?: { id: string; title: string; status: string } | null;
  cover: StoryAsset | null;
  chapters: StoryChapter[];
  characters: { id: string; name: string; description: string | null }[];
}

/** What comes back from a question. */
export interface AgentReply {
  conversationId: string;
  /** What we heard, so the child can see their own words. */
  childText: string;
  replyText: string;
  /** Base64; spoken once and not stored, so it rides in the response. */
  replyAudio: string | null;
  replyAudioMimeType: string | null;
  /** Null for a signed-in child — only the public demo is capped. */
  turnsRemaining: number | null;
}

/** Everything a question needs, minus who is asking — the caller supplies that. */
export interface AskPayload {
  releaseId?: string;
  text?: string;
  audio?: string;
  audioMimeType?: string;
  conversationId?: string;
  segmentId?: string;
  speak?: boolean;
}

/** Row shape for the authoring list. Counts, not content. */
export interface StorySummary {
  id: string;
  title: string;
  synopsis: string | null;
  topics?: string[];
  gradeBand: string | null;
  isPublicDemo: boolean;
  updatedAt: string;
  moduleItem: { id: string; title: string; status: string } | null;
  chapterCount: number;
  segmentCount: number;
  narratedCount: number;
}

/** What the model proposes from pasted prose. Nothing is saved until accepted. */
export interface DraftSegment {
  text: string;
  narrationText: string | null;
}

export interface StoryDraft {
  title: string;
  synopsis: string;
  characters: { name: string; description: string }[];
  chapters: { title: string; segments: DraftSegment[] }[];
  /** Tagged lines discarded for not matching their own words. */
  droppedNarrationCount: number;
}

/**
 * A card in the student-facing library. Content-free on purpose — the list
 * shows dozens of stories and none of their text, so the payload carries what
 * a cover needs and nothing else.
 */
export interface StoryLibraryItem {
  id: string;
  title: string;
  synopsis: string | null;
  topics?: string[];
  gradeBand: string | null;
  coverUrl: string | null;
  pageCount: number;
  narrated: boolean;
}
