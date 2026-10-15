-- =============================================================================================
-- Calculated money values of upgraded workspaces, stored as the record engine rounds them.
--
-- 20261010000000_dynamic_record_model materialised the unit prices and amounts of line items and the values and
-- weighted values of deals with exact decimals, for example a weighted value of 2481.996 for 40 % of 6204.99. The
-- record engine stores every calculated money value rounded half up to the fraction digits of its currency
-- (fieldPrecisionResult in features/records/calculation.ts). Until a record was recalculated, sums, filters, exports
-- and the API showed the exact value, and the next recalculation changed it although no input had changed.
--
-- In every upgraded workspace whose record model is still revision 1 of the upgrade, with no record operation
-- running, this migration stores what a full recalculation by the engine stores: each line's unit price rounded,
-- its amount from its quantity and that price, each deal's value as the sum of those amounts, and its weighted
-- value from that value and the probability of its stage, with the engine's intermediate rounding to 30 decimals.
-- Every stored calculated value is either the exact value of the upgrade or one the engine already rounded from
-- the same inputs, so rounding the unit price and recomputing what depends on it gives the engine's result. A deal
-- keeps its values, and its lines keep theirs, when anything about it differs from what the upgrade wrote: a value
-- that is missing or failed, another or an unknown currency, a line in Trash or a line linked to several deals.
-- Lines without a deal are rounded on their own. Records in Trash and workspaces whose configuration changed since
-- the upgrade are left as they are, and so is a workspace whose record lock the running application holds when the
-- migration starts; the next recalculation of its records rounds them.
--
-- No record events are written, so no routine run or webhook delivery is emitted, as in the upgrade itself.
-- README.md describes the locks and how to recover from a failed run.
-- =============================================================================================

SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout = '5s';
SET LOCAL jit = off;

