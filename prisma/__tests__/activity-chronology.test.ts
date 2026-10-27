import { describe, expect, it } from "vitest";

import { solutionWorkspacePlan } from "../seeds/solutions/seed-solutions";
import { buildSolutionRecordData } from "../seeds/solutions/solution-data";
import { SOLUTION_WORKSPACES, TEAM_SOLUTION_WORKSPACE } from "../seeds/solutions/solution-workspaces";
import { SYNTHETIC_SEED_TIMELINE, SYNTHETIC_TIMELINE_SHIFT_MS } from "../seeds/timeline";

const DAY = 24 * 60 * 60 * 1_000;

describe("synthetic activity chronology", () => {
  it("spreads the team workspace's history-backed timestamps over more than a year", () => {
    const { content, model } = solutionWorkspacePlan(TEAM_SOLUTION_WORKSPACE);
    const data = buildSolutionRecordData(TEAM_SOLUTION_WORKSPACE, content, model);
    const dates = [
      SYNTHETIC_SEED_TIMELINE.company.createdAt,
      SYNTHETIC_SEED_TIMELINE.systemRole.createdAt,
      ...data.history.map(({ at }) => at),
      SYNTHETIC_SEED_TIMELINE.webhook.updatedAt,
    ];
    const earliest = Math.min(...dates.map((date) => date.getTime()));
    const latest = Math.max(...dates.map((date) => date.getTime()));
    const authored = (moment: number) => new Date(moment - SYNTHETIC_TIMELINE_SHIFT_MS).toISOString();

    expect(authored(earliest)).toBe("2025-01-02T08:00:00.000Z");
    expect(authored(latest)).toBe("2026-08-04T14:00:00.000Z");
    expect((latest - earliest) / DAY).toBeGreaterThanOrEqual(540);
  });

  it("keeps the newest fixture inside the current week so rolling date buckets stay populated", () => {
    const newest = SYNTHETIC_SEED_TIMELINE.webhook.updatedAt.getTime();

    expect(newest).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - newest).toBeLessThan(7 * DAY);
  });

  it("gives every demo workspace recent conversations, from minutes ago to days ago", () => {
    for (const workspace of SOLUTION_WORKSPACES) {
      const threads = solutionWorkspacePlan(workspace).content.messaging?.threads ?? [];
      const offsets = threads.map(({ latestMinutesAgo }) => latestMinutesAgo);

      expect(threads.length, workspace.slug).toBeGreaterThanOrEqual(3);
      expect(Math.min(...offsets), workspace.slug).toBeLessThan(24 * 60);
      expect(new Set(offsets).size, workspace.slug).toBe(offsets.length);
    }
  });
});
