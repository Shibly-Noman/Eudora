import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StoriesService } from './stories.service';

const enabled = process.env.MOON_PUBLISHING_INTEGRATION === '1';
(enabled ? describe : describe.skip)(
  'Moon publishing against PostgreSQL',
  () => {
    it('uploads, publishes, edits and republishes without changing the first edition', async () => {
      if (
        new URL(process.env.DATABASE_URL!).pathname !==
        '/eudora_moon_publishing_test'
      )
        throw new Error('Use the isolated Moon publishing test database');
      const prisma = new PrismaService();
      let id: string | undefined;
      const storage: any = {
        uploadPrivateFile: jest
          .fn()
          .mockResolvedValueOnce({ key: 'test/cover.webp' })
          .mockResolvedValueOnce({ key: 'test/section.webp' }),
        deleteFile: jest.fn(),
      };
      const service = new StoriesService(prisma, storage);
      try {
        const draft = await service.create({ title: 'Integration story' });
        id = draft.id;
        const chapter = await prisma.storyChapter.create({
          data: { storyId: id!, title: 'Departure', sortOrder: 1 },
        });
        const section = await prisma.storySegment.create({
          data: {
            chapterId: chapter.id,
            text: 'We set off.',
            sortOrder: 1,
            narrationAudioKey: 'test/first.mp3',
            narrationDurationMs: 1000,
          },
        });
        const buffer = await sharp({
          create: { width: 8, height: 8, channels: 3, background: '#243b70' },
        })
          .png()
          .toBuffer();
        await service.uploadArtwork(
          id!,
          { purpose: 'COVER', kind: 'ILLUSTRATION', altText: 'Cover' },
          { buffer },
        );
        await service.uploadArtwork(
          id!,
          {
            purpose: 'SECTION',
            segmentId: section.id,
            kind: 'BACKGROUND',
            altText: 'Earth',
          },
          { buffer },
        );
        await service.setStatus(id!, 'PUBLISHED');
        const first = await service.readerStory(id!);
        expect(first.revision).toBe(1);
        await service.updateSegment(section.id, { text: 'We came home.' });
        const edited = await service.findOne(id!);
        expect(edited.publication.issues).toContain(
          'Section 1: generate narration.',
        );
        await expect(service.setStatus(id!, 'PUBLISHED')).rejects.toThrow();
        expect(
          (await service.readerStory(id!)).chapters[0].segments[0].text,
        ).toBe('We set off.');
        expect(
          (await service.findPublished()).find((s) => s.id === id)?.pageCount,
        ).toBe(1);
        await prisma.storySegment.update({
          where: { id: section.id },
          data: {
            narrationAudioKey: 'test/second.mp3',
            narrationDurationMs: 1200,
          },
        });
        await service.setStatus(id!, 'PUBLISHED');
        expect((await service.readerStory(id!)).revision).toBe(2);
        await service.update(id!, { narratorVoiceId: 'another-narrator' });
        expect(
          (await service.findOne(id!)).chapters[0].segments[0].narrationUrl,
        ).toBeNull();
        expect(
          (await service.readerStory(id!)).chapters[0].segments[0].narrationUrl,
        ).toContain('/narration');
        await service.removeSegment(section.id);
        expect(
          await service.releaseMedia(first.releaseId, section.id, 'narration'),
        ).toEqual({ storyId: id, key: 'test/first.mp3' });
        expect(storage.deleteFile).not.toHaveBeenCalled();
        await service.setStatus(id!, 'DRAFT');
        expect((await service.findPublished()).some((s) => s.id === id)).toBe(
          false,
        );
      } finally {
        if (id) await prisma.story.delete({ where: { id } });
        await prisma.$disconnect();
      }
    }, 30_000);
  },
);
