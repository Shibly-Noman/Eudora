import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NarrationService } from './narration.service';

describe('NarrationService — generation integrity', () => {
  const segment = {
    id: 'segment-1',
    text: 'Nia found a map.',
    narrationText: null,
    narrationAudioKey: 'story-narration/previous.mp3',
    updatedAt: new Date('2026-09-09T00:00:00Z'),
    chapter: { story: { narratorVoiceId: 'voice-1' } },
  };

  const build = () => {
    const prisma = {
      storySegment: {
        findUnique: jest.fn().mockResolvedValue(segment),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const speech = {
      synthesize: jest.fn().mockResolvedValue({
        audio: Buffer.from('new audio'),
        mimeType: 'audio/mpeg',
        durationMs: 1000,
        timings: null,
        provider: 'gemini',
      }),
    };
    const storage = {
      uploadPrivateFile: jest.fn().mockResolvedValue({
        key: 'story-narration/new.mp3',
        bucket: 'private-media',
      }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    const service = new NarrationService(
      prisma as any,
      speech as any,
      {} as any,
      storage as any,
    );
    return { service, prisma, speech, storage };
  };

  it('only attaches audio to the unchanged text, voice, and recording it read', async () => {
    const { service, prisma, storage } = build();

    await expect(service.narrateSegment(segment.id)).resolves.toEqual({
      durationMs: 1000,
      provider: 'gemini',
    });

    expect(prisma.storySegment.updateMany).toHaveBeenCalledWith({
      where: {
        id: segment.id,
        updatedAt: segment.updatedAt,
        text: segment.text,
        narrationText: null,
        narrationAudioKey: segment.narrationAudioKey,
        chapter: { story: { narratorVoiceId: 'voice-1' } },
      },
      data: {
        narrationAudioKey: 'story-narration/new.mp3',
        narrationDurationMs: 1000,
        narrationTimings: Prisma.DbNull,
      },
    });
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('discards generated audio when an edit or another generation wins', async () => {
    const { service, prisma, storage } = build();
    prisma.storySegment.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.narrateSegment(segment.id)).rejects.toThrow(
      ConflictException,
    );

    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledWith(
      'story-narration/new.mp3',
      'private-media',
    );
    expect(prisma.storySegment.update).not.toHaveBeenCalled();
  });

  it('still reports the conflict when discarded audio cannot be cleaned up', async () => {
    const { service, prisma, storage } = build();
    prisma.storySegment.updateMany.mockResolvedValue({ count: 0 });
    storage.deleteFile.mockRejectedValue(new Error('storage unavailable'));

    await expect(service.narrateSegment(segment.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('keeps existing audio when the database result is uncertain', async () => {
    const { service, prisma, storage } = build();
    const failure = new Error('database connection lost');
    prisma.storySegment.update.mockRejectedValue(failure);
    prisma.storySegment.updateMany.mockRejectedValue(failure);

    await expect(service.narrateSegment(segment.id)).rejects.toThrow(failure);
    // A lost response does not prove the database failed to attach the new
    // object. Keep both objects until reconciliation can establish ownership.
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('does not report a saved generation as failed when old-file cleanup fails', async () => {
    const { service, storage } = build();
    storage.deleteFile.mockRejectedValue(new Error('storage unavailable'));

    await expect(service.narrateSegment(segment.id)).resolves.toEqual({
      durationMs: 1000,
      provider: 'gemini',
    });
  });
});
