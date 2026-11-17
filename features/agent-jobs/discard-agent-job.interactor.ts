import { z } from "zod";

import type { AgentJobRepo } from "./agent-job.repo";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const Schema = z
  .object({ jobId: z.uuid(), companyId: z.uuid(), reason: z.enum(["ownerInactive", "ownerMissing"]) })
  .strict();
type DiscardAgentJobInput = z.infer<typeof Schema>;

@SystemInteractor
export class DiscardAgentJobInteractor {
  constructor(
    private readonly repo: Pick<AgentJobRepo, "discardQueuedUnscoped">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  @Enforce(Schema)
  async invoke(input: DiscardAgentJobInput): Promise<{ discarded: boolean }> {
    return {
      discarded: await this.repo.discardQueuedUnscoped({
        id: input.jobId,
        companyId: input.companyId,
        error: input.reason,
        now: this.clock(),
      }),
    };
  }
}
