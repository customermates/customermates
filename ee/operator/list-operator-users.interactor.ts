import type { OperatorRepo } from "./operator.repo";
import type { OperatorUserPageDto } from "./operator.schema";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ListOperatorUsersSchema } from "./operator.schema";

@OperatorInteractor
export class ListOperatorUsersInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  async invoke(input: unknown = {}): Promise<OperatorUserPageDto> {
    const data = ListOperatorUsersSchema.parse(input);
    return this.repo.listUsersAuditedUnscoped(data);
  }
}
