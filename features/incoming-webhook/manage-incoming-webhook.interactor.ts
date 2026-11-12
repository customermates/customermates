import type { Validated } from "@/core/validation/validation.utils";
import type { PlanLimitsService } from "@/ee/subscription/plan-limits.service";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordRepo } from "@/features/records/record.repo";
import type { IncomingWebhookEngine } from "./incoming-webhook-engine";
import type { IncomingWebhookSettings } from "./incoming-webhook-dto";
import type { IncomingWebhookRepo, StoredIncomingWebhook } from "./incoming-webhook.repo";
import type {
  IncomingWebhookMapping,
  IncomingWebhookPreview,
  IncomingWebhookResult,
  ManageIncomingWebhookData,
} from "./incoming-webhook.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { rolePermits } from "@/core/base/permission.service";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { formFieldOptions } from "@/features/public-form/public-form-config-validation";
import { Action, Resource } from "@/generated/prisma";

import { parseIncomingMapping, toIncomingDeliveryDto, toIncomingWebhookDto } from "./incoming-webhook-dto";
import { IncomingWebhookResultSchema, ManageIncomingWebhookSchema } from "./incoming-webhook.schema";

type Outcome = Validated<IncomingWebhookResult>;

function previewOf(plan: Awaited<ReturnType<IncomingWebhookEngine["plan"]>>): IncomingWebhookPreview {
  if (!plan.ok) {
    return {
      ok: false,
      outcome: null,
      existingRecordId: null,
      values: plan.reason === "invalid" ? plan.values : [],
    };
  }
  return {
    ok: true,
    outcome: plan.operation,
    existingRecordId: plan.existing?.ref.recordId ?? null,
    values: plan.mapped.values,
  };
}

@TenantInteractor({ resource: Resource.api, read: "all" })
export class ManageIncomingWebhookInteractor extends AuthenticatedInteractor<
  ManageIncomingWebhookData,
  IncomingWebhookResult
