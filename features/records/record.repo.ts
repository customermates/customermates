import type { RecordActivityQuery } from "@/ee/messaging/activities/record-activities.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type {
  Action,
  CrmRecord,
  Prisma,
  RecordOperation,
  RecordSchemaState,
  RecordTypeGrant,
  RecordValue,
} from "@/generated/prisma";
import type {
  CalculatedValue,
  RecordModel,
  RecordRef,
  RecordMember,
  RecordRelationshipSummary,
  RecordPathSummary,
} from "./record-model.schema";
import type { RecordPathSelection } from "./record-relationship-path.schema";
import type { RecordRelationshipSelection } from "./record-column.schema";
import type { RecordAccessMap, RecordQuery, RecordReadScope } from "./record-query.schema";
import type { RecordGroupingResult } from "./record-grouping.schema";
import type { RecordMeasure } from "./record-measure.schema";
import type { MeasureRow } from "./record-measure";
import type { RecordSearchRequest, RecordSearchRow } from "./record-search-query";
import type { RecordIdentity, RecordIdentityInput } from "./record-identity.schema";
import type { RecordDetailLayout } from "./record-detail-layout.schema";
import type { RecordRevisionChange } from "./record-revision.schema";
import type { RecordEventSubscriptionDefinition } from "./record-event-subscription.schema";
import type { ConfigurationPreview, ConfigurationTarget } from "./configuration.schema";
import type { ConfigurationDeletionRecord } from "./configuration-lifecycle";

export type RecordDefinitionDeletion = {
  typeIds: string[];
  fieldIds: string[];
  relationIds: string[];
  channelTypeIds: string[];
};
export type ConfigurationConsumerCleanup =
  | { kind: "view" | "personalLayout"; id: string; state: DataViewState }
  | { kind: "detailLayout"; id: string; layout: RecordDetailLayout }
  | { kind: "widget"; id: string; measure: RecordMeasure }
  | { kind: "eventSubscription"; subscription: RecordEventSubscriptionDefinition }
  | { kind: "eventSubscriptionRemoval"; id: string };

export type RecordTrashItem = {
  id: string;
  typeId: string;
  targetId: string;
  label: string;
  batchId: string;
  deletedById: string | null;
  deletedAt: Date;
  expiresAt: Date;
  payload: Prisma.JsonValue;
};
export type RecordTrashItemInput = Omit<RecordTrashItem, "deletedAt" | "expiresAt" | "payload">;
export type TrashedRecordLink = { id: string; relationId: string; source: RecordRef; target: RecordRef };
export type TrashReadOptions = { includeTrash?: boolean };

export type StoredRecord = CrmRecord & {
  values: RecordValue[];
  assignments: Array<{ userId: string; user?: RecordMember }>;
};
export type RecordActor = {
  id: string;
  status: string;
  role: {
    id: string;
    companyId: string;
    isSystemRole: boolean;
    permissions: Array<{ resource: string; action: Action }>;
  } | null;
};
export interface RecordActorRepo {
  getCurrentRecordActorCompanyWide(): Promise<RecordActor | null>;
  findRecordAssigneesCompanyWide(ids: string[]): Promise<string[]>;
}

export type RecordPlacement = { afterRecordId?: string; beforeRecordId?: string };

