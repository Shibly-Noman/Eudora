import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { StoriesService } from './stories.service';
import { NarrationService } from './narration.service';
import { StoryAgentService } from './story-agent.service';
import { StoryDemoService } from './story-demo.service';
import { AskDemoStoryDto } from './dto/agent.dto';

/**
 * The unauthenticated storefront demo: a visitor can read a story, hear it, and
 * talk to it without an account. It exists because the product is impossible to
 * describe and obvious to experience.
 *
 * Everything here is deliberately narrow, because this is the only part of the
 * system a stranger can reach without signing in:
 *
 * - It serves only stories flagged `isPublicDemo`. A guessed id for a paid
 *   story returns 404 from these routes, so course content cannot leak through
 *   them even though they skip the entitlement check.
 * - Every answered question costs a model call and a paid synthesis, so turns
 *   are capped per conversation and globally per day (StoryAgentService), and
 *   the routes are rate-limited per IP on top.
 * - The demo session id a client sends is a continuity token, not a credential.
 *   It grants nothing except the ability to continue its own conversation, and
 *   it is worth nothing to forge.
 */
@Public()
@Controller('stories/demo')
export class StoryDemoController {
  constructor(
    private readonly stories: StoriesService,
    private readonly narration: NarrationService,
    private readonly agent: StoryAgentService,
    private readonly demo: StoryDemoService,
  ) {}

  /** The story on offer, with its chapters, art and narration URLs. */
  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async read() {
    const storyId = await this.demo.currentStoryId();
    if (!storyId) {
      throw new NotFoundException('No demo story is published right now');
    }
    // Media URLs must point at this controller's own public routes, not the
    // authenticated ones, or every play button 401s for a visitor.
    return this.stories.readerStory(storyId, '/api/stories/demo');
  }

  @Get('releases/:releaseId/segments/:segmentId/narration')
  async narrationAudio(
    @Param('releaseId') releaseId: string,
    @Param('segmentId') segmentId: string,
    @Res() res: Response,
  ) {
    return this.releaseFile(releaseId, segmentId, 'narration', res);
  }
  @Get('releases/:releaseId/assets/:assetId/file')
  async assetFile(
    @Param('releaseId') releaseId: string,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    return this.releaseFile(releaseId, assetId, 'asset', res);
  }
  private async releaseFile(
    releaseId: string,
    id: string,
    kind: 'asset' | 'narration',
    res: Response,
  ) {
    const media = await this.stories.releaseMedia(releaseId, id, kind);
    if (media.storyId !== (await this.demo.currentStoryId()))
      throw new NotFoundException('Demo media not found');
    return this.send(await this.narration.readMediaKey(media.key), res);
  }

  /**
   * A question from a visitor. The tight per-IP limit is the first of three
   * defences — the other two are the per-conversation and per-day turn caps
   * inside the agent, which is what actually bounds the monthly bill.
   */
  @Post('ask')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async ask(@Body() dto: AskDemoStoryDto) {
    const storyId = await this.demo.currentStoryId();
    if (!storyId) {
      throw new NotFoundException('No demo story is published right now');
    }

    return this.agent.ask({
      storyId,
      studentProfileId: null,
      demoSessionId: dto.demoSessionId,
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

  private send(
    file:
      | { kind: 'redirect'; url: string; mimetype: string }
      | { kind: 'stream'; body: Buffer; mimetype: string },
    res: Response,
  ) {
    if (file.kind === 'redirect') return res.redirect(file.url);
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Accept-Ranges', 'bytes');
    // Public demo media never changes once generated, and it is the same bytes
    // for every visitor.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(file.body);
  }
}
