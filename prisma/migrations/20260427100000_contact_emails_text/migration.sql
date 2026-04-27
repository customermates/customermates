CREATE OR REPLACE FUNCTION emails_to_search_text(text[]) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT array_to_string($1, ' ')
$$;

ALTER TABLE "Contact" ADD COLUMN "emailsText" TEXT GENERATED ALWAYS AS (emails_to_search_text("emails")) STORED;

CREATE INDEX "Contact_emailsText_idx" ON "Contact" ("emailsText");