export interface RecordRepo {
  getIdentitiesCompanyWide(ref: RecordRef): Promise<RecordIdentity[]>;
  hasRecordHistoryCompanyWide(ref: RecordRef): Promise<boolean>;
  getRecordIdentitiesCompanyWide(typeId: string, recordIds: string[]): Promise<Map<string, RecordIdentity[]>>;
  getIdentityChannelsCompanyWide(keys: Array<{ channelClass: string; value: string }>): Promise<RecordIdentity[]>;
  getStagedIdentityChannelsCompanyWide(
    operationId: string,
    keys: Array<{ channelClass: string; value: string }>,
  ): Promise<RecordIdentity[]>;
  stageIdentityChannelsCompanyWide(operationId: string, identities: RecordIdentity[]): Promise<void>;
  getIdentityOwnersCompanyWide(
    keys: Array<{ channelClass: string; value: string }>,
    typeIds?: string[],
    options?: { access?: RecordAccessMap; limitPerKey?: number },
  ): Promise<
    Array<{
      channelClass: string;
      value: string;
      identityId: string;
      ref: RecordRef;
    }>
  >;
  getIdentityOwnerRefsPageCompanyWide(
    identityId: string,
    after: RecordRef | undefined,
    take: number,
    typeIds: string[],
  ): Promise<RecordRef[]>;
  setIdentityResolutionCompanyWide(
    identityId: string,
    input: Pick<RecordIdentityInput, "messagingId" | "displayName" | "profileUrl">,
  ): Promise<void>;
  setIdentities(ref: RecordRef, inputs: RecordIdentityInput[]): Promise<void>;
  getLastFieldWritersCompanyWide(targets: Array<{ ref: RecordRef; fieldId: string }>): Promise<Map<string, string>>;
  getModel(): Promise<RecordModel>;
  searchRecords(request: RecordSearchRequest, model: RecordModel, access: RecordAccessMap): Promise<RecordSearchRow[]>;
  getViewStatesCompanyWide(
    typeIds: string[],
    afterKey?: string,
  ): Promise<Array<{ key: string; typeId: string; name: string | null; state: DataViewState }>>;
  getDetailLayoutsCompanyWide(
    typeIds: string[],
    afterId?: string,
  ): Promise<Array<{ id: string; typeId: string; layout: RecordDetailLayout }>>;
  getActivityWidgetQueriesCompanyWide(
    afterId?: string,
  ): Promise<Array<{ id: string; name: string; query: RecordActivityQuery }>>;
  getEventSubscriptionsCompanyWide(
    afterId?: string,
  ): Promise<Array<RecordEventSubscriptionDefinition & { label: string }>>;
  getWidgetMeasuresCompanyWide(afterId?: string): Promise<Array<{ id: string; name: string; measure: RecordMeasure }>>;
  getConfigurationDeletions(targets?: ConfigurationTarget[]): Promise<Map<string, ConfigurationDeletionRecord>>;
  applyConsumerCleanups(cleanups: ConfigurationConsumerCleanup[]): Promise<void>;
  getUserNamesCompanyWide(userIds: string[]): Promise<Map<string, string>>;
  getState(): Promise<RecordSchemaState | null>;
  getGrants(): Promise<RecordTypeGrant[]>;
  countRecordsCompanyWide(typeIds: string[]): Promise<number>;
  countDefinitionDeletion(
    deletion: RecordDefinitionDeletion,
  ): Promise<NonNullable<NonNullable<ConfigurationPreview["deletion"]>["removed"]>>;
  deleteDefinitions(deletion: RecordDefinitionDeletion): Promise<void>;
  countReadableRecordsByType(access: RecordAccessMap): Promise<Array<{ typeId: string; count: number }>>;
  validRecordRolesCompanyWide(roleIds: string[]): Promise<boolean>;
  validateRelationshipCardinality(model: RecordModel): Promise<string[]>;
  saveModel(model: RecordModel, actorId: string, change?: RecordRevisionChange): Promise<void>;
  setGrants(typeId: string, grants: Array<{ roleId: string; actions: Action[] }>): Promise<void>;
  getRecordCompanyWide(ref: RecordRef, options?: TrashReadOptions): Promise<StoredRecord | null>;
  lockRecord(ref: RecordRef): Promise<void>;
  getRecordsCompanyWide(refs: RecordRef[], options?: TrashReadOptions): Promise<StoredRecord[]>;
  getEmbeddedChildrenCompanyWide(
    typeId: string,
    parentRelationId: string,
    parentIds: string[],
    afterId: string | undefined,
    take: number,
  ): Promise<StoredRecord[]>;
  getRecordRefsCompanyWide(
    typeId: string,
    afterId?: string,
    take?: number,
    options?: TrashReadOptions,
  ): Promise<RecordRef[]>;
  query(
    query: RecordQuery,
    model: RecordModel,
    access: RecordAccessMap,
    memberScope?: RecordReadScope,
  ): Promise<{
    records: StoredRecord[];
    total: number;
    visibleFields: Map<string, Set<string>>;
    grouping?: RecordGroupingResult;
  }>;
  getVisibleFields(ref: RecordRef, model: RecordModel, access: RecordAccessMap): Promise<Set<string>>;
  getVisibleFieldsCompanyWide(
    refs: RecordRef[],
    model: RecordModel,
    access: RecordAccessMap,
  ): Promise<Map<string, Set<string>>>;
  relationshipSummaries(
    typeId: string,
    recordIds: string[],
    selections: RecordRelationshipSelection[],
    model: RecordModel,
    access: RecordAccessMap,
  ): Promise<Map<string, RecordRelationshipSummary[]>>;
  pathSummaries(
    typeId: string,
    recordIds: string[],
    selections: RecordPathSelection[],
    model: RecordModel,
    access: RecordAccessMap,
  ): Promise<Map<string, RecordPathSummary[]>>;
  measure(measure: RecordMeasure, model: RecordModel, access: RecordAccessMap): Promise<MeasureRow[]>;
  create(ref: RecordRef, assignedUserIds: string[]): Promise<void>;
  touch(ref: RecordRef): Promise<void>;
  placeRecord(ref: RecordRef, placement: RecordPlacement, groupFieldId: string | null): Promise<boolean>;
  delete(ref: RecordRef): Promise<void>;
  moveToTrash(ref: RecordRef, trashItemId: string): Promise<void>;
  addTrashItems(items: RecordTrashItemInput[]): Promise<void>;
  getRecordTrashItemsCompanyWide(selection: { ids: string[] } | { batchId: string }): Promise<RecordTrashItem[]>;
  getTrashedRecordRefsCompanyWide(trashItemIds: string[], take: number): Promise<RecordRef[]>;
  getTrashedLinksCompanyWide(refs: RecordRef[], take: number): Promise<TrashedRecordLink[]>;
  getTrashedParentCompanyWide(ref: RecordRef, relationId: string): Promise<RecordRef | null>;
  restoreRecords(refs: RecordRef[]): Promise<void>;
  restoreLink(id: string): Promise<void>;
  dropTrashedLink(id: string): Promise<void>;
  removeTrashItems(ids: string[]): Promise<void>;
  purgeTrashItems(ids: string[]): Promise<RecordRef[]>;
  countTrashedRecordsCompanyWide(
    trashItemIds: string[],
  ): Promise<{ records: Array<{ typeId: string; count: number }>; links: number }>;
  setAssignments(ref: RecordRef, userIds: string[]): Promise<void>;
  getMembersCompanyWide(userIds: string[]): Promise<RecordMember[]>;
  setValue(ref: RecordRef, fieldId: string, result: CalculatedValue, revision: number): Promise<void>;
  setValueDependencies(ref: RecordRef, fieldId: string, sources: RecordRef[]): Promise<void>;
  getValueDependencies(ref: RecordRef, fieldId: string): Promise<RecordRef[]>;
  getRecordDependenciesCompanyWide(ref: RecordRef): Promise<Array<{ fieldId: string; sources: RecordRef[] }>>;
  getLinksCompanyWide(
    ref: RecordRef,
    take?: number,
  ): Promise<Array<{ relationId: string; source: RecordRef; target: RecordRef }>>;
  getLinksCompanyWidePage(
    ref: RecordRef,
    afterId: string | undefined,
    take: number,
  ): Promise<
    Array<{
      id: string;
      relationId: string;
      source: RecordRef;
      target: RecordRef;
    }>
  >;
  getPendingDeletionRef(operationId: string): Promise<{ ref: RecordRef; root: string } | null>;
  queueDeletionRef(operationId: string, ref: RecordRef, root: string): Promise<void>;
  completeDeletionRef(operationId: string, ref: RecordRef): Promise<void>;
  getStagedDeletionStatus(
    operationId: string,
    revision: number,
  ): Promise<{
    recordCount: number;
    linkCount: number;
    affectedCount: number;
    affectedTypeIds: string[];
    restricted: boolean;
    impactHash: string;
  }>;
  validateStagedDeletionAccess(operationId: string, access: RecordAccessMap): Promise<boolean>;
  getOutgoingLinksCompanyWide(
    typeId: string,
    recordIds: string[],
    take: number,
  ): Promise<Array<{ relationId: string; source: RecordRef; target: RecordRef }>>;
  linkedRecordsCompanyWide(
    ref: RecordRef,
    relationId: string,
    direction: "outgoing" | "incoming",
    take?: number,
  ): Promise<RecordRef[]>;
  link(relationId: string, source: RecordRef, target: RecordRef): Promise<void>;
  unlink(relationId: string, source: RecordRef, target: RecordRef): Promise<void>;
  receipt(key: string, userId: string): Promise<{ requestHash: string; result: Prisma.JsonValue } | null>;
  saveReceipt(key: string, userId: string, hash: string, result: unknown): Promise<void>;
  appendEvent(
    ref: RecordRef,
    actorId: string | null,
    causeId: string,
    kind: string,
    payload: unknown,
    beforeDeletion?: boolean,
  ): Promise<void>;
  createOperation(request: {
    id: string;
    userId: string;
    kind: string;
    expectedRevision: number;
    request: unknown;
    stagedSchema?: RecordModel;
  }): Promise<RecordOperation>;
  getOperation(id: string): Promise<RecordOperation | null>;
  updateOperation(
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
  ): Promise<void>;
  stageRow(operationId: string, kind: string, key: string, payload: unknown): Promise<void>;
  getStageRows(operationId: string, kind: string): Promise<Array<{ key: string; payload: Prisma.JsonValue }>>;
  getStageRowsPage(
    operationId: string,
    kind: string,
    afterKey: string | undefined,
    take: number,
  ): Promise<Array<{ key: string; payload: Prisma.JsonValue }>>;
  getStageRow(operationId: string, kind: string, key: string): Promise<Prisma.JsonValue | null>;
  getStageRowsByPrefix(
    operationId: string,
    kind: string,
    prefix: string,
  ): Promise<Array<{ key: string; payload: Prisma.JsonValue }>>;
  getStageRecordRefsCompanyWide(
    operationId: string,
    typeId: string,
    afterId?: string,
    take?: number,
    options?: TrashReadOptions,
  ): Promise<RecordRef[]>;
  linkedStageRecordsCompanyWide(
    operationId: string,
    ref: RecordRef,
    relationId: string,
    direction: "outgoing" | "incoming",
    take?: number,
  ): Promise<RecordRef[]>;
  publishStage(operationId: string, revision: number): Promise<void>;
  clearOperationLock(id: string): Promise<void>;
  failOperationUnscoped(input: { companyId: string; userId: string; operationId: string }): Promise<void>;
}
