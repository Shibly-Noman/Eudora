import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { GeminiService } from '../ai/gemini.service';
import { narrationMatchesText, stripNarrationTags } from './narration-text';

/**
 * Turns pasted prose into a story someone can review, edit and narrate.
 *
 * This exists because the alternative is asking an author to hand-split a story
 * into a JSON array of segments and hand-place emotion tags, which is the sort
 * of task that stops a story library from ever reaching a second story.
 *
 * Nothing here is written to the database. The model proposes a structure, the
 * author corrects it, and only then is it imported — because a model splitting
 * someone's writing at the wrong beat is a normal outcome, not an error, and
 * the fix is a person looking at it rather than a better prompt.
 */

/** A whole story, pasted. Long enough for a picture book, not a novel. */
const MAX_SOURCE_CHARS = 20_000;

const generatedDraftSchema = z.object({
  title: z.string().nullish(),
  synopsis: z.string().nullish(),
  chapters: z.array(
    z.object({
      title: z.string().nullish(),
      segments: z.array(
        z.object({
          text: z.string(),
          narrationText: z.string().nullish(),
        }),
      ),
    }),
  ),
  characters: z
    .array(z.object({ name: z.string(), description: z.string().nullish() }))
    .nullish(),
});

export interface DraftSegment {
  text: string;
  /** The same words with emotion markup, or null if plain delivery suits. */
  narrationText: string | null;
}

export interface DraftChapter {
  title: string;
  segments: DraftSegment[];
}

export interface StoryDraft {
  title: string;
  synopsis: string;
  characters: { name: string; description: string }[];
  chapters: DraftChapter[];
  /**
   * Segments where the model's tagged version did not strip back to the plain
   * text, and was therefore discarded. Surfaced rather than hidden so the
   * author knows those lines will be read flat.
   */
  droppedNarrationCount: number;
}

@Injectable()
export class StoryDraftService {
  private readonly logger = new Logger(StoryDraftService.name);

  constructor(private readonly gemini: GeminiService) {}

  async draftFromProse(params: {
    source: string;
    title?: string;
  }): Promise<StoryDraft> {
    const source = params.source.trim();
    if (!source) {
      throw new BadRequestException('Paste a story first');
    }
    if (source.length > MAX_SOURCE_CHARS) {
      throw new BadRequestException(
        `That story is longer than this can handle (${MAX_SOURCE_CHARS} characters)`,
      );
    }

    const raw = await this.gemini.converse({
      systemInstruction: this.instruction(),
      userText: params.title
        ? `TITLE: ${params.title}\n\nSTORY:\n${source}`
        : `STORY:\n${source}`,
      /**
       * Deliberately far larger than the reply needs.
       *
       * The visible output for a short story is ~450 tokens, but the model
       * spent 2,578 on internal reasoning for the same request, and that spend
       * counts against this budget. It also varies run to run: the identical
       * prompt truncated once and succeeded a minute later. Truncation surfaces
       * only as "not valid JSON", which reads like a model failure rather than
       * a budget one, so the headroom is worth having. Nothing is billed for
       * room that goes unused.
       */
      maxOutputTokens: Math.min(60_000, 16_000 + source.length),
    });

    const draft = this.parse(raw, params.title);
    const proposedText = draft.chapters
      .flatMap((chapter) => chapter.segments.map((segment) => segment.text))
      .join(' ');
    // Paragraph breaks and page boundaries may change; words, punctuation,
    // and their order must not. Do not trust a prompt to enforce this contract.
    const normalizeWhitespace = (text: string) =>
      text.replace(/\s+/gu, ' ').trim();
    if (normalizeWhitespace(proposedText) !== normalizeWhitespace(source)) {
      throw new ServiceUnavailableException(
        'The prepared draft changed the original story. Your text has not been saved; try again.',
      );
    }
    return draft;
  }

