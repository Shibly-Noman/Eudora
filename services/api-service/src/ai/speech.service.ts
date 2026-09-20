import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ElevenLabsService, SpeechTimings } from './elevenlabs.service';
import { GeminiService } from './gemini.service';

/**
 * The single door callers knock on to turn text into speech. Everything above
 * this line asks for "a voice"; only this file knows which vendor answers.
 *
 * There are two providers rather than one because the account is on the free
 * ElevenLabs plan, which allows 10,000 characters a month. A single full story
 * is roughly that on its own, so the quota running out is the expected case,
 * not a failure to handle someday. When it does, synthesis falls back to the
 * model provider's slower TTS: the voice changes and a line takes ten seconds
 * or so instead of one, which is bad, but a public demo that keeps talking in
 * a worse voice beats one that stops talking.
 */

/**
 * Steers the fallback provider toward the same register as the primary voice.
 * It has no voice-library equivalent to Alice, so the accent and delivery have
 * to be described rather than selected.
 */
const FALLBACK_VOICE_NAME = process.env.GEMINI_VOICE_NAME ?? 'Aoede';
const FALLBACK_STYLE =
  'Read this aloud as a warm, smooth British storyteller reading to a small ' +
  'child. Gentle and engaging, at a normal, unhurried pace.';

export interface SpeechResult {
  audio: Buffer;
  mimeType: string;
  durationMs: number;
  /** Character-level timing, when the provider that answered supplies it. */
  timings: SpeechTimings | null;
  /** Which provider actually spoke — surfaced so callers can log the downgrade. */
  provider: 'elevenlabs' | 'gemini';
}

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);

  constructor(
    private readonly elevenLabs: ElevenLabsService,
    private readonly gemini: GeminiService,
  ) {}

  /** True when at least one provider can speak. */
  get isConfigured(): boolean {
    return this.elevenLabs.isConfigured || this.gemini.isConfigured;
  }

  get defaultVoiceId(): string {
    return this.elevenLabs.defaultVoiceId;
  }

  listVoices(search?: string) {
    return this.elevenLabs.listVoices(search);
  }

  async synthesize(params: {
    text: string;
    voiceId?: string;
    /**
     * Narration is expressive; a live reply is not. The fallback provider has
     * no equivalent, so a downgraded narration simply loses its performance.
     */
    expressive?: boolean;
  }): Promise<SpeechResult> {
    if (params.voiceId && !this.elevenLabs.isConfigured)
      throw new ServiceUnavailableException(
        'The selected narrator is unavailable. Configure ElevenLabs before generating narration.',
      );
    if (this.elevenLabs.isConfigured) {
      try {
        const result = await this.elevenLabs.synthesize(params);
        return { ...result, provider: 'elevenlabs' };
      } catch (error) {
        if (!this.gemini.isConfigured || params.voiceId) throw error;
        // Deliberately swallowed: the provider already logged why. What
        // matters here is that the downgrade is visible in the log, because
        // the symptom users report is "the voice changed", not "an error".
        this.logger.warn(
          'Falling back to the secondary speech provider — expect a different ' +
            'voice, no word timings, and a slower response.',
        );
      }
    }

    const spoken = await this.gemini.synthesizeSpeech({
      text: params.text,
      voiceName: FALLBACK_VOICE_NAME,
      styleDirection: FALLBACK_STYLE,
    });

    return { ...spoken, timings: null, provider: 'gemini' };
  }
}
