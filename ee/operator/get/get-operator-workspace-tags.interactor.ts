import type { OperatorRepo } from "../operator.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const WorkspaceTagSchema = z.string();

@OperatorInteractor
export class GetOperatorWorkspaceTagsInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @ValidateOutput(WorkspaceTagSchema)
  async invoke(): Validated<string[]> {
    return { ok: true, data: await this.repo.listWorkspaceTagsUnscoped() };
  }
}
