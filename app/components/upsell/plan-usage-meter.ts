export const PLAN_USAGE_WARNING_SHARE = 0.8;

export type PlanUsageLevel = "ok" | "approaching" | "reached";

export function planUsageLevel(used: number, limit: number): PlanUsageLevel {
  if (limit <= 0 || used >= limit) return "reached";
  return used >= limit * PLAN_USAGE_WARNING_SHARE ? "approaching" : "ok";
}

export function planUsagePercent(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}
