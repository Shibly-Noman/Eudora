-- Stories can belong to more than one browse topic. Keep the values on the
-- story so the released snapshot and the student library stay in sync.
ALTER TABLE "stories"
ADD COLUMN "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "stories_topics_idx" ON "stories" USING GIN ("topics");
