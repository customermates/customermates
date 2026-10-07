import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { Client } from "pg";

import { assertLocalDatabaseEnvironment } from "./local-database-safety";
import { presetId } from "../features/records/crm-preset";
import { RecordModelSchema, type RecordModel } from "../features/records/record-model.schema";
import { validateRecordModel } from "../features/records/record-model-validation";
import { RecordQuerySchema } from "../features/records/record-query.schema";
import { compileRecordQuery } from "../features/records/record-query";
import { RecordSearchSchema } from "../features/records/record-search.schema";
import { compileRecordSearch } from "../features/records/record-search-query";

const { values } = parseArgs({
  options: { mode: { type: "string", default: "measure" }, database: { type: "string" } },
});
if (values.mode !== "seed" && values.mode !== "measure") throw new Error("Use --mode seed or --mode measure");
const url = assertLocalDatabaseEnvironment(process.env);
if (
  !values.database ||
  !/^crm_scale_[a-z0-9_]{1,64}$/.test(values.database) ||
  decodeURIComponent(new URL(url).pathname.slice(1)) !== values.database
)
  throw new Error("Pass --database with the exact dedicated disposable crm_scale_ database name");

const client = new Client({ connectionString: url });
const TYPES = ["contact", "organization", "deal", "service", "task"] as const;
const RECORDS_PER_TYPE = 20_000;
const TEXT_FIELDS_PER_TYPE = 17;
const scaleUuidSql = (expression: string) =>
  `overlay(overlay(md5(${expression}) placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid`;

function requireValue<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

async function workspace() {
  const company = await client.query<{ id: string }>('SELECT id FROM "Company" ORDER BY id LIMIT 1');
  const companyId = requireValue(company.rows[0]?.id, "Seed the disposable scale database first");
  const state = await client.query<{ revision: number }>(
    'SELECT revision FROM "RecordSchemaState" WHERE "companyId" = $1',
    [companyId],
  );
  const current = requireValue(state.rows[0], "Record migration has not been finalized");
  const revision = await client.query<{ snapshot: unknown; actorId: string }>(
    'SELECT snapshot, "actorId" FROM "RecordSchemaRevision" WHERE "companyId" = $1 AND revision = $2',
    [companyId, current.revision],
  );
  return {
    companyId,
    revision: current.revision,
    actorId: requireValue(revision.rows[0]?.actorId, "Missing record schema revision"),
    model: RecordModelSchema.parse(requireValue(revision.rows[0]?.snapshot, "Missing record model")),
  };
}

