import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Mirrors StoryAgentService's own cap, so oversized input is rejected before
 *  it reaches a paid model call rather than after. */
const MAX_QUESTION_CHARS = 500;

export class AskStoryDto {
  @IsUUID()
  @IsOptional()
  releaseId?: string;

  /**
   * The question as text. Either this or `audio` must be present; audio wins
   * when both are, because a client that recorded something meant to send it.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_QUESTION_CHARS)
  @IsOptional()
  text?: string;

  /** Base64 recording from the microphone, with its mime type. */
  @IsString()
  @IsOptional()
  audio?: string;

  @IsString()
  @IsOptional()
  audioMimeType?: string;

  /** Continues an existing conversation; omitted starts a new one. */
  @IsUUID()
  @IsOptional()
  conversationId?: string;

  /**
   * Where the child has read to. Bounds what the agent is allowed to know, so
   * it cannot answer with something from a chapter they have not reached.
   */
  @IsUUID()
  @IsOptional()
  segmentId?: string;

  /** False returns text only — useful when the client is muted. */
  @IsBoolean()
  @IsOptional()
  speak?: boolean;
}

export class AskDemoStoryDto extends AskStoryDto {
  /**
   * Identifies an anonymous visitor across requests so their demo conversation
   * holds together. Client-generated and unauthenticated — it is a continuity
   * token, never a credential, and it grants nothing beyond the demo caps.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  demoSessionId: string;
}

export class DraftStoryDto {
  /** The story as written, pasted whole. Split and tagged, never rewritten. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  source: string;

  /** Used when the prose does not carry its own title. */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;
}

export class NarrateStoryDto {
  /** Re-narrates segments that already have audio, for a voice change. */
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}
