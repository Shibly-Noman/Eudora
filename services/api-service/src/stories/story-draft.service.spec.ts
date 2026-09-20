import { ServiceUnavailableException } from '@nestjs/common';
import { StoryDraftService } from './story-draft.service';

describe('StoryDraftService — source fidelity', () => {
  const source = 'Nia found a map. She held it to the light.';
  const draft = (texts: string[]) => ({
    title: 'The Lantern Map',
    chapters: [
      { title: 'The clue', segments: texts.map((text) => ({ text })) },
    ],
  });
  const build = (reply: unknown) => {
    const gemini = {
      converse: jest.fn().mockResolvedValue(JSON.stringify(reply)),
    };
    return new StoryDraftService(gemini as any);
  };

  it('accepts new page boundaries while preserving the words and punctuation', async () => {
    const service = build(
      draft(['Nia found a map.', 'She held it to the light.']),
    );

    const result = await service.draftFromProse({
      source: 'Nia found a map.\r\n\r\nShe held it to the light.',
    });

    expect(result.chapters[0].segments.map((segment) => segment.text)).toEqual([
      'Nia found a map.',
      'She held it to the light.',
    ]);
  });

  it.each([
    ['rewrites', ['Nia discovered a map.', 'She held it to the light.']],
    ['omissions', ['Nia found a map.']],
    ['additions', [source, 'Then she found a treasure.']],
    ['duplicates', [source, source]],
    ['reordering', ['She held it to the light.', 'Nia found a map.']],
    ['changed punctuation', ['Nia found a map!', 'She held it to the light.']],
  ])('rejects %s instead of returning altered prose', async (_name, texts) => {
    const service = build(draft(texts));

    await expect(service.draftFromProse({ source })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('drops invalid performance tags without accepting rewritten display text', async () => {
    const service = build({
      chapters: [
        {
          segments: [
            { text: source, narrationText: '[excited] Nia found a treasure.' },
          ],
        },
      ],
    });

    const result = await service.draftFromProse({ source });

    expect(result.chapters[0].segments[0]).toEqual({
      text: source,
      narrationText: null,
    });
    expect(result.droppedNarrationCount).toBe(1);
  });

  it.each([
    null,
    { chapters: {} },
    { chapters: [{ segments: 'not an array' }] },
    { ...draft([source]), characters: {} },
    { chapters: [{ segments: [{ text: 42 }] }] },
  ])(
    'returns a recoverable error for malformed provider output: %j',
    async (reply) => {
      await expect(build(reply).draftFromProse({ source })).rejects.toThrow(
        ServiceUnavailableException,
      );
    },
  );
});
