-- A single webhook or routine can preserve several original CRM event
-- sources without cloning the consumer or broadening it to every record type.
ALTER TABLE "RecordEventSubscription" ADD COLUMN sources JSONB;
ALTER TABLE "RecordEventSubscription" ADD CONSTRAINT "RecordEventSubscription_sources_array_check"
  CHECK (sources IS NULL OR jsonb_typeof(sources) = 'array');
