CREATE TABLE "story_releases" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "mediaKeys" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_releases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "story_releases_storyId_revision_key" ON "story_releases"("storyId", "revision");
CREATE INDEX "story_releases_mediaKeys_idx" ON "story_releases" USING GIN ("mediaKeys");
ALTER TABLE "story_releases" ADD CONSTRAINT "story_releases_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stories" DROP CONSTRAINT "stories_moduleItemId_fkey";
ALTER TABLE "stories" ADD CONSTRAINT "stories_moduleItemId_fkey"
  FOREIGN KEY ("moduleItemId") REFERENCES "module_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the currently visible content before introducing editable drafts.
-- Existing books are grandfathered; future publications use readiness checks.
INSERT INTO "story_releases" ("id", "storyId", "revision", "snapshot", "mediaKeys")
SELECT gen_random_uuid()::text, s."id", 1,
  to_jsonb(s) || jsonb_build_object(
    'cover', (SELECT to_jsonb(a) FROM "story_assets" a WHERE a."id" = s."coverAssetId"),
    'assets', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a."sortOrder", a."id") FROM "story_assets" a WHERE a."storyId" = s."id"), '[]'::jsonb),
    'characters', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c."sortOrder", c."id") FROM "story_characters" c WHERE c."storyId" = s."id"), '[]'::jsonb),
    'moduleItem', NULL,
    'chapters', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object('segments', COALESCE((
        SELECT jsonb_agg(to_jsonb(g) || jsonb_build_object('assets', COALESCE((
          SELECT jsonb_agg(to_jsonb(a) ORDER BY a."sortOrder", a."id") FROM "story_assets" a WHERE a."segmentId" = g."id"
        ), '[]'::jsonb)) ORDER BY g."sortOrder", g."id")
        FROM "story_segments" g WHERE g."chapterId" = c."id"
      ), '[]'::jsonb)) ORDER BY c."sortOrder", c."id")
      FROM "story_chapters" c WHERE c."storyId" = s."id"
    ), '[]'::jsonb)
  ),
  ARRAY(SELECT DISTINCT key FROM (
    SELECT a."storageKey" AS key FROM "story_assets" a WHERE a."storyId" = s."id"
    UNION ALL
    SELECT g."narrationAudioKey" FROM "story_segments" g JOIN "story_chapters" c ON c."id" = g."chapterId"
      WHERE c."storyId" = s."id" AND g."narrationAudioKey" IS NOT NULL
  ) media)
FROM "stories" s WHERE s."status" = 'PUBLISHED' OR s."isPublicDemo" = TRUE;
