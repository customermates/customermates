import type { OperatorRepo } from "./operator.repo";
import type { OperatorAuditPageDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ListOperatorAuditEventsSchema } from "./operator.schema";

@OperatorInteractor
export class ListOperatorAuditEventsInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown = {}): Promise<OperatorAuditPageDto> {
    const data = ListOperatorAuditEventsSchema.parse(input);
    return this.repo.listAuditEventsAuditedUnscoped(data);
  }
}