> {
  constructor(
    private repo: IncomingWebhookRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private engine: IncomingWebhookEngine,
    private plans: Pick<PlanLimitsService, "admitWebhooks">,
    private settings: IncomingWebhookSettings,
  ) {
    super();
  }

  @Write({ input: ManageIncomingWebhookSchema, output: IncomingWebhookResultSchema, tx: false })
  async invoke(data: ManageIncomingWebhookData): Outcome {
    switch (data.action) {
      case "list":
        return this.list(data.typeId);
      case "get":
        return this.get(data.id);
      case "fields":
        return this.fields(data.typeId);
      case "create":
        return this.create(data);
      case "update":
        return this.update(data);
      case "delete":
        return this.remove(data.id);
      case "test":
        return this.test(data.id, data.payload);
      case "deliveries":
        return this.deliveries(data.id, data.limit);
    }
  }

  private permitted(action: Action): boolean {
    return rolePermits(this.user.role, Resource.api, action);
  }

  private dto(webhook: StoredIncomingWebhook) {
    return toIncomingWebhookDto(webhook, this.settings);
  }

  private async list(typeId: string | undefined): Outcome {
    const items = (await this.repo.listWebhooks(typeId)).flatMap((webhook) => this.dto(webhook) ?? []);
    return { ok: true as const, data: { items } };
  }

  private async get(id: string): Outcome {
    const stored = await this.repo.findWebhook(id);
    const webhook = stored ? this.dto(stored) : null;
    if (!webhook) return failNotFound(CustomErrorCode.incomingWebhookNotFound, ["id"]);
    return { ok: true as const, data: { webhook } };
  }

  private async fields(typeId: string): Outcome {
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    const type = model.types.find((entry) => entry.id === typeId && !entry.archived);
    if (!type || !policy.actor || !policy.canReadType(type.id))
      return failNotFound(CustomErrorCode.recordTypeNotFound, ["typeId"]);
    return { ok: true as const, data: { typeLabel: type.label, fields: formFieldOptions(model, type.id) } };
  }

  private async invalidMapping(typeId: string, mapping: IncomingWebhookMapping): Promise<string[] | null> {
    const model = await this.records.getModel();
    const eligible = new Set(formFieldOptions(model, typeId).map((field) => field.fieldId));
    const bad = mapping.fields.findIndex((field) => !eligible.has(field.fieldId));
    return bad >= 0 ? ["mapping", "fields", String(bad), "fieldId"] : null;
  }

  private async create(data: Extract<ManageIncomingWebhookData, { action: "create" }>): Outcome {
    if (!this.permitted(Action.create)) return failAuthorization(CustomErrorCode.permissionDenied);
    const refused = await this.plans.admitWebhooks(this.companyId);
    if (refused) return failConflict(CustomErrorCode.planWebhooksNotIncluded, [], refused);
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!model.types.some((type) => type.id === data.typeId && !type.archived))
      return failNotFound(CustomErrorCode.recordTypeNotFound, ["typeId"]);
    if (!policy.actor || !policy.allowed(data.typeId, "create"))
      return failAuthorization(CustomErrorCode.permissionDenied, ["typeId"]);
    const invalid = await this.invalidMapping(data.typeId, data.mapping);
    if (invalid) return fail(CustomErrorCode.incomingWebhookMappingInvalid, invalid);

    const stored = await this.repo.createWebhook({
      typeId: data.typeId,
      name: data.name,
      enabled: data.enabled ?? true,
      signingSecret: data.signingSecret ?? null,
      signatureHeader: data.signatureHeader ?? "x-signature",
      mapping: data.mapping,
      samplePayload: data.samplePayload ?? null,
    });
    return this.saved(stored);
  }

  private async saved(stored: StoredIncomingWebhook): Outcome {
    const webhook = this.dto(stored);
    if (!webhook) return fail(CustomErrorCode.incomingWebhookMappingInvalid, ["mapping"]);
    return { ok: true as const, data: { webhook } };
  }

  private async update(data: Extract<ManageIncomingWebhookData, { action: "update" }>): Outcome {
    if (!this.permitted(Action.update)) return failAuthorization(CustomErrorCode.permissionDenied);
    const existing = await this.repo.findWebhook(data.id);
    if (!existing) return failNotFound(CustomErrorCode.incomingWebhookNotFound, ["id"]);
    if (data.mapping) {
      const invalid = await this.invalidMapping(existing.typeId, data.mapping);
      if (invalid) return fail(CustomErrorCode.incomingWebhookMappingInvalid, invalid);
    }
    const stored = await this.repo.updateWebhook(data.id, {
      ...(data.name === undefined ? {} : { name: data.name }),
      ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
      ...(data.signingSecret === undefined ? {} : { signingSecret: data.signingSecret }),
      ...(data.signatureHeader === undefined ? {} : { signatureHeader: data.signatureHeader }),
      ...(data.mapping === undefined ? {} : { mapping: data.mapping }),
      ...(data.samplePayload === undefined ? {} : { samplePayload: data.samplePayload }),
      ...(data.rotateUrl ? { rotateToken: true } : {}),
    });
    return this.saved(stored);
  }

  private async remove(id: string): Outcome {
    if (!this.permitted(Action.delete)) return failAuthorization(CustomErrorCode.permissionDenied);
    if (!(await this.repo.deleteWebhook(id))) return failNotFound(CustomErrorCode.incomingWebhookNotFound, ["id"]);
    return { ok: true as const, data: { deleted: true as const } };
  }

  private async test(id: string, payload: unknown): Outcome {
    const stored = await this.repo.findWebhook(id);
    const mapping = stored ? parseIncomingMapping(stored.mapping) : null;
    if (!stored || !mapping) return failNotFound(CustomErrorCode.incomingWebhookNotFound, ["id"]);
    const plan = await this.engine.plan({ typeId: stored.typeId, mapping }, payload ?? stored.samplePayload ?? {});
    return { ok: true as const, data: { preview: previewOf(plan) } };
  }

  private async deliveries(id: string, limit: number | undefined): Outcome {
    if (!(await this.repo.findWebhook(id))) return failNotFound(CustomErrorCode.incomingWebhookNotFound, ["id"]);
    const rows = await this.repo.listDeliveries(id, limit ?? 25);
    return { ok: true as const, data: { deliveries: rows.map(toIncomingDeliveryDto) } };
  }
}
