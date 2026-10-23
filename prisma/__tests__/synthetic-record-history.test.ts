import { describe, expect, it } from "vitest";

import { solutionWorkspaceCreatedAt } from "../seeds/solutions/seed-solution";
import { solutionWorkspacePlan } from "../seeds/solutions/seed-solutions";
import {
  buildSolutionRecordData,
  SOLUTION_RECORD_EVENT_PREFIX,
  solutionColleagueId,
} from "../seeds/solutions/solution-data";
import { SOLUTION_WORKSPACES } from "../seeds/solutions/solution-workspaces";
import { TEAM_MEMBER_IDS } from "../seeds/team";
import { storyMoment } from "../seeds/timeline";

const histories = SOLUTION_WORKSPACES.map((workspace) => {
  const { content, model } = solutionWorkspacePlan(workspace);
  return { workspace, content, data: buildSolutionRecordData(workspace, content, model) };
});

describe("demo record history", () => {
  it("creates every record once and records its changes afterwards", () => {
    for (const { workspace, data } of histories) {
      const listed = data.records.filter((record) => record.typeKey !== "lineItem");
      const created = data.history.filter((entry) => entry.kind === "record.created");
      expect(created.map((entry) => `${entry.typeId}:${entry.recordId}`).sort(), workspace.slug).toEqual(
        listed.map((record) => `${record.typeId}:${record.id}`).sort(),
      );
      for (const entry of data.history.filter((candidate) => candidate.kind === "record.updated")) {
        const creation = created.find(
          (candidate) => candidate.recordId === entry.recordId && candidate.typeId === entry.typeId,
        );
        expect(creation, workspace.slug).toBeDefined();
        expect(entry.at.getTime()).toBeGreaterThan(creation?.at.getTime() ?? Number.POSITIVE_INFINITY);
        expect(entry.values.size).toBeGreaterThan(0);
      }
      expect(data.history.every((entry) => entry.id.startsWith(`${SOLUTION_RECORD_EVENT_PREFIX}-`))).toBe(true);
      expect(data.history.filter((entry) => entry.kind === "record.updated").length, workspace.slug).toBeGreaterThan(0);
    }
  });

  it("spreads the history over the story up to its end, after the workspace was created", () => {
    for (const { workspace, content, data } of histories) {
      const created = solutionWorkspaceCreatedAt(workspace, content).getTime();
      for (const entry of data.history) {
        expect(entry.at.getTime(), workspace.slug).toBeLessThanOrEqual(storyMoment(0).getTime());
        expect(entry.at.getTime(), workspace.slug).toBeGreaterThan(created);
      }
    }
  });

  it("attributes the team workspace's changes to its members and every other workspace to Max and its colleagues", () => {
    const members = new Set<string>(Object.values(TEAM_MEMBER_IDS));
    for (const { workspace, content, data } of histories) {
      const actors = new Set(data.history.map((entry) => entry.actorId));
      if (workspace.team) {
        expect([...actors].every((actor) => members.has(actor))).toBe(true);
        expect(actors.size).toBeGreaterThan(3);
      } else {
        const own = [
          workspace.memberId,
          ...(content.members ?? []).map(({ key }) => solutionColleagueId(workspace, key)),
        ];
        expect([...actors].toSorted(), workspace.slug).toEqual(own.toSorted());
      }
    }
  });
});
