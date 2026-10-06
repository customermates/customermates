import { channelClass } from "@/ee/messaging/provider";
import { RecordRevisionChangeSchema, type RecordRevisionChange } from "./record-revision.schema";
import { captureRecordEventMatches } from "./record-event-capture";
import { RecordEventSubscriptionSchema } from "./record-event-subscription.schema";
import { RecordActivityQuerySchema } from "@/ee/messaging/activities/record-activities.schema";
import { compileRecordSearch, type RecordSearchRow } from "./record-search-query";
import type { RecordSearch } from "./record-search.schema";
import { recordInvariant } from "./record-invariant";
import type { StoredStateRow, StoredPersonalizationRow } from "@/features/data-view/data-view-row-mapping";
import { readStoredState, readStoredPersonalizationState } from "@/features/data-view/data-view-row-mapping";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma";

import type { Action } from "@/generated/prisma";
import type { RecordRepo } from "./record.repo";
import type { CalculatedValue, RecordModel, RecordRef, RecordRelationshipSummary } from "./record-model.schema";
import type { RecordRelationshipSelection } from "./record-column.schema";
import type { RecordPathSelection } from "./record-relationship-path.schema";
import type { RecordPathSummary } from "./record-model.schema";
import type { RecordPathRow } from "./record-path-query";
import { compileRecordPathSummaries } from "./record-path-query";
import type { RecordRelationshipRow } from "./record-relationship-query";
import { compileRecordRelationshipSummaries } from "./record-relationship-query";
import type { RecordAccessMap, RecordQuery, RecordReadScope } from "./record-query.schema";
import type { RecordGroupRow } from "./record-group-query";
import { compileRecordGroups } from "./record-group-query";
import { resolveRecordGrouping } from "./record-grouping";
import { RecordGroupingResultSchema } from "./record-grouping.schema";
import { MAX_AXIS_GROUPS, NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";
import { RecordWriteError } from "./record-write.service";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { RecordMeasure } from "./record-measure.schema";
import { RecordMeasureSchema } from "./record-measure.schema";
import type { MeasureRow } from "./record-measure";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { transactionStorage } from "@/core/decorators/transaction-context";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import { CalculatedValueSchema, RecordModelSchema } from "./record-model.schema";
import { compileRecordQuery, fieldReadPredicate, recordReadPredicate } from "./record-query";
import { compileRecordMeasure } from "./record-measure";
import { encodeRecordValue, recordJson } from "./record-storage";
import type { RecordIdentity, RecordIdentityInput } from "./record-identity.schema";
import { RecordIdentitySchema } from "./record-identity.schema";
import { identityKeys, identityAssociations } from "./record-identity";
import { resolveUserFormattingTag, resolveUserLocale } from "@/i18n/user-locale";
import { RecordQuerySchema } from "./record-query.schema";
import { RecordDetailLayoutSchema, recordDetailKey } from "./record-detail-layout.schema";
import { EntityDetailOptionsSchema } from "@/features/p13n/p13n.schema";

export class PrismaRecordRepo extends TenantRepository implements RecordRepo {
  constructor(
    private readonly scopedCompanyId?: string,
    private readonly background?: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  private async wakeRecordEvents(): Promise<void> {
    if (!this.background) return;
    const companyId = this.companyId;
    const store = transactionStorage.getStore();
    if (store?.recordEventWakeups.has(companyId)) return;
    store?.recordEventWakeups.add(companyId);
    await this.background.dispatch("process-record-events", { companyId });
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  private identityDto(row: {
    id: string;
    provider: RecordIdentity["provider"];
    channelClass: string;
    value: string;
    messagingId: string | null;
    displayName: string | null;
    profileUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    keys: Array<{ value: string }>;
  }): RecordIdentity {
    return RecordIdentitySchema.parse({
      id: row.id,
      provider: row.provider,
      channelClass: row.channelClass,
      value: row.value,
      messagingId: row.messagingId,
      displayName: row.displayName,
      profileUrl: row.profileUrl,
      aliases: row.keys.map((key) => key.value),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  async getRecordIdentitiesCompanyWide(typeId: string, recordIds: string[]) {
    const identities = new Map<string, RecordIdentity[]>();
    if (!recordIds.length) return identities;
    const rows = await this.prisma.recordIdentityLink.findMany({
      where: { companyId: this.companyId, typeId, recordId: { in: recordIds } },
      orderBy: [{ createdAt: "asc" }, { identityId: "asc" }],
      include: {
        identity: {
          include: { keys: { where: { companyId: this.companyId } } },
        },
      },
    });
    for (const row of rows) {
      const values = identities.get(row.recordId) ?? [];
      values.push(this.identityDto(row.identity));
      identities.set(row.recordId, values);
    }
    return identities;
  }

  async getIdentitiesCompanyWide(ref: RecordRef) {
    return (await this.getRecordIdentitiesCompanyWide(ref.typeId, [ref.recordId])).get(ref.recordId) ?? [];
  }

  async getIdentityChannelsCompanyWide(keys: Array<{ channelClass: string; value: string }>) {
    if (!keys.length) return [];
    const rows = await this.prisma.recordIdentity.findMany({
      where: {
        companyId: this.companyId,
        keys: { some: { companyId: this.companyId, OR: keys } },
      },
      include: { keys: { where: { companyId: this.companyId } } },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => this.identityDto(row));
  }

  async getStagedIdentityChannelsCompanyWide(
    operationId: string,
    keys: Array<{ channelClass: string; value: string }>,
  ) {
    if (!keys.length) return [];
    const rows = await this.prisma.recordStageRow.findMany({
      where: {
        companyId: this.companyId,
        operationId,
        kind: "identity-key",
        key: { in: keys.map((key) => `${key.channelClass}:${key.value}`) },
      },
      select: { payload: true },
    });
    return [
      ...new Map(
        rows.map((row) => {
          const identity = RecordIdentitySchema.parse(row.payload);
          return [identity.id, identity] as const;
        }),
      ).values(),
    ];
  }

  async stageIdentityChannelsCompanyWide(operationId: string, identities: RecordIdentity[]): Promise<void> {
    if (!identities.length) return;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RecordStageRow" ("companyId", "operationId", kind, key, payload)
      SELECT DISTINCT ${this.companyId}, ${operationId}, 'identity-key', item.data->>'channelClass' || ':' || alias.value, item.data
      FROM jsonb_array_elements(${JSON.stringify(identities)}::jsonb) item(data)
      CROSS JOIN LATERAL (SELECT DISTINCT value FROM (
        SELECT item.data->>'value' AS value UNION SELECT item.data->>'messagingId'
        UNION SELECT jsonb_array_elements_text(COALESCE(item.data->'aliases', '[]'::jsonb))) aliases WHERE value IS NOT NULL) alias
      ON CONFLICT ("companyId", "operationId", kind, key) DO NOTHING
    `);
  }

  async getIdentityOwnersCompanyWide(
    keys: Array<{ channelClass: string; value: string }>,
    typeIds?: string[],
    options: { access?: RecordAccessMap; limitPerKey?: number } = {},
  ) {
    const { access, limitPerKey } = options;
    const readableTypeIds = access
      ? (typeIds ?? [...access.keys()]).filter((typeId) => (access.get(typeId)?.access ?? "none") !== "none")
      : typeIds;
    if (!keys.length || (readableTypeIds && !readableTypeIds.length)) return [];
    const uniqueKeys = [...new Map(keys.map((key) => [JSON.stringify([key.channelClass, key.value]), key])).values()];
    const typeConstraint = readableTypeIds
      ? Prisma.sql`AND association."typeId" IN (${Prisma.join(readableTypeIds)})`
      : Prisma.empty;
    const record = Prisma.sql`record`;
    const readable = access
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM (
            SELECT * FROM "CrmRecord" candidate
            WHERE candidate."companyId" = association."companyId"
              AND candidate."typeId" = association."typeId" AND candidate.id = association."recordId"
            LIMIT 1
          ) record
          WHERE ${Prisma.join(
            (readableTypeIds ?? []).map(
              (typeId) =>
                Prisma.sql`(record."typeId" = ${typeId} AND ${recordReadPredicate(this.companyId, recordInvariant(access.get(typeId)), record)})`,
            ),
            " OR ",
          )}
        )`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{ channelClass: string; value: string; identityId: string; typeId: string; recordId: string }>
    >(Prisma.sql`
      SELECT identity_key."channelClass", identity_key.value, identity_key."identityId",
        owner."typeId", owner."recordId"
      FROM (VALUES ${Prisma.join(uniqueKeys.map((key) => Prisma.sql`(${key.channelClass}::text, ${key.value}::text)`))})
        AS requested("channelClass", value)
      JOIN "RecordIdentityKey" identity_key
        ON identity_key."companyId" = ${this.companyId}
        AND identity_key."channelClass" = requested."channelClass"
        AND identity_key.value = requested.value
      CROSS JOIN LATERAL (
        SELECT association."typeId", association."recordId"
        FROM "RecordIdentityLink" association
        WHERE association."companyId" = identity_key."companyId"
          AND association."identityId" = identity_key."identityId"
          ${typeConstraint}
          ${readable}
        ORDER BY association."typeId", association."recordId"
        ${limitPerKey === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limitPerKey + 1}`}
      ) owner
      WHERE identity_key."companyId" = ${this.companyId}
      ORDER BY identity_key."channelClass", identity_key.value, owner."typeId", owner."recordId"
      ${limitPerKey === undefined ? Prisma.sql`LIMIT 10001` : Prisma.empty}
    `);
    if (limitPerKey === undefined && rows.length > 10000)
      throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    return rows.map(({ typeId, recordId, ...key }) => ({ ...key, ref: { typeId, recordId } }));
  }

  async getIdentityOwnerRefsPageCompanyWide(
    identityId: string,
    after: RecordRef | undefined,
    take: number,
    typeIds: string[],
  ) {
    if (!typeIds.length) return [];
    const rows = await this.prisma.recordIdentityLink.findMany({
      where: {
        companyId: this.companyId,
        identityId,
        typeId: { in: typeIds },
        record: { is: { companyId: this.companyId, protectedKind: null } },
        ...(after
          ? {
              OR: [{ typeId: { gt: after.typeId } }, { typeId: after.typeId, recordId: { gt: after.recordId } }],
            }
          : {}),
      },
      orderBy: [{ typeId: "asc" }, { recordId: "asc" }],
      take,
      select: { typeId: true, recordId: true },
    });
    return rows.map(({ typeId, recordId }) => ({ typeId, recordId }));
  }

  async setIdentities(ref: RecordRef, inputs: RecordIdentityInput[]): Promise<void> {
    const keys = inputs.flatMap((input) =>
      identityKeys(input).map((value) => ({
        channelClass: channelClass(input.provider),
        value,
      })),
    );
    const known = await this.getIdentityChannelsCompanyWide(keys);
    const rows = identityAssociations(inputs, known);
    const ids = rows.map((row) => row.id);
    const removed = await this.prisma.recordIdentityLink.findMany({
      where: {
        companyId: this.companyId,
        typeId: ref.typeId,
        recordId: ref.recordId,
        identityId: { notIn: ids },
      },
      select: { identityId: true },
    });
    if (removed.length) {
      await this.prisma.recordIdentityLink.deleteMany({
        where: {
          companyId: this.companyId,
          typeId: ref.typeId,
          recordId: ref.recordId,
          identityId: { in: removed.map((row) => row.identityId) },
        },
      });
    }
    const existing = new Set(known.map((row) => row.id));
    for (const { aliases, ...row } of rows) {
      if (!existing.has(row.id)) {
        await this.prisma.recordIdentity.create({
          data: { ...row, companyId: this.companyId },
        });
        await this.prisma.recordIdentityKey.createMany({
          data: identityKeys({ ...row, aliases }).map((value) => ({
            companyId: this.companyId,
            identityId: row.id,
            channelClass: row.channelClass,
            value,
          })),
        });
      }
    }
    if (ids.length) {
      await this.prisma.recordIdentityLink.createMany({
        data: ids.map((identityId) => ({
          companyId: this.companyId,
          identityId,
          ...ref,
        })),
        skipDuplicates: true,
      });
    }
    await this.deleteOrphanedIdentities(removed.map((row) => row.identityId));
  }

  private async deleteOrphanedIdentities(identityIds: string[]): Promise<void> {
    if (!identityIds.length) return;
    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "RecordIdentity" identity
      WHERE identity."companyId" = ${this.companyId} AND identity.id = ANY(${[...new Set(identityIds)]}::text[])
        AND NOT EXISTS (SELECT 1 FROM "RecordIdentityLink" association
          WHERE association."companyId" = identity."companyId" AND association."identityId" = identity.id)
    `);
  }

  async getLastFieldWritersCompanyWide(targets: Array<{ ref: RecordRef; fieldId: string }>) {
    const writers = new Map<string, string>();
    if (!targets.length) return writers;
    const rows = await this.prisma.$queryRaw<
      Array<{ typeId: string; recordId: string; fieldId: string; actorId: string }>
    >(Prisma.sql`
      SELECT target."typeId", target."recordId", target."fieldId", writer."actorId"
      FROM (VALUES ${Prisma.join(
        targets.map(
          (target) => Prisma.sql`(${target.ref.typeId}::text, ${target.ref.recordId}::text, ${target.fieldId}::text)`,
        ),
      )}) AS target("typeId", "recordId", "fieldId")
      CROSS JOIN LATERAL (
        SELECT event."actorId" FROM "RecordEvent" event
        WHERE event."companyId" = ${this.companyId} AND event."typeId" = target."typeId" AND event."recordId" = target."recordId"
          AND event.payload->'changedFieldIds' @> jsonb_build_array(target."fieldId")
        ORDER BY event."createdAt" DESC, event.id DESC
        LIMIT 1
      ) writer
    `);
    for (const row of rows) writers.set(`${row.typeId}:${row.recordId}:${row.fieldId}`, row.actorId);
    return writers;
  }

  async setIdentityResolutionCompanyWide(
    identityId: string,
    input: Pick<RecordIdentityInput, "messagingId" | "displayName" | "profileUrl">,
  ): Promise<void> {
    const row = await this.prisma.recordIdentity.findUnique({
      where: {
        companyId: this.companyId,
        companyId_id: { companyId: this.companyId, id: identityId },
      },
    });
    if (!row) return;
    const data = {
      ...(!row.messagingId && input.messagingId ? { messagingId: input.messagingId } : {}),
      ...(!row.displayName && input.displayName ? { displayName: input.displayName } : {}),
      ...(!row.profileUrl && input.profileUrl ? { profileUrl: input.profileUrl } : {}),
    };
    if (!Object.keys(data).length) return;
    if (data.messagingId) {
      await this.prisma.recordIdentityKey.createMany({
        data: [
          {
            companyId: this.companyId,
            channelClass: row.channelClass,
            value: data.messagingId,
            identityId,
          },
        ],
        skipDuplicates: true,
      });
      const owner = await this.prisma.recordIdentityKey.findUnique({
        where: {
          companyId: this.companyId,
          companyId_channelClass_value: {
            companyId: this.companyId,
            channelClass: row.channelClass,
            value: data.messagingId,
          },
        },
      });
      if (owner?.identityId !== identityId)
        throw new RecordWriteError(CustomErrorCode.channelAlreadyLinked, "conflict");
    }
    await this.prisma.recordIdentity.update({
      where: {
        companyId: this.companyId,
        companyId_id: { companyId: this.companyId, id: identityId },
      },
      data,
    });
  }
  private readonly assignmentSelect = {
    userId: true,
    user: {
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    },
  } as const;
  async getActivityWidgetQueriesCompanyWide(afterId?: string) {
    const rows = await this.prisma.widget.findMany({
      where: {
        companyId: this.companyId,
        activityQuery: { not: Prisma.AnyNull },
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      select: { id: true, activityQuery: true },
      orderBy: { id: "asc" },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      query: RecordActivityQuerySchema.parse(row.activityQuery),
    }));
  }
  async getWidgetMeasuresCompanyWide(afterId?: string) {
    const rows = await this.prisma.widget.findMany({
      where: {
        companyId: this.companyId,
        measure: { not: Prisma.AnyNull },
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      select: { id: true, measure: true },
      orderBy: { id: "asc" },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      measure: RecordMeasureSchema.parse(row.measure),
    }));
  }
  async getEventSubscriptionsCompanyWide(afterId?: string) {
    const rows = await this.prisma.recordEventSubscription.findMany({
      where: {
        companyId: this.companyId,
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: "asc" },
      take: 200,
    });
    return rows.map(({ companyId: _companyId, ...row }) => RecordEventSubscriptionSchema.parse(row));
  }
  async measure(
    measure: RecordMeasure,
    model: RecordModel,
    access: RecordAccessMap,
    currency: string,
  ): Promise<MeasureRow[]> {
    return this.prisma.$queryRaw<MeasureRow[]>(compileRecordMeasure(this.companyId, measure, model, access, currency));
  }
  @BypassTenantGuard
  async failOperationUnscoped(input: { companyId: string; userId: string; operationId: string }): Promise<void> {
    await runInTransaction(
      async () => {
        const result = await this.prisma.recordOperation.updateMany({
          where: {
            companyId: input.companyId,
            id: input.operationId,
            userId: input.userId,
            state: { in: ["pending", "staging"] },
          },
          data: {
            state: "failed",
            errorCode: "worker_failed",
            leaseUntil: null,
          },
        });
        if (result.count) await this.releaseTerminalOperation(input.companyId, input.operationId);
      },
      { companyId: input.companyId },
    );
  }

  async getState() {
    return this.prisma.recordSchemaState.findUnique({
      where: { companyId: this.companyId },
    });
  }

  async getModel(): Promise<RecordModel> {
    const state = await this.getState();
    if (!state || state.revision === 0) {
      return RecordModelSchema.parse({
        revision: 0,
        types: [],
        fields: [],
        relationships: [],
      });
    }
    const revision = await this.prisma.recordSchemaRevision.findUnique({
      where: {
        companyId: this.companyId,
        companyId_revision: {
          companyId: this.companyId,
          revision: state.revision,
        },
      },
    });
    return RecordModelSchema.parse(recordInvariant(revision).snapshot);
  }

  async getWorkspaceCurrencyOrThrow(): Promise<string> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: this.companyId },
      select: { currency: true },
    });
    return company.currency;
  }

  async getDetailLayoutsCompanyWide(typeIds: string[], afterId?: string) {
    if (!typeIds.length) return [];
    const rows = await this.prisma.p13n.findMany({
      where: {
        companyId: this.companyId,
        p13nId: { in: typeIds.map(recordDetailKey) },
        detailOptions: { not: Prisma.AnyNull },
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      select: {
        id: true,
        p13nId: true,
        detailOptions: true,
        columnOrder: true,
      },
      orderBy: { id: "asc" },
      take: 200,
    });
    return rows.map((row) => {
      const options = EntityDetailOptionsSchema.parse(row.detailOptions);
      return {
        id: row.id,
        typeId: row.p13nId.slice("record-detail:".length),
        layout: RecordDetailLayoutSchema.parse({
          pinnedFields: options.starredFieldIds,
          hiddenFields: options.hiddenFieldIds ?? [],
          fieldOrder: options.fieldOrder ?? row.columnOrder ?? [],
        }),
      };
    });
  }

  async getViewStatesCompanyWide(typeIds: string[], afterKey = "") {
    if (!typeIds.length) return [];
    const surfaces = Prisma.join(typeIds.map(recordSurfaceKey));
    const rows = await this.prisma.$queryRaw<
      Array<{
        key: string;
        surface: string;
        kind: "view" | "personalization";
        payload: StoredStateRow & StoredPersonalizationRow;
      }>
    >(Prisma.sql`
      SELECT * FROM (
        SELECT 'view:' || v."id" AS key, v."surfaceKey" AS surface, 'view' AS kind, to_jsonb(v) AS payload
        FROM "DataView" v WHERE v."companyId" = ${this.companyId} AND v."surfaceKey" IN (${surfaces})
        UNION ALL
        SELECT 'personalization:' || p."id" AS key, p."p13nId" AS surface, 'personalization' AS kind, to_jsonb(p) AS payload
        FROM "P13n" p WHERE p."companyId" = ${this.companyId} AND p."p13nId" IN (${surfaces})
      ) consumers WHERE key > ${afterKey} ORDER BY key LIMIT 200
    `);
    return rows.map((row) => ({
      key: row.key,
      typeId: row.surface.slice(8),
      state: row.kind === "view" ? readStoredState(row.payload) : readStoredPersonalizationState(row.payload),
    }));
  }

  async getGrants() {
    return this.prisma.recordTypeGrant.findMany({
      where: { companyId: this.companyId },
    });
  }

  async countRecordsCompanyWide(typeIds: string[]) {
    return this.prisma.crmRecord.count({
      where: { companyId: this.companyId, typeId: { in: typeIds } },
    });
  }

  async validRecordRolesCompanyWide(roleIds: string[]): Promise<boolean> {
    return (
      (await this.prisma.userRole.count({
        where: { companyId: this.companyId, id: { in: roleIds } },
      })) === new Set(roleIds).size
    );
  }

  async validateRelationshipCardinality(model: RecordModel): Promise<string[]> {
    const invalid: string[] = [];
    for (const relation of model.relationships) {
      if (relation.archived) continue;
      for (const [cardinality, column] of [
        [relation.sourceCardinality, "sourceId"],
        [relation.targetCardinality, "targetId"],
      ]) {
        if (cardinality !== "one") continue;
        const rows = await this.prisma.$queryRaw<Array<{ invalid: boolean }>>(
          Prisma.sql`SELECT EXISTS (SELECT 1 FROM "RecordLink" WHERE "companyId" = ${this.companyId} AND "relationId" = ${relation.id} GROUP BY ${Prisma.raw(`"${column}"`)} HAVING COUNT(*) > 1) AS invalid`,
        );
        if (rows[0]?.invalid) invalid.push(relation.id);
      }
    }
    for (const type of model.types) {
      if (type.archived || !type.parentRelationshipId) continue;
      const rows = await this.prisma.$queryRaw<Array<{ invalid: boolean }>>(Prisma.sql`
        SELECT EXISTS (SELECT 1 FROM "CrmRecord" record
          WHERE record."companyId" = ${this.companyId} AND record."typeId" = ${type.id}
            AND NOT EXISTS (SELECT 1 FROM "RecordLink" link
              WHERE link."companyId" = record."companyId" AND link."relationId" = ${type.parentRelationshipId}
                AND link."sourceTypeId" = record."typeId" AND link."sourceId" = record.id)) AS invalid`);
      if (rows[0]?.invalid) invalid.push(type.parentRelationshipId);
    }
    return [...new Set(invalid)];
  }

  async saveModel(model: RecordModel, actorId: string, change?: RecordRevisionChange): Promise<void> {
    const companyId = this.companyId;
    for (const type of model.types) {
      const data = {
        companyId,
        label: type.label,
        pluralLabel: type.pluralLabel,
        archived: type.archived,
        embedded: type.embedded,
        position: type.position,
        definition: recordJson(type),
      };
      await this.prisma.recordTypeDefinition.upsert({
        where: { companyId_id: { companyId, id: type.id } },
        create: { ...data, id: type.id },
        update: data,
      });
    }
    for (const field of model.fields) {
      const data = {
        companyId,
        typeId: field.typeId,
        valueType: field.valueType,
        behavior: field.behavior.kind,
        archived: field.archived,
        definition: recordJson(field),
      };
      await this.prisma.recordFieldDefinition.upsert({
        where: { companyId_id: { companyId, id: field.id } },
        create: { ...data, id: field.id },
        update: data,
      });
    }
    for (const relation of model.relationships) {
      const data = {
        companyId,
        sourceTypeId: relation.sourceTypeId,
        targetTypeId: relation.targetTypeId,
        archived: relation.archived,
        definition: recordJson(relation),
      };
      await this.prisma.recordRelationshipDefinition.upsert({
        where: { companyId_id: { companyId, id: relation.id } },
        create: { ...data, id: relation.id },
        update: data,
      });
    }
    await this.prisma.recordSchemaState.upsert({
      where: { companyId },
      create: { companyId, revision: model.revision, storageMode: "generic" },
      update: { companyId, revision: model.revision },
    });
    await this.prisma.recordSchemaRevision.create({
      data: {
        companyId,
        revision: model.revision,
        actorId,
        snapshot: recordJson(model),
        ...(change ? { change: recordJson(RecordRevisionChangeSchema.parse(change)) } : {}),
      },
    });
  }

  async setGrants(typeId: string, grants: Array<{ roleId: string; actions: Action[] }>): Promise<void> {
    const companyId = this.companyId;
    await this.prisma.recordTypeGrant.deleteMany({
      where: { companyId, typeId },
    });
    if (grants.length) {
      await this.prisma.recordTypeGrant.createMany({
        data: grants.map((grant) => ({ ...grant, companyId, typeId })),
      });
    }
  }

  async getRecordCompanyWide(ref: RecordRef) {
    return this.prisma.crmRecord.findUnique({
      relationLoadStrategy: "query",
      where: {
        companyId: this.companyId,
        companyId_typeId_id: {
          companyId: this.companyId,
          typeId: ref.typeId,
          id: ref.recordId,
        },
      },
      include: { values: true, assignments: { select: this.assignmentSelect } },
    });
  }

  async getRecordsCompanyWide(refs: RecordRef[]) {
    if (!refs.length) return [];
    return this.prisma.crmRecord.findMany({
      relationLoadStrategy: "query",
      where: {
        companyId: this.companyId,
        OR: refs.map((ref) => ({ typeId: ref.typeId, id: ref.recordId })),
      },
      include: { values: true, assignments: { select: this.assignmentSelect } },
    });
  }

  async getEmbeddedChildrenCompanyWide(
    typeId: string,
    parentRelationId: string,
    parentIds: string[],
    afterId: string | undefined,
    take: number,
  ) {
    if (!parentIds.length) return [];
    return this.prisma.crmRecord.findMany({
      relationLoadStrategy: "query",
      where: {
        companyId: this.companyId,
        typeId,
        ...(afterId ? { id: { gt: afterId } } : {}),
        outgoing: {
          some: {
            companyId: this.companyId,
            relationId: parentRelationId,
            targetId: { in: parentIds },
          },
        },
      },
      orderBy: { id: "asc" },
      take,
      include: { values: true, assignments: { select: this.assignmentSelect } },
    });
  }

  async getRecordRefsCompanyWide(typeId: string, afterId?: string, take = 500): Promise<RecordRef[]> {
    const records = await this.prisma.crmRecord.findMany({
      where: {
        companyId: this.companyId,
        typeId,
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: "asc" },
      take,
      select: { id: true },
    });
    return records.map((record) => ({ typeId, recordId: record.id }));
  }

  async searchRecords(
    request: { search: RecordSearch; includeEmbedded?: boolean } | { refs: RecordRef[] },
    model: RecordModel,
    access: RecordAccessMap,
  ): Promise<RecordSearchRow[]> {
    const sql = compileRecordSearch(this.companyId, model, access, request);
    return sql ? this.prisma.$queryRaw<RecordSearchRow[]>(sql) : [];
  }

  async query(
    query: RecordQuery,
    model: RecordModel,
    access: RecordAccessMap,
    memberScope: RecordReadScope = { userId: "", access: "none" },
  ) {
    query = {
      ...query,
      locale:
        query.locale ??
        RecordQuerySchema.shape.locale.parse(
          resolveUserFormattingTag(this.user, resolveUserLocale(this.user)).slice(0, 2),
        ),
    };
    if (query.grouping) return this.queryGroups(query, model, access, memberScope);
    const sql = compileRecordQuery(this.companyId, query, model, access);
    const [ids, count] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(sql.ids),
      this.prisma.$queryRaw<Array<{ count: number }>>(sql.count),
    ]);
    const records = await this.getRecordsCompanyWide(ids.map((row) => ({ typeId: query.typeId, recordId: row.id })));
    const positions = new Map(ids.map((row, index) => [row.id, index]));
    records.sort((left, right) => recordInvariant(positions.get(left.id)) - recordInvariant(positions.get(right.id)));
    const visibleFields = await this.visibleFields(
      records.map((record) => ({ typeId: record.typeId, recordId: record.id })),
      model,
      access,
    );
    return { records, total: count[0]?.count ?? 0, visibleFields };
  }

  private async queryGroups(
    query: RecordQuery,
    model: RecordModel,
    access: RecordAccessMap,
    memberScope: RecordReadScope,
  ) {
    const resolved = query.grouping && resolveRecordGrouping(query.typeId, query.grouping, model);
    if (!resolved) throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
    const rows = await this.prisma.$queryRaw<RecordGroupRow[]>(
      compileRecordGroups(
        this.companyId,
        query,
        model,
        access,
        memberScope,
        query.groupSummaries?.length ? await this.getWorkspaceCurrencyOrThrow() : "",
      ),
    );
    if (rows.some((row) => row.restricted)) throw new RecordWriteError(CustomErrorCode.permissionDenied);
    if (rows.some((row) => row.overflowWithRecords))
      throw new RecordWriteError(CustomErrorCode.recordCalculationBudget);
    let valueGroups = 0;
    const axisRows = rows.filter((row) => row.key === NO_VALUE_GROUP_KEY || ++valueGroups <= MAX_AXIS_GROUPS);
    const groups = query.groupPage?.only ? axisRows.filter((row) => row.key === query.groupPage?.only) : axisRows;
    if (!groups.length) throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
    const ids = [...new Set(groups.flatMap((group) => group.itemIds))];
    if (ids.length > 1000) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget);
    const records = await this.getRecordsCompanyWide(ids.map((recordId) => ({ typeId: query.typeId, recordId })));
    const visibleFields = await this.visibleFields(
      records.map((record) => ({ typeId: record.typeId, recordId: record.id })),
      model,
      access,
    );
    const total = rows[0]?.total ?? 0;
    const grouping = RecordGroupingResultSchema.parse({
      timeZone: resolved.kind === "dateBucket" ? "UTC" : undefined,
      grouping: resolved.grouping,
      kind: resolved.kind,
      columnId: resolved.source.kind === "field" ? resolved.source.field.id : undefined,
      supportsDragWriteBack: false,
      total,
      membershipTotal: rows[0]?.membershipTotal ?? 0,
      partial: Boolean(query.groupPage?.only),
      groups: groups.map((row) => ({
        ...row.metadata,
        key: row.key,
        count: row.count,
        materialised: row.materialised,
        itemIds: row.itemIds,
        hasMore: row.count > row.itemIds.length,
        ...(row.summaries ? { summaries: row.summaries } : {}),
      })),
    });
    return { records, visibleFields, total, grouping };
  }

  private async visibleFields(
    refs: RecordRef[],
    model: RecordModel,
    access: RecordAccessMap,
  ): Promise<Map<string, Set<string>>> {
    const result = new Map(refs.map((ref) => [ref.recordId, new Set<string>()]));
    if (!refs.length) return result;
    const typeId = refs[0].typeId;
    const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
    if (!fields.length) return result;
    const projections = fields.map(
      (field) =>
        Prisma.sql`${fieldReadPredicate(this.companyId, field, model, access)} AS ${Prisma.raw(`"${field.id}"`)}`,
    );
    const rows = await this.prisma.$queryRaw<Array<Record<string, boolean | string>>>(
      Prisma.sql`SELECT "record_0"."id", ${Prisma.join(projections, ", ")} FROM "CrmRecord" "record_0" WHERE "record_0"."companyId" = ${this.companyId} AND "record_0"."typeId" = ${typeId} AND "record_0"."id" IN (${Prisma.join(refs.map((ref) => ref.recordId))})`,
    );
    for (const row of rows)
      for (const field of fields) if (row[field.id] === true) recordInvariant(result.get(String(row.id))).add(field.id);
    return result;
  }

  async getVisibleFields(ref: RecordRef, model: RecordModel, access: RecordAccessMap): Promise<Set<string>> {
    return (await this.visibleFields([ref], model, access)).get(ref.recordId) ?? new Set();
  }

  async getVisibleFieldsCompanyWide(refs: RecordRef[], model: RecordModel, access: RecordAccessMap) {
    return this.visibleFields(refs, model, access);
  }

  async relationshipSummaries(
    typeId: string,
    recordIds: string[],
    selections: RecordRelationshipSelection[],
    model: RecordModel,
    access: RecordAccessMap,
  ) {
    const summaries = new Map<string, RecordRelationshipSummary[]>(
      recordIds.map((id) => [
        id,
        selections.map((selection) => ({
          relationId: selection.relationId,
          direction: selection.direction,
          records: [],
          readableCount: 0,
          hasMore: false,
        })),
      ]),
    );
    const sql = compileRecordRelationshipSummaries(this.companyId, typeId, recordIds, selections, model, access);
    if (!sql) return summaries;
    const rows = await this.prisma.$queryRaw<RecordRelationshipRow[]>(sql);
    for (const row of rows) {
      const summary = recordInvariant(
        summaries
          .get(row.ownerId)
          ?.find((summary) => summary.relationId === row.relationId && summary.direction === row.direction),
      );
      const title: CalculatedValue =
        row.state === "value" && row.title !== null
          ? { state: "value", value: { kind: "text", value: row.title } }
          : row.state === "restricted"
            ? { state: "restricted" }
            : row.state === "error"
              ? CalculatedValueSchema.parse({
                  state: "error",
                  code: row.errorCode,
                })
              : { state: "missing" };
      summary.records.push({
        ref: { typeId: row.typeId, recordId: row.recordId },
        title,
      });
      summary.readableCount = row.readableCount;
      summary.hasMore = row.readableCount > summary.records.length;
    }
    return summaries;
  }

  async pathSummaries(
    typeId: string,
    recordIds: string[],
    selections: RecordPathSelection[],
    model: RecordModel,
    access: RecordAccessMap,
  ) {
    const summaries = new Map<string, RecordPathSummary[]>(
      recordIds.map((id) => [
        id,
        selections.map((selection) => ({
          pathId: selection.pathId,
          records: [],
          readableCount: 0,
          hasMore: false,
        })),
      ]),
    );
    const sql = compileRecordPathSummaries(this.companyId, typeId, recordIds, selections, model, access);
    if (!sql) return summaries;
    const rows = await this.prisma.$queryRaw<RecordPathRow[]>(sql);
    for (const row of rows) {
      const summary = recordInvariant(summaries.get(row.ownerId)?.find((summary) => summary.pathId === row.pathId));
      const title: CalculatedValue =
        row.state === "value" && row.title !== null
          ? { state: "value", value: { kind: "text", value: row.title } }
          : row.state === "restricted"
            ? { state: "restricted" }
            : row.state === "error"
              ? CalculatedValueSchema.parse({
                  state: "error",
                  code: row.errorCode,
                })
              : { state: "missing" };
      summary.records.push({
        ref: { typeId: row.typeId, recordId: row.recordId },
        title,
      });
      summary.readableCount = row.readableCount;
      summary.hasMore = row.readableCount > summary.records.length;
    }
    return summaries;
  }

  async create(ref: RecordRef, assignedUserIds: string[]): Promise<void> {
    await this.prisma.crmRecord.create({
      data: { companyId: this.companyId, typeId: ref.typeId, id: ref.recordId },
    });
    await this.setAssignments(ref, assignedUserIds);
  }

  async touch(ref: RecordRef): Promise<void> {
    await this.prisma.crmRecord.update({
      where: {
        companyId: this.companyId,
        companyId_typeId_id: {
          companyId: this.companyId,
          typeId: ref.typeId,
          id: ref.recordId,
        },
      },
      data: { version: { increment: 1 }, updatedAt: new Date() },
    });
  }

  async hasRecordHistoryCompanyWide(ref: RecordRef): Promise<boolean> {
    const [event, audit] = await Promise.all([
      this.prisma.recordEvent.findFirst({
        where: { companyId: this.companyId, typeId: ref.typeId, recordId: ref.recordId },
        select: { id: true },
      }),
      this.prisma.auditLog.findFirst({
        where: { companyId: this.companyId, entityId: ref.recordId },
        select: { id: true },
      }),
    ]);
    return Boolean(event || audit);
  }

  async delete(ref: RecordRef): Promise<void> {
    await this.prisma.recordValueDependency.deleteMany({
      where: { companyId: this.companyId, sourceTypeId: ref.typeId, sourceId: ref.recordId },
    });
    const identities = await this.prisma.recordIdentityLink.findMany({
      where: { companyId: this.companyId, typeId: ref.typeId, recordId: ref.recordId },
      select: { identityId: true },
    });
    await this.prisma.crmRecord.delete({
      where: {
        companyId: this.companyId,
        companyId_typeId_id: {
          companyId: this.companyId,
          typeId: ref.typeId,
          id: ref.recordId,
        },
      },
    });
    await this.deleteOrphanedIdentities(identities.map((row) => row.identityId));
  }

  async setAssignments(ref: RecordRef, userIds: string[]): Promise<void> {
    const companyId = this.companyId;
    await this.prisma.recordAssignment.deleteMany({
      where: { companyId, typeId: ref.typeId, recordId: ref.recordId },
    });
    if (userIds.length) {
      await this.prisma.recordAssignment.createMany({
        data: [...new Set(userIds)].map((userId) => ({
          companyId,
          typeId: ref.typeId,
          recordId: ref.recordId,
          userId,
        })),
      });
    }
  }

  async setValue(ref: RecordRef, fieldId: string, result: CalculatedValue, revision: number): Promise<void> {
    const companyId = this.companyId;
    const data = encodeRecordValue(result);
    const json = data.jsonValue === null ? null : JSON.stringify(data.jsonValue);
    const range = result.state === "value" && result.value.kind === "range" ? result.value : null;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RecordValue" (
        "companyId", "typeId", "recordId", "fieldId", "state", "textValue",
        "textListValue", "decimalValue", "currency", "booleanValue", "instantValue",
        "lexicalValue", "jsonValue", "errorCode", "schemaRevision", "updatedAt", "rangeStart", "rangeEnd"
      ) VALUES (
        ${companyId}, ${ref.typeId}, ${ref.recordId}, ${fieldId}, ${data.state}, ${data.textValue},
        ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(data.textListValue)}::jsonb)),
        ${data.decimalValue?.toFixed() ?? null}::numeric, ${data.currency}, ${data.booleanValue},
        ${data.lexicalValue}::timestamptz AT TIME ZONE 'UTC', ${data.lexicalValue},
        ${json}::jsonb, ${data.errorCode}, ${revision}, CURRENT_TIMESTAMP,
        ${range?.start ?? null}::timestamptz AT TIME ZONE 'UTC', ${range?.end ?? null}::timestamptz AT TIME ZONE 'UTC'
      )
      ON CONFLICT ("companyId", "typeId", "recordId", "fieldId") DO UPDATE SET
        "state" = EXCLUDED."state", "textValue" = EXCLUDED."textValue",
        "textListValue" = EXCLUDED."textListValue", "decimalValue" = EXCLUDED."decimalValue",
        "currency" = EXCLUDED."currency", "booleanValue" = EXCLUDED."booleanValue",
        "instantValue" = EXCLUDED."instantValue", "lexicalValue" = EXCLUDED."lexicalValue",
        "jsonValue" = EXCLUDED."jsonValue", "errorCode" = EXCLUDED."errorCode",
        "rangeStart" = EXCLUDED."rangeStart", "rangeEnd" = EXCLUDED."rangeEnd",
        "schemaRevision" = EXCLUDED."schemaRevision", "updatedAt" = EXCLUDED."updatedAt"
    `);
  }

  async setValueDependencies(ref: RecordRef, fieldId: string, sources: RecordRef[]): Promise<void> {
    const owner = {
      companyId: this.companyId,
      typeId: ref.typeId,
      recordId: ref.recordId,
      fieldId,
    };
    await this.prisma.recordValueDependency.deleteMany({ where: owner });
    if (sources.length) {
      await this.prisma.recordValueDependency.createMany({
        data: sources.map((source) => ({
          ...owner,
          sourceTypeId: source.typeId,
          sourceId: source.recordId,
        })),
        skipDuplicates: true,
      });
    }
  }

  async getValueDependencies(ref: RecordRef, fieldId: string): Promise<RecordRef[]> {
    const rows = await this.prisma.recordValueDependency.findMany({
      where: {
        companyId: this.companyId,
        typeId: ref.typeId,
        recordId: ref.recordId,
        fieldId,
      },
      select: { sourceTypeId: true, sourceId: true },
    });
    return rows.map((row) => ({
      typeId: row.sourceTypeId,
      recordId: row.sourceId,
    }));
  }

  async getRecordDependenciesCompanyWide(ref: RecordRef) {
    const rows = await this.prisma.recordValueDependency.findMany({
      where: {
        companyId: this.companyId,
        typeId: ref.typeId,
        recordId: ref.recordId,
      },
      select: { fieldId: true, sourceTypeId: true, sourceId: true },
      orderBy: [{ fieldId: "asc" }, { sourceTypeId: "asc" }, { sourceId: "asc" }],
    });
    const fields = new Map<string, RecordRef[]>();
    for (const row of rows) {
      const sources = fields.get(row.fieldId) ?? [];
      sources.push({ typeId: row.sourceTypeId, recordId: row.sourceId });
      fields.set(row.fieldId, sources);
    }
    return [...fields].map(([fieldId, sources]) => ({ fieldId, sources }));
  }

  async getLinksCompanyWide(ref: RecordRef, take?: number) {
    const rows = await this.prisma.recordLink.findMany({
      where: {
        companyId: this.companyId,
        OR: [
          { sourceTypeId: ref.typeId, sourceId: ref.recordId },
          { targetTypeId: ref.typeId, targetId: ref.recordId },
        ],
      },
      orderBy: { id: "asc" },
      ...(take === undefined ? {} : { take }),
    });
    return rows.map((row) => ({
      relationId: row.relationId,
      source: { typeId: row.sourceTypeId, recordId: row.sourceId },
      target: { typeId: row.targetTypeId, recordId: row.targetId },
    }));
  }

  async getLinksCompanyWidePage(ref: RecordRef, afterId: string | undefined, take: number) {
    const rows = await this.prisma.recordLink.findMany({
      where: {
        companyId: this.companyId,
        ...(afterId ? { id: { gt: afterId } } : {}),
        OR: [
          { sourceTypeId: ref.typeId, sourceId: ref.recordId },
          { targetTypeId: ref.typeId, targetId: ref.recordId },
        ],
      },
      orderBy: { id: "asc" },
      take,
    });
    return rows.map((row) => ({
      id: row.id,
      relationId: row.relationId,
      source: { typeId: row.sourceTypeId, recordId: row.sourceId },
      target: { typeId: row.targetTypeId, recordId: row.targetId },
    }));
  }

  async getPendingDeletionRef(operationId: string): Promise<RecordRef | null> {
    const rows = await this.prisma.$queryRaw<RecordRef[]>(Prisma.sql`
      SELECT pending.payload->>'typeId' AS "typeId", pending.payload->>'recordId' AS "recordId"
      FROM "RecordStageRow" pending
      WHERE pending."companyId" = ${this.companyId} AND pending."operationId" = ${operationId}
        AND pending.kind = 'delete-pending'
        AND NOT EXISTS (SELECT 1 FROM "RecordStageRow" visited
          WHERE visited."companyId" = pending."companyId" AND visited."operationId" = pending."operationId"
            AND visited.kind = 'delete-plan' AND visited.key = pending.key)
      ORDER BY pending.key LIMIT 1`);
    return rows[0] ?? null;
  }

  async queueDeletionRef(operationId: string, ref: RecordRef): Promise<void> {
    const key = `${ref.typeId}:${ref.recordId}`;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RecordStageRow" ("companyId", "operationId", kind, key, payload)
      SELECT ${this.companyId}, ${operationId}, 'delete-pending', ${key}, ${JSON.stringify(ref)}::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM "RecordStageRow" visited
        WHERE visited."companyId" = ${this.companyId} AND visited."operationId" = ${operationId}
          AND visited.kind = 'delete-plan' AND visited.key = ${key})
      ON CONFLICT DO NOTHING`);
  }

  async completeDeletionRef(operationId: string, ref: RecordRef): Promise<void> {
    await this.prisma.recordStageRow.deleteMany({
      where: {
        companyId: this.companyId,
        operationId,
        kind: "delete-pending",
        key: `${ref.typeId}:${ref.recordId}`,
      },
    });
  }

  async getStagedDeletionStatus(operationId: string, revision: number) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        recordCount: number;
        linkCount: number;
        affectedCount: number;
        affectedTypeIds: string[];
        restricted: boolean;
        impactHash: string;
      }>
    >(Prisma.sql`
      WITH entries AS (
        SELECT kind, key, payload FROM "RecordStageRow"
        WHERE "companyId" = ${this.companyId} AND "operationId" = ${operationId}
          AND kind IN ('delete-plan', 'delete-link', 'delete-affected', 'delete-restrict')
      ), records AS (
        SELECT COUNT(*)::integer AS count,
          COALESCE('[' || string_agg(to_json(key || ':' || (payload->>'version'))::text, ',' ORDER BY key) || ']', '[]') AS json
        FROM entries WHERE kind = 'delete-plan'
      ), links AS (
        SELECT COUNT(*)::integer AS count,
          COALESCE('[' || string_agg(to_json(key)::text, ',' ORDER BY key) || ']', '[]') AS json
        FROM entries WHERE kind = 'delete-link'
      )
      SELECT records.count AS "recordCount", links.count AS "linkCount",
        (SELECT COUNT(*)::integer FROM entries WHERE kind = 'delete-affected') AS "affectedCount",
        ARRAY(SELECT DISTINCT payload->>'typeId' FROM entries WHERE kind = 'delete-affected') AS "affectedTypeIds",
        EXISTS (SELECT 1 FROM entries restricted WHERE restricted.kind = 'delete-restrict'
          AND NOT EXISTS (SELECT 1 FROM entries deleted WHERE deleted.kind = 'delete-plan' AND deleted.key = restricted.key)) AS restricted,
        encode(sha256(convert_to('{"revision":' || ${revision}::text || ',"records":' || records.json || ',"links":' || links.json || '}', 'UTF8')), 'hex') AS "impactHash"
      FROM records CROSS JOIN links`);
    return recordInvariant(rows[0]);
  }

  async validateStagedDeletionAccess(operationId: string, access: RecordAccessMap): Promise<boolean> {
    const root = Prisma.raw('"deleted_record"');
    const permitted = [...access].map(
      ([typeId, scope]) =>
        Prisma.sql`(${root}."typeId" = ${typeId} AND ${recordReadPredicate(this.companyId, scope, root)})`,
    );
    const rows = await this.prisma.$queryRaw<Array<{ valid: boolean }>>(Prisma.sql`
      SELECT NOT EXISTS (SELECT 1 FROM "RecordStageRow" stage
        WHERE stage."companyId" = ${this.companyId} AND stage."operationId" = ${operationId}
          AND stage.kind = 'record' AND (stage.payload->>'deleted')::boolean
          AND NOT EXISTS (SELECT 1 FROM "CrmRecord" ${root}
            WHERE ${root}."companyId" = ${this.companyId} AND ${root}."typeId" = stage.payload->'ref'->>'typeId'
              AND ${root}.id = stage.payload->'ref'->>'recordId' AND ${root}."protectedKind" IS NULL
              AND ${root}.version = (stage.payload->>'version')::integer
              AND EXISTS (SELECT 1 FROM "RecordStageRow" planned
                WHERE planned."companyId" = ${this.companyId} AND planned."operationId" = ${operationId}
                  AND planned.kind = 'delete-plan' AND planned.key = stage.key
                  AND ${root}.version = (planned.payload->>'version')::integer)
              AND (${permitted.length ? Prisma.join(permitted, " OR ") : Prisma.sql`FALSE`}))) AS valid`);
    return recordInvariant(rows[0]).valid;
  }

  async getOutgoingLinksCompanyWide(typeId: string, recordIds: string[], take: number) {
    if (!recordIds.length) return [];
    const rows = await this.prisma.recordLink.findMany({
      where: {
        companyId: this.companyId,
        sourceTypeId: typeId,
        sourceId: { in: recordIds },
      },
      orderBy: { id: "asc" },
      take,
    });
    return rows.map((row) => ({
      relationId: row.relationId,
      source: { typeId: row.sourceTypeId, recordId: row.sourceId },
      target: { typeId: row.targetTypeId, recordId: row.targetId },
    }));
  }

  async linkedRecordsCompanyWide(
    ref: RecordRef,
    relationId: string,
    direction: "outgoing" | "incoming",
    take?: number,
  ): Promise<RecordRef[]> {
    const outgoing = direction === "outgoing";
    const rows = await this.prisma.recordLink.findMany({
      where: {
        companyId: this.companyId,
        relationId,
        ...(outgoing
          ? { sourceTypeId: ref.typeId, sourceId: ref.recordId }
          : { targetTypeId: ref.typeId, targetId: ref.recordId }),
      },
      take,
      select: {
        sourceTypeId: true,
        sourceId: true,
        targetTypeId: true,
        targetId: true,
      },
    });
    return rows.map((row) =>
      outgoing
        ? { typeId: row.targetTypeId, recordId: row.targetId }
        : { typeId: row.sourceTypeId, recordId: row.sourceId },
    );
  }

  async link(relationId: string, source: RecordRef, target: RecordRef): Promise<void> {
    await this.prisma.recordLink.create({
      data: {
        companyId: this.companyId,
        relationId,
        sourceTypeId: source.typeId,
        sourceId: source.recordId,
        targetTypeId: target.typeId,
        targetId: target.recordId,
      },
    });
  }

  async unlink(relationId: string, source: RecordRef, target: RecordRef): Promise<void> {
    await this.prisma.recordLink.deleteMany({
      where: {
        companyId: this.companyId,
        relationId,
        sourceTypeId: source.typeId,
        sourceId: source.recordId,
        targetTypeId: target.typeId,
        targetId: target.recordId,
      },
    });
  }

  async receipt(idempotencyKey: string, userId: string) {
    return this.prisma.recordMutationReceipt.findUnique({
      where: {
        companyId: this.companyId,
        companyId_userId_idempotencyKey: {
          companyId: this.companyId,
          userId,
          idempotencyKey,
        },
      },
      select: { requestHash: true, result: true },
    });
  }

  async saveReceipt(idempotencyKey: string, userId: string, requestHash: string, result: unknown): Promise<void> {
    await this.prisma.recordMutationReceipt.create({
      data: {
        companyId: this.companyId,
        userId,
        idempotencyKey,
        requestHash,
        result: recordJson(result),
      },
    });
  }

  async appendEvent(
    ref: RecordRef,
    actorId: string,
    causeId: string,
    kind: string,
    payload: unknown,
    beforeDeletion = false,
  ): Promise<void> {
    const id = randomUUID();
    await this.prisma.recordEvent.create({
      data: {
        companyId: this.companyId,
        id,
        typeId: ref.typeId,
        recordId: ref.recordId,
        actorId,
        causeId,
        kind,
        payload: recordJson(payload),
      },
    });
    await captureRecordEventMatches(this.prisma, this, this.companyId, { eventId: id }, beforeDeletion);
    await this.wakeRecordEvents();
  }

  async createOperation(request: {
    id: string;
    userId: string;
    kind: string;
    expectedRevision: number;
    request: unknown;
    stagedSchema?: RecordModel;
  }) {
    const companyId = this.companyId;
    const operation = await this.prisma.recordOperation.create({
      data: {
        ...request,
        request: recordJson(request.request),
        ...(request.stagedSchema ? { stagedSchema: recordJson(request.stagedSchema) } : {}),
        companyId,
      },
    });
    await this.prisma.recordSchemaState.update({
      where: { companyId },
      data: { activeOperationId: operation.id },
    });
    return operation;
  }

  async getOperation(id: string) {
    return this.prisma.recordOperation.findUnique({
      where: {
        companyId: this.companyId,
        companyId_id: { companyId: this.companyId, id },
      },
    });
  }

  async updateOperation(
    id: string,
    data: {
      state?: string;
      processed?: number;
      total?: number;
      cursor?: Prisma.InputJsonValue;
      result?: Prisma.InputJsonValue;
      errorCode?: string | null;
      leaseUntil?: Date | null;
    },
  ): Promise<void> {
    await this.prisma.recordOperation.update({
      where: {
        companyId: this.companyId,
        companyId_id: { companyId: this.companyId, id },
      },
      data,
    });
  }

  async stageRow(operationId: string, kind: string, key: string, payload: unknown): Promise<void> {
    const companyId = this.companyId;
    await this.prisma.recordStageRow.upsert({
      where: {
        companyId_operationId_kind_key: { companyId, operationId, kind, key },
      },
      create: {
        companyId,
        operationId,
        kind,
        key,
        payload: recordJson(payload),
      },
      update: { companyId, payload: recordJson(payload) },
    });
  }

  async getStageRows(operationId: string, kind: string) {
    return this.prisma.recordStageRow.findMany({
      where: { companyId: this.companyId, operationId, kind },
      select: { key: true, payload: true },
    });
  }

  async getStageRow(operationId: string, kind: string, key: string) {
    const row = await this.prisma.recordStageRow.findUnique({
      where: {
        companyId: this.companyId,
        companyId_operationId_kind_key: {
          companyId: this.companyId,
          operationId,
          kind,
          key,
        },
      },
      select: { payload: true },
    });
    return row?.payload ?? null;
  }

  async getStageRowsPage(operationId: string, kind: string, afterKey: string | undefined, take: number) {
    return this.prisma.recordStageRow.findMany({
      where: {
        companyId: this.companyId,
        operationId,
        kind,
        ...(afterKey ? { key: { gt: afterKey } } : {}),
      },
      select: { key: true, payload: true },
      orderBy: { key: "asc" },
      take,
    });
  }

  async getStageRowsByPrefix(operationId: string, kind: string, prefix: string) {
    return this.prisma.recordStageRow.findMany({
      where: {
        companyId: this.companyId,
        operationId,
        kind,
        key: { startsWith: prefix },
      },
      select: { key: true, payload: true },
    });
  }

  async getStageRecordRefsCompanyWide(
    operationId: string,
    typeId: string,
    afterId?: string,
    take = 500,
  ): Promise<RecordRef[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`WITH candidates AS (
      SELECT record."id" FROM "CrmRecord" record WHERE record."companyId" = ${this.companyId} AND record."typeId" = ${typeId}
        AND NOT EXISTS (SELECT 1 FROM "RecordStageRow" stage WHERE stage."companyId" = ${this.companyId} AND stage."operationId" = ${operationId} AND stage.kind = 'record' AND stage.key = record."typeId" || ':' || record.id AND (stage.payload->>'deleted')::boolean)
      UNION SELECT stage.payload->'ref'->>'recordId' FROM "RecordStageRow" stage WHERE stage."companyId" = ${this.companyId} AND stage."operationId" = ${operationId} AND stage.kind = 'record' AND stage.payload->'ref'->>'typeId' = ${typeId} AND NOT (stage.payload->>'deleted')::boolean
    ) SELECT id FROM candidates WHERE ${afterId ? Prisma.sql`id > ${afterId}` : Prisma.sql`TRUE`} ORDER BY id LIMIT ${take}`);
    return rows.map((row) => ({ typeId, recordId: row.id }));
  }

  async linkedStageRecordsCompanyWide(
    operationId: string,
    ref: RecordRef,
    relationId: string,
    direction: "outgoing" | "incoming",
    take = 1000000,
  ): Promise<RecordRef[]> {
    const outgoing = direction === "outgoing";
    const sourceId = Prisma.raw(outgoing ? 'link."sourceId"' : 'link."targetId"');
    const typeColumn = Prisma.raw(outgoing ? 'link."targetTypeId"' : 'link."sourceTypeId"');
    const idColumn = Prisma.raw(outgoing ? 'link."targetId"' : 'link."sourceId"');
    const sourceKey = outgoing ? "source" : "target";
    const targetKey = outgoing ? "target" : "source";
    return this.prisma.$queryRaw<RecordRef[]>(Prisma.sql`WITH candidates AS (
      SELECT ${typeColumn} AS "typeId", ${idColumn} AS "recordId" FROM "RecordLink" link
        WHERE link."companyId" = ${this.companyId} AND link."relationId" = ${relationId} AND ${sourceId} = ${ref.recordId}
        AND NOT EXISTS (SELECT 1 FROM "RecordStageRow" stage WHERE stage."companyId" = ${this.companyId} AND stage."operationId" = ${operationId} AND stage.kind = 'link' AND stage.key = link."relationId" || ':' || link."sourceId" || ':' || link."targetId")
      UNION SELECT stage.payload->${targetKey}->>'typeId', stage.payload->${targetKey}->>'recordId' FROM "RecordStageRow" stage
        WHERE stage."companyId" = ${this.companyId} AND stage."operationId" = ${operationId} AND stage.kind = 'link' AND stage.payload->>'relationId' = ${relationId} AND stage.payload->${sourceKey}->>'recordId' = ${ref.recordId} AND NOT (stage.payload->>'deleted')::boolean
    ) SELECT * FROM candidates WHERE NOT EXISTS (SELECT 1 FROM "RecordStageRow" stage WHERE stage."companyId" = ${this.companyId} AND stage."operationId" = ${operationId} AND stage.kind = 'record' AND stage.key = candidates."typeId" || ':' || candidates."recordId" AND (stage.payload->>'deleted')::boolean)
    ORDER BY "typeId", "recordId" LIMIT ${take}`);
  }

  async publishStage(operationId: string, revision: number): Promise<void> {
    const companyId = this.companyId;
    const stage = (kind: string) =>
      Prisma.sql`stage."companyId" = ${companyId} AND stage."operationId" = ${operationId} AND stage.kind = ${kind}`;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RecordEvent" ("companyId", id, "typeId", "recordId", "actorId", "causeId", kind, payload, "createdAt", attempts, "nextAttemptAt")
      SELECT ${companyId}, stage.payload->>'id', stage.payload->'ref'->>'typeId', stage.payload->'ref'->>'recordId',
        stage.payload->>'actorId', stage.payload->>'causeId', stage.payload->>'kind', stage.payload->'payload', NOW(), 0, NOW()
      FROM "RecordStageRow" stage WHERE ${stage("event")}
    `);
    await captureRecordEventMatches(this.prisma, this, companyId, { operationId }, true);
    const detachedIdentities = await this.prisma.$queryRaw<Array<{ identityId: string }>>(Prisma.sql`
      SELECT DISTINCT association."identityId" FROM "RecordIdentityLink" association JOIN "RecordStageRow" stage
        ON stage.payload->'ref'->>'typeId' = association."typeId" AND stage.payload->'ref'->>'recordId' = association."recordId"
      WHERE association."companyId" = ${companyId} AND (
        (${stage("record")} AND (stage.payload->>'deleted')::boolean)
        OR (${stage("identity")} AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(stage.payload->'identities') item(data) WHERE item.data->>'id' = association."identityId"))
      )
    `);
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM "CrmRecord" record USING "RecordStageRow" stage WHERE ${stage("record")} AND (stage.payload->>'deleted')::boolean AND record."companyId" = ${companyId} AND record."typeId" = stage.payload->'ref'->>'typeId' AND record.id = stage.payload->'ref'->>'recordId'`,
    );
    await this.prisma
      .$executeRaw(Prisma.sql`INSERT INTO "CrmRecord" ("companyId", "typeId", id, version, "protectedKind", "systemData", "createdAt", "updatedAt")
      SELECT ${companyId}, stage.payload->'ref'->>'typeId', stage.payload->'ref'->>'recordId', (stage.payload->>'version')::integer, stage.payload->>'protectedKind', NULLIF(stage.payload->'systemData', 'null'::jsonb), (stage.payload->>'createdAt')::timestamp, (stage.payload->>'updatedAt')::timestamp FROM "RecordStageRow" stage WHERE ${stage("record")} AND NOT (stage.payload->>'deleted')::boolean
      ON CONFLICT ("companyId", "typeId", id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = EXCLUDED."updatedAt"`);
    const collisions = await this.prisma.$queryRaw<Array<{ collision: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM "RecordStageRow" stage CROSS JOIN LATERAL jsonb_array_elements(stage.payload->'identities') item(data)
        CROSS JOIN LATERAL (SELECT DISTINCT value FROM (
          SELECT item.data->>'value' AS value UNION SELECT item.data->>'messagingId'
          UNION SELECT jsonb_array_elements_text(COALESCE(item.data->'aliases', '[]'::jsonb))) aliases WHERE value IS NOT NULL) alias
        JOIN "RecordIdentityKey" key ON key."companyId" = ${companyId} AND key."channelClass" = item.data->>'channelClass' AND key.value = alias.value
        WHERE ${stage("identity")} AND key."identityId" <> item.data->>'id'
      ) AS collision`);
    if (collisions[0]?.collision) throw new RecordWriteError(CustomErrorCode.channelAlreadyLinked, "conflict");
    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "RecordIdentityLink" association USING "RecordStageRow" stage
      WHERE ${stage("identity")} AND association."companyId" = ${companyId}
        AND association."typeId" = stage.payload->'ref'->>'typeId' AND association."recordId" = stage.payload->'ref'->>'recordId'
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(stage.payload->'identities') item(data) WHERE item.data->>'id' = association."identityId")
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RecordIdentity" ("companyId", id, provider, "channelClass", value, "messagingId", "displayName", "profileUrl", "createdAt", "updatedAt")
      SELECT DISTINCT ON (item.data->>'id') ${companyId}, item.data->>'id', (item.data->>'provider')::"MessagingProvider",
        item.data->>'channelClass', item.data->>'value', item.data->>'messagingId', item.data->>'displayName', item.data->>'profileUrl',
        (item.data->>'createdAt')::timestamp, (item.data->>'updatedAt')::timestamp
      FROM "RecordStageRow" stage CROSS JOIN LATERAL jsonb_array_elements(stage.payload->'identities') AS item(data)
      JOIN "CrmRecord" record ON record."companyId" = ${companyId} AND record."typeId" = stage.payload->'ref'->>'typeId' AND record.id = stage.payload->'ref'->>'recordId'
      WHERE ${stage("identity")} ON CONFLICT ("companyId", id) DO NOTHING
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RecordIdentityKey" ("companyId", "channelClass", value, "identityId")
      SELECT DISTINCT ${companyId}, item.data->>'channelClass', alias.value, item.data->>'id'
      FROM "RecordStageRow" stage CROSS JOIN LATERAL jsonb_array_elements(stage.payload->'identities') item(data)
      CROSS JOIN LATERAL (SELECT DISTINCT value FROM (
        SELECT item.data->>'value' AS value UNION SELECT item.data->>'messagingId'
        UNION SELECT jsonb_array_elements_text(COALESCE(item.data->'aliases', '[]'::jsonb))) aliases WHERE value IS NOT NULL) alias
      JOIN "RecordIdentity" identity ON identity."companyId" = ${companyId} AND identity.id = item.data->>'id'
      WHERE ${stage("identity")} ON CONFLICT ("companyId", "channelClass", value) DO NOTHING
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RecordIdentityLink" ("companyId", "identityId", "typeId", "recordId")
      SELECT DISTINCT ${companyId}, item.data->>'id', record."typeId", record.id
      FROM "RecordStageRow" stage CROSS JOIN LATERAL jsonb_array_elements(stage.payload->'identities') item(data)
      JOIN "CrmRecord" record ON record."companyId" = ${companyId} AND record."typeId" = stage.payload->'ref'->>'typeId' AND record.id = stage.payload->'ref'->>'recordId'
      WHERE ${stage("identity")} ON CONFLICT ("companyId", "identityId", "typeId", "recordId") DO NOTHING
    `);
    await this.deleteOrphanedIdentities(detachedIdentities.map((row) => row.identityId));
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM "RecordAssignment" assignment USING "RecordStageRow" stage WHERE ${stage("record")} AND assignment."companyId" = ${companyId} AND assignment."typeId" = stage.payload->'ref'->>'typeId' AND assignment."recordId" = stage.payload->'ref'->>'recordId'`,
    );
    await this.prisma.$executeRaw(
      Prisma.sql`INSERT INTO "RecordAssignment" ("companyId", "typeId", "recordId", "userId", "createdAt") SELECT ${companyId}, stage.payload->'ref'->>'typeId', stage.payload->'ref'->>'recordId', member.id, NOW() FROM "RecordStageRow" stage CROSS JOIN LATERAL jsonb_array_elements_text(stage.payload->'assignedUserIds') AS member(id) WHERE ${stage("record")} AND NOT (stage.payload->>'deleted')::boolean`,
    );
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM "RecordLink" link USING "RecordStageRow" stage WHERE ${stage("link")} AND link."companyId" = ${companyId} AND link."relationId" = stage.payload->>'relationId' AND link."sourceId" = stage.payload->'source'->>'recordId' AND link."targetId" = stage.payload->'target'->>'recordId'`,
    );
    await this.prisma
      .$executeRaw(Prisma.sql`INSERT INTO "RecordLink" ("companyId", id, "relationId", "sourceTypeId", "sourceId", "targetTypeId", "targetId", "createdAt", "updatedAt")
      SELECT ${companyId}, stage.payload->>'id', stage.payload->>'relationId', stage.payload->'source'->>'typeId', stage.payload->'source'->>'recordId', stage.payload->'target'->>'typeId', stage.payload->'target'->>'recordId', NOW(), NOW() FROM "RecordStageRow" stage WHERE ${stage("link")} AND NOT (stage.payload->>'deleted')::boolean`);
    await this.prisma
      .$executeRaw(Prisma.sql`INSERT INTO "RecordValue" ("companyId", "typeId", "recordId", "fieldId", state, "textValue", "decimalValue", currency, "booleanValue", "instantValue", "jsonValue", "errorCode", "schemaRevision", "createdAt", "updatedAt", "textListValue", "lexicalValue", "rangeStart", "rangeEnd")
      SELECT ${companyId}, stage.payload->'ref'->>'typeId', stage.payload->'ref'->>'recordId', stage.payload->>'fieldId', stage.payload->'result'->>'state',
        CASE WHEN stage.payload->'result'->'value'->>'kind' IN ('text', 'select', 'member') THEN stage.payload->'result'->'value'->>'value' END,
        CASE WHEN stage.payload->'result'->'value'->>'kind' = 'decimal' THEN (stage.payload->'result'->'value'->>'value')::numeric END,
        stage.payload->'result'->'value'->>'currency',
        CASE WHEN stage.payload->'result'->'value'->>'kind' = 'boolean' THEN (stage.payload->'result'->'value'->>'value')::boolean END,
        CASE WHEN stage.payload->'result'->'value'->>'kind' IN ('date', 'dateTime') THEN (stage.payload->'result'->'value'->>'value')::timestamptz AT TIME ZONE 'UTC' END,
        CASE WHEN stage.payload->'result'->'value'->>'kind' = 'richText' THEN (stage.payload->'result'->'value'->>'documentJson')::jsonb WHEN stage.payload->'result'->'value'->>'kind' = 'range' THEN (stage.payload->'result'->'value') - 'kind' END,
        stage.payload->'result'->>'code', ${revision}, NOW(), NOW(),
        CASE WHEN stage.payload->'result'->'value'->>'kind' = 'textList' THEN ARRAY(SELECT jsonb_array_elements_text(stage.payload->'result'->'value'->'value')) ELSE ARRAY[]::text[] END,
        CASE WHEN stage.payload->'result'->'value'->>'kind' IN ('date', 'dateTime') THEN stage.payload->'result'->'value'->>'value' END,
        CASE WHEN stage.payload->'result'->'value'->>'kind' = 'range' THEN (stage.payload->'result'->'value'->>'start')::timestamptz AT TIME ZONE 'UTC' END,
        CASE WHEN stage.payload->'result'->'value'->>'kind' = 'range' THEN (stage.payload->'result'->'value'->>'end')::timestamptz AT TIME ZONE 'UTC' END FROM "RecordStageRow" stage JOIN "CrmRecord" record ON record."companyId" = ${companyId} AND record."typeId" = stage.payload->'ref'->>'typeId' AND record.id = stage.payload->'ref'->>'recordId' WHERE ${stage("value")}
      ON CONFLICT ("companyId", "typeId", "recordId", "fieldId") DO UPDATE SET state = EXCLUDED.state, "textValue" = EXCLUDED."textValue", "decimalValue" = EXCLUDED."decimalValue", currency = EXCLUDED.currency, "booleanValue" = EXCLUDED."booleanValue", "instantValue" = EXCLUDED."instantValue", "textListValue" = EXCLUDED."textListValue", "lexicalValue" = EXCLUDED."lexicalValue", "jsonValue" = EXCLUDED."jsonValue", "errorCode" = EXCLUDED."errorCode", "schemaRevision" = EXCLUDED."schemaRevision", "updatedAt" = EXCLUDED."updatedAt", "rangeStart" = EXCLUDED."rangeStart", "rangeEnd" = EXCLUDED."rangeEnd"`);
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM "RecordValueDependency" dependency USING "RecordStageRow" stage WHERE ${stage("dependency")} AND dependency."companyId" = ${companyId} AND dependency."typeId" = stage.payload->'ref'->>'typeId' AND dependency."recordId" = stage.payload->'ref'->>'recordId' AND dependency."fieldId" = stage.payload->>'fieldId'`,
    );
    await this.prisma.$executeRaw(
      Prisma.sql`INSERT INTO "RecordValueDependency" ("companyId", "typeId", "recordId", "fieldId", "sourceTypeId", "sourceId") SELECT ${companyId}, stage.payload->'ref'->>'typeId', stage.payload->'ref'->>'recordId', stage.payload->>'fieldId', source.ref->>'typeId', source.ref->>'recordId' FROM "RecordStageRow" stage CROSS JOIN LATERAL jsonb_array_elements(stage.payload->'sources') AS source(ref) JOIN "RecordValue" value ON value."companyId" = ${companyId} AND value."typeId" = stage.payload->'ref'->>'typeId' AND value."recordId" = stage.payload->'ref'->>'recordId' AND value."fieldId" = stage.payload->>'fieldId' WHERE ${stage("dependency")} ON CONFLICT DO NOTHING`,
    );
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM "RecordValueDependency" dependency USING "RecordStageRow" stage WHERE ${stage("record")} AND (stage.payload->>'deleted')::boolean AND dependency."companyId" = ${companyId} AND dependency."sourceTypeId" = stage.payload->'ref'->>'typeId' AND dependency."sourceId" = stage.payload->'ref'->>'recordId'`,
    );
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "CrmRecord" record SET version = record.version + 1, "updatedAt" = NOW() WHERE record."companyId" = ${companyId} AND EXISTS (SELECT 1 FROM "RecordStageRow" stage WHERE (${stage("value")} OR ${stage("dependency")}) AND stage.payload->'ref'->>'typeId' = record."typeId" AND stage.payload->'ref'->>'recordId' = record.id) AND NOT EXISTS (SELECT 1 FROM "RecordStageRow" stage WHERE ${stage("record")} AND stage.key = record."typeId" || ':' || record.id)`,
    );
    await captureRecordEventMatches(this.prisma, this, companyId, {
      operationId,
    });
    await this.wakeRecordEvents();
  }

  async clearOperationLock(id: string): Promise<void> {
    await this.releaseTerminalOperation(this.companyId, id);
  }

  private async releaseTerminalOperation(companyId: string, id: string): Promise<void> {
    const operation = await this.prisma.recordOperation.findUnique({
      where: { companyId, companyId_id: { companyId, id } },
      select: { state: true },
    });
    if (!operation) return;
    if (!["completed", "cancelled", "failed"].includes(operation.state))
      throw new RecordWriteError(CustomErrorCode.recordVersionChanged, "conflict");
    await this.prisma.recordSchemaState.updateMany({
      where: { companyId, activeOperationId: id },
      data: { activeOperationId: null },
    });
    await this.prisma.recordStageRow.deleteMany({
      where: { companyId, operationId: id },
    });
  }
}
