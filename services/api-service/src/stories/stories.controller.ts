import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { StoriesService } from './stories.service';
import type { StoryAccess } from './stories.service';
import { NarrationService } from './narration.service';
import { StoryAgentService } from './story-agent.service';
import { StoryDraftService } from './story-draft.service';
import { AskStoryDto, DraftStoryDto, NarrateStoryDto } from './dto/agent.dto';
import { EntitlementsService } from '../entitlements/entitlements.service';
import {
  ACTING_STUDENT_HEADER,
  ActingStudentService,
} from '../entitlements/acting-student.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUserDto } from '../auth/dto/current-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateAssetDto,
  CreateChapterDto,
  CreateCharacterDto,
  CreateSegmentDto,
  AttachStoryDto,
  CreateStoryDto,
  ImportStoryDto,
  PublicDemoDto,
  StoryStatusDto,
  ReorderDto,
  SplitSegmentDto,
  UpdateChapterDto,
  UpdateSegmentDto,
  UpdateStoryDto,
  UploadArtworkDto,
} from './dto/story.dto';

/**
 * Authoring is staff-only; reading is gated by the same entitlement check
 * every other piece of course content goes through. A story is content a family
 * bought, so it must not be reachable just because its id was guessed.
 */
@Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER', 'USER', 'GUARDIAN')
@Controller('stories')
@UseGuards(RolesGuard)
export class StoriesController {
  constructor(
    private readonly stories: StoriesService,
    private readonly narration: NarrationService,
    private readonly agent: StoryAgentService,
    private readonly drafts: StoryDraftService,
    private readonly entitlements: EntitlementsService,
    private readonly actingStudent: ActingStudentService,
  ) {}

  /**
   * The read gate, in one place — every media and agent route goes through it.
   *
   * Three cases, because a story can be reached three ways:
   *   published        anyone signed in may read it; the library is free
   *   in a course      the course's entitlement check decides, as before
   *   neither          unfinished and unattached, so staff only
   */
  private async assertCanRead(
    user: CurrentUserDto,
    access: StoryAccess,
    actingStudentId?: string,
  ) {
    if (access.status === 'PUBLISHED') return;

    if (!access.moduleItemId) {
      // The editor previews through these same media routes. Match its
      // existing author roles without opening unpublished content to readers.
      if (
        user.roles.some((role) =>
          ['SUPER_ADMIN', 'ADMIN', 'TEACHER'].includes(role),
        )
      ) {
        return;
      }
      throw new ForbiddenException('This story has not been published');
    }

    const allowed = await this.entitlements.canAccessModuleItem(
      user.id,
      user.roles,
      access.moduleItemId,
      actingStudentId,
    );
    if (!allowed) {
      throw new ForbiddenException('This story is not part of your courses');
    }
  }

