import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { AnalyzeRoutineRepo } from "./record-routine-risk-findings.interactor";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const ANALYSIS_COMPANY_LIMIT = 500;

@SystemInteractor
export class AnalyzeCompanyRoutinesInteractor {
  constructor(
    private repo: AnalyzeRoutineRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {}

  async invoke(args?: { companyId?: string }): Promise<{ analyzing: number }> {
    const companyIds = args?.companyId
      ? [args.companyId]
      : await this.repo.findCompaniesWithEventRoutinesUnscoped(ANALYSIS_COMPANY_LIMIT);

    for (const companyId of companyIds)
      await this.backgroundTaskService.dispatch("analyze-routine-loops", { companyId });

    return { analyzing: companyIds.length };
  }
}
