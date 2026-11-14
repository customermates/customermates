import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordRepo } from "@/features/records/record.repo";
import type { PublicFormSettings } from "./public-form-dto";
import type { PublicFormQuota } from "./public-form-quota";
import type { PublicFormRepo, StoredPublicForm } from "./public-form.repo";
import type { PublicFormConfig, PublicFormDto, UpsertPublicFormData } from "./public-form.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { Resource } from "@/generated/prisma";

import { parsePublicFormConfig } from "./public-form-access";
import { invalidFormConfigPaths } from "./public-form-config-validation";
import { readPublicFormUsage, toPublicFormDto } from "./public-form-dto";
import { PublicFormDtoSchema, UpsertPublicFormSchema } from "./public-form.schema";

function consentChanged(previous: PublicFormConfig | null, next: PublicFormConfig): boolean {
  return JSON.stringify(previous?.consent ?? null) !== JSON.stringify(next.consent);
}

@TenantInteractor({ resource: Resource.publicLinks, manage: "create" })
export class UpsertPublicFormInteractor extends AuthenticatedInteractor<UpsertPublicFormData, PublicFormDto> {
  constructor(
    private repo: PublicFormRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private quota: PublicFormQuota,
    private settings: PublicFormSettings,
  ) {
    super();
  }

  @Write({ input: UpsertPublicFormSchema, output: PublicFormDtoSchema })
  async invoke(data: UpsertPublicFormData): Validated<PublicFormDto> {
    const existing = data.id ? await this.repo.findForm(data.id) : null;
    if (data.id && !existing) return failNotFound(CustomErrorCode.publicFormNotFound, ["id"]);

    const typeId = existing?.typeId ?? data.typeId;
    if (!typeId) return fail(CustomErrorCode.recordTypeNotFound, ["typeId"]);
    if (!existing && (await this.repo.findFormOfType(typeId)))
      return failConflict(CustomErrorCode.publicFormExists, ["typeId"]);

    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!model.types.some((type) => type.id === typeId && !type.archived))
      return failNotFound(CustomErrorCode.recordTypeNotFound, ["typeId"]);
    if (!policy.actor || !policy.allowed(typeId, "create"))
      return failAuthorization(CustomErrorCode.permissionDenied, ["typeId"]);

    const previous = existing ? parsePublicFormConfig(existing.config) : null;
    const config = data.config ?? previous;
    if (!config) return fail(CustomErrorCode.publicFormConfigurationInvalid, ["config"]);
    const invalid = invalidFormConfigPaths(config, model, typeId);
    if (invalid.length > 0) return fail(CustomErrorCode.publicFormConfigurationInvalid, invalid[0].split("."));

    const enabled = data.enabled ?? existing?.enabled ?? true;
    if (enabled && (data.enabled !== undefined || !existing) && !(await this.repo.publicLinksAllowed()))
      return failAuthorization(CustomErrorCode.permissionDenied, ["enabled"]);

    const saved = await this.save(data, existing, config, previous, enabled, typeId);
    const usage = await readPublicFormUsage(this.repo, this.quota, this.settings.now?.() ?? new Date());
    const dto = toPublicFormDto(saved, usage, this.settings);
    if (!dto) return fail(CustomErrorCode.publicFormConfigurationInvalid, ["config"]);
    return { ok: true as const, data: dto };
  }

  private save(
    data: UpsertPublicFormData,
    existing: StoredPublicForm | null,
    config: PublicFormConfig,
    previous: PublicFormConfig | null,
    enabled: boolean,
    typeId: string,
  ): Promise<StoredPublicForm> {
    if (!existing) return this.repo.createForm({ typeId, name: data.name ?? config.title, enabled, config });
    return this.repo.updateForm(existing.id, {
      ...(data.name === undefined ? {} : { name: data.name }),
      ...(data.enabled === undefined ? {} : { enabled }),
      ...(data.config === undefined ? {} : { config }),
      ...(consentChanged(previous, config) ? { consentVersion: existing.consentVersion + 1 } : {}),
    });
  }
}