  /** Streams local bytes or redirects to a signed URL, per storage backend. */
  private sendMedia(
    file:
      | { kind: 'redirect'; url: string; mimetype: string }
      | { kind: 'stream'; body: Buffer; mimetype: string },
    res: Response,
  ) {
    if (file.kind === 'redirect') {
      return res.redirect(file.url);
    }
    res.setHeader('Content-Type', file.mimetype);
    // Lets the browser seek within narration instead of refetching it whole,
    // which is what an <audio> scrubber does on every drag.
    res.setHeader('Accept-Ranges', 'bytes');
    return res.send(file.body);
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  /**
   * The player's entry point: the module item is what the catalog links to, and
   * what the entitlement check is expressed in terms of.
   */
  @Get('by-module-item/:moduleItemId')
  async readByModuleItem(
    @Param('moduleItemId') moduleItemId: string,
    @CurrentUser() user: CurrentUserDto,
    @Headers(ACTING_STUDENT_HEADER) actingStudentId?: string,
  ) {
    const allowed = await this.entitlements.canAccessModuleItem(
      user.id,
      user.roles,
      moduleItemId,
      actingStudentId,
    );
    if (!allowed) {
      throw new ForbiddenException('This story is not part of your courses');
    }
    return this.stories.findByModuleItem(moduleItemId);
  }

  /**
   * The authoring list. Declared before ':id' so the literal path wins — Nest
   * matches in declaration order, and 'stories/all' would otherwise be read as
   * a story whose id is "all".
   */
  @Get('all')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  findAll() {
    return this.stories.findAll();
  }

  /**
   * The story library: published stories, readable by any signed-in child
   * whether or not they own a course. Also before ':id'.
   */
  @Get('library')
  library(@Query('topic') topic?: string) {
    return this.stories.findPublished(topic);
  }

  /**
   * Opens a library story. Separate from ':id' below rather than relaxing that
   * one, because they answer different questions: ':id' is the authoring view
   * of any story in any state, this is the reading view of one a child is
   * allowed to read. Both return the same shape, so the reader does not care
   * which it came from — but only this one runs the read gate, and only this
   * one lets a USER through.
   */
  @Get('library/:id')
  async libraryStory(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserDto,
    @Headers(ACTING_STUDENT_HEADER) actingStudentId?: string,
  ) {
    const access = await this.stories.accessForStory(id);
    await this.assertCanRead(user, access, actingStudentId);
    return this.stories.readerStory(id);
  }

  /** Staff-only by id, for the authoring screens. */
  @Get('narrator-voices')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  voices(@Query('search') search?: string) {
    return this.narration.listVoices(search);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  findOne(@Param('id') id: string) {
    return this.stories.findOne(id);
  }

  // ─── Media ────────────────────────────────────────────────────────────────

  @Get('releases/:releaseId/assets/:assetId/file')
  async releaseArtwork(
    @Param('releaseId') releaseId: string,
    @Param('assetId') assetId: string,
    @CurrentUser() user: CurrentUserDto,
    @Res() res: Response,
    @Headers(ACTING_STUDENT_HEADER) actingStudentId?: string,
  ) {
    return this.releaseFile(
      releaseId,
      assetId,
      'asset',
      user,
      res,
      actingStudentId,
    );
  }

  @Get('releases/:releaseId/segments/:segmentId/narration')
  async releaseNarration(
    @Param('releaseId') releaseId: string,
    @Param('segmentId') segmentId: string,
    @CurrentUser() user: CurrentUserDto,
    @Res() res: Response,
    @Headers(ACTING_STUDENT_HEADER) actingStudentId?: string,
  ) {
    return this.releaseFile(
      releaseId,
      segmentId,
      'narration',
      user,
      res,
      actingStudentId,
    );
  }

  private async releaseFile(
    releaseId: string,
    id: string,
    kind: 'asset' | 'narration',
    user: CurrentUserDto,
    res: Response,
    actingStudentId?: string,
  ) {
    const media = await this.stories.releaseMedia(releaseId, id, kind);
    await this.assertCanRead(
      user,
      await this.stories.accessForStory(media.storyId),
      actingStudentId,
    );
    return this.sendMedia(await this.narration.readMediaKey(media.key), res);
  }

  /**
   * Narration audio. Served through the API rather than handed out as a storage
   * URL so that entitlement is checked on every request, and so the same URL
   * works whichever backend is configured — local disk cannot sign at all, and
   * S3 can, which is why sendMedia handles both a stream and a redirect.
   *
   * Entitlement is checked against the owning module item on every request —
   * the audio is the content, so an unguarded media route would be a way to
   * read a paid story without paying for it.
   */
  @Get('segments/:segmentId/narration')
  async narrationAudio(
    @Param('segmentId') segmentId: string,
    @CurrentUser() user: CurrentUserDto,
    @Res() res: Response,
    @Headers(ACTING_STUDENT_HEADER) actingStudentId?: string,
  ) {
    const access = await this.stories.accessForSegment(segmentId);
    await this.assertCanRead(user, access, actingStudentId);
    if (
      !user.roles.some((role) =>
        ['SUPER_ADMIN', 'ADMIN', 'TEACHER'].includes(role),
      )
    ) {
      const media = await this.stories.currentMedia(
        access.id,
        segmentId,
        'narration',
      );
      if (media)
        return this.sendMedia(
          await this.narration.readMediaKey(media.key),
          res,
        );
    }
    return this.sendMedia(await this.narration.readNarration(segmentId), res);
  }

  /** Artwork and other story assets, gated the same way. */
  @Get('assets/:assetId/file')
  async assetFile(
    @Param('assetId') assetId: string,
    @CurrentUser() user: CurrentUserDto,
    @Res() res: Response,
    @Headers(ACTING_STUDENT_HEADER) actingStudentId?: string,
  ) {
    const access = await this.stories.accessForAsset(assetId);
    await this.assertCanRead(user, access, actingStudentId);
    if (
      !user.roles.some((role) =>
        ['SUPER_ADMIN', 'ADMIN', 'TEACHER'].includes(role),
      )
    ) {
      const media = await this.stories.currentMedia(
        access.id,
        assetId,
        'asset',
      );
      if (media)
        return this.sendMedia(
          await this.narration.readMediaKey(media.key),
          res,
        );
    }
    return this.sendMedia(await this.narration.readAsset(assetId), res);
  }

  // ─── Narration ────────────────────────────────────────────────────────────

  /**
   * Generates the missing narration for a story. Staff-only and deliberately
   * synchronous: it is an authoring action someone triggers and waits on, and a
   * job queue for something run a handful of times a week would be machinery
   * without a reason.
   */
  @Post(':id/narrate')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  narrate(@Param('id') id: string, @Body() dto: NarrateStoryDto) {
    return this.narration.narrateStory(id, { force: dto.force });
  }

  @Post('segments/:segmentId/narrate')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  narrateSegment(@Param('segmentId') segmentId: string) {
    return this.narration.narrateSegment(segmentId);
  }

  // ─── Voice agent ──────────────────────────────────────────────────────────

  /**
   * A question about the story, asked by a child who is entitled to read it.
   * Uncapped for signed-in users: they are inside a paid course, and the cost
   * is already covered by the thing they bought. The public demo is where the
   * caps live.
   */
  @Post(':id/ask')
  async ask(
    @Param('id') id: string,
    @Body() dto: AskStoryDto,
    @CurrentUser() user: CurrentUserDto,
    @Headers(ACTING_STUDENT_HEADER) actingStudentId?: string,
  ) {
    const access = await this.stories.accessForStory(id);
    await this.assertCanRead(user, access, actingStudentId);

    return this.agent.ask({
      storyId: id,
      studentProfileId: await this.actingStudent.resolve(
        user.id,
        actingStudentId,
      ),
      demoSessionId: null,
      conversationId: dto.conversationId,
      segmentId: dto.segmentId,
      releaseId: dto.releaseId,
      text: dto.text,
      audio: dto.audio
        ? {
            buffer: Buffer.from(dto.audio, 'base64'),
            mimeType: dto.audioMimeType ?? 'audio/webm',
          }
        : undefined,
      speak: dto.speak,
    });
  }

  // ─── Authoring ────────────────────────────────────────────────────────────

  /**
   * Splits pasted prose into chapters, pages and emotion markup, and returns it
   * without writing anything.
   *
   * Nothing is persisted on purpose: a model splitting someone's writing at the
   * wrong beat is a normal outcome, and the fix is an author looking at it
   * before it becomes rows. The editor posts the reviewed result to /import.
   */
  @Post('draft')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  // Each call is a model request against a small daily allowance, and drafting
  // is a deliberate action — nobody needs to do it twenty times a minute.
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  draft(@Body() dto: DraftStoryDto) {
    return this.drafts.draftFromProse({ source: dto.source, title: dto.title });
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  create(@Body() dto: CreateStoryDto) {
    return this.stories.create(dto);
  }

  /**
   * Puts a story into a course chapter, or takes it back out. Separate from
   * creation because where a story is used is a decision that changes over its
   * life, and the same story may be written long before anyone knows.
   */
  @Post(':id/attach')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  attach(@Param('id') id: string, @Body() dto: AttachStoryDto) {
    return this.stories.attach(id, dto.moduleItemId);
  }

  @Post(':id/detach')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  detach(@Param('id') id: string) {
    return this.stories.detach(id);
  }

  /**
   * Chooses the story the public demo shows. Setting one clears any other, so
   * the badge in the list always names the story a visitor actually reaches.
   */
  @Patch(':id/public-demo')
  @Roles('SUPER_ADMIN', 'ADMIN')
  publicDemo(@Param('id') id: string, @Body() dto: PublicDemoDto) {
    return this.stories.setPublicDemo(id, dto.isPublicDemo);
  }

  /** Publishes to the library, or withdraws from it. */
  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  setStatus(@Param('id') id: string, @Body() dto: StoryStatusDto) {
    return this.stories.setStatus(id, dto.status);
  }

  @Post('import')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  import(@Body() dto: ImportStoryDto) {
    return this.stories.import(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  update(@Param('id') id: string, @Body() dto: UpdateStoryDto) {
    return this.stories.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.stories.remove(id);
  }

  @Post(':id/chapters')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  addChapter(@Param('id') id: string, @Body() dto: CreateChapterDto) {
    return this.stories.addChapter(id, dto);
  }

  @Post(':id/chapters/reorder')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  reorderChapters(@Param('id') id: string, @Body() dto: ReorderDto) {
    return this.stories.reorderChapters(id, dto);
  }

  @Patch('chapters/:chapterId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  updateChapter(
    @Param('chapterId') chapterId: string,
    @Body() dto: UpdateChapterDto,
  ) {
    return this.stories.updateChapter(chapterId, dto);
  }

  @Delete('chapters/:chapterId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  removeChapter(@Param('chapterId') chapterId: string) {
    return this.stories.removeChapter(chapterId);
  }

  @Post('chapters/:chapterId/segments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  addSegment(
    @Param('chapterId') chapterId: string,
    @Body() dto: CreateSegmentDto,
  ) {
    return this.stories.addSegment(chapterId, dto);
  }

  @Post('chapters/:chapterId/segments/reorder')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  reorderSegments(
    @Param('chapterId') chapterId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.stories.reorderSegments(chapterId, dto);
  }

  @Patch('segments/:segmentId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  updateSegment(
    @Param('segmentId') segmentId: string,
    @Body() dto: UpdateSegmentDto,
  ) {
    return this.stories.updateSegment(segmentId, dto);
  }

  /**
   * Joins a section into the one above it. The fix for a story chunked more
   * finely than it should have been.
   */
  @Post('segments/:segmentId/merge-up')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  mergeSegmentUp(@Param('segmentId') segmentId: string) {
    return this.stories.mergeSegmentUp(segmentId);
  }

  /** Breaks one section into two at a character offset. */
  @Post('segments/:segmentId/split')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  splitSegment(
    @Param('segmentId') segmentId: string,
    @Body() dto: SplitSegmentDto,
  ) {
    return this.stories.splitSegment(segmentId, dto.at);
  }

  @Delete('segments/:segmentId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  removeSegment(@Param('segmentId') segmentId: string) {
    return this.stories.removeSegment(segmentId);
  }

  @Post(':id/assets')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  addAsset(@Param('id') id: string, @Body() dto: CreateAssetDto) {
    return this.stories.addAsset(id, dto);
  }

  @Post(':id/artwork')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  uploadArtwork(
    @Param('id') id: string,
    @Body() dto: UploadArtworkDto,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    return this.stories.uploadArtwork(id, dto, file);
  }

  @Delete('assets/:assetId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  removeAsset(@Param('assetId') assetId: string) {
    return this.stories.removeAsset(assetId);
  }

  @Post(':id/characters')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  addCharacter(@Param('id') id: string, @Body() dto: CreateCharacterDto) {
    return this.stories.addCharacter(id, dto);
  }

  @Delete('characters/:characterId')
  @Roles('SUPER_ADMIN', 'ADMIN', 'TEACHER')
  removeCharacter(@Param('characterId') characterId: string) {
    return this.stories.removeCharacter(characterId);
  }
}
