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
import type { RecordSearch } from "./record-search.schema";
import type { RecordSearchRow } from "./record-search-query";
import type { RecordIdentity, RecordIdentityInput } from "./record-identity.schema";
import type { RecordDetailLayout } from "./record-detail-layout.schema";
import type { RecordRevisionChange } from "./record-revision.schema";
import type { RecordEventSubscriptionDefinition } from "./record-event-subscription.schema";

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

export interface RecordRepo {
  getIdentitiesCompanyWide(ref: RecordRef): Promise<RecordIdentity[]>;
  getRecordIdentitiesCompanyWide(typeId: string, recordIds: string[]): Promise<Map<string, RecordIdentity[]>>;
  getIdentityOwnersCompanyWide(
    keys: Array<{ channelClass: string; value: string }>,
  ): Promise<Array<{ channelClass: string; value: string; ref: RecordRef }>>;
  setIdentities(ref: RecordRef, inputs: RecordIdentityInput[]): Promise<void>;
  getModel(): Promise<RecordModel>;
  searchRecords(
    request: { search: RecordSearch } | { refs: RecordRef[] },
    model: RecordModel,
    access: RecordAccessMap,
  ): Promise<RecordSearchRow[]>;
  getViewStatesCompanyWide(
    typeIds: string[],
    afterKey?: string,
  ): Promise<Array<{ key: string; typeId: string; state: DataViewState }>>;
  getDetailLayoutsCompanyWide(
    typeIds: string[],
    afterId?: string,
  ): Promise<Array<{ id: string; typeId: string; layout: RecordDetailLayout }>>;
  getActivityWidgetQueriesCompanyWide(afterId?: string): Promise<Array<{ id: string; query: RecordActivityQuery }>>;
  getEventSubscriptionsCompanyWide(afterId?: string): Promise<RecordEventSubscriptionDefinition[]>;
  getWidgetMeasuresCompanyWide(afterId?: string): Promise<Array<{ id: string; measure: RecordMeasure }>>;
  getWorkspaceCurrencyOrThrow(): Promise<string>;
  getState(): Promise<RecordSchemaState | null>;
  getGrants(): Promise<RecordTypeGrant[]>;
  countRecordsCompanyWide(typeIds: string[]): Promise<number>;
  validRecordRolesCompanyWide(roleIds: string[]): Promise<boolean>;
  validateRelationshipCardinality(model: RecordModel): Promise<string[]>;
  saveModel(model: RecordModel, actorId: string, change?: RecordRevisionChange): Promise<void>;
  setGrants(typeId: string, grants: Array<{ roleId: string; actions: Action[] }>): Promise<void>;
  getRecordCompanyWide(ref: RecordRef): Promise<StoredRecord | null>;
  getRecordsCompanyWide(refs: RecordRef[]): Promise<StoredRecord[]>;
  getEmbeddedChildrenCompanyWide(
    typeId: string,
    parentRelationId: string,
    parentIds: string[],
    afterId: string | undefined,
    take: number,
  ): Promise<StoredRecord[]>;
  getRecordRefsCompanyWide(typeId: string, afterId?: string, take?: number): Promise<RecordRef[]>;
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
  measure(measure: RecordMeasure, model: RecordModel, access: RecordAccessMap, currency: string): Promise<MeasureRow[]>;
  create(ref: RecordRef, assignedUserIds: string[]): Promise<void>;
  touch(ref: RecordRef): Promise<void>;
  delete(ref: RecordRef): Promise<void>;
  setAssignments(ref: RecordRef, userIds: string[]): Promise<void>;
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
  ): Promise<Array<{ id: string; relationId: string; source: RecordRef; target: RecordRef }>>;
  getPendingDeletionRef(operationId: string): Promise<RecordRef | null>;
  queueDeletionRef(operationId: string, ref: RecordRef): Promise<void>;
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
    actorId: string,
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