-- presetId(companyId, key) (features/records/crm-preset.ts), as in 20261010000000_dynamic_record_model.
CREATE FUNCTION pg_temp.money_preset_id(company_id text, key text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-8' || substr(h, 14, 3) || '-8' || substr(h, 18, 3) || '-' || substr(h, 21, 12)
  FROM (SELECT encode(sha256(convert_to('customermates:records:v2:' || company_id || ':' || key, 'UTF8')), 'hex') AS h) digest
$$;

-- The record engine's per-workspace advisory lock of every candidate workspace, so no record write of the running
-- application interleaves with the values read and written below. Each lock is only tried, never awaited: a
-- workspace whose lock is held is skipped, so the migration neither waits for the application nor fails on it.
CREATE TEMP TABLE crm_money_locked (company_id text PRIMARY KEY) ON COMMIT DROP;
DO $$
DECLARE
  v_company_id text;
BEGIN
  FOR v_company_id IN
    SELECT state."companyId" FROM "RecordSchemaState" state
    JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = 1
    WHERE state.revision = 1 AND revision."actorId" = 'system:configurable-records-upgrade'
    ORDER BY state."companyId"
  LOOP
    IF pg_try_advisory_xact_lock(hashtextextended(v_company_id, 0)) THEN
      INSERT INTO crm_money_locked (company_id) VALUES (v_company_id);
    END IF;
  END LOOP;
END
$$;

-- currencyFractionDigits (features/records/derived-value-format.ts) of every currency the former workspace currency
-- setting allowed, which the upgrade gave the starter money fields. Values in any other currency are left as they are.
CREATE TEMP TABLE crm_money_currency (code text PRIMARY KEY, digits integer NOT NULL) ON COMMIT DROP;
INSERT INTO crm_money_currency (code, digits) VALUES
  ('AED', 2), ('AFN', 0), ('ALL', 0), ('AMD', 2), ('AOA', 2), ('ARS', 2), ('AUD', 2), ('AWG', 2), ('AZN', 2), ('BAM', 2),
  ('BBD', 2), ('BDT', 2), ('BHD', 3), ('BIF', 0), ('BMD', 2), ('BND', 2), ('BOB', 2), ('BRL', 2), ('BSD', 2), ('BTN', 2),
  ('BWP', 2), ('BYN', 2), ('BZD', 2), ('CAD', 2), ('CDF', 2), ('CHF', 2), ('CLP', 0), ('CNY', 2), ('COP', 0), ('CRC', 2),
  ('CUP', 2), ('CVE', 2), ('CZK', 2), ('DJF', 0), ('DKK', 2), ('DOP', 2), ('DZD', 2), ('EGP', 2), ('ERN', 2), ('ETB', 2),
  ('EUR', 2), ('FJD', 2), ('FKP', 2), ('GBP', 2), ('GEL', 2), ('GHS', 2), ('GIP', 2), ('GMD', 2), ('GNF', 0), ('GTQ', 2),
  ('GYD', 2), ('HKD', 2), ('HNL', 2), ('HTG', 2), ('HUF', 0), ('IDR', 0), ('ILS', 2), ('INR', 2), ('IQD', 0), ('IRR', 0),
  ('ISK', 0), ('JMD', 2), ('JOD', 3), ('JPY', 0), ('KES', 2), ('KGS', 2), ('KHR', 2), ('KMF', 0), ('KPW', 0), ('KRW', 0),
  ('KWD', 3), ('KYD', 2), ('KZT', 2), ('LAK', 0), ('LBP', 0), ('LKR', 2), ('LRD', 2), ('LSL', 2), ('LYD', 3), ('MAD', 2),
  ('MDL', 2), ('MGA', 0), ('MKD', 2), ('MMK', 0), ('MNT', 2), ('MOP', 2), ('MRU', 2), ('MUR', 2), ('MVR', 2), ('MWK', 2),
  ('MXN', 2), ('MYR', 2), ('MZN', 2), ('NAD', 2), ('NGN', 2), ('NIO', 2), ('NOK', 2), ('NPR', 2), ('NZD', 2), ('OMR', 3),
  ('PAB', 2), ('PEN', 2), ('PGK', 2), ('PHP', 2), ('PKR', 0), ('PLN', 2), ('PYG', 0), ('QAR', 2), ('RON', 2), ('RSD', 2),
  ('RUB', 2), ('RWF', 0), ('SAR', 2), ('SBD', 2), ('SCR', 2), ('SDG', 2), ('SEK', 2), ('SGD', 2), ('SHP', 2), ('SLE', 2),
  ('SOS', 0), ('SRD', 2), ('SSP', 2), ('STN', 2), ('SVC', 2), ('SYP', 0), ('SZL', 2), ('THB', 2), ('TJS', 2), ('TMT', 2),
  ('TND', 3), ('TOP', 2), ('TRY', 2), ('TTD', 2), ('TWD', 2), ('TZS', 2), ('UAH', 2), ('UGX', 0), ('USD', 2), ('UYU', 2),
  ('UZS', 2), ('VED', 2), ('VES', 2), ('VND', 0), ('VUV', 0), ('WST', 2), ('XAF', 0), ('XCD', 2), ('XCG', 2), ('XOF', 0),
  ('XPF', 0), ('YER', 0), ('ZAR', 2), ('ZMW', 2), ('ZWG', 2);

-- Upgraded workspaces still at revision 1 without a running record operation whose lock this migration holds, with
-- the starter definitions this migration recomputes. The upgrade wrote them identically in every workspace; the
-- checks keep any other definition, including a decimal places setting, out. The weighted value is either the
-- upgrade's formula over the stage field the former weighting column became, or missing for a workspace without one.
CREATE TEMP TABLE crm_money_model ON COMMIT DROP AS
SELECT workspace.*, stage.value ->> 'id' AS stage_field, stage.value -> 'options' AS stage_options
FROM (
  SELECT state."companyId" AS company_id, revision.snapshot -> 'fields' AS fields,
    pg_temp.money_preset_id(state."companyId", 'lineItem') AS line_type,
    pg_temp.money_preset_id(state."companyId", 'deal') AS deal_type,
    pg_temp.money_preset_id(state."companyId", 'lineItem.deal') AS line_deal,
    pg_temp.money_preset_id(state."companyId", 'lineItem.quantity') AS quantity_field,
    pg_temp.money_preset_id(state."companyId", 'lineItem.effectivePrice') AS price_field,
    pg_temp.money_preset_id(state."companyId", 'lineItem.amount') AS amount_field,
    pg_temp.money_preset_id(state."companyId", 'deal.totalValue') AS total_field,
    pg_temp.money_preset_id(state."companyId", 'deal.weightedValue') AS weighted_field
  FROM "RecordSchemaState" state
  JOIN crm_money_locked locked ON locked.company_id = state."companyId"
  JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
  WHERE state.revision = 1 AND state."activeOperationId" IS NULL AND revision."actorId" = 'system:configurable-records-upgrade'
) AS workspace
CROSS JOIN LATERAL (
  SELECT
    (SELECT f.value FROM jsonb_array_elements(workspace.fields) AS f(value) WHERE f.value ->> 'id' = workspace.price_field) AS price,
    (SELECT f.value FROM jsonb_array_elements(workspace.fields) AS f(value) WHERE f.value ->> 'id' = workspace.amount_field) AS amount,
    (SELECT f.value FROM jsonb_array_elements(workspace.fields) AS f(value) WHERE f.value ->> 'id' = workspace.total_field) AS total,
    (SELECT f.value FROM jsonb_array_elements(workspace.fields) AS f(value) WHERE f.value ->> 'id' = workspace.weighted_field) AS weighted
) AS field
LEFT JOIN LATERAL (
  SELECT f.value FROM jsonb_array_elements(workspace.fields) AS f(value)
  WHERE f.value ->> 'id' = field.weighted #>> '{behavior,expression,arguments,0,arguments,1,fieldId}'
    AND f.value ->> 'typeId' = workspace.deal_type AND f.value ->> 'valueType' = 'select'
) AS stage ON true
WHERE (SELECT bool_and(COALESCE(money.value ->> 'valueType' = 'currency' AND money.value ->> 'archived' = 'false'
        AND COALESCE(money.value #> '{format,decimalPlaces}', 'null'::jsonb) = 'null'::jsonb, false))
      FROM unnest(ARRAY[field.price, field.amount, field.total, field.weighted]) AS money(value))
  AND field.price #>> '{behavior,kind}' = 'formula'
  AND field.amount -> 'behavior' = jsonb_build_object('kind', 'formula', 'expression', jsonb_build_object('kind', 'operation',
    'operator', 'multiply', 'arguments', jsonb_build_array(jsonb_build_object('kind', 'field', 'fieldId', workspace.quantity_field),
      jsonb_build_object('kind', 'field', 'fieldId', workspace.price_field))))
  AND field.total -> 'behavior' = jsonb_build_object('kind', 'rollup', 'expression', jsonb_build_object('kind', 'related',
    'relationId', workspace.line_deal, 'direction', 'incoming', 'expression', jsonb_build_object('kind', 'field', 'fieldId', workspace.amount_field),
    'reducer', 'sum'))
  AND (field.weighted -> 'behavior' = '{"kind":"formula","expression":{"kind":"literal","value":null}}'::jsonb
    OR stage.value IS NOT NULL AND field.weighted -> 'behavior' = jsonb_build_object('kind', 'formula', 'expression',
      jsonb_build_object('kind', 'operation', 'operator', 'divide', 'arguments', jsonb_build_array(
        jsonb_build_object('kind', 'operation', 'operator', 'multiply', 'arguments', jsonb_build_array(
          jsonb_build_object('kind', 'field', 'fieldId', workspace.total_field),
          jsonb_build_object('kind', 'optionAttribute', 'fieldId', stage.value ->> 'id', 'attribute', 'probability'))),
        jsonb_build_object('kind', 'literal', 'value', jsonb_build_object('kind', 'decimal', 'value', '100', 'currency', NULL))))));

-- Line items outside Trash: the deal links the engine follows, and the values a recalculation stores, the stored unit
-- price rounded to its currency and the amount from the quantity and that price (multiply rounds to 30 decimals).
CREATE TEMP TABLE crm_money_line ON COMMIT DROP AS
SELECT model.company_id, line.id AS line_id, link.deals, link.deal_id, price.currency,
  round(price."decimalValue", digits.digits) AS price_value,
  round(round(quantity."decimalValue" * round(price."decimalValue", digits.digits), 30), digits.digits) AS amount_value,
  COALESCE(price.state = 'value' AND quantity.state = 'value' AND amount.state = 'value' AND digits.digits IS NOT NULL
    AND price."decimalValue" IS NOT NULL AND quantity."decimalValue" IS NOT NULL AND amount."decimalValue" IS NOT NULL
    AND quantity.currency IS NULL AND amount.currency = price.currency
    AND abs(round(quantity."decimalValue" * round(price."decimalValue", digits.digits), 30)) < 1e35, false) AS ok
FROM crm_money_model model
JOIN "CrmRecord" line ON line."companyId" = model.company_id AND line."typeId" = model.line_type AND line."deletedAt" IS NULL
CROSS JOIN LATERAL (
  SELECT count(*) AS deals, min(deal_link."targetId") AS deal_id FROM "RecordLink" deal_link
  WHERE deal_link."companyId" = line."companyId" AND deal_link."relationId" = model.line_deal
    AND deal_link."sourceTypeId" = line."typeId" AND deal_link."sourceId" = line.id AND deal_link."deletedAt" IS NULL
) AS link
LEFT JOIN "RecordValue" price ON price."companyId" = line."companyId" AND price."typeId" = line."typeId"
  AND price."recordId" = line.id AND price."fieldId" = model.price_field
LEFT JOIN "RecordValue" quantity ON quantity."companyId" = line."companyId" AND quantity."typeId" = line."typeId"
  AND quantity."recordId" = line.id AND quantity."fieldId" = model.quantity_field
LEFT JOIN "RecordValue" amount ON amount."companyId" = line."companyId" AND amount."typeId" = line."typeId"
  AND amount."recordId" = line.id AND amount."fieldId" = model.amount_field
LEFT JOIN crm_money_currency digits ON digits.code = price.currency;

-- Deals outside Trash: their stored value and weighted value, and the probability attribute of their stage option as
-- the engine reads it (the first matching option and attribute). A missing weighted value is consistent only without
-- such an attribute; a stored one needs a probability that is a plain decimal without currency.
CREATE TEMP TABLE crm_money_deal ON COMMIT DROP AS
SELECT model.company_id, deal.id AS deal_id, total.currency, digits.digits,
  COALESCE(total.state = 'value' AND total."decimalValue" IS NOT NULL AND digits.digits IS NOT NULL AND (
    weighted.state = 'missing' AND attribute.value IS NULL
    OR weighted.state = 'value' AND weighted."decimalValue" IS NOT NULL AND weighted.currency = total.currency
      AND attribute.value ->> 'kind' = 'decimal' AND attribute.value -> 'currency' = 'null'::jsonb
      AND attribute.value ->> 'value' ~ '^-?[0-9]+(\.[0-9]+)?$'), false) AS ok,
  weighted.state = 'value' AS weighted,
  CASE WHEN weighted.state = 'value' AND attribute.value ->> 'value' ~ '^-?[0-9]+(\.[0-9]+)?$'
    THEN (attribute.value ->> 'value')::numeric END AS probability
FROM crm_money_model model
JOIN "CrmRecord" deal ON deal."companyId" = model.company_id AND deal."typeId" = model.deal_type AND deal."deletedAt" IS NULL
LEFT JOIN "RecordValue" total ON total."companyId" = deal."companyId" AND total."typeId" = deal."typeId"
  AND total."recordId" = deal.id AND total."fieldId" = model.total_field
LEFT JOIN "RecordValue" weighted ON weighted."companyId" = deal."companyId" AND weighted."typeId" = deal."typeId"
  AND weighted."recordId" = deal.id AND weighted."fieldId" = model.weighted_field
LEFT JOIN "RecordValue" stage ON stage."companyId" = deal."companyId" AND stage."typeId" = deal."typeId"
  AND stage."recordId" = deal.id AND stage."fieldId" = model.stage_field AND stage.state = 'value'
LEFT JOIN LATERAL (
  SELECT item.value -> 'value' AS value
  FROM jsonb_array_elements(model.stage_options) WITH ORDINALITY AS option(value, position)
  CROSS JOIN LATERAL jsonb_array_elements(option.value -> 'attributes') WITH ORDINALITY AS item(value, position)
  WHERE option.value ->> 'id' = stage."textValue" AND item.value ->> 'key' = 'probability'
  ORDER BY option.position, item.position
  LIMIT 1
) AS attribute ON true
LEFT JOIN crm_money_currency digits ON digits.code = total.currency;

-- A deal's value sums the amounts of the sources of its live deal links. The deal is recomputed only when every one
-- of them is a line outside Trash with usable values in the deal's currency and no other deal; the rounded total of
-- amounts that each have the currency's digits is their sum.
CREATE TEMP TABLE crm_money_deal_value ON COMMIT DROP AS
SELECT deal.company_id, deal.deal_id, round(sum(line.amount_value), deal.digits) AS total_value,
  CASE WHEN deal.weighted
    THEN round(round(round(round(sum(line.amount_value), deal.digits) * deal.probability, 30) * 0.01, 30), deal.digits)
  END AS weighted_value
FROM crm_money_deal deal
JOIN crm_money_model model ON model.company_id = deal.company_id
JOIN "RecordLink" deal_link ON deal_link."companyId" = deal.company_id AND deal_link."relationId" = model.line_deal
  AND deal_link."targetTypeId" = model.deal_type AND deal_link."targetId" = deal.deal_id AND deal_link."deletedAt" IS NULL
LEFT JOIN crm_money_line line ON line.company_id = deal_link."companyId" AND line.line_id = deal_link."sourceId"
WHERE deal.ok
GROUP BY deal.company_id, deal.deal_id, deal.digits, deal.weighted, deal.probability
HAVING bool_and(COALESCE(line.ok AND line.deals = 1 AND line.currency = deal.currency, false))
  AND abs(sum(line.amount_value)) < 1e35
  AND (NOT deal.weighted OR abs(round(round(sum(line.amount_value), deal.digits) * deal.probability, 30)) < 1e35);

-- The recomputed values: lines of the deals above and lines without a deal, then the deals.
CREATE TEMP TABLE crm_money_value ON COMMIT DROP AS
SELECT line.company_id, model.line_type AS type_id, line.line_id AS record_id, field.field_id, field.value
FROM crm_money_line line
JOIN crm_money_model model ON model.company_id = line.company_id
CROSS JOIN LATERAL (VALUES (model.price_field, line.price_value), (model.amount_field, line.amount_value)) AS field(field_id, value)
WHERE line.ok AND (line.deals = 0 OR EXISTS (
  SELECT 1 FROM crm_money_deal_value deal WHERE deal.company_id = line.company_id AND deal.deal_id = line.deal_id))
UNION ALL
SELECT deal.company_id, model.deal_type, deal.deal_id, field.field_id, field.value
FROM crm_money_deal_value deal
JOIN crm_money_model model ON model.company_id = deal.company_id
CROSS JOIN LATERAL (VALUES (model.total_field, deal.total_value), (model.weighted_field, deal.weighted_value)) AS field(field_id, value)
WHERE field.value IS NOT NULL;

UPDATE "RecordValue" stored
SET "decimalValue" = recomputed.value, "updatedAt" = CURRENT_TIMESTAMP
FROM crm_money_value recomputed
WHERE stored."companyId" = recomputed.company_id AND stored."typeId" = recomputed.type_id
  AND stored."recordId" = recomputed.record_id AND stored."fieldId" = recomputed.field_id
  AND stored.state = 'value' AND stored."decimalValue" <> recomputed.value;

DROP FUNCTION pg_temp.money_preset_id(text, text);
