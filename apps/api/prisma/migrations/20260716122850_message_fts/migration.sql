-- Full-text search: generated tsvector column ('simple' config — chat is
-- multilingual, stemming would mangle it) + GIN index. Backfills existing
-- rows automatically (STORED generated column).
ALTER TABLE "messages" ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX "messages_content_tsv_idx" ON "messages" USING GIN ("content_tsv");
