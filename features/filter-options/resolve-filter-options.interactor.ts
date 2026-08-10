import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { TaskType } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { FILTER_OPTION_BATCH_SIZE } from "./filter-option-batches";

export const FILTER_OPTION_SOURCES = ["user", "contact", "organization", "deal", "service", "task"] as const;

export const ResolveFilterOptionsSchema = z.object({
  source: z.enum(FILTER_OPTION_SOURCES),
  ids: z.array(z.uuid()).max(FILTER_OPTION_BATCH_SIZE),
});

export const ResolvedFilterOptionSchema = z.object({
  key: z.uuid(),
  label: z.string(),
  avatarUrl: z.string().nullable().optional(),
  taskType: z.enum(TaskType).optional(),
});

export type ResolveFilterOptionsData = Data<typeof ResolveFilterOptionsSchema>;
export type ResolvedFilterOption = Data<typeof ResolvedFilterOptionSchema>;

export abstract class ResolveFilterOptionsRepo {
  abstract resolve(data: ResolveFilterOptionsData): Promise<ResolvedFilterOption[]>;
}

@AllowInDemoMode
@TenantInteractor()
export class ResolveFilterOptionsInteractor extends AuthenticatedInteractor<
  ResolveFilterOptionsData,
  ResolvedFilterOption[]
> {
  constructor(private readonly repo: ResolveFilterOptionsRepo) {
    super();
  }

  @Validate(ResolveFilterOptionsSchema)
  @ValidateOutput(ResolvedFilterOptionSchema)
  async invoke(data: ResolveFilterOptionsData): Validated<ResolvedFilterOption[]> {
    return { ok: true as const, data: await this.repo.resolve(data) };
  }
}
