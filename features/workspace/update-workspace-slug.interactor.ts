import type { Data, Validated } from "@/core/validation/validation.utils";
import type { UpdateWorkspaceSlugRepo } from "./update-workspace-slug.repo";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { WorkspaceSlugSchema } from "./workspace-slug";

const Schema = z.object({ slug: WorkspaceSlugSchema });
export type UpdateWorkspaceSlugData = Data<typeof Schema>;

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class UpdateWorkspaceSlugInteractor extends AuthenticatedInteractor<
  UpdateWorkspaceSlugData,
  UpdateWorkspaceSlugData
> {
  constructor(private readonly repo: UpdateWorkspaceSlugRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(Schema)
  async invoke(data: UpdateWorkspaceSlugData): Validated<UpdateWorkspaceSlugData> {
    if ((await this.repo.updateCompanySlug(data.slug)) === "taken")
      return failConflict(CustomErrorCode.workspaceSlugTaken, ["slug"]);

    return { ok: true as const, data };
  }
}
