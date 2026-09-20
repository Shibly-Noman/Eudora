import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVE_STORAGE_PROVIDER } from '../uploads/storage.provider';

describe('StoriesService', () => {
  let service: StoriesService;

  const mockPrisma: any = {
    storyRelease: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    moduleItem: { findUnique: jest.fn(), delete: jest.fn() },
    story: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    storyChapter: {
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    storySegment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    storyAsset: { create: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
  };

  const mockStorage: any = {
    getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/asset'),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };

  /** Minimal shape `findOne` needs so the read-back after a write resolves. */
  const emptyStory = {
    id: 'story-1',
    title: 'A story',
    status: 'PUBLISHED',
    cover: null,
    assets: [],
    chapters: [],
    characters: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ACTIVE_STORAGE_PROVIDER, useValue: mockStorage },
      ],
    }).compile();

    service = module.get(StoriesService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
    mockPrisma.story.findUnique.mockResolvedValue(emptyStory);
  });

  describe('create', () => {
    it('creates a story that belongs to no course', async () => {
      mockPrisma.story.create.mockResolvedValue({ id: 'story-1' });

      await service.create({ title: 'A Story' });

      // The whole point of a story being its own thing: writing one must not
      // require picking a course first.
      expect(mockPrisma.moduleItem.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ moduleItemId: null }),
        }),
      );
    });

    it('normalizes and deduplicates browse topics when creating a story', async () => {
      mockPrisma.story.create.mockResolvedValue({ id: 'story-1' });

      await service.create({
        title: 'A Story',
        topics: [' Space ', 'space', '  Friendship  '],
      });

      expect(mockPrisma.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ topics: ['space', 'friendship'] }),
        }),
      );
    });

    it('refuses a module item that is not a STORY slot', async () => {
      mockPrisma.moduleItem.findUnique.mockResolvedValue({
        id: 'mi-1',
        kind: 'VIDEO',
        deletedAt: null,
        story: null,
      });

      await expect(
        service.create({ moduleItemId: 'mi-1', title: 'A Story' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.story.create).not.toHaveBeenCalled();
    });

    it('refuses a slot that already holds a story', async () => {
      mockPrisma.moduleItem.findUnique.mockResolvedValue({
        id: 'mi-1',
        kind: 'STORY',
        deletedAt: null,
        story: { id: 'existing' },
      });

      await expect(
        service.create({ moduleItemId: 'mi-1', title: 'A Story' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates against a free STORY slot', async () => {
      mockPrisma.moduleItem.findUnique.mockResolvedValue({
        id: 'mi-1',
        kind: 'STORY',
        deletedAt: null,
        story: null,
      });
      mockPrisma.story.create.mockResolvedValue({ id: 'story-1' });

      await service.create({ moduleItemId: 'mi-1', title: 'A Story' });

      expect(mockPrisma.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            moduleItemId: 'mi-1',
            title: 'A Story',
          }),
        }),
      );
    });
  });

  describe('import', () => {
    it('numbers chapters and segments from the document order', async () => {
      mockPrisma.moduleItem.findUnique.mockResolvedValue({
        id: 'mi-1',
        kind: 'STORY',
        deletedAt: null,
        story: null,
      });
      mockPrisma.story.create.mockResolvedValue({ id: 'story-1' });
      mockPrisma.storyChapter.create
        .mockResolvedValueOnce({ id: 'ch-1' })
        .mockResolvedValueOnce({ id: 'ch-2' });

      await service.import({
        moduleItemId: 'mi-1',
        title: 'Bramble and the Bridge',
        chapters: [
          {
            title: 'One',
            segments: [
              { text: 'First beat.' },
              { text: 'Second beat.', narrationText: '[excited] Second beat.' },
            ],
          },
          { title: 'Two', segments: [{ text: 'Third beat.' }] },
        ],
      });

      const chapterOrders = mockPrisma.storyChapter.create.mock.calls.map(
        (c: any) => c[0].data.sortOrder,
      );
      expect(chapterOrders).toEqual([1, 2]);

      const segmentCalls = mockPrisma.storySegment.create.mock.calls.map(
        (c: any) => [c[0].data.chapterId, c[0].data.sortOrder],
      );
      // Positions restart per chapter — they are unique per chapter, not
      // per story.
      expect(segmentCalls).toEqual([
        ['ch-1', 1],
        ['ch-1', 2],
        ['ch-2', 1],
      ]);
    });

    it('stores the performed narration alongside the words', async () => {
      mockPrisma.moduleItem.findUnique.mockResolvedValue({
        id: 'mi-1',
        kind: 'STORY',
        deletedAt: null,
        story: null,
      });
      mockPrisma.story.create.mockResolvedValue({ id: 'story-1' });
      mockPrisma.storyChapter.create.mockResolvedValue({ id: 'ch-1' });

      await service.import({
        moduleItemId: 'mi-1',
        title: 'A Story',
        chapters: [
          {
            title: 'One',
            segments: [
              { text: 'She jumped.', narrationText: '[excited] She jumped.' },
              { text: 'She landed.' },
            ],
          },
        ],
      });

      const written = mockPrisma.storySegment.create.mock.calls.map(
        (c: any) => [c[0].data.text, c[0].data.narrationText],
      );
      // Null rather than a copy of the text: the narrator only pays for the
      // slower expressive model where there is something to perform.
      expect(written).toEqual([
        ['She jumped.', '[excited] She jumped.'],
        ['She landed.', null],
      ]);
    });
  });

  describe('updateSegment', () => {
    const segment = {
      id: 'seg-1',
      chapterId: 'ch-1',
      sortOrder: 1,
      text: 'The bridge was old.',
      chapter: { storyId: 'story-1' },
    };

    it('drops generated narration when the words change', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue(segment);

      await service.updateSegment('seg-1', { text: 'The bridge was ancient.' });

      const { data } = mockPrisma.storySegment.update.mock.calls[0][0];
      // Stale audio saying something the page no longer says is worse than
      // no audio.
      expect(data.narrationAudioKey).toBeNull();
      expect(data.narrationDurationMs).toBeNull();
    });

    it('keeps narration when only the position changes', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue(segment);
      mockPrisma.storySegment.findFirst.mockResolvedValue(null);

      await service.updateSegment('seg-1', { sortOrder: 3 });

      const { data } = mockPrisma.storySegment.update.mock.calls[0][0];
      expect('narrationAudioKey' in data).toBe(false);
    });

    it('rejects a position already taken in that chapter', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue(segment);
      mockPrisma.storySegment.findFirst.mockResolvedValue({ id: 'other' });

      await expect(
        service.updateSegment('seg-1', { sortOrder: 2 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reorderChapters', () => {
    it('moves through negative positions so the unique index never collides', async () => {
      mockPrisma.storyChapter.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
      ]);

      await service.reorderChapters('story-1', { ids: ['b', 'a'] });

      const orders = mockPrisma.storyChapter.update.mock.calls.map(
        (c: any) => c[0].data.sortOrder,
      );
      // Every row is parked out of range before any takes its final slot;
      // a straight 1..n rewrite would collide mid-swap.
      expect(orders).toEqual([-1, -2, 1, 2]);
    });

    it('refuses a partial list, which would leave gaps', async () => {
      mockPrisma.storyChapter.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
      ]);

      await expect(
        service.reorderChapters('story-1', { ids: ['a'] }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.storyChapter.update).not.toHaveBeenCalled();
    });
  });

  describe('addAsset', () => {
    it('refuses to bind an asset to a segment in a different story', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue({
        id: 'seg-9',
        chapter: { storyId: 'other-story' },
      });

      await expect(
        service.addAsset('story-1', {
          storageKey: 'k',
          altText: 'a bridge',
          segmentId: 'seg-9',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('placing a story in a course', () => {
    beforeEach(() => {
      mockPrisma.story.update.mockResolvedValue({});
    });

    it('attaches to a free STORY slot', async () => {
      mockPrisma.story.findUnique.mockResolvedValue({ ...emptyStory });
      mockPrisma.moduleItem.findUnique.mockResolvedValue({
        id: 'mi-1',
        kind: 'STORY',
        deletedAt: null,
        story: null,
      });

      await service.attach('story-1', 'mi-1');

      expect(mockPrisma.story.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { moduleItemId: 'mi-1' } }),
      );
    });

    it('refuses a slot another story already fills', async () => {
      mockPrisma.story.findUnique.mockResolvedValue({ ...emptyStory });
      mockPrisma.moduleItem.findUnique.mockResolvedValue({
        id: 'mi-1',
        kind: 'STORY',
        deletedAt: null,
        story: { id: 'someone-else' },
      });

      await expect(service.attach('story-1', 'mi-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lets a story re-attach to the slot it already occupies', async () => {
      mockPrisma.story.findUnique.mockResolvedValue({ ...emptyStory });
      mockPrisma.moduleItem.findUnique.mockResolvedValue({
        id: 'mi-1',
        kind: 'STORY',
        deletedAt: null,
        story: { id: 'story-1' },
      });

      await expect(service.attach('story-1', 'mi-1')).resolves.toBeDefined();
    });

    it('removes the emptied slot when detaching', async () => {
      mockPrisma.story.findUnique.mockResolvedValue({
        id: 'story-1',
        moduleItemId: 'mi-1',
      });

      await service.detach('story-1');

      // A STORY item with no story renders nothing; leaving one behind in a
      // live course is worse than refusing the detach.
      expect(mockPrisma.moduleItem.delete).toHaveBeenCalledWith({
        where: { id: 'mi-1' },
      });
    });

    it('refuses to detach a story that is not in a course', async () => {
      mockPrisma.story.findUnique.mockResolvedValue({
        id: 'story-1',
        moduleItemId: null,
      });

      await expect(service.detach('story-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.moduleItem.delete).not.toHaveBeenCalled();
    });
  });

  describe('mergeSegmentUp', () => {
    const second = {
      id: 'seg-2',
      chapterId: 'ch-1',
      sortOrder: 2,
      text: 'She landed.',
      narrationText: '[sadly] She landed.',
      chapter: { storyId: 'story-1' },
    };

    beforeEach(() => {
      mockPrisma.storySegment.findMany.mockResolvedValue([
        { id: 'seg-1' },
        { id: 'seg-3' },
      ]);
      mockPrisma.storySegment.delete.mockResolvedValue({});
    });

    it('joins the words into the section above and drops its audio', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue(second);
      mockPrisma.storySegment.findFirst.mockResolvedValue({
        id: 'seg-1',
        sortOrder: 1,
        text: 'She jumped.',
        narrationText: '[excited] She jumped.',
      });

      await service.mergeSegmentUp('seg-2');

      const merged = mockPrisma.storySegment.update.mock.calls.find(
        (c: any) => c[0].where.id === 'seg-1',
      )[0].data;
      expect(merged.text).toBe('She jumped. She landed.');
      expect(merged.narrationText).toBe(
        '[excited] She jumped. [sadly] She landed.',
      );
      // Different words mean the recording no longer matches them.
      expect(merged.narrationAudioKey).toBeNull();
      expect(mockPrisma.storySegment.delete).toHaveBeenCalledWith({
        where: { id: 'seg-2' },
      });
    });

    it('drops to plain narration when only one half was performed', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue(second);
      mockPrisma.storySegment.findFirst.mockResolvedValue({
        id: 'seg-1',
        sortOrder: 1,
        text: 'She jumped.',
        narrationText: null,
      });

      await service.mergeSegmentUp('seg-2');

      const merged = mockPrisma.storySegment.update.mock.calls.find(
        (c: any) => c[0].where.id === 'seg-1',
      )[0].data;
      // Half-tagged markup would no longer strip back to the text, and
      // narration would refuse it — a puzzle for whoever hit it later.
      expect(merged.narrationText).toBeNull();
    });

    it('refuses on the first section of a chapter', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue({
        ...second,
        sortOrder: 1,
      });
      mockPrisma.storySegment.findFirst.mockResolvedValue(null);

      await expect(service.mergeSegmentUp('seg-2')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.storySegment.delete).not.toHaveBeenCalled();
    });
  });

  describe('splitSegment', () => {
    const segment = {
      id: 'seg-1',
      chapterId: 'ch-1',
      sortOrder: 1,
      text: 'She jumped. She landed.',
      chapter: { storyId: 'story-1' },
    };

    it('shifts the sections below down before inserting', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue(segment);
      mockPrisma.storySegment.findMany.mockResolvedValue([
        { id: 'seg-3', sortOrder: 3 },
        { id: 'seg-2', sortOrder: 2 },
      ]);
      mockPrisma.storySegment.create.mockResolvedValue({});

      await service.splitSegment('seg-1', 12);

      // Bottom-up, so no two rows ever claim the same position under the
      // unique index.
      const moves = mockPrisma.storySegment.update.mock.calls
        .filter((c: any) => c[0].data.sortOrder !== undefined)
        .map((c: any) => [c[0].where.id, c[0].data.sortOrder]);
      expect(moves).toEqual([
        ['seg-3', 4],
        ['seg-2', 3],
      ]);

      expect(mockPrisma.storySegment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ text: 'She landed.', sortOrder: 2 }),
        }),
      );
    });

    it('refuses a split that would leave an empty half', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue(segment);

      await expect(service.splitSegment('seg-1', 0)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.storySegment.create).not.toHaveBeenCalled();
    });
  });

  describe('retaining edition media', () => {
    it('retains a deleted section’s recording for published editions', async () => {
      mockPrisma.storySegment.findUnique.mockResolvedValue({
        id: 'seg-1',
        chapterId: 'ch-1',
        narrationAudioKey: 'story-narration/one.mp3',
        chapter: { storyId: 'story-1' },
      });
      mockPrisma.storySegment.findMany.mockResolvedValue([]);
      mockPrisma.storySegment.delete.mockResolvedValue({});

      await service.removeSegment('seg-1');

      // Nothing points at the file once the row is gone, and it was paid for.
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('retains recordings when deleting a draft chapter', async () => {
      mockPrisma.storyChapter.findUnique.mockResolvedValue({
        id: 'ch-1',
        storyId: 'story-1',
        segments: [
          { narrationAudioKey: 'story-narration/a.mp3' },
          { narrationAudioKey: null },
          { narrationAudioKey: 'story-narration/b.mp3' },
        ],
      });
      mockPrisma.storyChapter.delete.mockResolvedValue({});

      await service.removeChapter('ch-1');

      // Collected before the delete: the cascade takes the segments with the
      // chapter, and afterwards nothing remembers which files they used.
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('still deletes the rows when the file cannot be removed', async () => {
      mockPrisma.storyChapter.findUnique.mockResolvedValue({
        id: 'ch-1',
        storyId: 'story-1',
        segments: [{ narrationAudioKey: 'story-narration/gone.mp3' }],
      });
      mockPrisma.storyChapter.delete.mockResolvedValue({});
      mockStorage.deleteFile.mockRejectedValueOnce(new Error('ENOENT'));

      // A leftover file costs disk; a failed delete would cost the author
      // their edit.
      await expect(service.removeChapter('ch-1')).resolves.toBeDefined();
      expect(mockPrisma.storyChapter.delete).toHaveBeenCalled();
    });
  });

  describe('setPublicDemo', () => {
    beforeEach(() => {
      mockPrisma.story.findUnique.mockResolvedValue({ ...emptyStory });
      mockPrisma.story.update.mockResolvedValue({});
      mockPrisma.story.updateMany.mockResolvedValue({ count: 1 });
    });

    it('clears the flag on every other story when setting it', async () => {
      await service.setPublicDemo('story-1', true);

      // The demo picks its story with findFirst(orderBy updatedAt desc), so two
      // flagged stories would mean the live one changes whenever someone edits
      // the other — and a "Public" badge on a story nobody reaches.
      expect(mockPrisma.story.updateMany).toHaveBeenCalledWith({
        where: { isPublicDemo: true, id: { not: 'story-1' } },
        data: { isPublicDemo: false },
      });
      expect(mockPrisma.story.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isPublicDemo: true } }),
      );
    });

    it('touches only this story when unsetting it', async () => {
      await service.setPublicDemo('story-1', false);

      // Removing the demo must not resurrect some previous one.
      expect(mockPrisma.story.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.story.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isPublicDemo: false } }),
      );
    });
  });

  describe('findPublished', () => {
    it('uses the published edition even when the draft is incomplete', async () => {
      mockPrisma.story.findMany.mockResolvedValue([
        {
          id: 'done',
          title: 'Unfinished edit',
          releases: [
            {
              id: 'release-1',
              snapshot: {
                ...emptyStory,
                title: 'Finished',
                cover: { id: 'cov-1' },
                chapters: [{ segments: [{ narrationAudioKey: 'a' }] }],
              },
            },
          ],
        },
        { id: 'never-published', releases: [] },
      ]);
      const library = await service.findPublished();
      expect(library.map((s) => s.id)).toEqual(['done']);
      expect(library[0].title).toBe('Finished');
      expect(library[0].coverUrl).toBe(
        '/api/stories/releases/release-1/assets/cov-1/file',
      );
    });

    it('filters by a normalized topic from the released edition', async () => {
      mockPrisma.story.findMany.mockResolvedValue([
        {
          id: 'space-story',
          releases: [
            {
              id: 'release-space',
              snapshot: {
                ...emptyStory,
                id: 'space-story',
                topics: ['space', 'friendship'],
                chapters: [{ segments: [{ narrationAudioKey: 'a' }] }],
              },
            },
          ],
        },
        {
          id: 'garden-story',
          releases: [
            {
              id: 'release-garden',
              snapshot: {
                ...emptyStory,
                id: 'garden-story',
                topics: ['nature'],
                chapters: [{ segments: [{ narrationAudioKey: 'b' }] }],
              },
            },
          ],
        },
      ]);

      const library = await service.findPublished(' SPACE ');

      expect(library.map((story) => story.id)).toEqual(['space-story']);
      expect(library[0].topics).toEqual(['space', 'friendship']);
    });
  });

  describe('findOne', () => {
    const illustrated = {
      ...emptyStory,
      cover: { id: 'a1', storageKey: 'covers/one.png' },
      assets: [{ id: 'a1', storageKey: 'covers/one.png' }],
      chapters: [
        {
          id: 'ch-1',
          segments: [
            {
              id: 's1',
              text: 'A page',
              narrationAudioKey: 'story-narration/s1.mp3',
              assets: [
                { id: 'a2', storageKey: 'art/two.png', altText: 'Artwork' },
              ],
            },
            {
              id: 's2',
              text: 'Another page',
              narrationAudioKey: null,
              assets: [],
            },
          ],
        },
      ],
    };

    it('points media at this API rather than at the storage backend', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(illustrated);

      const story: any = await service.findOne('story-1');

      expect(story.cover.url).toBe('/api/stories/assets/a1/file');
      expect(story.chapters[0].segments[0].assets[0].url).toBe(
        '/api/stories/assets/a2/file',
      );
      // The regression this guards: signing here raised a 500 for every story
      // with artwork, because local disk — the only working backend — throws
      // from getSignedUrl by design rather than returning a URL.
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('points media at the demo routes when asked to', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(illustrated);

      const story: any = await service.findOne('story-1', '/api/stories/demo');

      // The public demo serves the same story through unauthenticated routes.
      // Handing a visitor the authenticated URLs makes every play button 401.
      expect(story.cover.url).toBe('/api/stories/demo/assets/a1/file');
      expect(story.chapters[0].segments[0].narrationUrl).toBe(
        '/api/stories/demo/segments/s1/narration',
      );
    });

    it('offers a narration URL only where narration exists', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(illustrated);

      const story: any = await service.findOne('story-1');
      const [narrated, silent] = story.chapters[0].segments;

      expect(narrated.narrationUrl).toBe('/api/stories/segments/s1/narration');
      // Null, not a URL that would 404 — the reader uses this to decide
      // whether to show a play button at all.
      expect(silent.narrationUrl).toBeNull();
    });

    it('throws when the story does not exist', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
