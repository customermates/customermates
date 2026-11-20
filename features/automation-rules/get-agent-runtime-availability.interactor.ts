import type { Validated } from "@/core/validation/validation.utils";
import type { AgentRuntimeAvailability } from "./agent-runtime-availability";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { AgentRuntimeAvailabilitySchema, noAgentRuntimes } from "./agent-runtime-availability";

const NoInputSchema = z.object({}).strict();

export type AgentRuntimeAvailabilitySource = {
  availability(): Promise<AgentRuntimeAvailability>;
};

@AllowInDemoMode
@TenantInteractor()
export class GetAgentRuntimeAvailabilityInteractor extends AuthenticatedInteractor<
  z.infer<typeof NoInputSchema>,
  AgentRuntimeAvailability
> {
  constructor(private readonly source: AgentRuntimeAvailabilitySource | null = null) {
    super();
  }

  @Validate(NoInputSchema)
  @ValidateOutput(AgentRuntimeAvailabilitySchema)
  async invoke(_data: z.infer<typeof NoInputSchema>): Validated<AgentRuntimeAvailability> {
    return { ok: true as const, data: this.source ? await this.source.availability() : noAgentRuntimes() };
  }
}
