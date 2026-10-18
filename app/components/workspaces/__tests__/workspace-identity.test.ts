import { describe, expect, it } from "vitest";

import { workspaceAvatarHue, workspaceAvatarStyle, workspaceDisplayName } from "../workspace-identity";
import { workspacePlanChip } from "../workspace-plan-chip";

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${Object.values(values).join(",")}` : key;

describe("workspace identity", () => {
  it("colors a workspace avatar the same way on every render", () => {
    const companyIds = Array.from(
      { length: 24 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const hues = companyIds.map(workspaceAvatarHue);

    expect(companyIds.map(workspaceAvatarHue)).toEqual(hues);
    expect(new Set(hues).size).toBeGreaterThan(1);
    expect(workspaceAvatarStyle(companyIds[0])).toEqual({
      backgroundColor: `var(--chart-${hues[0]}-3)`,
      color: `var(--chart-${hues[0]}-text)`,
    });
  });

  it("falls back to the localized name for an unnamed workspace", () => {
    expect(workspaceDisplayName("  Taxes  ", "Workspace")).toBe("Taxes");
    expect(workspaceDisplayName(null, "Workspace")).toBe("Workspace");
    expect(workspaceDisplayName("   ", "Workspace")).toBe("Workspace");
  });
});

describe("workspacePlanChip", () => {
  const now = new Date("2026-10-14T12:00:00.000Z").getTime();

  it("shows no plan for a workspace that never had a trial and has no subscription yet", () => {
    expect(workspacePlanChip({ status: "expired", plan: "pro", trialEndDate: null }, t, now)).toEqual({
      label: "Workspaces.noPlan",
      variant: "warning",
    });
  });

  it("keeps the regular plan chip for running trials, paid plans and expired trials", () => {
    expect(
      workspacePlanChip({ status: "trial", plan: "pro", trialEndDate: new Date("2026-10-16T12:00:00.000Z") }, t, now),
    ).toEqual({
      label: "Subscription.planStatusLabel:Subscription.planNames.pro,Subscription.status.trialDaysLeft:2",
      variant: "warning",
    });
    expect(workspacePlanChip({ status: "active", plan: "business", trialEndDate: null }, t, now)).toEqual({
      label: "Subscription.planNames.business",
      variant: "success",
    });
    expect(
      workspacePlanChip({ status: "expired", plan: "pro", trialEndDate: new Date("2026-10-01T00:00:00.000Z") }, t, now),
    ).toEqual({
      label: "Subscription.planStatusLabel:Subscription.planNames.pro,Subscription.status.expired",
      variant: "destructive",
    });
    expect(workspacePlanChip(null, t, now)).toBeNull();
  });
});
