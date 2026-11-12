import type { Validated } from "@/core/validation/validation.utils";
import type { RecordModel, RecordRef } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { RecordQueryResult } from "@/features/records/record-query-result.schema";
import type { RecordRepo } from "@/features/records/record.repo";
import type { FormRecordWriter } from "@/features/public-form/public-form-person";
import type { IncomingWebhookMapping } from "./incoming-webhook.schema";
import type { MappedPayload } from "./incoming-webhook-mapping";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { findPersonByEmail } from "@/features/public-form/public-form-person";

import { mapIncomingPayload } from "./incoming-webhook-mapping";

export type RecordQuerier = { invoke(query: RecordQuery): Validated<RecordQueryResult> };

export type AcceptedMapping = Extract<MappedPayload, { ok: true }>;

export type WebhookPlan =
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "invalid"; values: MappedPayload["values"] }
  | {
      ok: true;
      typeId: string;
      operation: "create" | "update";
      existing: { ref: RecordRef; version: number } | null;
      mapped: AcceptedMapping;
      model: RecordModel;
    };

export type WebhookApplied =
  | { ok: true; operation: "create" | "update"; recordId: string | null }
  | { ok: false; reason: "conflict" | "invalid" | "failed"; message: string };

type PlanInput = { typeId: string; mapping: IncomingWebhookMapping };

function failureCode(issues: ReadonlyArray<{ code: string; params?: Record<string, unknown> }>): string | null {
  const custom = issues.find((issue) => issue.code === "custom" && typeof issue.params?.error === "string");
  return typeof custom?.params?.error === "string" ? custom.params.error : null;
}

export class IncomingWebhookEngine {
  constructor(
    private records: RecordRepo,
    private query: RecordQuerier,
    private writer: FormRecordWriter,
  ) {}

  async plan(webhook: PlanInput, payload: unknown): Promise<WebhookPlan> {
    const model = await this.records.getModel();
    if (!model.types.some((type) => type.id === webhook.typeId && !type.archived))
      return { ok: false, reason: "unavailable" };

    const mapped = mapIncomingPayload(webhook.mapping, payload, webhook.typeId, model.fields);
    if (!mapped.ok) return { ok: false, reason: "invalid", values: mapped.values };

    const existing = mapped.match ? await this.findExisting(webhook.typeId, mapped.match) : null;
    return { ok: true, typeId: webhook.typeId, operation: existing ? "update" : "create", existing, mapped, model };
  }

  private async findExisting(
    typeId: string,
    match: NonNullable<AcceptedMapping["match"]>,
  ): Promise<{ ref: RecordRef; version: number } | null> {
    if (match.identity) {
      const ref = await findPersonByEmail(this.records, typeId, match.identity.value);
      const row = ref ? await this.records.getRecordCompanyWide(ref) : null;
      return ref && row ? { ref, version: row.version } : null;
    }
    if (!match.scalar) return null;
    const result = await this.query.invoke({
      typeId,
      fields: [],
      filters: [{ fieldId: match.fieldId, operator: "eq", value: match.scalar }],
      relationships: [],
      sort: [],
      page: 1,
      pageSize: 1,
    });
    const record = result.ok ? result.data.records[0] : undefined;
    return record ? { ref: record.ref, version: record.version } : null;
  }

  async apply(plan: Extract<WebhookPlan, { ok: true }>, idempotencyKey: string): Promise<WebhookApplied> {
    const { mapped, existing, model, operation, typeId } = plan;
    const attempt = (expectedRevision: number) =>
      this.writer.invoke({
        expectedRevision,
        idempotencyKey,
        mutation:
          operation === "update" && existing
            ? {
                action: "update",
                ref: existing.ref,
                expectedVersion: existing.version,
                fields: mapped.fields,
              }
            : {
                action: "create",
                typeId,
                fields: mapped.fields,
                ...(mapped.identities.length > 0 ? { identities: mapped.identities } : {}),
              },
      });
    let result = await attempt(model.revision);
    if (!result.ok && failureCode(result.error.issues) === CustomErrorCode.recordSchemaChanged)
      result = await attempt((await this.records.getModel()).revision);
    if (result.ok) {
      const ref = result.data.status === "completed" ? result.data.refs[0] : undefined;
      return { ok: true, operation, recordId: existing?.ref.recordId ?? ref?.recordId ?? null };
    }
    const code = failureCode(result.error.issues);
    if (code === CustomErrorCode.recordIdempotencyConflict || code === CustomErrorCode.recordVersionChanged)
      return { ok: false, reason: "conflict", message: code };
    if (code === CustomErrorCode.recordValueInvalid || code === CustomErrorCode.recordValueRequired)
      return { ok: false, reason: "invalid", message: code };
    return { ok: false, reason: "failed", message: code ?? "failed" };
  }
}