async function seed() {
  const { companyId, revision, actorId, model } = await workspace();
  const prior = await client.query(
    'SELECT 1 FROM "CrmRecord" WHERE "companyId" = $1 AND "systemData" @> $2::jsonb LIMIT 1',
    [companyId, JSON.stringify({ benchmark: true })],
  );
  if (prior.rowCount) throw new Error("The scale fixture already exists");
  const typeIds = new Map(
    TYPES.flatMap((key) => {
      const id = presetId(companyId, key);
      return model.types.some((type) => type.id === id) ? [[key, id] as const] : [];
    }),
  );
  if (typeIds.size !== TYPES.length) throw new Error("The five starter types are required");
  const fields = [];
  for (const key of TYPES) {
    const typeId = requireValue(typeIds.get(key), `Missing ${key} type`);
    const example = requireValue(
      model.fields.find(
        (field) => field.typeId === typeId && field.valueType === "text" && field.behavior.kind === "input",
      ),
      `Missing ${key} input text field`,
    );
    for (let index = 1; index <= TEXT_FIELDS_PER_TYPE; index += 1)
      fields.push({
        ...example,
        id: randomUUID(),
        label: `Scale text ${String(index).padStart(2, "0")}`,
        position: 1000 + index,
        required: false,
        behavior: { kind: "input" as const },
      });
    fields.push({
      ...example,
      id: randomUUID(),
      label: "Scale amount",
      position: 1100,
      valueType: "number" as const,
      required: false,
      behavior: { kind: "input" as const },
    });
  }
  const updated: RecordModel = RecordModelSchema.parse({
    ...model,
    revision: revision + 1,
    fields: [...model.fields, ...fields],
  });
  if (validateRecordModel(updated).issues.length) throw new Error("The scale model failed validation");
  await client.query("BEGIN");
  try {
    for (const field of fields)
      await client.query(
        'INSERT INTO "RecordFieldDefinition" ("companyId", "typeId", id, "valueType", behavior, archived, definition, "updatedAt") VALUES ($1,$2,$3,$4,$5,false,$6::jsonb,NOW())',
        [companyId, field.typeId, field.id, field.valueType, field.behavior.kind, JSON.stringify(field)],
      );
    await client.query(
      'INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot) VALUES ($1,$2,$3,$4::jsonb)',
      [companyId, updated.revision, actorId, JSON.stringify(updated)],
    );
    await client.query('UPDATE "RecordSchemaState" SET revision = $2 WHERE "companyId" = $1', [
      companyId,
      updated.revision,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  for (const key of TYPES) {
    const typeId = requireValue(typeIds.get(key), `Missing ${key} type`);
    await client.query(
      `INSERT INTO "CrmRecord" ("companyId", "typeId", id, version, "systemData", "createdAt", "updatedAt")
       SELECT $1, $2, ${scaleUuidSql("'scale:' || $2 || ':' || sequence::text")}, 1,
         jsonb_build_object('benchmark', true, 'sequence', sequence), NOW(), NOW()
       FROM generate_series(1, $3::integer) sequence`,
      [companyId, typeId, RECORDS_PER_TYPE],
    );
    const textFieldIds = fields
      .filter((field) => field.typeId === typeId && field.valueType === "text")
      .map((field) => field.id);
    const amountFieldId = requireValue(
      fields.find((field) => field.typeId === typeId && field.valueType === "number")?.id,
      "Missing scale amount field",
    );
    await client.query(
      `INSERT INTO "RecordValue" ("companyId", "typeId", "recordId", "fieldId", state, "textValue", "schemaRevision", "createdAt", "updatedAt")
       SELECT $1, $2, record.id, field.id, 'value',
         'Bucket ' || (((record."systemData"->>'sequence')::integer + (field.definition->>'position')::integer) % 1000),
         $4, NOW(), NOW()
       FROM "CrmRecord" record JOIN "RecordFieldDefinition" field
         ON field."companyId" = $1 AND field."typeId" = $2 AND field.id = ANY($3::text[])
       WHERE record."companyId" = $1 AND record."typeId" = $2 AND record."systemData" @> '{"benchmark":true}'::jsonb`,
      [companyId, typeId, textFieldIds, updated.revision],
    );
    await client.query(
      `INSERT INTO "RecordValue" ("companyId", "typeId", "recordId", "fieldId", state, "decimalValue", "schemaRevision", "createdAt", "updatedAt")
       SELECT $1, $2, record.id, $3, 'value', (record."systemData"->>'sequence')::numeric * 10, $4, NOW(), NOW()
       FROM "CrmRecord" record WHERE record."companyId" = $1 AND record."typeId" = $2
         AND record."systemData" @> '{"benchmark":true}'::jsonb`,
      [companyId, typeId, amountFieldId, updated.revision],
    );
    const type = requireValue(
      updated.types.find((type) => type.id === typeId),
      `Missing ${key} definition`,
    );
    const titleFieldIds = [type.primaryFieldId];
    if (key === "contact")
      titleFieldIds.push(
        requireValue(
          updated.fields.find((field) => field.typeId === typeId && field.label === "First name")?.id,
          "Missing contact title input",
        ),
      );
    await client.query(
      `INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"textValue","schemaRevision","createdAt","updatedAt")
       SELECT $1,$2,record.id,field_id,'value',$5 || (record."systemData"->>'sequence'),$4,NOW(),NOW()
       FROM "CrmRecord" record CROSS JOIN unnest($3::text[]) field_id
       WHERE record."companyId"=$1 AND record."typeId"=$2 AND record."systemData" @> '{"benchmark":true}'::jsonb`,
      [companyId, typeId, titleFieldIds, updated.revision, `Scale ${key} `],
    );
    if (key === "service") {
      const price = requireValue(
        updated.fields.find((field) => field.typeId === typeId && field.required && field.valueType === "currency"),
        "Missing required service price",
      );
      const initial = price.behavior.kind === "input" ? price.behavior.defaultValue : undefined;
      if (initial?.kind !== "decimal") throw new Error("The service price default must be decimal");
      await client.query(
        `INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"decimalValue",currency,"schemaRevision","createdAt","updatedAt")
         SELECT $1,$2,record.id,$3,'value',$4::numeric,$5,$6,NOW(),NOW()
         FROM "CrmRecord" record WHERE record."companyId"=$1 AND record."typeId"=$2 AND record."systemData" @> '{"benchmark":true}'::jsonb`,
        [companyId, typeId, price.id, initial.value, initial.currency, updated.revision],
      );
    }
    process.stdout.write(`Seeded ${key} records and values.\n`);
  }
  const contactId = requireValue(typeIds.get("contact"), "Missing contact type");
  const organizationId = requireValue(typeIds.get("organization"), "Missing organization type");
  const relation = await client.query<{ id: string }>(
    'SELECT id FROM "RecordRelationshipDefinition" WHERE "companyId" = $1 AND "sourceTypeId" = $2 AND "targetTypeId" = $3 AND archived = false ORDER BY id LIMIT 1',
    [companyId, contactId, organizationId],
  );
  const relationId = requireValue(relation.rows[0]?.id, "Missing contact/organization relationship");
  for (let start = 1; start <= RECORDS_PER_TYPE; start += 4_000) {
    await client.query(
      `INSERT INTO "RecordLink" ("companyId", id, "relationId", "sourceTypeId", "sourceId", "targetTypeId", "targetId", "createdAt", "updatedAt")
       SELECT $1, ${scaleUuidSql("'scale:link:' || source_sequence::text || ':' || position::text")},
         $2, $3, ${scaleUuidSql("'scale:' || $3 || ':' || source_sequence::text")},
         $4, ${scaleUuidSql("'scale:' || $4 || ':' || (((source_sequence - 1) * 25 + position) % $5 + 1)::text")},
         NOW(), NOW()
       FROM generate_series($6::integer, LEAST($6::integer + 3999, $5::integer)) source_sequence
       CROSS JOIN generate_series(0, 24) position`,
      [companyId, relationId, contactId, organizationId, RECORDS_PER_TYPE, start],
    );
  }
  const counts = await client.query<{ records: string; values: string; links: string }>(
    `SELECT
      (SELECT COUNT(*) FROM "CrmRecord" WHERE "companyId" = $1 AND "systemData" @> '{"benchmark":true}'::jsonb)::text AS records,
      (SELECT COUNT(*) FROM "RecordValue" value JOIN "CrmRecord" record ON record."companyId"=value."companyId" AND record."typeId"=value."typeId" AND record.id=value."recordId" WHERE record."companyId"=$1 AND record."systemData" @> '{"benchmark":true}'::jsonb)::text AS values,
      (SELECT COUNT(*) FROM "RecordLink" WHERE "companyId"=$1 AND "relationId"=$2)::text AS links`,
    [companyId, relationId],
  );
  const result = requireValue(counts.rows[0], "Missing scale counts");
  const expectedValues = RECORDS_PER_TYPE * (TYPES.length * (TEXT_FIELDS_PER_TYPE + 2) + 2);
  if (result.records !== "100000" || Number(result.values) !== expectedValues || Number(result.links) < 500_000)
    throw new Error(`Scale fixture counts are incorrect: ${JSON.stringify(result)}`);
  process.stdout.write(`${JSON.stringify({ mode: "seed", counts: result })}\n`);
}

async function measure() {
  const { companyId, model } = await workspace();
  const contact = requireValue(
    model.types.find((type) => type.id === presetId(companyId, "contact")),
    "Missing contact type",
  );
  const bucket = requireValue(
    model.fields.find((field) => field.typeId === contact.id && field.label === "Scale text 01"),
    "Seed the scale fixture first",
  );
  const amount = requireValue(
    model.fields.find((field) => field.typeId === contact.id && field.label === "Scale amount"),
    "Seed the scale fixture first",
  );
  const access = new Map(model.types.map((type) => [type.id, { access: "all" as const, userId: "scale" }]));
  const list = compileRecordQuery(
    companyId,
    RecordQuerySchema.parse({
      typeId: contact.id,
      filters: [{ fieldId: bucket.id, operator: "eq", value: { kind: "text", value: "Bucket 42" } }],
      sort: [{ fieldId: amount.id, direction: "desc" }],
      pageSize: 25,
    }),
    model,
    access,
  ).ids;
  const search = compileRecordQuery(
    companyId,
    RecordQuerySchema.parse({ typeId: contact.id, search: "Bucket 42", pageSize: 25 }),
    model,
    access,
  ).ids;
  const globalSearch = requireValue(
    compileRecordSearch(companyId, model, access, {
      search: RecordSearchSchema.parse({ searchTerm: "Bucket 42", limit: 25 }),
    }),
    "No types available to global search",
  );
  const recordId = `(${scaleUuidSql("'scale:' || $2 || ':1'")})::text`;
  const jobs = [
    { name: "filtered_sorted_list", sql: list.text, args: list.values },
    {
      name: "record_detail_values",
      sql: `SELECT * FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=${recordId}`,
      args: [companyId, contact.id],
    },
    {
      name: "grouped_sum",
      sql: `SELECT bucket."textValue", SUM(amount."decimalValue") FROM "CrmRecord" record
        JOIN "RecordValue" bucket ON bucket."companyId"=record."companyId" AND bucket."typeId"=record."typeId" AND bucket."recordId"=record.id AND bucket."fieldId"=$3
        JOIN "RecordValue" amount ON amount."companyId"=record."companyId" AND amount."typeId"=record."typeId" AND amount."recordId"=record.id AND amount."fieldId"=$4
        WHERE record."companyId"=$1 AND record."typeId"=$2 AND record."systemData" @> '{"benchmark":true}'::jsonb GROUP BY bucket."textValue"`,
      args: [companyId, contact.id, bucket.id, amount.id],
    },
    { name: "text_search_one_type", sql: search.text, args: search.values },
    { name: "global_search_all_types", sql: globalSearch.text, args: globalSearch.values },
  ];
  await client.query("SET statement_timeout = '30s'");
  const results = [];
  for (const job of jobs) {
    const durations: number[] = [];
    let rows = 0;
    for (let run = 0; run < 11; run += 1) {
      const start = performance.now();
      const result = await client.query(job.sql, job.args);
      rows = result.rowCount ?? 0;
      if (run) durations.push(performance.now() - start);
    }
    if (!rows) throw new Error(`${job.name} returned no rows from the scale fixture`);
    durations.sort((a, b) => a - b);
    results.push({
      name: job.name,
      rows,
      medianMs: Number(durations[4].toFixed(1)),
      p95Ms: Number(durations[9].toFixed(1)),
      minMs: Number(durations[0].toFixed(1)),
      maxMs: Number(durations[9].toFixed(1)),
    });
  }
  const version = await client.query<{ server_version: string }>("SHOW server_version");
  process.stdout.write(
    `${JSON.stringify({ mode: "measure", cpu: cpus()[0]?.model, cores: cpus().length, memoryGiB: Math.round(totalmem() / 1024 ** 3), postgres: version.rows[0]?.server_version, results }, null, 2)}\n`,
  );
}

try {
  await client.connect();
  if (values.mode === "seed") await seed();
  else await measure();
} finally {
  await client.end();
}
