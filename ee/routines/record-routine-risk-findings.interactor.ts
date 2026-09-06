import type { RoutineRiskKind } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export type RoutineRiskFindingInput = {
  routineId: string;
  peerRoutineId: string | null;
  kind: RoutineRiskKind;
  triggerEvent: string;
  confidence: string;
};

export abstract class AnalyzeRoutineRepo {
  abstract findCompaniesWithEventRoutinesUnscoped(limit: number): Promise<string[]>;
}

export abstract class RecordRoutineRiskFindingsRepo {
  abstract replaceRoutineRiskFindingsUnscoped(args: {
    companyId: string;
    findings: RoutineRiskFindingInput[];
    now: Date;
  }): Promise<void>;
}

@SystemInteractor
export class RecordRoutineRiskFindingsInteractor {
  constructor(private repo: RecordRoutineRiskFindingsRepo) {}

  async invoke(args: { companyId: string; findings: RoutineRiskFindingInput[] }): Promise<void> {
    await this.repo.replaceRoutineRiskFindingsUnscoped({
      companyId: args.companyId,
      findings: args.findings,
      now: new Date(),
    });
  }
}
