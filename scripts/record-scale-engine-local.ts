import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { performance } from "node:perf_hooks";
import { cpus, totalmem } from "node:os";
import { Client } from "pg";
import { assertLocalDatabaseEnvironment } from "./local-database-safety";
import { RecordQuerySchema } from "../features/records/record-query.schema";
import { RecordMeasureSchema } from "../features/records/record-measure.schema";
import { TenantUserSchema } from "../features/user/user.schema";
import type { Validated } from "../core/validation/validation.utils";

const { values } = parseArgs({
  options: {
    database: { type: "string" },
    samples: { type: "string", default: "30" },
    warmups: { type: "string", default: "3" },
    staged: { type: "boolean", default: false },
    "staged-only": { type: "boolean", default: false },
  },
});
const sampleCount = Number(values.samples);
const warmupCount = Number(values.warmups);
if (values["staged-only"] && !values.staged) throw new Error("--staged-only requires --staged");
if (
  !Number.isInteger(sampleCount) ||
  sampleCount < 10 ||
  sampleCount > 200 ||
  !Number.isInteger(warmupCount) ||
  warmupCount < 1 ||
  warmupCount > 20
)
  throw new Error("Use 10–200 samples and 1–20 warmups for reproducible local measurements");
const url = assertLocalDatabaseEnvironment(process.env);
if (
  !values.database ||
  !/^crm_scale_[a-z0-9_]{1,64}$/.test(values.database) ||
  decodeURIComponent(new URL(url).pathname.slice(1)) !== values.database
)
  throw new Error("Pass --database with the exact dedicated disposable crm_scale_ database name");

await import("./lib/register-record-benchmark-hook.mjs");

const [
  database,
  context,
  repository,
  users,
  access,
  calculations,
  writes,
  mutations,
  queries,
  measures,
  searches,
  exports,
  imports,
] = await Promise.all([
  import("../prisma/db"),
  import("../core/decorators/tenant-context"),
  import("../features/records/prisma-record.repository"),
  import("../features/user/prisma-user.repository"),
  import("../features/records/record-access"),
  import("../features/records/record-calculation.service"),
  import("../features/records/record-write.service"),
  import("../features/records/mutate-record.interactor"),
  import("../features/records/query-records.interactor"),
  import("../features/records/query-record-measure.interactor"),
  import("../features/records/search-records.interactor"),
  import("../features/data-transfer/export/export-records.interactor"),
  import("../features/data-transfer/import/import-records.interactor"),
]);

function unwrap<T>(result: Awaited<Validated<T>>): T {
  if (!result.ok) throw result.error;
  return result.data;
}

