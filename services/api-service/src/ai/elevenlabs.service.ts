import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Text-to-speech. Direct HTTP rather than the SDK, matching ExpoPushService,
 * and degrading rather than throwing at construction, matching StripeService.
 *
 * Chosen over the model provider's own TTS for one measured reason: a single
 * narration line comes back in roughly 0.5–0.9s here against 12–15s there.
 * Pre-generated narration would not care, but the agent answers a child in
 * real time, and a fifteen-second pause is not a conversation.
 */

const API_ROOT = 'https://api.elevenlabs.io/v1';

/**
 * Alice — "Clear, Engaging Educator", British female, premade.
 *
 * The voice we actually want is Sophia (jB2lPb5DhAX6l1TLkKXy) — British,
 * smooth, engaging — but she is a `professional` library voice, and the API
 * refuses those on a free plan with 402 paid_plan_required. Alice is the
 * closest premade equivalent and needs no plan. Once the account is upgraded
 * this becomes a one-line change: set ELEVENLABS_VOICE_ID to Sophia's id.
 */
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? 'Xb7hH8MSUJpSbSDYk0k2';

/**
 * The low-latency model, used when someone is waiting for a reply.
 *
 * It cannot perform emotion markup: given "[excited] She ran" it says the word
 * "excited" out loud. Measured, that tagged line ran 2.1s longer than the same
 * line untagged — the tags being read, not performed.
 */
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_turbo_v2_5';

/**
 * The expressive model, used for narration. It consumes inline tags as
 * direction rather than speaking them, at roughly 3.8s a line against turbo's
 * 0.4s — which does not matter for audio generated once, ahead of time.
 */
const EXPRESSIVE_MODEL_ID =
  process.env.ELEVENLABS_EXPRESSIVE_MODEL_ID ?? 'eleven_v3';

/**
 * Constant-bitrate 128kbps MP3. The bitrate is load-bearing: it is what makes
 * the duration fallback below arithmetic rather than a guess.
 */
const OUTPUT_FORMAT = 'mp3_44100_128';
const OUTPUT_BITS_PER_SECOND = 128_000;

const REQUEST_TIMEOUT_MS = 30_000;

/** Provider's character-level alignment, stored as-is on the segment. */
export interface SpeechTimings {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface SpeechResult {
  audio: Buffer;
  mimeType: string;
  durationMs: number;
  /** Null when the provider returned no alignment for this request. */
  timings: SpeechTimings | null;
}

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private readonly apiKey: string | null;

  constructor() {
    const key = process.env.ELEVEN_LABS_API_KEY;
    if (!key) {
      this.logger.warn(
        'ELEVEN_LABS_API_KEY is not set — narration and spoken replies are ' +
          'disabled. Set ELEVEN_LABS_API_KEY to enable them.',
      );
      this.apiKey = null;
      return;
    }
    this.apiKey = key;
  }

  get isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /** The voice used when a story does not name its own. */
  get defaultVoiceId(): string {
    return DEFAULT_VOICE_ID;
  }

  async listVoices(search = '') {
    if (search.length > 100)
      throw new ServiceUnavailableException('Use a shorter voice search.');
    const key = this.requireKey();
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v2/voices?page_size=100&search=${encodeURIComponent(search)}`,
        {
          headers: { 'xi-api-key': key },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) throw new Error('Voice list unavailable');
      const data = (await response.json()) as {
        voices: { voice_id: string; name: string; preview_url?: string }[];
        has_more?: boolean;
      };
      if (!Array.isArray(data.voices)) throw new Error('Invalid voice list');
      return {
        defaultVoiceId: DEFAULT_VOICE_ID,
        hasMore: Boolean(data.has_more),
        voices: data.voices.map((v) => ({
          id: v.voice_id,
          name: v.name,
          previewUrl: v.preview_url?.startsWith('https://')
            ? v.preview_url
            : null,
        })),
      };
    } catch {
      throw new ServiceUnavailableException(
        'Narrator voices could not be loaded. Please retry.',
      );
    }
  }

  /**
   * Uses the `/with-timestamps` variant even though the plain endpoint is
   * simpler, because the alignment it returns is not recoverable later: it is
   * how the reader knows which word is being spoken, and it is the hook the
   * planned scene changes and camera moves will key off. Fetching it now costs
   * nothing extra; regenerating audio to get it later would cost the synthesis
   * twice and return different audio.
   */
  async synthesize(params: {
    text: string;
    voiceId?: string;
    /** Selects the model that performs emotion markup instead of reading it. */
    expressive?: boolean;
  }): Promise<SpeechResult> {
    const key = this.requireKey();
    const voiceId = params.voiceId || DEFAULT_VOICE_ID;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${API_ROOT}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${OUTPUT_FORMAT}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': key,
            'Content-Type': 'application/json',
          },
          // JSON.stringify produces a UTF-8 string; the fetch body encodes it
          // as UTF-8. Building this payload by hand in a shell is what makes
          // the API reject curly quotes and dashes as invalid_unicode.
          body: JSON.stringify({
            text: params.text,
            model_id: params.expressive ? EXPRESSIVE_MODEL_ID : MODEL_ID,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        // 402 is the one worth naming: it means the voice is a library voice
        // and the account is on the free plan, which is a billing decision
        // rather than a bug, and the log should say so.
        const hint =
          response.status === 402
            ? ` — voice ${voiceId} needs a paid plan; set ELEVENLABS_VOICE_ID to a premade voice`
            : '';
        this.logger.error(
          `Speech synthesis failed: ${response.status}${hint} ${detail.slice(0, 200)}`,
        );
        throw new ServiceUnavailableException(
          'The narrator is unavailable right now',
        );
      }

      const body = await response.json();
      const audio = Buffer.from(body.audio_base64, 'base64');
      const timings = ElevenLabsService.readTimings(body.alignment);

      return {
        audio,
        mimeType: 'audio/mpeg',
        durationMs: ElevenLabsService.durationOf(timings, audio),
        timings,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const reason =
        (error as Error)?.name === 'AbortError'
          ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
          : (error as Error)?.message;
      this.logger.error(`Speech synthesis request failed: ${reason}`);
      throw new ServiceUnavailableException(
        'The narrator is unavailable right now',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private requireKey(): string {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'The narrator is not configured on this server',
      );
    }
    return this.apiKey;
  }

  private static readTimings(alignment: any): SpeechTimings | null {
    if (
      !Array.isArray(alignment?.characters) ||
      !Array.isArray(alignment?.character_end_times_seconds)
    ) {
      return null;
    }
    return {
      characters: alignment.characters,
      character_start_times_seconds:
        alignment.character_start_times_seconds ?? [],
      character_end_times_seconds: alignment.character_end_times_seconds,
    };
  }

  /**
   * The alignment's last end-time is the exact duration. Without it, the
   * constant bitrate makes the arithmetic exact enough: bytes to seconds at a
   * known bits-per-second. A variable-bitrate format would need real frame
   * parsing, which is why OUTPUT_FORMAT is pinned to a CBR one.
   */
  private static durationOf(
    timings: SpeechTimings | null,
    audio: Buffer,
  ): number {
    const ends = timings?.character_end_times_seconds;
    if (ends?.length) {
      return Math.round(ends[ends.length - 1] * 1000);
    }
    return Math.round((audio.length * 8 * 1000) / OUTPUT_BITS_PER_SECOND);
  }
}
