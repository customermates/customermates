-- =============================================================================================
-- Configurable records: the complete, one-step upgrade from the legacy CRM tables.
--
-- prisma migrate deploy sends this file to PostgreSQL as one batch of statements, which PostgreSQL runs as a
-- single implicit transaction (there is deliberately no BEGIN/COMMIT: an explicit block would leave the
-- connection aborted after a refusal and hide the refusal message from Prisma). To run it by hand, use
-- psql --single-transaction --set ON_ERROR_STOP=1 -f migration.sql. The file
--   0. locks every workspace and the legacy tables,
--   1. VALIDATES all legacy data and stages every conversion (refusing with grouped counts),
--   2. EXPANDS the schema with the generic record storage,
--   3. converts RECORDS, values, links, assignments, identities and participant lookups,
--   4. converts CONFIGURATION: record models and revisions, permissions, presentation state,
--      widgets, routine/webhook triggers, timeline views and terminology,
--   5. materialises CALCULATED values and their provenance with exact decimals,
--   6. RECONCILES the result against the legacy source and refuses on any mismatch,
--   7. REMOVES the legacy tables, columns and enums.
-- A refusal or interruption rolls everything back: the legacy data stays exactly as it was.
-- Recovery: fix the reported rows, run `prisma migrate resolve --rolled-back 20261004000000_configurable_records`,
-- then `prisma migrate deploy` again. See README.md next to this file.
--
-- An empty database passes sections 1 and 3-6 without work and ends in the schema of prisma/schema.prisma.
-- The conversion reproduces the retired TypeScript upgrade (prisma/record-migrations at c77dfb7bb) value for
-- value, except for the explicit, documented repairs marked "Documented repair" below.
-- =============================================================================================

SET LOCAL TIME ZONE 'UTC';
SET LOCAL extra_float_digits = 1;
SET LOCAL lock_timeout = '60s';
-- Helper functions reference each other regardless of definition order.
SET LOCAL check_function_bodies = off;

-- This file supersedes an unreleased chain of CRM migrations. A database that applied any part of that
-- chain has generic storage already and must be restored to its legacy baseline instead.
DO $$
BEGIN
  IF to_regclass('"CrmRecord"') IS NOT NULL OR to_regclass('"RecordSchemaState"') IS NOT NULL THEN
    RAISE EXCEPTION 'Configurable record storage already exists. This upgrade only runs on the legacy CRM schema; restore the legacy baseline.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- Section 0: locks. Every workspace advisory lock (the record engine's per-workspace lock, taken in id
-- order), then the legacy CRM tables exclusively and the converted presentation tables against writes.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_workspace record;
BEGIN
  FOR v_workspace IN SELECT id FROM "Company" ORDER BY id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_workspace.id, 0));
  END LOOP;
END
$$;
LOCK TABLE "Contact", "Organization", "Deal", "Service", "Task", "CustomColumn", "CustomFieldValue", "ContactIdentifier",
  "ServiceDeal", "ServiceUser", "DealOrganization", "DealUser", "DealContact", "ContactUser", "OrganizationUser", "TaskUser",
  "TaskContact", "TaskOrganization", "TaskDeal", "TaskService", "ContactOrganization", "EntityTerminology" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "Company", "User", "UserRole", "RolePermission", "Widget", "DataView", "P13n", "Routine", "Webhook", "WebhookDelivery",
  "MessagingThreadParticipant", "MessagingThread", "AuditLog" IN SHARE ROW EXCLUSIVE MODE;

-- Fresh planner statistics for the legacy source (statistics only; rolled back with everything else).
ANALYZE "Company", "User", "UserRole", "RolePermission", "Contact", "Organization", "Deal", "Service", "Task", "CustomColumn",
  "CustomFieldValue", "ContactIdentifier", "ServiceDeal", "ServiceUser", "DealOrganization", "DealUser", "DealContact", "ContactUser",
  "OrganizationUser", "TaskUser", "TaskContact", "TaskOrganization", "TaskDeal", "TaskService", "ContactOrganization", "EntityTerminology",
  "DataView", "P13n", "Widget", "Routine", "Webhook", "AuditLog", "MessagingThreadParticipant";

-- Transaction-scoped working state: the helper schema (dropped in section 7) and staging tables.
CREATE SCHEMA crm_upgrade;
CREATE TEMP TABLE crm_upgrade_issue (company_id text, source_table text NOT NULL, field text NOT NULL, code text NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE crm_upgrade_repair (company_id text NOT NULL, source_table text NOT NULL, row_id text, kind text NOT NULL, detail text) ON COMMIT DROP;

-- ---------------------------------------------------------------------------------------------
-- Helper functions. They live in the transaction-scoped schema "crm_upgrade" and are dropped in
-- section 7. Each one reproduces the exact JavaScript/zod semantics the retired TypeScript
-- upgrade used, so that acceptance, rejection and every converted value stay identical.
-- ---------------------------------------------------------------------------------------------

-- presetId(companyId, key): sha256("customermates:records:v2:<companyId>:<key>") shaped as a UUID
-- with fixed version/variant nibbles (prisma/record-migrations/v2/contract/crm-preset.ts).
CREATE FUNCTION crm_upgrade.preset_id(company_id text, key text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-8' || substr(h, 14, 3) || '-8' || substr(h, 18, 3) || '-' || substr(h, 21, 12)
  FROM (SELECT encode(sha256(convert_to('customermates:records:v2:' || company_id || ':' || key, 'UTF8')), 'hex') AS h) digest
$$;

-- String.prototype.trim(): ECMAScript WhiteSpace and LineTerminator code points.
CREATE FUNCTION crm_upgrade.js_trim(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT regexp_replace(value,
    '^[\t\n\u000B\f\r    -     　﻿]+|[\t\n\u000B\f\r    -     　﻿]+$',
    '', 'g')
$$;

-- String.prototype.length: UTF-16 code units (astral code points count twice).
CREATE FUNCTION crm_upgrade.js_len(value text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT length(value) + length(regexp_replace(value, '[^\U00010000-\U0010FFFF]', '', 'g'))
$$;

-- Number.prototype.toString() for a finite double. PostgreSQL's shortest round-trip float8 output
-- supplies the same digits as ECMAScript's Number::toString; only the layout differs.
CREATE FUNCTION crm_upgrade.js_num(p_value double precision) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET extra_float_digits = 1 AS $$
DECLARE
  v_raw text := abs(p_value)::text;
  v_mantissa text;
  v_exponent integer := 0;
  v_digits text;
  v_point integer;
  v_k integer;
  v_n integer;
  v_sign text := CASE WHEN p_value < 0 THEN '-' ELSE '' END;
BEGIN
  IF p_value = 0 THEN RETURN '0'; END IF;
  IF p_value = 'Infinity'::float8 THEN RETURN 'Infinity'; END IF;
  IF p_value = '-Infinity'::float8 THEN RETURN '-Infinity'; END IF;
  IF p_value = 'NaN'::float8 THEN RETURN 'NaN'; END IF;
  v_mantissa := split_part(v_raw, 'e', 1);
  IF position('e' IN v_raw) > 0 THEN v_exponent := split_part(v_raw, 'e', 2)::integer; END IF;
  v_point := position('.' IN v_mantissa);
  IF v_point = 0 THEN
    v_digits := v_mantissa;
    v_n := length(v_mantissa) + v_exponent;
  ELSE
    v_digits := replace(v_mantissa, '.', '');
    v_n := v_point - 1 + v_exponent;
  END IF;
  -- Normalise to significant digits d1..dk with value = 0.d1..dk * 10^n.
  WHILE left(v_digits, 1) = '0' AND length(v_digits) > 1 LOOP
    v_digits := substr(v_digits, 2);
    v_n := v_n - 1;
  END LOOP;
  v_digits := rtrim(v_digits, '0');
  v_k := length(v_digits);
  IF v_k <= v_n AND v_n <= 21 THEN
    RETURN v_sign || v_digits || repeat('0', v_n - v_k);
  ELSIF 0 < v_n AND v_n <= 21 THEN
    RETURN v_sign || substr(v_digits, 1, v_n) || '.' || substr(v_digits, v_n + 1);
  ELSIF -6 < v_n AND v_n <= 0 THEN
    RETURN v_sign || '0.' || repeat('0', -v_n) || v_digits;
  END IF;
  RETURN v_sign || substr(v_digits, 1, 1) || CASE WHEN v_k > 1 THEN '.' || substr(v_digits, 2) ELSE '' END
    || 'e' || CASE WHEN v_n - 1 < 0 THEN '-' ELSE '+' END || abs(v_n - 1)::text;
END
$$;

-- JSON.parse of a JSON number literal: the nearest double, Infinity on overflow and +/-0 on underflow.
CREATE FUNCTION crm_upgrade.js_parse_number(p_value numeric) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  RETURN p_value::text::double precision;
EXCEPTION WHEN numeric_value_out_of_range THEN
  IF abs(p_value) < 1 THEN RETURN CASE WHEN p_value < 0 THEN -0.0::float8 ELSE 0::float8 END; END IF;
  RETURN CASE WHEN p_value < 0 THEN '-Infinity'::float8 ELSE 'Infinity'::float8 END;
END
$$;

-- JSON.stringify(JSON.parse(document)): numbers pass through doubles (non-finite becomes null).
CREATE FUNCTION crm_upgrade.js_json(p_document jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_number double precision;
BEGIN
  IF (p_document IS NULL) IS NOT FALSE THEN RETURN NULL; END IF;
  CASE jsonb_typeof(p_document)
    WHEN 'number' THEN
      v_number := crm_upgrade.js_parse_number(p_document::text::numeric);
      IF v_number IN ('Infinity'::float8, '-Infinity'::float8) THEN RETURN 'null'::jsonb; END IF;
      RETURN crm_upgrade.js_num(v_number)::jsonb;
    WHEN 'array' THEN
      IF NOT jsonb_path_exists(p_document, 'strict $.** ? (@.type() == "number")') THEN RETURN p_document; END IF;
      RETURN COALESCE((SELECT jsonb_agg(crm_upgrade.js_json(item.value) ORDER BY item.ordinality)
        FROM jsonb_array_elements(p_document) WITH ORDINALITY AS item(value, ordinality)), '[]'::jsonb);
    WHEN 'object' THEN
      IF NOT jsonb_path_exists(p_document, 'strict $.** ? (@.type() == "number")') THEN RETURN p_document; END IF;
      RETURN COALESCE((SELECT jsonb_object_agg(entry.key, crm_upgrade.js_json(entry.value))
        FROM jsonb_each(p_document) AS entry), '{}'::jsonb);
    ELSE
      RETURN p_document;
  END CASE;
END
$$;

-- String(value) for JSON values as used by Number(value) coercion (arrays join with commas).
CREATE FUNCTION crm_upgrade.js_string(p_value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_value IS NULL THEN RETURN 'undefined'; END IF;
  CASE jsonb_typeof(p_value)
    WHEN 'string' THEN RETURN p_value #>> '{}';
    WHEN 'number' THEN RETURN crm_upgrade.js_num(crm_upgrade.js_parse_number(p_value::text::numeric));
    WHEN 'boolean' THEN RETURN p_value::text;
    WHEN 'null' THEN RETURN 'null';
    WHEN 'array' THEN
      RETURN COALESCE((SELECT string_agg(CASE WHEN jsonb_typeof(item.value) = 'null' THEN '' ELSE crm_upgrade.js_string(item.value) END, ',' ORDER BY item.ordinality)
        FROM jsonb_array_elements(p_value) WITH ORDINALITY AS item(value, ordinality)), '');
    ELSE RETURN '[object Object]';
  END CASE;
END
$$;

-- Number(string): StringToNumber, NULL for NaN.
CREATE FUNCTION crm_upgrade.js_string_to_number(p_value text) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_trimmed text := crm_upgrade.js_trim(p_value);
  v_result numeric;
BEGIN
  IF v_trimmed = '' THEN RETURN 0; END IF;
  IF v_trimmed ~ '^0[xX][0-9a-fA-F]+$' THEN
    v_result := 0;
    FOR v_i IN 3..length(v_trimmed) LOOP
      v_result := v_result * 16 + position(lower(substr(v_trimmed, v_i, 1)) IN '0123456789abcdef') - 1;
    END LOOP;
    RETURN crm_upgrade.js_parse_number(v_result);
  ELSIF v_trimmed ~ '^0[oO][0-7]+$' THEN
    v_result := 0;
    FOR v_i IN 3..length(v_trimmed) LOOP v_result := v_result * 8 + substr(v_trimmed, v_i, 1)::integer; END LOOP;
    RETURN crm_upgrade.js_parse_number(v_result);
  ELSIF v_trimmed ~ '^0[bB][01]+$' THEN
    v_result := 0;
    FOR v_i IN 3..length(v_trimmed) LOOP v_result := v_result * 2 + substr(v_trimmed, v_i, 1)::integer; END LOOP;
    RETURN crm_upgrade.js_parse_number(v_result);
  ELSIF v_trimmed ~ '^[+-]?Infinity$' THEN
    RETURN CASE WHEN left(v_trimmed, 1) = '-' THEN '-Infinity'::float8 ELSE 'Infinity'::float8 END;
  ELSIF v_trimmed ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$' THEN
    RETURN crm_upgrade.js_parse_number(v_trimmed::numeric);
  END IF;
  RETURN NULL;
END
$$;

-- Number(jsonValue) as used by z.coerce.number().
CREATE FUNCTION crm_upgrade.js_to_number(p_value jsonb) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF (p_value IS NULL) IS NOT FALSE THEN RETURN NULL; END IF;
  CASE jsonb_typeof(p_value)
    WHEN 'number' THEN RETURN crm_upgrade.js_parse_number(p_value::text::numeric);
    WHEN 'boolean' THEN RETURN CASE WHEN p_value = 'true'::jsonb THEN 1 ELSE 0 END;
    WHEN 'null' THEN RETURN 0;
    WHEN 'string' THEN RETURN crm_upgrade.js_string_to_number(p_value #>> '{}');
    WHEN 'array' THEN RETURN crm_upgrade.js_string_to_number(crm_upgrade.js_string(p_value));
    ELSE RETURN NULL;
  END CASE;
END
$$;

-- z.uuid() (zod 4.3): RFC 9562 versions 1-8 with the RFC variant, plus the nil and max UUIDs.
CREATE FUNCTION crm_upgrade.is_uuid(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value IS NOT NULL AND value ~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
$$;

-- z.iso.date()
CREATE FUNCTION crm_upgrade.is_iso_date(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value IS NOT NULL AND value ~ '^(?:(?:[0-9][0-9][2468][048]|[0-9][0-9][13579][26]|[0-9][0-9]0[48]|[02468][048]00|[13579][26]00)-02-29|[0-9]{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12][0-9]|3[01])|(?:0[469]|11)-(?:0[1-9]|[12][0-9]|30)|(?:02)-(?:0[1-9]|1[0-9]|2[0-8])))$'
$$;

-- RecordDateTimeSchema: z.iso.datetime({ offset: true }) refined to at most six fractional digits.
CREATE FUNCTION crm_upgrade.is_iso_datetime(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value IS NOT NULL
    AND value ~ '^(?:(?:[0-9][0-9][2468][048]|[0-9][0-9][13579][26]|[0-9][0-9]0[48]|[02468][048]00|[13579][26]00)-02-29|[0-9]{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12][0-9]|3[01])|(?:0[469]|11)-(?:0[1-9]|[12][0-9]|30)|(?:02)-(?:0[1-9]|1[0-9]|2[0-8])))T(?:(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]+)?)?(?:Z|([+-](?:[01][0-9]|2[0-3]):[0-5][0-9])))$'
    AND value !~ '\.[0-9]{7}'
$$;

-- Microseconds since the epoch for a string accepted by is_iso_date or is_iso_datetime.
-- truncate_millis reproduces Date.parse (fraction truncated to milliseconds); otherwise this is
-- recordInstantMicros (fraction kept to six digits). Proleptic Gregorian arithmetic, year 0000 included.
CREATE FUNCTION crm_upgrade.iso_micros(p_value text, p_truncate_millis boolean) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_y integer := substr(p_value, 1, 4)::integer;
  v_m integer := substr(p_value, 6, 2)::integer;
  v_d integer := substr(p_value, 9, 2)::integer;
  v_era integer;
  v_yoe integer;
  v_doy integer;
  v_doe integer;
  v_days bigint;
  v_rest text;
  v_hh integer := 0;
  v_mi integer := 0;
  v_ss integer := 0;
  v_fraction text := '';
  v_offset_minutes integer := 0;
  v_zone text;
BEGIN
  IF v_m <= 2 THEN v_y := v_y - 1; END IF;
  v_era := floor(v_y / 400.0);
  v_yoe := v_y - v_era * 400;
  v_doy := (153 * (v_m + CASE WHEN v_m > 2 THEN -3 ELSE 9 END) + 2) / 5 + v_d - 1;
  v_doe := v_yoe * 365 + v_yoe / 4 - v_yoe / 100 + v_doy;
  v_days := v_era::bigint * 146097 + v_doe - 719468;
  IF length(p_value) > 10 THEN
    v_rest := substr(p_value, 12);
    v_hh := substr(v_rest, 1, 2)::integer;
    v_mi := substr(v_rest, 4, 2)::integer;
    v_rest := substr(v_rest, 6);
    IF left(v_rest, 1) = ':' THEN
      v_ss := substr(v_rest, 2, 2)::integer;
      v_rest := substr(v_rest, 4);
      IF left(v_rest, 1) = '.' THEN
        v_fraction := substring(v_rest FROM '^\.([0-9]+)');
        v_rest := substr(v_rest, length(v_fraction) + 2);
      END IF;
    END IF;
    v_zone := v_rest;
    IF v_zone <> 'Z' THEN
      v_offset_minutes := (substr(v_zone, 2, 2)::integer * 60 + substr(v_zone, 5, 2)::integer) * CASE WHEN left(v_zone, 1) = '-' THEN -1 ELSE 1 END;
    END IF;
  END IF;
  v_fraction := rpad(v_fraction, 6, '0');
  IF p_truncate_millis THEN v_fraction := substr(v_fraction, 1, 3) || '000'; END IF;
  RETURN ((v_days * 86400 + v_hh * 3600 + v_mi * 60 + v_ss - v_offset_minutes * 60)::numeric * 1000000) + v_fraction::numeric;
END
$$;

-- z.email() (zod 4.3 "practical email" pattern).
CREATE FUNCTION crm_upgrade.is_email(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value IS NOT NULL AND value ~ '^(?!\.)(?!.*\.\.)([A-Za-z0-9_''+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$'
$$;

-- z.e164()
CREATE FUNCTION crm_upgrade.is_e164(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value IS NOT NULL AND value ~ '^\+[1-9][0-9]{6,14}$'
$$;

-- Decimal values the record engine can store exactly: finite, |x| < 1e35, at most 30 decimals.
CREATE FUNCTION crm_upgrade.is_representable(value numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((value IS NOT NULL AND value <> 'NaN'::numeric AND abs(value) < 1e35 AND scale(trim_scale(value)) <= 30), false)
$$;

-- new Decimal(x).toFixed(): plain notation without trailing zeros.
CREATE FUNCTION crm_upgrade.decimal_text(value numeric) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT trim_scale(value)::text
$$;

-- String.prototype.split(separator): an empty string still yields one empty element.
CREATE FUNCTION crm_upgrade.js_split(p_value text, p_separator text) RETURNS text[]
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN p_value = '' THEN ARRAY[''] ELSE string_to_array(p_value, p_separator) END
$$;

-- decodeURIComponent(); NULL where JavaScript throws URIError. A decoded NUL also yields NULL: every
-- caller tests the decoded text against a pattern that excludes NUL, so both outcomes coincide.
CREATE FUNCTION crm_upgrade.decode_uri_component(p_value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_result text := '';
  v_position integer := 1;
  v_total integer := length(p_value);
  v_current text;
  v_first integer;
  v_width integer;
  v_bytes bytea;
  v_next integer;
BEGIN
  WHILE v_position <= v_total LOOP
    v_current := substr(p_value, v_position, 1);
    IF v_current <> '%' THEN
      v_result := v_result || v_current;
      v_position := v_position + 1;
      CONTINUE;
    END IF;
    IF (substr(p_value, v_position + 1, 2) !~ '^[0-9A-Fa-f]{2}$') IS NOT FALSE THEN RETURN NULL; END IF;
    v_first := ('x' || lpad(substr(p_value, v_position + 1, 2), 8, '0'))::bit(32)::integer;
    IF (v_first = 0) IS NOT FALSE THEN RETURN NULL; END IF;
    IF v_first < 128 THEN
      v_result := v_result || chr(v_first);
      v_position := v_position + 3;
      CONTINUE;
    END IF;
    v_width := CASE WHEN v_first >= 240 AND v_first < 248 THEN 4 WHEN v_first >= 224 AND v_first < 240 THEN 3 WHEN v_first >= 192 AND v_first < 224 THEN 2 ELSE 0 END;
    IF (v_width = 0) IS NOT FALSE THEN RETURN NULL; END IF;
    v_bytes := set_byte('\x00'::bytea, 0, v_first);
    FOR v_index IN 1..v_width - 1 LOOP
      IF (substr(p_value, v_position + v_index * 3, 1) <> '%' OR substr(p_value, v_position + v_index * 3 + 1, 2) !~ '^[0-9A-Fa-f]{2}$') IS NOT FALSE THEN RETURN NULL; END IF;
      v_next := ('x' || lpad(substr(p_value, v_position + v_index * 3 + 1, 2), 8, '0'))::bit(32)::integer;
      IF (v_next < 128 OR v_next >= 192) IS NOT FALSE THEN RETURN NULL; END IF;
      v_bytes := v_bytes || set_byte('\x00'::bytea, 0, v_next);
    END LOOP;
    BEGIN
      v_result := v_result || convert_from(v_bytes, 'UTF8');
    EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character OR invalid_parameter_value THEN
      RETURN NULL;
    END;
    v_position := v_position + v_width * 3;
  END LOOP;
  RETURN v_result;
END
$$;

-- Code points matched by /[\p{L}\p{N}\p{M}]/u in the Node.js runtime that ran the retired upgrade
-- (Node 24.18, ICU 78.3, Unicode 17). Frozen here so the conversion does not depend on database ICU.
CREATE FUNCTION crm_upgrade.letter_number_mark() RETURNS int4multirange
LANGUAGE sql IMMUTABLE AS $$ SELECT '{[48,58),[65,91),[97,123),[170,171),[178,180),[181,182),[185,187),[188,191),[192,215),[216,247),[248,706),
[710,722),[736,741),[748,749),[750,751),[768,885),[886,888),[890,894),[895,896),[902,903),[904,907),[908,909),
[910,930),[931,1014),[1015,1154),[1155,1328),[1329,1367),[1369,1370),[1376,1417),[1425,1470),[1471,1472),
[1473,1475),[1476,1478),[1479,1480),[1488,1515),[1519,1523),[1552,1563),[1568,1642),[1646,1748),[1749,1757),
[1759,1769),[1770,1789),[1791,1792),[1808,1867),[1869,1970),[1984,2038),[2042,2043),[2045,2046),[2048,2094),
[2112,2140),[2144,2155),[2160,2184),[2185,2192),[2199,2274),[2275,2404),[2406,2416),[2417,2436),[2437,2445),
[2447,2449),[2451,2473),[2474,2481),[2482,2483),[2486,2490),[2492,2501),[2503,2505),[2507,2511),[2519,2520),
[2524,2526),[2527,2532),[2534,2546),[2548,2554),[2556,2557),[2558,2559),[2561,2564),[2565,2571),[2575,2577),
[2579,2601),[2602,2609),[2610,2612),[2613,2615),[2616,2618),[2620,2621),[2622,2627),[2631,2633),[2635,2638),
[2641,2642),[2649,2653),[2654,2655),[2662,2678),[2689,2692),[2693,2702),[2703,2706),[2707,2729),[2730,2737),
[2738,2740),[2741,2746),[2748,2758),[2759,2762),[2763,2766),[2768,2769),[2784,2788),[2790,2800),[2809,2816),
[2817,2820),[2821,2829),[2831,2833),[2835,2857),[2858,2865),[2866,2868),[2869,2874),[2876,2885),[2887,2889),
[2891,2894),[2901,2904),[2908,2910),[2911,2916),[2918,2928),[2929,2936),[2946,2948),[2949,2955),[2958,2961),
[2962,2966),[2969,2971),[2972,2973),[2974,2976),[2979,2981),[2984,2987),[2990,3002),[3006,3011),[3014,3017),
[3018,3022),[3024,3025),[3031,3032),[3046,3059),[3072,3085),[3086,3089),[3090,3113),[3114,3130),[3132,3141),
[3142,3145),[3146,3150),[3157,3159),[3160,3163),[3164,3166),[3168,3172),[3174,3184),[3192,3199),[3200,3204),
[3205,3213),[3214,3217),[3218,3241),[3242,3252),[3253,3258),[3260,3269),[3270,3273),[3274,3278),[3285,3287),
[3292,3295),[3296,3300),[3302,3312),[3313,3316),[3328,3341),[3342,3345),[3346,3397),[3398,3401),[3402,3407),
[3412,3428),[3430,3449),[3450,3456),[3457,3460),[3461,3479),[3482,3506),[3507,3516),[3517,3518),[3520,3527),
[3530,3531),[3535,3541),[3542,3543),[3544,3552),[3558,3568),[3570,3572),[3585,3643),[3648,3663),[3664,3674),
[3713,3715),[3716,3717),[3718,3723),[3724,3748),[3749,3750),[3751,3774),[3776,3781),[3782,3783),[3784,3791),
[3792,3802),[3804,3808),[3840,3841),[3864,3866),[3872,3892),[3893,3894),[3895,3896),[3897,3898),[3902,3912),
[3913,3949),[3953,3973),[3974,3992),[3993,4029),[4038,4039),[4096,4170),[4176,4254),[4256,4294),[4295,4296),
[4301,4302),[4304,4347),[4348,4681),[4682,4686),[4688,4695),[4696,4697),[4698,4702),[4704,4745),[4746,4750),
[4752,4785),[4786,4790),[4792,4799),[4800,4801),[4802,4806),[4808,4823),[4824,4881),[4882,4886),[4888,4955),
[4957,4960),[4969,4989),[4992,5008),[5024,5110),[5112,5118),[5121,5741),[5743,5760),[5761,5787),[5792,5867),
[5870,5881),[5888,5910),[5919,5941),[5952,5972),[5984,5997),[5998,6001),[6002,6004),[6016,6100),[6103,6104),
[6108,6110),[6112,6122),[6128,6138),[6155,6158),[6159,6170),[6176,6265),[6272,6315),[6320,6390),[6400,6431),
[6432,6444),[6448,6460),[6470,6510),[6512,6517),[6528,6572),[6576,6602),[6608,6619),[6656,6684),[6688,6751),
[6752,6781),[6783,6794),[6800,6810),[6823,6824),[6832,6878),[6880,6892),[6912,6989),[6992,7002),[7019,7028),
[7040,7156),[7168,7224),[7232,7242),[7245,7294),[7296,7307),[7312,7355),[7357,7360),[7376,7379),[7380,7419),
[7424,7958),[7960,7966),[7968,8006),[8008,8014),[8016,8024),[8025,8026),[8027,8028),[8029,8030),[8031,8062),
[8064,8117),[8118,8125),[8126,8127),[8130,8133),[8134,8141),[8144,8148),[8150,8156),[8160,8173),[8178,8181),
[8182,8189),[8304,8306),[8308,8314),[8319,8330),[8336,8349),[8400,8433),[8450,8451),[8455,8456),[8458,8468),
[8469,8470),[8473,8478),[8484,8485),[8486,8487),[8488,8489),[8490,8494),[8495,8506),[8508,8512),[8517,8522),
[8526,8527),[8528,8586),[9312,9372),[9450,9472),[10102,10132),[11264,11493),[11499,11508),[11517,11518),
[11520,11558),[11559,11560),[11565,11566),[11568,11624),[11631,11632),[11647,11671),[11680,11687),
[11688,11695),[11696,11703),[11704,11711),[11712,11719),[11720,11727),[11728,11735),[11736,11743),
[11744,11776),[11823,11824),[12293,12296),[12321,12336),[12337,12342),[12344,12349),[12353,12439),
[12441,12443),[12445,12448),[12449,12539),[12540,12544),[12549,12592),[12593,12687),[12690,12694),
[12704,12736),[12784,12800),[12832,12842),[12872,12880),[12881,12896),[12928,12938),[12977,12992),
[13312,19904),[19968,42125),[42192,42238),[42240,42509),[42512,42540),[42560,42611),[42612,42622),
[42623,42738),[42775,42784),[42786,42889),[42891,42973),[42993,43048),[43052,43053),[43056,43062),
[43072,43124),[43136,43206),[43216,43226),[43232,43256),[43259,43260),[43261,43310),[43312,43348),
[43360,43389),[43392,43457),[43471,43482),[43488,43519),[43520,43575),[43584,43598),[43600,43610),
[43616,43639),[43642,43715),[43739,43742),[43744,43760),[43762,43767),[43777,43783),[43785,43791),
[43793,43799),[43808,43815),[43816,43823),[43824,43867),[43868,43882),[43888,44011),[44012,44014),
[44016,44026),[44032,55204),[55216,55239),[55243,55292),[63744,64110),[64112,64218),[64256,64263),
[64275,64280),[64285,64297),[64298,64311),[64312,64317),[64318,64319),[64320,64322),[64323,64325),
[64326,64434),[64467,64830),[64848,64912),[64914,64968),[65008,65020),[65024,65040),[65056,65072),
[65136,65141),[65142,65277),[65296,65306),[65313,65339),[65345,65371),[65382,65471),[65474,65480),
[65482,65488),[65490,65496),[65498,65501),[65536,65548),[65549,65575),[65576,65595),[65596,65598),
[65599,65614),[65616,65630),[65664,65787),[65799,65844),[65856,65913),[65930,65932),[66045,66046),
[66176,66205),[66208,66257),[66272,66300),[66304,66340),[66349,66379),[66384,66427),[66432,66462),
[66464,66500),[66504,66512),[66513,66518),[66560,66718),[66720,66730),[66736,66772),[66776,66812),
[66816,66856),[66864,66916),[66928,66939),[66940,66955),[66956,66963),[66964,66966),[66967,66978),
[66979,66994),[66995,67002),[67003,67005),[67008,67060),[67072,67383),[67392,67414),[67424,67432),
[67456,67462),[67463,67505),[67506,67515),[67584,67590),[67592,67593),[67594,67638),[67639,67641),
[67644,67645),[67647,67670),[67672,67703),[67705,67743),[67751,67760),[67808,67827),[67828,67830),
[67835,67868),[67872,67898),[67904,67930),[67968,68024),[68028,68048),[68050,68100),[68101,68103),
[68108,68116),[68117,68120),[68121,68150),[68152,68155),[68159,68169),[68192,68223),[68224,68256),
[68288,68296),[68297,68327),[68331,68336),[68352,68406),[68416,68438),[68440,68467),[68472,68498),
[68521,68528),[68608,68681),[68736,68787),[68800,68851),[68858,68904),[68912,68922),[68928,68966),
[68969,68974),[68975,68998),[69216,69247),[69248,69290),[69291,69293),[69296,69298),[69314,69320),
[69370,69416),[69424,69461),[69488,69510),[69552,69580),[69600,69623),[69632,69703),[69714,69750),
[69759,69819),[69826,69827),[69840,69865),[69872,69882),[69888,69941),[69942,69952),[69956,69960),
[69968,70004),[70006,70007),[70016,70085),[70089,70093),[70094,70107),[70108,70109),[70113,70133),
[70144,70162),[70163,70200),[70206,70210),[70272,70279),[70280,70281),[70282,70286),[70287,70302),
[70303,70313),[70320,70379),[70384,70394),[70400,70404),[70405,70413),[70415,70417),[70419,70441),
[70442,70449),[70450,70452),[70453,70458),[70459,70469),[70471,70473),[70475,70478),[70480,70481),
[70487,70488),[70493,70500),[70502,70509),[70512,70517),[70528,70538),[70539,70540),[70542,70543),
[70544,70582),[70583,70593),[70594,70595),[70597,70598),[70599,70603),[70604,70612),[70625,70627),
[70656,70731),[70736,70746),[70750,70754),[70784,70854),[70855,70856),[70864,70874),[71040,71094),
[71096,71105),[71128,71134),[71168,71233),[71236,71237),[71248,71258),[71296,71353),[71360,71370),
[71376,71396),[71424,71451),[71453,71468),[71472,71484),[71488,71495),[71680,71739),[71840,71923),
[71935,71943),[71945,71946),[71948,71956),[71957,71959),[71960,71990),[71991,71993),[71995,72004),
[72016,72026),[72096,72104),[72106,72152),[72154,72162),[72163,72165),[72192,72255),[72263,72264),
[72272,72346),[72349,72350),[72368,72441),[72544,72552),[72640,72673),[72688,72698),[72704,72713),
[72714,72759),[72760,72769),[72784,72813),[72818,72848),[72850,72872),[72873,72887),[72960,72967),
[72968,72970),[72971,73015),[73018,73019),[73020,73022),[73023,73032),[73040,73050),[73056,73062),
[73063,73065),[73066,73103),[73104,73106),[73107,73113),[73120,73130),[73136,73180),[73184,73194),
[73440,73463),[73472,73489),[73490,73531),[73534,73539),[73552,73563),[73648,73649),[73664,73685),
[73728,74650),[74752,74863),[74880,75076),[77712,77809),[77824,78896),[78912,78934),[78944,82939),
[82944,83527),[90368,90426),[92160,92729),[92736,92767),[92768,92778),[92784,92863),[92864,92874),
[92880,92910),[92912,92917),[92928,92983),[92992,92996),[93008,93018),[93019,93026),[93027,93048),
[93053,93072),[93504,93549),[93552,93562),[93760,93847),[93856,93881),[93883,93908),[93952,94027),
[94031,94088),[94095,94112),[94176,94178),[94179,94181),[94192,94199),[94208,101590),[101631,101663),
[101760,101875),[110576,110580),[110581,110588),[110589,110591),[110592,110883),[110898,110899),
[110928,110931),[110933,110934),[110948,110952),[110960,111356),[113664,113771),[113776,113789),
[113792,113801),[113808,113818),[113821,113823),[118000,118010),[118528,118574),[118576,118599),
[119141,119146),[119149,119155),[119163,119171),[119173,119180),[119210,119214),[119362,119365),
[119488,119508),[119520,119540),[119648,119673),[119808,119893),[119894,119965),[119966,119968),
[119970,119971),[119973,119975),[119977,119981),[119982,119994),[119995,119996),[119997,120004),
[120005,120070),[120071,120075),[120077,120085),[120086,120093),[120094,120122),[120123,120127),
[120128,120133),[120134,120135),[120138,120145),[120146,120486),[120488,120513),[120514,120539),
[120540,120571),[120572,120597),[120598,120629),[120630,120655),[120656,120687),[120688,120713),
[120714,120745),[120746,120771),[120772,120780),[120782,120832),[121344,121399),[121403,121453),
[121461,121462),[121476,121477),[121499,121504),[121505,121520),[122624,122655),[122661,122667),
[122880,122887),[122888,122905),[122907,122914),[122915,122917),[122918,122923),[122928,122990),
[123023,123024),[123136,123181),[123184,123198),[123200,123210),[123214,123215),[123536,123567),
[123584,123642),[124112,124154),[124368,124411),[124608,124639),[124640,124662),[124670,124672),
[124896,124903),[124904,124908),[124909,124911),[124912,124927),[124928,125125),[125127,125143),
[125184,125260),[125264,125274),[126065,126124),[126125,126128),[126129,126133),[126209,126254),
[126255,126270),[126464,126468),[126469,126496),[126497,126499),[126500,126501),[126503,126504),
[126505,126515),[126516,126520),[126521,126522),[126523,126524),[126530,126531),[126535,126536),
[126537,126538),[126539,126540),[126541,126544),[126545,126547),[126548,126549),[126551,126552),
[126553,126554),[126555,126556),[126557,126558),[126559,126560),[126561,126563),[126564,126565),
[126567,126571),[126572,126579),[126580,126584),[126585,126589),[126590,126591),[126592,126602),
[126603,126620),[126625,126628),[126629,126634),[126635,126652),[127232,127245),[130032,130042),
[131072,173792),[173824,178206),[178208,183982),[183984,191457),[191472,192094),[194560,195102),
[196608,201547),[201552,210042),[917760,918000)}'::int4multirange $$;

-- /^[\p{L}\p{N}\p{M}_.@+=-]{1,160}$/u
CREATE FUNCTION crm_upgrade.is_identity_handle(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value IS NOT NULL AND length(value) BETWEEN 1 AND 160 AND NOT EXISTS (
    SELECT 1 FROM regexp_split_to_table(value, '') AS c(ch)
    WHERE c.ch NOT IN ('_', '.', '@', '+', '=', '-') AND NOT crm_upgrade.letter_number_mark() @> ascii(c.ch)
  )
$$;

-- The provider handle extraction shared by participantLookupValue and canonicalChannel.
CREATE FUNCTION crm_upgrade.provider_handle(provider text, value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT crm_upgrade.decode_uri_component(regexp_replace(regexp_replace(
    COALESCE(CASE provider
      WHEN 'linkedin' THEN (regexp_match(value, '[lL][iI][nN][kK][eE][dD][iI][nN]\.[cC][oO][mM]/[iI][nN]/([^/?#]+)'))[1]
      WHEN 'telegram' THEN (regexp_match(value, '[tT]\.[mM][eE]/([^/?#]+)'))[1]
      WHEN 'instagram' THEN (regexp_match(value, '[iI][nN][sS][tT][aA][gG][rR][aA][mM]\.[cC][oO][mM]/([^/?#]+)'))[1]
    END, value), '^@', ''), '/+$', ''))
$$;

-- prisma/record-migrations/v3/participant-identities.ts participantLookupValue (repair: derives a lookup key).
CREATE FUNCTION crm_upgrade.participant_lookup_value(p_provider text, p_raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_value text := crm_upgrade.js_trim(p_raw);
  v_phone text;
  v_handle text;
BEGIN
  IF (v_value IS NULL OR v_value = '') IS NOT FALSE THEN RETURN NULL; END IF;
  IF p_provider IN ('mail', 'google', 'outlook') THEN
    RETURN CASE WHEN crm_upgrade.is_email(v_value) THEN lower(v_value) ELSE v_value END;
  END IF;
  IF p_provider = 'whatsapp' THEN
    v_phone := '+' || regexp_replace(v_value, '[^0-9]', '', 'g');
    RETURN CASE WHEN crm_upgrade.is_e164(v_phone) THEN v_phone ELSE v_value END;
  END IF;
  v_handle := crm_upgrade.provider_handle(p_provider, v_value);
  RETURN CASE WHEN crm_upgrade.is_identity_handle(v_handle) THEN v_handle ELSE v_value END;
END
$$;

-- prisma/record-migrations/v2/identity.ts canonicalChannel (validation only; NULL = invalid).
CREATE FUNCTION crm_upgrade.canonical_channel(p_provider text, p_raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_value text := crm_upgrade.js_trim(p_raw);
  v_phone text;
  v_handle text;
BEGIN
  IF p_provider IN ('mail', 'google', 'outlook') THEN
    RETURN CASE WHEN crm_upgrade.is_email(v_value) THEN lower(v_value) END;
  END IF;
  IF p_provider = 'whatsapp' THEN
    v_phone := '+' || regexp_replace(v_value, '[^0-9]', '', 'g');
    RETURN CASE WHEN crm_upgrade.is_e164(v_phone) THEN v_phone END;
  END IF;
  v_handle := crm_upgrade.provider_handle(p_provider, v_value);
  RETURN CASE WHEN crm_upgrade.is_identity_handle(v_handle) THEN v_handle END;
END
$$;

-- WHATWG IPv4 number parser; NULL on failure.
CREATE FUNCTION crm_upgrade.url_ipv4_number(p_part text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_radix integer := 10;
  v_input text := p_part;
  v_result numeric := 0;
BEGIN
  IF (v_input = '') IS NOT FALSE THEN RETURN NULL; END IF;
  IF length(v_input) >= 2 AND lower(left(v_input, 2)) = '0x' THEN
    v_radix := 16;
    v_input := substr(v_input, 3);
  ELSIF length(v_input) >= 2 AND left(v_input, 1) = '0' THEN
    v_radix := 8;
    v_input := substr(v_input, 2);
  END IF;
  IF v_input = '' THEN RETURN 0; END IF;
  IF ((v_radix = 10 AND v_input !~ '^[0-9]+$') OR (v_radix = 16 AND v_input !~ '^[0-9A-Fa-f]+$') OR (v_radix = 8 AND v_input !~ '^[0-7]+$')) IS NOT FALSE THEN
    RETURN NULL;
  END IF;
  FOR v_index IN 1..length(v_input) LOOP
    v_result := v_result * v_radix + (position(lower(substr(v_input, v_index, 1)) IN '0123456789abcdef') - 1);
  END LOOP;
  RETURN v_result;
END
$$;

-- WHATWG "ends in a number" followed by the IPv4 parser. Returns NULL when the host is not IPv4-like,
-- true when it is a valid IPv4 address and false when parsing fails.
CREATE FUNCTION crm_upgrade.url_ipv4_valid(p_host text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_parts text[] := string_to_array(p_host, '.');
  v_last text;
  v_numbers numeric[] := ARRAY[]::numeric[];
  v_number numeric;
BEGIN
  IF v_parts[array_length(v_parts, 1)] = '' THEN
    IF (array_length(v_parts, 1) = 1) IS NOT FALSE THEN RETURN NULL; END IF;
    v_parts := v_parts[1:array_length(v_parts, 1) - 1];
  END IF;
  v_last := v_parts[array_length(v_parts, 1)];
  IF (NOT (v_last <> '' AND v_last ~ '^[0-9]+$') AND crm_upgrade.url_ipv4_number(v_last) IS NULL) IS NOT FALSE THEN RETURN NULL; END IF;
  IF (array_length(v_parts, 1) > 4) IS NOT FALSE THEN RETURN false; END IF;
  FOREACH v_last IN ARRAY v_parts LOOP
    v_number := crm_upgrade.url_ipv4_number(v_last);
    IF (v_number IS NULL) IS NOT FALSE THEN RETURN false; END IF;
    v_numbers := v_numbers || v_number;
  END LOOP;
  FOR v_index IN 1..array_length(v_numbers, 1) - 1 LOOP
    IF (v_numbers[v_index] > 255) IS NOT FALSE THEN RETURN false; END IF;
  END LOOP;
  RETURN v_numbers[array_length(v_numbers, 1)] < 256::numeric ^ (5 - array_length(v_numbers, 1));
END
$$;

-- WHATWG IPv6 parser (validity only).
CREATE FUNCTION crm_upgrade.url_ipv6_valid(p_input text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_pieces integer := 0;
  v_compress integer := NULL;
  v_pointer integer := 1;
  v_total integer := length(p_input);
  v_c text;
  v_length integer;
  v_numbers_seen integer;
  v_ipv4_piece integer;
  v_hex text;
BEGIN
  IF substr(p_input, 1, 1) = ':' THEN
    IF (substr(p_input, 2, 1) <> ':') IS NOT FALSE THEN RETURN false; END IF;
    v_pointer := 3;
    v_pieces := 1;
    v_compress := 1;
  END IF;
  WHILE v_pointer <= v_total LOOP
    IF (v_pieces = 8) IS NOT FALSE THEN RETURN false; END IF;
    v_c := substr(p_input, v_pointer, 1);
    IF v_c = ':' THEN
      IF (v_compress IS NOT NULL) IS NOT FALSE THEN RETURN false; END IF;
      v_pointer := v_pointer + 1;
      v_pieces := v_pieces + 1;
      v_compress := v_pieces;
      CONTINUE;
    END IF;
    v_length := 0;
    WHILE v_length < 4 AND v_pointer <= v_total AND substr(p_input, v_pointer, 1) ~ '^[0-9A-Fa-f]$' LOOP
      v_pointer := v_pointer + 1;
      v_length := v_length + 1;
    END LOOP;
    v_c := substr(p_input, v_pointer, 1);
    IF v_pointer <= v_total AND v_c = '.' THEN
      IF (v_length = 0) IS NOT FALSE THEN RETURN false; END IF;
      v_pointer := v_pointer - v_length;
      IF (v_pieces > 6) IS NOT FALSE THEN RETURN false; END IF;
      v_numbers_seen := 0;
      WHILE v_pointer <= v_total LOOP
        v_ipv4_piece := NULL;
        IF v_numbers_seen > 0 THEN
          IF substr(p_input, v_pointer, 1) = '.' AND v_numbers_seen < 4 THEN
            v_pointer := v_pointer + 1;
          ELSE
            RETURN false;
          END IF;
        END IF;
        IF (v_pointer > v_total OR substr(p_input, v_pointer, 1) !~ '^[0-9]$') IS NOT FALSE THEN RETURN false; END IF;
        WHILE v_pointer <= v_total AND substr(p_input, v_pointer, 1) ~ '^[0-9]$' LOOP
          IF v_ipv4_piece IS NULL THEN
            v_ipv4_piece := substr(p_input, v_pointer, 1)::integer;
          ELSIF (v_ipv4_piece = 0) IS NOT FALSE THEN
            RETURN false;
          ELSE
            v_ipv4_piece := v_ipv4_piece * 10 + substr(p_input, v_pointer, 1)::integer;
          END IF;
          IF (v_ipv4_piece > 255) IS NOT FALSE THEN RETURN false; END IF;
          v_pointer := v_pointer + 1;
        END LOOP;
        v_numbers_seen := v_numbers_seen + 1;
        IF v_numbers_seen = 2 OR v_numbers_seen = 4 THEN v_pieces := v_pieces + 1; END IF;
      END LOOP;
      IF (v_numbers_seen <> 4) IS NOT FALSE THEN RETURN false; END IF;
      EXIT;
    ELSIF v_pointer <= v_total AND v_c = ':' THEN
      v_pointer := v_pointer + 1;
      IF (v_pointer > v_total) IS NOT FALSE THEN RETURN false; END IF;
    ELSIF (v_pointer <= v_total) IS NOT FALSE THEN
      RETURN false;
    END IF;
    v_pieces := v_pieces + 1;
  END LOOP;
  IF v_compress IS NOT NULL THEN
    RETURN true;
  END IF;
  RETURN COALESCE((v_pieces = 8), false);
END
$$;

-- RFC 3492 Punycode decoding of one "xn--" label body; NULL on failure.
CREATE FUNCTION crm_upgrade.punycode_decode(p_input text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_output integer[] := ARRAY[]::integer[];
  v_n integer := 128;
  v_i bigint := 0;
  v_bias integer := 72;
  v_basic integer := 0;
  v_pointer integer;
  v_oldi bigint;
  v_w bigint;
  v_k integer;
  v_digit integer;
  v_t integer;
  v_c text;
  v_delta bigint;
  v_out_length integer;
BEGIN
  IF (p_input ~ '[^\x01-\x7F]') IS NOT FALSE THEN RETURN NULL; END IF;
  v_basic := length(p_input) - position('-' IN reverse(p_input));
  IF position('-' IN p_input) = 0 THEN v_basic := 0; END IF;
  FOR v_index IN 1..v_basic LOOP
    v_output := v_output || ascii(substr(p_input, v_index, 1));
  END LOOP;
  v_pointer := CASE WHEN v_basic > 0 THEN v_basic + 2 ELSE 1 END;
  WHILE v_pointer <= length(p_input) LOOP
    v_oldi := v_i;
    v_w := 1;
    v_k := 36;
    LOOP
      IF (v_pointer > length(p_input)) IS NOT FALSE THEN RETURN NULL; END IF;
      v_c := substr(p_input, v_pointer, 1);
      v_pointer := v_pointer + 1;
      v_digit := CASE WHEN v_c ~ '^[0-9]$' THEN ascii(v_c) - 22 WHEN v_c ~ '^[A-Z]$' THEN ascii(v_c) - 65 WHEN v_c ~ '^[a-z]$' THEN ascii(v_c) - 97 ELSE 36 END;
      IF (v_digit >= 36) IS NOT FALSE THEN RETURN NULL; END IF;
      v_i := v_i + v_digit * v_w;
      IF (v_i > 2147483647) IS NOT FALSE THEN RETURN NULL; END IF;
      v_t := CASE WHEN v_k <= v_bias THEN 1 WHEN v_k >= v_bias + 26 THEN 26 ELSE v_k - v_bias END;
      EXIT WHEN v_digit < v_t;
      v_w := v_w * (36 - v_t);
      IF (v_w > 2147483647) IS NOT FALSE THEN RETURN NULL; END IF;
      v_k := v_k + 36;
    END LOOP;
    v_out_length := coalesce(array_length(v_output, 1), 0) + 1;
    v_delta := CASE WHEN v_oldi = 0 THEN (v_i - v_oldi) / 700 ELSE (v_i - v_oldi) / 2 END;
    v_delta := v_delta + v_delta / v_out_length;
    v_k := 0;
    WHILE v_delta > 455 LOOP
      v_delta := v_delta / 35;
      v_k := v_k + 36;
    END LOOP;
    v_bias := v_k + (36 * v_delta) / (v_delta + 38);
    v_n := v_n + (v_i / v_out_length)::integer;
    IF (v_n > 1114111) IS NOT FALSE THEN RETURN NULL; END IF;
    v_i := v_i % v_out_length;
    v_output := v_output[1:v_i] || v_n || v_output[v_i + 1:];
    v_i := v_i + 1;
  END LOOP;
  IF coalesce(array_length(v_output, 1), 0) = 0 THEN RETURN ''; END IF;
  RETURN (SELECT string_agg(chr(code), '' ORDER BY ordinality) FROM unnest(v_output) WITH ORDINALITY AS code(code, ordinality));
EXCEPTION WHEN program_limit_exceeded OR invalid_parameter_value THEN
  RETURN NULL;
END
$$;

-- Code point classes of the WHATWG domain-to-ASCII (UTS #46) behaviour of the Node.js runtime that ran
-- the retired upgrade, sampled per code point: accepted inside a label, refused at the start of a label
-- (combining marks), and right-to-left code points that cannot share a label with left-to-right letters.
CREATE FUNCTION crm_upgrade.host_valid_code_points() RETURNS int4multirange
LANGUAGE sql IMMUTABLE AS $$ SELECT '{[161,168),[169,175),[176,180),[181,184),[185,728),[734,888),[891,896),[902,907),[908,909),[910,930),[931,1328),
[1329,1367),[1369,1419),[1421,1424),[1425,1480),[1488,1515),[1519,1525),[1542,1564),[1565,1757),[1758,1806),
[1808,1867),[1869,1970),[1984,2043),[2045,2094),[2096,2111),[2112,2140),[2142,2143),[2144,2155),[2160,2192),
[2199,2274),[2275,2436),[2437,2445),[2447,2449),[2451,2473),[2474,2481),[2482,2483),[2486,2490),[2492,2501),
[2503,2505),[2507,2511),[2519,2520),[2524,2526),[2527,2532),[2534,2559),[2561,2564),[2565,2571),[2575,2577),
[2579,2601),[2602,2609),[2610,2612),[2613,2615),[2616,2618),[2620,2621),[2622,2627),[2631,2633),[2635,2638),
[2641,2642),[2649,2653),[2654,2655),[2662,2679),[2689,2692),[2693,2702),[2703,2706),[2707,2729),[2730,2737),
[2738,2740),[2741,2746),[2748,2758),[2759,2762),[2763,2766),[2768,2769),[2784,2788),[2790,2802),[2809,2816),
[2817,2820),[2821,2829),[2831,2833),[2835,2857),[2858,2865),[2866,2868),[2869,2874),[2876,2885),[2887,2889),
[2891,2894),[2901,2904),[2908,2910),[2911,2916),[2918,2936),[2946,2948),[2949,2955),[2958,2961),[2962,2966),
[2969,2971),[2972,2973),[2974,2976),[2979,2981),[2984,2987),[2990,3002),[3006,3011),[3014,3017),[3018,3022),
[3024,3025),[3031,3032),[3046,3067),[3072,3085),[3086,3089),[3090,3113),[3114,3130),[3132,3141),[3142,3145),
[3146,3150),[3157,3159),[3160,3163),[3164,3166),[3168,3172),[3174,3184),[3191,3213),[3214,3217),[3218,3241),
[3242,3252),[3253,3258),[3260,3269),[3270,3273),[3274,3278),[3285,3287),[3292,3295),[3296,3300),[3302,3312),
[3313,3316),[3328,3341),[3342,3345),[3346,3397),[3398,3401),[3402,3408),[3412,3428),[3430,3456),[3457,3460),
[3461,3479),[3482,3506),[3507,3516),[3517,3518),[3520,3527),[3530,3531),[3535,3541),[3542,3543),[3544,3552),
[3558,3568),[3570,3573),[3585,3643),[3647,3676),[3713,3715),[3716,3717),[3718,3723),[3724,3748),[3749,3750),
[3751,3774),[3776,3781),[3782,3783),[3784,3791),[3792,3802),[3804,3808),[3840,3912),[3913,3949),[3953,3992),
[3993,4029),[4030,4045),[4046,4059),[4096,4294),[4295,4296),[4301,4302),[4304,4681),[4682,4686),[4688,4695),
[4696,4697),[4698,4702),[4704,4745),[4746,4750),[4752,4785),[4786,4790),[4792,4799),[4800,4801),[4802,4806),
[4808,4823),[4824,4881),[4882,4886),[4888,4955),[4957,4989),[4992,5018),[5024,5110),[5112,5118),[5120,5760),
[5761,5789),[5792,5881),[5888,5910),[5919,5943),[5952,5972),[5984,5997),[5998,6001),[6002,6004),[6016,6110),
[6112,6122),[6128,6138),[6144,6170),[6176,6265),[6272,6315),[6320,6390),[6400,6431),[6432,6444),[6448,6460),
[6464,6465),[6468,6510),[6512,6517),[6528,6572),[6576,6602),[6608,6619),[6622,6684),[6686,6751),[6752,6781),
[6783,6794),[6800,6810),[6816,6830),[6832,6878),[6880,6892),[6912,6989),[6990,7156),[7164,7224),[7227,7242),
[7245,7307),[7312,7355),[7357,7368),[7376,7419),[7424,7958),[7960,7966),[7968,8006),[8008,8014),[8016,8024),
[8025,8026),[8027,8028),[8029,8030),[8031,8062),[8064,8117),[8118,8125),[8126,8127),[8130,8133),[8134,8141),
[8144,8148),[8150,8156),[8160,8173),[8175,8176),[8178,8181),[8182,8189),[8203,8204),[8208,8215),[8216,8228),
[8231,8232),[8240,8254),[8255,8263),[8266,8287),[8288,8293),[8298,8306),[8308,8335),[8336,8349),[8352,8386),
[8400,8433),[8450,8453),[8455,8588),[8592,9258),[9280,9291),[9312,9352),[9372,10868),[10869,11124),
[11126,11508),[11513,11558),[11559,11560),[11565,11566),[11568,11624),[11631,11633),[11647,11671),
[11680,11687),[11688,11695),[11696,11703),[11704,11711),[11712,11719),[11720,11727),[11728,11735),
[11736,11743),[11744,11870),[11904,11930),[11931,12020),[12032,12246),[12289,12352),[12353,12439),
[12441,12443),[12445,12544),[12549,12592),[12593,12687),[12688,12774),[12784,12831),[12832,13250),
[13251,13255),[13256,13272),[13273,42125),[42128,42183),[42192,42540),[42560,42744),[42752,42973),
[42993,43053),[43056,43066),[43072,43128),[43136,43206),[43214,43226),[43232,43348),[43359,43389),
[43392,43470),[43471,43482),[43486,43519),[43520,43575),[43584,43598),[43600,43610),[43612,43715),
[43739,43767),[43777,43783),[43785,43791),[43793,43799),[43808,43815),[43816,43823),[43824,43884),
[43888,44014),[44016,44026),[44032,55204),[55216,55239),[55243,55292),[63744,64110),[64112,64218),
[64256,64263),[64275,64280),[64285,64311),[64312,64317),[64318,64319),[64320,64322),[64323,64325),
[64326,64606),[64612,64976),[65008,65018),[65020,65042),[65044,65046),[65047,65049),[65056,65072),
[65073,65095),[65101,65106),[65108,65109),[65111,65119),[65120,65124),[65126,65127),[65129,65130),
[65137,65138),[65139,65140),[65143,65144),[65145,65146),[65147,65148),[65149,65150),[65151,65277),
[65279,65280),[65281,65283),[65284,65285),[65286,65295),[65296,65306),[65307,65308),[65309,65310),
[65313,65339),[65343,65372),[65373,65471),[65474,65480),[65482,65488),[65490,65496),[65498,65501),
[65504,65507),[65508,65511),[65512,65519),[65536,65548),[65549,65575),[65576,65595),[65596,65598),
[65599,65614),[65616,65630),[65664,65787),[65792,65795),[65799,65844),[65847,65935),[65936,65949),
[65952,65953),[66000,66046),[66176,66205),[66208,66257),[66272,66300),[66304,66340),[66349,66379),
[66384,66427),[66432,66462),[66463,66500),[66504,66518),[66560,66718),[66720,66730),[66736,66772),
[66776,66812),[66816,66856),[66864,66916),[66927,66939),[66940,66955),[66956,66963),[66964,66966),
[66967,66978),[66979,66994),[66995,67002),[67003,67005),[67008,67060),[67072,67383),[67392,67414),
[67424,67432),[67456,67462),[67463,67505),[67506,67515),[67584,67590),[67592,67593),[67594,67638),
[67639,67641),[67644,67645),[67647,67670),[67671,67743),[67751,67760),[67808,67827),[67828,67830),
[67835,67868),[67871,67898),[67903,67930),[67968,68024),[68028,68048),[68050,68100),[68101,68103),
[68108,68116),[68117,68120),[68121,68150),[68152,68155),[68159,68169),[68176,68185),[68192,68256),
[68288,68327),[68331,68343),[68352,68406),[68409,68438),[68440,68467),[68472,68498),[68505,68509),
[68521,68528),[68608,68681),[68736,68787),[68800,68851),[68858,68904),[68912,68922),[68928,68966),
[68969,68998),[69006,69008),[69216,69247),[69248,69290),[69291,69294),[69296,69298),[69314,69320),
[69328,69337),[69370,69416),[69424,69466),[69488,69514),[69552,69580),[69600,69623),[69632,69710),
[69714,69750),[69759,69821),[69822,69827),[69840,69865),[69872,69882),[69888,69941),[69942,69960),
[69968,70007),[70016,70112),[70113,70133),[70144,70162),[70163,70210),[70272,70279),[70280,70281),
[70282,70286),[70287,70302),[70303,70314),[70320,70379),[70384,70394),[70400,70404),[70405,70413),
[70415,70417),[70419,70441),[70442,70449),[70450,70452),[70453,70458),[70459,70469),[70471,70473),
[70475,70478),[70480,70481),[70487,70488),[70493,70500),[70502,70509),[70512,70517),[70528,70538),
[70539,70540),[70542,70543),[70544,70582),[70583,70593),[70594,70595),[70597,70598),[70599,70603),
[70604,70614),[70615,70617),[70625,70627),[70656,70748),[70749,70754),[70784,70856),[70864,70874),
[71040,71094),[71096,71134),[71168,71237),[71248,71258),[71264,71277),[71296,71354),[71360,71370),
[71376,71396),[71424,71451),[71453,71468),[71472,71495),[71680,71740),[71840,71923),[71935,71943),
[71945,71946),[71948,71956),[71957,71959),[71960,71990),[71991,71993),[71995,72007),[72016,72026),
[72096,72104),[72106,72152),[72154,72165),[72192,72264),[72272,72355),[72368,72441),[72448,72458),
[72544,72552),[72640,72674),[72688,72698),[72704,72713),[72714,72759),[72760,72774),[72784,72813),
[72816,72848),[72850,72872),[72873,72887),[72960,72967),[72968,72970),[72971,73015),[73018,73019),
[73020,73022),[73023,73032),[73040,73050),[73056,73062),[73063,73065),[73066,73103),[73104,73106),
[73107,73113),[73120,73130),[73136,73180),[73184,73194),[73440,73465),[73472,73489),[73490,73531),
[73534,73563),[73648,73649),[73664,73714),[73727,74650),[74752,74863),[74864,74869),[74880,75076),
[77712,77811),[77824,78896),[78912,78934),[78944,82939),[82944,83527),[90368,90426),[92160,92729),
[92736,92767),[92768,92778),[92782,92863),[92864,92874),[92880,92910),[92912,92918),[92928,92998),
[93008,93018),[93019,93026),[93027,93048),[93053,93072),[93504,93562),[93760,93851),[93856,93881),
[93883,93908),[93952,94027),[94031,94088),[94095,94112),[94176,94181),[94192,94199),[94208,101590),
[101631,101663),[101760,101875),[110576,110580),[110581,110588),[110589,110591),[110592,110883),
[110898,110899),[110928,110931),[110933,110934),[110948,110952),[110960,111356),[113664,113771),
[113776,113789),[113792,113801),[113808,113818),[113820,113828),[117760,118013),[118016,118452),
[118458,118481),[118496,118513),[118528,118574),[118576,118599),[118608,118724),[118784,119030),
[119040,119079),[119081,119275),[119296,119366),[119488,119508),[119520,119540),[119552,119639),
[119648,119673),[119808,119893),[119894,119965),[119966,119968),[119970,119971),[119973,119975),
[119977,119981),[119982,119994),[119995,119996),[119997,120004),[120005,120070),[120071,120075),
[120077,120085),[120086,120093),[120094,120122),[120123,120127),[120128,120133),[120134,120135),
[120138,120145),[120146,120486),[120488,120780),[120782,121484),[121499,121504),[121505,121520),
[122624,122655),[122661,122667),[122880,122887),[122888,122905),[122907,122914),[122915,122917),
[122918,122923),[122928,122990),[123023,123024),[123136,123181),[123184,123198),[123200,123210),
[123214,123216),[123536,123567),[123584,123642),[123647,123648),[124112,124154),[124368,124411),
[124415,124416),[124608,124639),[124640,124662),[124670,124672),[124896,124903),[124904,124908),
[124909,124911),[124912,124927),[124928,125125),[125127,125143),[125184,125260),[125264,125274),
[125278,125280),[126065,126133),[126209,126270),[126464,126468),[126469,126496),[126497,126499),
[126500,126501),[126503,126504),[126505,126515),[126516,126520),[126521,126522),[126523,126524),
[126530,126531),[126535,126536),[126537,126538),[126539,126540),[126541,126544),[126545,126547),
[126548,126549),[126551,126552),[126553,126554),[126555,126556),[126557,126558),[126559,126560),
[126561,126563),[126564,126565),[126567,126571),[126572,126579),[126580,126584),[126585,126589),
[126590,126591),[126592,126602),[126603,126620),[126625,126628),[126629,126634),[126635,126652),
[126704,126706),[126976,127020),[127024,127124),[127136,127151),[127153,127168),[127169,127184),
[127185,127222),[127233,127406),[127462,127491),[127504,127548),[127552,127561),[127568,127570),
[127584,127590),[127744,128729),[128732,128749),[128752,128765),[128768,128986),[128992,129004),
[129008,129009),[129024,129036),[129040,129096),[129104,129114),[129120,129160),[129168,129198),
[129200,129212),[129216,129218),[129232,129241),[129280,129624),[129632,129646),[129648,129661),
[129664,129675),[129678,129735),[129736,129737),[129741,129757),[129759,129771),[129775,129785),
[129792,129939),[129940,130043),[131072,173792),[173824,178206),[178208,183982),[183984,191457),
[191472,192094),[194560,195102),[196608,201547),[201552,210042),[917760,918000)}'::int4multirange $$;
CREATE FUNCTION crm_upgrade.host_non_initial_code_points() RETURNS int4multirange
LANGUAGE sql IMMUTABLE AS $$ SELECT '{[768,837),[838,847),[848,880),[1155,1162),[1425,1470),[1471,1472),[1473,1475),[1476,1478),[1479,1480),
[1552,1563),[1611,1632),[1648,1649),[1750,1757),[1759,1765),[1767,1769),[1770,1774),[1809,1810),[1840,1867),
[1958,1969),[2027,2036),[2045,2046),[2070,2074),[2075,2084),[2085,2088),[2089,2094),[2137,2140),[2259,2274),
[2275,2308),[2362,2365),[2366,2384),[2385,2392),[2402,2404),[2433,2436),[2492,2493),[2494,2501),[2503,2505),
[2507,2510),[2519,2520),[2530,2532),[2558,2559),[2561,2564),[2620,2621),[2622,2627),[2631,2633),[2635,2638),
[2641,2642),[2672,2674),[2677,2678),[2689,2692),[2748,2749),[2750,2758),[2759,2762),[2763,2766),[2786,2788),
[2810,2816),[2817,2820),[2876,2877),[2878,2885),[2887,2889),[2891,2894),[2901,2904),[2914,2916),[2946,2947),
[3006,3011),[3014,3017),[3018,3022),[3031,3032),[3072,3077),[3134,3141),[3142,3145),[3146,3150),[3157,3159),
[3170,3172),[3201,3204),[3260,3261),[3262,3269),[3270,3273),[3274,3278),[3285,3287),[3298,3300),[3328,3332),
[3387,3389),[3390,3397),[3398,3401),[3402,3406),[3415,3416),[3426,3428),[3457,3460),[3530,3531),[3535,3541),
[3542,3543),[3544,3552),[3570,3572),[3633,3634),[3635,3643),[3655,3663),[3761,3762),[3763,3773),[3784,3790),
[3864,3866),[3893,3894),[3895,3896),[3897,3898),[3902,3904),[3953,3973),[3974,3976),[3981,3992),[3993,4029),
[4038,4039),[4139,4159),[4182,4186),[4190,4193),[4194,4197),[4199,4206),[4209,4213),[4226,4238),[4239,4240),
[4250,4254),[4957,4960),[5906,5909),[5938,5941),[5970,5972),[6002,6004),[6070,6100),[6109,6110),[6277,6279),
[6313,6314),[6432,6444),[6448,6460),[6679,6684),[6741,6751),[6752,6781),[6783,6784),[6832,6849),[6912,6917),
[6964,6981),[7019,7028),[7040,7043),[7073,7086),[7142,7156),[7204,7224),[7376,7379),[7380,7401),[7405,7406),
[7412,7413),[7415,7418),[7616,7674),[7675,7680),[8400,8433),[11503,11506),[11647,11648),[11744,11776),
[12330,12336),[12441,12443),[42607,42611),[42612,42622),[42654,42656),[42736,42738),[43010,43011),
[43014,43015),[43019,43020),[43043,43048),[43052,43053),[43136,43138),[43188,43206),[43232,43250),
[43263,43264),[43302,43310),[43335,43348),[43392,43396),[43443,43457),[43493,43494),[43561,43575),
[43587,43588),[43596,43598),[43643,43646),[43696,43697),[43698,43701),[43703,43705),[43710,43712),
[43713,43714),[43755,43760),[43765,43767),[44003,44011),[44012,44014),[64286,64287),[65056,65072),
[65438,65440),[66045,66046),[66272,66273),[66422,66427),[68097,68100),[68101,68103),[68108,68112),
[68152,68155),[68159,68160),[68325,68327),[68900,68904),[69291,69293),[69446,69457),[69632,69635),
[69688,69703),[69759,69763),[69808,69819),[69888,69891),[69927,69941),[69957,69959),[70003,70004),
[70016,70019),[70067,70081),[70089,70093),[70094,70096),[70188,70200),[70206,70207),[70367,70379),
[70400,70404),[70459,70461),[70462,70469),[70471,70473),[70475,70478),[70487,70488),[70498,70500),
[70502,70509),[70512,70517),[70709,70727),[70750,70751),[70832,70852),[71087,71094),[71096,71105),
[71132,71134),[71216,71233),[71339,71352),[71453,71468),[71724,71739),[71984,71990),[71991,71993),
[71995,71999),[72000,72001),[72002,72004),[72145,72152),[72154,72161),[72164,72165),[72193,72203),
[72243,72250),[72251,72255),[72263,72264),[72273,72284),[72330,72346),[72751,72759),[72760,72768),
[72850,72872),[72873,72887),[73009,73015),[73018,73019),[73020,73022),[73023,73030),[73031,73032),
[73098,73103),[73104,73106),[73107,73112),[73459,73463),[92912,92917),[92976,92983),[94031,94032),
[94033,94088),[94095,94099),[94180,94181),[94192,94194),[113821,113823),[119141,119146),[119149,119155),
[119163,119171),[119173,119180),[119210,119214),[119362,119365),[121344,121399),[121403,121453),
[121461,121462),[121476,121477),[121499,121504),[121505,121520),[122880,122887),[122888,122905),
[122907,122914),[122915,122917),[122918,122923),[123184,123191),[123628,123632),[125136,125143),
[125252,125259)}'::int4multirange $$;
CREATE FUNCTION crm_upgrade.host_rtl_code_points() RETURNS int4multirange
LANGUAGE sql IMMUTABLE AS $$ SELECT '{[1470,1471),[1472,1473),[1475,1476),[1478,1479),[1488,1515),[1519,1525),[1544,1545),[1547,1548),[1549,1550),
[1563,1564),[1566,1611),[1645,1648),[1649,1750),[1765,1767),[1774,1776),[1786,1806),[1808,1809),[1810,1840),
[1869,1958),[1969,1970),[1984,2027),[2036,2038),[2042,2043),[2046,2070),[2074,2075),[2084,2085),[2088,2089),
[2096,2111),[2112,2137),[2142,2143),[2144,2155),[2208,2229),[2230,2248),[8501,8505),[64285,64286),
[64287,64297),[64298,64311),[64312,64317),[64318,64319),[64320,64322),[64323,64325),[64326,64450),
[64467,64606),[64612,64830),[64848,64912),[64914,64968),[65008,65018),[65020,65021),[65137,65138),
[65139,65140),[65143,65144),[65145,65146),[65147,65148),[65149,65150),[65151,65277),[67584,67590),
[67592,67593),[67594,67638),[67639,67641),[67644,67645),[67647,67670),[67671,67743),[67751,67760),
[67808,67827),[67828,67830),[67835,67868),[67872,67898),[67903,67904),[67968,68024),[68028,68048),
[68050,68097),[68112,68116),[68117,68120),[68121,68150),[68160,68169),[68176,68185),[68192,68256),
[68288,68325),[68331,68343),[68352,68406),[68416,68438),[68440,68467),[68472,68498),[68505,68509),
[68521,68528),[68608,68681),[68736,68787),[68800,68851),[68858,68900),[69248,69290),[69293,69294),
[69296,69298),[69376,69416),[69424,69446),[69457,69466),[69552,69580),[69600,69623),[124928,125125),
[125127,125136),[125184,125252),[125259,125260),[125264,125274),[125278,125280),[126065,126133),
[126209,126270),[126464,126468),[126469,126496),[126497,126499),[126500,126501),[126503,126504),
[126505,126515),[126516,126520),[126521,126522),[126523,126524),[126530,126531),[126535,126536),
[126537,126538),[126539,126540),[126541,126544),[126545,126547),[126548,126549),[126551,126552),
[126553,126554),[126555,126556),[126557,126558),[126559,126560),[126561,126563),[126564,126565),
[126567,126571),[126572,126579),[126580,126584),[126585,126589),[126590,126591),[126592,126602),
[126603,126620),[126625,126628),[126629,126634),[126635,126652)}'::int4multirange $$;
CREATE FUNCTION crm_upgrade.host_arabic_number_code_points() RETURNS int4multirange
LANGUAGE sql IMMUTABLE AS $$ SELECT '{[1632,1642),[1643,1645),[68912,68922),[69216,69247)}'::int4multirange $$;
CREATE FUNCTION crm_upgrade.host_european_number_code_points() RETURNS int4multirange
LANGUAGE sql IMMUTABLE AS $$ SELECT '{[178,180),[185,186),[188,191),[1776,1786),[8304,8305),[8308,8314),[8320,8330),[8528,8543),[8585,8586),
[9312,9332),[9450,9451),[12881,12896),[12977,12992),[65296,65306),[66273,66300),[118000,118010),
[120782,120832),[130032,130042)}'::int4multirange $$;
CREATE FUNCTION crm_upgrade.host_nonspacing_code_points() RETURNS int4multirange
LANGUAGE sql IMMUTABLE AS $$ SELECT '{[173,174),[768,837),[838,880),[1155,1162),[1425,1470),[1471,1472),[1473,1475),[1476,1478),[1479,1480),
[1552,1563),[1611,1632),[1648,1649),[1750,1757),[1759,1765),[1767,1769),[1770,1774),[1809,1810),[1840,1867),
[1958,1969),[2027,2036),[2045,2046),[2070,2074),[2075,2084),[2085,2088),[2089,2094),[2137,2140),[2259,2274),
[2275,2307),[2362,2363),[2364,2365),[2369,2377),[2381,2382),[2385,2392),[2402,2404),[2433,2434),[2492,2493),
[2497,2501),[2509,2510),[2530,2532),[2558,2559),[2561,2563),[2620,2621),[2625,2627),[2631,2633),[2635,2638),
[2641,2642),[2672,2674),[2677,2678),[2689,2691),[2748,2749),[2753,2758),[2759,2761),[2765,2766),[2786,2788),
[2810,2816),[2817,2818),[2876,2877),[2879,2880),[2881,2885),[2893,2894),[2901,2903),[2914,2916),[2946,2947),
[3008,3009),[3021,3022),[3072,3073),[3076,3077),[3134,3137),[3142,3145),[3146,3150),[3157,3159),[3170,3172),
[3201,3202),[3260,3261),[3276,3278),[3298,3300),[3328,3330),[3387,3389),[3393,3397),[3405,3406),[3426,3428),
[3457,3458),[3530,3531),[3538,3541),[3542,3543),[3633,3634),[3636,3643),[3655,3663),[3761,3762),[3764,3773),
[3784,3790),[3864,3866),[3893,3894),[3895,3896),[3897,3898),[3953,3967),[3968,3973),[3974,3976),[3981,3992),
[3993,4029),[4038,4039),[4141,4145),[4146,4152),[4153,4155),[4157,4159),[4184,4186),[4190,4193),[4209,4213),
[4226,4227),[4229,4231),[4237,4238),[4253,4254),[4447,4449),[4957,4960),[5906,5909),[5938,5941),[5970,5972),
[6002,6004),[6068,6070),[6071,6078),[6086,6087),[6089,6100),[6109,6110),[6155,6160),[6277,6279),[6313,6314),
[6432,6435),[6439,6441),[6450,6451),[6457,6460),[6679,6681),[6683,6684),[6742,6743),[6744,6751),[6752,6753),
[6754,6755),[6757,6765),[6771,6781),[6783,6784),[6832,6849),[6912,6916),[6964,6965),[6966,6971),[6972,6973),
[6978,6979),[7019,7028),[7040,7042),[7074,7078),[7080,7082),[7083,7086),[7142,7143),[7144,7146),[7149,7150),
[7151,7154),[7212,7220),[7222,7224),[7376,7379),[7380,7393),[7394,7401),[7405,7406),[7412,7413),[7416,7418),
[7616,7674),[7675,7680),[8203,8204),[8288,8293),[8298,8304),[8400,8433),[11503,11506),[11647,11648),
[11744,11776),[12290,12291),[12330,12334),[12441,12443),[12644,12645),[42607,42611),[42612,42622),
[42654,42656),[42736,42738),[43010,43011),[43014,43015),[43019,43020),[43045,43047),[43052,43053),
[43204,43206),[43232,43250),[43263,43264),[43302,43310),[43335,43346),[43392,43395),[43443,43444),
[43446,43450),[43452,43454),[43493,43494),[43561,43567),[43569,43571),[43573,43575),[43587,43588),
[43596,43597),[43644,43645),[43696,43697),[43698,43701),[43703,43705),[43710,43712),[43713,43714),
[43756,43758),[43766,43767),[44005,44006),[44008,44009),[44013,44014),[64286,64287),[65024,65040),
[65056,65072),[65279,65280),[65294,65295),[65377,65378),[65438,65441),[66045,66046),[66272,66273),
[66422,66427),[68097,68100),[68101,68103),[68108,68112),[68152,68155),[68159,68160),[68325,68327),
[68900,68904),[69291,69293),[69446,69457),[69633,69634),[69688,69703),[69759,69762),[69811,69815),
[69817,69819),[69888,69891),[69927,69932),[69933,69941),[70003,70004),[70016,70018),[70070,70079),
[70089,70093),[70095,70096),[70191,70194),[70196,70197),[70198,70200),[70206,70207),[70367,70368),
[70371,70379),[70400,70402),[70459,70461),[70464,70465),[70502,70509),[70512,70517),[70712,70720),
[70722,70725),[70726,70727),[70750,70751),[70835,70841),[70842,70843),[70847,70849),[70850,70852),
[71090,71094),[71100,71102),[71103,71105),[71132,71134),[71219,71227),[71229,71230),[71231,71233),
[71339,71340),[71341,71342),[71344,71350),[71351,71352),[71453,71456),[71458,71462),[71463,71468),
[71727,71736),[71737,71739),[71995,71997),[71998,71999),[72003,72004),[72148,72152),[72154,72156),
[72160,72161),[72193,72199),[72201,72203),[72243,72249),[72251,72255),[72263,72264),[72273,72279),
[72281,72284),[72330,72343),[72344,72346),[72752,72759),[72760,72766),[72850,72872),[72874,72881),
[72882,72884),[72885,72887),[73009,73015),[73018,73019),[73020,73022),[73023,73030),[73031,73032),
[73104,73106),[73109,73110),[73111,73112),[73459,73461),[92912,92917),[92976,92983),[94031,94032),
[94095,94099),[94180,94181),[113821,113823),[113824,113828),[119143,119146),[119155,119171),[119173,119180),
[119210,119214),[119362,119365),[121344,121399),[121403,121453),[121461,121462),[121476,121477),
[121499,121504),[121505,121520),[122880,122887),[122888,122905),[122907,122914),[122915,122917),
[122918,122923),[123184,123191),[123628,123632),[125136,125143),[125252,125259),[917760,918000)}'::int4multirange $$;
CREATE FUNCTION crm_upgrade.host_neutral_code_points() RETURNS int4multirange
LANGUAGE sql IMMUTABLE AS $$ SELECT '{[161,168),[169,170),[171,173),[174,175),[176,178),[182,184),[187,188),[191,192),[215,216),[247,248),[697,699),
[706,720),[722,728),[734,736),[741,750),[751,768),[884,886),[894,895),[903,904),[1014,1015),[1418,1419),
[1421,1424),[1542,1544),[1545,1547),[1548,1549),[1550,1552),[1642,1643),[1758,1759),[1769,1770),[2038,2042),
[2546,2548),[2555,2556),[2801,2802),[3059,3067),[3192,3199),[3647,3648),[3898,3902),[5008,5018),[5120,5121),
[5787,5789),[6107,6108),[6128,6138),[6144,6155),[6464,6465),[6468,6470),[6622,6656),[8175,8176),[8208,8215),
[8216,8228),[8231,8232),[8240,8254),[8255,8263),[8266,8287),[8314,8319),[8330,8335),[8352,8360),[8361,8384),
[8452,8453),[8456,8457),[8468,8469),[8471,8473),[8478,8480),[8483,8484),[8485,8486),[8487,8488),[8489,8490),
[8494,8495),[8506,8507),[8512,8517),[8522,8526),[8543,8544),[8586,8588),[8592,9014),[9083,9109),[9110,9255),
[9280,9291),[9332,9352),[9451,9900),[9901,10240),[10496,10868),[10869,11124),[11126,11158),[11159,11264),
[11493,11499),[11513,11520),[11776,11859),[11904,11930),[11931,11935),[11936,12019),[12289,12290),
[12291,12293),[12296,12321),[12336,12337),[12342,12344),[12349,12352),[12448,12449),[12539,12540),
[12736,12772),[19904,19968),[42128,42183),[42509,42512),[42611,42612),[42622,42624),[42752,42786),
[42888,42889),[43048,43052),[43064,43066),[43124,43128),[43882,43884),[64297,64298),[64830,64832),
[65021,65022),[65040,65042),[65044,65046),[65047,65049),[65073,65095),[65101,65106),[65108,65109),
[65111,65119),[65120,65124),[65126,65127),[65129,65130),[65281,65283),[65284,65285),[65286,65294),
[65307,65308),[65309,65310),[65343,65345),[65371,65372),[65373,65377),[65378,65382),[65504,65507),
[65508,65511),[65512,65519),[65793,65794),[65856,65933),[65936,65949),[65952,65953),[67871,67872),
[68409,68416),[69714,69734),[71264,71277),[73685,73714),[94178,94179),[119296,119362),[119365,119366),
[119552,119639),[120513,120514),[120539,120540),[120571,120572),[120597,120598),[120629,120630),
[120655,120656),[120687,120688),[120713,120714),[120745,120746),[120771,120772),[123647,123648),
[126704,126706),[126976,127020),[127024,127124),[127136,127151),[127153,127168),[127169,127184),
[127185,127222),[127233,127248),[127279,127280),[127341,127344),[127405,127406),[127584,127590),
[127744,128728),[128736,128749),[128752,128765),[128768,128884),[128896,128985),[128992,129004),
[129024,129036),[129040,129096),[129104,129114),[129120,129160),[129168,129198),[129200,129202),
[129280,129401),[129402,129484),[129485,129620),[129632,129646),[129648,129653),[129656,129659),
[129664,129671),[129680,129705),[129712,129719),[129728,129731),[129744,129751),[129792,129939),
[129940,129995)}'::int4multirange $$;

-- Bidirectional class of a host code point as the sampled implementation sees it: R (right-to-left letters),
-- AN (Arabic digits), EN (European digits), NSM (non-spacing marks), O (other neutrals) or L (left-to-right).
CREATE FUNCTION crm_upgrade.host_bidi_class(p_cp integer) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE
    WHEN p_cp < 128 THEN CASE WHEN p_cp BETWEEN 48 AND 57 THEN 'EN' WHEN p_cp BETWEEN 65 AND 90 OR p_cp BETWEEN 97 AND 122 THEN 'L' ELSE 'O' END
    WHEN crm_upgrade.host_rtl_code_points() @> p_cp THEN 'R'
    WHEN crm_upgrade.host_arabic_number_code_points() @> p_cp THEN 'AN'
    WHEN crm_upgrade.host_european_number_code_points() @> p_cp THEN 'EN'
    WHEN crm_upgrade.host_nonspacing_code_points() @> p_cp THEN 'NSM'
    WHEN crm_upgrade.host_neutral_code_points() @> p_cp THEN 'O'
    ELSE 'L' END
$$;

-- Validity of one non-ASCII domain label: every code point is accepted by UTS #46 and the label does not start
-- with a combining mark.
CREATE FUNCTION crm_upgrade.url_unicode_label_valid(p_label text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  WITH code AS (SELECT ascii(c.ch) AS cp, c.n FROM regexp_split_to_table(p_label, '') WITH ORDINALITY AS c(ch, n))
  SELECT NOT EXISTS (SELECT 1 FROM code WHERE cp > 127 AND NOT crm_upgrade.host_valid_code_points() @> cp)
    AND NOT EXISTS (SELECT 1 FROM code WHERE n = 1 AND crm_upgrade.host_non_initial_code_points() @> cp)
$$;

-- The bidirectional label rule of a domain that contains right-to-left letters or Arabic digits, as the
-- runtime applies it: trailing marks are ignored; a label that starts with a left-to-right letter or holds no
-- right-to-left letter or Arabic digit may not contain them before its last code point; any other label holds
-- no left-to-right letter, ends with R, EN or AN and does not mix EN with AN.
CREATE FUNCTION crm_upgrade.url_bidi_label_valid(p_label text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_classes text[] := ARRAY(SELECT crm_upgrade.host_bidi_class(ascii(c.ch)) FROM regexp_split_to_table(p_label, '') WITH ORDINALITY AS c(ch, n) ORDER BY c.n);
  v_length integer;
BEGIN
  WHILE coalesce(array_length(v_classes, 1), 0) > 0 AND v_classes[array_length(v_classes, 1)] = 'NSM' LOOP
    v_classes := v_classes[1:array_length(v_classes, 1) - 1];
  END LOOP;
  v_length := coalesce(array_length(v_classes, 1), 0);
  IF v_length = 0 THEN RETURN true; END IF;
  IF v_classes[1] = 'L' OR NOT ('R' = ANY (v_classes) OR 'AN' = ANY (v_classes)) THEN
    RETURN COALESCE((NOT ('R' = ANY (v_classes[1:v_length - 1]) OR 'AN' = ANY (v_classes[1:v_length - 1]))), false);
  END IF;
  RETURN COALESCE((NOT 'L' = ANY (v_classes) AND v_classes[v_length] IN ('R', 'EN', 'AN')
    AND NOT ('EN' = ANY (v_classes) AND 'AN' = ANY (v_classes))), false);
END
$$;

-- WHATWG host parser for special schemes (validity only).
CREATE FUNCTION crm_upgrade.url_host_valid(p_input text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_bytes bytea := ''::bytea;
  v_position integer := 1;
  v_domain text;
  v_ascii_domain text := '';
  v_label text;
  v_decoded text;
  v_unicode_labels text[] := ARRAY[]::text[];
  v_original text;
BEGIN
  IF left(p_input, 1) = '[' THEN
    IF (right(p_input, 1) <> ']') IS NOT FALSE THEN RETURN false; END IF;
    RETURN COALESCE((crm_upgrade.url_ipv6_valid(substr(p_input, 2, length(p_input) - 2))), false);
  END IF;
  -- Percent-decode, then UTF-8 decode (invalid sequences become U+FFFD, which UTS #46 disallows).
  WHILE v_position <= length(p_input) LOOP
    IF substr(p_input, v_position, 1) = '%' AND substr(p_input, v_position + 1, 2) ~ '^[0-9A-Fa-f]{2}$' THEN
      v_bytes := v_bytes || decode(substr(p_input, v_position + 1, 2), 'hex');
      v_position := v_position + 3;
    ELSE
      v_bytes := v_bytes || convert_to(substr(p_input, v_position, 1), 'UTF8');
      v_position := v_position + 1;
    END IF;
  END LOOP;
  IF (position('\x00'::bytea IN v_bytes) > 0) IS NOT FALSE THEN RETURN false; END IF;
  BEGIN
    v_domain := convert_from(v_bytes, 'UTF8');
  EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character OR invalid_parameter_value THEN
    RETURN false;
  END;
  -- UTS #46 maps these full stops to the label separator.
  v_domain := translate(v_domain, E'\u3002\uFF0E\uFF61', '...');
  FOREACH v_label IN ARRAY string_to_array(v_domain, '.') LOOP
    v_decoded := NULL;
    v_original := v_label;
    IF v_label ~ '[^\x01-\x7F]' THEN
      IF (NOT crm_upgrade.url_unicode_label_valid(v_label)) IS NOT FALSE THEN RETURN false; END IF;
      v_label := lower(regexp_replace(v_label, '[^\x01-\x7F]', 'a', 'g'));
    ELSE
      v_label := lower(v_label);
      IF left(v_label, 4) = 'xn--' THEN
        v_decoded := crm_upgrade.punycode_decode(substr(v_label, 5));
        IF (v_decoded IS NULL OR v_decoded !~ '[^\x01-\x7F]' OR NOT crm_upgrade.url_unicode_label_valid(v_decoded)) IS NOT FALSE THEN
          RETURN false;
        END IF;
      END IF;
    END IF;
    v_unicode_labels := v_unicode_labels || COALESCE(v_decoded, v_original);
    v_ascii_domain := v_ascii_domain || v_label || '.';
  END LOOP;
  -- A domain with right-to-left letters or Arabic digits applies the bidirectional rule to every label.
  IF (EXISTS (SELECT 1 FROM unnest(v_unicode_labels) AS l(label), regexp_split_to_table(l.label, '') AS c(ch)
      WHERE crm_upgrade.host_bidi_class(ascii(c.ch)) IN ('R', 'AN'))
    AND EXISTS (SELECT 1 FROM unnest(v_unicode_labels) AS l(label) WHERE NOT crm_upgrade.url_bidi_label_valid(l.label))) IS NOT FALSE THEN
    RETURN false;
  END IF;
  v_ascii_domain := left(v_ascii_domain, length(v_ascii_domain) - 1);
  IF (v_ascii_domain = '') IS NOT FALSE THEN RETURN false; END IF;
  -- Forbidden domain code points.
  IF (v_ascii_domain ~ '[\x01-\x1F\x20#/:<>?@\[\\\]^|%\x7F]') IS NOT FALSE THEN RETURN false; END IF;
  RETURN COALESCE((COALESCE(crm_upgrade.url_ipv4_valid(v_ascii_domain), true)), false);
END
$$;

-- new URL(value) succeeds and its protocol is http: or https: (scalarMatchesType "url").
CREATE FUNCTION crm_upgrade.is_http_url(p_raw text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  v_input text := regexp_replace(regexp_replace(p_raw, '^[\x01-\x20]+|[\x01-\x20]+$', '', 'g'), '[\t\n\r]', '', 'g');
  v_rest text;
  v_authority text;
  v_hostport text;
  v_host text := '';
  v_port text;
  v_inside boolean := false;
  v_c text;
  v_index integer;
BEGIN
  IF (v_input !~* '^https?:') IS NOT FALSE THEN RETURN false; END IF;
  v_rest := regexp_replace(substr(v_input, position(':' IN v_input) + 1), '^[/\\]+', '');
  v_authority := substring(v_rest FROM '^[^/?#\\]*');
  IF position('@' IN v_authority) > 0 THEN
    v_hostport := substr(v_authority, length(v_authority) - position('@' IN reverse(v_authority)) + 2);
  ELSE
    v_hostport := v_authority;
  END IF;
  IF (v_hostport = '') IS NOT FALSE THEN RETURN false; END IF;
  v_index := 1;
  WHILE v_index <= length(v_hostport) LOOP
    v_c := substr(v_hostport, v_index, 1);
    EXIT WHEN v_c = ':' AND NOT v_inside;
    IF v_c = '[' THEN v_inside := true; ELSIF v_c = ']' THEN v_inside := false; END IF;
    v_host := v_host || v_c;
    v_index := v_index + 1;
  END LOOP;
  IF (v_host = '') IS NOT FALSE THEN RETURN false; END IF;
  IF v_index <= length(v_hostport) THEN
    v_port := substr(v_hostport, v_index + 1);
    IF (v_port !~ '^[0-9]*$') IS NOT FALSE THEN RETURN false; END IF;
    IF (v_port <> '' AND v_port::numeric > 65535) IS NOT FALSE THEN RETURN false; END IF;
  END IF;
  RETURN COALESCE((crm_upgrade.url_host_valid(v_host)), false);
END
$$;

-- z.url({ protocol: /^https?$/ }).max(2000)
CREATE FUNCTION crm_upgrade.is_zod_http_url(raw text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((raw IS NOT NULL AND crm_upgrade.is_http_url(crm_upgrade.js_trim(raw)) AND crm_upgrade.js_len(crm_upgrade.js_trim(raw)) <= 2000), false)
$$;

-- Raise a conversion refusal. Callers record the code against the owning legacy table; row
-- contents are never part of the message.
CREATE FUNCTION crm_upgrade.fail(p_code text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'CRM01', MESSAGE = p_code;
END
$$;

-- Records one refused row. Section 1 reports these grouped by table, field and code.
CREATE FUNCTION crm_upgrade.issue(company_id text, source_table text, field text, code text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO crm_upgrade_issue (company_id, source_table, field, code) VALUES (company_id, source_table, field, code)
$$;

-- Records one explicit repair (counted again independently in section 6).
CREATE FUNCTION crm_upgrade.repair(company_id text, source_table text, row_id text, kind text, detail text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO crm_upgrade_repair (company_id, source_table, row_id, kind, detail) VALUES (company_id, source_table, row_id, kind, detail)
$$;

-- Calculation expression constructors (CalculationExpression JSON).
CREATE FUNCTION crm_upgrade.expr_field(field_id text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('kind', 'field', 'fieldId', field_id) $$;
CREATE FUNCTION crm_upgrade.expr_literal(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('kind', 'literal', 'value', value) $$;
CREATE FUNCTION crm_upgrade.expr_operation(operator text, VARIADIC arguments jsonb[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('kind', 'operation', 'operator', operator, 'arguments', to_jsonb(arguments)) $$;
CREATE FUNCTION crm_upgrade.expr_related(relation_id text, direction text, field_id text, reducer text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('kind', 'related', 'relationId', relation_id, 'direction', direction,
    'expression', crm_upgrade.expr_field(field_id), 'reducer', reducer)
$$;
CREATE FUNCTION crm_upgrade.scalar_text(value text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('kind', 'text', 'value', value) $$;
CREATE FUNCTION crm_upgrade.scalar_decimal(value text, currency text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('kind', 'decimal', 'value', value, 'currency', currency) $$;

-- createCrmPreset(companyId, currency) (v2/contract/crm-preset.ts), field-for-field and in the same order.
CREATE FUNCTION crm_upgrade.crm_preset(p_company_id text, p_currency text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_fields jsonb := '[]';
  v_types jsonb := '[]';
  v_relationships jsonb := '[]';
  v_type_row record;
  v_position integer;
BEGIN
  FOR v_type_row IN SELECT * FROM (VALUES
    (0, 'contact', 'Contact', 'Contacts', 'contact'),
    (1, 'organization', 'Organization', 'Organizations', 'building'),
    (2, 'deal', 'Deal', 'Deals', 'handshake'),
    (3, 'service', 'Service', 'Services', 'package'),
    (4, 'task', 'Task', 'Tasks', 'check'),
    (5, 'lineItem', 'Line item', 'Line items', 'list')) AS t(position, key, label, plural, icon) ORDER BY v_position LOOP
    v_fields := v_fields || jsonb_build_array(
      jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, v_type_row.key || '.name'), 'typeId', crm_upgrade.preset_id(p_company_id, v_type_row.key),
        'label', 'Name', 'valueType', 'text', 'behavior', '{"kind":"input"}'::jsonb, 'required', true, 'archived', false,
        'publishedSummary', false, 'options', '[]'::jsonb, 'position', 0),
      jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, v_type_row.key || '.notes'), 'typeId', crm_upgrade.preset_id(p_company_id, v_type_row.key),
        'label', 'Notes', 'valueType', 'richText', 'behavior', '{"kind":"input"}'::jsonb, 'required', false, 'archived', false,
        'publishedSummary', false, 'options', '[]'::jsonb, 'position', 1));
    v_types := v_types || jsonb_build_array(jsonb_build_object(
      'id', crm_upgrade.preset_id(p_company_id, v_type_row.key), 'label', v_type_row.label, 'pluralLabel', v_type_row.plural,
      'icon', v_type_row.icon, 'description', '', 'primaryFieldId', crm_upgrade.preset_id(p_company_id, v_type_row.key || '.name'),
      'parentRelationshipId', CASE WHEN v_type_row.key = 'lineItem' THEN to_jsonb(crm_upgrade.preset_id(p_company_id, 'lineItem.deal')) ELSE 'null'::jsonb END,
      'archived', false, 'embedded', v_type_row.key = 'lineItem', 'position', v_type_row.position,
      'defaults', jsonb_build_object('columns', jsonb_build_array(crm_upgrade.preset_id(p_company_id, v_type_row.key || '.name')),
        'hiddenColumns', '[]'::jsonb, 'layout', 'table', 'groupBy', NULL, 'sortField', crm_upgrade.preset_id(p_company_id, v_type_row.key || '.name'),
        'sortDirection', 'asc', 'pinnedFields', '[]'::jsonb)));
  END LOOP;
  v_fields := v_fields || jsonb_build_array(
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'contact.firstName'), 'typeId', crm_upgrade.preset_id(p_company_id, 'contact'),
      'label', 'First name', 'valueType', 'text', 'behavior', '{"kind":"input"}'::jsonb, 'required', false, 'archived', false,
      'publishedSummary', false, 'options', '[]'::jsonb, 'position', 2),
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'contact.lastName'), 'typeId', crm_upgrade.preset_id(p_company_id, 'contact'),
      'label', 'Last name', 'valueType', 'text', 'behavior', '{"kind":"input"}'::jsonb, 'required', false, 'archived', false,
      'publishedSummary', false, 'options', '[]'::jsonb, 'position', 3),
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'contact.avatarUrl'), 'typeId', crm_upgrade.preset_id(p_company_id, 'contact'),
      'label', 'Avatar', 'valueType', 'url', 'behavior', '{"kind":"input"}'::jsonb, 'required', false, 'archived', false,
      'publishedSummary', false, 'options', '[]'::jsonb, 'position', 4));
  -- contact.name = trim(concat(coalesce(firstName, ""), " ", coalesce(lastName, "")))
  v_fields := jsonb_set(v_fields, '{0,behavior}', jsonb_build_object('kind', 'formula', 'expression',
    crm_upgrade.expr_operation('trim', crm_upgrade.expr_operation('concat',
      crm_upgrade.expr_operation('coalesce', crm_upgrade.expr_field(crm_upgrade.preset_id(p_company_id, 'contact.firstName')), crm_upgrade.expr_literal(crm_upgrade.scalar_text(''))),
      crm_upgrade.expr_literal(crm_upgrade.scalar_text(' ')),
      crm_upgrade.expr_operation('coalesce', crm_upgrade.expr_field(crm_upgrade.preset_id(p_company_id, 'contact.lastName')), crm_upgrade.expr_literal(crm_upgrade.scalar_text('')))))));
  v_fields := v_fields || jsonb_build_array(jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'service.amount'),
    'typeId', crm_upgrade.preset_id(p_company_id, 'service'), 'label', 'Price', 'valueType', 'currency',
    'behavior', jsonb_build_object('kind', 'input', 'defaultValue', crm_upgrade.scalar_decimal('0', upper(p_currency))),
    'required', true, 'archived', false, 'publishedSummary', false, 'options', '[]'::jsonb, 'position', 2));
  v_types := jsonb_set(v_types, '{3,defaults,columns}', (v_types #> '{3,defaults,columns}') || to_jsonb(crm_upgrade.preset_id(p_company_id, 'service.amount')));
  FOR v_type_row IN SELECT * FROM (VALUES
    (0, 'contact.organizations', 'contact', 'organization', 'Organizations', 'Contacts', 'many', 'many', 'unlink', 'unlink'),
    (1, 'deal.contacts', 'deal', 'contact', 'Contacts', 'Deals', 'many', 'many', 'unlink', 'unlink'),
    (2, 'deal.organizations', 'deal', 'organization', 'Organizations', 'Deals', 'many', 'many', 'unlink', 'unlink'),
    (3, 'task.contacts', 'task', 'contact', 'Contacts', 'Tasks', 'many', 'many', 'unlink', 'unlink'),
    (4, 'task.organizations', 'task', 'organization', 'Organizations', 'Tasks', 'many', 'many', 'unlink', 'unlink'),
    (5, 'task.deals', 'task', 'deal', 'Deals', 'Tasks', 'many', 'many', 'unlink', 'unlink'),
    (6, 'task.services', 'task', 'service', 'Services', 'Tasks', 'many', 'many', 'unlink', 'unlink'),
    (7, 'lineItem.deal', 'lineItem', 'deal', 'Deal', 'Line items', 'one', 'many', 'unlink', 'cascade'),
    (8, 'lineItem.service', 'lineItem', 'service', 'Service', 'Line items', 'one', 'many', 'unlink', 'cascade'))
    AS r(position, key, source, target, source_label, target_label, source_cardinality, target_cardinality, on_source_delete, on_target_delete)
    ORDER BY v_position LOOP
    v_relationships := v_relationships || jsonb_build_array(jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, v_type_row.key),
      'sourceTypeId', crm_upgrade.preset_id(p_company_id, v_type_row.source), 'targetTypeId', crm_upgrade.preset_id(p_company_id, v_type_row.target),
      'sourceLabel', v_type_row.source_label, 'targetLabel', v_type_row.target_label, 'sourceCardinality', v_type_row.source_cardinality,
      'targetCardinality', v_type_row.target_cardinality, 'onSourceDelete', v_type_row.on_source_delete, 'onTargetDelete', v_type_row.on_target_delete,
      'archived', false));
  END LOOP;
  v_fields := v_fields || jsonb_build_array(
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'lineItem.quantity'), 'typeId', crm_upgrade.preset_id(p_company_id, 'lineItem'),
      'label', 'Quantity', 'valueType', 'number', 'behavior', jsonb_build_object('kind', 'input', 'defaultValue', crm_upgrade.scalar_decimal('1', NULL)),
      'required', true, 'archived', false, 'publishedSummary', false, 'options', '[]'::jsonb, 'position', 2),
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'lineItem.pricingMode'), 'typeId', crm_upgrade.preset_id(p_company_id, 'lineItem'),
      'label', 'Pricing', 'valueType', 'select', 'behavior', '{"kind":"input","defaultValue":{"kind":"select","value":"live"}}'::jsonb,
      'required', true, 'archived', false, 'publishedSummary', false,
      'options', '[{"id":"live","label":"Live price","color":null,"attributes":[]},{"id":"saved","label":"Saved price","color":null,"attributes":[]}]'::jsonb,
      'position', 3),
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'lineItem.savedPrice'), 'typeId', crm_upgrade.preset_id(p_company_id, 'lineItem'),
      'label', 'Saved unit price', 'valueType', 'currency', 'behavior', jsonb_build_object('kind', 'snapshot', 'capture', 'whenChanged',
        'allowManualOverride', true, 'triggerFieldId', crm_upgrade.preset_id(p_company_id, 'lineItem.pricingMode'),
        'triggerValue', '{"kind":"select","value":"saved"}'::jsonb,
        'expression', crm_upgrade.expr_related(crm_upgrade.preset_id(p_company_id, 'lineItem.service'), 'outgoing', crm_upgrade.preset_id(p_company_id, 'service.amount'), 'one')),
      'required', false, 'archived', false, 'publishedSummary', false, 'options', '[]'::jsonb, 'position', 4),
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'lineItem.effectivePrice'), 'typeId', crm_upgrade.preset_id(p_company_id, 'lineItem'),
      'label', 'Unit price', 'valueType', 'currency', 'behavior', jsonb_build_object('kind', 'formula', 'expression',
        crm_upgrade.expr_operation('if',
          crm_upgrade.expr_operation('equal', crm_upgrade.expr_field(crm_upgrade.preset_id(p_company_id, 'lineItem.pricingMode')), crm_upgrade.expr_literal('{"kind":"select","value":"saved"}'::jsonb)),
          crm_upgrade.expr_field(crm_upgrade.preset_id(p_company_id, 'lineItem.savedPrice')),
          crm_upgrade.expr_related(crm_upgrade.preset_id(p_company_id, 'lineItem.service'), 'outgoing', crm_upgrade.preset_id(p_company_id, 'service.amount'), 'one'))),
      'required', false, 'archived', false, 'publishedSummary', false, 'options', '[]'::jsonb, 'position', 5),
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'lineItem.amount'), 'typeId', crm_upgrade.preset_id(p_company_id, 'lineItem'),
      'label', 'Amount', 'valueType', 'currency', 'behavior', jsonb_build_object('kind', 'formula', 'expression',
        crm_upgrade.expr_operation('multiply', crm_upgrade.expr_field(crm_upgrade.preset_id(p_company_id, 'lineItem.quantity')), crm_upgrade.expr_field(crm_upgrade.preset_id(p_company_id, 'lineItem.effectivePrice')))),
      'required', false, 'archived', false, 'publishedSummary', false, 'options', '[]'::jsonb, 'position', 6),
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'deal.stage'), 'typeId', crm_upgrade.preset_id(p_company_id, 'deal'),
      'label', 'Stage', 'valueType', 'select', 'behavior', '{"kind":"input"}'::jsonb, 'required', false, 'archived', false,
      'publishedSummary', false, 'options', (SELECT jsonb_agg(jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'deal.stage.' || s.key),
        'label', s.label, 'color', NULL, 'attributes', jsonb_build_array(jsonb_build_object('key', 'probability', 'value', crm_upgrade.scalar_decimal(s.probability, NULL))))
        ORDER BY s.position) FROM (VALUES (0, 'new', 'New', '10'), (1, 'qualified', 'Qualified', '25'), (2, 'proposal', 'Proposal', '60'), (3, 'won', 'Won', '100'), (4, 'lost', 'Lost', '0')) AS s(position, key, label, probability)),
      'position', 2),
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'deal.totalValue'), 'typeId', crm_upgrade.preset_id(p_company_id, 'deal'),
      'label', 'Value', 'valueType', 'currency', 'behavior', jsonb_build_object('kind', 'rollup', 'expression',
        crm_upgrade.expr_related(crm_upgrade.preset_id(p_company_id, 'lineItem.deal'), 'incoming', crm_upgrade.preset_id(p_company_id, 'lineItem.amount'), 'sum')),
      'required', false, 'archived', false, 'publishedSummary', false, 'options', '[]'::jsonb, 'position', 3),
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'deal.totalQuantity'), 'typeId', crm_upgrade.preset_id(p_company_id, 'deal'),
      'label', 'Quantity', 'valueType', 'number', 'behavior', jsonb_build_object('kind', 'rollup', 'expression',
        crm_upgrade.expr_related(crm_upgrade.preset_id(p_company_id, 'lineItem.deal'), 'incoming', crm_upgrade.preset_id(p_company_id, 'lineItem.quantity'), 'sum')),
      'required', false, 'archived', false, 'publishedSummary', false, 'options', '[]'::jsonb, 'position', 4),
    jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'deal.weightedValue'), 'typeId', crm_upgrade.preset_id(p_company_id, 'deal'),
      'label', 'Weighted value', 'valueType', 'currency', 'behavior', jsonb_build_object('kind', 'formula', 'expression',
        crm_upgrade.expr_operation('divide',
          crm_upgrade.expr_operation('multiply', crm_upgrade.expr_field(crm_upgrade.preset_id(p_company_id, 'deal.totalValue')),
            jsonb_build_object('kind', 'optionAttribute', 'fieldId', crm_upgrade.preset_id(p_company_id, 'deal.stage'), 'attribute', 'probability')),
          crm_upgrade.expr_literal(crm_upgrade.scalar_decimal('100', NULL)))),
      'required', false, 'archived', false, 'publishedSummary', false, 'options', '[]'::jsonb, 'position', 5));
  v_types := jsonb_set(v_types, '{2,defaults,columns}', (v_types #> '{2,defaults,columns}') || jsonb_build_array(
    crm_upgrade.preset_id(p_company_id, 'deal.stage'), crm_upgrade.preset_id(p_company_id, 'deal.totalValue'), crm_upgrade.preset_id(p_company_id, 'deal.weightedValue')));
  v_types := jsonb_set(v_types, '{2,defaults,groupBy}', to_jsonb(crm_upgrade.preset_id(p_company_id, 'deal.stage')));
  v_types := jsonb_set(v_types, '{5,defaults,columns}', (v_types #> '{5,defaults,columns}') || jsonb_build_array(
    crm_upgrade.preset_id(p_company_id, 'lineItem.quantity'), crm_upgrade.preset_id(p_company_id, 'lineItem.pricingMode'),
    crm_upgrade.preset_id(p_company_id, 'lineItem.effectivePrice'), crm_upgrade.preset_id(p_company_id, 'lineItem.amount')));
  RETURN jsonb_build_object(
    'revision', 1,
    'types', v_types,
    'fields', v_fields,
    'relationships', v_relationships,
    'accessPresets', '[]'::jsonb,
    'capabilities', jsonb_build_array(
      jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'capability.identity'), 'kind', 'personIdentity', 'typeId', crm_upgrade.preset_id(p_company_id, 'contact'),
        'fields', jsonb_build_array(jsonb_build_object('role', 'firstName', 'fieldId', crm_upgrade.preset_id(p_company_id, 'contact.firstName')),
          jsonb_build_object('role', 'lastName', 'fieldId', crm_upgrade.preset_id(p_company_id, 'contact.lastName')))),
      jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'capability.avatar'), 'kind', 'avatar', 'typeId', crm_upgrade.preset_id(p_company_id, 'contact'),
        'fields', jsonb_build_array(jsonb_build_object('role', 'image', 'fieldId', crm_upgrade.preset_id(p_company_id, 'contact.avatarUrl')))),
      jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'capability.membership'), 'kind', 'membershipAuthorization', 'typeId', crm_upgrade.preset_id(p_company_id, 'task'),
        'fields', '[]'::jsonb)),
    'activityPaths', (SELECT jsonb_agg(jsonb_build_object('id', crm_upgrade.preset_id(p_company_id, 'activities:' || (type.value ->> 'id') || ':self'),
        'typeId', type.value -> 'id', 'label', type.value -> 'pluralLabel', 'path', '[]'::jsonb,
        'includeMessages', type.value ->> 'id' = crm_upgrade.preset_id(p_company_id, 'contact'), 'includeAudit', true, 'archived', false) ORDER BY type.ordinality)
      FROM jsonb_array_elements(v_types) WITH ORDINALITY AS type(value, ordinality) WHERE NOT (type.value ->> 'embedded')::boolean));
END
$$;

-- migratedActivityPaths(companyId, model) (v4/activity-paths.ts): a self path for every type, then the
-- person paths for organizations, deals, services and tasks.
CREATE FUNCTION crm_upgrade.migrated_activity_paths(company_id text, model jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    (SELECT jsonb_agg(jsonb_build_object('id', crm_upgrade.preset_id(company_id, 'activities:' || (type.value ->> 'id') || ':self'),
        'typeId', type.value -> 'id', 'label', type.value -> 'pluralLabel', 'path', '[]'::jsonb,
        'includeMessages', type.value ->> 'id' = crm_upgrade.preset_id(company_id, 'contact'), 'includeAudit', true, 'archived', false) ORDER BY type.ordinality)
      FROM jsonb_array_elements(model -> 'types') WITH ORDINALITY AS type(value, ordinality))
    || (SELECT jsonb_agg(jsonb_build_object('id', crm_upgrade.preset_id(company_id, 'activities:' || crm_upgrade.preset_id(company_id, p.key) || ':people'),
        'typeId', crm_upgrade.preset_id(company_id, p.key), 'label', people.value -> 'pluralLabel', 'path', p.path,
        'includeMessages', true, 'includeAudit', false, 'archived', false) ORDER BY p.position)
      FROM (VALUES
        (0, 'organization', jsonb_build_array(jsonb_build_object('relationId', crm_upgrade.preset_id(company_id, 'contact.organizations'), 'direction', 'incoming'))),
        (1, 'deal', jsonb_build_array(jsonb_build_object('relationId', crm_upgrade.preset_id(company_id, 'deal.contacts'), 'direction', 'outgoing'))),
        (2, 'service', jsonb_build_array(
          jsonb_build_object('relationId', crm_upgrade.preset_id(company_id, 'lineItem.service'), 'direction', 'incoming'),
          jsonb_build_object('relationId', crm_upgrade.preset_id(company_id, 'lineItem.deal'), 'direction', 'outgoing'),
          jsonb_build_object('relationId', crm_upgrade.preset_id(company_id, 'deal.contacts'), 'direction', 'outgoing'))),
        (3, 'task', jsonb_build_array(jsonb_build_object('relationId', crm_upgrade.preset_id(company_id, 'task.contacts'), 'direction', 'outgoing'))))
        AS p(position, key, path)
      CROSS JOIN LATERAL (SELECT type.value FROM jsonb_array_elements(model -> 'types') AS type(value)
        WHERE type.value ->> 'id' = crm_upgrade.preset_id(company_id, 'contact')) AS people)
$$;

-- String.prototype.toUpperCase() restricted to inputs whose result can be three ASCII capitals.
CREATE FUNCTION crm_upgrade.js_upper_currency(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT translate(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(value,
    'ß', 'SS'), 'ı', 'I'), 'ſ', 'S'), 'ﬀ', 'FF'), 'ﬁ', 'FI'), 'ﬂ', 'FL'), 'ﬃ', 'FFI'), 'ﬄ', 'FFL'), 'ﬅ', 'ST'), 'ﬆ', 'ST'),
    'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
$$;

-- LegacyOptionsSchema.safeParse(options ?? {}) (v2/legacy-model.ts): strict top level, permissive items.
CREATE FUNCTION crm_upgrade.legacy_options_valid(options jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((CASE WHEN options IS NULL OR options = 'null'::jsonb THEN true
    WHEN jsonb_typeof(options) <> 'object' THEN false
    ELSE NOT EXISTS (SELECT 1 FROM jsonb_object_keys(options) AS key WHERE key NOT IN ('currency', 'allowMultiple', 'color', 'displayFormat', 'options'))
      AND (NOT options ? 'currency' OR jsonb_typeof(options -> 'currency') = 'string')
      AND (NOT options ? 'allowMultiple' OR jsonb_typeof(options -> 'allowMultiple') = 'boolean')
      AND (NOT options ? 'color' OR jsonb_typeof(options -> 'color') = 'string')
      AND (NOT options ? 'displayFormat' OR jsonb_typeof(options -> 'displayFormat') = 'string')
      AND (NOT options ? 'options' OR (jsonb_typeof(options -> 'options') = 'array' AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(options -> 'options') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'object'
          OR jsonb_typeof(item.value -> 'value') IS DISTINCT FROM 'string' OR crm_upgrade.js_len(item.value ->> 'value') < 1
          OR jsonb_typeof(item.value -> 'label') IS DISTINCT FROM 'string'
          OR jsonb_typeof(item.value -> 'color') IS DISTINCT FROM 'string'
          OR jsonb_typeof(item.value -> 'index') IS DISTINCT FROM 'number'
          OR abs(crm_upgrade.js_parse_number((item.value ->> 'index')::numeric)) = 'Infinity'::float8
          OR jsonb_typeof(item.value -> 'isDefault') IS DISTINCT FROM 'boolean'
          OR (item.value ? 'weight' AND (jsonb_typeof(item.value -> 'weight') <> 'number'
            OR crm_upgrade.js_parse_number((item.value ->> 'weight')::numeric) NOT BETWEEN 0 AND 100))
      )))
  END), false)
$$;

-- buildLegacyFixtureModel (v2/legacy-model.ts): the CRM preset without the unused stage field,
-- one field per legacy custom column, and the weighted value bound to Company.dealWeightingColumnId.
-- Refusals are recorded as issues; the returned model is then only used if no issue exists.
CREATE FUNCTION crm_upgrade.legacy_model(p_company_id text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_company record;
  v_model jsonb;
  v_stage_id text := crm_upgrade.preset_id(p_company_id, 'deal.stage');
  v_column_row record;
  v_column_options jsonb;
  v_defaults jsonb;
  v_field jsonb;
  v_type_id text;
  v_type_index integer;
  v_position integer;
  v_weighted_index integer;
  v_stage jsonb;
BEGIN
  SELECT id, currency::text AS currency, "dealWeightingColumnId" AS weighting INTO v_company FROM "Company" WHERE id = p_company_id;
  v_model := crm_upgrade.crm_preset(p_company_id, v_company.currency);
  v_model := jsonb_set(v_model, '{fields}', (SELECT jsonb_agg(f.value ORDER BY f.ordinality) FROM jsonb_array_elements(v_model -> 'fields') WITH ORDINALITY AS f(value, ordinality) WHERE f.value ->> 'id' <> v_stage_id));
  v_model := jsonb_set(v_model, '{types}', (SELECT jsonb_agg(
      jsonb_set(jsonb_set(t.value, '{defaults,columns}', COALESCE((SELECT jsonb_agg(c.value ORDER BY c.ordinality) FROM jsonb_array_elements(t.value #> '{defaults,columns}') WITH ORDINALITY AS c(value, ordinality) WHERE c.value #>> '{}' <> v_stage_id), '[]'::jsonb)),
        '{defaults,groupBy}', CASE WHEN t.value #>> '{defaults,groupBy}' = v_stage_id THEN 'null'::jsonb ELSE t.value #> '{defaults,groupBy}' END)
      ORDER BY t.ordinality) FROM jsonb_array_elements(v_model -> 'types') WITH ORDINALITY AS t(value, ordinality)));
  FOR v_column_row IN
    SELECT id, "entityType"::text AS entity_type, label, type::text AS type, options FROM "CustomColumn" WHERE "companyId" = p_company_id ORDER BY "createdAt", id
  LOOP
    IF NOT crm_upgrade.is_uuid(v_column_row.id) THEN
      PERFORM crm_upgrade.issue(p_company_id, 'CustomColumn', 'id', 'invalid_column_identifier');
      CONTINUE;
    END IF;
    IF NOT crm_upgrade.legacy_options_valid(v_column_row.options) THEN
      PERFORM crm_upgrade.issue(p_company_id, 'CustomColumn', 'options', 'invalid_options');
      CONTINUE;
    END IF;
    v_column_options := CASE WHEN v_column_row.options IS NULL OR v_column_row.options = 'null'::jsonb THEN '{}'::jsonb ELSE v_column_row.options END;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_model -> 'fields') AS f(value) WHERE f.value ->> 'id' = v_column_row.id) THEN
      PERFORM crm_upgrade.issue(p_company_id, 'CustomColumn', 'id', 'reserved_identifier_collision');
      CONTINUE;
    END IF;
    v_defaults := COALESCE((SELECT jsonb_agg(o.value ORDER BY o.ordinality) FROM jsonb_array_elements(COALESCE(v_column_options -> 'options', '[]')) WITH ORDINALITY AS o(value, ordinality) WHERE (o.value ->> 'isDefault')::boolean), '[]');
    IF jsonb_array_length(v_defaults) > 1 THEN
      PERFORM crm_upgrade.issue(p_company_id, 'CustomColumn', 'options', 'multiple_defaults');
    END IF;
    v_type_id := crm_upgrade.preset_id(p_company_id, v_column_row.entity_type);
    SELECT count(*) INTO v_position FROM jsonb_array_elements(v_model -> 'fields') AS f(value) WHERE f.value ->> 'typeId' = v_type_id;
    v_field := jsonb_build_object(
      'id', v_column_row.id,
      'typeId', v_type_id,
      'label', v_column_row.label,
      'valueType', CASE v_column_row.type WHEN 'plain' THEN 'text' WHEN 'link' THEN 'url' WHEN 'singleSelect' THEN 'select' ELSE v_column_row.type END,
      'behavior', CASE WHEN jsonb_array_length(v_defaults) > 0
        THEN jsonb_build_object('kind', 'input', 'defaultValue', jsonb_build_object('kind', 'select', 'value', v_defaults -> 0 -> 'value'))
        ELSE '{"kind":"input"}'::jsonb END,
      'required', false,
      'multiple', COALESCE(v_column_options -> 'allowMultiple', 'false'::jsonb),
      'archived', false,
      'publishedSummary', false,
      'format', jsonb_build_object(
        'color', COALESCE(v_column_options -> 'color', 'null'::jsonb),
        'dateFormat', COALESCE(v_column_options -> 'displayFormat', 'null'::jsonb),
        'currency', CASE WHEN v_column_row.type = 'currency' THEN to_jsonb(crm_upgrade.js_upper_currency(COALESCE(v_column_options ->> 'currency', v_company.currency))) ELSE 'null'::jsonb END),
      'options', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', o.value -> 'value', 'label', o.value -> 'label', 'color', o.value -> 'color',
          'attributes', CASE WHEN o.value ? 'weight' THEN jsonb_build_array(jsonb_build_object('key', 'probability', 'value',
            crm_upgrade.scalar_decimal(crm_upgrade.js_num(crm_upgrade.js_parse_number((o.value ->> 'weight')::numeric)), NULL))) ELSE '[]'::jsonb END)
          ORDER BY crm_upgrade.js_parse_number((o.value ->> 'index')::numeric), o.ordinality)
        FROM jsonb_array_elements(COALESCE(v_column_options -> 'options', '[]')) WITH ORDINALITY AS o(value, ordinality)), '[]'::jsonb),
      'position', v_position);
    v_model := jsonb_set(v_model, '{fields}', (v_model -> 'fields') || jsonb_build_array(v_field));
    SELECT t.ordinality - 1 INTO v_type_index FROM jsonb_array_elements(v_model -> 'types') WITH ORDINALITY AS t(value, ordinality) WHERE t.value ->> 'id' = v_type_id;
    v_model := jsonb_set(v_model, ARRAY['types', v_type_index::text, 'defaults', 'columns'], (v_model #> ARRAY['types', v_type_index::text, 'defaults', 'columns']) || to_jsonb(v_column_row.id));
  END LOOP;
  SELECT f.ordinality - 1 INTO v_weighted_index FROM jsonb_array_elements(v_model -> 'fields') WITH ORDINALITY AS f(value, ordinality) WHERE f.value ->> 'id' = crm_upgrade.preset_id(p_company_id, 'deal.weightedValue');
  IF v_company.weighting IS NOT NULL THEN
    SELECT f.value INTO v_stage FROM jsonb_array_elements(v_model -> 'fields') AS f(value)
      WHERE f.value ->> 'id' = v_company.weighting AND f.value ->> 'typeId' = crm_upgrade.preset_id(p_company_id, 'deal') AND f.value ->> 'valueType' = 'select' LIMIT 1;
    IF v_stage IS NULL THEN
      PERFORM crm_upgrade.issue(p_company_id, 'Company', 'dealWeightingColumnId', 'invalid_weighting_field');
    ELSE
      v_model := jsonb_set(v_model, ARRAY['fields', v_weighted_index::text, 'behavior'], jsonb_build_object('kind', 'formula', 'expression',
        crm_upgrade.expr_operation('divide',
          crm_upgrade.expr_operation('multiply', crm_upgrade.expr_field(crm_upgrade.preset_id(p_company_id, 'deal.totalValue')),
            jsonb_build_object('kind', 'optionAttribute', 'fieldId', v_stage ->> 'id', 'attribute', 'probability')),
          crm_upgrade.expr_literal(crm_upgrade.scalar_decimal('100', NULL)))));
      v_model := jsonb_set(v_model, '{types,2,defaults,groupBy}', v_stage -> 'id');
    END IF;
  ELSE
    v_model := jsonb_set(v_model, ARRAY['fields', v_weighted_index::text, 'behavior'], '{"kind":"formula","expression":{"kind":"literal","value":null}}'::jsonb);
  END IF;
  v_model := jsonb_set(v_model, '{fields}', (SELECT jsonb_agg(CASE WHEN f.value ->> 'id' IN (crm_upgrade.preset_id(p_company_id, 'deal.totalValue'),
      crm_upgrade.preset_id(p_company_id, 'deal.totalQuantity'), crm_upgrade.preset_id(p_company_id, 'deal.weightedValue'))
    THEN jsonb_set(f.value, '{publishedSummary}', 'true') ELSE f.value END ORDER BY f.ordinality)
    FROM jsonb_array_elements(v_model -> 'fields') WITH ORDINALITY AS f(value, ordinality)));
  -- validateRecordModel: the only definitions legacy columns can make invalid.
  PERFORM crm_upgrade.issue(p_company_id, 'CustomColumn', 'definition', code) FROM (
    SELECT 'invalid_multiple_value_type' AS code FROM jsonb_array_elements(v_model -> 'fields') AS f(value)
      WHERE (f.value ->> 'multiple')::boolean AND f.value ->> 'valueType' NOT IN ('text', 'email', 'phone', 'url')
    UNION ALL
    SELECT 'duplicate_option_id' FROM jsonb_array_elements(v_model -> 'fields') AS f(value)
      WHERE (SELECT count(*) <> count(DISTINCT o.value ->> 'id') FROM jsonb_array_elements(f.value -> 'options') AS o(value))
    UNION ALL
    SELECT 'invalid_default' FROM jsonb_array_elements(v_model -> 'fields') AS f(value)
      WHERE f.value #> '{behavior,defaultValue}' IS NOT NULL AND f.value #> '{behavior,defaultValue}' <> 'null'::jsonb
        AND f.value ->> 'id' <> crm_upgrade.preset_id(p_company_id, 'service.amount')
        AND f.value ->> 'typeId' <> crm_upgrade.preset_id(p_company_id, 'lineItem')
        AND (COALESCE((f.value ->> 'multiple')::boolean, false) OR f.value ->> 'valueType' <> 'select')
  ) AS invalid;
  RETURN v_model;
END
$$;

-- RecordModelSchema.parse (v5/contract/record-model.schema.ts) can only refuse legacy column data
-- through these constraints: trimmed field labels of 1-200 UTF-16 units, option identifiers and labels
-- of 1-200 units, colours and date formats of at most 64 units, ISO currency codes, and probability
-- attributes whose JavaScript string form is a plain decimal.
CREATE FUNCTION crm_upgrade.presentation_model_issues(company_id text, model jsonb) RETURNS void
LANGUAGE sql AS $$
  SELECT crm_upgrade.issue(company_id, 'CustomColumn', invalid.field, 'invalid_model_definition') FROM (
    SELECT 'label' AS field FROM jsonb_array_elements(model -> 'fields') AS f(value)
      WHERE crm_upgrade.js_len(crm_upgrade.js_trim(f.value ->> 'label')) NOT BETWEEN 1 AND 200
    UNION ALL
    SELECT 'options' FROM jsonb_array_elements(model -> 'fields') AS f(value), jsonb_array_elements(f.value -> 'options') AS o(value)
      WHERE crm_upgrade.js_len(o.value ->> 'id') NOT BETWEEN 1 AND 200
        OR crm_upgrade.js_len(o.value ->> 'label') NOT BETWEEN 1 AND 200
        OR crm_upgrade.js_len(o.value ->> 'color') > 64
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(o.value -> 'attributes') AS a(value)
          WHERE a.value #>> '{value,value}' !~ '^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$')
    UNION ALL
    SELECT 'format' FROM jsonb_array_elements(model -> 'fields') AS f(value)
      WHERE crm_upgrade.js_len(f.value #>> '{format,color}') > 64
        OR crm_upgrade.js_len(f.value #>> '{format,dateFormat}') > 64
        OR (f.value #> '{format,currency}' IS NOT NULL AND f.value #> '{format,currency}' <> 'null'::jsonb AND f.value #>> '{format,currency}' !~ '^[A-Z]{3}$')
  ) AS invalid
$$;

CREATE FUNCTION crm_upgrade.relationship_column_key(relation_id text, direction text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'relationship:' || relation_id || ':' || direction $$;

-- presentationTypeDefaults (v5/columns.ts) for one legacy type.
CREATE FUNCTION crm_upgrade.presentation_type_defaults(p_company_id text, p_kind text, p_model jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_legacy_columns text[] := CASE p_kind
    WHEN 'contact' THEN ARRAY['name', 'channels', 'organizations', 'deals', 'tasks']
    WHEN 'organization' THEN ARRAY['name', 'contacts', 'deals', 'tasks']
    WHEN 'deal' THEN ARRAY['name', 'totalValue', 'weightedValue', 'totalQuantity', 'contacts', 'organizations', 'services', 'tasks']
    WHEN 'service' THEN ARRAY['name', 'amount', 'deals', 'tasks']
    ELSE ARRAY['name', 'contacts', 'organizations', 'deals', 'services'] END;
  v_columns jsonb := '[]';
  v_key text;
BEGIN
  FOREACH v_key IN ARRAY v_legacy_columns LOOP
    v_columns := v_columns || to_jsonb(crm_upgrade.migrate_column_key(p_company_id, p_kind, v_key, p_model));
  END LOOP;
  v_columns := v_columns || COALESCE((SELECT jsonb_agg(c.id ORDER BY c."createdAt", c.id) FROM "CustomColumn" c
    WHERE c."companyId" = p_company_id AND c."entityType"::text = p_kind), '[]'::jsonb)
    || '["system:assignedTo","system:updatedAt","system:createdAt"]'::jsonb;
  RETURN jsonb_build_object('columns', v_columns, 'hiddenColumns', to_jsonb(crm_upgrade.introduced_columns(p_company_id, p_kind)),
    'layout', 'table', 'groupBy', NULL, 'sortField', NULL, 'sortDirection', 'asc', 'pinnedFields', '[]'::jsonb)
    || CASE WHEN p_kind = 'deal' THEN jsonb_build_object('groupSummaries', jsonb_build_array(
      jsonb_build_object('fieldId', crm_upgrade.preset_id(p_company_id, 'deal.totalValue'), 'aggregation', 'sum'),
      jsonb_build_object('fieldId', crm_upgrade.preset_id(p_company_id, 'deal.weightedValue'), 'aggregation', 'sum'))) ELSE '{}'::jsonb END;
END
$$;

-- introducedPresentationColumns: columns that did not exist in the legacy UI and start hidden.
CREATE FUNCTION crm_upgrade.introduced_columns(company_id text, kind text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN kind = 'contact' THEN ARRAY[crm_upgrade.preset_id(company_id, 'contact.firstName'), crm_upgrade.preset_id(company_id, 'contact.lastName'), crm_upgrade.preset_id(company_id, 'contact.avatarUrl')]
    WHEN kind IN ('deal', 'service') THEN ARRAY[crm_upgrade.relationship_column_key(crm_upgrade.preset_id(company_id, 'lineItem.' || kind), 'incoming')]
    ELSE ARRAY[]::text[] END
$$;

-- migrateColumnKey (v5/columns.ts): maps a legacy column/filter key of one legacy type to a record column key.
-- Returns NULL for an unresolvable key (callers decide whether that refuses or is a documented repair).
CREATE FUNCTION crm_upgrade.migrate_column_key(p_company_id text, p_kind text, p_key text, p_model jsonb) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_type_id text := crm_upgrade.preset_id(p_company_id, p_kind);
  v_preset_field text := crm_upgrade.preset_id(p_company_id, p_kind || '.' || p_key);
  v_found text;
  v_target text;
  v_relation record;
BEGIN
  IF p_key IN ('createdAt', 'updatedAt') THEN RETURN 'system:' || p_key; END IF;
  IF p_key IN ('users', 'userIds') THEN RETURN 'system:assignedTo'; END IF;
  IF p_kind = 'contact' AND p_key IN ('channels', 'identifiers') THEN RETURN 'system:channels'; END IF;
  SELECT f.value ->> 'id' INTO v_found FROM jsonb_array_elements(p_model -> 'fields') WITH ORDINALITY AS f(value, ordinality)
    WHERE f.value ->> 'typeId' = v_type_id AND (f.value ->> 'id' = p_key OR f.value ->> 'id' = v_preset_field) ORDER BY f.ordinality LIMIT 1;
  IF v_found IS NOT NULL THEN RETURN v_found; END IF;
  SELECT t.kind INTO v_target FROM unnest(ARRAY['contact', 'organization', 'deal', 'service', 'task']) WITH ORDINALITY AS t(kind, ordinality)
    WHERE p_key = t.kind || 's' OR p_key = t.kind || 'Ids' ORDER BY t.ordinality LIMIT 1;
  IF v_target IS NOT NULL THEN
    IF (p_kind = 'deal' AND v_target = 'service') OR (p_kind = 'service' AND v_target = 'deal') THEN
      RETURN 'path:' || crm_upgrade.preset_id(p_company_id, p_kind || '.' || v_target || 's.path');
    END IF;
    SELECT r.key, r.source INTO v_relation FROM (VALUES
      (0, 'contact.organizations', 'contact', 'organization'), (1, 'deal.contacts', 'deal', 'contact'),
      (2, 'deal.organizations', 'deal', 'organization'), (3, 'task.contacts', 'task', 'contact'),
      (4, 'task.organizations', 'task', 'organization'), (5, 'task.deals', 'task', 'deal'), (6, 'task.services', 'task', 'service'))
      AS r(position, key, source, target)
      WHERE (r.source = p_kind AND r.target = v_target) OR (r.target = p_kind AND r.source = v_target) ORDER BY r.position LIMIT 1;
    IF v_relation.key IS NOT NULL THEN
      RETURN crm_upgrade.relationship_column_key(crm_upgrade.preset_id(p_company_id, v_relation.key), CASE WHEN v_relation.source = p_kind THEN 'outgoing' ELSE 'incoming' END);
    END IF;
  END IF;
  RETURN NULL;
END
$$;

-- presentationMigrationModel (v5/model.ts): revision 3 with person activity paths, legacy presentation
-- defaults, deal/service relationship paths, trimmed labels and navigationVisible = true (schema defaults).
CREATE FUNCTION crm_upgrade.presentation_model(p_company_id text, p_model jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_result jsonb := p_model || jsonb_build_object('revision', 3, 'activityPaths', crm_upgrade.migrated_activity_paths(p_company_id, p_model));
  v_kind text;
  v_type_index integer;
BEGIN
  v_result := jsonb_set(v_result, '{fields}', (SELECT jsonb_agg(jsonb_set(f.value, '{label}', to_jsonb(crm_upgrade.js_trim(f.value ->> 'label'))) ORDER BY f.ordinality)
    FROM jsonb_array_elements(v_result -> 'fields') WITH ORDINALITY AS f(value, ordinality)));
  v_result := jsonb_set(v_result, '{types}', (SELECT jsonb_agg(t.value || '{"navigationVisible":true}'::jsonb ORDER BY t.ordinality)
    FROM jsonb_array_elements(v_result -> 'types') WITH ORDINALITY AS t(value, ordinality)));
  FOREACH v_kind IN ARRAY ARRAY['contact', 'organization', 'deal', 'service', 'task'] LOOP
    SELECT t.ordinality - 1 INTO v_type_index FROM jsonb_array_elements(v_result -> 'types') WITH ORDINALITY AS t(value, ordinality)
      WHERE t.value ->> 'id' = crm_upgrade.preset_id(p_company_id, v_kind);
    v_result := jsonb_set(v_result, ARRAY['types', v_type_index::text, 'defaults'], crm_upgrade.presentation_type_defaults(p_company_id, v_kind, p_model));
    IF v_kind IN ('deal', 'service') THEN
      v_result := jsonb_set(v_result, ARRAY['types', v_type_index::text], (v_result #> ARRAY['types', v_type_index::text]) || jsonb_build_object('relationshipPaths', jsonb_build_array(jsonb_build_object(
        'id', crm_upgrade.preset_id(p_company_id, v_kind || '.' || CASE WHEN v_kind = 'deal' THEN 'service' ELSE 'deal' END || 's.path'),
        'label', (SELECT t.value -> 'pluralLabel' FROM jsonb_array_elements(v_result -> 'types') AS t(value)
          WHERE t.value ->> 'id' = crm_upgrade.preset_id(p_company_id, CASE WHEN v_kind = 'deal' THEN 'service' ELSE 'deal' END)),
        'archived', false,
        'path', jsonb_build_array(
          jsonb_build_object('relationId', crm_upgrade.preset_id(p_company_id, 'lineItem.' || v_kind), 'direction', 'incoming'),
          jsonb_build_object('relationId', crm_upgrade.preset_id(p_company_id, 'lineItem.' || CASE WHEN v_kind = 'deal' THEN 'service' ELSE 'deal' END), 'direction', 'outgoing'))))));
    END IF;
  END LOOP;
  RETURN v_result;
END
$$;

-- recordColumns (v5/contract/record-columns.ts): available column keys of a type, with sortability.
CREATE FUNCTION crm_upgrade.record_columns(type_id text, model jsonb) RETURNS TABLE (id text, sortable boolean)
LANGUAGE sql STABLE AS $$
  SELECT f.value ->> 'id', f.value ->> 'valueType' NOT IN ('dateRange', 'dateTimeRange')
    FROM jsonb_array_elements(model -> 'fields') AS f(value)
    WHERE f.value ->> 'typeId' = type_id AND NOT (f.value ->> 'archived')::boolean AND f.value ->> 'valueType' <> 'richText'
  UNION ALL
  SELECT crm_upgrade.relationship_column_key(r.value ->> 'id', d.direction), false
    FROM jsonb_array_elements(model -> 'relationships') AS r(value)
    CROSS JOIN (VALUES ('outgoing'), ('incoming')) AS d(direction)
    WHERE NOT (r.value ->> 'archived')::boolean
      AND (CASE WHEN d.direction = 'outgoing' THEN r.value ->> 'sourceTypeId' ELSE r.value ->> 'targetTypeId' END) = type_id
  UNION ALL
  SELECT 'path:' || (p.value ->> 'id'), false
    FROM jsonb_array_elements(model -> 'types') AS t(value), jsonb_array_elements(COALESCE(t.value -> 'relationshipPaths', '[]')) AS p(value)
    WHERE t.value ->> 'id' = type_id AND NOT (p.value ->> 'archived')::boolean AND crm_upgrade.resolve_path(type_id, p.value -> 'path', model) IS NOT NULL
  UNION ALL
  SELECT 'system:channels', false
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(model -> 'capabilities') AS c(value) WHERE c.value ->> 'kind' = 'personIdentity' AND c.value ->> 'typeId' = type_id)
  UNION ALL
  SELECT * FROM (VALUES ('system:assignedTo', false), ('system:createdAt', true), ('system:updatedAt', true)) AS s(id, sortable)
$$;

-- resolveRecordPath: terminal type of a relationship path or NULL.
CREATE FUNCTION crm_upgrade.resolve_path(p_type_id text, p_path jsonb, p_model jsonb) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_step jsonb;
  v_relation jsonb;
BEGIN
  IF (jsonb_typeof(p_path) <> 'array' OR jsonb_array_length(p_path) = 0 OR jsonb_array_length(p_path) > 6) IS NOT FALSE THEN RETURN NULL; END IF;
  FOR v_step IN SELECT value FROM jsonb_array_elements(p_path) LOOP
    SELECT r.value INTO v_relation FROM jsonb_array_elements(p_model -> 'relationships') AS r(value)
      WHERE r.value ->> 'id' = v_step ->> 'relationId' AND NOT (r.value ->> 'archived')::boolean LIMIT 1;
    IF (v_relation IS NULL OR (CASE WHEN v_step ->> 'direction' = 'outgoing' THEN v_relation ->> 'sourceTypeId' ELSE v_relation ->> 'targetTypeId' END) IS DISTINCT FROM p_type_id) IS NOT FALSE THEN
      RETURN NULL;
    END IF;
    p_type_id := CASE WHEN v_step ->> 'direction' = 'outgoing' THEN v_relation ->> 'targetTypeId' ELSE v_relation ->> 'sourceTypeId' END;
  END LOOP;
  RETURN p_type_id;
END
$$;

-- resolveRecordGrouping (v5/contract/record-grouping.ts): whether a grouping is valid for the type.
CREATE FUNCTION crm_upgrade.grouping_valid(p_type_id text, p_group_spec jsonb, p_model jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_key text := p_group_spec ->> 'field';
  v_bucket boolean := p_group_spec ? 'bucket';
  v_relation jsonb;
  v_field jsonb;
  v_parts text[];
BEGIN
  IF v_key LIKE 'path:%' AND crm_upgrade.is_uuid(substr(v_key, 6)) THEN
    RETURN COALESCE((NOT v_bucket AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_model -> 'types') AS t(value), jsonb_array_elements(COALESCE(t.value -> 'relationshipPaths', '[]')) AS p(value)
      WHERE t.value ->> 'id' = p_type_id AND p.value ->> 'id' = substr(v_key, 6) AND NOT (p.value ->> 'archived')::boolean
        AND crm_upgrade.resolve_path(p_type_id, p.value -> 'path', p_model) IS NOT NULL)), false);
  END IF;
  v_parts := string_to_array(v_key, ':');
  IF v_parts[1] = 'relationship' AND array_length(v_parts, 1) = 3 AND crm_upgrade.is_uuid(v_parts[2]) AND v_parts[3] IN ('outgoing', 'incoming') THEN
    SELECT r.value INTO v_relation FROM jsonb_array_elements(p_model -> 'relationships') AS r(value)
      WHERE r.value ->> 'id' = v_parts[2] AND NOT (r.value ->> 'archived')::boolean LIMIT 1;
    RETURN COALESCE((v_relation IS NOT NULL AND NOT v_bucket
      AND (CASE WHEN v_parts[3] = 'outgoing' THEN v_relation ->> 'sourceTypeId' ELSE v_relation ->> 'targetTypeId' END) = p_type_id), false);
  END IF;
  IF v_key = 'system:assignedTo' THEN RETURN COALESCE((NOT v_bucket), false); END IF;
  IF v_key IN ('system:createdAt', 'system:updatedAt') THEN RETURN true; END IF;
  SELECT f.value INTO v_field FROM jsonb_array_elements(p_model -> 'fields') AS f(value)
    WHERE f.value ->> 'typeId' = p_type_id AND f.value ->> 'id' = v_key AND NOT (f.value ->> 'archived')::boolean LIMIT 1;
  IF (v_field IS NULL OR COALESCE((v_field ->> 'multiple')::boolean, false)) IS NOT FALSE THEN RETURN false; END IF;
  IF v_field ->> 'valueType' IN ('date', 'dateTime', 'dateRange', 'dateTimeRange') THEN RETURN true; END IF;
  IF (v_bucket) IS NOT FALSE THEN RETURN false; END IF;
  RETURN COALESCE((v_field ->> 'valueType' IN ('select', 'boolean', 'member')), false);
END
$$;

-- RecordScalarSchema (strict object piped into the kind-specific union).
CREATE FUNCTION crm_upgrade.scalar_valid(p_scalar jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_kind text := p_scalar ->> 'kind';
  v_allowed text[];
BEGIN
  IF (p_scalar IS NULL OR jsonb_typeof(p_scalar) <> 'object') IS NOT FALSE THEN RETURN false; END IF;
  v_allowed := CASE v_kind
    WHEN 'text' THEN ARRAY['kind', 'value'] WHEN 'textList' THEN ARRAY['kind', 'value'] WHEN 'decimal' THEN ARRAY['kind', 'value', 'currency']
    WHEN 'boolean' THEN ARRAY['kind', 'value'] WHEN 'date' THEN ARRAY['kind', 'value'] WHEN 'dateTime' THEN ARRAY['kind', 'value']
    WHEN 'range' THEN ARRAY['kind', 'start', 'end'] WHEN 'select' THEN ARRAY['kind', 'value'] WHEN 'member' THEN ARRAY['kind', 'value']
    WHEN 'richText' THEN ARRAY['kind', 'documentJson'] END;
  IF (v_allowed IS NULL OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_scalar) AS key WHERE key <> ALL (v_allowed))) IS NOT FALSE THEN RETURN false; END IF;
  CASE v_kind
    WHEN 'text' THEN RETURN COALESCE((jsonb_typeof(p_scalar -> 'value') = 'string' AND crm_upgrade.js_len(p_scalar ->> 'value') <= 100000), false);
    WHEN 'textList' THEN RETURN COALESCE((jsonb_typeof(p_scalar -> 'value') = 'array' AND jsonb_array_length(p_scalar -> 'value') BETWEEN 1 AND 100
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_scalar -> 'value') AS item(value) WHERE jsonb_typeof(item.value) <> 'string' OR crm_upgrade.js_len(item.value #>> '{}') > 100000)), false);
    WHEN 'decimal' THEN RETURN COALESCE((jsonb_typeof(p_scalar -> 'value') = 'string' AND p_scalar ->> 'value' ~ '^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$' AND length(p_scalar ->> 'value') <= 128
      AND p_scalar ? 'currency' AND (p_scalar -> 'currency' = 'null'::jsonb OR (jsonb_typeof(p_scalar -> 'currency') = 'string' AND p_scalar ->> 'currency' ~ '^[A-Z]{3}$'))), false);
    WHEN 'boolean' THEN RETURN COALESCE((jsonb_typeof(p_scalar -> 'value') = 'boolean'), false);
    WHEN 'date' THEN RETURN COALESCE((jsonb_typeof(p_scalar -> 'value') = 'string' AND (crm_upgrade.is_iso_date(p_scalar ->> 'value') OR crm_upgrade.is_iso_datetime(p_scalar ->> 'value'))), false);
    WHEN 'dateTime' THEN RETURN COALESCE((jsonb_typeof(p_scalar -> 'value') = 'string' AND crm_upgrade.is_iso_datetime(p_scalar ->> 'value')), false);
    WHEN 'range' THEN RETURN COALESCE((p_scalar ? 'start' AND p_scalar ? 'end'
      AND jsonb_typeof(p_scalar -> 'start') IN ('string', 'null') AND jsonb_typeof(p_scalar -> 'end') IN ('string', 'null')), false);
    WHEN 'select' THEN RETURN COALESCE((jsonb_typeof(p_scalar -> 'value') = 'string' AND crm_upgrade.js_len(p_scalar ->> 'value') BETWEEN 1 AND 200), false);
    WHEN 'member' THEN RETURN COALESCE((jsonb_typeof(p_scalar -> 'value') = 'string' AND crm_upgrade.is_uuid(p_scalar ->> 'value')), false);
    WHEN 'richText' THEN RETURN COALESCE((jsonb_typeof(p_scalar -> 'documentJson') = 'string' AND crm_upgrade.js_len(p_scalar ->> 'documentJson') <= 1000000), false);
  END CASE;
  RETURN false;
END
$$;

-- scalarMatchesType; date_parse selects the v2 range order (Date.parse, milliseconds) instead of the
-- v5 one (recordInstantMicros).
CREATE FUNCTION crm_upgrade.scalar_matches_type(p_scalar jsonb, p_value_type text, p_multiple boolean, p_date_parse boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_kind text := p_scalar ->> 'kind';
  v_start_value text;
  v_end_value text;
BEGIN
  IF p_multiple THEN
    RETURN COALESCE((v_kind = 'textList' AND p_value_type IN ('text', 'email', 'phone', 'url') AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_scalar -> 'value') AS item(value)
      WHERE NOT crm_upgrade.scalar_matches_type(crm_upgrade.scalar_text(item.value #>> '{}'), p_value_type, false, p_date_parse))), false);
  END IF;
  CASE p_value_type
    WHEN 'number' THEN RETURN COALESCE((v_kind = 'decimal' AND p_scalar -> 'currency' = 'null'::jsonb AND crm_upgrade.is_representable_text(p_scalar ->> 'value')), false);
    WHEN 'currency' THEN RETURN COALESCE((v_kind = 'decimal' AND p_scalar -> 'currency' <> 'null'::jsonb AND crm_upgrade.is_representable_text(p_scalar ->> 'value')), false);
    WHEN 'email' THEN RETURN COALESCE((v_kind = 'text' AND crm_upgrade.is_email(crm_upgrade.js_trim(p_scalar ->> 'value'))), false);
    WHEN 'url' THEN RETURN COALESCE((v_kind = 'text' AND crm_upgrade.is_http_url(p_scalar ->> 'value')), false);
    WHEN 'phone' THEN RETURN COALESCE((v_kind = 'text' AND crm_upgrade.is_e164(crm_upgrade.js_trim(p_scalar ->> 'value'))), false);
    WHEN 'dateRange', 'dateTimeRange' THEN
      IF (v_kind <> 'range') IS NOT FALSE THEN RETURN false; END IF;
      v_start_value := p_scalar ->> 'start';
      v_end_value := p_scalar ->> 'end';
      IF ((v_start_value IS NOT NULL AND NOT (crm_upgrade.is_iso_datetime(v_start_value) OR (p_value_type = 'dateRange' AND crm_upgrade.is_iso_date(v_start_value))))
        OR (v_end_value IS NOT NULL AND NOT (crm_upgrade.is_iso_datetime(v_end_value) OR (p_value_type = 'dateRange' AND crm_upgrade.is_iso_date(v_end_value))))) IS NOT FALSE THEN
        RETURN false;
      END IF;
      RETURN COALESCE((v_start_value IS NULL OR v_end_value IS NULL OR v_start_value = '' OR v_end_value = ''
        OR crm_upgrade.iso_micros(v_start_value, p_date_parse) <= crm_upgrade.iso_micros(v_end_value, p_date_parse)), false);
    ELSE RETURN COALESCE((v_kind = p_value_type), false);
  END CASE;
END
$$;

-- isRepresentableDecimal for a decimal string (decimal.js parsing).
CREATE FUNCTION crm_upgrade.is_representable_text(p_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF (p_value IS NULL OR p_value !~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$') IS NOT FALSE THEN RETURN false; END IF;
  RETURN COALESCE((crm_upgrade.is_representable(p_value::numeric)), false);
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation OR program_limit_exceeded THEN
  RETURN false;
END
$$;

-- recordFilterOperators
CREATE FUNCTION crm_upgrade.filter_operators(value_type text, multiple boolean) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN value_type = 'richText' THEN ARRAY[]::text[]
    WHEN value_type IN ('dateRange', 'dateTimeRange') THEN ARRAY['contains', 'gt', 'gte', 'lt', 'lte', 'between', 'inLastDays', 'empty', 'notEmpty']
    ELSE ARRAY['eq', 'ne', 'empty', 'notEmpty']
      || CASE WHEN NOT multiple THEN ARRAY['in', 'notIn'] ELSE ARRAY[]::text[] END
      || CASE WHEN value_type IN ('text', 'email', 'phone', 'url') THEN ARRAY['contains', 'startsWith'] ELSE ARRAY[]::text[] END
      || CASE WHEN NOT multiple AND value_type IN ('number', 'currency', 'date', 'dateTime') THEN ARRAY['gt', 'gte', 'lt', 'lte'] ELSE ARRAY[]::text[] END
      || CASE WHEN value_type IN ('date', 'dateTime') THEN ARRAY['between', 'inLastDays'] ELSE ARRAY[]::text[] END
  END
$$;

-- temporalFilterIsValid
CREATE FUNCTION crm_upgrade.temporal_filter_valid(p_filter jsonb, p_value_type text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_point_type text := CASE p_value_type WHEN 'dateRange' THEN 'date' WHEN 'dateTimeRange' THEN 'dateTime' ELSE p_value_type END;
  v_operator text := p_filter ->> 'operator';
  v_first jsonb;
  v_second jsonb;
BEGIN
  IF v_operator IN ('empty', 'notEmpty') THEN RETURN true; END IF;
  IF v_operator = 'inLastDays' THEN
    RETURN COALESCE((p_filter #>> '{value,kind}' = 'decimal' AND p_filter #> '{value,currency}' = 'null'::jsonb AND p_filter #>> '{value,value}' ~ '^[0-9]+$'
      AND (p_filter #>> '{value,value}')::numeric > 0 AND (p_filter #>> '{value,value}')::numeric <= 365000), false);
  END IF;
  IF v_operator = 'between' THEN
    IF (NOT p_filter ? 'values' OR jsonb_array_length(p_filter -> 'values') <> 2) IS NOT FALSE THEN RETURN false; END IF;
    v_first := p_filter -> 'values' -> 0;
    v_second := p_filter -> 'values' -> 1;
    RETURN COALESCE((v_first ->> 'kind' = v_point_type AND v_second ->> 'kind' = v_point_type AND v_first ->> 'kind' IN ('date', 'dateTime')
      AND crm_upgrade.iso_micros(v_first ->> 'value', false) <= crm_upgrade.iso_micros(v_second ->> 'value', false)), false);
  END IF;
  IF v_operator IN ('in', 'notIn') THEN
    RETURN COALESCE((p_filter ? 'values' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_filter -> 'values') AS v(value) WHERE v.value ->> 'kind' IS DISTINCT FROM v_point_type)), false);
  END IF;
  RETURN COALESCE((jsonb_typeof(p_filter -> 'value') = 'object' AND p_filter #>> '{value,kind}' = v_point_type), false);
END
$$;

-- invalidRecordQueryPart restricted to the parts the conversion produces (filters, sort, relationships,
-- relatedFilters). The query is assumed to have passed record_query_parse_valid.
CREATE FUNCTION crm_upgrade.query_valid(p_query jsonb, p_model jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_type_id text := p_query ->> 'typeId';
  v_filter jsonb;
  v_field jsonb;
  v_values_list jsonb;
  v_sort jsonb;
  v_relation jsonb;
  v_related jsonb;
  v_step jsonb;
  v_current_type text;
  v_operator text;
BEGIN
  FOR v_filter IN SELECT value FROM jsonb_array_elements(COALESCE(p_query -> 'filters', '[]')) LOOP
    v_operator := v_filter ->> 'operator';
    IF v_filter ->> 'fieldId' IN ('system:createdAt', 'system:updatedAt', 'system:assignedTo') THEN
      IF v_filter ->> 'fieldId' = 'system:assignedTo' THEN
        IF (v_operator <> ALL (ARRAY['eq', 'ne', 'in', 'notIn', 'empty', 'notEmpty'])) IS NOT FALSE THEN RETURN false; END IF;
        IF v_operator IN ('empty', 'notEmpty') THEN CONTINUE; END IF;
        v_values_list := CASE WHEN v_operator IN ('in', 'notIn') THEN v_filter -> 'values'
          WHEN jsonb_typeof(v_filter -> 'value') = 'object' THEN jsonb_build_array(v_filter -> 'value') END;
        IF (v_values_list IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_values_list) AS v(value) WHERE v.value ->> 'kind' <> 'member')) IS NOT FALSE THEN RETURN false; END IF;
      ELSE
        IF (v_operator <> ALL (crm_upgrade.filter_operators('dateTime', false)) OR NOT crm_upgrade.temporal_filter_valid(v_filter, 'dateTime')) IS NOT FALSE THEN RETURN false; END IF;
      END IF;
      CONTINUE;
    END IF;
    SELECT f.value INTO v_field FROM jsonb_array_elements(p_model -> 'fields') AS f(value)
      WHERE f.value ->> 'typeId' = v_type_id AND NOT (f.value ->> 'archived')::boolean AND f.value ->> 'id' = v_filter ->> 'fieldId' LIMIT 1;
    IF (v_field IS NULL OR v_operator <> ALL (crm_upgrade.filter_operators(v_field ->> 'valueType', COALESCE((v_field ->> 'multiple')::boolean, false)))) IS NOT FALSE THEN RETURN false; END IF;
    IF v_field ->> 'valueType' IN ('date', 'dateTime', 'dateRange', 'dateTimeRange') THEN
      IF (NOT crm_upgrade.temporal_filter_valid(v_filter, v_field ->> 'valueType')) IS NOT FALSE THEN RETURN false; END IF;
      CONTINUE;
    END IF;
    IF v_operator IN ('contains', 'startsWith') THEN
      IF (v_filter #>> '{value,kind}' IS DISTINCT FROM 'text' OR v_field ->> 'valueType' NOT IN ('text', 'email', 'phone', 'url')) IS NOT FALSE THEN RETURN false; END IF;
      CONTINUE;
    END IF;
    v_values_list := COALESCE(v_filter -> 'values', CASE WHEN jsonb_typeof(v_filter -> 'value') = 'object' THEN jsonb_build_array(v_filter -> 'value') ELSE '[]'::jsonb END);
    IF (v_field ->> 'valueType' = 'select' AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_values_list) AS v(value)
      WHERE v.value ->> 'kind' <> 'select' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_field -> 'options') AS o(value) WHERE o.value ->> 'id' = v.value ->> 'value'))) IS NOT FALSE THEN
      RETURN false;
    END IF;
    IF v_operator IN ('in', 'notIn') THEN
      IF (NOT v_filter ? 'values' OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_filter -> 'values') AS v(value)
        WHERE NOT crm_upgrade.scalar_matches_type(v.value, v_field ->> 'valueType', false, false))) IS NOT FALSE THEN RETURN false; END IF;
      CONTINUE;
    END IF;
    IF (v_operator NOT IN ('empty', 'notEmpty') AND (jsonb_typeof(v_filter -> 'value') IS DISTINCT FROM 'object'
      OR NOT crm_upgrade.scalar_matches_type(v_filter -> 'value', v_field ->> 'valueType', false, false))) IS NOT FALSE THEN
      RETURN false;
    END IF;
  END LOOP;
  FOR v_sort IN SELECT value FROM jsonb_array_elements(COALESCE(p_query -> 'sort', '[]')) LOOP
    IF v_sort ->> 'fieldId' IN ('system:createdAt', 'system:updatedAt') THEN CONTINUE; END IF;
    IF (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_model -> 'fields') AS f(value)
      WHERE f.value ->> 'typeId' = v_type_id AND NOT (f.value ->> 'archived')::boolean AND f.value ->> 'id' = v_sort ->> 'fieldId'
        AND f.value ->> 'valueType' NOT IN ('richText', 'dateRange', 'dateTimeRange'))) IS NOT FALSE THEN
      RETURN false;
    END IF;
  END LOOP;
  FOR v_filter IN SELECT value FROM jsonb_array_elements(COALESCE(p_query -> 'relationships', '[]')) LOOP
    SELECT r.value INTO v_relation FROM jsonb_array_elements(p_model -> 'relationships') AS r(value)
      WHERE r.value ->> 'id' = v_filter ->> 'relationId' AND NOT (r.value ->> 'archived')::boolean LIMIT 1;
    IF (v_relation IS NULL OR (CASE WHEN v_filter ->> 'direction' = 'outgoing' THEN v_relation ->> 'sourceTypeId' ELSE v_relation ->> 'targetTypeId' END) <> v_type_id) IS NOT FALSE THEN
      RETURN false;
    END IF;
  END LOOP;
  FOR v_related IN SELECT value FROM jsonb_array_elements(COALESCE(p_query -> 'relatedFilters', '[]')) LOOP
    v_current_type := v_type_id;
    FOR v_step IN SELECT value FROM jsonb_array_elements(v_related -> 'path') LOOP
      SELECT r.value INTO v_relation FROM jsonb_array_elements(p_model -> 'relationships') AS r(value)
        WHERE r.value ->> 'id' = v_step ->> 'relationId' AND NOT (r.value ->> 'archived')::boolean LIMIT 1;
      IF (v_relation IS NULL OR (CASE WHEN v_step ->> 'direction' = 'outgoing' THEN v_relation ->> 'sourceTypeId' ELSE v_relation ->> 'targetTypeId' END) <> v_current_type) IS NOT FALSE THEN
        RETURN false;
      END IF;
      v_current_type := CASE WHEN v_step ->> 'direction' = 'outgoing' THEN v_relation ->> 'targetTypeId' ELSE v_relation ->> 'sourceTypeId' END;
      IF (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_model -> 'types') AS t(value) WHERE t.value ->> 'id' = v_current_type AND NOT (t.value ->> 'archived')::boolean)) IS NOT FALSE THEN
        RETURN false;
      END IF;
    END LOOP;
    IF (NOT crm_upgrade.query_valid(jsonb_build_object('typeId', v_current_type, 'filters', v_related -> 'filters', 'relationships', COALESCE(v_related -> 'relationships', '[]')), p_model)) IS NOT FALSE THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$$;

-- RecordQuerySchema.parse for the parts the conversion produces; false means a ZodError.
CREATE FUNCTION crm_upgrade.query_parse_valid(p_query jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_filter jsonb;
  v_related jsonb;
BEGIN
  IF (jsonb_array_length(COALESCE(p_query -> 'filters', '[]')) > 50 OR jsonb_array_length(COALESCE(p_query -> 'relationships', '[]')) > 50
    OR jsonb_array_length(COALESCE(p_query -> 'relatedFilters', '[]')) > 16 OR jsonb_array_length(COALESCE(p_query -> 'sort', '[]')) > 5) IS NOT FALSE THEN
    RETURN false;
  END IF;
  FOR v_filter IN SELECT value FROM jsonb_array_elements(COALESCE(p_query -> 'filters', '[]')) LOOP
    IF (NOT (crm_upgrade.is_uuid(v_filter ->> 'fieldId') OR v_filter ->> 'fieldId' IN ('system:createdAt', 'system:updatedAt', 'system:assignedTo'))) IS NOT FALSE THEN RETURN false; END IF;
    IF (v_filter -> 'value' <> 'null'::jsonb AND NOT crm_upgrade.scalar_valid(v_filter -> 'value')) IS NOT FALSE THEN RETURN false; END IF;
    IF (v_filter ? 'values' AND (jsonb_array_length(v_filter -> 'values') > 100 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_filter -> 'values') AS v(value) WHERE NOT crm_upgrade.scalar_valid(v.value)))) IS NOT FALSE THEN
      RETURN false;
    END IF;
  END LOOP;
  FOR v_filter IN SELECT value FROM jsonb_array_elements(COALESCE(p_query -> 'sort', '[]')) LOOP
    IF (NOT (crm_upgrade.is_uuid(v_filter ->> 'fieldId') OR v_filter ->> 'fieldId' IN ('system:createdAt', 'system:updatedAt', 'system:assignedTo'))) IS NOT FALSE THEN RETURN false; END IF;
  END LOOP;
  FOR v_filter IN SELECT value FROM jsonb_array_elements(COALESCE(p_query -> 'relationships', '[]')) LOOP
    IF (v_filter -> 'recordIds' <> 'null'::jsonb AND jsonb_array_length(v_filter -> 'recordIds') > 100) IS NOT FALSE THEN RETURN false; END IF;
  END LOOP;
  FOR v_related IN SELECT value FROM jsonb_array_elements(COALESCE(p_query -> 'relatedFilters', '[]')) LOOP
    IF (jsonb_array_length(v_related -> 'path') NOT BETWEEN 1 AND 6 OR (v_related ? 'recordIds' AND jsonb_array_length(v_related -> 'recordIds') > 100)
      OR NOT crm_upgrade.query_parse_valid(jsonb_build_object('filters', v_related -> 'filters', 'relationships', COALESCE(v_related -> 'relationships', '[]')))) IS NOT FALSE THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$$;

-- LegacyFilterSchema (v5/filters.ts) for one element: preprocess (hasSome/hasNone with arrays become
-- in/notIn; finite numbers become decimal strings except for inLastDays) and the strict union.
-- Returns the parsed filter or NULL when zod would reject it.
CREATE FUNCTION crm_upgrade.legacy_filter_parse(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_filter jsonb := p_input;
  v_operator text;
  v_number double precision;
BEGIN
  IF (jsonb_typeof(v_filter) <> 'object') IS NOT FALSE THEN RETURN NULL; END IF;
  IF jsonb_typeof(v_filter -> 'value') = 'array' AND v_filter ->> 'operator' IN ('hasSome', 'hasNone') THEN
    v_filter := v_filter || jsonb_build_object('operator', CASE WHEN v_filter ->> 'operator' = 'hasSome' THEN 'in' ELSE 'notIn' END);
  END IF;
  IF v_filter -> 'operator' IS DISTINCT FROM '"inLastDays"'::jsonb AND v_filter ? 'value' THEN
    IF jsonb_typeof(v_filter -> 'value') = 'array' THEN
      v_filter := v_filter || jsonb_build_object('value', (SELECT COALESCE(jsonb_agg(crm_upgrade.legacy_filter_canonical(v.value) ORDER BY v.ordinality), '[]'::jsonb)
        FROM jsonb_array_elements(v_filter -> 'value') WITH ORDINALITY AS v(value, ordinality)));
    ELSE
      v_filter := v_filter || jsonb_build_object('value', crm_upgrade.legacy_filter_canonical(v_filter -> 'value'));
    END IF;
  END IF;
  IF (jsonb_typeof(v_filter -> 'field') IS DISTINCT FROM 'string' OR jsonb_typeof(v_filter -> 'operator') IS DISTINCT FROM 'string') IS NOT FALSE THEN RETURN NULL; END IF;
  v_operator := v_filter ->> 'operator';
  IF v_operator IN ('equals', 'contains', 'startsWith', 'gt', 'gte', 'lt', 'lte') THEN
    IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_filter) AS key) = ARRAY['field', 'operator', 'value'] AND jsonb_typeof(v_filter -> 'value') = 'string' THEN
      RETURN v_filter;
    END IF;
    RETURN NULL;
  ELSIF v_operator IN ('in', 'notIn', 'between') THEN
    IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_filter) AS key) = ARRAY['field', 'operator', 'value'] AND jsonb_typeof(v_filter -> 'value') = 'array'
      AND jsonb_array_length(v_filter -> 'value') <= 100 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_filter -> 'value') AS v(value) WHERE jsonb_typeof(v.value) <> 'string') THEN
      RETURN v_filter;
    END IF;
    RETURN NULL;
  ELSIF v_operator IN ('isNull', 'isNotNull', 'hasSome', 'hasNone') THEN
    IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_filter) AS key) = ARRAY['field', 'operator'] THEN RETURN v_filter; END IF;
    RETURN NULL;
  ELSIF v_operator = 'inLastDays' THEN
    IF ((SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_filter) AS key) <> ARRAY['field', 'operator', 'value']) IS NOT FALSE THEN RETURN NULL; END IF;
    v_number := crm_upgrade.js_to_number(v_filter -> 'value');
    IF (v_number IS NULL OR v_number <> floor(v_number) OR v_number <= 0 OR v_number > 365000) IS NOT FALSE THEN RETURN NULL; END IF;
    RETURN v_filter || jsonb_build_object('value', v_number::bigint);
  END IF;
  RETURN NULL;
END
$$;

-- typeof value === "number" && Number.isFinite(value) ? new Decimal(String(value)).toFixed() : value
CREATE FUNCTION crm_upgrade.legacy_filter_canonical(p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_number double precision;
BEGIN
  IF jsonb_typeof(p_value) <> 'number' THEN RETURN p_value; END IF;
  v_number := crm_upgrade.js_parse_number(p_value::text::numeric);
  IF v_number IN ('Infinity'::float8, '-Infinity'::float8) THEN RETURN p_value; END IF;
  RETURN to_jsonb(crm_upgrade.decimal_text(crm_upgrade.js_num(v_number)::numeric));
END
$$;

-- migrateFilters (v5/filters.ts) with the documented repairs. Parses legacy filters, maps each field to a
-- record column key and returns the legacy-shaped filters that DataView/P13n keep.
--   * repair_missing_columns: a UUID-shaped field that resolves to no field of the type references a
--     deleted legacy CustomColumn; that filter is dropped (the legacy UI ignored it). Counted per row.
--   * Unknown option values are removed from select in/notIn filters; a notIn left empty is dropped
--     (no record holds a deleted option), an in left empty stays and still matches nothing.
CREATE FUNCTION crm_upgrade.migrate_filters(p_company_id text, p_kind text, p_raw jsonb, p_model jsonb, p_repair_missing_columns boolean,
  p_owner_table text, p_owner_id text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_filters jsonb := '[]';
  v_parsed jsonb;
  v_mapped text;
  v_field jsonb;
  v_kept jsonb;
  v_item record;
BEGIN
  IF p_raw IS NULL OR p_raw = 'null'::jsonb THEN RETURN '[]'::jsonb; END IF;
  IF (jsonb_typeof(p_raw) <> 'array' OR jsonb_array_length(p_raw) > 50) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
  FOR v_item IN SELECT value, ordinality FROM jsonb_array_elements(p_raw) WITH ORDINALITY ORDER BY ordinality LOOP
    v_parsed := crm_upgrade.legacy_filter_parse(v_item.value);
    IF (v_parsed IS NULL) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
  END LOOP;
  FOR v_item IN SELECT value, ordinality FROM jsonb_array_elements(p_raw) WITH ORDINALITY ORDER BY ordinality LOOP
    v_parsed := crm_upgrade.legacy_filter_parse(v_item.value);
    v_mapped := crm_upgrade.migrate_column_key(p_company_id, p_kind, v_parsed ->> 'field', p_model);
    IF v_mapped IS NULL THEN
      IF p_repair_missing_columns AND crm_upgrade.is_uuid(v_parsed ->> 'field') THEN
        PERFORM crm_upgrade.repair(p_company_id, p_owner_table, p_owner_id, 'dropped_column_reference', 'filters');
        CONTINUE;
      END IF;
      PERFORM crm_upgrade.fail('unresolved_presentation_field');
    END IF;
    v_parsed := v_parsed || jsonb_build_object('field', v_mapped);
    SELECT f.value INTO v_field FROM jsonb_array_elements(p_model -> 'fields') AS f(value)
      WHERE f.value ->> 'typeId' = crm_upgrade.preset_id(p_company_id, p_kind) AND f.value ->> 'id' = v_mapped LIMIT 1;
    IF v_field ->> 'valueType' = 'select' AND v_parsed ->> 'operator' IN ('in', 'notIn') THEN
      v_kept := COALESCE((SELECT jsonb_agg(v.value ORDER BY v.ordinality) FROM jsonb_array_elements(v_parsed -> 'value') WITH ORDINALITY AS v(value, ordinality)
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(v_field -> 'options') AS o(value) WHERE o.value ->> 'id' = v.value #>> '{}')), '[]'::jsonb);
      IF v_kept <> v_parsed -> 'value' THEN
        PERFORM crm_upgrade.repair(p_company_id, p_owner_table, p_owner_id, 'removed_unknown_option', v_parsed ->> 'operator');
        IF v_parsed ->> 'operator' = 'notIn' AND jsonb_array_length(v_kept) = 0 THEN CONTINUE; END IF;
        v_parsed := v_parsed || jsonb_build_object('value', v_kept);
      END IF;
    END IF;
    v_filters := v_filters || jsonb_build_array(v_parsed);
  END LOOP;
  RETURN v_filters;
END
$$;

-- scalar(raw, field, currency) of migrationQueryFilter.
CREATE FUNCTION crm_upgrade.filter_scalar(p_raw text, p_value_type text, p_field_currency text, p_currency text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_value_type = 'select' THEN RETURN jsonb_build_object('kind', 'select', 'value', p_raw); END IF;
  IF p_value_type = 'member' THEN RETURN jsonb_build_object('kind', 'member', 'value', p_raw); END IF;
  IF p_value_type IN ('number', 'currency') THEN
    RETURN crm_upgrade.scalar_decimal(p_raw, CASE WHEN p_value_type = 'currency' THEN COALESCE(p_field_currency, p_currency) END);
  END IF;
  IF p_value_type IN ('date', 'dateTime', 'dateRange', 'dateTimeRange') THEN
    RETURN jsonb_build_object('kind', CASE WHEN p_value_type IN ('date', 'dateRange') THEN 'date' ELSE 'dateTime' END, 'value', p_raw);
  END IF;
  IF p_value_type = 'boolean' THEN
    IF (p_raw NOT IN ('true', 'false')) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_boolean_filter'); END IF;
    RETURN jsonb_build_object('kind', 'boolean', 'value', p_raw = 'true');
  END IF;
  RETURN crm_upgrade.scalar_text(p_raw);
END
$$;

-- migrationQueryFilter (v5/filters.ts): legacy filters (already mapped) to a validated generic query part
-- {filters, relationships, relatedFilters}.
CREATE FUNCTION crm_upgrade.query_filter(p_type_id text, p_filters jsonb, p_model jsonb, p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_result_filters jsonb := '[]';
  v_result_relationships jsonb := '[]';
  v_result_related jsonb := '[]';
  v_filter jsonb;
  v_key text;
  v_operator text;
  v_path_id text;
  v_parts text[];
  v_relation_id text;
  v_direction text;
  v_record_ids jsonb;
  v_generic_operator text;
  v_path jsonb;
  v_field jsonb;
  v_value_type text;
BEGIN
  FOR v_filter IN SELECT value FROM jsonb_array_elements(p_filters) WITH ORDINALITY AS f(value, ordinality) ORDER BY ordinality LOOP
    v_key := v_filter ->> 'field';
    v_operator := v_filter ->> 'operator';
    v_path_id := CASE WHEN v_key LIKE 'path:%' AND crm_upgrade.is_uuid(substr(v_key, 6)) THEN substr(v_key, 6) END;
    v_parts := string_to_array(v_key, ':');
    v_relation_id := NULL;
    IF v_parts[1] = 'relationship' AND array_length(v_parts, 1) = 3 AND crm_upgrade.is_uuid(v_parts[2]) AND v_parts[3] IN ('outgoing', 'incoming') THEN
      v_relation_id := v_parts[2];
      v_direction := v_parts[3];
    END IF;
    IF v_path_id IS NOT NULL OR v_relation_id IS NOT NULL THEN
      IF (v_operator NOT IN ('in', 'notIn', 'hasSome', 'hasNone')) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_relationship_filter'); END IF;
      v_record_ids := NULL;
      IF v_operator IN ('in', 'notIn') THEN
        IF (EXISTS (SELECT 1 FROM jsonb_array_elements(v_filter -> 'value') AS v(value) WHERE NOT crm_upgrade.is_uuid(v.value #>> '{}'))) IS NOT FALSE THEN
          PERFORM crm_upgrade.fail('invalid_presentation_configuration');
        END IF;
        v_record_ids := v_filter -> 'value';
      END IF;
      v_generic_operator := CASE WHEN v_operator IN ('notIn', 'hasNone') THEN 'none' ELSE 'any' END;
      IF v_relation_id IS NOT NULL THEN
        v_result_relationships := v_result_relationships || jsonb_build_array(jsonb_build_object('relationId', v_relation_id, 'direction', v_direction,
          'operator', v_generic_operator, 'recordIds', COALESCE(v_record_ids, 'null'::jsonb)));
      ELSE
        SELECT p.value -> 'path' INTO v_path FROM jsonb_array_elements(p_model -> 'types') AS t(value), jsonb_array_elements(COALESCE(t.value -> 'relationshipPaths', '[]')) AS p(value)
          WHERE t.value ->> 'id' = p_type_id AND p.value ->> 'id' = v_path_id LIMIT 1;
        IF (v_path IS NULL) IS NOT FALSE THEN PERFORM crm_upgrade.fail('unresolved_relationship_path'); END IF;
        v_result_related := v_result_related || jsonb_build_array(jsonb_build_object('path', v_path, 'operator', v_generic_operator, 'filters', '[]'::jsonb, 'relationships', '[]'::jsonb)
          || CASE WHEN v_record_ids IS NOT NULL THEN jsonb_build_object('recordIds', v_record_ids) ELSE '{}'::jsonb END);
      END IF;
      CONTINUE;
    END IF;
    v_field := NULL;
    SELECT f.value INTO v_field FROM jsonb_array_elements(p_model -> 'fields') AS f(value) WHERE f.value ->> 'typeId' = p_type_id AND f.value ->> 'id' = v_key LIMIT 1;
    v_value_type := COALESCE(v_field ->> 'valueType', CASE WHEN v_key IN ('system:createdAt', 'system:updatedAt') THEN 'dateTime' WHEN v_key = 'system:assignedTo' THEN 'member' END);
    IF (v_value_type IS NULL) IS NOT FALSE THEN PERFORM crm_upgrade.fail('unresolved_filter_field'); END IF;
    IF v_operator IN ('isNull', 'isNotNull', 'hasSome', 'hasNone') THEN
      IF (v_operator IN ('hasSome', 'hasNone') AND v_key <> 'system:assignedTo') IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_scalar_existence_filter'); END IF;
      v_result_filters := v_result_filters || jsonb_build_array(jsonb_build_object('fieldId', v_key,
        'operator', CASE WHEN v_operator IN ('isNull', 'hasNone') THEN 'empty' ELSE 'notEmpty' END, 'value', NULL));
    ELSIF v_operator = 'inLastDays' THEN
      v_result_filters := v_result_filters || jsonb_build_array(jsonb_build_object('fieldId', v_key, 'operator', 'inLastDays',
        'value', crm_upgrade.scalar_decimal((v_filter ->> 'value'), NULL)));
    ELSIF v_operator IN ('in', 'notIn', 'between') THEN
      v_result_filters := v_result_filters || jsonb_build_array(jsonb_build_object('fieldId', v_key, 'operator', v_operator, 'value', NULL,
        'values', COALESCE((SELECT jsonb_agg(crm_upgrade.filter_scalar(v.value #>> '{}', v_value_type, v_field #>> '{format,currency}', p_currency) ORDER BY v.ordinality)
          FROM jsonb_array_elements(v_filter -> 'value') WITH ORDINALITY AS v(value, ordinality)), '[]'::jsonb)));
    ELSIF jsonb_typeof(v_filter -> 'value') = 'string' THEN
      v_result_filters := v_result_filters || jsonb_build_array(jsonb_build_object('fieldId', v_key,
        'operator', CASE WHEN v_operator = 'equals' THEN 'eq' ELSE v_operator END,
        'value', crm_upgrade.filter_scalar(v_filter ->> 'value', v_value_type, v_field #>> '{format,currency}', p_currency)));
    ELSE
      PERFORM crm_upgrade.fail('invalid_filter_value');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('filters', v_result_filters, 'relationships', v_result_relationships, 'relatedFilters', v_result_related);
END
$$;

-- Validates a generic query part exactly like RecordQuerySchema.parse + invalidRecordQueryPart.
CREATE FUNCTION crm_upgrade.assert_query(p_query jsonb, p_model jsonb, p_code text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF (NOT crm_upgrade.query_parse_valid(p_query)) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
  IF (NOT crm_upgrade.query_valid(p_query, p_model)) IS NOT FALSE THEN PERFORM crm_upgrade.fail(p_code); END IF;
END
$$;

-- migrateQueryFilter: the validated generic filter of a legacy filter list of one legacy type.
CREATE FUNCTION crm_upgrade.migrate_query_filter(p_company_id text, p_kind text, p_legacy_filters jsonb, p_model jsonb, p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_result jsonb := crm_upgrade.query_filter(crm_upgrade.preset_id(p_company_id, p_kind), p_legacy_filters, p_model, p_currency);
BEGIN
  PERFORM crm_upgrade.assert_query(v_result || jsonb_build_object('typeId', crm_upgrade.preset_id(p_company_id, p_kind)), p_model, 'invalid_migrated_filter');
  RETURN v_result;
END
$$;

-- validatePresentationReferences (v5/references.ts): every referenced member and record must exist in
-- the same workspace (records in the legacy table of their type, line items in ServiceDeal).
CREATE FUNCTION crm_upgrade.reference_issues(p_company_id text, p_model jsonb, p_scopes jsonb, p_owner_table text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_wanted record;
  v_found boolean;
BEGIN
  FOR v_wanted IN
    WITH RECURSIVE scope(type_id, filters, relationships, related) AS (
      SELECT s.value ->> 'typeId', COALESCE(s.value -> 'filters', '[]'), COALESCE(s.value -> 'relationships', '[]'), COALESCE(s.value -> 'relatedFilters', '[]')
        FROM jsonb_array_elements(p_scopes) AS s(value)
      UNION ALL
      SELECT crm_upgrade.resolve_path(scope.type_id, r.value -> 'path', p_model), COALESCE(r.value -> 'filters', '[]'), COALESCE(r.value -> 'relationships', '[]'), '[]'::jsonb
        FROM scope, jsonb_array_elements(scope.related) AS r(value)
    ), refs(scope, id) AS (
      SELECT 'member', v.value ->> 'value' FROM scope, jsonb_array_elements(scope.filters) AS f(value),
        jsonb_array_elements(COALESCE(f.value -> 'values', CASE WHEN jsonb_typeof(f.value -> 'value') = 'object' THEN jsonb_build_array(f.value -> 'value') ELSE '[]'::jsonb END)) AS v(value)
        WHERE v.value ->> 'kind' = 'member'
      UNION
      SELECT (SELECT CASE WHEN rel.value ->> 'sourceTypeId' = scope.type_id AND f.value ->> 'direction' = 'outgoing' THEN rel.value ->> 'targetTypeId' ELSE rel.value ->> 'sourceTypeId' END
          FROM jsonb_array_elements(p_model -> 'relationships') AS rel(value) WHERE rel.value ->> 'id' = f.value ->> 'relationId'), id.value #>> '{}'
        FROM scope, jsonb_array_elements(scope.relationships) AS f(value), jsonb_array_elements(CASE WHEN jsonb_typeof(f.value -> 'recordIds') = 'array' THEN f.value -> 'recordIds' ELSE '[]'::jsonb END) AS id(value)
      UNION
      SELECT crm_upgrade.resolve_path(scope.type_id, r.value -> 'path', p_model), id.value #>> '{}'
        FROM scope, jsonb_array_elements(scope.related) AS r(value), jsonb_array_elements(COALESCE(r.value -> 'recordIds', '[]')) AS id(value)
    )
    SELECT refs.scope, refs.id FROM refs
  LOOP
    v_found := CASE
      WHEN v_wanted.scope = 'member' THEN EXISTS (SELECT 1 FROM "User" u WHERE u."companyId" = p_company_id AND u.id = v_wanted.id)
      WHEN v_wanted.scope = crm_upgrade.preset_id(p_company_id, 'contact') THEN EXISTS (SELECT 1 FROM "Contact" r WHERE r."companyId" = p_company_id AND r.id = v_wanted.id)
      WHEN v_wanted.scope = crm_upgrade.preset_id(p_company_id, 'organization') THEN EXISTS (SELECT 1 FROM "Organization" r WHERE r."companyId" = p_company_id AND r.id = v_wanted.id)
      WHEN v_wanted.scope = crm_upgrade.preset_id(p_company_id, 'deal') THEN EXISTS (SELECT 1 FROM "Deal" r WHERE r."companyId" = p_company_id AND r.id = v_wanted.id)
      WHEN v_wanted.scope = crm_upgrade.preset_id(p_company_id, 'service') THEN EXISTS (SELECT 1 FROM "Service" r WHERE r."companyId" = p_company_id AND r.id = v_wanted.id)
      WHEN v_wanted.scope = crm_upgrade.preset_id(p_company_id, 'task') THEN EXISTS (SELECT 1 FROM "Task" r WHERE r."companyId" = p_company_id AND r.id = v_wanted.id)
      WHEN v_wanted.scope = crm_upgrade.preset_id(p_company_id, 'lineItem') THEN EXISTS (SELECT 1 FROM "ServiceDeal" r WHERE r."companyId" = p_company_id AND r.id = v_wanted.id)
      ELSE false END;
    IF NOT v_found THEN
      PERFORM crm_upgrade.issue(p_company_id, p_owner_table, 'references', 'unresolved_presentation_reference');
    END IF;
  END LOOP;
END
$$;

-- Maps a presentation column key of a list or detail surface. Returns NULL when the key is a UUID that
-- resolves to no field of the type (a deleted legacy CustomColumn: documented repair, reference dropped).
CREATE FUNCTION crm_upgrade.presentation_key(p_company_id text, p_kind text, p_key text, p_model jsonb, p_owner_table text, p_owner_id text,
  p_location text, p_unavailable_code text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_mapped text := crm_upgrade.migrate_column_key(p_company_id, p_kind, p_key, p_model);
BEGIN
  IF v_mapped IS NULL THEN
    IF crm_upgrade.is_uuid(p_key) THEN
      PERFORM crm_upgrade.repair(p_company_id, p_owner_table, p_owner_id, 'dropped_column_reference', p_location);
      RETURN NULL;
    END IF;
    PERFORM crm_upgrade.fail('unresolved_presentation_field');
  END IF;
  IF (NOT EXISTS (SELECT 1 FROM crm_upgrade.record_columns(crm_upgrade.preset_id(p_company_id, p_kind), p_model) AS c WHERE c.id = v_mapped)) IS NOT FALSE THEN
    PERFORM crm_upgrade.fail(p_unavailable_code);
  END IF;
  RETURN v_mapped;
END
$$;

-- keys(raw): a string array of at most 500 entries mapped key by key; duplicates after mapping refuse.
CREATE FUNCTION crm_upgrade.presentation_keys(p_company_id text, p_kind text, p_raw jsonb, p_model jsonb, p_owner_table text, p_owner_id text,
  p_location text, p_max_length integer, p_unavailable_code text, p_duplicate_code text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_result text[] := ARRAY[]::text[];
  v_mapped text;
  v_item jsonb;
BEGIN
  IF (jsonb_typeof(p_raw) <> 'array' OR (p_max_length IS NOT NULL AND jsonb_array_length(p_raw) > p_max_length)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_raw) AS v(value) WHERE jsonb_typeof(v.value) <> 'string')) IS NOT FALSE THEN
    PERFORM crm_upgrade.fail('invalid_presentation_configuration');
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_raw) WITH ORDINALITY AS v(value, ordinality) ORDER BY ordinality LOOP
    v_mapped := crm_upgrade.presentation_key(p_company_id, p_kind, v_item #>> '{}', p_model, p_owner_table, p_owner_id, p_location, p_unavailable_code);
    IF v_mapped IS NOT NULL THEN v_result := v_result || v_mapped; END IF;
  END LOOP;
  IF ((SELECT count(DISTINCT v) FROM unnest(v_result) AS v) <> coalesce(array_length(v_result, 1), 0)) IS NOT FALSE THEN PERFORM crm_upgrade.fail(p_duplicate_code); END IF;
  RETURN to_jsonb(v_result);
END
$$;

-- Largest supported page size not above the stored one (5 for anything smaller). Documented repair.
CREATE FUNCTION crm_upgrade.supported_page_size(value double precision) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN value >= 100 THEN 100 WHEN value >= 25 THEN 25 WHEN value >= 10 THEN 10 ELSE 5 END
$$;

-- migratePresentationState (v5/state.ts) for a list DataView (personalization = false) or list P13n
-- (personalization = true). row is to_jsonb of the legacy row with array columns as JSON arrays.
-- Returns {"output": <changed row>, "query": <generic list query>}.
CREATE FUNCTION crm_upgrade.migrate_presentation_state(p_company_id text, p_kind text, p_source_row jsonb, p_model jsonb, p_personalization boolean,
  p_currency text, p_owner_table text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_type_id text := crm_upgrade.preset_id(p_company_id, p_kind);
  v_owner_id text := p_source_row ->> 'id';
  v_output jsonb := p_source_row;
  v_legacy_filters jsonb;
  v_filters jsonb;
  v_sort jsonb;
  v_order_field text;
  v_group_spec jsonb;
  v_mapped text;
  v_explicit jsonb;
  v_widths jsonb := '{}';
  v_entry record;
  v_number double precision;
  v_page_size jsonb;
  v_state_keys jsonb;
  v_query jsonb;
BEGIN
  v_legacy_filters := crm_upgrade.migrate_filters(p_company_id, p_kind, p_source_row -> 'filters', p_model, true, p_owner_table, v_owner_id);
  IF p_source_row -> 'filters' <> 'null'::jsonb THEN v_output := v_output || jsonb_build_object('filters', v_legacy_filters); END IF;
  v_filters := crm_upgrade.migrate_query_filter(p_company_id, p_kind, v_legacy_filters, p_model, p_currency);
  v_sort := p_source_row -> 'sortDescriptor';
  IF v_sort <> 'null'::jsonb THEN
    IF (jsonb_typeof(v_sort) <> 'object') IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
    IF v_sort <> '{}'::jsonb THEN
      IF ((SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_sort) AS key) <> ARRAY['direction', 'field']
        OR jsonb_typeof(v_sort -> 'field') <> 'string' OR v_sort ->> 'direction' NOT IN ('asc', 'desc') OR jsonb_typeof(v_sort -> 'direction') <> 'string') IS NOT FALSE THEN
        PERFORM crm_upgrade.fail('invalid_presentation_configuration');
      END IF;
      v_order_field := crm_upgrade.presentation_key(p_company_id, p_kind, v_sort ->> 'field', p_model, p_owner_table, v_owner_id, 'sortDescriptor', 'unsupported_presentation_column');
      IF v_order_field IS NULL THEN
        v_output := v_output || '{"sortDescriptor":null}'::jsonb;
      ELSE
        v_output := v_output || jsonb_build_object('sortDescriptor', jsonb_build_object('field', v_order_field, 'direction', v_sort -> 'direction'));
      END IF;
    END IF;
  END IF;
  v_group_spec := p_source_row -> 'grouping';
  IF v_group_spec <> 'null'::jsonb THEN
    IF (jsonb_typeof(v_group_spec) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_group_spec) AS key WHERE key NOT IN ('field', 'bucket'))
      OR jsonb_typeof(v_group_spec -> 'field') IS DISTINCT FROM 'string' OR crm_upgrade.js_len(v_group_spec ->> 'field') NOT BETWEEN 1 AND 200
      OR (v_group_spec ? 'bucket' AND (jsonb_typeof(v_group_spec -> 'bucket') <> 'string' OR v_group_spec ->> 'bucket' NOT IN ('day', 'week', 'month')))) IS NOT FALSE THEN
      PERFORM crm_upgrade.fail('invalid_presentation_configuration');
    END IF;
    v_mapped := crm_upgrade.presentation_key(p_company_id, p_kind, v_group_spec ->> 'field', p_model, p_owner_table, v_owner_id, 'grouping', 'unsupported_presentation_column');
    IF v_mapped IS NULL THEN
      v_output := v_output || '{"grouping":null,"groupingColumnId":null}'::jsonb;
    ELSE
      v_group_spec := v_group_spec || jsonb_build_object('field', v_mapped);
      IF (NOT crm_upgrade.grouping_valid(v_type_id, v_group_spec, p_model)) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_grouping'); END IF;
      v_output := v_output || jsonb_build_object('grouping', v_group_spec, 'groupingColumnId', CASE WHEN crm_upgrade.is_uuid(v_mapped) THEN to_jsonb(v_mapped) ELSE 'null'::jsonb END);
    END IF;
  ELSE
    v_output := v_output || '{"groupingColumnId":null}'::jsonb;
  END IF;
  IF p_source_row -> 'columnOrder' <> 'null'::jsonb THEN
    v_output := v_output || jsonb_build_object('columnOrder', crm_upgrade.presentation_keys(p_company_id, p_kind, p_source_row -> 'columnOrder', p_model, p_owner_table, v_owner_id,
      'columnOrder', 500, 'unsupported_presentation_column', 'duplicate_column_after_mapping'));
  END IF;
  IF p_source_row -> 'hiddenColumns' <> 'null'::jsonb THEN
    v_output := v_output || jsonb_build_object('hiddenColumns', crm_upgrade.presentation_keys(p_company_id, p_kind, p_source_row -> 'hiddenColumns', p_model, p_owner_table, v_owner_id,
      'hiddenColumns', 500, 'unsupported_presentation_column', 'duplicate_column_after_mapping'));
  END IF;
  IF jsonb_typeof(v_output -> 'hiddenColumns') = 'array' THEN
    v_explicit := CASE WHEN jsonb_typeof(v_output -> 'columnOrder') = 'array' THEN v_output -> 'columnOrder' ELSE '[]'::jsonb END;
    v_output := v_output || jsonb_build_object('hiddenColumns', (SELECT COALESCE(jsonb_agg(c.id ORDER BY c.first), '[]'::jsonb) FROM (
      SELECT h.id, min(h.ordinality) AS first FROM (
        SELECT v.value #>> '{}' AS id, v.ordinality FROM jsonb_array_elements(v_output -> 'hiddenColumns') WITH ORDINALITY AS v(value, ordinality)
        UNION ALL
        SELECT i.id, 100000 + i.ordinality FROM unnest(crm_upgrade.introduced_columns(p_company_id, p_kind)) WITH ORDINALITY AS i(id, ordinality)
          WHERE NOT v_explicit ? i.id
      ) AS h GROUP BY h.id) AS c));
  END IF;
  IF p_source_row -> 'columnWidths' <> 'null'::jsonb THEN
    IF (jsonb_typeof(p_source_row -> 'columnWidths') <> 'object') IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
    FOR v_entry IN SELECT key, value FROM jsonb_each(p_source_row -> 'columnWidths') LOOP
      IF (jsonb_typeof(v_entry.value) <> 'number') IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
      v_number := crm_upgrade.js_parse_number(v_entry.value::text::numeric);
      IF (v_number IN ('Infinity'::float8, '-Infinity'::float8) OR v_number < 0) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
    END LOOP;
    FOR v_entry IN SELECT key, value FROM jsonb_each(p_source_row -> 'columnWidths') LOOP
      v_mapped := crm_upgrade.presentation_key(p_company_id, p_kind, v_entry.key, p_model, p_owner_table, v_owner_id, 'columnWidths', 'unsupported_presentation_column');
      IF v_mapped IS NULL THEN CONTINUE; END IF;
      IF (v_widths ? v_mapped) IS NOT FALSE THEN PERFORM crm_upgrade.fail('duplicate_column_after_mapping'); END IF;
      v_widths := v_widths || jsonb_build_object(v_mapped, crm_upgrade.js_json(v_entry.value));
    END LOOP;
    v_output := v_output || jsonb_build_object('columnWidths', v_widths);
  END IF;
  IF (p_source_row -> 'searchTerm' <> 'null'::jsonb AND crm_upgrade.js_len(p_source_row ->> 'searchTerm') > 200) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
  IF (p_source_row -> 'viewMode' <> 'null'::jsonb AND p_source_row ->> 'viewMode' NOT IN ('table', 'card')) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
  IF p_personalization AND p_source_row -> 'pagination' <> 'null'::jsonb THEN
    v_page_size := p_source_row #> '{pagination,pageSize}';
    IF (jsonb_typeof(p_source_row -> 'pagination') <> 'object' OR jsonb_typeof(v_page_size) IS DISTINCT FROM 'number') IS NOT FALSE THEN
      PERFORM crm_upgrade.fail('invalid_presentation_configuration');
    END IF;
    v_number := crm_upgrade.js_parse_number(v_page_size::text::numeric);
    IF v_number NOT IN (5, 10, 25, 100) THEN
      PERFORM crm_upgrade.repair(p_company_id, p_owner_table, v_owner_id, 'page_size', crm_upgrade.supported_page_size(v_number)::text);
      v_output := v_output || jsonb_build_object('pagination', (p_source_row -> 'pagination') || jsonb_build_object('pageSize', crm_upgrade.supported_page_size(v_number)));
    END IF;
  END IF;
  IF NOT p_personalization AND p_source_row -> 'pageSize' <> 'null'::jsonb AND (p_source_row ->> 'pageSize')::integer NOT IN (5, 10, 25, 100) THEN
    PERFORM crm_upgrade.repair(p_company_id, p_owner_table, v_owner_id, 'page_size', crm_upgrade.supported_page_size((p_source_row ->> 'pageSize')::integer)::text);
    v_output := v_output || jsonb_build_object('pageSize', crm_upgrade.supported_page_size((p_source_row ->> 'pageSize')::integer));
  END IF;
  IF p_personalization THEN
    -- viewStateKeys did not exist on legacy rows: the explicitly stored state keys, in StateKey order.
    v_output := v_output || jsonb_build_object('viewStateKeys', (SELECT COALESCE(jsonb_agg(k.name ORDER BY k.position), '[]'::jsonb) FROM (VALUES
      (1, 'filters', 'filters'), (2, 'searchTerm', 'searchTerm'), (3, 'sortDescriptor', 'sortDescriptor'), (4, 'pageSize', 'pagination'),
      (5, 'viewMode', 'viewMode'), (6, 'grouping', 'grouping'), (7, 'columnOrder', 'columnOrder'), (8, 'columnWidths', 'columnWidths'),
      (9, 'hiddenColumns', 'hiddenColumns')) AS k(position, name, column_name)
      WHERE v_output -> k.column_name IS NOT NULL AND v_output -> k.column_name <> 'null'::jsonb));
  END IF;
  v_query := v_filters || jsonb_build_object('typeId', v_type_id,
    'sort', CASE WHEN jsonb_typeof(v_output -> 'sortDescriptor') = 'object' AND v_output #> '{sortDescriptor,field}' IS NOT NULL
      THEN jsonb_build_array(jsonb_build_object('fieldId', v_output #> '{sortDescriptor,field}', 'direction', v_output #> '{sortDescriptor,direction}')) ELSE '[]'::jsonb END);
  IF (NOT crm_upgrade.query_parse_valid(v_query)) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
  IF (NOT crm_upgrade.query_valid(v_query, p_model)) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_view_query'); END IF;
  RETURN jsonb_build_object('output', v_output, 'query', v_filters || jsonb_build_object('typeId', v_type_id));
END
$$;

-- migrateDetailState (v5/state.ts) for a "<kind>-detail" P13n row.
CREATE FUNCTION crm_upgrade.migrate_detail_state(p_company_id text, p_kind text, p_source_row jsonb, p_model jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_owner_id text := p_source_row ->> 'id';
  v_output jsonb := p_source_row || jsonb_build_object('p13nId', 'record-detail:' || crm_upgrade.preset_id(p_company_id, p_kind));
  v_detail jsonb := p_source_row -> 'detailOptions';
  v_converted jsonb;
  v_key text;
BEGIN
  IF p_source_row -> 'columnOrder' <> 'null'::jsonb THEN
    v_output := v_output || jsonb_build_object('columnOrder', crm_upgrade.presentation_keys(p_company_id, p_kind, p_source_row -> 'columnOrder', p_model, 'P13n', v_owner_id,
      'columnOrder', NULL, 'unsupported_detail_field', 'duplicate_detail_field_after_mapping'));
  END IF;
  IF v_detail <> 'null'::jsonb THEN
    IF (jsonb_typeof(v_detail) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_detail) AS k WHERE k NOT IN ('starredFieldIds', 'collapsedSectionIds', 'hiddenFieldIds', 'fieldOrder'))
      OR NOT v_detail ? 'starredFieldIds' OR NOT v_detail ? 'collapsedSectionIds'
      OR EXISTS (SELECT 1 FROM jsonb_each(v_detail) AS e WHERE jsonb_typeof(e.value) <> 'array'
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) AS v(value) WHERE jsonb_typeof(v.value) <> 'string'))) IS NOT FALSE THEN
      PERFORM crm_upgrade.fail('invalid_presentation_configuration');
    END IF;
    v_converted := v_detail;
    FOREACH v_key IN ARRAY ARRAY['starredFieldIds', 'hiddenFieldIds', 'fieldOrder'] LOOP
      IF v_detail ? v_key THEN
        v_converted := v_converted || jsonb_build_object(v_key, crm_upgrade.presentation_keys(p_company_id, p_kind, v_detail -> v_key, p_model, 'P13n', v_owner_id,
          'detailOptions', NULL, 'unsupported_detail_field', 'duplicate_detail_field_after_mapping'));
      END IF;
    END LOOP;
    v_output := v_output || jsonb_build_object('detailOptions', v_converted);
  END IF;
  RETURN v_output;
END
$$;

-- RecordMeasureSchema.parse validity of the measure parts the conversion produces.
CREATE FUNCTION crm_upgrade.measure_parse_valid(measure jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((crm_upgrade.query_parse_valid(measure -> 'source')
    AND (measure #> '{groupBy,filter}' IS NULL OR crm_upgrade.query_parse_valid(measure #> '{groupBy,filter}'))), false)
$$;

-- migrateChartMeasure (v5/widgets.ts). row is to_jsonb of the legacy Widget row.
CREATE FUNCTION crm_upgrade.migrate_chart_measure(p_company_id text, p_source_row jsonb, p_model jsonb, p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_kind text := p_source_row ->> 'entityType';
  v_aggregation text := p_source_row ->> 'aggregationType';
  v_group_type text := p_source_row ->> 'groupByType';
  v_owner_id text := p_source_row ->> 'id';
  v_entity jsonb;
  v_deals jsonb;
  v_is_count boolean := v_aggregation = 'count';
  v_source_type text;
  v_related jsonb := '[]';
  v_entity_path jsonb;
  v_source_filter jsonb;
  v_value_field text;
  v_field jsonb;
  v_measure jsonb;
  v_terminal text;
BEGIN
  IF (v_kind NOT IN ('contact', 'organization', 'deal', 'service', 'task') OR v_kind IS NULL
    OR v_aggregation IS NULL OR v_aggregation NOT IN ('count', 'dealValue', 'dealWeightedValue', 'dealQuantity')
    OR v_group_type IS NULL OR v_group_type NOT IN ('none', 'customColumn', 'contact', 'organization', 'deal', 'service')) IS NOT FALSE THEN
    PERFORM crm_upgrade.fail('invalid_presentation_configuration');
  END IF;
  v_entity := crm_upgrade.migrate_query_filter(p_company_id, v_kind,
    crm_upgrade.migrate_filters(p_company_id, v_kind, p_source_row -> 'entityFilters', p_model, false, 'Widget', v_owner_id), p_model, p_currency);
  v_deals := crm_upgrade.migrate_query_filter(p_company_id, 'deal',
    crm_upgrade.migrate_filters(p_company_id, 'deal', p_source_row -> 'dealFilters', p_model, false, 'Widget', v_owner_id), p_model, p_currency);
  IF ((NOT v_is_count AND v_kind = 'task') OR (v_aggregation = 'dealQuantity' AND v_kind <> 'service') OR (v_aggregation = 'dealWeightedValue' AND v_kind = 'service')) IS NOT FALSE THEN
    PERFORM crm_upgrade.fail('unsupported_legacy_widget_measure');
  END IF;
  IF (v_group_type NOT IN ('none', 'customColumn') AND (v_group_type <> v_kind OR v_is_count)) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_legacy_widget_group'); END IF;
  v_source_type := CASE WHEN v_is_count THEN v_kind WHEN v_kind = 'service' THEN 'lineItem' ELSE 'deal' END;
  v_entity_path := CASE WHEN v_source_type = v_kind THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
    'relationId', crm_upgrade.preset_id(p_company_id, CASE WHEN v_kind = 'service' THEN 'lineItem.service' ELSE 'deal.' || v_kind || 's' END), 'direction', 'outgoing')) END;
  IF v_is_count THEN
    v_source_filter := v_entity;
  ELSIF v_kind = 'deal' THEN
    v_source_filter := jsonb_build_object('filters', (v_entity -> 'filters') || (v_deals -> 'filters'), 'relationships', (v_entity -> 'relationships') || (v_deals -> 'relationships'),
      'relatedFilters', (v_entity -> 'relatedFilters') || (v_deals -> 'relatedFilters'));
  ELSIF v_kind = 'service' THEN
    v_related := v_related || crm_upgrade.measure_through(jsonb_build_array(jsonb_build_object('relationId', crm_upgrade.preset_id(p_company_id, 'lineItem.deal'), 'direction', 'outgoing')), v_deals, p_model);
    v_source_filter := '{"filters":[],"relationships":[]}'::jsonb;
  ELSE
    v_source_filter := v_deals;
  END IF;
  IF NOT v_is_count AND v_kind <> 'deal' THEN v_related := v_related || crm_upgrade.measure_through(v_entity_path, v_entity, p_model); END IF;
  v_value_field := CASE WHEN v_is_count THEN NULL WHEN v_kind = 'service' THEN crm_upgrade.preset_id(p_company_id, CASE WHEN v_aggregation = 'dealQuantity' THEN 'lineItem.quantity' ELSE 'lineItem.amount' END)
    ELSE crm_upgrade.preset_id(p_company_id, CASE WHEN v_aggregation = 'dealWeightedValue' THEN 'deal.weightedValue' ELSE 'deal.totalValue' END) END;
  IF v_group_type = 'customColumn' THEN
    SELECT f.value INTO v_field FROM jsonb_array_elements(p_model -> 'fields') AS f(value)
      WHERE f.value ->> 'id' = p_source_row ->> 'groupByCustomColumnId' AND f.value ->> 'typeId' = crm_upgrade.preset_id(p_company_id, v_kind) AND f.value ->> 'valueType' = 'select' LIMIT 1;
    IF (v_field IS NULL) IS NOT FALSE THEN PERFORM crm_upgrade.fail('unresolved_widget_group_field'); END IF;
  END IF;
  -- RecordMeasureSchema.parse output: query defaults (filters/relationships) and groupLimit.
  v_measure := jsonb_build_object(
    'source', jsonb_build_object('typeId', crm_upgrade.preset_id(p_company_id, v_source_type),
      'filters', v_source_filter -> 'filters', 'relationships', v_source_filter -> 'relationships',
      'relatedFilters', COALESCE(v_source_filter -> 'relatedFilters', '[]'::jsonb) || v_related),
    'aggregation', CASE WHEN v_is_count THEN 'count' ELSE 'sum' END,
    'valueFieldId', v_value_field,
    'groupBy', CASE WHEN v_group_type = 'none' THEN 'null'::jsonb ELSE jsonb_build_object('path', v_entity_path, 'fieldId', v_field -> 'id')
      || CASE WHEN jsonb_array_length(v_entity_path) > 0 THEN jsonb_build_object('filter', v_entity) ELSE '{}'::jsonb END END,
    'groupLimit', 1000);
  IF v_measure #> '{groupBy,fieldId}' IS NULL AND v_measure -> 'groupBy' <> 'null'::jsonb THEN
    v_measure := jsonb_set(v_measure, '{groupBy,fieldId}', 'null'::jsonb);
  END IF;
  IF (NOT crm_upgrade.measure_parse_valid(v_measure)) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
  -- recordMeasureIsValid
  IF (NOT crm_upgrade.query_valid(v_measure -> 'source', p_model)) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_migrated_widget_measure'); END IF;
  IF v_measure -> 'groupBy' <> 'null'::jsonb THEN
    v_terminal := CASE WHEN jsonb_array_length(v_entity_path) = 0 THEN v_measure #>> '{source,typeId}' ELSE crm_upgrade.resolve_path(v_measure #>> '{source,typeId}', v_entity_path, p_model) END;
    IF (v_terminal IS NULL) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_migrated_widget_measure'); END IF;
    IF (v_measure #> '{groupBy,filter}' IS NOT NULL AND NOT crm_upgrade.query_valid((v_measure #> '{groupBy,filter}') || jsonb_build_object('typeId', v_terminal), p_model)) IS NOT FALSE THEN
      PERFORM crm_upgrade.fail('invalid_migrated_widget_measure');
    END IF;
    IF (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_model -> 'fields') AS f(value)
      WHERE f.value ->> 'typeId' = v_terminal AND NOT (f.value ->> 'archived')::boolean
        AND f.value ->> 'id' = COALESCE(v_measure #>> '{groupBy,fieldId}', (SELECT t.value ->> 'primaryFieldId' FROM jsonb_array_elements(p_model -> 'types') AS t(value) WHERE t.value ->> 'id' = v_terminal))
        AND NOT COALESCE((f.value ->> 'multiple')::boolean, false) AND f.value ->> 'valueType' NOT IN ('richText', 'dateRange', 'dateTimeRange'))) IS NOT FALSE THEN
      PERFORM crm_upgrade.fail('invalid_migrated_widget_measure');
    END IF;
  END IF;
  RETURN v_measure;
END
$$;

-- through(path, filter) of migrateChartMeasure.
CREATE FUNCTION crm_upgrade.measure_through(p_path jsonb, p_filter jsonb, p_model jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
BEGIN
  IF (jsonb_array_length(COALESCE(p_filter -> 'relatedFilters', '[]')) > 0 AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_path) AS s(value)
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_model -> 'relationships') AS r(value)
      WHERE r.value ->> 'id' = s.value ->> 'relationId'
        AND (CASE WHEN s.value ->> 'direction' = 'outgoing' THEN r.value ->> 'sourceCardinality' ELSE r.value ->> 'targetCardinality' END) = 'one'))) IS NOT FALSE THEN
    PERFORM crm_upgrade.fail('ambiguous_nested_relationship_filter');
  END IF;
  RETURN jsonb_build_array(jsonb_build_object('path', p_path, 'operator', 'any', 'filters', p_filter -> 'filters', 'relationships', p_filter -> 'relationships'))
    || COALESCE((SELECT jsonb_agg(n.value || jsonb_build_object('path', p_path || (n.value -> 'path')) ORDER BY n.ordinality)
      FROM jsonb_array_elements(COALESCE(p_filter -> 'relatedFilters', '[]')) WITH ORDINALITY AS n(value, ordinality)), '[]'::jsonb);
END
$$;

-- WidgetDisplayOptionsSchema (strict).
CREATE FUNCTION crm_upgrade.widget_display_valid(options jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((jsonb_typeof(options) = 'object'
    AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(options) AS k WHERE k NOT IN ('barColors', 'displayType', 'reverseXAxis', 'reverseYAxis', 'useGroupColors', 'showLegend', 'showFilters'))
    AND options ->> 'displayType' IN ('verticalBarChart', 'horizontalBarChart', 'verticalBarChartWithLabels', 'horizontalBarChartWithLabels', 'doughnutChart', 'radarChart')
    AND jsonb_typeof(options -> 'displayType') = 'string'
    AND (NOT options ? 'barColors' OR (jsonb_typeof(options -> 'barColors') = 'array' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(options -> 'barColors') AS c(value)
      WHERE jsonb_typeof(c.value) <> 'string' OR c.value #>> '{}' NOT IN ('default1', 'default2', 'default3', 'primary1', 'primary2', 'primary3', 'secondary1', 'secondary2',
        'secondary3', 'success1', 'success2', 'success3', 'warning1', 'warning2', 'warning3', 'danger1', 'danger2', 'danger3'))))
    AND NOT EXISTS (SELECT 1 FROM jsonb_each(options) AS e WHERE e.key IN ('reverseXAxis', 'reverseYAxis', 'useGroupColors', 'showLegend', 'showFilters') AND jsonb_typeof(e.value) <> 'boolean')), false)
$$;

-- migrateActivityQuery (v4/activity-query.ts): legacy timeline filters to the generic activity query.
CREATE FUNCTION crm_upgrade.migrate_activity_query(p_company_id text, p_legacy jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_filters jsonb := '[]';
  v_item jsonb;
  v_field text;
  v_operator text;
  v_record_type text;
  v_presence boolean;
  v_kinds jsonb;
BEGIN
  IF p_legacy IS NULL OR p_legacy = 'null'::jsonb THEN p_legacy := '[]'; END IF;
  IF (jsonb_typeof(p_legacy) <> 'array' OR jsonb_array_length(p_legacy) > 20 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_legacy) AS f(value)
    WHERE jsonb_typeof(f.value) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(f.value) AS k WHERE k NOT IN ('field', 'operator', 'value'))
      OR jsonb_typeof(f.value -> 'field') IS DISTINCT FROM 'string' OR jsonb_typeof(f.value -> 'operator') IS DISTINCT FROM 'string'
      OR f.value ->> 'operator' NOT IN ('in', 'notIn', 'hasSome', 'hasNone')
      OR (f.value ? 'value' AND (jsonb_typeof(f.value -> 'value') <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(f.value -> 'value') AS v(value) WHERE jsonb_typeof(v.value) <> 'string'))))) IS NOT FALSE THEN
    PERFORM crm_upgrade.fail('unsupported_activity_configuration');
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_legacy) WITH ORDINALITY AS f(value, ordinality) ORDER BY ordinality LOOP
    v_field := v_item ->> 'field';
    v_operator := v_item ->> 'operator';
    v_record_type := CASE v_field WHEN 'contactIds' THEN 'contact' WHEN 'organizationIds' THEN 'organization' WHEN 'dealIds' THEN 'deal' WHEN 'serviceIds' THEN 'service' WHEN 'taskIds' THEN 'task' END;
    v_presence := v_operator IN ('hasSome', 'hasNone');
    IF (v_presence AND (v_record_type IS NULL OR v_item ? 'value')) IS NOT FALSE THEN PERFORM crm_upgrade.fail('unsupported_activity_configuration'); END IF;
    IF (NOT v_presence AND (NOT v_item ? 'value' OR jsonb_array_length(v_item -> 'value') = 0)) IS NOT FALSE THEN PERFORM crm_upgrade.fail('unsupported_activity_configuration'); END IF;
    IF v_record_type IS NOT NULL THEN
      IF (jsonb_array_length(COALESCE(v_item -> 'value', '[]')) > 50 OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_item -> 'value', '[]')) AS v(value) WHERE NOT crm_upgrade.is_uuid(v.value #>> '{}'))) IS NOT FALSE THEN
        PERFORM crm_upgrade.fail('unsupported_activity_configuration');
      END IF;
      v_filters := v_filters || jsonb_build_array(jsonb_build_object('kind', 'record', 'typeId', crm_upgrade.preset_id(p_company_id, v_record_type), 'operator', v_operator,
        'recordIds', COALESCE(v_item -> 'value', '[]'::jsonb)));
      CONTINUE;
    END IF;
    IF (v_operator NOT IN ('in', 'notIn')) IS NOT FALSE THEN PERFORM crm_upgrade.fail('unsupported_activity_configuration'); END IF;
    IF v_field = 'timelineKind' THEN
      IF (EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_item -> 'value') AS v(value) WHERE v.value NOT IN ('changes', 'messages', 'activities', 'audit', 'message', 'activity', 'calendar_event'))) IS NOT FALSE THEN
        PERFORM crm_upgrade.fail('unsupported_activity_configuration');
      END IF;
      SELECT jsonb_agg(k.kind ORDER BY k.first) INTO v_kinds FROM (
        SELECT a.kind, min(v.ordinality * 10 + a.position) AS first
        FROM jsonb_array_elements_text(v_item -> 'value') WITH ORDINALITY AS v(value, ordinality)
        JOIN (VALUES ('changes', 'audit', 0), ('messages', 'message', 0), ('activities', 'activity', 0), ('activities', 'calendar_event', 1),
          ('audit', 'audit', 0), ('message', 'message', 0), ('activity', 'activity', 0), ('calendar_event', 'calendar_event', 0)) AS a(alias, kind, position)
          ON a.alias = v.value
        GROUP BY a.kind) AS k;
      v_filters := v_filters || jsonb_build_array(jsonb_build_object('kind', 'source', 'operator', v_operator, 'values', v_kinds));
    ELSIF v_field = 'provider' THEN
      IF (v_operator <> 'in' OR jsonb_array_length(v_item -> 'value') > 7 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_item -> 'value') AS v(value)
        WHERE v.value NOT IN ('google', 'outlook', 'mail', 'linkedin', 'whatsapp', 'instagram', 'telegram'))) IS NOT FALSE THEN
        PERFORM crm_upgrade.fail('unsupported_activity_configuration');
      END IF;
      v_filters := v_filters || jsonb_build_array(jsonb_build_object('kind', 'provider', 'operator', 'in', 'values', v_item -> 'value'));
    ELSIF v_field IN ('connectedAccountId', 'timelineThreadId') THEN
      IF (jsonb_array_length(v_item -> 'value') > 50 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_item -> 'value') AS v(value) WHERE NOT crm_upgrade.is_uuid(v.value))) IS NOT FALSE THEN
        PERFORM crm_upgrade.fail('unsupported_activity_configuration');
      END IF;
      v_filters := v_filters || jsonb_build_array(jsonb_build_object('kind', CASE WHEN v_field = 'connectedAccountId' THEN 'account' ELSE 'thread' END,
        'operator', v_operator, 'values', v_item -> 'value'));
    ELSE
      PERFORM crm_upgrade.fail('unsupported_activity_configuration');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('scope', '{"records":[],"typeIds":[]}'::jsonb, 'kinds', '["audit","message","activity","calendar_event"]'::jsonb, 'filters', v_filters);
END
$$;

-- convert() of v6/run.ts for one routine or webhook that subscribes to legacy record events.
-- Returns {"targetEvents": [...], "subscription": {...} | null, "enabled": <Webhook/Routine enabled after conversion>}.
-- Documented repair for webhooks only: an inactive creator stays the owner and the webhook is disabled;
-- an unprovable creator is replaced by the oldest active system-role member, or the webhook is disabled
-- without a subscription when no such member exists.
CREATE FUNCTION crm_upgrade.migrate_trigger(p_company_id text, p_source_table text, p_source_row jsonb, p_model jsonb, p_legacy_model jsonb, p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_event text;
  v_match text[];
  v_kinds text[] := ARRAY[]::text[];
  v_system_events text[] := ARRAY[]::text[];
  v_kind text;
  v_kind_events text[];
  v_sources jsonb := '[]';
  v_filters jsonb;
  v_changed jsonb;
  v_field text;
  v_mapped text;
  v_owner_id text;
  v_owner_active boolean;
  v_enabled boolean := (p_source_row ->> 'enabled')::boolean;
  v_events text[] := ARRAY(SELECT jsonb_array_elements_text(p_source_row -> 'events'));
  v_changed_fields text[] := ARRAY(SELECT jsonb_array_elements_text(p_source_row -> 'changed_fields'));
  v_row_id text := p_source_row ->> 'id';
  v_generic_events text[];
  v_target_events text[];
BEGIN
  FOREACH v_event IN ARRAY v_events LOOP
    v_match := regexp_match(v_event, '^(contact|organization|deal|service|task)\.(created|updated|deleted)$');
    IF v_match IS NULL THEN
      v_system_events := v_system_events || v_event;
    ELSIF NOT v_match[1] = ANY (v_kinds) THEN
      v_kinds := v_kinds || v_match[1];
    END IF;
  END LOOP;
  FOREACH v_kind IN ARRAY v_kinds LOOP
    SELECT array_agg(DISTINCT 'record.' || m[2] ORDER BY 'record.' || m[2]) INTO v_kind_events
      FROM unnest(v_events) AS e(event), regexp_match(e.event, '^(contact|organization|deal|service|task)\.(created|updated|deleted)$') AS m
      WHERE m[1] = v_kind;
    IF p_source_table = 'Routine' THEN
      v_filters := crm_upgrade.migrate_query_filter(p_company_id, v_kind,
        crm_upgrade.migrate_filters(p_company_id, v_kind, p_source_row -> 'trigger_filters', p_legacy_model, false, p_source_table, v_row_id), p_model, p_currency);
      v_changed := '[]';
      FOREACH v_field IN ARRAY v_changed_fields LOOP
        v_mapped := crm_upgrade.migrate_column_key(p_company_id, v_kind, v_field, p_legacy_model);
        IF (v_mapped IS NULL) IS NOT FALSE THEN PERFORM crm_upgrade.fail('unresolved_presentation_field'); END IF;
        v_changed := v_changed || to_jsonb(v_mapped);
      END LOOP;
      IF (EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_changed) AS c(id) WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_model -> 'fields') AS f(value)
        WHERE f.value ->> 'id' = c.id AND f.value ->> 'typeId' = crm_upgrade.preset_id(p_company_id, v_kind) AND NOT (f.value ->> 'archived')::boolean))) IS NOT FALSE THEN
        PERFORM crm_upgrade.fail('unresolved_trigger_field');
      END IF;
    ELSE
      v_filters := '{"filters":[],"relationships":[],"relatedFilters":[]}'::jsonb;
      v_changed := '[]';
    END IF;
    v_sources := v_sources || jsonb_build_array(jsonb_build_object('query', jsonb_build_object('typeId', crm_upgrade.preset_id(p_company_id, v_kind)) || v_filters,
      'changedFieldIds', v_changed, 'events', to_jsonb(v_kind_events)));
  END LOOP;
  IF p_source_table = 'Routine' THEN
    v_owner_id := p_source_row ->> 'owner_user_id';
    IF (v_owner_id IS NULL) IS NOT FALSE THEN PERFORM crm_upgrade.fail('unresolved_trigger_owner'); END IF;
    IF (NOT EXISTS (SELECT 1 FROM "User" u WHERE u."companyId" = p_company_id AND u.id = v_owner_id AND u.status::text = 'active')) IS NOT FALSE THEN
      PERFORM crm_upgrade.fail('inactive_trigger_owner');
    END IF;
  ELSE
    SELECT CASE WHEN count(*) = 1 THEN min(creator."userId") END INTO v_owner_id FROM (
      SELECT DISTINCT audit."userId" FROM "AuditLog" audit JOIN "User" owner ON owner.id = audit."userId" AND owner."companyId" = audit."companyId"
      WHERE audit."companyId" = p_company_id AND audit."entityId" = v_row_id AND audit.event = 'webhook.created') AS creator;
    IF v_owner_id IS NULL THEN
      PERFORM crm_upgrade.repair(p_company_id, 'Webhook', v_row_id, 'webhook_owner_unresolved');
      SELECT member.id INTO v_owner_id FROM "User" member JOIN "UserRole" role ON role."companyId" = p_company_id AND role.id = member."roleId"
        WHERE member."companyId" = p_company_id AND role."isSystemRole" AND member.status::text = 'active' ORDER BY member."createdAt", member.id LIMIT 1;
    END IF;
    v_owner_active := v_owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u."companyId" = p_company_id AND u.id = v_owner_id AND u.status::text = 'active');
    IF NOT v_owner_active THEN
      IF v_enabled THEN PERFORM crm_upgrade.repair(p_company_id, 'Webhook', v_row_id, 'webhook_disabled'); END IF;
      v_enabled := false;
    END IF;
  END IF;
  IF (v_owner_id IS NOT NULL AND NOT crm_upgrade.is_uuid(v_owner_id)) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_legacy_trigger'); END IF;
  SELECT array_agg(DISTINCT g ORDER BY g) INTO v_generic_events FROM jsonb_array_elements(v_sources) AS s(value), jsonb_array_elements_text(s.value -> 'events') AS g;
  SELECT array_agg(t.event ORDER BY t.first) INTO v_target_events FROM (
    SELECT e.event, min(e.ordinality) AS first FROM unnest(v_system_events || v_generic_events) WITH ORDINALITY AS e(event, ordinality) GROUP BY e.event) AS t;
  RETURN jsonb_build_object(
    'targetEvents', to_jsonb(v_target_events),
    'enabled', v_enabled,
    'subscription', CASE WHEN v_owner_id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('id', v_row_id, 'kind', lower(p_source_table), 'ownerUserId', v_owner_id,
      'events', to_jsonb(v_generic_events), 'sources', v_sources,
      'enabled', v_enabled AND (p_source_table <> 'Routine' OR p_source_row ->> 'trigger_kind' = 'event')) END);
END
$$;

-- migrateTimelineViewReferences (v8/timeline-views.ts) for one entity-timeline filter list.
CREATE FUNCTION crm_upgrade.migrate_timeline_filters(p_company_id text, p_filters jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_item jsonb;
BEGIN
  IF (jsonb_typeof(p_filters) <> 'array' OR jsonb_array_length(p_filters) > 20 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_filters) AS f(value)
    WHERE jsonb_typeof(f.value) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(f.value) AS k WHERE k NOT IN ('field', 'operator', 'value'))
      OR jsonb_typeof(f.value -> 'field') IS DISTINCT FROM 'string' OR jsonb_typeof(f.value -> 'operator') IS DISTINCT FROM 'string'
      OR f.value ->> 'operator' NOT IN ('in', 'notIn', 'hasSome', 'hasNone')
      OR (f.value ? 'value' AND (jsonb_typeof(f.value -> 'value') <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(f.value -> 'value') AS v(value) WHERE jsonb_typeof(v.value) <> 'string'))))) IS NOT FALSE THEN
    PERFORM crm_upgrade.fail('invalid_timeline_view');
  END IF;
  PERFORM crm_upgrade.migrate_activity_query(p_company_id, COALESCE((SELECT jsonb_agg(f.value ORDER BY f.ordinality)
    FROM jsonb_array_elements(p_filters) WITH ORDINALITY AS f(value, ordinality) WHERE f.value ->> 'field' NOT LIKE 'records:%'), '[]'::jsonb));
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_filters) AS f(value) WHERE f.value ->> 'field' LIKE 'records:%' LOOP
    IF (NOT crm_upgrade.is_uuid(substr(v_item ->> 'field', 9))
      OR (v_item ->> 'operator' IN ('in', 'notIn')) <> (jsonb_array_length(COALESCE(v_item -> 'value', '[]')) > 0)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_item -> 'value', '[]')) AS v(value) WHERE NOT crm_upgrade.is_uuid(v.value))) IS NOT FALSE THEN
      PERFORM crm_upgrade.fail('invalid_timeline_view');
    END IF;
  END LOOP;
  -- An empty list stays an empty list (the retired upgrade rewrote it unchanged).
  RETURN COALESCE((SELECT jsonb_agg(CASE f.value ->> 'field'
      WHEN 'contactIds' THEN f.value || jsonb_build_object('field', 'records:' || crm_upgrade.preset_id(p_company_id, 'contact'))
      WHEN 'organizationIds' THEN f.value || jsonb_build_object('field', 'records:' || crm_upgrade.preset_id(p_company_id, 'organization'))
      WHEN 'dealIds' THEN f.value || jsonb_build_object('field', 'records:' || crm_upgrade.preset_id(p_company_id, 'deal'))
      WHEN 'serviceIds' THEN f.value || jsonb_build_object('field', 'records:' || crm_upgrade.preset_id(p_company_id, 'service'))
      WHEN 'taskIds' THEN f.value || jsonb_build_object('field', 'records:' || crm_upgrade.preset_id(p_company_id, 'task'))
      ELSE f.value END ORDER BY f.ordinality)
    FROM jsonb_array_elements(p_filters) WITH ORDINALITY AS f(value, ordinality)), '[]'::jsonb);
END
$$;

-- =============================================================================================
-- Section 1: VALIDATION and staging. Nothing is written to persistent tables here. Every check of the
-- retired preflight (v2 records and identities, v4 activity widgets, v5 presentation, v6 triggers, v8
-- timeline views and terminology) runs for every workspace; all refusals are collected and reported
-- together as "table.field code xCOUNT". Converted values are staged for sections 3-5.
-- =============================================================================================

CREATE TEMP TABLE crm_upgrade_workspace (
  company_id text PRIMARY KEY,
  currency text NOT NULL,
  actor_id text NOT NULL,
  model jsonb,
  presentation_model jsonb
) ON COMMIT DROP;
CREATE TEMP TABLE crm_upgrade_value (
  company_id text NOT NULL, value_id text NOT NULL, type_id text NOT NULL, record_id text, field_id text NOT NULL,
  scalar jsonb, code text, created_at timestamp(3) NOT NULL, updated_at timestamp(3) NOT NULL, raw text, repaired boolean NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE crm_upgrade_presentation (
  company_id text NOT NULL, source_table text NOT NULL, row_id text NOT NULL, user_id text, original jsonb NOT NULL, target jsonb NOT NULL, scopes jsonb NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE crm_upgrade_trigger (
  company_id text NOT NULL, source_table text NOT NULL, row_id text NOT NULL, result jsonb NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE crm_upgrade_timeline (
  source_table text NOT NULL, row_id text NOT NULL, filters jsonb NOT NULL
) ON COMMIT DROP;

-- legacyFieldScalar (v2/legacy-model.ts) for one CustomFieldValue. Returns {"scalar": ...} (scalar NULL
-- for a missing value), {"code": ...} for a refusal, and "repaired": true for the documented link repair:
-- a single-valued (or per comma segment, multi-valued) url value without scheme that matches
-- ^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$ (case-insensitive, after trimming spaces) becomes "https://" || that text.
CREATE FUNCTION crm_upgrade.legacy_field_scalar(p_raw text, p_field jsonb, p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_value_type text := p_field ->> 'valueType';
  v_multiple boolean := COALESCE((p_field ->> 'multiple')::boolean, false);
  v_scalar jsonb;
  v_parts text[];
  v_segment text;
  v_repaired boolean := false;
  v_number numeric;
BEGIN
  IF p_raw IS NULL THEN RETURN jsonb_build_object('scalar', NULL, 'repaired', false); END IF;
  IF v_multiple THEN
    v_parts := crm_upgrade.js_split(p_raw, ',');
    IF v_value_type = 'url' THEN
      FOR v_index IN 1..array_length(v_parts, 1) LOOP
        v_segment := v_parts[v_index];
        IF NOT crm_upgrade.is_http_url(v_segment) AND btrim(v_segment) ~* '^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$' THEN
          v_parts[v_index] := 'https://' || btrim(v_segment);
          v_repaired := true;
        END IF;
      END LOOP;
    END IF;
    v_scalar := jsonb_build_object('kind', 'textList', 'value', to_jsonb(v_parts));
  ELSIF v_value_type = 'currency' THEN
    IF p_raw !~ '^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$' THEN RETURN '{"code":"invalid_decimal_lexeme"}'::jsonb; END IF;
    BEGIN
      v_number := p_raw::numeric;
    EXCEPTION WHEN numeric_value_out_of_range OR program_limit_exceeded THEN
      RETURN '{"code":"invalid_typed_value"}'::jsonb;
    END;
    IF NOT crm_upgrade.is_representable(v_number) THEN RETURN '{"code":"invalid_typed_value"}'::jsonb; END IF;
    v_scalar := crm_upgrade.scalar_decimal(crm_upgrade.decimal_text(v_number), COALESCE(p_field #>> '{format,currency}', p_currency));
  ELSIF v_value_type IN ('date', 'dateTime') THEN
    v_scalar := jsonb_build_object('kind', v_value_type, 'value', p_raw);
  ELSIF v_value_type IN ('dateRange', 'dateTimeRange') THEN
    v_parts := crm_upgrade.js_split(p_raw, ',');
    IF array_length(v_parts, 1) <> 2 THEN RETURN '{"code":"invalid_range_lexeme"}'::jsonb; END IF;
    v_scalar := jsonb_build_object('kind', 'range', 'start', v_parts[1], 'end', v_parts[2]);
  ELSIF v_value_type = 'select' THEN
    v_scalar := jsonb_build_object('kind', 'select', 'value', p_raw);
  ELSE
    IF v_value_type = 'url' AND NOT crm_upgrade.is_http_url(p_raw) AND btrim(p_raw) ~* '^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$' THEN
      p_raw := 'https://' || btrim(p_raw);
      v_repaired := true;
    END IF;
    v_scalar := crm_upgrade.scalar_text(p_raw);
  END IF;
  IF NOT crm_upgrade.scalar_valid(v_scalar) OR NOT crm_upgrade.scalar_matches_type(v_scalar, v_value_type, v_multiple, true) THEN
    RETURN '{"code":"invalid_typed_value"}'::jsonb;
  END IF;
  IF v_scalar ->> 'kind' = 'select' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_field -> 'options') AS o(value) WHERE o.value ->> 'id' = p_raw) THEN
    RETURN '{"code":"missing_select_option"}'::jsonb;
  END IF;
  RETURN jsonb_build_object('scalar', v_scalar, 'repaired', v_repaired);
END
$$;

-- Re-raises an unexpected error of a conversion step as an internal failure. Only validated data refusals
-- (SQLSTATE CRM01) become issue codes; anything else is a defect of the upgrade and must not be reported as a
-- data problem. The message keeps the SQLSTATE, the error text and the PL/pgSQL call chain; error texts of
-- data exceptions (class 22) are omitted because they can quote a value, and the DETAIL is never included.
CREATE FUNCTION crm_upgrade.raise_internal(p_step text, p_state text, p_message text, p_context text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Configurable record upgrade internal error in % (SQLSTATE %): %', p_step, p_state,
    CASE WHEN left(p_state, 2) = '22' THEN 'data exception' ELSE p_message END
    USING ERRCODE = 'CRM02', HINT = 'Nothing was changed. This is not a problem of the legacy data; report it with this message.',
      DETAIL = 'Context: ' || COALESCE(regexp_replace(p_context, '\s+', ' ', 'g'), '');
END
$$;

-- Runs one conversion step; a validated refusal (CRM01) becomes an issue of the owning table.
CREATE FUNCTION crm_upgrade.try_presentation(p_company_id text, p_source_table text, p_code_override text, p_statement text, VARIADIC p_arguments jsonb[]) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_result jsonb;
BEGIN
  EXECUTE p_statement INTO v_result USING p_arguments;
  RETURN v_result;
EXCEPTION
  WHEN SQLSTATE 'CRM01' THEN
    PERFORM crm_upgrade.issue(p_company_id, p_source_table, 'configuration', COALESCE(p_code_override, SQLERRM));
    RETURN NULL;
  WHEN OTHERS THEN
    DECLARE
      v_state text;
      v_message text;
      v_context text;
    BEGIN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT, v_context = PG_EXCEPTION_CONTEXT;
      PERFORM crm_upgrade.raise_internal(p_source_table || ' conversion', v_state, v_message, v_context);
      RETURN NULL;
    END;
END
$$;

-- v4 DisplayOptions: strict {showFilters?: boolean}; stored as {showFilters: value ?? true}.
CREATE FUNCTION crm_upgrade.activity_display_options(p_options jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
BEGIN
  IF p_options IS NULL OR p_options = 'null'::jsonb THEN p_options := '{}'; END IF;
  IF (jsonb_typeof(p_options) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_options) AS k WHERE k <> 'showFilters')
    OR (p_options ? 'showFilters' AND jsonb_typeof(p_options -> 'showFilters') <> 'boolean')) IS NOT FALSE THEN
    PERFORM crm_upgrade.fail('unsupported_activity_configuration');
  END IF;
  RETURN jsonb_build_object('showFilters', COALESCE(p_options -> 'showFilters', 'true'::jsonb));
END
$$;

-- v5 chart widget: the generic measure, the validated display options and the reference scopes.
CREATE FUNCTION crm_upgrade.migrate_chart_widget(p_company_id text, p_source_row jsonb, p_model jsonb, p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_measure jsonb := crm_upgrade.migrate_chart_measure(p_company_id, p_source_row, p_model, p_currency);
  v_display jsonb := CASE WHEN p_source_row -> 'displayOptions' IS NULL OR p_source_row -> 'displayOptions' = 'null'::jsonb THEN '{"displayType":"verticalBarChart"}'::jsonb ELSE p_source_row -> 'displayOptions' END;
  v_scopes jsonb := jsonb_build_array(v_measure -> 'source');
BEGIN
  IF (NOT crm_upgrade.widget_display_valid(v_display)) IS NOT FALSE THEN PERFORM crm_upgrade.fail('invalid_presentation_configuration'); END IF;
  IF v_measure #> '{groupBy,filter}' IS NOT NULL THEN
    v_scopes := v_scopes || jsonb_build_array((v_measure #> '{groupBy,filter}') || jsonb_build_object('typeId',
      COALESCE(crm_upgrade.resolve_path(v_measure #>> '{source,typeId}', v_measure #> '{groupBy,path}', p_model), v_measure #>> '{source,typeId}')));
  END IF;
  RETURN jsonb_build_object('measure', v_measure, 'displayOptions', v_display, 'scopes', v_scopes);
END
$$;

DO $validate$
DECLARE
  v_workspace record;
  v_ws_id text;
  v_ws_currency text;
  v_ws_model jsonb;
  v_ws_presentation jsonb;
  v_row_data jsonb;
  v_ws_kind text;
  v_converted jsonb;
  v_trigger_row record;
  v_timeline record;
  v_terminology record;
  v_catalog jsonb := '{"de": {"contact": {"client": {"plural": "Kunden", "singular": "Kunde"}, "contact": {"plural": "Kontakte", "singular": "Kontakt"}, "lead": {"plural": "Leads", "singular": "Lead"}, "person": {"plural": "Personen", "singular": "Person"}}, "deal": {"deal": {"plural": "Deals", "singular": "Deal"}, "job": {"plural": "Aufträge", "singular": "Auftrag"}, "opportunity": {"plural": "Chancen", "singular": "Chance"}, "project": {"plural": "Projekte", "singular": "Projekt"}}, "organization": {"account": {"plural": "Accounts", "singular": "Account"}, "company": {"plural": "Unternehmen", "singular": "Unternehmen"}, "organization": {"plural": "Organisationen", "singular": "Organisation"}}, "service": {"offering": {"plural": "Leistungen", "singular": "Leistung"}, "package": {"plural": "Pakete", "singular": "Paket"}, "product": {"plural": "Produkte", "singular": "Produkt"}, "service": {"plural": "Services", "singular": "Service"}}, "task": {"actionItem": {"plural": "Action Items", "singular": "Action Item"}, "followUp": {"plural": "Follow-ups", "singular": "Follow-up"}, "task": {"plural": "Aufgaben", "singular": "Aufgabe"}, "todo": {"plural": "To-dos", "singular": "To-do"}}}, "en": {"contact": {"client": {"plural": "Clients", "singular": "Client"}, "contact": {"plural": "Contacts", "singular": "Contact"}, "lead": {"plural": "Leads", "singular": "Lead"}, "person": {"plural": "People", "singular": "Person"}}, "deal": {"deal": {"plural": "Deals", "singular": "Deal"}, "job": {"plural": "Jobs", "singular": "Job"}, "opportunity": {"plural": "Opportunities", "singular": "Opportunity"}, "project": {"plural": "Projects", "singular": "Project"}}, "organization": {"account": {"plural": "Accounts", "singular": "Account"}, "company": {"plural": "Companies", "singular": "Company"}, "organization": {"plural": "Organizations", "singular": "Organization"}}, "service": {"offering": {"plural": "Offerings", "singular": "Offering"}, "package": {"plural": "Packages", "singular": "Package"}, "product": {"plural": "Products", "singular": "Product"}, "service": {"plural": "Services", "singular": "Service"}}, "task": {"actionItem": {"plural": "Action items", "singular": "Action item"}, "followUp": {"plural": "Follow-ups", "singular": "Follow-up"}, "task": {"plural": "Tasks", "singular": "Task"}, "todo": {"plural": "To-dos", "singular": "To-do"}}}, "es": {"contact": {"client": {"plural": "Clientes", "singular": "Cliente"}, "contact": {"plural": "Contactos", "singular": "Contacto"}, "lead": {"plural": "Leads", "singular": "Lead"}, "person": {"plural": "Personas", "singular": "Persona"}}, "deal": {"deal": {"plural": "Oportunidades", "singular": "Oportunidad"}, "job": {"plural": "Trabajos", "singular": "Trabajo"}, "opportunity": {"plural": "Oportunidades comerciales", "singular": "Oportunidad comercial"}, "project": {"plural": "Proyectos", "singular": "Proyecto"}}, "organization": {"account": {"plural": "Cuentas", "singular": "Cuenta"}, "company": {"plural": "Empresas", "singular": "Empresa"}, "organization": {"plural": "Organizaciones", "singular": "Organización"}}, "service": {"offering": {"plural": "Ofertas", "singular": "Oferta"}, "package": {"plural": "Paquetes", "singular": "Paquete"}, "product": {"plural": "Productos", "singular": "Producto"}, "service": {"plural": "Servicios", "singular": "Servicio"}}, "task": {"actionItem": {"plural": "Acciones", "singular": "Acción"}, "followUp": {"plural": "Seguimientos", "singular": "Seguimiento"}, "task": {"plural": "Tareas", "singular": "Tarea"}, "todo": {"plural": "Pendientes", "singular": "Pendiente"}}}, "fr": {"contact": {"client": {"plural": "Clients", "singular": "Client"}, "contact": {"plural": "Contacts", "singular": "Contact"}, "lead": {"plural": "Prospects", "singular": "Prospect"}, "person": {"plural": "Personnes", "singular": "Personne"}}, "deal": {"deal": {"plural": "Affaires", "singular": "Affaire"}, "job": {"plural": "Missions", "singular": "Mission"}, "opportunity": {"plural": "Opportunités", "singular": "Opportunité"}, "project": {"plural": "Projets", "singular": "Projet"}}, "organization": {"account": {"plural": "Comptes", "singular": "Compte"}, "company": {"plural": "Entreprises", "singular": "Entreprise"}, "organization": {"plural": "Organisations", "singular": "Organisation"}}, "service": {"offering": {"plural": "Offres", "singular": "Offre"}, "package": {"plural": "Forfaits", "singular": "Forfait"}, "product": {"plural": "Produits", "singular": "Produit"}, "service": {"plural": "Services", "singular": "Service"}}, "task": {"actionItem": {"plural": "Actions", "singular": "Action"}, "followUp": {"plural": "Relances", "singular": "Relance"}, "task": {"plural": "Tâches", "singular": "Tâche"}, "todo": {"plural": "À faire", "singular": "Élément à faire"}}}, "it": {"contact": {"client": {"plural": "Clienti", "singular": "Cliente"}, "contact": {"plural": "Contatti", "singular": "Contatto"}, "lead": {"plural": "Lead", "singular": "Lead"}, "person": {"plural": "Persone", "singular": "Persona"}}, "deal": {"deal": {"plural": "Trattative", "singular": "Trattativa"}, "job": {"plural": "Lavori", "singular": "Lavoro"}, "opportunity": {"plural": "Opportunità", "singular": "Opportunità"}, "project": {"plural": "Progetti", "singular": "Progetto"}}, "organization": {"account": {"plural": "Account", "singular": "Account"}, "company": {"plural": "Aziende", "singular": "Azienda"}, "organization": {"plural": "Organizzazioni", "singular": "Organizzazione"}}, "service": {"offering": {"plural": "Offerte", "singular": "Offerta"}, "package": {"plural": "Pacchetti", "singular": "Pacchetto"}, "product": {"plural": "Prodotti", "singular": "Prodotto"}, "service": {"plural": "Servizi", "singular": "Servizio"}}, "task": {"actionItem": {"plural": "Azioni", "singular": "Azione"}, "followUp": {"plural": "Follow-up", "singular": "Follow-up"}, "task": {"plural": "Attività", "singular": "Attività"}, "todo": {"plural": "Cose da fare", "singular": "Cosa da fare"}}}}'::jsonb;
  v_locale text;
  v_state text;
  v_message text;
  v_context text;
BEGIN
  FOR v_workspace IN SELECT id, currency::text AS currency FROM "Company" ORDER BY id LOOP
    v_ws_id := v_workspace.id;
    v_ws_currency := upper(v_workspace.currency);
    v_ws_model := crm_upgrade.legacy_model(v_ws_id);
    v_ws_presentation := crm_upgrade.presentation_model(v_ws_id, v_ws_model);
    PERFORM crm_upgrade.presentation_model_issues(v_ws_id, v_ws_presentation);
    INSERT INTO crm_upgrade_workspace (company_id, currency, actor_id, model, presentation_model)
    SELECT v_ws_id, v_ws_currency, COALESCE((
      SELECT member.id FROM "User" member JOIN "UserRole" role ON role."companyId" = v_ws_id AND role.id = member."roleId"
      WHERE member."companyId" = v_ws_id AND role."isSystemRole" AND member.status = 'active' ORDER BY member.id LIMIT 1
    ), 'system:record-migration:v2'), v_ws_model, v_ws_presentation;

    -- v2 preflight: source prices and line quantities must be exact, representable decimals.
    PERFORM crm_upgrade.issue(v_ws_id, 'Service', 'amount', 'unrepresentable_decimal')
      FROM "Service" WHERE "companyId" = v_ws_id AND NOT crm_upgrade.is_representable(amount::text::numeric);
    PERFORM crm_upgrade.issue(v_ws_id, 'ServiceDeal', 'quantity', 'unrepresentable_decimal')
      FROM "ServiceDeal" WHERE "companyId" = v_ws_id AND NOT crm_upgrade.is_representable(quantity::text::numeric);

    -- v2 preflight: every link, line item and assignment must join records (and members) of the same workspace.
    PERFORM crm_upgrade.issue(v_ws_id, link.source_table, 'endpoints', 'cross_workspace_reference') FROM (
      SELECT 'ContactOrganization' AS source_table FROM "ContactOrganization" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Contact" s WHERE s.id = l."contactId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "Organization" t WHERE t.id = l."organizationId" AND t."companyId" = v_ws_id))
      UNION ALL SELECT 'DealContact' FROM "DealContact" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Deal" s WHERE s.id = l."dealId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "Contact" t WHERE t.id = l."contactId" AND t."companyId" = v_ws_id))
      UNION ALL SELECT 'DealOrganization' FROM "DealOrganization" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Deal" s WHERE s.id = l."dealId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "Organization" t WHERE t.id = l."organizationId" AND t."companyId" = v_ws_id))
      UNION ALL SELECT 'TaskContact' FROM "TaskContact" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Task" s WHERE s.id = l."taskId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "Contact" t WHERE t.id = l."contactId" AND t."companyId" = v_ws_id))
      UNION ALL SELECT 'TaskOrganization' FROM "TaskOrganization" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Task" s WHERE s.id = l."taskId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "Organization" t WHERE t.id = l."organizationId" AND t."companyId" = v_ws_id))
      UNION ALL SELECT 'TaskDeal' FROM "TaskDeal" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Task" s WHERE s.id = l."taskId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "Deal" t WHERE t.id = l."dealId" AND t."companyId" = v_ws_id))
      UNION ALL SELECT 'TaskService' FROM "TaskService" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Task" s WHERE s.id = l."taskId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "Service" t WHERE t.id = l."serviceId" AND t."companyId" = v_ws_id))
      UNION ALL SELECT 'ServiceDeal' FROM "ServiceDeal" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Service" s WHERE s.id = l."serviceId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "Deal" t WHERE t.id = l."dealId" AND t."companyId" = v_ws_id))
      UNION ALL SELECT 'ContactUser' FROM "ContactUser" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Contact" s WHERE s.id = l."contactId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = l."userId" AND u."companyId" = v_ws_id))
      UNION ALL SELECT 'OrganizationUser' FROM "OrganizationUser" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Organization" s WHERE s.id = l."organizationId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = l."userId" AND u."companyId" = v_ws_id))
      UNION ALL SELECT 'DealUser' FROM "DealUser" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Deal" s WHERE s.id = l."dealId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = l."userId" AND u."companyId" = v_ws_id))
      UNION ALL SELECT 'ServiceUser' FROM "ServiceUser" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Service" s WHERE s.id = l."serviceId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = l."userId" AND u."companyId" = v_ws_id))
      UNION ALL SELECT 'TaskUser' FROM "TaskUser" l WHERE l."companyId" = v_ws_id
        AND (NOT EXISTS (SELECT 1 FROM "Task" s WHERE s.id = l."taskId" AND s."companyId" = v_ws_id) OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = l."userId" AND u."companyId" = v_ws_id))
    ) AS link;

    -- Record grants are keyed by the workspace role; a permission row naming another workspace's role
    -- cannot become a grant (the retired upgrade failed on the foreign key instead).
    PERFORM crm_upgrade.issue(v_ws_id, 'RolePermission', 'roleId', 'cross_workspace_reference')
      FROM "RolePermission" p WHERE p."companyId" = v_ws_id AND p.resource::text IN ('contacts', 'organizations', 'deals', 'services', 'tasks')
        AND NOT EXISTS (SELECT 1 FROM "UserRole" r WHERE r.id = p."roleId" AND r."companyId" = v_ws_id);

    -- v2 preflight: custom values must belong to a known column of the same type, reference exactly one
    -- record of that type in the same workspace, and convert to a typed value.
    INSERT INTO crm_upgrade_value (company_id, value_id, type_id, record_id, field_id, scalar, code, created_at, updated_at, raw, repaired)
    SELECT v_ws_id, v.id, field.value ->> 'typeId', COALESCE(v."contactId", v."organizationId", v."dealId", v."serviceId", v."taskId"), v."columnId",
      NULLIF(staged_scalar.result -> 'scalar', 'null'::jsonb), staged_scalar.result ->> 'code', v."createdAt", v."updatedAt", v.value, COALESCE((staged_scalar.result ->> 'repaired')::boolean, false)
    FROM "CustomFieldValue" v
    JOIN "CustomColumn" c ON c.id = v."columnId" AND c."companyId" = v_ws_id AND c.type = v.type AND c."entityType" = v."entityType"
    JOIN LATERAL (SELECT f.value FROM jsonb_array_elements(v_ws_model -> 'fields') AS f(value) WHERE f.value ->> 'id' = v."columnId" LIMIT 1) AS field ON true
    CROSS JOIN LATERAL (SELECT crm_upgrade.legacy_field_scalar(v.value, field.value, v_ws_currency) AS result) AS staged_scalar
    WHERE v."companyId" = v_ws_id;
    PERFORM crm_upgrade.issue(v_ws_id, 'CustomFieldValue', problem.field, problem.code) FROM (
      SELECT 'columnId' AS field, 'field_definition_mismatch' AS code FROM "CustomFieldValue" v
        WHERE v."companyId" = v_ws_id AND NOT EXISTS (SELECT 1 FROM crm_upgrade_value s WHERE s.company_id = v_ws_id AND s.value_id = v.id)
      UNION ALL
      SELECT 'record', 'invalid_record_reference' FROM "CustomFieldValue" v JOIN crm_upgrade_value s ON s.company_id = v_ws_id AND s.value_id = v.id
        WHERE v."companyId" = v_ws_id
          AND (num_nonnulls(v."contactId", v."organizationId", v."dealId", v."serviceId", v."taskId") <> 1
            OR (CASE v."entityType"::text WHEN 'contact' THEN v."contactId" WHEN 'organization' THEN v."organizationId" WHEN 'deal' THEN v."dealId" WHEN 'service' THEN v."serviceId" ELSE v."taskId" END) IS NULL)
      UNION ALL
      SELECT 'record', 'cross_workspace_reference' FROM "CustomFieldValue" v JOIN crm_upgrade_value s ON s.company_id = v_ws_id AND s.value_id = v.id
        WHERE v."companyId" = v_ws_id
          AND NOT CASE v."entityType"::text
            WHEN 'contact' THEN EXISTS (SELECT 1 FROM "Contact" r WHERE r."companyId" = v_ws_id AND r.id = v."contactId")
            WHEN 'organization' THEN EXISTS (SELECT 1 FROM "Organization" r WHERE r."companyId" = v_ws_id AND r.id = v."organizationId")
            WHEN 'deal' THEN EXISTS (SELECT 1 FROM "Deal" r WHERE r."companyId" = v_ws_id AND r.id = v."dealId")
            WHEN 'service' THEN EXISTS (SELECT 1 FROM "Service" r WHERE r."companyId" = v_ws_id AND r.id = v."serviceId")
            ELSE EXISTS (SELECT 1 FROM "Task" r WHERE r."companyId" = v_ws_id AND r.id = v."taskId") END
      UNION ALL
      SELECT 'value', s.code FROM crm_upgrade_value s WHERE s.company_id = v_ws_id AND s.code IS NOT NULL
      UNION ALL
      SELECT 'value', 'duplicate_field_value' FROM "CustomFieldValue" v WHERE v."companyId" = v_ws_id
        GROUP BY v."columnId", COALESCE(v."contactId", v."organizationId", v."dealId", v."serviceId", v."taskId") HAVING count(*) > 1
    ) AS problem;

    -- v2 preflight: a pending membership authorisation task must name a member of the workspace.
    PERFORM crm_upgrade.issue(v_ws_id, 'Task', 'relatedUserId', 'invalid_protected_task_owner')
      FROM "Task" t WHERE t."companyId" = v_ws_id AND t.type = 'userPendingAuthorization'
        AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t."relatedUserId" AND u."companyId" = v_ws_id);

    -- v2 identity preflight: canonical, well-formed channel identities with unique lookup keys.
    PERFORM crm_upgrade.issue(v_ws_id, 'ContactIdentifier', problem.field, problem.code) FROM (
      SELECT 'contactId' AS field, 'cross_workspace_reference' AS code FROM "ContactIdentifier" i
        WHERE i."companyId" = v_ws_id AND NOT EXISTS (SELECT 1 FROM "Contact" c WHERE c."companyId" = v_ws_id AND c.id = i."contactId")
      UNION ALL
      SELECT 'channelClass', 'invalid_identity_class' FROM "ContactIdentifier" i WHERE i."companyId" = v_ws_id
        AND i."channelClass" IS DISTINCT FROM CASE WHEN i.provider::text IN ('mail', 'google', 'outlook') THEN 'email' WHEN i.provider::text = 'whatsapp' THEN 'phone' ELSE i.provider::text END
      UNION ALL
      SELECT 'value', CASE WHEN crm_upgrade.canonical_channel(i.provider::text, i.value) IS NULL THEN 'invalid_identity_value' ELSE 'noncanonical_identity_value' END
        FROM "ContactIdentifier" i WHERE i."companyId" = v_ws_id AND crm_upgrade.canonical_channel(i.provider::text, i.value) IS DISTINCT FROM i.value
      UNION ALL
      SELECT 'messagingId', 'invalid_identity_value' FROM "ContactIdentifier" i WHERE i."companyId" = v_ws_id AND i."messagingId" IS NOT NULL
        AND (crm_upgrade.js_trim(i."messagingId") = '' OR i."messagingId" <> crm_upgrade.js_trim(i."messagingId") OR crm_upgrade.js_len(i."messagingId") > 2000)
      UNION ALL
      SELECT 'displayName', 'identity_value_too_long' FROM "ContactIdentifier" i WHERE i."companyId" = v_ws_id AND crm_upgrade.js_len(i."displayName") > 500
      UNION ALL
      SELECT 'profileUrl', 'invalid_identity_url' FROM "ContactIdentifier" i WHERE i."companyId" = v_ws_id AND i."profileUrl" IS NOT NULL
        AND NOT crm_upgrade.is_zod_http_url(i."profileUrl")
      UNION ALL
      SELECT DISTINCT ON (source.id) 'value', 'duplicate_identity_key' FROM (
        SELECT DISTINCT i.id, i."channelClass", key.value FROM "ContactIdentifier" i, unnest(ARRAY[i.value, i."messagingId"]) AS key(value) WHERE i."companyId" = v_ws_id
      ) AS source JOIN (
        SELECT k."channelClass", k.value FROM (
          SELECT DISTINCT i.id, i."channelClass", key.value FROM "ContactIdentifier" i, unnest(ARRAY[i.value, i."messagingId"]) AS key(value) WHERE i."companyId" = v_ws_id
        ) AS k WHERE k.value IS NOT NULL GROUP BY k."channelClass", k.value HAVING count(*) > 1
      ) AS duplicate ON duplicate."channelClass" = source."channelClass" AND duplicate.value = source.value
    ) AS problem;

    -- A model that fails validation cannot drive the presentation conversion; its issues are reported already.
    IF EXISTS (SELECT 1 FROM crm_upgrade_issue i WHERE i.company_id = v_ws_id AND i.source_table IN ('CustomColumn', 'Company')) THEN
      CONTINUE;
    END IF;

    -- v4: activity timeline widgets become generic activity queries; referenced records must exist (or
    -- have audit history), referenced accounts and threads must exist.
    FOR v_row_data IN SELECT to_jsonb(w) FROM "Widget" w WHERE w."companyId" = v_ws_id AND w.kind = 'activityTimeline' ORDER BY w.id LOOP
      v_converted := crm_upgrade.try_presentation(v_ws_id, 'Widget', 'unsupported_activity_configuration',
        'SELECT jsonb_build_object(''activityQuery'', crm_upgrade.migrate_activity_query($1[1] #>> ''{}'', $1[2]),
           ''displayOptions'', crm_upgrade.activity_display_options($1[3]))',
        to_jsonb(v_ws_id), v_row_data -> 'timelineFilters', v_row_data -> 'displayOptions');
      IF v_converted IS NULL THEN CONTINUE; END IF;
      PERFORM crm_upgrade.issue(v_ws_id, 'Widget', 'activityQuery', 'unresolved_activity_reference')
        FROM jsonb_array_elements(v_converted #> '{activityQuery,filters}') AS f(value), jsonb_array_elements_text(COALESCE(f.value -> 'recordIds', f.value -> 'values')) AS wanted(id)
        WHERE (f.value ->> 'kind' = 'record' AND NOT EXISTS (
            SELECT 1 FROM unnest(ARRAY['contact', 'organization', 'deal', 'service', 'task']) AS k(kind)
            WHERE crm_upgrade.preset_id(v_ws_id, k.kind) = f.value ->> 'typeId' AND (
              CASE k.kind
                WHEN 'contact' THEN EXISTS (SELECT 1 FROM "Contact" r WHERE r."companyId" = v_ws_id AND r.id = wanted.id)
                WHEN 'organization' THEN EXISTS (SELECT 1 FROM "Organization" r WHERE r."companyId" = v_ws_id AND r.id = wanted.id)
                WHEN 'deal' THEN EXISTS (SELECT 1 FROM "Deal" r WHERE r."companyId" = v_ws_id AND r.id = wanted.id)
                WHEN 'service' THEN EXISTS (SELECT 1 FROM "Service" r WHERE r."companyId" = v_ws_id AND r.id = wanted.id)
                ELSE EXISTS (SELECT 1 FROM "Task" r WHERE r."companyId" = v_ws_id AND r.id = wanted.id) END
              OR EXISTS (SELECT 1 FROM "AuditLog" history WHERE history."companyId" = v_ws_id AND history."entityId" = wanted.id
                AND history.event IN (k.kind || '.created', k.kind || '.updated', k.kind || '.deleted')))))
          OR (f.value ->> 'kind' = 'account' AND NOT EXISTS (SELECT 1 FROM "ConnectedAccount" a WHERE a."companyId" = v_ws_id AND a.id = wanted.id))
          OR (f.value ->> 'kind' = 'thread' AND NOT EXISTS (SELECT 1 FROM "MessagingThread" t WHERE t."companyId" = v_ws_id AND t.id = wanted.id));
      INSERT INTO crm_upgrade_presentation (company_id, source_table, row_id, user_id, original, target, scopes)
      VALUES (v_ws_id, 'Widget', v_row_data ->> 'id', v_row_data ->> 'userId', v_row_data, v_row_data || v_converted, '[]');
    END LOOP;

    -- v5: list views (DataView), list and detail personalisation (P13n) and chart widgets.
    FOREACH v_ws_kind IN ARRAY ARRAY['contact', 'organization', 'deal', 'service', 'task'] LOOP
      FOR v_row_data IN SELECT to_jsonb(v) FROM "DataView" v WHERE v."companyId" = v_ws_id AND v."surfaceKey" = v_ws_kind || 's-card-store' ORDER BY v.id LOOP
        v_converted := crm_upgrade.try_presentation(v_ws_id, 'DataView', NULL,
          'SELECT crm_upgrade.migrate_presentation_state($1[1] #>> ''{}'', $1[2] #>> ''{}'', $1[3], $1[4], false, $1[5] #>> ''{}'', ''DataView'')',
          to_jsonb(v_ws_id), to_jsonb(v_ws_kind), v_row_data, v_ws_presentation, to_jsonb(v_ws_currency));
        IF v_converted IS NOT NULL THEN
          INSERT INTO crm_upgrade_presentation (company_id, source_table, row_id, user_id, original, target, scopes)
          VALUES (v_ws_id, 'DataView', v_row_data ->> 'id', v_row_data ->> 'userId', v_row_data,
            (v_converted -> 'output') || jsonb_build_object('surfaceKey', 'records:' || crm_upgrade.preset_id(v_ws_id, v_ws_kind)), jsonb_build_array(v_converted -> 'query'));
        END IF;
      END LOOP;
      FOR v_row_data IN SELECT to_jsonb(p) FROM "P13n" p WHERE p."companyId" = v_ws_id AND p."p13nId" = v_ws_kind || 's-card-store' ORDER BY p.id LOOP
        v_converted := crm_upgrade.try_presentation(v_ws_id, 'P13n', NULL,
          'SELECT crm_upgrade.migrate_presentation_state($1[1] #>> ''{}'', $1[2] #>> ''{}'', $1[3], $1[4], true, $1[5] #>> ''{}'', ''P13n'')',
          to_jsonb(v_ws_id), to_jsonb(v_ws_kind), v_row_data || '{"viewStateKeys":null}'::jsonb, v_ws_presentation, to_jsonb(v_ws_currency));
        IF v_converted IS NOT NULL THEN
          INSERT INTO crm_upgrade_presentation (company_id, source_table, row_id, user_id, original, target, scopes)
          VALUES (v_ws_id, 'P13n', v_row_data ->> 'id', v_row_data ->> 'userId', v_row_data,
            (v_converted -> 'output') || jsonb_build_object('p13nId', 'records:' || crm_upgrade.preset_id(v_ws_id, v_ws_kind)), jsonb_build_array(v_converted -> 'query'));
        END IF;
      END LOOP;
      FOR v_row_data IN SELECT to_jsonb(p) FROM "P13n" p WHERE p."companyId" = v_ws_id AND p."p13nId" = v_ws_kind || '-detail' ORDER BY p.id LOOP
        v_converted := crm_upgrade.try_presentation(v_ws_id, 'P13n', NULL,
          'SELECT crm_upgrade.migrate_detail_state($1[1] #>> ''{}'', $1[2] #>> ''{}'', $1[3], $1[4])',
          to_jsonb(v_ws_id), to_jsonb(v_ws_kind), v_row_data, v_ws_presentation);
        IF v_converted IS NOT NULL THEN
          INSERT INTO crm_upgrade_presentation (company_id, source_table, row_id, user_id, original, target, scopes)
          VALUES (v_ws_id, 'P13n', v_row_data ->> 'id', v_row_data ->> 'userId', v_row_data, v_converted, '[]');
        END IF;
      END LOOP;
    END LOOP;
    FOR v_row_data IN SELECT to_jsonb(w) FROM "Widget" w WHERE w."companyId" = v_ws_id AND w.kind = 'chart' ORDER BY w.id LOOP
      v_converted := crm_upgrade.try_presentation(v_ws_id, 'Widget', NULL,
        'SELECT crm_upgrade.migrate_chart_widget($1[1] #>> ''{}'', $1[2], $1[3], $1[4] #>> ''{}'')',
        to_jsonb(v_ws_id), v_row_data, v_ws_presentation, to_jsonb(v_ws_currency));
      IF v_converted IS NOT NULL THEN
        INSERT INTO crm_upgrade_presentation (company_id, source_table, row_id, user_id, original, target, scopes)
        VALUES (v_ws_id, 'Widget', v_row_data ->> 'id', v_row_data ->> 'userId', v_row_data, v_row_data || (v_converted - 'scopes'), v_converted -> 'scopes');
      END IF;
    END LOOP;

    -- v5: presentation rows must belong to workspace members and reference existing records and members.
    PERFORM crm_upgrade.issue(v_ws_id, p.source_table, 'userId', 'foreign_presentation_owner')
      FROM crm_upgrade_presentation p WHERE p.company_id = v_ws_id
        AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."companyId" = v_ws_id AND u.id = p.user_id);
    PERFORM crm_upgrade.reference_issues(v_ws_id, v_ws_presentation, p.scopes, p.source_table)
      FROM crm_upgrade_presentation p WHERE p.company_id = v_ws_id AND jsonb_array_length(p.scopes) > 0;
    -- v5: converted keys must not collide with existing generic presentation rows.
    PERFORM crm_upgrade.issue(v_ws_id, 'DataView', 'id', 'presentation_target_collision')
      FROM "DataView" v WHERE v."companyId" = v_ws_id AND v."surfaceKey" IN (SELECT 'records:' || crm_upgrade.preset_id(v_ws_id, k) FROM unnest(ARRAY['contact', 'organization', 'deal', 'service', 'task']) AS k);
    PERFORM crm_upgrade.issue(v_ws_id, 'P13n', 'id', 'presentation_target_collision')
      FROM "P13n" p WHERE p."companyId" = v_ws_id AND p."p13nId" IN (SELECT prefix || crm_upgrade.preset_id(v_ws_id, k)
        FROM unnest(ARRAY['contact', 'organization', 'deal', 'service', 'task']) AS k, unnest(ARRAY['records:', 'record-detail:']) AS prefix);
    PERFORM crm_upgrade.issue(v_ws_id, 'P13n', 'p13nId', 'presentation_target_collision')
      FROM crm_upgrade_presentation p JOIN "P13n" other ON other."companyId" = v_ws_id AND other."userId" = p.user_id AND other."p13nId" = p.target ->> 'p13nId' AND other.id <> p.row_id
      WHERE p.company_id = v_ws_id AND p.source_table = 'P13n';
    -- Documented repair: an active list view that does not resolve to a converted view of the same member
    -- and surface falls back to the default (All) view.
    WITH unresolved AS (
      SELECT p.row_id FROM crm_upgrade_presentation p
      WHERE p.company_id = v_ws_id AND p.source_table = 'P13n' AND p.target ->> 'p13nId' LIKE 'records:%'
        AND p.target ->> 'activeViewKey' IS NOT NULL AND p.target ->> 'activeViewKey' <> '__all__'
        AND NOT EXISTS (SELECT 1 FROM crm_upgrade_presentation view WHERE view.company_id = v_ws_id AND view.source_table = 'DataView'
          AND view.row_id = p.target ->> 'activeViewKey' AND view.target ->> 'userId' = p.target ->> 'userId' AND view.target ->> 'surfaceKey' = p.target ->> 'p13nId')
    ), repaired AS (
      INSERT INTO crm_upgrade_repair (company_id, source_table, row_id, kind) SELECT v_ws_id, 'P13n', unresolved.row_id, 'active_view_reset' FROM unresolved
    )
    UPDATE crm_upgrade_presentation p SET target = p.target || '{"activeViewKey":null}'::jsonb
      FROM unresolved WHERE p.company_id = v_ws_id AND p.source_table = 'P13n' AND p.row_id = unresolved.row_id;

    -- v6: routines and webhooks subscribing to legacy record events.
    FOR v_trigger_row IN
      SELECT 'Webhook' AS source_table, w.id, w.events, w.enabled, NULL::text AS owner_user_id, NULL::text AS trigger_kind, ARRAY[]::text[] AS changed_fields, NULL::jsonb AS trigger_filters
        FROM "Webhook" w WHERE w."companyId" = v_ws_id
      UNION ALL
      SELECT 'Routine', r.id, r."triggerEvents", r.enabled, r."ownerUserId", r."triggerKind"::text, r."changedFields", r."triggerFilters"
        FROM "Routine" r WHERE r."companyId" = v_ws_id
      ORDER BY 1 DESC, 2
    LOOP
      -- Every routine and webhook row passes the strict row decoding of the retired upgrade.
      IF NOT crm_upgrade.is_uuid(v_trigger_row.id) OR v_trigger_row.events IS NULL OR v_trigger_row.changed_fields IS NULL
        OR (v_trigger_row.owner_user_id IS NOT NULL AND NOT crm_upgrade.is_uuid(v_trigger_row.owner_user_id)) THEN
        PERFORM crm_upgrade.issue(v_ws_id, v_trigger_row.source_table, 'row', 'invalid_legacy_trigger');
        CONTINUE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM unnest(v_trigger_row.events) AS e WHERE e ~ '^(contact|organization|deal|service|task)\.(created|updated|deleted)$') THEN CONTINUE; END IF;
      IF v_trigger_row.source_table = 'Routine' AND v_trigger_row.trigger_kind IS DISTINCT FROM 'event' THEN
        PERFORM crm_upgrade.issue(v_ws_id, 'Routine', 'triggerKind', 'legacy_event_on_scheduled_routine');
        CONTINUE;
      END IF;
      BEGIN
        INSERT INTO crm_upgrade_trigger (company_id, source_table, row_id, result)
        VALUES (v_ws_id, v_trigger_row.source_table, v_trigger_row.id, crm_upgrade.migrate_trigger(v_ws_id, v_trigger_row.source_table, to_jsonb(v_trigger_row), v_ws_presentation, v_ws_model, v_ws_currency));
      EXCEPTION
        WHEN SQLSTATE 'CRM01' THEN PERFORM crm_upgrade.issue(v_ws_id, v_trigger_row.source_table, 'trigger', SQLERRM);
        WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT, v_context = PG_EXCEPTION_CONTEXT;
          PERFORM crm_upgrade.raise_internal(v_trigger_row.source_table || ' trigger conversion', v_state, v_message, v_context);
      END;
    END LOOP;

    -- v8: legacy terminology presets must exist in the label catalogue.
    v_locale := COALESCE((SELECT u."displayLanguage"::text FROM "User" u WHERE u."companyId" = v_ws_id ORDER BY u."createdAt", u.id LIMIT 1), 'en');
    PERFORM crm_upgrade.issue(v_ws_id, 'EntityTerminology', 'presetKey', 'unsupported_terminology')
      FROM "EntityTerminology" t WHERE t."companyId" = v_ws_id
        AND COALESCE(v_catalog -> v_locale, v_catalog -> 'en') #> ARRAY[t."entityType"::text, t."presetKey"] IS NULL;
  END LOOP;

  -- v8: timeline views (any workspace) referencing legacy record types.
  FOR v_timeline IN
    SELECT 'DataView' AS source_table, v.id, v."companyId", v.filters FROM "DataView" v WHERE v."surfaceKey" = 'entity-timeline' AND v.filters IS NOT NULL AND v.filters <> 'null'::jsonb
    UNION ALL
    SELECT 'P13n', p.id, p."companyId", p.filters FROM "P13n" p WHERE p."p13nId" = 'entity-timeline' AND p.filters IS NOT NULL AND p.filters <> 'null'::jsonb
  LOOP
    BEGIN
      INSERT INTO crm_upgrade_timeline (source_table, row_id, filters)
      VALUES (v_timeline.source_table, v_timeline.id, crm_upgrade.migrate_timeline_filters(v_timeline."companyId", v_timeline.filters));
    EXCEPTION
      WHEN SQLSTATE 'CRM01' THEN PERFORM crm_upgrade.issue(v_timeline."companyId", v_timeline.source_table, 'filters', 'invalid_timeline_view');
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT, v_context = PG_EXCEPTION_CONTEXT;
        PERFORM crm_upgrade.raise_internal(v_timeline.source_table || ' timeline view conversion', v_state, v_message, v_context);
    END;
  END LOOP;
END
$validate$;

ANALYZE crm_upgrade_workspace, crm_upgrade_value, crm_upgrade_presentation, crm_upgrade_trigger;

-- Refuse with every issue, grouped (never row contents).
DO $refuse$
DECLARE
  v_summary text;
BEGIN
  SELECT string_agg(format('%s.%s %s x%s', i.source_table, i.field, i.code, i.total), '; ' ORDER BY i.source_table, i.field, i.code)
    INTO v_summary FROM (SELECT source_table, field, code, count(*) AS total FROM crm_upgrade_issue GROUP BY 1, 2, 3) AS i;
  IF v_summary IS NOT NULL THEN
    RAISE EXCEPTION 'Configurable record upgrade refused (% workspaces affected): %',
      (SELECT count(DISTINCT company_id) FROM crm_upgrade_issue), v_summary
      USING HINT = 'Nothing was changed. Fix the reported legacy rows, run prisma migrate resolve --rolled-back 20261004000000_configurable_records, then prisma migrate deploy.';
  END IF;
END
$refuse$;

-- =============================================================================================
-- Section 2: EXPANSION. The end state of the generic record storage, created directly (no intermediate
-- shapes). Legacy tables stay in place until section 7 because sections 3-6 read them.
-- =============================================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- A new permission resource for the record model configuration (not used by this transaction).
ALTER TYPE "Resource" ADD VALUE IF NOT EXISTS 'dataModel';

-- Locale-aware deterministic ordering of record values.
CREATE COLLATION "crm_en" (provider = icu, locale = 'en', deterministic = true);
CREATE COLLATION "crm_de" (provider = icu, locale = 'de', deterministic = true);
CREATE COLLATION "crm_es" (provider = icu, locale = 'es', deterministic = true);
CREATE COLLATION "crm_fr" (provider = icu, locale = 'fr', deterministic = true);
CREATE COLLATION "crm_it" (provider = icu, locale = 'it', deterministic = true);

-- Workspace-qualified keys for composite foreign keys.
CREATE UNIQUE INDEX "User_companyId_id_key" ON "User"("companyId", "id");
CREATE UNIQUE INDEX "UserRole_companyId_id_key" ON "UserRole"("companyId", "id");
CREATE UNIQUE INDEX "Webhook_companyId_id_key" ON "Webhook"("companyId", id);
CREATE UNIQUE INDEX "MessagingThread_companyId_id_key" ON "MessagingThread"("companyId", id);

-- Record model: schema state, versioned types, fields and relationships.
CREATE TABLE "RecordSchemaState" (
    "companyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "activeOperationId" TEXT,
    "storageMode" TEXT NOT NULL DEFAULT 'legacy',

    CONSTRAINT "RecordSchemaState_pkey" PRIMARY KEY ("companyId")
);

CREATE TABLE "RecordTypeDefinition" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "presetKey" TEXT,
    "label" TEXT NOT NULL,
    "pluralLabel" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "embedded" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "definition" JSONB NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordTypeDefinition_pkey" PRIMARY KEY ("companyId","id")
);

CREATE TABLE "RecordFieldDefinition" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "behavior" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordFieldDefinition_pkey" PRIMARY KEY ("companyId","id")
);

CREATE TABLE "RecordRelationshipDefinition" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "sourceTypeId" TEXT NOT NULL,
    "targetTypeId" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordRelationshipDefinition_pkey" PRIMARY KEY ("companyId","id")
);

-- Records, typed values, calculation provenance, links and assignments.
CREATE TABLE "CrmRecord" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "protectedKind" TEXT,
    "systemData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmRecord_pkey" PRIMARY KEY ("companyId","typeId","id"),
    CONSTRAINT "CrmRecord_version_check" CHECK ("version" > 0)
);

-- Exactly one typed column holds a value; instants keep microseconds and their original lexical form.
CREATE TABLE "RecordValue" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'missing',
    "textValue" TEXT,
    "decimalValue" DECIMAL(65,30),
    "currency" TEXT,
    "booleanValue" BOOLEAN,
    "instantValue" TIMESTAMP(6),
    "jsonValue" JSONB,
    "errorCode" TEXT,
    "schemaRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "textListValue" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lexicalValue" TEXT,
    "rangeStart" TIMESTAMP(6),
    "rangeEnd" TIMESTAMP(6),

    CONSTRAINT "RecordValue_pkey" PRIMARY KEY ("companyId","typeId","recordId","fieldId"),
    CONSTRAINT "RecordValue_currency_check" CHECK ("currency" IS NULL OR ("decimalValue" IS NOT NULL AND "currency" ~ '^[A-Z]{3}$')),
    CONSTRAINT "RecordValue_decimal_check" CHECK ("decimalValue" IS NULL OR "decimalValue" <> 'NaN'::numeric),
    CONSTRAINT "RecordValue_lexical_check" CHECK ("lexicalValue" IS NULL OR "instantValue" IS NOT NULL),
    CONSTRAINT "RecordValue_shape_check" CHECK (
      ("state" = 'value' AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue") + CASE WHEN cardinality("textListValue") > 0 THEN 1 ELSE 0 END = 1 AND "errorCode" IS NULL)
      OR ("state" = 'missing' AND cardinality("textListValue") = 0 AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue", "errorCode") = 0)
      OR ("state" = 'error' AND cardinality("textListValue") = 0 AND "errorCode" IS NOT NULL AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue") = 0)
    )
);

CREATE TABLE "RecordValueDependency" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "sourceTypeId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "RecordValueDependency_pkey" PRIMARY KEY ("companyId","typeId","recordId","fieldId","sourceTypeId","sourceId")
);

CREATE TABLE "RecordLink" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "relationId" TEXT NOT NULL,
    "sourceTypeId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetTypeId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordLink_pkey" PRIMARY KEY ("companyId", "relationId", "id")
);

CREATE TABLE "RecordAssignment" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordAssignment_pkey" PRIMARY KEY ("companyId","typeId","recordId","userId")
);

CREATE TABLE "RecordTypeGrant" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "actions" "Action"[],

    CONSTRAINT "RecordTypeGrant_pkey" PRIMARY KEY ("companyId","typeId","roleId")
);

-- Immutable configuration history.
CREATE TABLE "RecordSchemaRevision" (
    "companyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change" JSONB,

    CONSTRAINT "RecordSchemaRevision_pkey" PRIMARY KEY ("companyId","revision")
);

-- Staged, resumable configuration and bulk operations.
CREATE TABLE "RecordOperation" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "expectedRevision" INTEGER NOT NULL,
    "request" JSONB NOT NULL,
    "stagedSchema" JSONB,
    "result" JSONB,
    "errorCode" TEXT,
    "cursor" JSONB,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordOperation_pkey" PRIMARY KEY ("companyId","id")
);

CREATE TABLE "RecordStageRow" (
    "companyId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "RecordStageRow_pkey" PRIMARY KEY ("companyId","operationId","kind","key")
);

CREATE TABLE "RecordMutationReceipt" (
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordMutationReceipt_pkey" PRIMARY KEY ("companyId","userId","idempotencyKey")
);

-- Record event outbox and its subscriptions (routines and webhooks).
CREATE TABLE "RecordEvent" (
    "companyId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "causeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFailureCode" TEXT,

    CONSTRAINT "RecordEvent_pkey" PRIMARY KEY ("companyId","id")
);



-- Canonical channel identities (shared by any number of records) and their lookup aliases.
CREATE TABLE "RecordIdentity" (
  "companyId" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "provider" "MessagingProvider" NOT NULL,
  "channelClass" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "messagingId" TEXT,
  "displayName" TEXT,
  "profileUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecordIdentity_pkey" PRIMARY KEY ("companyId", "id")
);
CREATE TABLE "RecordIdentityKey" (
  "companyId" TEXT NOT NULL,
  "channelClass" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  CONSTRAINT "RecordIdentityKey_pkey" PRIMARY KEY ("companyId", "channelClass", "value")
);
CREATE TABLE "RecordIdentityLink" (
  "companyId" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordIdentityLink_pkey" PRIMARY KEY ("companyId", "identityId", "typeId", "recordId")
);

-- Explicit conversation-to-record links (none are inferred from participant identities).
CREATE TABLE "MessagingThreadRecordLink" (
  "companyId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessagingThreadRecordLink_pkey" PRIMARY KEY ("companyId", "threadId", "typeId", "recordId")
);

-- Normalised participant identifiers so conversations can be matched to channel identities.
ALTER TABLE "MessagingThreadParticipant" ADD COLUMN "identityLookupValue" TEXT;
CREATE INDEX "MessagingThreadParticipant_identity_lookup_idx" ON "MessagingThreadParticipant" ("companyId", provider, "identityLookupValue");

-- Explicitly personalised list state keys.
ALTER TABLE "P13n" ADD COLUMN "viewStateKeys" JSONB;
ALTER TABLE "P13n" ADD CONSTRAINT "P13n_viewStateKeys_array" CHECK ("viewStateKeys" IS NULL OR jsonb_typeof("viewStateKeys") = 'array');

-- Generic chart measures and activity queries on widgets.
ALTER TABLE "Widget" ADD COLUMN "measure" JSONB;
ALTER TABLE "Widget" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_measure_shape_check" CHECK ("measure" IS NULL OR (kind = 'chart' AND jsonb_typeof("measure") = 'object'));
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_version_positive_check" CHECK (version > 0);
CREATE INDEX "Widget_companyId_measure_typeId_idx" ON "Widget" ("companyId", ("measure"->'source'->>'typeId')) WHERE "measure" IS NOT NULL;
ALTER TABLE "Widget" ADD COLUMN "activityQuery" JSONB;

-- Record event subscriptions: one per routine or webhook, several typed sources each.
CREATE TABLE "RecordEventSubscription" (
  "companyId" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('routine', 'webhook')),
  "ownerUserId" TEXT NOT NULL,
  "typeId" TEXT,
  "events" TEXT[] NOT NULL,
  "changedFieldIds" TEXT[] NOT NULL,
  "query" JSONB,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sources" JSONB,
  CONSTRAINT "RecordEventSubscription_pkey" PRIMARY KEY ("companyId", "id"),
  CONSTRAINT "RecordEventSubscription_query_type_check" CHECK ("query" IS NULL OR ("typeId" IS NOT NULL AND "query"->>'typeId' = "typeId") IS TRUE),
  CONSTRAINT "RecordEventSubscription_sources_array_check" CHECK (sources IS NULL OR jsonb_typeof(sources) = 'array')
);
CREATE TABLE "RecordEventMatch" (
  "companyId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "subscriptionRevision" INTEGER NOT NULL,
  CONSTRAINT "RecordEventMatch_pkey" PRIMARY KEY ("companyId", "eventId", "subscriptionId")
);

-- Webhook deliveries bound to record events, with leases, retries and explicit resends. Existing
-- delivery history stays intact; completed deliveries are never replayed automatically.
ALTER TABLE "WebhookDelivery"
  ADD COLUMN "webhookId" TEXT,
  ADD COLUMN "recordEventId" TEXT,
  ADD COLUMN "subscriptionRevision" INTEGER,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "admissionKey" TEXT;
UPDATE "WebhookDelivery" SET "nextAttemptAt" = NULL WHERE status IN ('success', 'failed');
CREATE UNIQUE INDEX "WebhookDelivery_companyId_admissionKey_key" ON "WebhookDelivery"("companyId", "admissionKey");
CREATE INDEX "WebhookDelivery_companyId_webhookId_createdAt_idx" ON "WebhookDelivery"("companyId", "webhookId", "createdAt");
CREATE INDEX "WebhookDelivery_companyId_recordEventId_idx" ON "WebhookDelivery"("companyId", "recordEventId");
CREATE INDEX "WebhookDelivery_nextAttemptAt_status_idx" ON "WebhookDelivery"("nextAttemptAt", status);
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_companyId_webhookId_fkey" FOREIGN KEY ("companyId", "webhookId") REFERENCES "Webhook"("companyId", id) ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_companyId_recordEventId_fkey" FOREIGN KEY ("companyId", "recordEventId") REFERENCES "RecordEvent"("companyId", id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_record_revision_check" CHECK (("recordEventId" IS NULL AND "subscriptionRevision" IS NULL) OR ("recordEventId" IS NOT NULL AND "subscriptionRevision" > 0));
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_attempts_check" CHECK (attempts >= 0);
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_lease_check" CHECK (("leaseToken" IS NULL) = ("leaseExpiresAt" IS NULL));

-- =============================================================================================
-- Section 3: DATA CONVERSION. Record IDs and createdAt/updatedAt are copied unchanged. Collisions of
-- legacy IDs across types are preserved (records are keyed by type). No record events are written, so
-- no routine or webhook delivery is emitted.
-- =============================================================================================

-- The record model rows (version-1 definitions; section 4 publishes the later revisions) come first
-- because records, values and links reference them.
INSERT INTO "RecordTypeDefinition" ("companyId", id, "presetKey", label, "pluralLabel", archived, embedded, position, definition, "createdAt", "updatedAt")
SELECT w.company_id, t.value ->> 'id',
  (SELECT k FROM unnest(ARRAY['contact', 'organization', 'deal', 'service', 'task', 'lineItem']) AS k WHERE crm_upgrade.preset_id(w.company_id, k) = t.value ->> 'id'),
  t.value ->> 'label', t.value ->> 'pluralLabel', (t.value ->> 'archived')::boolean, (t.value ->> 'embedded')::boolean, (t.value ->> 'position')::integer,
  t.value, now(), now()
FROM crm_upgrade_workspace w, jsonb_array_elements(w.model -> 'types') AS t(value);

INSERT INTO "RecordFieldDefinition" ("companyId", "typeId", id, "valueType", behavior, archived, definition, "createdAt", "updatedAt")
SELECT w.company_id, f.value ->> 'typeId', f.value ->> 'id', f.value ->> 'valueType', f.value #>> '{behavior,kind}', (f.value ->> 'archived')::boolean, f.value,
  COALESCE(c."createdAt", now()), COALESCE(c."updatedAt", now())
FROM crm_upgrade_workspace w
CROSS JOIN jsonb_array_elements(w.model -> 'fields') AS f(value)
LEFT JOIN "CustomColumn" c ON c."companyId" = w.company_id AND c.id = f.value ->> 'id';

INSERT INTO "RecordRelationshipDefinition" ("companyId", id, "sourceTypeId", "targetTypeId", definition, archived, "createdAt", "updatedAt")
SELECT w.company_id, r.value ->> 'id', r.value ->> 'sourceTypeId', r.value ->> 'targetTypeId', r.value, (r.value ->> 'archived')::boolean, now(), now()
FROM crm_upgrade_workspace w, jsonb_array_elements(w.model -> 'relationships') AS r(value);


-- Records of the five legacy types; pending membership authorisations stay protected system tasks.
INSERT INTO "CrmRecord" ("companyId", "typeId", id, "protectedKind", "systemData", "createdAt", "updatedAt")
SELECT r."companyId", crm_upgrade.preset_id(r."companyId", 'contact'), r.id, NULL::text, NULL::jsonb, r."createdAt", r."updatedAt" FROM "Contact" r
UNION ALL
SELECT r."companyId", crm_upgrade.preset_id(r."companyId", 'organization'), r.id, NULL, NULL, r."createdAt", r."updatedAt" FROM "Organization" r
UNION ALL
SELECT r."companyId", crm_upgrade.preset_id(r."companyId", 'deal'), r.id, NULL, NULL, r."createdAt", r."updatedAt" FROM "Deal" r
UNION ALL
SELECT r."companyId", crm_upgrade.preset_id(r."companyId", 'service'), r.id, NULL, NULL, r."createdAt", r."updatedAt" FROM "Service" r
UNION ALL
SELECT r."companyId", crm_upgrade.preset_id(r."companyId", 'task'), r.id,
  CASE WHEN r.type = 'userPendingAuthorization' THEN 'membershipAuthorization' END, jsonb_build_object('relatedUserId', r."relatedUserId"),
  r."createdAt", r."updatedAt" FROM "Task" r
UNION ALL
-- Line items: every legacy service-on-deal row becomes an embedded record with the same ID.
SELECT r."companyId", crm_upgrade.preset_id(r."companyId", 'lineItem'), r.id, NULL, NULL, r."createdAt", r."updatedAt" FROM "ServiceDeal" r;


-- Member assignments keep their creation time.
INSERT INTO "RecordAssignment" ("companyId", "typeId", "recordId", "userId", "createdAt")
SELECT l."companyId", crm_upgrade.preset_id(l."companyId", 'contact'), l."contactId", l."userId", l."createdAt" FROM "ContactUser" l
UNION ALL SELECT l."companyId", crm_upgrade.preset_id(l."companyId", 'organization'), l."organizationId", l."userId", l."createdAt" FROM "OrganizationUser" l
UNION ALL SELECT l."companyId", crm_upgrade.preset_id(l."companyId", 'deal'), l."dealId", l."userId", l."createdAt" FROM "DealUser" l
UNION ALL SELECT l."companyId", crm_upgrade.preset_id(l."companyId", 'service'), l."serviceId", l."userId", l."createdAt" FROM "ServiceUser" l
UNION ALL SELECT l."companyId", crm_upgrade.preset_id(l."companyId", 'task'), l."taskId", l."userId", l."createdAt" FROM "TaskUser" l;

-- Typed values (schema revision 1). The CASE layout mirrors writeMigrationValues: text/select in
-- textValue, lists in textListValue, exact decimals with their currency, instants with their original
-- lexical form, date ranges as JSON plus indexed endpoints, rich text as JSON.
CREATE FUNCTION crm_upgrade.insert_values(p_staged text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format($sql$
    INSERT INTO "RecordValue" ("companyId", "typeId", "recordId", "fieldId", state, "textValue", "textListValue", "decimalValue", currency, "booleanValue",
      "instantValue", "lexicalValue", "jsonValue", "errorCode", "schemaRevision", "createdAt", "updatedAt", "rangeStart", "rangeEnd")
    SELECT v.company_id, v.type_id, v.record_id, v.field_id, CASE WHEN v.scalar IS NULL THEN 'missing' ELSE 'value' END,
      CASE WHEN v.scalar ->> 'kind' IN ('text', 'select', 'member') THEN v.scalar ->> 'value' END,
      CASE WHEN v.scalar ->> 'kind' = 'textList' THEN ARRAY(SELECT jsonb_array_elements_text(v.scalar -> 'value')) ELSE ARRAY[]::text[] END,
      CASE WHEN v.scalar ->> 'kind' = 'decimal' THEN (v.scalar ->> 'value')::numeric END,
      CASE WHEN v.scalar ->> 'kind' = 'decimal' THEN v.scalar ->> 'currency' END,
      CASE WHEN v.scalar ->> 'kind' = 'boolean' THEN (v.scalar ->> 'value')::boolean END,
      CASE WHEN v.scalar ->> 'kind' IN ('date', 'dateTime') THEN (v.scalar ->> 'value')::timestamptz AT TIME ZONE 'UTC' END,
      CASE WHEN v.scalar ->> 'kind' IN ('date', 'dateTime') THEN v.scalar ->> 'value' END,
      CASE WHEN v.scalar ->> 'kind' = 'richText' THEN v.scalar -> 'document' WHEN v.scalar ->> 'kind' = 'range' THEN v.scalar - 'kind' END,
      NULL, 1, v.created_at, v.updated_at,
      CASE WHEN v.scalar ->> 'kind' = 'range' THEN (v.scalar ->> 'start')::timestamptz AT TIME ZONE 'UTC' END,
      CASE WHEN v.scalar ->> 'kind' = 'range' THEN (v.scalar ->> 'end')::timestamptz AT TIME ZONE 'UTC' END
    FROM (%s) AS v
  $sql$, p_staged);
END
$$;

-- Built-in values of the legacy columns. Notes keep their JSON document as read and re-serialised by
-- JavaScript (numbers pass through doubles); a JSON null note is a missing value.
DO $insert$ BEGIN PERFORM crm_upgrade.insert_values($staged$
  SELECT r."companyId" AS company_id, crm_upgrade.preset_id(r."companyId", 'contact') AS type_id, r.id AS record_id, crm_upgrade.preset_id(r."companyId", f.key) AS field_id,
    f.scalar, r."createdAt" AS created_at, r."updatedAt" AS updated_at
  FROM "Contact" r CROSS JOIN LATERAL (VALUES
    ('contact.firstName', crm_upgrade.scalar_text(r."firstName")),
    ('contact.lastName', crm_upgrade.scalar_text(r."lastName")),
    ('contact.avatarUrl', CASE WHEN r."avatarUrl" IS NOT NULL THEN crm_upgrade.scalar_text(r."avatarUrl") END),
    ('contact.notes', CASE WHEN r.notes IS NOT NULL AND r.notes <> 'null'::jsonb THEN jsonb_build_object('kind', 'richText', 'document', crm_upgrade.js_json(r.notes)) END)) AS f(key, scalar)
  UNION ALL
  SELECT r."companyId", crm_upgrade.preset_id(r."companyId", r.kind), r.id, crm_upgrade.preset_id(r."companyId", r.kind || '.' || f.key), f.scalar, r."createdAt", r."updatedAt"
  FROM (
    SELECT 'organization' AS kind, "companyId", id, name, notes, NULL::text AS amount, "createdAt", "updatedAt" FROM "Organization"
    UNION ALL SELECT 'deal', "companyId", id, name, notes, NULL, "createdAt", "updatedAt" FROM "Deal"
    UNION ALL SELECT 'service', "companyId", id, name, notes, amount::text, "createdAt", "updatedAt" FROM "Service"
    UNION ALL SELECT 'task', "companyId", id, name, notes, NULL, "createdAt", "updatedAt" FROM "Task"
  ) AS r
  JOIN crm_upgrade_workspace w ON w.company_id = r."companyId"
  CROSS JOIN LATERAL (VALUES
    ('name', crm_upgrade.scalar_text(r.name)),
    ('notes', CASE WHEN r.notes IS NOT NULL AND r.notes <> 'null'::jsonb THEN jsonb_build_object('kind', 'richText', 'document', crm_upgrade.js_json(r.notes)) END),
    ('amount', CASE WHEN r.kind = 'service' THEN crm_upgrade.scalar_decimal(crm_upgrade.decimal_text(r.amount::numeric), w.currency) END)) AS f(key, scalar)
  WHERE f.key <> 'amount' OR r.kind = 'service'
$staged$); END $insert$;

-- Line item inputs: the legacy row name, its exact quantity and live pricing.
DO $insert$ BEGIN PERFORM crm_upgrade.insert_values($staged$
  SELECT r."companyId" AS company_id, crm_upgrade.preset_id(r."companyId", 'lineItem') AS type_id, r.id AS record_id,
    crm_upgrade.preset_id(r."companyId", 'lineItem.' || f.key) AS field_id, f.scalar, r."createdAt" AS created_at, r."updatedAt" AS updated_at
  FROM "ServiceDeal" r CROSS JOIN LATERAL (VALUES
    ('name', crm_upgrade.scalar_text('Line item')),
    ('quantity', crm_upgrade.scalar_decimal(crm_upgrade.decimal_text(r.quantity::text::numeric), NULL)),
    ('pricingMode', '{"kind":"select","value":"live"}'::jsonb)) AS f(key, scalar)
$staged$); END $insert$;

-- Custom column values validated and staged in section 1 (including the documented link repair).
DO $insert$ BEGIN PERFORM crm_upgrade.insert_values($staged$
  SELECT company_id, type_id, record_id, field_id, scalar, created_at, updated_at FROM crm_upgrade_value
$staged$); END $insert$;

-- Links keep their legacy IDs and timestamps; line items link to their deal and service.
INSERT INTO "RecordLink" ("companyId", id, "relationId", "sourceTypeId", "sourceId", "targetTypeId", "targetId", "createdAt", "updatedAt")
SELECT l."companyId", l.id, crm_upgrade.preset_id(l."companyId", 'contact.organizations'), crm_upgrade.preset_id(l."companyId", 'contact'), l."contactId", crm_upgrade.preset_id(l."companyId", 'organization'), l."organizationId", l."createdAt", l."updatedAt" FROM "ContactOrganization" l
UNION ALL SELECT l."companyId", l.id, crm_upgrade.preset_id(l."companyId", 'deal.contacts'), crm_upgrade.preset_id(l."companyId", 'deal'), l."dealId", crm_upgrade.preset_id(l."companyId", 'contact'), l."contactId", l."createdAt", l."updatedAt" FROM "DealContact" l
UNION ALL SELECT l."companyId", l.id, crm_upgrade.preset_id(l."companyId", 'deal.organizations'), crm_upgrade.preset_id(l."companyId", 'deal'), l."dealId", crm_upgrade.preset_id(l."companyId", 'organization'), l."organizationId", l."createdAt", l."updatedAt" FROM "DealOrganization" l
UNION ALL SELECT l."companyId", l.id, crm_upgrade.preset_id(l."companyId", 'task.contacts'), crm_upgrade.preset_id(l."companyId", 'task'), l."taskId", crm_upgrade.preset_id(l."companyId", 'contact'), l."contactId", l."createdAt", l."updatedAt" FROM "TaskContact" l
UNION ALL SELECT l."companyId", l.id, crm_upgrade.preset_id(l."companyId", 'task.organizations'), crm_upgrade.preset_id(l."companyId", 'task'), l."taskId", crm_upgrade.preset_id(l."companyId", 'organization'), l."organizationId", l."createdAt", l."updatedAt" FROM "TaskOrganization" l
UNION ALL SELECT l."companyId", l.id, crm_upgrade.preset_id(l."companyId", 'task.deals'), crm_upgrade.preset_id(l."companyId", 'task'), l."taskId", crm_upgrade.preset_id(l."companyId", 'deal'), l."dealId", l."createdAt", l."updatedAt" FROM "TaskDeal" l
UNION ALL SELECT l."companyId", l.id, crm_upgrade.preset_id(l."companyId", 'task.services'), crm_upgrade.preset_id(l."companyId", 'task'), l."taskId", crm_upgrade.preset_id(l."companyId", 'service'), l."serviceId", l."createdAt", l."updatedAt" FROM "TaskService" l
UNION ALL SELECT l."companyId", l.id, crm_upgrade.preset_id(l."companyId", 'lineItem.service'), crm_upgrade.preset_id(l."companyId", 'lineItem'), l.id, crm_upgrade.preset_id(l."companyId", 'service'), l."serviceId", l."createdAt", l."updatedAt" FROM "ServiceDeal" l
UNION ALL SELECT l."companyId", l.id, crm_upgrade.preset_id(l."companyId", 'lineItem.deal'), crm_upgrade.preset_id(l."companyId", 'lineItem'), l.id, crm_upgrade.preset_id(l."companyId", 'deal'), l."dealId", l."createdAt", l."updatedAt" FROM "ServiceDeal" l;


-- Contact identifiers become canonical channel identities (same IDs) with their lookup aliases (value and
-- provider messaging ID) and one record association each.
INSERT INTO "RecordIdentity" ("companyId", id, provider, "channelClass", value, "messagingId", "displayName", "profileUrl", "createdAt", "updatedAt")
SELECT "companyId", id, provider, "channelClass", value, "messagingId", "displayName", "profileUrl", "createdAt", "updatedAt" FROM "ContactIdentifier";
INSERT INTO "RecordIdentityKey" ("companyId", "channelClass", value, "identityId")
SELECT DISTINCT i."companyId", i."channelClass", key.value, i.id
FROM "ContactIdentifier" i CROSS JOIN LATERAL unnest(ARRAY[i.value, i."messagingId"]) AS key(value)
WHERE key.value IS NOT NULL;
INSERT INTO "RecordIdentityLink" ("companyId", "identityId", "typeId", "recordId", "createdAt")
SELECT "companyId", id, crm_upgrade.preset_id("companyId", 'contact'), "contactId", "createdAt" FROM "ContactIdentifier";

-- Conversation participants get the normalised lookup key of their identifier (v3).
UPDATE "MessagingThreadParticipant" participant
SET "identityLookupValue" = crm_upgrade.participant_lookup_value(participant.provider::text, participant.identifier)
WHERE crm_upgrade.participant_lookup_value(participant.provider::text, participant.identifier) IS NOT NULL;


-- =============================================================================================
-- Section 4: CONFIGURATION CONVERSION. The configuration history is the one the retired upgrade wrote:
--   revision 1  the legacy model (actor: first active system-role member, else system:record-migration:v2)
--   revision 2  person activity paths (system:record-migration:v4)
--   revision 3  presentation defaults, relationship paths, trimmed labels (system:record-migration:v5)
--   revision 4  legacy terminology labels, only when they change a label (migration:legacy-terminology)
--   last        Channels enabled on the person type (system:shared-channel-migration)
-- Every workspace ends with storageMode = generic, no active operation and the last revision.
-- =============================================================================================

CREATE TEMP TABLE crm_upgrade_revision (company_id text NOT NULL, revision integer NOT NULL, actor_id text NOT NULL, snapshot jsonb NOT NULL) ON COMMIT DROP;

INSERT INTO crm_upgrade_revision (company_id, revision, actor_id, snapshot)
SELECT w.company_id, 1, w.actor_id, w.model FROM crm_upgrade_workspace w
UNION ALL
SELECT w.company_id, 2, 'system:record-migration:v4', w.model || jsonb_build_object('revision', 2, 'activityPaths', crm_upgrade.migrated_activity_paths(w.company_id, w.model))
FROM crm_upgrade_workspace w
UNION ALL
SELECT w.company_id, 3, 'system:record-migration:v5', w.presentation_model FROM crm_upgrade_workspace w;

-- Revision 3 publishes the presentation type definitions.
UPDATE "RecordTypeDefinition" definition SET definition = t.value
FROM crm_upgrade_workspace w, jsonb_array_elements(w.presentation_model -> 'types') AS t(value)
WHERE definition."companyId" = w.company_id AND definition.id = t.value ->> 'id';

-- Legacy terminology presets (EntityTerminology) relabel a type when it still carries the English or the
-- workspace-locale default label (v8/terminology.ts; the locale is the first member's display language).
DO $terminology$
DECLARE
  v_catalog jsonb := '{"de": {"contact": {"client": {"plural": "Kunden", "singular": "Kunde"}, "contact": {"plural": "Kontakte", "singular": "Kontakt"}, "lead": {"plural": "Leads", "singular": "Lead"}, "person": {"plural": "Personen", "singular": "Person"}}, "deal": {"deal": {"plural": "Deals", "singular": "Deal"}, "job": {"plural": "Aufträge", "singular": "Auftrag"}, "opportunity": {"plural": "Chancen", "singular": "Chance"}, "project": {"plural": "Projekte", "singular": "Projekt"}}, "organization": {"account": {"plural": "Accounts", "singular": "Account"}, "company": {"plural": "Unternehmen", "singular": "Unternehmen"}, "organization": {"plural": "Organisationen", "singular": "Organisation"}}, "service": {"offering": {"plural": "Leistungen", "singular": "Leistung"}, "package": {"plural": "Pakete", "singular": "Paket"}, "product": {"plural": "Produkte", "singular": "Produkt"}, "service": {"plural": "Services", "singular": "Service"}}, "task": {"actionItem": {"plural": "Action Items", "singular": "Action Item"}, "followUp": {"plural": "Follow-ups", "singular": "Follow-up"}, "task": {"plural": "Aufgaben", "singular": "Aufgabe"}, "todo": {"plural": "To-dos", "singular": "To-do"}}}, "en": {"contact": {"client": {"plural": "Clients", "singular": "Client"}, "contact": {"plural": "Contacts", "singular": "Contact"}, "lead": {"plural": "Leads", "singular": "Lead"}, "person": {"plural": "People", "singular": "Person"}}, "deal": {"deal": {"plural": "Deals", "singular": "Deal"}, "job": {"plural": "Jobs", "singular": "Job"}, "opportunity": {"plural": "Opportunities", "singular": "Opportunity"}, "project": {"plural": "Projects", "singular": "Project"}}, "organization": {"account": {"plural": "Accounts", "singular": "Account"}, "company": {"plural": "Companies", "singular": "Company"}, "organization": {"plural": "Organizations", "singular": "Organization"}}, "service": {"offering": {"plural": "Offerings", "singular": "Offering"}, "package": {"plural": "Packages", "singular": "Package"}, "product": {"plural": "Products", "singular": "Product"}, "service": {"plural": "Services", "singular": "Service"}}, "task": {"actionItem": {"plural": "Action items", "singular": "Action item"}, "followUp": {"plural": "Follow-ups", "singular": "Follow-up"}, "task": {"plural": "Tasks", "singular": "Task"}, "todo": {"plural": "To-dos", "singular": "To-do"}}}, "es": {"contact": {"client": {"plural": "Clientes", "singular": "Cliente"}, "contact": {"plural": "Contactos", "singular": "Contacto"}, "lead": {"plural": "Leads", "singular": "Lead"}, "person": {"plural": "Personas", "singular": "Persona"}}, "deal": {"deal": {"plural": "Oportunidades", "singular": "Oportunidad"}, "job": {"plural": "Trabajos", "singular": "Trabajo"}, "opportunity": {"plural": "Oportunidades comerciales", "singular": "Oportunidad comercial"}, "project": {"plural": "Proyectos", "singular": "Proyecto"}}, "organization": {"account": {"plural": "Cuentas", "singular": "Cuenta"}, "company": {"plural": "Empresas", "singular": "Empresa"}, "organization": {"plural": "Organizaciones", "singular": "Organización"}}, "service": {"offering": {"plural": "Ofertas", "singular": "Oferta"}, "package": {"plural": "Paquetes", "singular": "Paquete"}, "product": {"plural": "Productos", "singular": "Producto"}, "service": {"plural": "Servicios", "singular": "Servicio"}}, "task": {"actionItem": {"plural": "Acciones", "singular": "Acción"}, "followUp": {"plural": "Seguimientos", "singular": "Seguimiento"}, "task": {"plural": "Tareas", "singular": "Tarea"}, "todo": {"plural": "Pendientes", "singular": "Pendiente"}}}, "fr": {"contact": {"client": {"plural": "Clients", "singular": "Client"}, "contact": {"plural": "Contacts", "singular": "Contact"}, "lead": {"plural": "Prospects", "singular": "Prospect"}, "person": {"plural": "Personnes", "singular": "Personne"}}, "deal": {"deal": {"plural": "Affaires", "singular": "Affaire"}, "job": {"plural": "Missions", "singular": "Mission"}, "opportunity": {"plural": "Opportunités", "singular": "Opportunité"}, "project": {"plural": "Projets", "singular": "Projet"}}, "organization": {"account": {"plural": "Comptes", "singular": "Compte"}, "company": {"plural": "Entreprises", "singular": "Entreprise"}, "organization": {"plural": "Organisations", "singular": "Organisation"}}, "service": {"offering": {"plural": "Offres", "singular": "Offre"}, "package": {"plural": "Forfaits", "singular": "Forfait"}, "product": {"plural": "Produits", "singular": "Produit"}, "service": {"plural": "Services", "singular": "Service"}}, "task": {"actionItem": {"plural": "Actions", "singular": "Action"}, "followUp": {"plural": "Relances", "singular": "Relance"}, "task": {"plural": "Tâches", "singular": "Tâche"}, "todo": {"plural": "À faire", "singular": "Élément à faire"}}}, "it": {"contact": {"client": {"plural": "Clienti", "singular": "Cliente"}, "contact": {"plural": "Contatti", "singular": "Contatto"}, "lead": {"plural": "Lead", "singular": "Lead"}, "person": {"plural": "Persone", "singular": "Persona"}}, "deal": {"deal": {"plural": "Trattative", "singular": "Trattativa"}, "job": {"plural": "Lavori", "singular": "Lavoro"}, "opportunity": {"plural": "Opportunità", "singular": "Opportunità"}, "project": {"plural": "Progetti", "singular": "Progetto"}}, "organization": {"account": {"plural": "Account", "singular": "Account"}, "company": {"plural": "Aziende", "singular": "Azienda"}, "organization": {"plural": "Organizzazioni", "singular": "Organizzazione"}}, "service": {"offering": {"plural": "Offerte", "singular": "Offerta"}, "package": {"plural": "Pacchetti", "singular": "Pacchetto"}, "product": {"plural": "Prodotti", "singular": "Prodotto"}, "service": {"plural": "Servizi", "singular": "Servizio"}}, "task": {"actionItem": {"plural": "Azioni", "singular": "Azione"}, "followUp": {"plural": "Follow-up", "singular": "Follow-up"}, "task": {"plural": "Attività", "singular": "Attività"}, "todo": {"plural": "Cose da fare", "singular": "Cosa da fare"}}}}'::jsonb;
  v_workspace record;
  v_entry record;
  v_messages jsonb;
  v_snapshot jsonb;
  v_type_index integer;
  v_type jsonb;
  v_labels jsonb;
  v_changed boolean;
BEGIN
  FOR v_workspace IN SELECT w.company_id, w.presentation_model FROM crm_upgrade_workspace w
    WHERE EXISTS (SELECT 1 FROM "EntityTerminology" t WHERE t."companyId" = w.company_id) ORDER BY w.company_id LOOP
    v_messages := COALESCE(v_catalog -> (SELECT u."displayLanguage"::text FROM "User" u WHERE u."companyId" = v_workspace.company_id ORDER BY u."createdAt", u.id LIMIT 1), v_catalog -> 'en');
    v_snapshot := v_workspace.presentation_model;
    v_changed := false;
    FOR v_entry IN SELECT t.id, t."entityType"::text AS entity_type, t."presetKey" AS preset_key FROM "EntityTerminology" t WHERE t."companyId" = v_workspace.company_id ORDER BY t.id LOOP
      v_labels := v_messages #> ARRAY[v_entry.entity_type, v_entry.preset_key];
      SELECT t.ordinality - 1, t.value INTO v_type_index, v_type FROM jsonb_array_elements(v_snapshot -> 'types') WITH ORDINALITY AS t(value, ordinality)
        WHERE t.value ->> 'id' = crm_upgrade.preset_id(v_workspace.company_id, v_entry.entity_type);
      IF NOT ((v_type ->> 'label' = v_catalog #>> ARRAY['en', v_entry.entity_type, v_entry.entity_type, 'singular'] AND v_type ->> 'pluralLabel' = v_catalog #>> ARRAY['en', v_entry.entity_type, v_entry.entity_type, 'plural'])
        OR (v_type ->> 'label' = v_messages #>> ARRAY[v_entry.entity_type, v_entry.entity_type, 'singular'] AND v_type ->> 'pluralLabel' = v_messages #>> ARRAY[v_entry.entity_type, v_entry.entity_type, 'plural'])) THEN
        CONTINUE;
      END IF;
      IF v_type ->> 'label' = v_labels ->> 'singular' AND v_type ->> 'pluralLabel' = v_labels ->> 'plural' THEN CONTINUE; END IF;
      v_type := v_type || jsonb_build_object('label', v_labels -> 'singular', 'pluralLabel', v_labels -> 'plural');
      v_snapshot := jsonb_set(v_snapshot, ARRAY['types', v_type_index::text], v_type);
      UPDATE "RecordTypeDefinition" SET label = v_type ->> 'label', "pluralLabel" = v_type ->> 'pluralLabel', definition = v_type, "updatedAt" = now()
        WHERE "companyId" = v_workspace.company_id AND id = v_type ->> 'id';
      v_changed := true;
    END LOOP;
    IF v_changed THEN
      INSERT INTO crm_upgrade_revision (company_id, revision, actor_id, snapshot)
      VALUES (v_workspace.company_id, 4, 'migration:legacy-terminology', v_snapshot || '{"revision":4}'::jsonb);
    END IF;
  END LOOP;
END
$terminology$;

-- Shared channels: the person identity binding becomes an enabled Channels capability with provider
-- avatars, appended as the next revision (earlier snapshots stay as written).
INSERT INTO crm_upgrade_revision (company_id, revision, actor_id, snapshot)
SELECT latest.company_id, latest.revision + 1, 'system:shared-channel-migration',
  jsonb_set(jsonb_set(latest.snapshot, '{capabilities}',
    (SELECT COALESCE(jsonb_agg(CASE WHEN binding ->> 'kind' = 'personIdentity' THEN binding || '{"kind":"channels","enabled":true,"providerAvatar":true}'::jsonb ELSE binding END ORDER BY ordinal), '[]'::jsonb)
     FROM jsonb_array_elements(COALESCE(latest.snapshot -> 'capabilities', '[]'::jsonb)) WITH ORDINALITY AS capability(binding, ordinal))),
    '{revision}', to_jsonb(latest.revision + 1))
FROM (SELECT DISTINCT ON (company_id) company_id, revision, snapshot FROM crm_upgrade_revision ORDER BY company_id, revision DESC) AS latest
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(latest.snapshot -> 'capabilities', '[]'::jsonb)) AS binding(value) WHERE binding.value ->> 'kind' = 'personIdentity');

INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot, "createdAt")
SELECT company_id, revision, actor_id, snapshot, now() FROM crm_upgrade_revision;

INSERT INTO "RecordSchemaState" ("companyId", revision, "activeOperationId", "storageMode")
SELECT company_id, max(revision), NULL, 'generic' FROM crm_upgrade_revision GROUP BY company_id;

-- Role permissions on the legacy resources become per-type grants (action order normalised).
INSERT INTO "RecordTypeGrant" ("companyId", "typeId", "roleId", actions)
SELECT p."companyId", crm_upgrade.preset_id(p."companyId", k.kind), p."roleId", array_agg(p.action ORDER BY p.action)
FROM "RolePermission" p JOIN (VALUES ('contacts', 'contact'), ('organizations', 'organization'), ('deals', 'deal'), ('services', 'service'), ('tasks', 'task')) AS k(resource, kind)
  ON p.resource::text = k.resource
GROUP BY p."companyId", k.kind, p."roleId";

-- Presentation rows (v4/v5): only columns whose JavaScript value changed are written, as the retired
-- upgrade did; text[] columns of P13n are written as arrays.
CREATE FUNCTION crm_upgrade.changed(original jsonb, target jsonb, key text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT crm_upgrade.js_json(original -> key) IS DISTINCT FROM (target -> key) $$;
CREATE FUNCTION crm_upgrade.text_array(value jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN value IS NULL OR value = 'null'::jsonb THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(value)) END $$;

UPDATE "DataView" view SET
  filters = CASE WHEN crm_upgrade.changed(p.original, p.target, 'filters') THEN p.target -> 'filters' ELSE view.filters END,
  "sortDescriptor" = CASE WHEN crm_upgrade.changed(p.original, p.target, 'sortDescriptor') THEN NULLIF(p.target -> 'sortDescriptor', 'null') ELSE view."sortDescriptor" END,
  grouping = CASE WHEN crm_upgrade.changed(p.original, p.target, 'grouping') THEN NULLIF(p.target -> 'grouping', 'null') ELSE view.grouping END,
  "columnOrder" = CASE WHEN crm_upgrade.changed(p.original, p.target, 'columnOrder') THEN p.target -> 'columnOrder' ELSE view."columnOrder" END,
  "columnWidths" = CASE WHEN crm_upgrade.changed(p.original, p.target, 'columnWidths') THEN p.target -> 'columnWidths' ELSE view."columnWidths" END,
  "hiddenColumns" = CASE WHEN crm_upgrade.changed(p.original, p.target, 'hiddenColumns') THEN p.target -> 'hiddenColumns' ELSE view."hiddenColumns" END,
  "surfaceKey" = p.target ->> 'surfaceKey',
  "groupingColumnId" = p.target ->> 'groupingColumnId',
  "pageSize" = (p.target ->> 'pageSize')::integer
FROM crm_upgrade_presentation p WHERE p.source_table = 'DataView' AND view.id = p.row_id;

UPDATE "P13n" preference SET
  "viewStateKeys" = CASE WHEN p.target ? 'viewStateKeys' THEN p.target -> 'viewStateKeys' ELSE preference."viewStateKeys" END,
  filters = CASE WHEN crm_upgrade.changed(p.original, p.target, 'filters') THEN p.target -> 'filters' ELSE preference.filters END,
  "sortDescriptor" = CASE WHEN crm_upgrade.changed(p.original, p.target, 'sortDescriptor') THEN NULLIF(p.target -> 'sortDescriptor', 'null') ELSE preference."sortDescriptor" END,
  "columnWidths" = CASE WHEN crm_upgrade.changed(p.original, p.target, 'columnWidths') THEN p.target -> 'columnWidths' ELSE preference."columnWidths" END,
  grouping = CASE WHEN crm_upgrade.changed(p.original, p.target, 'grouping') THEN NULLIF(p.target -> 'grouping', 'null') ELSE preference.grouping END,
  "detailOptions" = CASE WHEN crm_upgrade.changed(p.original, p.target, 'detailOptions') THEN p.target -> 'detailOptions' ELSE preference."detailOptions" END,
  pagination = CASE WHEN crm_upgrade.changed(p.original, p.target, 'pagination') THEN p.target -> 'pagination' ELSE preference.pagination END,
  "p13nId" = p.target ->> 'p13nId',
  "columnOrder" = crm_upgrade.text_array(p.target -> 'columnOrder'),
  "hiddenColumns" = crm_upgrade.text_array(p.target -> 'hiddenColumns'),
  "groupingColumnId" = p.target ->> 'groupingColumnId',
  "activeViewKey" = p.target ->> 'activeViewKey'
FROM crm_upgrade_presentation p WHERE p.source_table = 'P13n' AND preference.id = p.row_id;

UPDATE "Widget" widget SET
  measure = CASE WHEN p.target ? 'measure' THEN p.target -> 'measure' ELSE widget.measure END,
  "activityQuery" = CASE WHEN p.target ? 'activityQuery' THEN p.target -> 'activityQuery' ELSE widget."activityQuery" END,
  "displayOptions" = CASE WHEN crm_upgrade.changed(p.original, p.target, 'displayOptions') THEN p.target -> 'displayOptions' ELSE widget."displayOptions" END
FROM crm_upgrade_presentation p WHERE p.source_table = 'Widget' AND widget.id = p.row_id;

-- Timeline views (v8): legacy record filter keys become records:<typeId>.
UPDATE "DataView" view SET filters = t.filters FROM crm_upgrade_timeline t WHERE t.source_table = 'DataView' AND view.id = t.row_id;
UPDATE "P13n" preference SET filters = t.filters FROM crm_upgrade_timeline t WHERE t.source_table = 'P13n' AND preference.id = t.row_id;

-- Triggers (v6): legacy record events become generic record events with one subscription per routine or
-- webhook. Converted routines no longer keep legacy watched-field names or legacy filters: they live,
-- as field IDs and generic filters, in the subscription sources (intentional change, see README).
UPDATE "Webhook" webhook SET events = ARRAY(SELECT jsonb_array_elements_text(t.result -> 'targetEvents')), enabled = (t.result ->> 'enabled')::boolean
FROM crm_upgrade_trigger t WHERE t.source_table = 'Webhook' AND webhook.id = t.row_id;
UPDATE "Routine" routine SET "triggerEvents" = ARRAY(SELECT jsonb_array_elements_text(t.result -> 'targetEvents')),
  "changedFields" = ARRAY[]::text[], "triggerFilters" = '[]'::jsonb
FROM crm_upgrade_trigger t WHERE t.source_table = 'Routine' AND routine.id = t.row_id;
INSERT INTO "RecordEventSubscription" ("companyId", id, kind, "ownerUserId", "typeId", events, "changedFieldIds", query, sources, revision, enabled)
SELECT t.company_id, t.row_id, t.result #>> '{subscription,kind}', t.result #>> '{subscription,ownerUserId}', NULL,
  ARRAY(SELECT jsonb_array_elements_text(t.result #> '{subscription,events}')), ARRAY[]::text[], NULL, t.result #> '{subscription,sources}', 1,
  (t.result #>> '{subscription,enabled}')::boolean
FROM crm_upgrade_trigger t WHERE t.result -> 'subscription' <> 'null'::jsonb;

-- =============================================================================================
-- Section 4b: secondary indexes of the generic storage, built once after the bulk conversion (as a
-- restore does) and before the calculations and reconciliation that read through them.
-- =============================================================================================

CREATE INDEX "RecordTypeDefinition_companyId_archived_position_idx" ON "RecordTypeDefinition"("companyId", "archived", "position");
CREATE UNIQUE INDEX "RecordTypeDefinition_companyId_presetKey_key" ON "RecordTypeDefinition"("companyId", "presetKey");
CREATE INDEX "RecordFieldDefinition_companyId_typeId_archived_idx" ON "RecordFieldDefinition"("companyId", "typeId", "archived");
CREATE UNIQUE INDEX "RecordFieldDefinition_companyId_typeId_id_key" ON "RecordFieldDefinition"("companyId", "typeId", "id");
CREATE INDEX "RecordRelationshipDefinition_companyId_sourceTypeId_idx" ON "RecordRelationshipDefinition"("companyId", "sourceTypeId");
CREATE INDEX "RecordRelationshipDefinition_companyId_targetTypeId_idx" ON "RecordRelationshipDefinition"("companyId", "targetTypeId");
CREATE UNIQUE INDEX "RecordRelationshipDefinition_companyId_id_sourceTypeId_targ_key" ON "RecordRelationshipDefinition"("companyId", "id", "sourceTypeId", "targetTypeId");
CREATE INDEX "CrmRecord_companyId_typeId_createdAt_id_idx" ON "CrmRecord"("companyId", "typeId", "createdAt", "id");
CREATE INDEX "CrmRecord_companyId_typeId_updatedAt_id_idx" ON "CrmRecord"("companyId", "typeId", "updatedAt", "id");
CREATE INDEX "RecordValue_companyId_typeId_fieldId_recordId_idx" ON "RecordValue"("companyId", "typeId", "fieldId", "recordId");
CREATE INDEX "RecordValue_textValue_idx" ON "RecordValue" USING GIN ("textValue" gin_trgm_ops);
CREATE INDEX "RecordValue_textListValue_idx" ON "RecordValue" USING GIN ("textListValue");
CREATE INDEX "RecordValue_companyId_typeId_fieldId_decimalValue_recordId_idx" ON "RecordValue"("companyId", "typeId", "fieldId", "decimalValue", "recordId");
CREATE INDEX "RecordValue_companyId_typeId_fieldId_instantValue_recordId_idx" ON "RecordValue"("companyId", "typeId", "fieldId", "instantValue", "recordId");
CREATE INDEX "RecordValue_companyId_typeId_fieldId_booleanValue_recordId_idx" ON "RecordValue"("companyId", "typeId", "fieldId", "booleanValue", "recordId");
CREATE INDEX "RecordValue_companyId_typeId_fieldId_rangeStart_recordId_idx" ON "RecordValue" ("companyId", "typeId", "fieldId", "rangeStart", "recordId");
CREATE INDEX "RecordValue_companyId_typeId_fieldId_rangeEnd_recordId_idx" ON "RecordValue" ("companyId", "typeId", "fieldId", "rangeEnd", "recordId");
CREATE INDEX "RecordValueDependency_companyId_sourceTypeId_sourceId_idx" ON "RecordValueDependency"("companyId", "sourceTypeId", "sourceId");
CREATE INDEX "RecordLink_companyId_sourceTypeId_sourceId_relationId_idx" ON "RecordLink"("companyId", "sourceTypeId", "sourceId", "relationId");
CREATE INDEX "RecordLink_companyId_targetTypeId_targetId_relationId_idx" ON "RecordLink"("companyId", "targetTypeId", "targetId", "relationId");
CREATE UNIQUE INDEX "RecordLink_companyId_relationId_sourceId_targetId_key" ON "RecordLink"("companyId", "relationId", "sourceId", "targetId");
CREATE INDEX "RecordAssignment_companyId_userId_typeId_recordId_idx" ON "RecordAssignment"("companyId", "userId", "typeId", "recordId");
CREATE INDEX "RecordTypeGrant_companyId_roleId_idx" ON "RecordTypeGrant"("companyId", "roleId");
CREATE INDEX "RecordOperation_companyId_state_createdAt_idx" ON "RecordOperation"("companyId", "state", "createdAt");
CREATE INDEX "RecordOperation_state_leaseUntil_idx" ON "RecordOperation"("state", "leaseUntil");
CREATE INDEX "RecordEvent_companyId_typeId_recordId_createdAt_idx" ON "RecordEvent"("companyId", "typeId", "recordId", "createdAt");
CREATE INDEX "RecordEvent_deliveredAt_nextAttemptAt_idx" ON "RecordEvent"("deliveredAt", "nextAttemptAt");
CREATE UNIQUE INDEX "RecordIdentity_companyId_id_channelClass_key" ON "RecordIdentity"("companyId", "id", "channelClass");
CREATE INDEX "RecordIdentityKey_companyId_identityId_channelClass_idx" ON "RecordIdentityKey"("companyId", "identityId", "channelClass");
CREATE INDEX "RecordIdentityLink_companyId_typeId_recordId_idx" ON "RecordIdentityLink"("companyId", "typeId", "recordId");
CREATE INDEX "MessagingThreadRecordLink_companyId_typeId_recordId_threadI_idx" ON "MessagingThreadRecordLink"("companyId", "typeId", "recordId", "threadId");
CREATE INDEX "RecordEventSubscription_companyId_enabled_typeId_idx" ON "RecordEventSubscription"("companyId", "enabled", "typeId");
CREATE INDEX "RecordEventSubscription_companyId_ownerUserId_idx" ON "RecordEventSubscription"("companyId", "ownerUserId");
CREATE INDEX "RecordEventMatch_companyId_subscriptionId_idx" ON "RecordEventMatch"("companyId", "subscriptionId");

ANALYZE "RecordTypeDefinition", "RecordFieldDefinition", "RecordRelationshipDefinition", "CrmRecord", "RecordValue", "RecordValueDependency",
  "RecordLink", "RecordAssignment", "RecordTypeGrant", "RecordSchemaRevision", "RecordIdentity", "RecordIdentityKey", "RecordIdentityLink",
  "RecordEventSubscription";

-- =============================================================================================
-- Section 5: CALCULATIONS. The preset's calculated fields are materialised with exact decimals, exactly
-- as the record engine evaluates them (v2/materialize.ts, v2/contract/calculation.ts):
--   contact.name          trim(firstName + " " + lastName)         (JavaScript whitespace trimming)
--   lineItem.effectivePrice  live price = the linked service's amount (every migrated line item is live)
--   lineItem.amount       quantity x unit price
--   deal.totalValue       sum of line amounts (0 in the workspace currency without lines)
--   deal.totalQuantity    sum of line quantities (0 without lines)
--   deal.weightedValue    totalValue x probability / 100 of the weighting stage option; missing without a
--                         weighting column, a stage value or a probability (0 stays 0)
-- A result outside |x| < 1e35 or with more than 30 decimals is an evaluation error, which the retired
-- upgrade refused; so does this one. Provenance rows record the records each value depends on.
-- =============================================================================================

CREATE TEMP TABLE crm_upgrade_calculated (
  company_id text NOT NULL, type_id text NOT NULL, record_id text NOT NULL, field_id text NOT NULL,
  scalar jsonb, created_at timestamp(3) NOT NULL, updated_at timestamp(3) NOT NULL, failed boolean NOT NULL DEFAULT false
) ON COMMIT DROP;

-- contact.name
INSERT INTO crm_upgrade_calculated (company_id, type_id, record_id, field_id, scalar, created_at, updated_at)
SELECT r."companyId", r."typeId", r.id, crm_upgrade.preset_id(r."companyId", 'contact.name'),
  crm_upgrade.scalar_text(crm_upgrade.js_trim(COALESCE(first."textValue", '') || ' ' || COALESCE(last."textValue", ''))), r."createdAt", r."updatedAt"
FROM "CrmRecord" r
LEFT JOIN "RecordValue" first ON first."companyId" = r."companyId" AND first."typeId" = r."typeId" AND first."recordId" = r.id AND first."fieldId" = crm_upgrade.preset_id(r."companyId", 'contact.firstName') AND first.state = 'value'
LEFT JOIN "RecordValue" last ON last."companyId" = r."companyId" AND last."typeId" = r."typeId" AND last."recordId" = r.id AND last."fieldId" = crm_upgrade.preset_id(r."companyId", 'contact.lastName') AND last.state = 'value'
WHERE r."typeId" = crm_upgrade.preset_id(r."companyId", 'contact');

-- Line items: unit price (the single linked service's amount) and amount = quantity x unit price.
CREATE TEMP TABLE crm_upgrade_line (
  company_id text NOT NULL, line_id text NOT NULL, deal_id text, service_id text, quantity numeric, price numeric, currency text,
  amount numeric, created_at timestamp(3) NOT NULL, updated_at timestamp(3) NOT NULL
) ON COMMIT DROP;
INSERT INTO crm_upgrade_line (company_id, line_id, deal_id, service_id, quantity, price, currency, amount, created_at, updated_at)
SELECT r."companyId", r.id, deal_link."targetId", service_link."targetId", quantity."decimalValue", price."decimalValue", price.currency,
  quantity."decimalValue" * price."decimalValue", r."createdAt", r."updatedAt"
FROM "CrmRecord" r
LEFT JOIN "RecordLink" service_link ON service_link."companyId" = r."companyId" AND service_link."relationId" = crm_upgrade.preset_id(r."companyId", 'lineItem.service')
  AND service_link."sourceTypeId" = r."typeId" AND service_link."sourceId" = r.id
LEFT JOIN "RecordLink" deal_link ON deal_link."companyId" = r."companyId" AND deal_link."relationId" = crm_upgrade.preset_id(r."companyId", 'lineItem.deal')
  AND deal_link."sourceTypeId" = r."typeId" AND deal_link."sourceId" = r.id
LEFT JOIN "RecordValue" price ON price."companyId" = r."companyId" AND price."typeId" = crm_upgrade.preset_id(r."companyId", 'service') AND price."recordId" = service_link."targetId"
  AND price."fieldId" = crm_upgrade.preset_id(r."companyId", 'service.amount') AND price.state = 'value'
LEFT JOIN "RecordValue" quantity ON quantity."companyId" = r."companyId" AND quantity."typeId" = r."typeId" AND quantity."recordId" = r.id
  AND quantity."fieldId" = crm_upgrade.preset_id(r."companyId", 'lineItem.quantity') AND quantity.state = 'value'
WHERE r."typeId" = crm_upgrade.preset_id(r."companyId", 'lineItem');


INSERT INTO crm_upgrade_calculated (company_id, type_id, record_id, field_id, scalar, created_at, updated_at, failed)
SELECT l.company_id, crm_upgrade.preset_id(l.company_id, 'lineItem'), l.line_id, crm_upgrade.preset_id(l.company_id, 'lineItem.effectivePrice'),
  CASE WHEN l.price IS NOT NULL THEN crm_upgrade.scalar_decimal(crm_upgrade.decimal_text(l.price), l.currency) END, l.created_at, l.updated_at, false
FROM crm_upgrade_line l
UNION ALL
SELECT l.company_id, crm_upgrade.preset_id(l.company_id, 'lineItem'), l.line_id, crm_upgrade.preset_id(l.company_id, 'lineItem.amount'),
  CASE WHEN l.amount IS NOT NULL AND crm_upgrade.is_representable(l.amount) THEN crm_upgrade.scalar_decimal(crm_upgrade.decimal_text(l.amount), l.currency) END,
  l.created_at, l.updated_at, l.amount IS NOT NULL AND NOT crm_upgrade.is_representable(l.amount)
FROM crm_upgrade_line l;

-- Deals: rollups over their line items and the weighted value.
CREATE TEMP TABLE crm_upgrade_deal (
  company_id text NOT NULL, deal_id text NOT NULL, total numeric, total_currency text, quantity numeric, product numeric, weighted numeric,
  probability_missing boolean NOT NULL, created_at timestamp(3) NOT NULL, updated_at timestamp(3) NOT NULL
) ON COMMIT DROP;
INSERT INTO crm_upgrade_deal (company_id, deal_id, total, total_currency, quantity, product, weighted, probability_missing, created_at, updated_at)
SELECT d.company_id, d.deal_id, d.total, d.total_currency, d.quantity, d.total * probability.value, d.total * probability.value * 0.01,
  probability.value IS NULL, d.created_at, d.updated_at
FROM (
  SELECT r."companyId" AS company_id, r.id AS deal_id, COALESCE(sum(l.amount), 0) AS total,
    COALESCE(min(l.currency), w.currency) AS total_currency, COALESCE(sum(l.quantity), 0) AS quantity, r."createdAt" AS created_at, r."updatedAt" AS updated_at
  FROM "CrmRecord" r
  JOIN crm_upgrade_workspace w ON w.company_id = r."companyId"
  LEFT JOIN crm_upgrade_line l ON l.company_id = r."companyId" AND l.deal_id = r.id
  WHERE r."typeId" = crm_upgrade.preset_id(r."companyId", 'deal')
  GROUP BY r."companyId", r.id, r."createdAt", r."updatedAt", w.currency
) AS d
JOIN crm_upgrade_workspace w ON w.company_id = d.company_id
LEFT JOIN LATERAL (
  -- The weighted value formula reads the probability attribute of the selected stage option.
  SELECT (option.value #>> '{attributes,0,value,value}')::numeric AS value
  FROM jsonb_array_elements(w.model -> 'fields') AS formula(value)
  JOIN jsonb_array_elements(w.model -> 'fields') AS stage(value) ON stage.value ->> 'id' = formula.value #>> '{behavior,expression,arguments,0,arguments,1,fieldId}'
  JOIN "RecordValue" selected ON selected."companyId" = d.company_id AND selected."typeId" = crm_upgrade.preset_id(d.company_id, 'deal') AND selected."recordId" = d.deal_id
    AND selected."fieldId" = stage.value ->> 'id' AND selected.state = 'value'
  JOIN jsonb_array_elements(stage.value -> 'options') AS option(value) ON option.value ->> 'id' = selected."textValue"
  WHERE formula.value ->> 'id' = crm_upgrade.preset_id(d.company_id, 'deal.weightedValue')
    AND jsonb_array_length(option.value -> 'attributes') > 0
) AS probability ON true;

INSERT INTO crm_upgrade_calculated (company_id, type_id, record_id, field_id, scalar, created_at, updated_at, failed)
SELECT d.company_id, crm_upgrade.preset_id(d.company_id, 'deal'), d.deal_id, crm_upgrade.preset_id(d.company_id, 'deal.totalValue'),
  CASE WHEN crm_upgrade.is_representable(d.total) THEN crm_upgrade.scalar_decimal(crm_upgrade.decimal_text(d.total), d.total_currency) END,
  d.created_at, d.updated_at, NOT crm_upgrade.is_representable(d.total)
FROM crm_upgrade_deal d
UNION ALL
SELECT d.company_id, crm_upgrade.preset_id(d.company_id, 'deal'), d.deal_id, crm_upgrade.preset_id(d.company_id, 'deal.totalQuantity'),
  CASE WHEN crm_upgrade.is_representable(d.quantity) THEN crm_upgrade.scalar_decimal(crm_upgrade.decimal_text(d.quantity), NULL) END,
  d.created_at, d.updated_at, NOT crm_upgrade.is_representable(d.quantity)
FROM crm_upgrade_deal d
UNION ALL
SELECT d.company_id, crm_upgrade.preset_id(d.company_id, 'deal'), d.deal_id, crm_upgrade.preset_id(d.company_id, 'deal.weightedValue'),
  CASE WHEN NOT d.probability_missing AND crm_upgrade.is_representable(d.product) AND crm_upgrade.is_representable(d.weighted)
    THEN crm_upgrade.scalar_decimal(crm_upgrade.decimal_text(d.weighted), d.total_currency) END,
  d.created_at, d.updated_at,
  NOT d.probability_missing AND NOT (crm_upgrade.is_representable(d.total) AND crm_upgrade.is_representable(d.product) AND crm_upgrade.is_representable(d.weighted))
FROM crm_upgrade_deal d;

DO $$
DECLARE
  v_failures bigint;
BEGIN
  SELECT count(*) INTO v_failures FROM crm_upgrade_calculated WHERE failed;
  IF v_failures > 0 THEN
    RAISE EXCEPTION 'Configurable record upgrade refused: % calculated values are out of range (|x| >= 1e35 or more than 30 decimals)', v_failures
      USING HINT = 'Nothing was changed. Correct the legacy prices or quantities, run prisma migrate resolve --rolled-back 20261004000000_configurable_records, then prisma migrate deploy.';
  END IF;
END
$$;

DO $insert$ BEGIN PERFORM crm_upgrade.insert_values($staged$
  SELECT company_id, type_id, record_id, field_id, scalar, created_at, updated_at FROM crm_upgrade_calculated
$staged$); END $insert$;


-- Provenance: unit price and amount depend on the line's service; value rollups on each line and its
-- service; quantity rollups on each line.
INSERT INTO "RecordValueDependency" ("companyId", "typeId", "recordId", "fieldId", "sourceTypeId", "sourceId")
SELECT DISTINCT dependency.* FROM (
  SELECT l.company_id, crm_upgrade.preset_id(l.company_id, 'lineItem'), l.line_id, crm_upgrade.preset_id(l.company_id, field.key), crm_upgrade.preset_id(l.company_id, 'service'), l.service_id
    FROM crm_upgrade_line l CROSS JOIN (VALUES ('lineItem.effectivePrice'), ('lineItem.amount')) AS field(key) WHERE l.service_id IS NOT NULL
  UNION ALL
  SELECT l.company_id, crm_upgrade.preset_id(l.company_id, 'deal'), l.deal_id, crm_upgrade.preset_id(l.company_id, 'deal.totalValue'), crm_upgrade.preset_id(l.company_id, 'lineItem'), l.line_id
    FROM crm_upgrade_line l WHERE l.deal_id IS NOT NULL
  UNION ALL
  SELECT l.company_id, crm_upgrade.preset_id(l.company_id, 'deal'), l.deal_id, crm_upgrade.preset_id(l.company_id, 'deal.totalValue'), crm_upgrade.preset_id(l.company_id, 'service'), l.service_id
    FROM crm_upgrade_line l WHERE l.deal_id IS NOT NULL AND l.service_id IS NOT NULL
  UNION ALL
  SELECT l.company_id, crm_upgrade.preset_id(l.company_id, 'deal'), l.deal_id, crm_upgrade.preset_id(l.company_id, 'deal.totalQuantity'), crm_upgrade.preset_id(l.company_id, 'lineItem'), l.line_id
    FROM crm_upgrade_line l WHERE l.deal_id IS NOT NULL
) AS dependency;


-- =============================================================================================
-- Section 5b: foreign keys of the generic storage, added after the bulk conversion. Adding a foreign
-- key validates every converted row, so integrity is checked exactly as if it had existed throughout.
-- =============================================================================================

ALTER TABLE "RecordSchemaState" ADD CONSTRAINT "RecordSchemaState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordTypeDefinition" ADD CONSTRAINT "RecordTypeDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordFieldDefinition" ADD CONSTRAINT "RecordFieldDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordFieldDefinition" ADD CONSTRAINT "RecordFieldDefinition_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordRelationshipDefinition" ADD CONSTRAINT "RecordRelationshipDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordRelationshipDefinition" ADD CONSTRAINT "RecordRelationshipDefinition_companyId_sourceTypeId_fkey" FOREIGN KEY ("companyId", "sourceTypeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordRelationshipDefinition" ADD CONSTRAINT "RecordRelationshipDefinition_companyId_targetTypeId_fkey" FOREIGN KEY ("companyId", "targetTypeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmRecord" ADD CONSTRAINT "CrmRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmRecord" ADD CONSTRAINT "CrmRecord_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_companyId_typeId_fieldId_fkey" FOREIGN KEY ("companyId", "typeId", "fieldId") REFERENCES "RecordFieldDefinition"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordValueDependency" ADD CONSTRAINT "RecordValueDependency_companyId_typeId_recordId_fieldId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId", "fieldId") REFERENCES "RecordValue"("companyId", "typeId", "recordId", "fieldId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_companyId_relationId_sourceTypeId_targetTypeId_fkey" FOREIGN KEY ("companyId", "relationId", "sourceTypeId", "targetTypeId") REFERENCES "RecordRelationshipDefinition"("companyId", "id", "sourceTypeId", "targetTypeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_companyId_sourceTypeId_sourceId_fkey" FOREIGN KEY ("companyId", "sourceTypeId", "sourceId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordLink" ADD CONSTRAINT "RecordLink_companyId_targetTypeId_targetId_fkey" FOREIGN KEY ("companyId", "targetTypeId", "targetId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssignment" ADD CONSTRAINT "RecordAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssignment" ADD CONSTRAINT "RecordAssignment_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssignment" ADD CONSTRAINT "RecordAssignment_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordTypeGrant" ADD CONSTRAINT "RecordTypeGrant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordTypeGrant" ADD CONSTRAINT "RecordTypeGrant_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordTypeGrant" ADD CONSTRAINT "RecordTypeGrant_companyId_roleId_fkey" FOREIGN KEY ("companyId", "roleId") REFERENCES "UserRole"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordSchemaRevision" ADD CONSTRAINT "RecordSchemaRevision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordOperation" ADD CONSTRAINT "RecordOperation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordStageRow" ADD CONSTRAINT "RecordStageRow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordStageRow" ADD CONSTRAINT "RecordStageRow_companyId_operationId_fkey" FOREIGN KEY ("companyId", "operationId") REFERENCES "RecordOperation"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordMutationReceipt" ADD CONSTRAINT "RecordMutationReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordEvent" ADD CONSTRAINT "RecordEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordIdentity" ADD CONSTRAINT "RecordIdentity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordIdentityKey" ADD CONSTRAINT "RecordIdentityKey_companyId_identityId_channelClass_fkey" FOREIGN KEY ("companyId", "identityId", "channelClass") REFERENCES "RecordIdentity"("companyId", "id", "channelClass") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordIdentityLink" ADD CONSTRAINT "RecordIdentityLink_companyId_identityId_fkey" FOREIGN KEY ("companyId", "identityId") REFERENCES "RecordIdentity"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordIdentityLink" ADD CONSTRAINT "RecordIdentityLink_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingThreadRecordLink" ADD CONSTRAINT "MessagingThreadRecordLink_companyId_threadId_fkey" FOREIGN KEY ("companyId", "threadId") REFERENCES "MessagingThread"("companyId", id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingThreadRecordLink" ADD CONSTRAINT "MessagingThreadRecordLink_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordEventSubscription" ADD CONSTRAINT "RecordEventSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordEventSubscription" ADD CONSTRAINT "RecordEventSubscription_companyId_ownerUserId_fkey" FOREIGN KEY ("companyId", "ownerUserId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordEventSubscription" ADD CONSTRAINT "RecordEventSubscription_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecordEventMatch" ADD CONSTRAINT "RecordEventMatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordEventMatch" ADD CONSTRAINT "RecordEventMatch_companyId_eventId_fkey" FOREIGN KEY ("companyId", "eventId") REFERENCES "RecordEvent"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordEventMatch" ADD CONSTRAINT "RecordEventMatch_companyId_subscriptionId_fkey" FOREIGN KEY ("companyId", "subscriptionId") REFERENCES "RecordEventSubscription"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================================
-- Section 6: RECONCILIATION. Independent comparisons of the generic data with the legacy source (the
-- checks of v2/reconcile.ts, the identity and provenance reconciliations, and the repairs). Any mismatch
-- aborts the transaction; the legacy data is then untouched.
-- =============================================================================================

CREATE TEMP TABLE crm_upgrade_mismatch (check_name text NOT NULL, total bigint NOT NULL) ON COMMIT DROP;

-- Records: identity, timestamps and protected state per legacy type.
INSERT INTO crm_upgrade_mismatch
SELECT 'records:' || legacy.kind, count(*) FROM (
  SELECT 'contact' AS kind, "companyId", id, "createdAt", "updatedAt" FROM "Contact"
  UNION ALL SELECT 'organization', "companyId", id, "createdAt", "updatedAt" FROM "Organization"
  UNION ALL SELECT 'deal', "companyId", id, "createdAt", "updatedAt" FROM "Deal"
  UNION ALL SELECT 'service', "companyId", id, "createdAt", "updatedAt" FROM "Service"
  UNION ALL SELECT 'task', "companyId", id, "createdAt", "updatedAt" FROM "Task"
  UNION ALL SELECT 'lineItem', "companyId", id, "createdAt", "updatedAt" FROM "ServiceDeal"
) AS legacy
FULL JOIN "CrmRecord" record ON record."companyId" = legacy."companyId" AND record."typeId" = crm_upgrade.preset_id(legacy."companyId", legacy.kind) AND record.id = legacy.id
WHERE legacy.id IS NULL OR record.id IS NULL OR legacy."createdAt" <> record."createdAt" OR legacy."updatedAt" <> record."updatedAt"
GROUP BY legacy.kind;

INSERT INTO crm_upgrade_mismatch
SELECT 'records:protected_state', count(*) FROM "CrmRecord" record
LEFT JOIN "Task" task ON task."companyId" = record."companyId" AND task.id = record.id AND record."typeId" = crm_upgrade.preset_id(record."companyId", 'task')
WHERE (task.id IS NOT NULL AND (CASE WHEN task.type = 'userPendingAuthorization' THEN 'membershipAuthorization' END IS DISTINCT FROM record."protectedKind"
    OR jsonb_build_object('relatedUserId', task."relatedUserId") IS DISTINCT FROM record."systemData"))
  OR (task.id IS NULL AND (record."protectedKind" IS NOT NULL OR record."systemData" IS NOT NULL))
HAVING count(*) > 0;

-- Assignments.
INSERT INTO crm_upgrade_mismatch
SELECT 'assignments', count(*) FROM (
  SELECT 'contact' AS kind, "companyId", "contactId" AS record_id, "userId", "createdAt" FROM "ContactUser"
  UNION ALL SELECT 'organization', "companyId", "organizationId", "userId", "createdAt" FROM "OrganizationUser"
  UNION ALL SELECT 'deal', "companyId", "dealId", "userId", "createdAt" FROM "DealUser"
  UNION ALL SELECT 'service', "companyId", "serviceId", "userId", "createdAt" FROM "ServiceUser"
  UNION ALL SELECT 'task', "companyId", "taskId", "userId", "createdAt" FROM "TaskUser"
) AS legacy
FULL JOIN "RecordAssignment" assignment ON assignment."companyId" = legacy."companyId" AND assignment."typeId" = crm_upgrade.preset_id(legacy."companyId", legacy.kind)
  AND assignment."recordId" = legacy.record_id AND assignment."userId" = legacy."userId"
WHERE legacy.record_id IS NULL OR assignment."recordId" IS NULL OR legacy."createdAt" <> assignment."createdAt"
HAVING count(*) > 0;

-- Built-in texts, notes, prices, quantities and pricing modes.
INSERT INTO crm_upgrade_mismatch
SELECT 'values:' || expected.key, count(*) FROM (
  SELECT 'contact' AS kind, c."companyId", c.id, 'contact.firstName' AS key, c."firstName" AS text, NULL::jsonb AS json, false AS is_json FROM "Contact" c
  UNION ALL SELECT 'contact', c."companyId", c.id, 'contact.lastName', c."lastName", NULL, false FROM "Contact" c
  UNION ALL SELECT 'contact', c."companyId", c.id, 'contact.avatarUrl', c."avatarUrl", NULL, false FROM "Contact" c
  UNION ALL SELECT 'contact', c."companyId", c.id, 'contact.notes', NULL, NULLIF(c.notes, 'null'::jsonb), true FROM "Contact" c
  UNION ALL SELECT 'organization', r."companyId", r.id, 'organization.name', r.name, NULL, false FROM "Organization" r
  UNION ALL SELECT 'organization', r."companyId", r.id, 'organization.notes', NULL, NULLIF(r.notes, 'null'::jsonb), true FROM "Organization" r
  UNION ALL SELECT 'deal', r."companyId", r.id, 'deal.name', r.name, NULL, false FROM "Deal" r
  UNION ALL SELECT 'deal', r."companyId", r.id, 'deal.notes', NULL, NULLIF(r.notes, 'null'::jsonb), true FROM "Deal" r
  UNION ALL SELECT 'service', r."companyId", r.id, 'service.name', r.name, NULL, false FROM "Service" r
  UNION ALL SELECT 'service', r."companyId", r.id, 'service.notes', NULL, NULLIF(r.notes, 'null'::jsonb), true FROM "Service" r
  UNION ALL SELECT 'task', r."companyId", r.id, 'task.name', r.name, NULL, false FROM "Task" r
  UNION ALL SELECT 'task', r."companyId", r.id, 'task.notes', NULL, NULLIF(r.notes, 'null'::jsonb), true FROM "Task" r
) AS expected
LEFT JOIN "RecordValue" value ON value."companyId" = expected."companyId" AND value."typeId" = crm_upgrade.preset_id(expected."companyId", expected.kind)
  AND value."recordId" = expected.id AND value."fieldId" = crm_upgrade.preset_id(expected."companyId", expected.key)
WHERE value."recordId" IS NULL OR (expected.is_json AND expected.json IS DISTINCT FROM value."jsonValue") OR (NOT expected.is_json AND expected.text IS DISTINCT FROM value."textValue")
GROUP BY expected.key;

INSERT INTO crm_upgrade_mismatch
SELECT 'values:' || expected.key, count(*) FROM (
  SELECT 'service' AS kind, s."companyId", s.id, 'service.amount' AS key, s.amount::text::numeric AS amount, upper(c.currency::text) AS currency
    FROM "Service" s JOIN "Company" c ON c.id = s."companyId"
  UNION ALL SELECT 'lineItem', l."companyId", l.id, 'lineItem.quantity', l.quantity::text::numeric, NULL FROM "ServiceDeal" l
  UNION ALL SELECT 'lineItem', l."companyId", l.id, 'lineItem.effectivePrice', s.amount::text::numeric, upper(c.currency::text)
    FROM "ServiceDeal" l JOIN "Service" s ON s."companyId" = l."companyId" AND s.id = l."serviceId" JOIN "Company" c ON c.id = l."companyId"
  UNION ALL SELECT 'lineItem', l."companyId", l.id, 'lineItem.amount', l.quantity::text::numeric * s.amount::text::numeric, upper(c.currency::text)
    FROM "ServiceDeal" l JOIN "Service" s ON s."companyId" = l."companyId" AND s.id = l."serviceId" JOIN "Company" c ON c.id = l."companyId"
) AS expected
LEFT JOIN "RecordValue" value ON value."companyId" = expected."companyId" AND value."typeId" = crm_upgrade.preset_id(expected."companyId", expected.kind)
  AND value."recordId" = expected.id AND value."fieldId" = crm_upgrade.preset_id(expected."companyId", expected.key)
WHERE expected.amount IS DISTINCT FROM value."decimalValue" OR value.state IS DISTINCT FROM 'value' OR value.currency IS DISTINCT FROM expected.currency
GROUP BY expected.key;

INSERT INTO crm_upgrade_mismatch
SELECT 'values:lineItem.pricingMode', count(*) FROM "ServiceDeal" l
LEFT JOIN "RecordValue" value ON value."companyId" = l."companyId" AND value."typeId" = crm_upgrade.preset_id(l."companyId", 'lineItem') AND value."recordId" = l.id
  AND value."fieldId" = crm_upgrade.preset_id(l."companyId", 'lineItem.pricingMode')
WHERE value.state IS DISTINCT FROM 'value' OR value."textValue" IS DISTINCT FROM 'live'
HAVING count(*) > 0;

-- Links, including both line item links.
INSERT INTO crm_upgrade_mismatch
SELECT 'links:' || COALESCE(legacy.key, 'unexpected'), count(*) FROM (
  SELECT 'contact.organizations' AS key, "companyId", id, "contactId" AS source_id, "organizationId" AS target_id, "createdAt", "updatedAt" FROM "ContactOrganization"
  UNION ALL SELECT 'deal.contacts', "companyId", id, "dealId", "contactId", "createdAt", "updatedAt" FROM "DealContact"
  UNION ALL SELECT 'deal.organizations', "companyId", id, "dealId", "organizationId", "createdAt", "updatedAt" FROM "DealOrganization"
  UNION ALL SELECT 'task.contacts', "companyId", id, "taskId", "contactId", "createdAt", "updatedAt" FROM "TaskContact"
  UNION ALL SELECT 'task.organizations', "companyId", id, "taskId", "organizationId", "createdAt", "updatedAt" FROM "TaskOrganization"
  UNION ALL SELECT 'task.deals', "companyId", id, "taskId", "dealId", "createdAt", "updatedAt" FROM "TaskDeal"
  UNION ALL SELECT 'task.services', "companyId", id, "taskId", "serviceId", "createdAt", "updatedAt" FROM "TaskService"
  UNION ALL SELECT 'lineItem.service', "companyId", id, id, "serviceId", "createdAt", "updatedAt" FROM "ServiceDeal"
  UNION ALL SELECT 'lineItem.deal', "companyId", id, id, "dealId", "createdAt", "updatedAt" FROM "ServiceDeal"
) AS legacy
FULL JOIN "RecordLink" link ON link."companyId" = legacy."companyId" AND link."relationId" = crm_upgrade.preset_id(legacy."companyId", legacy.key) AND link.id = legacy.id
WHERE legacy.id IS NULL OR link.id IS NULL OR legacy.source_id <> link."sourceId" OR legacy.target_id <> link."targetId"
  OR legacy."createdAt" <> link."createdAt" OR legacy."updatedAt" <> link."updatedAt"
GROUP BY legacy.key;

-- Custom values, recomputed from the raw legacy text: lists split at commas, decimals exact with the
-- column currency, instants with their lexical form, ranges as their two endpoints, everything else
-- verbatim. Documented repair: scheme-less links are exactly "https://" || trimmed text, nothing else.
INSERT INTO crm_upgrade_mismatch
SELECT 'values:custom', count(*) FROM "CustomFieldValue" legacy
JOIN crm_upgrade_workspace w ON w.company_id = legacy."companyId"
JOIN LATERAL (SELECT f.value FROM jsonb_array_elements(w.model -> 'fields') AS f(value) WHERE f.value ->> 'id' = legacy."columnId") AS field ON true
LEFT JOIN "RecordValue" value ON value."companyId" = legacy."companyId" AND value."typeId" = field.value ->> 'typeId'
  AND value."recordId" = COALESCE(legacy."contactId", legacy."organizationId", legacy."dealId", legacy."serviceId", legacy."taskId") AND value."fieldId" = legacy."columnId"
WHERE value."recordId" IS NULL
  OR (legacy.value IS NULL AND value.state <> 'missing')
  OR (legacy.value IS NOT NULL AND (value.state <> 'value' OR NOT CASE
    WHEN COALESCE((field.value ->> 'multiple')::boolean, false) THEN value."textListValue" = ARRAY(
      SELECT CASE WHEN field.value ->> 'valueType' = 'url' AND NOT crm_upgrade.is_http_url(part) AND btrim(part) ~* '^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$'
        THEN 'https://' || btrim(part) ELSE part END FROM unnest(crm_upgrade.js_split(legacy.value, ',')) WITH ORDINALITY AS p(part, ordinality) ORDER BY ordinality)
    WHEN field.value ->> 'valueType' = 'currency' THEN value."decimalValue" = legacy.value::numeric AND value.currency = COALESCE(field.value #>> '{format,currency}', w.currency)
    WHEN field.value ->> 'valueType' IN ('date', 'dateTime') THEN value."lexicalValue" = legacy.value AND value."instantValue" = legacy.value::timestamptz AT TIME ZONE 'UTC'
    WHEN field.value ->> 'valueType' IN ('dateRange', 'dateTimeRange') THEN value."jsonValue" = jsonb_build_object('start', split_part(legacy.value, ',', 1), 'end', split_part(legacy.value, ',', 2))
      AND value."rangeStart" = split_part(legacy.value, ',', 1)::timestamptz AT TIME ZONE 'UTC' AND value."rangeEnd" = split_part(legacy.value, ',', 2)::timestamptz AT TIME ZONE 'UTC'
    WHEN field.value ->> 'valueType' = 'url' AND NOT crm_upgrade.is_http_url(legacy.value) THEN value."textValue" = 'https://' || btrim(legacy.value)
    ELSE value."textValue" = legacy.value END))
HAVING count(*) > 0;

-- Deal totals against the legacy line items (the v2 reconciliation query; the weighted value uses the
-- legacy option weight of the deal's stage value).
INSERT INTO crm_upgrade_mismatch
SELECT 'values:deal.totals', count(*) FROM (
  WITH totals AS (
    SELECT deal."companyId", deal.id, COALESCE(SUM(service.amount::text::numeric * line.quantity::text::numeric), 0) AS value,
      COALESCE(SUM(line.quantity::text::numeric), 0) AS quantity
    FROM "Deal" deal
    LEFT JOIN "ServiceDeal" line ON line."companyId" = deal."companyId" AND line."dealId" = deal.id
    LEFT JOIN "Service" service ON service."companyId" = deal."companyId" AND service.id = line."serviceId"
    GROUP BY deal."companyId", deal.id
  ), expected AS (
    SELECT totals.*, totals.value * (option.value ->> 'weight')::numeric / 100 AS weighted
    FROM totals
    JOIN "Company" company ON company.id = totals."companyId"
    LEFT JOIN "CustomFieldValue" stage ON stage."companyId" = totals."companyId" AND stage."dealId" = totals.id AND stage."columnId" = company."dealWeightingColumnId"
    LEFT JOIN "CustomColumn" field ON field."companyId" = totals."companyId" AND field.id = company."dealWeightingColumnId"
    LEFT JOIN LATERAL jsonb_array_elements(field.options -> 'options') option(value) ON option.value ->> 'value' = stage.value
  )
  SELECT expected.id FROM expected
  LEFT JOIN "RecordValue" value ON value."companyId" = expected."companyId" AND value."recordId" = expected.id AND value."fieldId" = crm_upgrade.preset_id(expected."companyId", 'deal.totalValue')
  LEFT JOIN "RecordValue" quantity ON quantity."companyId" = expected."companyId" AND quantity."recordId" = expected.id AND quantity."fieldId" = crm_upgrade.preset_id(expected."companyId", 'deal.totalQuantity')
  LEFT JOIN "RecordValue" weighted ON weighted."companyId" = expected."companyId" AND weighted."recordId" = expected.id AND weighted."fieldId" = crm_upgrade.preset_id(expected."companyId", 'deal.weightedValue')
  WHERE expected.value IS DISTINCT FROM value."decimalValue" OR expected.quantity IS DISTINCT FROM quantity."decimalValue" OR expected.weighted IS DISTINCT FROM weighted."decimalValue"
) AS mismatched
HAVING count(*) > 0;

-- Contact names (formula) recomputed from the legacy name parts.
INSERT INTO crm_upgrade_mismatch
SELECT 'values:contact.name', count(*) FROM "Contact" c
LEFT JOIN "RecordValue" value ON value."companyId" = c."companyId" AND value."typeId" = crm_upgrade.preset_id(c."companyId", 'contact') AND value."recordId" = c.id
  AND value."fieldId" = crm_upgrade.preset_id(c."companyId", 'contact.name')
WHERE value.state IS DISTINCT FROM 'value' OR value."textValue" IS DISTINCT FROM crm_upgrade.js_trim(c."firstName" || ' ' || c."lastName")
HAVING count(*) > 0;

-- Identities, aliases and their record associations.
INSERT INTO crm_upgrade_mismatch
SELECT 'identities', count(*) FROM "ContactIdentifier" legacy
FULL JOIN "RecordIdentity" identity ON identity."companyId" = legacy."companyId" AND identity.id = legacy.id
LEFT JOIN "RecordIdentityLink" link ON link."companyId" = identity."companyId" AND link."identityId" = identity.id
WHERE legacy.id IS NULL OR identity.id IS NULL OR link."identityId" IS NULL
  OR link."typeId" <> crm_upgrade.preset_id(legacy."companyId", 'contact') OR link."recordId" <> legacy."contactId"
  OR ROW(legacy.provider, legacy."channelClass", legacy.value, legacy."messagingId", legacy."displayName", legacy."profileUrl", legacy."createdAt", legacy."updatedAt")
    IS DISTINCT FROM ROW(identity.provider, identity."channelClass", identity.value, identity."messagingId", identity."displayName", identity."profileUrl", identity."createdAt", identity."updatedAt")
HAVING count(*) > 0;

INSERT INTO crm_upgrade_mismatch
SELECT 'identity_keys', count(*) FROM (
  SELECT DISTINCT i."companyId", i.id, i."channelClass", key.value FROM "ContactIdentifier" i, unnest(ARRAY[i.value, i."messagingId"]) AS key(value) WHERE key.value IS NOT NULL
) AS expected
FULL JOIN "RecordIdentityKey" actual ON actual."companyId" = expected."companyId" AND actual."channelClass" = expected."channelClass" AND actual.value = expected.value
WHERE expected.id IS DISTINCT FROM actual."identityId"
HAVING count(*) > 0;

-- Provenance, against the expectation computed from the legacy line items (v4/provenance.ts).
INSERT INTO crm_upgrade_mismatch
SELECT 'provenance', count(*) FROM (
  WITH expected AS (
    SELECT line."companyId", crm_upgrade.preset_id(line."companyId", 'lineItem') AS "typeId", line.id AS "recordId", crm_upgrade.preset_id(line."companyId", field.key) AS "fieldId",
      crm_upgrade.preset_id(line."companyId", 'service') AS "sourceTypeId", line."serviceId" AS "sourceId"
      FROM "ServiceDeal" line CROSS JOIN (VALUES ('lineItem.effectivePrice'), ('lineItem.amount')) AS field(key)
    UNION
    SELECT line."companyId", crm_upgrade.preset_id(line."companyId", 'deal'), line."dealId", crm_upgrade.preset_id(line."companyId", 'deal.totalValue'), crm_upgrade.preset_id(line."companyId", 'lineItem'), line.id FROM "ServiceDeal" line
    UNION
    SELECT line."companyId", crm_upgrade.preset_id(line."companyId", 'deal'), line."dealId", crm_upgrade.preset_id(line."companyId", 'deal.totalValue'), crm_upgrade.preset_id(line."companyId", 'service'), line."serviceId" FROM "ServiceDeal" line
    UNION
    SELECT line."companyId", crm_upgrade.preset_id(line."companyId", 'deal'), line."dealId", crm_upgrade.preset_id(line."companyId", 'deal.totalQuantity'), crm_upgrade.preset_id(line."companyId", 'lineItem'), line.id FROM "ServiceDeal" line
  ), actual AS (
    SELECT "companyId", "typeId", "recordId", "fieldId", "sourceTypeId", "sourceId" FROM "RecordValueDependency"
  )
  (SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)
) AS mismatched
HAVING count(*) > 0;

-- Configuration: every workspace is generic, idle, at its last revision, with one revision chain from 1
-- and the six record types, their fields and the nine relationships of its model.
INSERT INTO crm_upgrade_mismatch
SELECT 'workspaces', count(*) FROM "Company" company
LEFT JOIN "RecordSchemaState" state ON state."companyId" = company.id
LEFT JOIN crm_upgrade_workspace w ON w.company_id = company.id
WHERE state."companyId" IS NULL OR state."storageMode" <> 'generic' OR state."activeOperationId" IS NOT NULL
  OR state.revision <> (SELECT max(revision) FROM "RecordSchemaRevision" r WHERE r."companyId" = company.id)
  OR (SELECT count(*) FROM "RecordSchemaRevision" r WHERE r."companyId" = company.id) <> state.revision
  OR (SELECT count(*) FROM "RecordTypeDefinition" t WHERE t."companyId" = company.id) <> 6
  OR (SELECT count(*) FROM "RecordFieldDefinition" f WHERE f."companyId" = company.id) <> jsonb_array_length(w.model -> 'fields')
  OR (SELECT count(*) FROM "RecordRelationshipDefinition" r WHERE r."companyId" = company.id) <> 9
  OR (SELECT count(*) FROM "RecordValue" v JOIN "RecordFieldDefinition" f ON f."companyId" = v."companyId" AND f."typeId" = v."typeId" AND f.id = v."fieldId"
      WHERE v."companyId" = company.id AND f.behavior IN ('formula', 'rollup')) <>
    (SELECT count(*) FROM "Contact" r WHERE r."companyId" = company.id) + 2 * (SELECT count(*) FROM "ServiceDeal" r WHERE r."companyId" = company.id)
      + 3 * (SELECT count(*) FROM "Deal" r WHERE r."companyId" = company.id)
HAVING count(*) > 0;

-- Triggers: each converted routine/webhook has its generic events and (unless its owner could not be
-- resolved) one subscription; converted routines keep no legacy watched fields or filters.
INSERT INTO crm_upgrade_mismatch
SELECT 'triggers', count(*) FROM crm_upgrade_trigger t
LEFT JOIN "RecordEventSubscription" s ON s."companyId" = t.company_id AND s.id = t.row_id
LEFT JOIN "Routine" r ON t.source_table = 'Routine' AND r.id = t.row_id
LEFT JOIN "Webhook" h ON t.source_table = 'Webhook' AND h.id = t.row_id
WHERE (t.result -> 'subscription' <> 'null'::jsonb) <> (s.id IS NOT NULL)
  OR (r.id IS NOT NULL AND (cardinality(r."changedFields") <> 0 OR r."triggerFilters" <> '[]'::jsonb
    OR EXISTS (SELECT 1 FROM unnest(r."triggerEvents") e WHERE e ~ '^(contact|organization|deal|service|task)\.')))
  OR (h.id IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(h.events) e WHERE e ~ '^(contact|organization|deal|service|task)\.'))
HAVING count(*) > 0;

-- Presentation: no legacy surface keys remain, and documented repairs left only supported page sizes.
INSERT INTO crm_upgrade_mismatch
SELECT 'presentation', count(*) FROM (
  SELECT id FROM "DataView" WHERE "surfaceKey" ~ '^(contact|organization|deal|service|task)s-card-store$'
    OR ("pageSize" IS NOT NULL AND "pageSize" NOT IN (5, 10, 25, 100) AND "surfaceKey" LIKE 'records:%')
  UNION ALL
  SELECT id FROM "P13n" WHERE "p13nId" ~ '^((contact|organization|deal|service|task)s-card-store|(contact|organization|deal|service|task)-detail)$'
    OR ("p13nId" LIKE 'records:%' AND pagination IS NOT NULL AND jsonb_typeof(pagination -> 'pageSize') = 'number' AND (pagination ->> 'pageSize')::numeric NOT IN (5, 10, 25, 100))
  UNION ALL
  SELECT id FROM "Widget" WHERE (kind = 'chart' AND measure IS NULL) OR (kind = 'activityTimeline' AND "activityQuery" IS NULL)
) AS remaining
HAVING count(*) > 0;

-- Documented repairs, recounted independently from the legacy source.
INSERT INTO crm_upgrade_mismatch
SELECT 'repairs:links', abs(recorded.total - expected.total) FROM
  (SELECT count(*) AS total FROM crm_upgrade_value WHERE repaired) AS recorded,
  (SELECT count(*) AS total FROM "CustomFieldValue" legacy JOIN "CustomColumn" c ON c.id = legacy."columnId" AND c."companyId" = legacy."companyId" AND c.type = 'link'
   WHERE legacy.value IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(CASE WHEN COALESCE((c.options ->> 'allowMultiple')::boolean, false)
     THEN crm_upgrade.js_split(legacy.value, ',') ELSE ARRAY[legacy.value] END) AS part
     WHERE NOT crm_upgrade.is_http_url(part) AND btrim(part) ~* '^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$')) AS expected
WHERE recorded.total <> expected.total;

-- Every dropped column reference named a UUID that is no field of its type in the converted model.
INSERT INTO crm_upgrade_mismatch
SELECT 'repairs:dropped_column_references', abs(recorded.total - expected.total) FROM
  (SELECT count(*) AS total FROM crm_upgrade_repair WHERE kind = 'dropped_column_reference') AS recorded,
  (SELECT count(*) AS total FROM crm_upgrade_presentation p
   CROSS JOIN LATERAL (
     SELECT f.value ->> 'field' AS key FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.original -> 'filters') = 'array' THEN p.original -> 'filters' ELSE '[]' END) AS f(value)
     UNION ALL SELECT p.original #>> '{sortDescriptor,field}'
     UNION ALL SELECT p.original #>> '{grouping,field}'
     UNION ALL SELECT k.value #>> '{}' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.original -> 'columnOrder') = 'array' THEN p.original -> 'columnOrder' ELSE '[]' END) AS k(value)
     UNION ALL SELECT k.value #>> '{}' FROM jsonb_array_elements(CASE WHEN COALESCE(p.original ->> 'p13nId', '') NOT LIKE '%-detail' AND jsonb_typeof(p.original -> 'hiddenColumns') = 'array' THEN p.original -> 'hiddenColumns' ELSE '[]' END) AS k(value)
     UNION ALL SELECT k.key FROM jsonb_each(CASE WHEN COALESCE(p.original ->> 'p13nId', '') NOT LIKE '%-detail' THEN COALESCE(NULLIF(p.original -> 'columnWidths', 'null'), '{}') ELSE '{}' END) AS k(key, value)
     UNION ALL SELECT k.value #>> '{}' FROM jsonb_each(CASE WHEN p.original ->> 'p13nId' LIKE '%-detail' AND jsonb_typeof(p.original -> 'detailOptions') = 'object' THEN p.original -> 'detailOptions' ELSE '{}' END) AS d(key, value),
       jsonb_array_elements(CASE WHEN d.key IN ('starredFieldIds', 'hiddenFieldIds', 'fieldOrder') THEN d.value ELSE '[]' END) AS k(value)
   ) AS reference
   JOIN crm_upgrade_workspace w ON w.company_id = p.company_id
   WHERE p.source_table IN ('DataView', 'P13n') AND crm_upgrade.is_uuid(reference.key)
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(w.model -> 'fields') AS f(value)
       WHERE f.value ->> 'id' = reference.key AND f.value ->> 'typeId' = crm_upgrade.preset_id(p.company_id, substring(COALESCE(p.original ->> 'surfaceKey', p.original ->> 'p13nId') FROM '^([a-z]+?)s?-')))) AS expected
WHERE recorded.total <> expected.total;

DO $$
DECLARE
  v_summary text;
BEGIN
  SELECT string_agg(format('%s x%s', check_name, total), '; ' ORDER BY check_name) INTO v_summary FROM crm_upgrade_mismatch WHERE total > 0;
  IF v_summary IS NOT NULL THEN
    RAISE EXCEPTION 'Configurable record upgrade reconciliation failed: %', v_summary
      USING HINT = 'Nothing was changed. Report this failure; the converted data did not match the legacy source.';
  END IF;
END
$$;

-- =============================================================================================
-- Section 7: LEGACY REMOVAL. Nothing is removed with CASCADE: an unexpected dependency fails the upgrade.
-- =============================================================================================

ALTER TABLE "Company" DROP COLUMN "dealWeightingColumnId";
DROP TABLE "Contact", "Organization", "Deal", "Service", "Task", "CustomColumn", "CustomFieldValue", "ContactIdentifier", "ServiceDeal",
  "ServiceUser", "DealOrganization", "DealUser", "DealContact", "ContactUser", "OrganizationUser", "TaskUser", "TaskContact",
  "TaskOrganization", "TaskDeal", "TaskService", "ContactOrganization", "EntityTerminology";
ALTER TABLE "Widget" DROP COLUMN "entityType", DROP COLUMN "entityFilters", DROP COLUMN "dealFilters", DROP COLUMN "groupByType",
  DROP COLUMN "groupByCustomColumnId", DROP COLUMN "aggregationType", DROP COLUMN "timelineFilters";
DROP FUNCTION custom_field_range_start(text);
DROP FUNCTION custom_field_range_end(text);
DROP TYPE "AggregationType";
DROP TYPE "CustomColumnType";
DROP TYPE "EntityType";
DROP TYPE "TaskType";
DROP TYPE "WidgetGroupByType";

-- The transaction-scoped helpers.
DO $$
DECLARE
  v_helper record;
BEGIN
  FOR v_helper IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'crm_upgrade' LOOP
    EXECUTE format('DROP FUNCTION %s', v_helper.signature);
  END LOOP;
END
$$;
DROP SCHEMA crm_upgrade;
