import { describe, expect, it } from "vitest";

import { activeWorkspace, earliestOf, secondWeekWindow, type ActiveWorkspaceFacts } from "../workspace-activation";

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED = new Date("2026-11-01T10:00:00.000Z");
const day = (offset: number) => new Date(CREATED.getTime() + offset * DAY_MS);

const complete: ActiveWorkspaceFacts = {
  createdAt: CREATED,
  setupCompletedAt: day(0.1),
  agentConnectedAt: day(1),
  channelConnectedAt: null,
  changeInSecondWeekAt: day(9),
};

describe("secondWeekWindow", () => {
  it("spans days 8 to 14 after creation", () => {
    expect(secondWeekWindow(CREATED)).toEqual({ from: day(7), to: day(14) });
  });
});

describe("earliestOf", () => {
  it("ignores missing dates and returns null when there is none", () => {
    expect(earliestOf(null, day(3), day(1))).toEqual(day(1));
    expect(earliestOf(null, null)).toBeNull();
  });
});

describe("activeWorkspace", () => {
  it("is active when setup is done, an agent is connected and the workspace changed in the second week", () => {
    expect(activeWorkspace(complete, day(20))).toEqual({
      active: true,
      activeSince: day(9),
      notActiveBecause: null,
    });
  });

  it("accepts a connected channel instead of an agent", () => {
    expect(activeWorkspace({ ...complete, agentConnectedAt: null, channelConnectedAt: day(2) }, day(20))).toMatchObject(
      { active: true },
    );
  });

  it("dates the activation by the last of the three conditions that came true", () => {
    expect(activeWorkspace({ ...complete, setupCompletedAt: day(12) }, day(20))).toMatchObject({
      active: true,
      activeSince: day(12),
    });
    expect(activeWorkspace({ ...complete, agentConnectedAt: day(11) }, day(20))).toMatchObject({
      active: true,
      activeSince: day(11),
    });
  });

  it("uses the earlier of an agent and a channel connection", () => {
    expect(
      activeWorkspace({ ...complete, agentConnectedAt: day(11), channelConnectedAt: day(2) }, day(20)),
    ).toMatchObject({ active: true, activeSince: day(9) });
  });

  it("is not active before setup is completed, whatever else holds", () => {
    expect(activeWorkspace({ ...complete, setupCompletedAt: null }, day(20))).toEqual({
      active: false,
      activeSince: null,
      notActiveBecause: "setupNotCompleted",
    });
  });

  it("is not active without an agent or a channel", () => {
    expect(activeWorkspace({ ...complete, agentConnectedAt: null, channelConnectedAt: null }, day(20))).toEqual({
      active: false,
      activeSince: null,
      notActiveBecause: "noAgentOrChannelConnected",
    });
  });

  it("is not yet active while the second week has not begun", () => {
    expect(activeWorkspace({ ...complete, changeInSecondWeekAt: null }, day(6.9))).toEqual({
      active: false,
      activeSince: null,
      notActiveBecause: "secondWeekNotReached",
    });
  });

  it("is not active when nothing changed in the second week, during it or after it", () => {
    for (const now of [day(7), day(10), day(40)]) {
      expect(activeWorkspace({ ...complete, changeInSecondWeekAt: null }, now)).toEqual({
        active: false,
        activeSince: null,
        notActiveBecause: "noChangeInSecondWeek",
      });
    }
  });

  it("reports the first unmet condition when several are open", () => {
    expect(
      activeWorkspace(
        { ...complete, setupCompletedAt: null, agentConnectedAt: null, changeInSecondWeekAt: null },
        day(3),
      ),
    ).toMatchObject({ notActiveBecause: "setupNotCompleted" });
  });
});
