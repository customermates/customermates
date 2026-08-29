import type { OperatorAccessService } from "./operator-access.service";

export class GetOperatorConsoleVisibilityInteractor {
  constructor(private readonly access: OperatorAccessService) {}

  async invoke(): Promise<boolean> {
    return this.access.isEligible();
  }
}
