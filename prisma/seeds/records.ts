import { readRecordModelSnapshot } from "@/features/records/record-model-snapshot";
import { SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS } from "./hosted-ai-operator";
import { Prisma, type PrismaClient } from "@/generated/prisma";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { type RecordModel, type RecordRef, type RecordScalar } from "@/features/records/record-model.schema";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { RecordCalculationService, type CalculationRecordRepo } from "@/features/records/record-calculation.service";
import { encodeRecordValue, recordJson } from "@/features/records/record-storage";
import type { SeedContext } from "./context";
import type { SyntheticSeedData } from "./run";
import type { CustomFieldSeedData, SyntheticRecordType } from "./custom-fields";
import { SYNTHETIC_CUSTOM_FIELD_IDS } from "./custom-fields";

export function syntheticRecordModel(context: Pick<SeedContext, "ids">, fields: CustomFieldSeedData): RecordModel {
  const companyId = context.ids.company;
  const id = (key: string) => presetId(companyId, key);
  const preset = createCrmPreset(companyId);
  const modelFields = preset.fields.filter((field) => field.id !== id("deal.stage"));
  for (const field of fields.customFields)
    modelFields.push({ ...field, position: modelFields.filter((existing) => existing.typeId === field.typeId).length });
  for (const field of modelFields) {
    if ([id("deal.totalValue"), id("deal.totalQuantity"), id("deal.weightedValue")].includes(field.id))
      field.publishedSummary = true;
  }
  const weighted = modelFields.find((field) => field.id === id("deal.weightedValue"));
  if (!weighted || weighted.behavior.kind !== "formula") throw new Error("Synthetic weighted value is missing");
  weighted.behavior = {
    kind: "formula",
    expression: {
      kind: "operation",
      operator: "divide",
      arguments: [
        {
          kind: "operation",
          operator: "multiply",
          arguments: [
            { kind: "field", fieldId: id("deal.totalValue") },
            { kind: "optionAttribute", fieldId: SYNTHETIC_CUSTOM_FIELD_IDS.dealStatus, attribute: "probability" },
          ],
        },
        { kind: "literal", value: { kind: "decimal", value: "100", currency: null } },
      ],
    },
  };
  const model: RecordModel = {
    ...preset,
    fields: modelFields,
    types: preset.types.map((type) => {
      const columns = [
        ...type.defaults.columns.filter((column) => column !== id("deal.stage")),
        ...fields.customFields.filter((field) => field.typeId === type.id).map((field) => field.id),
      ];
      return {
        ...type,
        defaults: {
          ...type.defaults,
          columns,
          groupBy: type.id === id("deal") ? SYNTHETIC_CUSTOM_FIELD_IDS.dealStatus : type.defaults.groupBy,
        },
      };
    }),
  };
  const parsed = readRecordModelSnapshot(model);
  const issues = validateRecordModel(parsed).issues;
  if (issues.length) throw new Error(`Invalid synthetic record configuration: ${JSON.stringify(issues)}`);
  return parsed;
}

