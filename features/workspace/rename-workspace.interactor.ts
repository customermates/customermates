import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RenameWorkspaceRepo } from "./rename-workspace.repo";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { WorkspaceNameSchema } from "./workspace.schema";

const Schema = z.object({ name: WorkspaceNameSchema });
export type RenameWorkspaceData = Data<typeof Schema>;

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class RenameWorkspaceInteractor extends AuthenticatedInteractor<RenameWorkspaceData, RenameWorkspaceData> {
  constructor(private readonly repo: RenameWorkspaceRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(Schema)
  async invoke(data: RenameWorkspaceData): Validated<RenameWorkspaceData> {
    await this.repo.renameCompany(data.name);

    return { ok: true as const, data };
  }
}
