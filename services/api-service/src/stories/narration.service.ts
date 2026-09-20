import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpeechService } from '../ai/speech.service';
import { UploadsService } from '../uploads/uploads.service';
import { ACTIVE_STORAGE_PROVIDER } from '../uploads/storage.provider';
// `import type` because it is an interface referenced in a decorated
// constructor: with emitDecoratorMetadata a value import would emit a runtime
// reference to something that does not exist after compilation.
import type { StorageProvider } from '../uploads/storage.provider';
import {
  narrationMatchesText,
  remapTimings,
  stripNarrationTags,
} from './narration-text';

/**
 * Turns written segments into narrated audio, once, ahead of time.
 *
 * Narration is generated rather than streamed on demand because it never
 * changes between readings: the same words produce the same audio, so paying
 * for synthesis every time a child opens a story would be paying repeatedly for
 * an identical result. Generated audio is stored and reused; StoriesService
 * clears it when the words change, so a segment can never keep narration that
 * says something the page no longer says.
 */

const KEY_PREFIX = 'story-narration';

@Injectable()
export class NarrationService {
  private readonly logger = new Logger(NarrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly speech: SpeechService,
    private readonly uploads: UploadsService,
    @Inject(ACTIVE_STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  /**
   * Narrates every segment in the story that does not already have audio.
   *
   * Sequential rather than parallel on purpose: speech providers rate-limit,
   * and a story with forty segments fired at once is the request that gets the
   * key throttled. Slower here costs nothing — this is an authoring action, run
   * once, not something a reader waits on.
   */
  async narrateStory(
    storyId: string,
    options: { force?: boolean } = {},
  ): Promise<{
    generated: number;
    skipped: number;
    failed: number;
    provider: string | null;
  }> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: {
        chapters: {
          orderBy: { sortOrder: 'asc' },
          include: { segments: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!story) throw new NotFoundException('Story not found');

    const segments = story.chapters.flatMap((chapter) => chapter.segments);
    if (segments.length === 0) {
      throw new BadRequestException('This story has no segments to narrate');
    }

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    let provider: string | null = null;

    for (const segment of segments) {
      if (segment.narrationAudioKey && !options.force) {
        skipped++;
        continue;
      }
      try {
        const result = await this.narrateSegment(segment.id);
        provider = result.provider;
        generated++;
      } catch (error) {
        // One bad segment must not abandon the other thirty-nine. The failure
        // is counted and reported rather than thrown, so a partial run is
        // visible and re-runnable — the next call skips what already succeeded.
        failed++;
        this.logger.error(
          `Narration failed for segment ${segment.id}: ${(error as Error)?.message}`,
        );
      }
    }

    return { generated, skipped, failed, provider };
  }

  /** Narrates one segment, replacing any audio it already had. */
  async narrateSegment(
    segmentId: string,
  ): Promise<{ durationMs: number; provider: string }> {
    const segment = await this.prisma.storySegment.findUnique({
      where: { id: segmentId },
      include: { chapter: { include: { story: true } } },
    });
    if (!segment) throw new NotFoundException('Segment not found');

    const text = segment.text.trim();
    if (!text) {
      throw new BadRequestException('An empty segment has nothing to narrate');
    }

    /**
     * When the author has written a performed version, that is what gets
     * spoken — but only after proving it is the same words.
     *
     * Refusing here rather than narrating anyway is the whole guarantee: a
     * tagged line that has quietly drifted from the displayed text would give
     * a child audio saying one thing while the page shows another, and the
     * highlight would march along words that were never spoken.
     */
    const tagged = segment.narrationText?.trim() || null;
    if (tagged && !narrationMatchesText(tagged, text)) {
      throw new BadRequestException(
        'The performed narration does not match this segment’s words. ' +
          'Emotion tags may be added, but nothing else may change.',
      );
    }

    const voiceId = segment.chapter.story.narratorVoiceId ?? undefined;

    const spoken = await this.speech.synthesize({
      text: tagged ?? text,
      voiceId,
      // Only worth the slower model when there is something to perform.
      expressive: Boolean(tagged),
    });

    // The provider aligned its timings against the tagged string, so they are
    // re-indexed onto the words actually on the page before being stored.
    const timings = (() => {
      if (!spoken.timings) return null;
      if (!tagged) return spoken.timings;
      const { display, indexMap } = stripNarrationTags(tagged);
      return remapTimings(spoken.timings, indexMap, display.length);
    })();

    const stored = await this.storage.uploadPrivateFile(
      {
        buffer: spoken.audio,
        // uploadPrivateFile takes the extension from originalname, so this
        // determines the stored key's suffix, not just a display label.
        originalname: `${segmentId}.${spoken.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`,
        mimetype: spoken.mimeType,
        size: spoken.audio.length,
      },
      KEY_PREFIX,
    );

    // Replacing narration leaves the previous object behind otherwise, and
    // nothing else will ever reference it.
    const previousKey = segment.narrationAudioKey;

    // Compare the generation input and previous recording in the write itself.
    // A separate re-read would still allow an edit between checking and saving.
    const saved = await this.prisma.storySegment.updateMany({
      where: {
        id: segmentId,
        updatedAt: segment.updatedAt,
        text: segment.text,
        narrationText: segment.narrationText,
        narrationAudioKey: previousKey,
        chapter: {
          story: { narratorVoiceId: segment.chapter.story.narratorVoiceId },
        },
      },
      data: {
        narrationAudioKey: stored.key,
        narrationDurationMs: spoken.durationMs,
        narrationTimings: timings ? { ...timings } : Prisma.DbNull,
      },
    });

    if (saved.count === 0) {
      await this.storage
        .deleteFile(stored.key, stored.bucket)
        .catch((error) =>
          this.logger.warn(
            `Could not remove discarded narration ${stored.key}: ${error?.message}`,
          ),
        );
      throw new ConflictException(
        'This section changed while narration was being generated. Refresh and try again.',
      );
    }

    // Published editions and concurrent publication can reference previousKey.
    // Retain superseded recordings until release-aware garbage collection.

    return { durationMs: spoken.durationMs, provider: spoken.provider };
  }

  /**
   * Hands back the audio for a segment the caller has already been authorised
   * to read. Same two shapes as every other private file in the system.
   */
  async readNarration(segmentId: string) {
    const segment = await this.prisma.storySegment.findUnique({
      where: { id: segmentId },
      select: { narrationAudioKey: true },
    });
    if (!segment?.narrationAudioKey) {
      throw new NotFoundException('This segment has no narration');
    }

    return this.uploads.readPrivateByKey(
      segment.narrationAudioKey,
      segment.narrationAudioKey.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
    );
  }

  /** Same, for a story asset — artwork, backgrounds, author-supplied audio. */
  async readAsset(assetId: string) {
    const asset = await this.prisma.storyAsset.findUnique({
      where: { id: assetId },
      select: { storageKey: true, kind: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');

    return this.uploads.readPrivateByKey(
      asset.storageKey,
      NarrationService.mimeOf(asset.storageKey, asset.kind),
    );
  }

  readMediaKey(key: string) {
    return this.uploads.readPrivateByKey(
      key,
      NarrationService.mimeOf(key, 'ILLUSTRATION'),
    );
  }

  listVoices(search?: string) {
    return this.speech.listVoices(search);
  }

  /**
   * Storage keys keep their original extension, so the extension is the best
   * signal available; the asset kind only narrows the fallback.
   */
  private static mimeOf(key: string, kind: string): string {
    const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
    const byExtension: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
    };
    return (
      byExtension[ext] ??
      (kind === 'AUDIO' ? 'application/octet-stream' : 'image/png')
    );
  }
}