async function initialize(
  prisma: Prisma.TransactionClient,
  companyId: string,
  proposed: RecordModel,
): Promise<RecordModel> {
  const current = await prisma.recordSchemaState.findUnique({ where: { companyId } });
  if (current?.activeOperationId) throw new Error("Cannot seed records while a CRM operation is active");
  if (current && current.storageMode !== "generic")
    throw new Error("Complete the legacy upgrade before seeding generic records");
  if (current) {
    const revision = await prisma.recordSchemaRevision.findUniqueOrThrow({
      where: { companyId_revision: { companyId, revision: current.revision } },
    });
    return readRecordModelSnapshot(revision.snapshot);
  }
  for (const type of proposed.types) {
    const presetKey =
      ["contact", "organization", "deal", "service", "task", "lineItem"].find(
        (kind) => presetId(companyId, kind) === type.id,
      ) ?? null;
    await prisma.recordTypeDefinition.create({
      data: {
        companyId,
        id: type.id,
        presetKey,
        label: type.label,
        pluralLabel: type.pluralLabel,
        archived: type.archived,
        embedded: type.embedded,
        position: type.position,
        definition: recordJson(type),
      },
    });
  }
  for (const field of proposed.fields) {
    await prisma.recordFieldDefinition.create({
      data: {
        companyId,
        typeId: field.typeId,
        id: field.id,
        valueType: field.valueType,
        behavior: field.behavior.kind,
        archived: field.archived,
        definition: recordJson(field),
      },
    });
  }
  for (const relation of proposed.relationships) {
    await prisma.recordRelationshipDefinition.create({
      data: {
        companyId,
        id: relation.id,
        sourceTypeId: relation.sourceTypeId,
        targetTypeId: relation.targetTypeId,
        archived: relation.archived,
        definition: recordJson(relation),
      },
    });
  }
  await prisma.recordSchemaState.create({ data: { companyId, revision: proposed.revision, storageMode: "generic" } });
  await prisma.recordSchemaRevision.create({
    data: { companyId, revision: proposed.revision, actorId: "system:synthetic-seed", snapshot: recordJson(proposed) },
  });
  const permissions = await prisma.rolePermission.findMany({ where: { companyId } });
  for (const kind of ["contact", "organization", "deal", "service", "task"] as const) {
    const byRole = new Map<string, typeof permissions>();
    for (const permission of permissions.filter((entry) => entry.resource === `${kind}s`)) {
      const entries = byRole.get(permission.roleId) ?? [];
      entries.push(permission);
      byRole.set(permission.roleId, entries);
    }
    for (const [roleId, entries] of byRole) {
      await prisma.recordTypeGrant.create({
        data: { companyId, typeId: presetId(companyId, kind), roleId, actions: entries.map((entry) => entry.action) },
      });
    }
  }
  return proposed;
}

export function syntheticCalculationRepo(prisma: Prisma.TransactionClient, companyId: string): CalculationRecordRepo {
  return {
    getRecordCompanyWide: (ref) =>
      prisma.crmRecord.findUnique({
        where: { companyId_typeId_id: { companyId, typeId: ref.typeId, id: ref.recordId } },
        include: { values: true, assignments: true },
      }),
    linkedRecordsCompanyWide: async (ref, relationId, direction, take = 501) => {
      const rows = await prisma.recordLink.findMany({
        where: {
          companyId,
          relationId,
          ...(direction === "outgoing"
            ? { sourceTypeId: ref.typeId, sourceId: ref.recordId }
            : { targetTypeId: ref.typeId, targetId: ref.recordId }),
        },
        orderBy: { id: "asc" },
        take,
      });
      return rows.map((row) =>
        direction === "outgoing"
          ? { typeId: row.targetTypeId, recordId: row.targetId }
          : { typeId: row.sourceTypeId, recordId: row.sourceId },
      );
    },
    setValue: async (ref, fieldId, result, schemaRevision) => {
      const encoded = encodeRecordValue(result),
        key = { companyId, typeId: ref.typeId, recordId: ref.recordId, fieldId };
      const data = { ...key, ...encoded, jsonValue: encoded.jsonValue ?? Prisma.DbNull, schemaRevision };
      await prisma.recordValue.upsert({
        where: { companyId_typeId_recordId_fieldId: key },
        create: data,
        update: data,
      });
    },
    getValueDependencies: async (ref, fieldId) =>
      (
        await prisma.recordValueDependency.findMany({
          where: { companyId, typeId: ref.typeId, recordId: ref.recordId, fieldId },
        })
      ).map((row) => ({ typeId: row.sourceTypeId, recordId: row.sourceId })),
    setValueDependencies: async (ref, fieldId, sources) => {
      await prisma.recordValueDependency.deleteMany({
        where: { companyId, typeId: ref.typeId, recordId: ref.recordId, fieldId },
      });
      if (sources.length) {
        await prisma.recordValueDependency.createMany({
          data: sources.map((source) => ({
            companyId,
            typeId: ref.typeId,
            recordId: ref.recordId,
            fieldId,
            sourceTypeId: source.typeId,
            sourceId: source.recordId,
          })),
        });
      }
    },
  };
}