  private instruction(): string {
    return [
      'You prepare children’s stories for narration. You are given prose and you',
      'return JSON. Return JSON only — no prose around it, no code fences.',
      '',
      'Shape:',
      '{"title":string,"synopsis":string,',
      ' "characters":[{"name":string,"description":string}],',
      ' "chapters":[{"title":string,"segments":[{"text":string,"narrationText":string|null}]}]}',
      '',
      'RULES:',
      '1. `text` must be taken VERBATIM from the story. Do not rewrite, shorten,',
      '   modernise, correct or improve a single word. Concatenating every `text`',
      '   in order must reproduce the original story exactly.',
      '2. Split into SECTIONS, not sentences. A section is a scene: a stretch',
      '   the narrator reads straight through without stopping, normally a',
      '   paragraph or two. Never split a section mid-scene, and never put a',
      '   single sentence in its own section unless the whole story is that',
      '   short. A short story may be ONE section — do not split one up just to',
      '   produce more of them.',
      '3. Group sections into chapters only when the story genuinely has parts.',
      '   Most stories are a single chapter.',
      '4. `narrationText` is `text` with emotion markup added for the narrator,',
      '   e.g. "[nervously] She looked at the puddle." Use it where the delivery',
      '   should change; use null where plain reading is right. Do not overuse it.',
      '   Removing every [tag] from `narrationText` must leave `text` EXACTLY —',
      '   same words, same punctuation. Add tags; change nothing else.',
      '5. Useful tags: [excited] [nervously] [sadly] [whispers] [laughs]',
      '   [curious] [gently] [proudly]. Place them before the words they affect.',
      '6. `synopsis` is one or two lines for a card. `characters` lists only those',
      '   who actually appear.',
    ].join('\n');
  }

  /**
   * Models wrap JSON in prose or fences no matter how firmly asked not to, so
   * the outermost braces are extracted rather than trusting the whole reply.
   */
  private parse(raw: string, fallbackTitle?: string): StoryDraft {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) {
      this.logger.error(
        `Draft reply contained no JSON object: ${raw.slice(0, 200)}`,
      );
      throw new ServiceUnavailableException(
        'The story could not be prepared — try again.',
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw.slice(start, end + 1));
    } catch {
      // Both ends, not the first 200 characters. The usual cause is the reply
      // being cut off mid-object, and a head-only log looks identical to a
      // malformed one — the tail is what tells them apart.
      this.logger.error(
        `Draft reply was not valid JSON (${raw.length} chars). ` +
          `Head: ${raw.slice(0, 120)} … Tail: ${raw.slice(-120)}`,
      );
      throw new ServiceUnavailableException(
        'The story could not be prepared — try again.',
      );
    }

    const result = generatedDraftSchema.safeParse(decoded);
    if (!result.success) {
      this.logger.warn(
        'Draft reply did not match the expected story structure',
      );
      throw new ServiceUnavailableException(
        'The story could not be prepared — try again.',
      );
    }
    const parsed = result.data;

    let dropped = 0;
    const chapters: DraftChapter[] = parsed.chapters
      .map((chapter, index) => ({
        title: (chapter.title ?? `Chapter ${index + 1}`).trim(),
        segments: chapter.segments
          .map((segment) => {
            const text = segment.text.trim();
            if (!text) return null;

            const tagged = segment.narrationText?.trim() ?? '';

            // The model is asked to add tags and change nothing else. When it
            // does change something, the performed version is dropped rather
            // than corrected: a silently reworded line is exactly the failure
            // the strip-and-compare rule exists to catch, and the segment still
            // reads correctly without it.
            if (tagged && !narrationMatchesText(tagged, text)) {
              dropped++;
              return { text, narrationText: null };
            }
            // Tags that strip to nothing new are noise; keep only real markup.
            const isPlain =
              !tagged || stripNarrationTags(tagged).display === tagged;
            return { text, narrationText: isPlain ? null : tagged };
          })
          .filter((segment): segment is DraftSegment => segment !== null),
      }))
      .filter((chapter: DraftChapter) => chapter.segments.length > 0);

    if (chapters.length === 0) {
      throw new ServiceUnavailableException(
        'The story could not be split into sections — try again.',
      );
    }

    return {
      title: (parsed.title ?? fallbackTitle ?? 'Untitled story').trim(),
      synopsis: (parsed.synopsis ?? '').trim(),
      characters: (parsed.characters ?? [])
        .map((c) => ({
          name: c.name.trim(),
          description: (c.description ?? '').trim(),
        }))
        .filter((c: { name: string }) => c.name),
      chapters,
      droppedNarrationCount: dropped,
    };
  }
}
