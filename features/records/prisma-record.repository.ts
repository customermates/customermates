import { unwindFailure } from "@/core/validation/failure-unwind";
import { channelClass } from "@/ee/messaging/provider";
import { RecordRevisionChangeSchema, type RecordRevisionChange } from "./record-revision.schema";
import { recordAccessForActor } from "./record-access";
import { invalidRecordQueryPart } from "./record-query-validation";
import { RecordEventSubscriptionSchema } from "./record-event-subscription.schema";
import { RecordActivityQuerySchema } from "@/ee/messaging/activities/record-activities.schema";
import {
  compileRecordSearch,
  SIMILAR_TITLE_MIN_WORD_SIMILARITY,
  type RecordSearchRequest,
  type RecordSearchRow,
} from "./record-search-query";
import { recordInvariant } from "./record-invariant";
import { readStoredState, readStoredPersonalizationState } from "@/features/data-view/data-view-row-mapping";
import { deletionReference, targetKey, type ConfigurationDeletionRecord } from "./configuration-lifecycle";
import type { ConfigurationTarget } from "./configuration.schema";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma";

import type { Action } from "@/generated/prisma";
import type {
  ConfigurationConsumerCleanup,
  RecordDefinitionDeletion,
  RecordPlacement,
  RecordRepo,
  RecordRepoOwners,
  RecordTrashItemInput,
  TrashReadOptions,
} from "./record.repo";
import { CONFIGURATION_CONSUMER_PAGE } from "./record.repo";
import { rankBetween, recordManualOrderKey } from "./record-rank";
import type { CalculatedValue, RecordModel, RecordRef, RecordRelationshipSummary } from "./record-model.schema";
import type { RecordRelationshipSelection } from "./record-column.schema";
import type { RecordPathSelection } from "./record-relationship-path.schema";
import type { RecordMember, RecordPathSummary } from "./record-model.schema";
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
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { RecordMeasure } from "./record-measure.schema";
import { RecordMeasureSchema } from "./record-measure.schema";
import type { MeasureRow } from "./record-measure";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { wakeEventOutbox } from "@/features/event/event-outbox.repo";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import { CalculatedValueSchema, RecordModelSchema } from "./record-model.schema";
import { compileRecordQuery, fieldReadPredicate, recordReadPredicate } from "./record-query";
import { compileRecordMeasure } from "./record-measure";
import { encodeRecordValue, recordJson } from "./record-storage";
import { canonicalRecordJson } from "./record-json";
import type { RecordIdentity, RecordIdentityInput } from "./record-identity.schema";
import { RecordIdentitySchema } from "./record-identity.schema";
import { identityKeys, identityAssociations } from "./record-identity";
import { resolveUserFormattingTag, resolveUserLocale } from "@/i18n/user-locale";
import { RecordQuerySchema } from "./record-query.schema";
import { RecordDetailLayoutSchema, recordDetailKey } from "./record-detail-layout.schema";
import { EntityDetailOptionsSchema } from "@/features/p13n/p13n.schema";
import { configurationTrashBatchId } from "./configuration-trash-batch";
import type { ProviderAvatarRecordRepo, RecordOperationUpdate } from "./provider-avatar-record.repo";
import type { DueRecordOperation, RecordOperationQueueRepo } from "./record-operation-queue.repo";

const CONFIGURATION_DELETION_PAGE = 200;
const STAGED_EVENT_PAGE = 1000;
const PERSONALIZATION_KEY = "personalization:";
const VIEW_KEY = "view:";

