import { ForbiddenException } from '@nestjs/common';

import { StoriesController } from './stories.controller';
import type { CurrentUserDto } from '../auth/dto/current-user.dto';

/**
 * The read gate, which is the only reason `library/:id` exists as a route of
 * its own. `GET /stories/:id` beside it is staff-only, so without these the
 * library would list stories nobody could open — which is exactly the state
 * this route was added to fix.
 */
describe('StoriesController — library read gate', () => {
  const child = { id: 'user-1', roles: ['USER'] } as CurrentUserDto;

  const build = (
    access: { id: string; status: string; moduleItemId: string | null },
    canAccessModuleItem = jest.fn().mockResolvedValue(false),
  ) => {
    const stories: any = {
      releaseMedia: jest.fn().mockResolvedValue({ storyId: access.id, key: 'edition.webp' }),
      currentMedia: jest.fn().mockResolvedValue({ storyId: access.id, key: 'edition.webp' }),
      accessForStory: jest.fn().mockResolvedValue(access),
      accessForSegment: jest.fn().mockResolvedValue(access),
      accessForAsset: jest.fn().mockResolvedValue(access),
      readerStory: jest
        .fn()
        .mockResolvedValue({ id: access.id, title: 'Luna' }),
    };
    const narration = {
      readMediaKey: jest.fn().mockResolvedValue({ kind: 'stream', body: Buffer.from('edition'), mimetype: 'image/webp' }),
      readNarration: jest.fn().mockResolvedValue({
        kind: 'stream',
        body: Buffer.from('narration'),
        mimetype: 'audio/mpeg',
      }),
      readAsset: jest.fn().mockResolvedValue({
        kind: 'redirect',
        url: 'https://media.example.test/signed-artwork',
        mimetype: 'image/png',
      }),
    };
    const entitlements: any = { canAccessModuleItem };
    const controller = new StoriesController(
      stories,
      narration as any,
      {} as any,
      {} as any,
      entitlements,
      {} as any,
    );
    return { controller, stories, entitlements, narration };
  };

  it('serves the edition key instead of the draft asset to a published reader', async () => {
    const { controller, narration, stories } = build({ id: 'story', status: 'PUBLISHED', moduleItemId: null });
    const res: any = { setHeader: jest.fn(), send: jest.fn(), redirect: jest.fn() };
    await controller.assetFile('asset', child, res);
    expect(stories.currentMedia).toHaveBeenCalledWith('story', 'asset', 'asset');
    expect(narration.readMediaKey).toHaveBeenCalledWith('edition.webp');
    expect(narration.readAsset).not.toHaveBeenCalled();
  });

  it('denies edition artwork after a standalone story is withdrawn', async () => {
    const { controller, narration } = build({ id: 'story', status: 'DRAFT', moduleItemId: null });
    await expect(controller.releaseArtwork('edition', 'asset', child, {} as any)).rejects.toThrow(ForbiddenException);
    expect(narration.readMediaKey).not.toHaveBeenCalled();
  });

  describe('standalone draft media preview', () => {
    const draft = { id: 'draft-1', status: 'DRAFT', moduleItemId: null };
    const response = () =>
      ({
        setHeader: jest.fn(),
        send: jest.fn(),
        redirect: jest.fn(),
      }) as any;

    it.each(['SUPER_ADMIN', 'ADMIN', 'TEACHER'])(
      'lets an existing %s author preview narration and artwork before publication',
      async (role) => {
        const { controller, narration, entitlements } = build(draft);
        const author = { id: 'author-1', roles: [role] } as CurrentUserDto;
        const res = response();

        await controller.narrationAudio('segment-1', author, res);
        await controller.assetFile('asset-1', author, res);

        expect(narration.readNarration).toHaveBeenCalledWith('segment-1');
        expect(res.send).toHaveBeenCalledWith(Buffer.from('narration'));
        expect(narration.readAsset).toHaveBeenCalledWith('asset-1');
        expect(res.redirect).toHaveBeenCalledWith(
          'https://media.example.test/signed-artwork',
        );
        expect(entitlements.canAccessModuleItem).not.toHaveBeenCalled();
      },
    );

    it.each(['USER', 'GUARDIAN'])(
      'does not expose unpublished media to a %s',
      async (role) => {
        const { controller, narration } = build(draft);
        const reader = { id: 'reader-1', roles: [role] } as CurrentUserDto;
        const res = response();

        await expect(
          controller.narrationAudio('segment-1', reader, res),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          controller.assetFile('asset-1', reader, res),
        ).rejects.toThrow(ForbiddenException);

        expect(narration.readNarration).not.toHaveBeenCalled();
        expect(narration.readAsset).not.toHaveBeenCalled();
        expect(res.send).not.toHaveBeenCalled();
        expect(res.redirect).not.toHaveBeenCalled();
      },
    );
  });

  it('opens a published story for a child who owns nothing', async () => {
    const { controller, stories, entitlements } = build({
      id: 'story-1',
      status: 'PUBLISHED',
      moduleItemId: null,
    });

    await expect(controller.libraryStory('story-1', child)).resolves.toEqual({
      id: 'story-1',
      title: 'Luna',
    });
    // Published is free: the entitlement check must not even be consulted,
    // or the library would silently require a purchase.
    expect(entitlements.canAccessModuleItem).not.toHaveBeenCalled();
    expect(stories.readerStory).toHaveBeenCalledWith('story-1');
  });

  it('refuses an unpublished story that belongs to no course', async () => {
    const { controller, stories } = build({
      id: 'story-2',
      status: 'DRAFT',
      moduleItemId: null,
    });

    await expect(controller.libraryStory('story-2', child)).rejects.toThrow(
      ForbiddenException,
    );
    expect(stories.readerStory).not.toHaveBeenCalled();
  });

  it('refuses a draft in a course the child has not bought', async () => {
    const { controller, stories } = build({
      id: 'story-3',
      status: 'DRAFT',
      moduleItemId: 'item-1',
    });

    await expect(controller.libraryStory('story-3', child)).rejects.toThrow(
      ForbiddenException,
    );
    expect(stories.readerStory).not.toHaveBeenCalled();
  });

  it('opens a draft in a course the child has bought', async () => {
    const { controller, entitlements } = build(
      { id: 'story-4', status: 'DRAFT', moduleItemId: 'item-1' },
      jest.fn().mockResolvedValue(true),
    );

    await expect(
      controller.libraryStory('story-4', child, 'student-9'),
    ).resolves.toBeDefined();
    // The acting-student header has to reach the entitlement check, or a
    // guardian reading with their child is judged on their own entitlements.
    expect(entitlements.canAccessModuleItem).toHaveBeenCalledWith(
      'user-1',
      ['USER'],
      'item-1',
      'student-9',
    );
  });
});
