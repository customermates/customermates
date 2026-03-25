-- Remove servicesWithQuantity from audit log event data (merged into services on DealDto)

UPDATE "AuditLog"
SET "eventData" = jsonb_set(
  "eventData"::jsonb,
  '{payload,changes}',
  ("eventData"::jsonb -> 'payload' -> 'changes') - 'servicesWithQuantity'
)
WHERE "event" LIKE 'deal.%'
  AND "eventData"::jsonb -> 'payload' -> 'changes' ? 'servicesWithQuantity';

UPDATE "AuditLog"
SET "eventData" = jsonb_set(
  "eventData"::jsonb,
  '{payload}',
  ("eventData"::jsonb -> 'payload') - 'servicesWithQuantity'
)
WHERE "event" LIKE 'deal.%'
  AND "eventData"::jsonb -> 'payload' ? 'servicesWithQuantity';
