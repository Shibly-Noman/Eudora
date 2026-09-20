import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CatalogStatus, GradeBand, StoryAssetKind } from '@prisma/client';

export class AttachStoryDto {
  /** A STORY slot in a course chapter, not already filled. */
  @IsUUID()
  moduleItemId: string;
}

export class PublicDemoDto {
  /** True makes this the one story the public demo shows, clearing any other. */
  @IsBoolean()
  isPublicDemo: boolean;
}

export class StoryStatusDto {
  /** PUBLISHED puts the story in the library; DRAFT withdraws it. */
  @IsEnum(CatalogStatus)
  status: CatalogStatus;
}

export class CreateStoryDto {
  /**
   * The ModuleItem slot this story fills, if it is going into a course now.
   * Optional — a story is written first and placed later, if ever.
   */
  @IsUUID()
  @IsOptional()
  moduleItemId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  synopsis?: string;

  @IsEnum(GradeBand)
  @IsOptional()
  gradeBand?: GradeBand;

  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  @IsOptional()
  topics?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  agentGuidance?: string;
}

export class UpdateStoryDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  narratorVoiceId?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  synopsis?: string;

  @IsEnum(GradeBand)
  @IsOptional()
  gradeBand?: GradeBand;

  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  @IsOptional()
  topics?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  agentGuidance?: string;

  /** Must already be an asset on this story. */
  @IsUUID()
  @IsOptional()
  coverAssetId?: string | null;
}

export class CreateChapterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  /** Appended to the end when omitted. */
  @IsInt()
  @Min(1)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateChapterDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  sortOrder?: number;
}

export class CreateSegmentDto {
  /**
   * One paragraph or beat. Kept as its own row rather than a slice of chapter
   * text because narration is generated per segment and playback position maps
   * back to it — that mapping is what later drives illustration changes.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  text: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateSegmentDto {
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  text?: string;

  /**
   * The performed version. Send null to clear it and have the line read plain.
   */
  @IsString()
  @IsOptional()
  @MaxLength(6000)
  narrationText?: string | null;

  @IsInt()
  @Min(1)
  @IsOptional()
  sortOrder?: number;
}

export class SplitSegmentDto {
  /** Character offset into the section text where the break goes. */
  @IsInt()
  @Min(1)
  at: number;
}

/** Reordering is a whole-list operation, so a partial list cannot leave gaps. */
export class ReorderDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  ids: string[];
}

export class CreateAssetDto {
  @IsEnum(StoryAssetKind)
  @IsOptional()
  kind?: StoryAssetKind;

  /** Storage key from an upload; never a URL — signed URLs expire. */
  @IsString()
  @IsNotEmpty()
  storageKey: string;

  /** Required: stories are read by children who may use a screen reader. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  altText: string;

  /** Bind to a segment to make this the art shown while that beat narrates. */
  @IsUUID()
  @IsOptional()
  segmentId?: string | null;

  @IsInt()
  @Min(1)
  @IsOptional()
  sortOrder?: number;
}

export class UploadArtworkDto {
  @IsIn(['COVER', 'SECTION'])
  purpose: 'COVER' | 'SECTION';

  @IsUUID()
  @IsOptional()
  segmentId?: string;

  @IsIn(['ILLUSTRATION', 'BACKGROUND'])
  kind: 'ILLUSTRATION' | 'BACKGROUND';

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  altText: string;
}

export class CreateCharacterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  sortOrder?: number;
}

/** Bulk-authoring shape, so a whole story arrives in one call. */
export class ImportSegmentDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  /**
   * The same words carrying emotion markup for the narrator. Optional, and
   * validated at narration time rather than here: stripping the tags must
   * reproduce `text` exactly, which is a rule about the pair, not the field.
   */
  @IsString()
  @IsOptional()
  narrationText?: string;
}

export class ImportChapterDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  /**
   * Accepts either a bare string per segment or the fuller shape above, so the
   * plain-text import that predates emotion markup keeps working unchanged.
   *
   * The transform builds the instances itself instead of leaving that to
   * `@Type`: when both decorators are present the transform replaces the value
   * and `@Type` never runs, so nested validation would be handed plain objects
   * with no class metadata and would reject every one of them.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((segment: unknown) =>
          plainToInstance(
            ImportSegmentDto,
            typeof segment === 'string' ? { text: segment } : segment,
          ),
        )
      : value,
  )
  segments: ImportSegmentDto[];
}

export class ImportStoryDto {
  /** Optional, same as CreateStoryDto — a story need not go into a course. */
  @IsUUID()
  @IsOptional()
  moduleItemId?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  synopsis?: string;

  @IsEnum(GradeBand)
  @IsOptional()
  gradeBand?: GradeBand;

  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  @IsOptional()
  topics?: string[];

  @IsString()
  @IsOptional()
  agentGuidance?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportChapterDto)
  chapters: ImportChapterDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCharacterDto)
  @IsOptional()
  characters?: CreateCharacterDto[];
}