export async function seedRecordFixtures(
  context: SeedContext,
  entities: SyntheticSeedData,
  fields: CustomFieldSeedData,
): Promise<void> {
  const proposed = syntheticRecordModel(context, fields),
    companyId = context.ids.company;
  await context.prisma.$transaction(
    async (prisma) => {
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 0))`;
      const model = await initialize(prisma, companyId, proposed),
        records = syntheticCalculationRepo(prisma, companyId);
      for (const [kind, prefix] of [
        ["contact", "60000000-"],
        ["organization", "70000000-"],
        ["deal", "80000000-"],
        ["service", "90000000-"],
        ["task", "a0000000-"],
      ] as const) {
        await prisma.crmRecord.deleteMany({
          where: {
            companyId,
            typeId: presetId(companyId, kind),
            id: { startsWith: prefix, notIn: entities[`${kind}s`].map((row) => row.id) },
          },
        });
      }

      const save = async (
        kind: SyntheticRecordType,
        row: { id: string; createdAt: Date; updatedAt: Date },
        values: Array<[string, RecordScalar | null]>,
      ) => {
        const ref = { typeId: presetId(companyId, kind), recordId: row.id };
        const key = { companyId, typeId: ref.typeId, id: ref.recordId },
          data = { ...key, createdAt: row.createdAt, updatedAt: row.updatedAt };
        await prisma.crmRecord.upsert({ where: { companyId_typeId_id: key }, create: data, update: data });
        for (const [name, value] of values) {
          const field = model.fields.find((field) => field.id === presetId(companyId, `${kind}.${name}`));
          if (!field) throw new Error(`Synthetic field is missing: ${kind}.${name}`);
          if (field.behavior.kind !== "input") throw new Error(`Synthetic field behavior has changed: ${kind}.${name}`);
          await records.setValue(
            ref,
            field.id,
            value ? { state: "value", value } : { state: "missing" },
            model.revision,
          );
        }
      };
      for (const row of entities.contacts) {
        await save("contact", row, [
          ["firstName", { kind: "text", value: row.firstName }],
          ["lastName", { kind: "text", value: row.lastName }],
          ["avatarUrl", row.avatarUrl ? { kind: "text", value: row.avatarUrl } : null],
          ["notes", null],
        ]);
      }
      for (const kind of ["organization", "deal", "service", "task"] as const) {
        const rows = entities[`${kind}s`];
        for (const row of rows) {
          await save(kind, row, [
            ["name", { kind: "text", value: row.name }],
            ["notes", null],
            ...(kind === "service"
              ? [
                  [
                    "amount",
                    {
                      kind: "decimal",
                      value: String((row as SyntheticSeedData["services"][number]).amount),
                      currency: "EUR",
                    },
                  ] as [string, RecordScalar],
                ]
              : []),
          ]);
        }
      }
      for (const row of fields.customFieldValues) {
        const field = model.fields.find((field) => field.id === row.fieldId);
        if (!field || field.typeId !== presetId(companyId, row.recordType) || field.behavior.kind !== "input")
          throw new Error("Synthetic custom field has changed");
        await records.setValue(
          { typeId: field.typeId, recordId: row.recordId },
          field.id,
          { state: "value", value: row.value },
          model.revision,
        );
      }
    },
    { maxWait: 60000, timeout: 600000 },
  );
  // Operator-only fixture workspaces also initialize directly on generic storage.
  const companies = await context.prisma.company.findMany({
    where: {
      id: {
        in: [
          context.ids.hostedAiFixtureCompany,
          ...SYNTHETIC_HOSTED_AI_OPERATOR_USER_DEFINITIONS.map((fixture) => fixture.companyId),
        ],
      },
      recordSchemaState: null,
    },
    select: { id: true },
  });
  for (const company of companies) {
    await context.prisma.$transaction((prisma) =>
      initialize(prisma, company.id, createCrmPreset(company.id)).then(() => undefined),
    );
  }
}

export async function calculateSyntheticRecords(prisma: PrismaClient, companyId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 0))`;
      const state = await tx.recordSchemaState.findUniqueOrThrow({ where: { companyId } });
      if (state.activeOperationId) throw new Error("Cannot seed calculations during a CRM operation");
      const revision = await tx.recordSchemaRevision.findUniqueOrThrow({
        where: { companyId_revision: { companyId, revision: state.revision } },
      });
      const model = readRecordModelSnapshot(revision.snapshot);
      const refs: RecordRef[] = (
        await tx.crmRecord.findMany({ where: { companyId }, select: { typeId: true, id: true } })
      ).map((row) => ({ typeId: row.typeId, recordId: row.id }));
      const result = await new RecordCalculationService(syntheticCalculationRepo(tx, companyId)).recalculate(
        model,
        refs,
        new Map(),
        10000,
      );
      if (!result.complete) throw new Error("Synthetic calculation exceeded its record budget");
    },
    { maxWait: 60000, timeout: 600000 },
  );
}
