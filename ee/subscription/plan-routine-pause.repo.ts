export abstract class PlanRoutinePauseRepo {
  abstract pauseRoutinesForPlanCompanyWide(now: Date): Promise<number>;
  abstract resumeRoutinesForPlanCompanyWide(now: Date): Promise<number>;
}
