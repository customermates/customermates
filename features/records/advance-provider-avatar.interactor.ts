import type { ProviderAvatarService } from "./provider-avatar.service";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const AdvanceProviderAvatarSchema = z
  .object({ companyId: z.uuid(), operationId: z.uuid(), outcome: z.enum(["advance", "fail"]) })
  .strict();
type AdvanceProviderAvatarData = z.infer<typeof AdvanceProviderAvatarSchema>;

@SystemInteractor
export class AdvanceProviderAvatarInteractor {
  constructor(private avatars: (companyId: string) => ProviderAvatarService) {}

  @Enforce(AdvanceProviderAvatarSchema)
  async invoke(input: AdvanceProviderAvatarData): Promise<{ done: boolean }> {
    const service = this.avatars(input.companyId);
    if (input.outcome === "advance") return service.advance(input.operationId);
    await service.fail(input.operationId);
    return { done: true };
  }
}
