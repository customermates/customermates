export abstract class PlanRulePauseRepo {
  abstract syncRulesToPlanLimitCompanyWide(limit: number | null): Promise<{ paused: number; resumed: number }>;
}
