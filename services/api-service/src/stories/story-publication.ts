import { Prisma } from '@prisma/client';
import { narrationMatchesText } from './narration-text';

export const STORY_DETAIL_INCLUDE = {
  characters: { orderBy: { sortOrder: 'asc' as const } },
  chapters: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      segments: {
        orderBy: { sortOrder: 'asc' as const },
        include: { assets: { orderBy: { sortOrder: 'asc' as const } } },
      },
    },
  },
  assets: { orderBy: { sortOrder: 'asc' as const } },
  cover: true,
  moduleItem: { select: { id: true, title: true, status: true } },
} satisfies Prisma.StoryInclude;

export type StoryDocument = Prisma.StoryGetPayload<{
  include: typeof STORY_DETAIL_INCLUDE;
}>;

export function publicationIssues(story: StoryDocument): string[] {
  const issues: string[] = [];
  if (!story.title?.trim()) issues.push('Add a story title.');
  if (
    !story.cover ||
    story.cover.kind === 'AUDIO' ||
    !story.cover.altText?.trim() ||
    !story.cover.storageKey
  ) {
    issues.push('Upload a cover illustration with alternative text.');
  }
  const segments = (story.chapters ?? []).flatMap(
    (chapter) => chapter.segments,
  );
  if (!segments.length) issues.push('Add at least one narration section.');
  for (const [index, segment] of segments.entries()) {
    const label = `Section ${index + 1}`;
    if (!segment.text.trim()) issues.push(`${label}: add the story text.`);
    if (!segment.assets.some((asset) => asset.kind !== 'AUDIO')) {
      issues.push(`${label}: upload an illustration or background.`);
    }
    if (segment.assets.some((asset) => !asset.altText.trim())) {
      issues.push(`${label}: describe every artwork for accessibility.`);
    }
    if (
      !segment.narrationAudioKey ||
      !segment.narrationDurationMs ||
      segment.narrationDurationMs <= 0
    ) {
      issues.push(`${label}: generate narration.`);
    }
    if (
      segment.narrationText &&
      !narrationMatchesText(segment.narrationText.trim(), segment.text.trim())
    ) {
      issues.push(
        `${label}: the performed narration must match the story text.`,
      );
    }
  }
  return issues;
}

export function publicationMediaKeys(story: StoryDocument): string[] {
  return [
    ...new Set(
      [
        ...[
          story.cover,
          ...(story.assets ?? []),
          ...(story.chapters ?? []).flatMap((c) =>
            c.segments.flatMap((s) => s.assets),
          ),
        ]
          .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
          .map((asset) => asset.storageKey),
        ...story.chapters.flatMap((chapter) =>
          chapter.segments.map((segment) => segment.narrationAudioKey),
        ),
      ].filter((key): key is string => Boolean(key)),
    ),
  ];
}
