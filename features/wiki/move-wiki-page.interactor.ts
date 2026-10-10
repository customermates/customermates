import type { MoveWikiPageRepo } from "./move-wiki-page.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const MoveWikiPageSchema = z.object({
  id: z.uuid(),
  targetId: z.uuid(),
  placement: z.enum(["before", "after"]),
});
export type MoveWikiPageData = Data<typeof MoveWikiPageSchema>;

@TenantInteractor({ resource: Resource.wiki, manage: "update" })
export class MoveWikiPageInteractor extends AuthenticatedInteractor<MoveWikiPageData, boolean> {
  constructor(private repo: MoveWikiPageRepo) {
    super();
  }

  @Write({ input: MoveWikiPageSchema, output: z.boolean() })
  async invoke(data: MoveWikiPageData): Validated<boolean> {
    const result = await this.repo.movePage(data);
    if (result === "not-found") return failNotFound(CustomErrorCode.wikiPageNotFound, ["id"]);
    if (result === "pinned") return fail(CustomErrorCode.wikiPagePinned, ["id"]);
    return { ok: true, data: true };
  }
}