export class PrismaRecordRepo
  extends TenantRepository
  implements RecordRepo, ProviderAvatarRecordRepo, RecordOperationQueueRepo
{
  private resolvedOwners?: RecordRepoOwners;

  constructor(
    private readonly resolveOwners: () => RecordRepoOwners,
    private readonly scopedCompanyId?: string,
    private readonly background?: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  private get owners(): RecordRepoOwners {
    this.resolvedOwners ??= this.resolveOwners();
    return this.resolvedOwners;
  }

  private forCompany(companyId: string): PrismaRecordRepo {
    if (companyId === this.scopedCompanyId) return this;
    return new PrismaRecordRepo(() => this.owners, companyId, this.background);
  }

  private async wakeRecordEvents(): Promise<void> {
    if (this.background) await wakeEventOutbox(this.background, this.companyId);
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

  getIdentityProviderValueCompanyWide(id: string) {
    return this.prisma.recordIdentity.findUnique({
      where: { companyId: this.companyId, companyId_id: { companyId: this.companyId, id } },
      select: { provider: true, value: true },
    });
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
    const rows = new Map<string, Prisma.RecordStageRowCreateManyInput>();
    for (const identity of identities) {
      const payload = recordJson(identity);
      for (const alias of new Set([identity.value, identity.messagingId, ...(identity.aliases ?? [])])) {
        if (alias === null || alias === undefined) continue;
        const key = `${identity.channelClass}:${alias}`;
        if (!rows.has(key))
          rows.set(key, { companyId: this.companyId, operationId, kind: "identity-key", key, payload });
      }
    }
    await this.prisma.recordStageRow.createMany({ data: [...rows.values()], skipDuplicates: true });
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
          AND EXISTS (SELECT 1 FROM "CrmRecord" live WHERE live."companyId" = association."companyId"
            AND live."typeId" = association."typeId" AND live.id = association."recordId" AND live."deletedAt" IS NULL)
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
      throw unwindFailure(CustomErrorCode.recordCalculationBudget, "conflict");
    return rows.map(({ typeId, recordId, ...key }) => ({ ...key, ref: { typeId, recordId } }));
  }

  private async getIdentityOwnerRefsPageCompanyWide(
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
        record: { is: { companyId: this.companyId, protectedKind: null, deletedAt: null } },
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
    await this.prisma.recordIdentity.deleteMany({
      where: { companyId: this.companyId, id: { in: [...new Set(identityIds)] }, records: { none: {} } },
    });
  }

  async getLastFieldWritersCompanyWide(targets: Array<{ ref: RecordRef; fieldId: string }>) {
    return this.owners.events.getLastFieldWritersCompanyWide(this.companyId, targets);
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
      if (owner?.identityId !== identityId) throw unwindFailure(CustomErrorCode.channelAlreadyLinked, "conflict");
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
    const rows = await this.owners.widgets.getActivityQueriesCompanyWide(this.companyId, afterId);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      query: RecordActivityQuerySchema.parse(row.definition),
      trashed: row.deletedAt !== null || Boolean(row.view?.deletedAt),
    }));
  }
  async getWidgetMeasuresCompanyWide(afterId?: string) {
    const rows = await this.owners.widgets.getMeasuresCompanyWide(this.companyId, afterId);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      measure: RecordMeasureSchema.parse(row.definition),
      trashed: row.deletedAt !== null || Boolean(row.view?.deletedAt),
    }));
  }
  async getEventSubscriptionsCompanyWide(afterId?: string) {
    const rows = await this.owners.subscriptions.getPageCompanyWide(this.companyId, afterId);
    const ids = rows.map((row) => row.id);
    const [routines, webhooks] = await Promise.all([
      this.owners.routines.getLabelsCompanyWide(this.companyId, ids),
      this.owners.webhooks.getLabelsCompanyWide(this.companyId, ids),
    ]);
    const labels = new Map([
      ...routines.map((routine) => [routine.id, routine.name] as const),
      ...webhooks.map((webhook) => [webhook.id, webhook.description || webhook.url] as const),
    ]);
    return rows.map(({ companyId: _companyId, ...row }) => ({
      ...RecordEventSubscriptionSchema.parse(row),
      label: labels.get(row.id) ?? "",
    }));
  }

  async getConfigurationDeletions(targets?: ConfigurationTarget[]) {
    const wanted = targets ? new Set(targets.map(targetKey)) : null;
    const records = new Map<string, ConfigurationDeletionRecord>();
    if (wanted && !wanted.size) return records;
    const companyId = this.companyId;
    const deletions = RecordRevisionChangeSchema.shape.deletions.unwrap();
    let cursor: number | undefined;
    for (;;) {
      const rows = await this.prisma.recordSchemaRevision.findMany({
        where: {
          companyId,
          change: { path: ["deletions"], not: Prisma.AnyNull },
          ...(cursor === undefined ? {} : { revision: { lt: cursor } }),
        },
        select: { revision: true, actorId: true, createdAt: true, change: true },
        orderBy: { revision: "desc" },
        take: CONFIGURATION_DELETION_PAGE,
      });
      for (const row of rows) {
        const change = row.change as { deletions?: unknown };
        for (const deletion of deletions.parse(change.deletions)) {
          const key = targetKey(deletion.target);
          if (records.has(key) || (wanted && !wanted.has(key))) continue;
          records.set(key, { ...deletion, actorId: row.actorId, deletedAt: row.createdAt });
        }
        if (wanted && records.size === wanted.size) return records;
      }
      if (rows.length < CONFIGURATION_DELETION_PAGE) return records;
      cursor = rows.at(-1)?.revision;
    }
  }

  async getConfigurationTrashTargetIds(): Promise<Set<string>> {
    const items = await this.owners.trash.findItemsCompanyWide(this.companyId, {
      kinds: ["list", "field", "relationship"],
    });
    return new Set(items.map((item) => item.targetId));
  }

  async applyConsumerCleanups(cleanups: ConfigurationConsumerCleanup[]): Promise<{ pausedWebhookIds: string[] }> {
    const companyId = this.companyId;
    const pausedWebhookIds: string[] = [];
    for (const cleanup of cleanups) {
      if (cleanup.kind === "view")
        await this.owners.views.rewriteViewStateCompanyWide(companyId, cleanup.id, cleanup.state);
      else if (cleanup.kind === "personalLayout")
        await this.owners.personalizations.rewritePersonalizationStateCompanyWide(companyId, cleanup.id, cleanup.state);
      else if (cleanup.kind === "detailLayout")
        await this.owners.personalizations.rewriteDetailLayoutCompanyWide(companyId, cleanup.id, cleanup.layout);
      else if (cleanup.kind === "widget") {
        await this.owners.widgets.rewriteMeasureCompanyWide(
          companyId,
          cleanup.id,
          cleanup.measure as Prisma.InputJsonValue,
        );
      } else if (cleanup.kind === "webhookSubscription") {
        const { id, events } = cleanup.subscription;
        await this.owners.subscriptions.rewriteCompanyWide(companyId, cleanup.subscription);
        const replaced = await this.owners.webhooks.replaceRecordEventsCompanyWide(
          companyId,
          id,
          events,
          cleanup.paused,
        );
        if (replaced?.paused) pausedWebhookIds.push(id);
      }
    }
    return { pausedWebhookIds };
  }
  async measure(measure: RecordMeasure, model: RecordModel, access: RecordAccessMap): Promise<MeasureRow[]> {
    return this.prisma.$queryRaw<MeasureRow[]>(compileRecordMeasure(this.companyId, measure, model, access));
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
            errorCode: CustomErrorCode.recordOperationFailed,
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

  async getDetailLayoutsCompanyWide(typeIds: string[], afterId?: string) {
    if (!typeIds.length) return [];
    const rows = await this.owners.personalizations.getDetailOptionsCompanyWide(
      this.companyId,
      typeIds.map(recordDetailKey),
      afterId,
    );
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
    const companyId = this.companyId;
    const surfaces = typeIds.map(recordSurfaceKey);
    const afterPersonalization = afterKey.startsWith(PERSONALIZATION_KEY)
      ? afterKey.slice(PERSONALIZATION_KEY.length)
      : "";
    const afterView = afterKey.startsWith(VIEW_KEY) ? afterKey.slice(VIEW_KEY.length) : "";
    const personalizations = afterKey.startsWith(VIEW_KEY)
      ? []
      : await this.owners.personalizations.getPersonalizationsCompanyWide(
          companyId,
          surfaces,
          afterPersonalization,
          CONFIGURATION_CONSUMER_PAGE,
        );
    const views =
      personalizations.length < CONFIGURATION_CONSUMER_PAGE
        ? await this.owners.views.getViewsCompanyWide(
            companyId,
            surfaces,
            afterView,
            CONFIGURATION_CONSUMER_PAGE - personalizations.length,
          )
        : [];
    return [
      ...personalizations.map((row) => ({
        key: `${PERSONALIZATION_KEY}${row.id}`,
        typeId: row.p13nId.slice(8),
        name: null,
        trashed: false,
        state: readStoredPersonalizationState(row),
      })),
      ...views.map((row) => ({
        key: `${VIEW_KEY}${row.id}`,
        typeId: row.surfaceKey.slice(8),
        name: row.name,
        trashed: Boolean(row.deletedAt),
        state: readStoredState(row),
      })),
    ];
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

  async countDefinitionDeletion({ typeIds, fieldIds, relationIds, channelTypeIds }: RecordDefinitionDeletion) {
    const companyId = this.companyId;
    const surfaces = typeIds.map(recordSurfaceKey);
    const [records, cascaded, values, links, relationships, views, personalizations, grants, identityLinks] =
      await Promise.all([
        this.prisma.crmRecord.count({ where: { companyId, typeId: { in: typeIds } } }),
        this.countCascadedTrashedRecords(typeIds),
        this.prisma.recordValue.count({
          where: { companyId, state: "value", OR: [{ typeId: { in: typeIds } }, { fieldId: { in: fieldIds } }] },
        }),
        this.prisma.recordLink.count({ where: { companyId, relationId: { in: relationIds } } }),
        this.prisma.recordRelationshipDefinition.count({ where: { companyId, id: { in: relationIds } } }),
        this.owners.views.countViewsCompanyWide(companyId, surfaces),
        this.owners.personalizations.countPersonalizationsCompanyWide(companyId, [
          ...surfaces,
          ...typeIds.map(recordDetailKey),
        ]),
        this.prisma.recordTypeGrant.count({ where: { companyId, typeId: { in: typeIds } } }),
        this.countIdentityLinks(channelTypeIds),
      ]);
    return {
      records: records + cascaded,
      values,
      links,
      relationships,
      views: views + personalizations,
      grants,
      ...identityLinks,
    };
  }

  private async countCascadedTrashedRecords(typeIds: string[]): Promise<number> {
    const companyId = this.companyId;
    const items = await this.owners.trash.findItemsCompanyWide(companyId, { kinds: ["record"], typeIds });
    if (!items.length) return 0;
    return this.prisma.crmRecord.count({
      where: { companyId, trashItemId: { in: items.map((item) => item.id) }, typeId: { notIn: typeIds } },
    });
  }

  private async countIdentityLinks(typeIds: string[]) {
    if (!typeIds.length) return { identifiers: 0, identifierRecords: 0 };
    const [row] = await this.prisma.$queryRaw<Array<{ identifiers: number; identifierRecords: number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT link."identityId")::integer AS identifiers,
        COUNT(DISTINCT (link."typeId", link."recordId"))::integer AS "identifierRecords"
      FROM "RecordIdentityLink" link
      WHERE link."companyId" = ${this.companyId} AND link."typeId" IN (${Prisma.join(typeIds)})`);
    return { identifiers: row?.identifiers ?? 0, identifierRecords: row?.identifierRecords ?? 0 };
  }

  async deleteDefinitions({ typeIds, fieldIds, relationIds, channelTypeIds }: RecordDefinitionDeletion): Promise<void> {
    const companyId = this.companyId;
    const surfaces = typeIds.map(recordSurfaceKey);
    const views = await this.owners.trash.findItemsCompanyWide(companyId, { kinds: ["view"], surfaceKeys: surfaces });
    await this.owners.trash.removeItemsCompanyWide(
      companyId,
      views.map((item) => item.id),
    );
    await this.owners.views.deleteViewsCompanyWide(companyId, surfaces);
    await this.owners.personalizations.deletePersonalizationsCompanyWide(companyId, [
      ...surfaces,
      ...typeIds.map(recordDetailKey),
    ]);
    await this.prisma.recordValueDependency.deleteMany({ where: { companyId, sourceTypeId: { in: typeIds } } });
    const identities = await this.prisma.recordIdentityLink.findMany({
      where: { companyId, typeId: { in: [...typeIds, ...channelTypeIds] } },
      select: { identityId: true },
    });
    await this.prisma.recordIdentityLink.deleteMany({ where: { companyId, typeId: { in: channelTypeIds } } });
    await this.prisma.recordRelationshipDefinition.deleteMany({ where: { companyId, id: { in: relationIds } } });
    await this.prisma.recordFieldDefinition.deleteMany({ where: { companyId, id: { in: fieldIds } } });
    await this.prisma.recordTypeDefinition.deleteMany({ where: { companyId, id: { in: typeIds } } });
    await this.deleteOrphanedIdentities(identities.map((row) => row.identityId));
  }

  async countReadableRecordsByType(access: RecordAccessMap): Promise<Array<{ typeId: string; count: number }>> {
    if (!access.size) return [];
    const record = Prisma.raw('"record"');
    const readable = [...access].map(
      ([typeId, scope]) =>
        Prisma.sql`(${record}."typeId" = ${typeId} AND ${recordReadPredicate(this.companyId, scope, record)})`,
    );
    return this.prisma.$queryRaw<Array<{ typeId: string; count: number }>>(Prisma.sql`
      SELECT ${record}."typeId" AS "typeId", COUNT(*)::integer AS count FROM "CrmRecord" ${record}
      WHERE ${record}."companyId" = ${this.companyId} AND ${record}."deletedAt" IS NULL AND ${record}."typeId" IN (${Prisma.join([...access.keys()])})
        AND (${Prisma.join(readable, " OR ")})
      GROUP BY ${record}."typeId"`);
  }

  async validRecordRolesCompanyWide(roleIds: string[]): Promise<boolean> {
    return (await this.owners.roles.countRolesCompanyWide(this.companyId, roleIds)) === new Set(roleIds).size;
  }

  async validateRelationshipCardinality(model: RecordModel): Promise<string[]> {
    const invalid: string[] = [];
    for (const relation of model.relationships) {
      if (relation.archived) continue;
      for (const [cardinality, column] of [
        [relation.sourceCardinality, "sourceId"],
        [relation.targetCardinality, "targetId"],
      ] as const) {
        if (cardinality !== "one") continue;
        const duplicates = await this.prisma.recordLink.groupBy({
          by: [column],
          where: { companyId: this.companyId, relationId: relation.id, deletedAt: null },
          having: { [column]: { _count: { gt: 1 } } },
          orderBy: { [column]: "asc" },
          take: 1,
        });
        if (duplicates.length) invalid.push(relation.id);
      }
    }
    for (const type of model.types) {
      if (type.archived || !type.parentRelationshipId) continue;
      const rows = await this.prisma.$queryRaw<Array<{ invalid: boolean }>>(Prisma.sql`
        SELECT EXISTS (SELECT 1 FROM "CrmRecord" record
          WHERE record."companyId" = ${this.companyId} AND record."typeId" = ${type.id} AND record."deletedAt" IS NULL
            AND NOT EXISTS (SELECT 1 FROM "RecordLink" link
              WHERE link."companyId" = record."companyId" AND link."relationId" = ${type.parentRelationshipId}
                AND link."sourceTypeId" = record."typeId" AND link."sourceId" = record.id
                AND link."deletedAt" IS NULL)) AS invalid`);
      if (rows[0]?.invalid) invalid.push(type.parentRelationshipId);
    }
    return [...new Set(invalid)];
  }

  async saveModel(model: RecordModel, actorId: string, change?: RecordRevisionChange): Promise<void> {
    const companyId = this.companyId;
    const current = await this.getModel();
    const differs = <T extends { id: string }>(item: T, previous: T[]) =>
      canonicalRecordJson(item) !== canonicalRecordJson(previous.find((candidate) => candidate.id === item.id));
    for (const type of model.types.filter((item) => differs(item, current.types))) {
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
    for (const field of model.fields.filter((item) => differs(item, current.fields))) {
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
    for (const relation of model.relationships.filter((item) => differs(item, current.relationships))) {
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
      create: { companyId, revision: model.revision },
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
    if (change) await this.syncConfigurationTrash(model, actorId, change);
  }

  private async syncConfigurationTrash(model: RecordModel, actorId: string, change: RecordRevisionChange) {
    const operations = change.configuration?.operations ?? [];
    const leaving = operations.flatMap((operation) =>
      operation.operation === "restore" || operation.operation === "deletePermanently" ? [operation.target.id] : [],
    );
    const removedTypeIds = operations.flatMap((operation) =>
      operation.operation === "deletePermanently" && operation.target.kind === "type" ? [operation.target.id] : [],
    );
    if (leaving.length || removedTypeIds.length) {
      const items = await this.owners.trash.findItemsCompanyWide(this.companyId, {
        kinds: ["list", "field", "relationship"],
      });
      const present = new Set([
        ...model.types.map((type) => type.id),
        ...model.fields.map((field) => field.id),
        ...model.relationships.map((relation) => relation.id),
        ...model.capabilities.map((capability) => capability.id),
      ]);
      await this.owners.trash.removeItemsCompanyWide(
        this.companyId,
        items
          .filter(
            (item) =>
              leaving.includes(item.targetId) ||
              (item.typeId !== null && removedTypeIds.includes(item.typeId)) ||
              !present.has(item.targetId),
          )
          .map((item) => item.id),
      );
    }
    if (!change.deletions?.length) return;
    const batchId = configurationTrashBatchId(this.companyId, change.causeId);
    const kinds = { type: "list", field: "field", relationship: "relationship" } as const;
    await this.owners.trash.addItemsCompanyWide(
      this.companyId,
      change.deletions.map(({ target, droppedViewReferences }) => {
        const reference = deletionReference(model, target);
        return {
          id: randomUUID(),
          kind: kinds[target.kind],
          targetId: target.id,
          typeId: target.kind === "type" ? target.id : (reference.typeId ?? null),
          label: reference.label,
          batchId,
          deletedById: actorId,
          ...(droppedViewReferences?.length ? { payload: { droppedViewReferences } } : {}),
        };
      }),
    );
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

  async getRecordCompanyWide(ref: RecordRef, options: TrashReadOptions = {}) {
    return this.prisma.crmRecord.findUnique({
      relationLoadStrategy: "query",
      where: {
        companyId: this.companyId,
        companyId_typeId_id: {
          companyId: this.companyId,
          typeId: ref.typeId,
          id: ref.recordId,
        },
        ...(options.includeTrash ? {} : { deletedAt: null }),
      },
      include: { values: true, assignments: { select: this.assignmentSelect } },
    });
  }

  async lockRecord(ref: RecordRef) {
    await this.prisma
      .$queryRaw`SELECT 1 FROM "CrmRecord" WHERE "companyId" = ${this.companyId} AND "typeId" = ${ref.typeId} AND id = ${ref.recordId} FOR UPDATE`;
  }

  async getRecordsCompanyWide(refs: RecordRef[], options: TrashReadOptions = {}) {
    if (!refs.length) return [];
    return this.prisma.crmRecord.findMany({
      relationLoadStrategy: "query",
      where: {
        companyId: this.companyId,
        ...(options.includeTrash ? {} : { deletedAt: null }),
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
        deletedAt: null,
        ...(afterId ? { id: { gt: afterId } } : {}),
        outgoing: {
          some: {
            companyId: this.companyId,
            deletedAt: null,
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

  async getRecordRefsCompanyWide(
    typeId: string,
    afterId?: string,
    take = 500,
    options: TrashReadOptions = {},
  ): Promise<RecordRef[]> {
    const records = await this.prisma.crmRecord.findMany({
      where: {
        companyId: this.companyId,
        typeId,
        ...(options.includeTrash ? {} : { deletedAt: null }),
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: "asc" },
      take,
      select: { id: true },
    });
    return records.map((record) => ({ typeId, recordId: record.id }));
  }

  async searchRecords(
    request: RecordSearchRequest,
    model: RecordModel,
    access: RecordAccessMap,
  ): Promise<RecordSearchRow[]> {
    const sql = compileRecordSearch(this.companyId, model, access, request);
    if (!sql) return [];
    if ("search" in request && request.similarTitles) {
      await this.prisma
        .$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(SIMILAR_TITLE_MIN_WORD_SIMILARITY)}, true)`;
    }
    return this.prisma.$queryRaw<RecordSearchRow[]>(sql);
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
    const sql = compileRecordQuery(this.companyId, query, model, access, memberScope);
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
    if (!resolved) throw unwindFailure(CustomErrorCode.recordValueInvalid);
    const rows = await this.prisma.$queryRaw<RecordGroupRow[]>(
      compileRecordGroups(this.companyId, query, model, access, memberScope),
    );
    if (rows.some((row) => row.restricted)) throw unwindFailure(CustomErrorCode.permissionDenied);
    if (rows.some((row) => row.overflowWithRecords)) throw unwindFailure(CustomErrorCode.recordCalculationBudget);
    let valueGroups = 0;
    const axisRows = rows.filter((row) => row.key === NO_VALUE_GROUP_KEY || ++valueGroups <= MAX_AXIS_GROUPS);
    const groups = query.groupPage?.only ? axisRows.filter((row) => row.key === query.groupPage?.only) : axisRows;
    if (!groups.length) throw unwindFailure(CustomErrorCode.recordValueInvalid);
    const ids = [...new Set(groups.flatMap((group) => group.itemIds))];
    if (ids.length > 1000) throw unwindFailure(CustomErrorCode.recordCalculationBudget);
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
      (field, index) =>
        Prisma.sql`${fieldReadPredicate(this.companyId, field, model, access)} AS ${Prisma.raw(`"f_${index}"`)}`,
    );
    const rows = await this.prisma.$queryRaw<Array<Record<string, boolean | string>>>(
      Prisma.sql`SELECT "record_0"."id", ${Prisma.join(projections, ", ")} FROM "CrmRecord" "record_0" WHERE "record_0"."companyId" = ${this.companyId} AND "record_0"."typeId" = ${typeId} AND "record_0"."id" IN (${Prisma.join(refs.map((ref) => ref.recordId))})`,
    );
    for (const row of rows) {
      for (const [index, field] of fields.entries())
        if (row[`f_${index}`] === true) recordInvariant(result.get(String(row.id))).add(field.id);
    }
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
    options: TrashReadOptions = {},
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
    const sql = compileRecordRelationshipSummaries(
      this.companyId,
      typeId,
      recordIds,
      selections,
      model,
      access,
      options.includeTrash,
    );
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

  async placeRecord(ref: RecordRef, placement: RecordPlacement, groupFieldId: string | null): Promise<boolean> {
    const candidate = Prisma.sql`candidate`;
    const key = recordManualOrderKey(candidate);
    const groupValue = (recordId: Prisma.Sql) =>
      Prisma.sql`(SELECT value."textValue" FROM "RecordValue" value WHERE value."companyId" = ${this.companyId} AND value."typeId" = ${ref.typeId} AND value."recordId" = ${recordId} AND value."fieldId" = ${groupFieldId} AND value."state" = 'value')`;
    const sameGroup = groupFieldId
      ? Prisma.sql`AND ${groupValue(Prisma.sql`${candidate}."id"`)} IS NOT DISTINCT FROM ${groupValue(Prisma.sql`${ref.recordId}`)}`
      : Prisma.empty;
    const scope = Prisma.sql`FROM "CrmRecord" ${candidate} WHERE ${candidate}."companyId" = ${this.companyId} AND ${candidate}."typeId" = ${ref.typeId} AND ${candidate}."deletedAt" IS NULL AND ${candidate}."id" <> ${ref.recordId} ${sameGroup}`;
    const keyOf = async (recordId: string) => {
      const rows = await this.prisma.$queryRaw<Array<{ key: string }>>(
        Prisma.sql`SELECT ${key} AS key ${scope} AND ${candidate}."id" = ${recordId}`,
      );
      return rows[0]?.key ?? null;
    };
    const neighbour = async (bound: string | null, side: "after" | "before") => {
      const rows = await this.prisma.$queryRaw<Array<{ key: string }>>(
        Prisma.sql`SELECT ${key} AS key ${scope} ${bound === null ? Prisma.empty : side === "after" ? Prisma.sql`AND ${key} > ${bound}` : Prisma.sql`AND ${key} < ${bound}`} ORDER BY key ${Prisma.raw(side === "after" ? "ASC" : "DESC")} LIMIT 1`,
      );
      return rows[0]?.key ?? null;
    };
    const lower = placement.afterRecordId ? await keyOf(placement.afterRecordId) : null;
    const upper = placement.beforeRecordId ? await keyOf(placement.beforeRecordId) : null;
    if ((placement.afterRecordId && lower === null) || (placement.beforeRecordId && upper === null)) return false;
    if (lower !== null && upper !== null && lower >= upper) return false;
    const bounds =
      placement.beforeRecordId && !placement.afterRecordId
        ? [await neighbour(upper, "before"), upper]
        : [lower, await neighbour(lower, "after")];
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "CrmRecord" SET "rank" = ${rankBetween(bounds[0], bounds[1])}
      WHERE "companyId" = ${this.companyId} AND "typeId" = ${ref.typeId} AND "id" = ${ref.recordId}`);
    return true;
  }

  async hasRecordHistoryCompanyWide(ref: RecordRef): Promise<boolean> {
    return this.owners.events.hasRecordHistoryCompanyWide(this.companyId, ref);
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

  async moveToTrash(ref: RecordRef, trashItemId: string): Promise<void> {
    const companyId = this.companyId;
    await this.prisma.crmRecord.updateMany({
      where: { companyId, typeId: ref.typeId, id: ref.recordId, deletedAt: null },
      data: { deletedAt: new Date(), trashItemId },
    });
    await this.prisma.recordLink.updateMany({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          { sourceTypeId: ref.typeId, sourceId: ref.recordId },
          { targetTypeId: ref.typeId, targetId: ref.recordId },
        ],
      },
      data: { deletedAt: new Date() },
    });
  }

  async addTrashItems(items: RecordTrashItemInput[]): Promise<void> {
    await this.owners.trash.addItemsCompanyWide(
      this.companyId,
      items.map((item) => ({ ...item, kind: "record" as const })),
    );
  }

  async getRecordTrashItemsCompanyWide(selection: { ids: string[] } | { batchId: string } | { typeIds: string[] }) {
    const rows = await this.owners.trash.findItemsCompanyWide(this.companyId, {
      kinds: ["record"],
      ...("ids" in selection
        ? { ids: selection.ids }
        : "typeIds" in selection
          ? { typeIds: selection.typeIds }
          : { batchId: selection.batchId }),
    });
    return rows.map((row) => ({
      id: row.id,
      typeId: recordInvariant(row.typeId),
      targetId: row.targetId,
      label: row.label,
      batchId: row.batchId,
      deletedById: row.deletedById,
      deletedAt: row.deletedAt,
      expiresAt: row.expiresAt,
      payload: row.payload,
    }));
  }

  async getTrashedRecordRefsCompanyWide(trashItemIds: string[], take: number): Promise<RecordRef[]> {
    if (!trashItemIds.length) return [];
    const rows = await this.prisma.crmRecord.findMany({
      where: { companyId: this.companyId, trashItemId: { in: trashItemIds } },
      orderBy: [{ typeId: "asc" }, { id: "asc" }],
      take,
      select: { typeId: true, id: true },
    });
    return rows.map((row) => ({ typeId: row.typeId, recordId: row.id }));
  }

  async getTrashedLinksCompanyWide(refs: RecordRef[], take: number) {
    if (!refs.length) return [];
    const rows = await this.prisma.recordLink.findMany({
      where: {
        companyId: this.companyId,
        deletedAt: { not: null },
        OR: refs.flatMap((ref) => [
          { sourceTypeId: ref.typeId, sourceId: ref.recordId },
          { targetTypeId: ref.typeId, targetId: ref.recordId },
        ]),
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

  async getTrashedParentCompanyWide(ref: RecordRef, relationId: string) {
    const link = await this.prisma.recordLink.findFirst({
      where: {
        companyId: this.companyId,
        relationId,
        sourceTypeId: ref.typeId,
        sourceId: ref.recordId,
        deletedAt: { not: null },
      },
      select: { targetTypeId: true, targetId: true },
    });
    return link ? { typeId: link.targetTypeId, recordId: link.targetId } : null;
  }

  async restoreRecords(refs: RecordRef[]): Promise<void> {
    if (!refs.length) return;
    await this.prisma.crmRecord.updateMany({
      where: { companyId: this.companyId, OR: refs.map((ref) => ({ typeId: ref.typeId, id: ref.recordId })) },
      data: { deletedAt: null, trashItemId: null },
    });
  }

  async restoreLink(id: string): Promise<void> {
    await this.prisma.recordLink.updateMany({ where: { companyId: this.companyId, id }, data: { deletedAt: null } });
  }

  async dropTrashedLink(id: string): Promise<void> {
    await this.prisma.recordLink.deleteMany({ where: { companyId: this.companyId, id, deletedAt: { not: null } } });
  }

  async removeTrashItems(ids: string[]): Promise<void> {
    await this.owners.trash.removeItemsCompanyWide(this.companyId, ids);
  }

  async countTrashedRecordsCompanyWide(trashItemIds: string[]) {
    if (!trashItemIds.length) return { records: [], links: 0 };
    const companyId = this.companyId;
    const trashed = { companyId, trashItemId: { in: trashItemIds } };
    const [groups, links] = await Promise.all([
      this.prisma.crmRecord.groupBy({
        by: ["typeId"],
        where: trashed,
        _count: { _all: true },
        orderBy: { typeId: "asc" },
      }),
      this.prisma.recordLink.count({
        where: { companyId, OR: [{ source: { is: trashed } }, { target: { is: trashed } }] },
      }),
    ]);
    return { records: groups.map((group) => ({ typeId: group.typeId, count: group._count._all })), links };
  }

  async purgeTrashItems(ids: string[]): Promise<RecordRef[]> {
    if (!ids.length) return [];
    const companyId = this.companyId;
    const purged = await this.prisma.crmRecord.findMany({
      where: { companyId, trashItemId: { in: ids }, deletedAt: { not: null } },
      select: { typeId: true, id: true },
    });
    const refs = purged.map((row) => ({ typeId: row.typeId, recordId: row.id }));
    if (refs.length) {
      const droppedLinks = await this.prisma.$queryRaw<Array<{ id: string; count: number }>>(Prisma.sql`
        SELECT survivor."trashItemId" AS id, COUNT(*)::integer AS count FROM "CrmRecord" purged
        JOIN "RecordLink" link ON link."companyId" = purged."companyId" AND link."deletedAt" IS NOT NULL
          AND ((link."sourceTypeId" = purged."typeId" AND link."sourceId" = purged.id)
            OR (link."targetTypeId" = purged."typeId" AND link."targetId" = purged.id))
        JOIN "CrmRecord" survivor ON survivor."companyId" = link."companyId" AND survivor."deletedAt" IS NOT NULL
          AND ((survivor."typeId" = link."sourceTypeId" AND survivor.id = link."sourceId")
            OR (survivor."typeId" = link."targetTypeId" AND survivor.id = link."targetId"))
        WHERE purged."companyId" = ${companyId} AND purged."deletedAt" IS NOT NULL
          AND purged."trashItemId" IN (${Prisma.join(ids)}) AND survivor."trashItemId" NOT IN (${Prisma.join(ids)})
        GROUP BY survivor."trashItemId"`);
      await this.owners.trash.addDroppedLinksCompanyWide(companyId, droppedLinks);
      await this.owners.events.eraseTrashedRecordPayloadsCompanyWide(companyId, ids);
      const identities = await this.prisma.recordIdentityLink.findMany({
        where: { companyId, record: { is: { companyId, trashItemId: { in: ids }, deletedAt: { not: null } } } },
        select: { identityId: true },
      });
      await this.prisma.crmRecord.deleteMany({
        where: { companyId, trashItemId: { in: ids }, deletedAt: { not: null } },
      });
      await this.deleteOrphanedIdentities(identities.map((row) => row.identityId));
    }
    await this.removeTrashItems(ids);
    return refs;
  }

  async getMembersCompanyWide(userIds: string[]): Promise<RecordMember[]> {
    if (!userIds.length) return [];
    return this.owners.members.getRecordMembersCompanyWide(this.companyId, userIds);
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
        deletedAt: null,
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
        deletedAt: null,
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

  async getPendingDeletionRef(operationId: string) {
    const rows = await this.prisma.$queryRaw<Array<RecordRef & { root: string }>>(Prisma.sql`
      SELECT pending.payload->>'typeId' AS "typeId", pending.payload->>'recordId' AS "recordId", pending.payload->>'root' AS root
      FROM "RecordStageRow" pending
      WHERE pending."companyId" = ${this.companyId} AND pending."operationId" = ${operationId}
        AND pending.kind = 'delete-pending'
        AND NOT EXISTS (SELECT 1 FROM "RecordStageRow" visited
          WHERE visited."companyId" = pending."companyId" AND visited."operationId" = pending."operationId"
            AND visited.kind = 'delete-plan' AND visited.key = pending.key)
      ORDER BY pending.key LIMIT 1`);
    const row = rows[0];
    return row ? { ref: { typeId: row.typeId, recordId: row.recordId }, root: row.root } : null;
  }

  async queueDeletionRef(operationId: string, ref: RecordRef, root: string): Promise<void> {
    const key = `${ref.typeId}:${ref.recordId}`;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RecordStageRow" ("companyId", "operationId", kind, key, payload)
      SELECT ${this.companyId}, ${operationId}, 'delete-pending', ${key}, ${JSON.stringify({ ...ref, root })}::jsonb
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
        deletedAt: null,
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
        deletedAt: null,
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
    actorId: string | null,
    causeId: string,
    kind: string,
    payload: unknown,
    beforeDeletion = false,
    publish = true,
  ): Promise<void> {
    const id = randomUUID();
    await this.owners.events.appendRecordEventCompanyWide(this.companyId, {
      id,
      ref,
      actorId,
      causeId,
      kind,
      payload: recordJson(payload),
    });
    if (publish) {
      await this.captureRecordEventMatches(this.companyId, { eventId: id }, beforeDeletion);
      await this.wakeRecordEvents();
    }
  }

  async deleteMembershipAuthorizationTasksCompanyWide(companyId: string, relatedUserId: string): Promise<void> {
    await this.prisma.crmRecord.deleteMany({
      where: {
        companyId,
        protectedKind: "membershipAuthorization",
        systemData: { path: ["relatedUserId"], equals: relatedUserId },
      },
    });
  }

  @BypassTenantGuard
  claimDueUnscoped(now: Date, leaseUntil: Date, take: number): Promise<DueRecordOperation[]> {
    return this.prisma.$queryRaw<DueRecordOperation[]>(Prisma.sql`
      WITH due AS (
        SELECT operation."companyId", operation.id
        FROM "RecordOperation" operation
        JOIN "RecordSchemaState" state
          ON state."companyId" = operation."companyId" AND state."activeOperationId" = operation.id
        WHERE operation.state IN ('pending', 'staging')
          AND operation.kind IN ('mutation', 'configuration', 'provider-avatar', 'restore')
          AND (operation."leaseUntil" IS NULL OR operation."leaseUntil" <= ${now})
        ORDER BY COALESCE(operation."leaseUntil", operation."createdAt"), operation."companyId", operation.id
        LIMIT ${take}
        FOR UPDATE OF operation SKIP LOCKED
      )
      UPDATE "RecordOperation" operation
      SET "leaseUntil" = ${leaseUntil}
      FROM due
      WHERE operation."companyId" = due."companyId" AND operation.id = due.id
        AND operation.state IN ('pending', 'staging')
      RETURNING operation."companyId", operation.id AS "operationId",
        operation."userId" AS "ownerUserId", operation.kind
    `);
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

  async updateOperation(id: string, data: RecordOperationUpdate): Promise<void> {
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
    options: TrashReadOptions = {},
  ): Promise<RecordRef[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`WITH candidates AS (
      SELECT record."id" FROM "CrmRecord" record WHERE record."companyId" = ${this.companyId} AND record."typeId" = ${typeId}
        AND ${options.includeTrash ? Prisma.sql`TRUE` : Prisma.sql`record."deletedAt" IS NULL`}
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
        WHERE link."companyId" = ${this.companyId} AND link."relationId" = ${relationId} AND link."deletedAt" IS NULL AND ${sourceId} = ${ref.recordId}
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
    await this.owners.events.publishStagedRecordEventsCompanyWide(companyId, operationId);
    await this.captureRecordEventMatches(companyId, { operationId }, true);
    await this.owners.trash.publishStagedRecordItemsCompanyWide(companyId, operationId);
    const detachedIdentities = await this.prisma.$queryRaw<Array<{ identityId: string }>>(Prisma.sql`
      SELECT DISTINCT association."identityId" FROM "RecordIdentityLink" association JOIN "RecordStageRow" stage
        ON stage.payload->'ref'->>'typeId' = association."typeId" AND stage.payload->'ref'->>'recordId' = association."recordId"
      WHERE association."companyId" = ${companyId} AND (
        (${stage("record")} AND (stage.payload->>'deleted')::boolean AND stage.payload->>'trashItemId' IS NULL)
        OR (${stage("identity")} AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(stage.payload->'identities') item(data) WHERE item.data->>'id' = association."identityId"))
      )
    `);
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM "CrmRecord" record USING "RecordStageRow" stage WHERE ${stage("record")} AND (stage.payload->>'deleted')::boolean AND stage.payload->>'trashItemId' IS NULL AND record."companyId" = ${companyId} AND record."typeId" = stage.payload->'ref'->>'typeId' AND record.id = stage.payload->'ref'->>'recordId'`,
    );
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "CrmRecord" record SET "deletedAt" = NOW(), "trashItemId" = stage.payload->>'trashItemId', "updatedAt" = NOW() FROM "RecordStageRow" stage WHERE ${stage("record")} AND (stage.payload->>'deleted')::boolean AND stage.payload->>'trashItemId' IS NOT NULL AND record."companyId" = ${companyId} AND record."typeId" = stage.payload->'ref'->>'typeId' AND record.id = stage.payload->'ref'->>'recordId' AND record."deletedAt" IS NULL`,
    );
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "RecordLink" link SET "deletedAt" = NOW() FROM "RecordStageRow" stage WHERE ${stage("record")} AND (stage.payload->>'deleted')::boolean AND stage.payload->>'trashItemId' IS NOT NULL AND link."companyId" = ${companyId} AND link."deletedAt" IS NULL AND ((link."sourceTypeId" = stage.payload->'ref'->>'typeId' AND link."sourceId" = stage.payload->'ref'->>'recordId') OR (link."targetTypeId" = stage.payload->'ref'->>'typeId' AND link."targetId" = stage.payload->'ref'->>'recordId'))`,
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
    if (collisions[0]?.collision) throw unwindFailure(CustomErrorCode.channelAlreadyLinked, "conflict");
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
      Prisma.sql`DELETE FROM "RecordAssignment" assignment USING "RecordStageRow" stage WHERE ${stage("record")} AND NOT (stage.payload->>'deleted')::boolean AND assignment."companyId" = ${companyId} AND assignment."typeId" = stage.payload->'ref'->>'typeId' AND assignment."recordId" = stage.payload->'ref'->>'recordId'`,
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
        CASE WHEN stage.payload->'result'->'value'->>'kind' IN ('textList', 'selectList') THEN ARRAY(SELECT jsonb_array_elements_text(stage.payload->'result'->'value'->'value')) ELSE ARRAY[]::text[] END,
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
      Prisma.sql`UPDATE "CrmRecord" record SET version = record.version + 1, "updatedAt" = NOW() WHERE record."companyId" = ${companyId} AND EXISTS (SELECT 1 FROM "RecordStageRow" stage WHERE (${stage("value")} OR ${stage("dependency")}) AND stage.payload->'ref'->>'typeId' = record."typeId" AND stage.payload->'ref'->>'recordId' = record.id) AND NOT EXISTS (SELECT 1 FROM "RecordStageRow" stage WHERE ${stage("record")} AND stage.key = record."typeId" || ':' || record.id)`,
    );
    await this.captureRecordEventMatches(companyId, {
      operationId,
    });
    await this.wakeRecordEvents();
  }

  async protectMembershipTask(ref: RecordRef, userId: string): Promise<void> {
    await this.prisma.crmRecord.update({
      where: {
        companyId: this.companyId,
        companyId_typeId_id: { companyId: this.companyId, typeId: ref.typeId, id: ref.recordId },
      },
      data: { protectedKind: "membershipAuthorization", systemData: { relatedUserId: userId } },
    });
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
      throw unwindFailure(CustomErrorCode.recordVersionChanged, "conflict");
    await this.prisma.recordSchemaState.updateMany({
      where: { companyId, activeOperationId: id },
      data: { activeOperationId: null },
    });
    await this.prisma.recordStageRow.deleteMany({
      where: { companyId, operationId: id },
    });
  }

  @BypassTenantGuard
  async getModelUnscoped(companyId: string): Promise<RecordModel> {
    return this.forCompany(companyId).getModel();
  }

  @BypassTenantGuard
  async getStateUnscoped(companyId: string) {
    return this.forCompany(companyId).getState();
  }

  @BypassTenantGuard
  async getIdentityChannelsUnscoped(companyId: string, keys: Array<{ channelClass: string; value: string }>) {
    return this.forCompany(companyId).getIdentityChannelsCompanyWide(keys);
  }

  @BypassTenantGuard
  async getIdentityOwnerRefsPageUnscoped(
    companyId: string,
    identityId: string,
    after: RecordRef | undefined,
    take: number,
    typeIds: string[],
  ) {
    return this.forCompany(companyId).getIdentityOwnerRefsPageCompanyWide(identityId, after, take, typeIds);
  }

  @BypassTenantGuard
  async getRecordUnscoped(companyId: string, ref: RecordRef) {
    return this.forCompany(companyId).getRecordCompanyWide(ref);
  }

  @BypassTenantGuard
  async getLastFieldWritersUnscoped(companyId: string, targets: Array<{ ref: RecordRef; fieldId: string }>) {
    return this.forCompany(companyId).getLastFieldWritersCompanyWide(targets);
  }

  @BypassTenantGuard
  async createOperationUnscoped(
    companyId: string,
    request: { id: string; userId: string; kind: string; expectedRevision: number; request: unknown },
  ) {
    return this.forCompany(companyId).createOperation(request);
  }

  @BypassTenantGuard
  async getOperationUnscoped(companyId: string, id: string) {
    return this.forCompany(companyId).getOperation(id);
  }

  @BypassTenantGuard
  async updateOperationUnscoped(companyId: string, id: string, data: RecordOperationUpdate): Promise<void> {
    await this.forCompany(companyId).updateOperation(id, data);
  }

  @BypassTenantGuard
  async clearOperationLockUnscoped(companyId: string, id: string): Promise<void> {
    await this.releaseTerminalOperation(companyId, id);
  }

  @BypassTenantGuard
  async publishStageUnscoped(companyId: string, operationId: string, revision: number): Promise<void> {
    await this.forCompany(companyId).publishStage(operationId, revision);
  }

  private async capturedEventTypes(
    companyId: string,
    selection: { eventId: string } | { operationId: string },
  ): Promise<Array<{ typeId: string }>> {
    const typeIds = new Set<string>();
    const collect = async (eventIds: string[]) => {
      if (!eventIds.length) return;
      const rows = await this.prisma.eventLog.findMany({
        where: { companyId, subjectKind: "record", id: { in: eventIds } },
        distinct: ["subjectTypeId"],
        select: { subjectTypeId: true },
      });
      for (const row of rows) if (row.subjectTypeId !== null) typeIds.add(row.subjectTypeId);
    };
    if ("eventId" in selection) await collect([selection.eventId]);
    else {
      let afterKey: string | undefined;
      for (;;) {
        const staged = await this.prisma.recordStageRow.findMany({
          where: {
            companyId,
            operationId: selection.operationId,
            kind: "event",
            ...(afterKey === undefined ? {} : { key: { gt: afterKey } }),
          },
          select: { key: true, payload: true },
          orderBy: { key: "asc" },
          take: STAGED_EVENT_PAGE,
        });
        await collect(
          staged.flatMap((row) => {
            const id = (row.payload as { id?: unknown } | null)?.id;
            return typeof id === "string" ? [id] : [];
          }),
        );
        if (staged.length < STAGED_EVENT_PAGE) break;
        afterKey = staged.at(-1)?.key;
      }
    }
    return [...typeIds].map((typeId) => ({ typeId }));
  }

  private async captureRecordEventMatches(
    companyId: string,
    selection: { eventId: string } | { operationId: string },
    beforeDeletion = false,
  ): Promise<void> {
    const rows = await this.prisma.recordEventSubscription.findMany({
      where: { companyId, enabled: true, owner: { companyId, status: "active", role: { companyId } } },
      include: {
        owner: {
          select: {
            id: true,
            status: true,
            role: {
              select: {
                id: true,
                companyId: true,
                isSystemRole: true,
                permissions: { where: { companyId }, select: { resource: true, action: true } },
              },
            },
          },
        },
      },
    });
    if (!rows.length) return;
    const selected =
      "eventId" in selection
        ? Prisma.sql`event.id = ${selection.eventId}`
        : Prisma.sql`EXISTS (SELECT 1 FROM "RecordStageRow" stage
          WHERE stage."companyId" = ${companyId} AND stage."operationId" = ${selection.operationId}
            AND stage.kind = 'event' AND stage.payload->>'id' = event.id
            AND COALESCE((stage.payload->>'publish')::boolean, TRUE))`;
    const [model, grants, types] = await Promise.all([
      this.getModel(),
      this.getGrants(),
      this.capturedEventTypes(companyId, selection),
    ]);
    for (const { owner, companyId: rowCompanyId, ...stored } of rows) {
      if (rowCompanyId !== companyId) throw new Error("Foreign record event subscription");
      const subscription = RecordEventSubscriptionSchema.parse(stored);
      const policy = recordAccessForActor({ actor: owner, model, grants, records: this, companyId, userId: owner.id });
      const access = policy.access(model.types.map((item) => item.id));
      for (const { typeId } of types) {
        if (!subscription.sources?.length && subscription.typeId && subscription.typeId !== typeId) continue;
        const type = model.types.find((candidate) => candidate.id === typeId);
        if (!type || type.archived) continue;
        const sources = subscription.sources?.length
          ? subscription.sources.filter((source) => source.query.typeId === typeId)
          : [
              {
                query: subscription.query ?? { typeId },
                changedFieldIds: subscription.changedFieldIds,
                events: subscription.events,
              },
            ];
        if (!sources.length) continue;
        const recursion =
          subscription.kind === "routine"
            ? Prisma.sql`NOT (event.payload->'cause' ? 'routineDepth')`
            : Prisma.sql`TRUE`;
        for (const source of sources) {
          const query = RecordQuerySchema.parse(source.query);
          if (invalidRecordQueryPart(query, model)) continue;
          const compiled = compileRecordQuery(companyId, query, model, access);
          const erasable =
            (access.get(typeId)?.access ?? "none") === "none"
              ? Prisma.sql`FALSE`
              : Prisma.sql`event.kind = 'record.deletedPermanently'`;
          const watched = source.changedFieldIds.flatMap((fieldId) => {
            const field = model.fields.find(
              (candidate) => candidate.id === fieldId && candidate.typeId === typeId && !candidate.archived,
            );
            return field ? [field] : [];
          });
          const watchedRecord = Prisma.raw(`"watched_record"`);
          const readableChange = watched.length
            ? Prisma.join(
                watched.map(
                  (field) =>
                    Prisma.sql`((event.payload->'changedFieldIds') ?| ARRAY[${field.id}]::text[] AND ${fieldReadPredicate(companyId, field, model, access, watchedRecord)})`,
                ),
                " OR ",
              )
            : Prisma.sql`FALSE`;
          const changed = source.changedFieldIds.length
            ? Prisma.sql`(event.kind <> 'record.updated' OR EXISTS (SELECT 1 FROM "CrmRecord" ${watchedRecord}
                WHERE ${watchedRecord}."companyId" = ${companyId} AND ${watchedRecord}."typeId" = event."subjectTypeId"
                  AND ${watchedRecord}.id = event."subjectId" AND (${readableChange})))`
            : Prisma.sql`TRUE`;
          await this.prisma.$executeRaw(Prisma.sql`
            INSERT INTO "RecordEventMatch" ("companyId", "eventId", "subscriptionId", "subscriptionRevision")
            SELECT ${companyId}, event.id, ${subscription.id}, ${subscription.revision}
            FROM "EventLog" event
            WHERE event."companyId" = ${companyId} AND event."subjectKind" = 'record' AND ${selected} AND event."subjectTypeId" = ${typeId}
              AND event.kind IN (${Prisma.join(source.events)}) AND ${changed} AND ${recursion}
              AND ${beforeDeletion ? Prisma.sql`event.kind = 'record.deleted'` : Prisma.sql`event.kind <> 'record.deleted'`}
              AND (${erasable} OR EXISTS (SELECT 1 FROM (${compiled.matching}) matching WHERE matching.id = event."subjectId"))
            ON CONFLICT ("companyId", "eventId", "subscriptionId") DO NOTHING`);
        }
      }
    }
  }
}