const client = new Client({ connectionString: url });
try {
  await client.connect();
  const companyId = (
    await client.query(
      'SELECT "companyId" FROM "CrmRecord" WHERE "systemData" @> \'{"benchmark":true}\'::jsonb LIMIT 1',
    )
  ).rows[0]?.companyId as string | undefined;
  if (!companyId) throw new Error("Seed the scale fixture before measuring the record engine");
  const actor = await context.runWithoutTenant(() =>
    database.prisma.user.findFirst({
      where: { companyId, status: "active", role: { isSystemRole: true } },
      include: { role: { include: { permissions: true } } },
    }),
  );
  const user = TenantUserSchema.parse(actor);
  const run = <T>(work: () => Promise<T>) => context.runWithTenant(user, work);
  const repo = new repository.PrismaRecordRepo();
  const policy = new access.RecordAccessPolicy(new users.PrismaUserRepo(), repo);
  const calculator = new calculations.RecordCalculationService(repo);
  const writer = new writes.RecordWriteService(repo, policy, calculator);
  const company = {
    getDetails: async () => ({
      currency: (
        await client.query('SELECT currency FROM "Company" WHERE id=$1', [companyId])
      ).rows[0].currency.toUpperCase() as string,
    }),
  };
  const mutate = new mutations.MutateRecordInteractor(repo, policy, writer, company, {
    dispatch: () => {
      throw new Error("Ordinary scale writes unexpectedly require background execution");
    },
  });
  const query = new queries.QueryRecordsInteractor(repo, policy);
  const read = new queries.GetRecordInteractor(repo, policy);
  const measure = new measures.QueryRecordMeasureInteractor(repo, policy, company);
  const search = new searches.SearchRecordsInteractor(repo, policy);
  const exporter = new exports.ExportRecordsInteractor(repo, policy);
  const importer = new imports.ImportRecordsInteractor(repo, policy, writer, company);
  const model = await run(() => repo.getModel());
  const typeId = (
    await client.query('SELECT id FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND "presetKey"=$2', [
      companyId,
      "contact",
    ])
  ).rows[0].id as string;
  const field = (label: string) => {
    const result = model.fields.find((item) => item.typeId === typeId && item.label === label);
    if (!result) throw new Error(`Missing scale field ${label}`);
    return result;
  };
  const bucket = field("Scale text 01");
  const amount = field("Scale amount");
  const firstName = model.fields.find(
    (item) =>
      item.typeId === typeId &&
      item.valueType === "text" &&
      item.behavior.kind === "input" &&
      item.label === "First name",
  );
  if (!firstName) throw new Error("The preset's title calculation input is missing");
  const filter = { fieldId: bucket.id, operator: "eq" as const, value: { kind: "text" as const, value: "Bucket 42" } };
  const list = RecordQuerySchema.parse({
    typeId,
    fields: [bucket.id, amount.id],
    filters: [filter],
    sort: [{ fieldId: amount.id, direction: "desc" }],
    pageSize: 25,
  });
  const ref = (await run(() => query.invoke(list)).then(unwrap)).records[0]?.ref;
  if (!ref) throw new Error("Scale query returned no records");
  const grouped = RecordMeasureSchema.parse({
    source: { typeId, filters: [{ fieldId: bucket.id, operator: "notEmpty", value: null }], relationships: [] },
    aggregation: "sum",
    valueFieldId: amount.id,
    groupBy: { path: [], fieldId: bucket.id },
    groupLimit: 1000,
  });
  const metrics: Array<{
    name: string;
    samples: number;
    warmups: number;
    medianMs: number;
    p95Ms: number;
    minMs: number;
    maxMs: number;
  }> = [];
  async function timed(name: string, work: (sample: number) => Promise<void>, samples = sampleCount) {
    const durations: number[] = [];
    for (let index = 0; index < samples + warmupCount; index += 1) {
      const start = performance.now();
      await work(index);
      if (index >= warmupCount) durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    metrics.push({
      name,
      samples,
      warmups: warmupCount,
      medianMs: Number(durations[Math.floor(samples / 2)].toFixed(1)),
      p95Ms: Number(durations[Math.ceil(samples * 0.95) - 1].toFixed(1)),
      minMs: Number(durations[0].toFixed(1)),
      maxMs: Number(durations.at(-1)?.toFixed(1)),
    });
    console.log(JSON.stringify(metrics.at(-1)));
  }
  if (!values["staged-only"]) {
    await timed("engine_filtered_sorted_list", async () => {
      const result = unwrap(await run(() => query.invoke(list)));
      if (result.records.length !== 20) throw new Error("The engine list fixture count changed");
    });
    await timed("engine_record_detail", async () => {
      unwrap(await run(() => read.invoke(ref)));
    });
    await timed("engine_grouped_measure", async () => {
      const result = unwrap(await run(() => measure.invoke(grouped)));
      if (result.groups.length !== 1000) throw new Error("The grouped measure lost distinct groups");
    });
    await timed("engine_global_search", async () => {
      const result = unwrap(await run(() => search.invoke({ searchTerm: "Bucket 42", limit: 25, cursor: null })));
      if (result.results.length !== 25) throw new Error("Global search did not retain its requested page");
    });
    await timed("engine_write_with_title_calculation", async (sample) => {
      const record = unwrap(await run(() => read.invoke(ref)));
      const result = unwrap(
        await run(() =>
          mutate.invoke({
            expectedRevision: model.revision,
            idempotencyKey: randomUUID(),
            mutation: {
              action: "update",
              ref,
              expectedVersion: record.version,
              fields: [{ fieldId: firstName.id, value: { kind: "text", value: `Scale input ${sample}` } }],
            },
          }),
        ),
      );
      if (result.status !== "completed") throw new Error("An ordinary write exceeded the synchronous budget");
      const updated = unwrap(await run(() => read.invoke(ref)));
      const primary = model.types.find((type) => type.id === typeId)?.primaryFieldId;
      const title = updated.fields.find((value) => value.fieldId === primary)?.result;
      if (
        title?.state !== "value" ||
        title.value.kind !== "text" ||
        !title.value.value.includes(`Scale input ${sample}`)
      )
        throw new Error("The backend did not persist the calculated title");
    });
    const exportRequest = { typeId, filters: [filter], relationships: [], sort: [] };
    let exported = unwrap(await run(() => exporter.invoke(exportRequest)));
    if (exported.records.length !== 20 || exported.links.length !== 500)
      throw new Error("The bounded export fixture changed");
    await timed(
      "engine_export_20_records_500_links",
      async () => {
        exported = unwrap(await run(() => exporter.invoke(exportRequest)));
      },
      5,
    );
    await timed(
      "engine_import_20_record_updates",
      async () => {
        const document = { ...exported, links: [] };
        const result = unwrap(
          await run(() => importer.invoke({ document, mode: "update", idempotencyKey: randomUUID() })),
        );
        if (result.updated !== 20 || result.created !== 0)
          throw new Error("The import did not update the declared records");
        exported = unwrap(await run(() => exporter.invoke(exportRequest)));
      },
      5,
    );
  }
  let stagedOperation: Record<string, number | boolean> | null = null;
  if (values.staged) {
    const { RecordConfigurationService } = await import("../features/records/configuration.service");
    const { ApplyRecordConfigurationInteractor, RecordConfigurationWriter } = await import(
      "../features/records/configure-records.interactor"
    );
    const { ConfigurationChangeSchema } = await import("../features/records/configuration.schema");
    const { RecordOperationService } = await import("../features/records/record-operation.service");
    const configurations = new RecordConfigurationService(repo);
    const configure = new ApplyRecordConfigurationInteractor(
      repo,
      policy,
      configurations,
      new RecordConfigurationWriter(repo, calculator),
      company,
      {
        dispatch: () => {
          throw new Error("Creating empty benchmark types unexpectedly required staging");
        },
      },
    );
    const suffix = randomUUID();
    const sourceLabel = `Scale source ${suffix}`;
    const targetLabel = `Scale targets ${suffix}`;
    const inputId = randomUUID();
    const outputId = randomUUID();
    const relationId = randomUUID();
    const change = ConfigurationChangeSchema.parse({
      expectedRevision: (await run(() => repo.getModel())).revision,
      idempotencyKey: randomUUID(),
      operations: [
        ...[
          ["$source", sourceLabel],
          ["$targets", targetLabel],
        ].map(([reference, label]) => ({
          operation: "createType",
          reference,
          label,
          pluralLabel: label,
          description: "Disposable high-fan-out scale verification",
          icon: "list",
          embedded: false,
          navigationVisible: false,
          accessPresetId: null,
        })),
        {
          operation: "putField",
          field: {
            id: inputId,
            typeId: "$source",
            label: "Benchmark input",
            valueType: "number",
            behavior: { kind: "input" },
            required: true,
            archived: false,
            options: [],
            position: 2,
          },
        },
        {
          operation: "putRelationship",
          relationship: {
            id: relationId,
            sourceTypeId: "$targets",
            targetTypeId: "$source",
            sourceLabel: "Source",
            targetLabel: "Targets",
            sourceCardinality: "one",
            targetCardinality: "many",
            onSourceDelete: "restrict",
            onTargetDelete: "unlink",
            archived: false,
          },
        },
        {
          operation: "putField",
          field: {
            id: outputId,
            typeId: "$targets",
            label: "Benchmark lookup",
            valueType: "number",
            behavior: {
              kind: "lookup",
              expression: {
                kind: "related",
                relationId,
                direction: "outgoing",
                expression: { kind: "field", fieldId: inputId },
                reducer: "one",
              },
            },
            required: false,
            archived: false,
            options: [],
            position: 2,
          },
        },
      ],
    });
    const configured = unwrap(await run(() => configure.invoke(change)));
    if (configured.status !== "completed") throw new Error("Benchmark configuration was not published");
    const configuredModel = await run(() => repo.getModel());
    const sourceType = configuredModel.types.find((type) => type.label === sourceLabel);
    const targetType = configuredModel.types.find((type) => type.label === targetLabel);
    if (!sourceType || !targetType) throw new Error("Benchmark types are missing");
    const background = { dispatch: async () => {} };
    const stagedMutate = new mutations.MutateRecordInteractor(repo, policy, writer, company, background);
    const source = unwrap(
      await run(() =>
        stagedMutate.invoke({
          expectedRevision: configuredModel.revision,
          idempotencyKey: randomUUID(),
          mutation: {
            action: "create",
            typeId: sourceType.id,
            fields: [
              { fieldId: sourceType.primaryFieldId, value: { kind: "text", value: "Fan-out source" } },
              { fieldId: inputId, value: { kind: "decimal", value: "10", currency: null } },
            ],
          },
        }),
      ),
    );
    if (source.status !== "completed" || !source.refs[0]) throw new Error("Benchmark source creation failed");
    const sourceRef = source.refs[0];
    const fanout = 600;
    const targets = Array.from({ length: fanout }, () => randomUUID());
    await client.query("BEGIN");
    try {
      await client.query(
        'INSERT INTO "CrmRecord" ("companyId","typeId",id,"createdAt","updatedAt") SELECT $1,$2,id,NOW(),NOW() FROM unnest($3::text[]) id',
        [companyId, targetType.id, targets],
      );
      await client.query(
        'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"textValue","schemaRevision","createdAt","updatedAt") SELECT $1,$2,id,$4,\'value\',\'Fan-out target\',$5,NOW(),NOW() FROM unnest($3::text[]) id',
        [companyId, targetType.id, targets, targetType.primaryFieldId, configuredModel.revision],
      );
      await client.query(
        'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"decimalValue","schemaRevision","createdAt","updatedAt") SELECT $1,$2,id,$4,\'value\',10,$5,NOW(),NOW() FROM unnest($3::text[]) id',
        [companyId, targetType.id, targets, outputId, configuredModel.revision],
      );
      await client.query(
        'INSERT INTO "RecordLink" ("companyId",id,"relationId","sourceTypeId","sourceId","targetTypeId","targetId","createdAt","updatedAt") SELECT $1,id,$4,$2,id,$5,$6,NOW(),NOW() FROM unnest($3::text[]) id',
        [companyId, targetType.id, targets, relationId, sourceType.id, sourceRef.recordId],
      );
      await client.query(
        'INSERT INTO "RecordValueDependency" ("companyId","typeId","recordId","fieldId","sourceTypeId","sourceId") SELECT $1,$2,id,$4,$5,$6 FROM unnest($3::text[]) id',
        [companyId, targetType.id, targets, outputId, sourceType.id, sourceRef.recordId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    const current = unwrap(await run(() => read.invoke(sourceRef)));
    const request = {
      expectedRevision: configuredModel.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "update" as const,
        ref: sourceRef,
        expectedVersion: current.version,
        fields: [{ fieldId: inputId, value: { kind: "decimal" as const, value: "12", currency: null } }],
      },
    };
    const admissionStart = performance.now();
    const pending = unwrap(await run(() => stagedMutate.invoke(request)));
    const admissionMs = performance.now() - admissionStart;
    if (pending.status !== "pending") throw new Error("A 600-record fan-out bypassed staged execution");
    const blocked = await run(() => stagedMutate.invoke({ ...request, idempotencyKey: randomUUID() }));
    if (
      blocked.ok ||
      !blocked.error.issues.some((issue) => issue.code === "custom" && issue.params?.error === "recordWritePaused")
    )
      throw new Error("CRM writes were not rejected by the staging write pause");
    const assertValues = async (expected: string) => {
      const rows = (
        await client.query(
          'SELECT COUNT(*)::integer AS count,MIN("decimalValue")=$4::numeric AND MAX("decimalValue")=$4::numeric AND COUNT("decimalValue")=COUNT(*) AND BOOL_AND(state=\'value\') AS complete FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3',
          [companyId, targetType.id, outputId, expected],
        )
      ).rows[0];
      if (rows.count !== fanout || !rows.complete) throw new Error("Readers observed incomplete fan-out values");
      const source = unwrap(await run(() => read.invoke(sourceRef))).fields.find(
        (field) => field.fieldId === inputId,
      )?.result;
      if (source?.state !== "value" || source.value.kind !== "decimal" || source.value.value !== expected)
        throw new Error("The source and dependents were not published together");
    };
    const stageStart = performance.now();
    let advances = 0;
    for (; advances < 1000; advances += 1) {
      await assertValues("10");
      const step = await run(() =>
        new RecordOperationService(repo, policy, configurations, company).advance(pending.operationId),
      );
      if (step.done) break;
    }
    if (advances === 1000) throw new Error("The staged benchmark did not finish in its bounded number of advances");
    await assertValues("12");
    if ((await run(() => repo.getState()))?.activeOperationId)
      throw new Error("Publication did not release the write pause");
    const persisted = unwrap(await run(() => read.invoke(sourceRef)));
    if (persisted.version !== current.version + 1)
      throw new Error("The source did not publish exactly one version change");
    stagedOperation = {
      fanout,
      admissionMs: Number(admissionMs.toFixed(1)),
      stageAndPublishMs: Number((performance.now() - stageStart).toFixed(1)),
      advances: advances + 1,
      completeReadsVerified: true,
      pausedWriteRejected: true,
    };
    console.log(JSON.stringify({ name: "engine_staged_fanout", ...stagedOperation }));
  }
  const version = (await client.query("SHOW server_version")).rows[0].server_version;
  console.log(
    JSON.stringify(
      {
        layer: "production_interactors",
        cpu: cpus()[0]?.model,
        cores: cpus().length,
        memoryGiB: Math.round(totalmem() / 1024 ** 3),
        postgres: version,
        metrics,
        stagedOperation,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
  await database.prisma.$disconnect();
}
