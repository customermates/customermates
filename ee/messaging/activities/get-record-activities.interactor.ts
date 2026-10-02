import type { RecordActivitiesRepo } from "./record-activities.repo";
import type { RecordActivitiesInput, RecordActivitiesResult } from "./record-activities.schema";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordIdentityReader } from "@/features/records/record-identity-reader";
import type { RecordHistoryReader } from "@/features/records/record-history-reader";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { Validated } from "@/core/validation/validation.utils";
import type {
  ActivityEntryDto,
  ActivityKind,
  ActivityRecordRefDto,
  ActivityRecordContextDto,
} from "./activities.schema";
import type { RecordRef } from "@/features/records/record-model.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordActivitiesInputSchema, RecordActivitiesResultSchema } from "./record-activities.schema";
import { RecordEventPayloadSchema } from "@/features/records/record-event.schema";
import { recordKey } from "@/features/records/record-calculation.service";
import { recordWriteFailure } from "@/features/records/mutate-record.interactor";
import { hydrateMessageRecordIdentities } from "../record-message-identities";
import { toMessagingMessageDto } from "../inbox/inbox.schema";
import { ACTIVITY_RELATED_RECORD_LIMIT } from "./activity-record-refs";
import { decodeLegacyRecordHistory } from "@/features/records/legacy-record-history";
import { getTranslations } from "next-intl/server";
import { isSystemActivityAuditEvent, systemActivityChanges } from "./system-audit-events";

@AllowInDemoMode
@TenantInteractor()
export class GetRecordActivitiesInteractor extends AuthenticatedInteractor<
  RecordActivitiesInput,
  RecordActivitiesResult
