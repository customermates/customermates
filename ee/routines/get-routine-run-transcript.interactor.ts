import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AgentMessagePart } from "@/ee/agent-chat/agent-chat.schema";
import type { AgentMessageRole } from "@/generated/prisma";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

const Schema = z.object({ routineRunId: z.uuid() });

export type GetRoutineRunTranscriptData = Data<typeof Schema>;

export type RoutineTranscriptMessage = {
  id: string;
  role: AgentMessageRole;
  parts: AgentMessagePart[];
  createdAt: Date;
};

export abstract class GetRoutineRunTranscriptRepo {
  abstract getRoutineRunTranscript(routineRunId: string): Promise<RoutineTranscriptMessage[]>;
}

@TenantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetRoutineRunTranscriptInteractor extends AuthenticatedInteractor<
  GetRoutineRunTranscriptData,
  RoutineTranscriptMessage[]
> {
  constructor(private repo: GetRoutineRunTranscriptRepo) {
    super();
  }

  @Validate(Schema)
  async invoke(data: GetRoutineRunTranscriptData): Validated<RoutineTranscriptMessage[]> {
    return { ok: true as const, data: await this.repo.getRoutineRunTranscript(data.routineRunId) };
  }
}
