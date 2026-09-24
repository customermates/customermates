import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { WikiPageSchema, type WikiPageDto } from "./wiki.schema";

export const GetWikiPageSchema = z.object({ id: z.uuid() });
export type GetWikiPageData = Data<typeof GetWikiPageSchema>;

export abstract class GetWikiPageRepo {
  abstract getPage(id: string): Promise<WikiPageDto | null>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, action: Action.readAll })
export class GetWikiPageInteractor extends AuthenticatedInteractor<GetWikiPageData, WikiPageDto | null> {
  constructor(private repo: GetWikiPageRepo) {
    super();
  }

  @Validate(GetWikiPageSchema)
  @ValidateOutput(WikiPageSchema.nullable())
  async invoke(data: GetWikiPageData): Validated<WikiPageDto | null> {
    return { ok: true, data: await this.repo.getPage(data.id) };
  }
}