> {
  constructor(
    private activities: RecordActivitiesRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private identities: RecordIdentityReader,
    private history: RecordHistoryReader,
    private entitlements: Pick<EntitlementService, "require">,
  ) {
    super();
  }

  @Validate(RecordActivitiesInputSchema)
  async invoke(input: RecordActivitiesInput): Validated<RecordActivitiesResult> {
    return runInTransaction(
      async () => {
        try {
          const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
          if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
          const recordFilters = (input.filters ?? []).filter((filter) => filter.kind === "record");
          const typeIds = [...input.scope.typeIds, ...recordFilters.map((filter) => filter.typeId)];
          if (
            typeIds.some(
              (typeId) =>
                !model.types.some((type) => type.id === typeId && !type.archived) ||
                !(policy.allowed(typeId, "readAll") || policy.allowed(typeId, "readOwn")),
            )
          )
            return failNotFound(CustomErrorCode.recordTypeNotFound);
          for (const ref of [
            ...input.scope.records,
            ...recordFilters.flatMap((filter) =>
              filter.recordIds.map((recordId) => ({
                typeId: filter.typeId,
                recordId,
              })),
            ),
          ]) {
            const row = await this.records.getRecordCompanyWide(ref);
            if (
              row
                ? !(await policy.canRead(row))
                : !(
                    model.types.some((type) => type.id === ref.typeId && !type.archived) &&
                    policy.allowed(ref.typeId, "readAll") &&
                    (await this.activities.hasHistoryCompanyWide(ref))
                  )
            )
              return failNotFound(CustomErrorCode.recordNotFound);
          }
          const availableSources: ActivityKind[] = [];
          if (policy.allowedSystem("auditLog", "readAll")) availableSources.push("audit");
          if (
            (policy.allowedSystem("inboxMessages", "readAll") || policy.allowedSystem("inboxMessages", "readOwn")) &&
            !(await this.entitlements.require("messaging"))
          )
            availableSources.push("message", "activity", "calendar_event");
          const access = policy.access(model.types.map((type) => type.id));
          const index = await this.activities.index(input, model, access, availableSources);
          const page = index.slice(0, input.limit);
          const ids = (kind: string) => page.filter((row) => row.kind === kind).map((row) => row.id);
          const [events, messages, activities, calendar, eventRefs, legacyEvents] = await Promise.all([
            this.activities.eventsCompanyWide(ids("record")),
            this.activities.messagesCompanyWide(ids("message")),
            this.activities.activitiesCompanyWide(ids("activity")),
            this.activities.calendarEventsCompanyWide(ids("calendar_event")),
            this.activities.relatedRecords(page, input, model, access),
            this.activities.auditLogsCompanyWide(ids("audit")),
          ]);
          await hydrateMessageRecordIdentities(
            messages.map((entry) => entry.message),
            this.identities,
          );
          const identifierMatches = await this.identities.resolve([
            ...activities.flatMap((activity) =>
              activity.identifier ? [{ provider: activity.provider, value: activity.identifier }] : [],
            ),
            ...calendar.flatMap((event) =>
              event.attendeeEmails.map((value) => ({
                provider: event.event.provider,
                value,
              })),
            ),
          ]);
          const matches = new Map(
            identifierMatches.map((match) => [
              JSON.stringify([match.provider, match.value]),
              match.records.map((record) => record.ref),
            ]),
          );
          const references = new Map<string, RecordRef[]>();
          const add = (kind: string, id: string, refs: RecordRef[]) =>
            references.set(`${kind}:${id}`, [...(references.get(`${kind}:${id}`) ?? []), ...refs]);
          for (const event of eventRefs) add(event.kind, event.id, [event.ref]);
          for (const { message } of messages) {
            add(
              "message",
              message.id,
              [message.sender, ...message.recipients.to, ...message.recipients.cc, ...message.recipients.bcc].flatMap(
                (attendee) => attendee.records.map((record) => record.ref),
              ),
            );
          }
          for (const activity of activities) {
            const ref = matches.get(JSON.stringify([activity.provider, activity.identifier]));
            if (ref) add("activity", activity.id, ref);
          }
          for (const event of calendar) {
            add(
              "calendar_event",
              event.id,
              event.attendeeEmails.flatMap((email) => {
                const ref = matches.get(JSON.stringify([event.event.provider, email]));
                return ref ?? [];
              }),
            );
          }
          const allRefs = [...new Map([...references.values()].flat().map((ref) => [recordKey(ref), ref])).values()];
          const labels = new Map<string, ActivityRecordRefDto>();
          for (let offset = 0; offset < allRefs.length; offset += 100) {
            for (const row of await this.records.searchRecords(
              { refs: allRefs.slice(offset, offset + 100) },
              model,
              access,
            )) {
              const type = model.types.find((type) => type.id === row.typeId);
              labels.set(recordKey(row), {
                ref: { typeId: row.typeId, recordId: row.recordId },
                label: row.state === "value" && row.title ? row.title : (type?.label ?? ""),
                avatarUrl: row.pictureUrl,
                icon: type?.icon ?? "list",
              });
            }
          }
          const context = (kind: string, id: string): ActivityRecordContextDto => {
            const refs = [
              ...new Map(
                (references.get(`${kind}:${id}`) ?? []).map((ref) => [recordKey(ref), labels.get(recordKey(ref))]),
              ).values(),
            ].filter((ref): ref is ActivityRecordRefDto => Boolean(ref));
            return {
              primary: refs[0] ?? null,
              related: refs.slice(1, ACTIVITY_RELATED_RECORD_LIMIT + 1),
              relatedOverflow: Math.max(0, refs.length - ACTIVITY_RELATED_RECORD_LIMIT - 1),
            };
          };
          const entries = new Map<string, ActivityEntryDto>();
          for (const event of legacyEvents.filter((event) => isSystemActivityAuditEvent(event.event))) {
            entries.set(`audit:${event.id}`, {
              kind: "audit",
              id: event.id,
              at: event.createdAt,
              actor: event.actor,
              event: event.event,
              changes: systemActivityChanges(event.event, event.eventData, policy.isAdmin),
              records: context("audit", event.id),
            });
          }
          const legacyRecords = legacyEvents.filter((event) => !isSystemActivityAuditEvent(event.event));
          if (legacyRecords.length) {
            const [legacy, t] = await Promise.all([this.activities.legacyModelOrThrow(), getTranslations()]);
            const decoded = legacyRecords.flatMap((event) => {
              const history = decodeLegacyRecordHistory({
                companyId: this.companyId,
                event: event.event,
                entityId: event.entityId,
                eventData: event.eventData,
                model: legacy.model,
                currency: legacy.currency,
                isAdmin: policy.isAdmin,
                archivedFieldLabel: t("RecordModel.archivedField"),
              });
              return history ? [{ event, ...history }] : [];
            });
            const relatedRefs = [
              ...new Map(
                decoded
                  .flatMap((entry) => entry.related.flatMap((relation) => [...relation.before, ...relation.after]))
                  .map((entry) => [recordKey(entry.ref), entry.ref]),
              ).values(),
            ];
            const readable = new Set<string>();
            for (let offset = 0; offset < relatedRefs.length; offset += 100) {
              for (const row of await this.records.getRecordsCompanyWide(relatedRefs.slice(offset, offset + 100)))
                if (await policy.canRead(row)) readable.add(recordKey({ typeId: row.typeId, recordId: row.id }));
            }
            for (const { event, changes, related } of decoded) {
              changes.related = related
                .map((relation) => ({
                  label: relation.label,
                  before: relation.before.filter((entry) => readable.has(recordKey(entry.ref))),
                  after: relation.after.filter((entry) => readable.has(recordKey(entry.ref))),
                }))
                .filter((relation) => relation.before.length || relation.after.length);
              entries.set(`audit:${event.id}`, {
                kind: "audit",
                id: event.id,
                at: event.createdAt,
                actor: event.actor,
                event: event.event,
                changes: [],
                recordChanges: changes,
                records: context("audit", event.id),
              });
            }
          }
          for (const event of events) {
            const parsed = RecordEventPayloadSchema.safeParse(event.payload);
            if (!parsed.success) continue;
            const changes = await this.history.redact(parsed.data, model, policy);
            if (!changes || !["record.created", "record.updated", "record.deleted"].includes(event.kind)) continue;
            entries.set(`record:${event.id}`, {
              kind: "record",
              id: event.id,
              at: event.createdAt,
              actor: event.actor,
              event: event.kind as "record.created" | "record.updated" | "record.deleted",
              changes,
              records: context("record", event.id),
            });
          }
          for (const { message, thread, senderIsMine } of messages) {
            entries.set(`message:${message.id}`, {
              kind: "message",
              id: message.id,
              at: message.sentAt,
              message: toMessagingMessageDto(message),
              thread,
              senderIsMine,
              records: context("message", message.id),
            });
          }
          for (const entry of activities) {
            entries.set(`activity:${entry.id}`, {
              kind: "activity",
              id: entry.id,
              at: entry.at,
              payload: entry.payload,
              records: context("activity", entry.id),
            });
          }
          for (const entry of calendar) {
            entries.set(`calendar_event:${entry.id}`, {
              kind: "calendar_event",
              id: entry.id,
              at: entry.at,
              event: entry.event,
              records: context("calendar_event", entry.id),
            });
          }
          const last = page.at(-1);
          return {
            ok: true as const,
            data: RecordActivitiesResultSchema.parse({
              items: page.flatMap((entry) => {
                const item = entries.get(`${entry.kind}:${entry.id}`);
                return item ? [item] : [];
              }),
              nextCursor: index.length > input.limit && last ? { at: last.at, kind: last.kind, id: last.id } : null,
              availableSources,
            }),
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
