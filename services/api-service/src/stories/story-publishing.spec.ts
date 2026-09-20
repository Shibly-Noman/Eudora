import { BadRequestException, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { StoriesService } from './stories.service';
import {
  publicationIssues,
  publicationMediaKeys,
  StoryDocument,
} from './story-publication';

function document(): StoryDocument {
  const cover = {
    id: 'cover',
    storyId: 'story',
    kind: 'ILLUSTRATION',
    storageKey: 'cover.webp',
    altText: 'The moon',
    sortOrder: 1,
    segmentId: null,
  };
  const artwork = {
    ...cover,
    id: 'art',
    segmentId: 'section',
    storageKey: 'section.webp',
    kind: 'BACKGROUND',
  };
  return {
    id: 'story',
    title: 'Moon walk',
    status: 'DRAFT',
    cover,
    assets: [cover, artwork],
    characters: [],
    chapters: [
      {
        id: 'chapter',
        segments: [
          {
            id: 'section',
            text: 'We walked.',
            narrationText: null,
            narrationAudioKey: 'voice.mp3',
            narrationDurationMs: 1000,
            assets: [artwork],
          },
        ],
      },
    ],
  } as unknown as StoryDocument;
}

function build() {
  const story = document();
  const prisma: any = {
    story: {
      findUnique: jest.fn().mockResolvedValue(story),
      update: jest.fn(),
    },
    storyRelease: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    storySegment: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ chapter: { storyId: 'story' } }),
    },
    storyAsset: {
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 2 } }),
      create: jest.fn().mockResolvedValue({ id: 'new-art' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const storage: any = {
    uploadPrivateFile: jest.fn().mockResolvedValue({ key: 'new.webp' }),
    deleteFile: jest.fn(),
  };
  return {
    story,
    prisma,
    storage,
    service: new StoriesService(prisma, storage),
  };
}

describe('Eudora Moon publication', () => {
  it('requires section artwork even when a cover exists', () => {
    const story = document();
    story.chapters[0].segments[0].assets = [];
    expect(publicationIssues(story)).toContain(
      'Section 1: upload an illustration or background.',
    );
  });
  it('collects cover, section images and narration into the edition', () => {
    expect(publicationIssues(document())).toEqual([]);
    expect(publicationMediaKeys(document())).toEqual([
      'cover.webp',
      'section.webp',
      'voice.mp3',
    ]);
  });
  it('rejects missing narration and mismatched performed words before publishing', async () => {
    const { story, service, prisma } = build();
    story.chapters[0].segments[0].narrationAudioKey = null;
    story.chapters[0].segments[0].narrationText = 'Different words';
    await expect(service.setStatus('story', 'PUBLISHED')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.storyRelease.create).not.toHaveBeenCalled();
    expect(prisma.story.update).not.toHaveBeenCalled();
  });
  it('publishes an independent snapshot and increments its edition', async () => {
    const { story, service, prisma } = build();
    prisma.storyRelease.findFirst.mockResolvedValue({ revision: 2 });
    await service.setStatus('story', 'PUBLISHED');
    const data = prisma.storyRelease.create.mock.calls[0][0].data;
    story.title = 'Unsaved to the edition';
    story.chapters[0].segments[0].assets = [];
    expect(data.revision).toBe(3);
    expect(data.snapshot.title).toBe('Moon walk');
    expect(data.snapshot.chapters[0].segments[0].assets).toHaveLength(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('withdraws the public demo together with the library', async () => {
    const { service, prisma } = build();
    await service.setStatus('story', 'DRAFT');
    expect(prisma.story.update).toHaveBeenCalledWith({
      where: { id: 'story' },
      data: { status: 'DRAFT', isPublicDemo: false },
    });
    expect(prisma.storyRelease.create).not.toHaveBeenCalled();
  });
  it('serves edition media after a draft section is removed', async () => {
    const { service, prisma } = build();
    prisma.storyRelease.findUnique.mockResolvedValue({
      storyId: 'story',
      snapshot: document(),
      mediaKeys: publicationMediaKeys(document()),
    });
    expect(
      await service.releaseMedia('release', 'section', 'narration'),
    ).toEqual({ storyId: 'story', key: 'voice.mp3' });
    await expect(
      service.releaseMedia('release', 'draft-only-art', 'asset'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.storySegment.findUnique).not.toHaveBeenCalled();
  });
  it('returns release-specific reader URLs', async () => {
    const { service, prisma } = build();
    prisma.storyRelease.findFirst.mockResolvedValue({
      id: 'edition',
      revision: 1,
      snapshot: document(),
    });
    const read = await service.readerStory('story');
    expect(read.cover.url).toBe(
      '/api/stories/releases/edition/assets/cover/file',
    );
    expect(read.chapters[0].segments[0].narrationUrl).toBe(
      '/api/stories/releases/edition/segments/section/narration',
    );
  });
  it('refuses cross-story artwork uploads before storing the file', async () => {
    const { service, prisma, storage } = build();
    prisma.storySegment.findUnique.mockResolvedValue({
      chapter: { storyId: 'another-story' },
    });
    await expect(
      service.uploadArtwork(
        'story',
        {
          purpose: 'SECTION',
          segmentId: 'other',
          kind: 'ILLUSTRATION',
          altText: 'A moon',
        },
        { buffer: Buffer.from('image') },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled();
  });
  it('refuses arbitrary private storage keys', async () => {
    const { service, storage } = build();
    await expect(
      service.addAsset('story', {
        storageKey: 'private-document',
        altText: 'Claimed artwork',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled();
  });
  it('rejects corrupt artwork before storage', async () => {
    const { service, storage } = build();
    await expect(
      service.uploadArtwork(
        'story',
        { purpose: 'COVER', kind: 'ILLUSTRATION', altText: 'A moon' },
        { buffer: Buffer.from('<svg/>') },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled();
  });
  it('normalizes a real PNG and saves a cover separately from section artwork', async () => {
    const { service, storage, prisma } = build();
    const buffer = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#224488' },
    })
      .png()
      .toBuffer();
    await service.uploadArtwork(
      'story',
      { purpose: 'COVER', kind: 'ILLUSTRATION', altText: '  A moon  ' },
      { buffer },
    );
    const stored = storage.uploadPrivateFile.mock.calls[0];
    expect((await sharp(stored[0].buffer).metadata()).format).toBe('webp');
    expect(stored[1]).toBe('story-artwork/story');
    expect(prisma.storyAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ segmentId: null, altText: 'A moon' }),
    });
    expect(prisma.story.update).toHaveBeenCalledWith({
      where: { id: 'story' },
      data: { coverAssetId: 'new-art' },
    });
  });
});
