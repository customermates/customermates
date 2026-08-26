import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";
import type { P13nEntry } from "./prisma-p13n.repository";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { P13nEntrySchema } from "./p13n.schema";

const Schema = z.object({ p13nId: z.string().min(1) });

export type GetP13nData = Data<typeof Schema>;

export abstract class GetP13nRepo {
  abstract getP13n(p13nId: string): Promise<P13nEntry | undefined>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetP13nInteractor extends AuthenticatedInteractor<GetP13nData, P13nEntry | undefined> {
  constructor(private repo: GetP13nRepo) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(P13nEntrySchema)
  async invoke({ p13nId }: GetP13nData): Promise<{ ok: true; data: P13nEntry | undefined }> {
    return { ok: true as const, data: await this.repo.getP13n(p13nId) };
  }
}
