import { describe, expect, it } from "vitest";

import type { WorkspaceMeasurementRow } from "../workspace-measurement";

import { workspaceAcquisition, workspaceActivation } from "../workspace-measurement";

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED = new Date("2026-11-01T10:00:00.000Z");
const day = (offset: number) => new Date(CREATED.getTime() + offset * DAY_MS);

function row(overrides: Partial<WorkspaceMeasurementRow> = {}): WorkspaceMeasurementRow {
  return {
    signupTemplate: null,
    signupLastPage: null,
    signupCampaign: null,
    teamSize: null,
    agentLastCallAt: null,
    funnelChannelSkippedAt: null,
    funnelInviteSentAt: null,
    funnelInviteAcceptedAt: null,
    funnelPaidAt: null,
    secondSeatAt: null,
    discoveryChoice: null,
    discoveryDetail: null,
    discoveryAnsweredAt: null,
    signupSource: null,
    agentFirstCallAt: null,
    funnelSetupCompletedAt: null,
    funnelAgentConnectedAt: null,
    funnelChannelConnectedAt: null,
    wizardCompletedAt: null,
    firstConnectedAccountAt: null,
    firstModelChangeAt: null,
    firstRecordCreatedAt: null,
    changeInSecondWeekAt: null,
    ...overrides,
  };
}

describe("workspaceAcquisition", () => {
  it("reports no answer for a workspace that was never asked and the choice null for a skipped one", () => {
    expect(workspaceAcquisition(row()).discovery).toBeNull();
    expect(workspaceAcquisition(row({ discoveryAnsweredAt: day(0) })).discovery).toEqual({
      choice: null,
      detail: null,
      answeredAt: day(0),
    });
  });

  it("carries the template, the last page and the consent-based source", () => {
    const signupSource = {
      job: "agent",
      landingPath: "/en/for/consultants",
      referrerHost: "www.google.com",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      marketingConsentedAt: day(0),
      capturedAt: day(0),
    };

    expect(
      workspaceAcquisition(
        row({
          signupTemplate: "client-tracker",
          signupLastPage: "/en/templates/client-tracker",
          discoveryChoice: "other",
          discoveryDetail: "newsletter",
          discoveryAnsweredAt: day(0),
          signupSource,
        }),
      ),
    ).toEqual({
      signupTemplate: "client-tracker",
      lastPageBeforeSignup: "/en/templates/client-tracker",
      campaign: null,
      teamSize: null,
      businessEmail: null,
      company: null,
      discovery: { choice: "other", detail: "newsletter", answeredAt: day(0) },
      consentedSource: signupSource,
    });
  });

  it("carries the campaign, the team size and whether the signup is a company", () => {
    const campaign = { source: "google", medium: "cpc", campaign: "de-company-k1", content: null, term: "crm outlook" };

    expect(
      workspaceAcquisition(row({ signupCampaign: campaign, teamSize: "small" }), "jane@acme.example"),
    ).toMatchObject({ campaign, teamSize: "small", businessEmail: true, company: true });
    expect(workspaceAcquisition(row({ teamSize: "small" }), "jane@gmail.com")).toMatchObject({
      businessEmail: false,
      company: false,
    });
    expect(workspaceAcquisition(row({ teamSize: "solo" }), "jane@acme.example").company).toBe(false);
    expect(workspaceAcquisition(row({ teamSize: "solo", secondSeatAt: day(2) }), "jane@acme.example").company).toBe(
      true,
    );
    expect(workspaceAcquisition(row({ signupCampaign: { source: "<bad>" }, teamSize: "huge" }))).toMatchObject({
      campaign: null,
      teamSize: null,
    });
  });
});

describe("workspaceActivation", () => {
  it("falls back to the first agent record write and to the first connected account for older workspaces", () => {
    const result = workspaceActivation({
      row: row({
        funnelAgentConnectedAt: day(3),
        funnelChannelConnectedAt: day(5),
        firstConnectedAccountAt: day(2),
      }),
      createdAt: CREATED,
      now: day(30),
    });

    expect(result.firstValue).toMatchObject({ agentFirstCallAt: day(3), firstChannelConnectedAt: day(2) });
  });

  it("prefers the recorded first call over the first agent record write", () => {
    const result = workspaceActivation({
      row: row({ agentFirstCallAt: day(1), funnelAgentConnectedAt: day(3) }),
      createdAt: CREATED,
      now: day(30),
    });

    expect(result.firstValue.agentFirstCallAt).toEqual(day(1));
  });

  it("counts the workspace setup or the owner's finished wizard as completed setup, whichever came first", () => {
    const base = { agentFirstCallAt: day(1), changeInSecondWeekAt: day(9) };

    expect(
      workspaceActivation({ row: row({ ...base, wizardCompletedAt: day(0.2) }), createdAt: CREATED, now: day(30) }),
    ).toMatchObject({ active: true, activeSince: day(9) });
    expect(
      workspaceActivation({
        row: row({ ...base, funnelSetupCompletedAt: day(0.3) }),
        createdAt: CREATED,
        now: day(30),
      }),
    ).toMatchObject({ active: true, activeSince: day(9) });
    expect(workspaceActivation({ row: row(base), createdAt: CREATED, now: day(30) })).toMatchObject({
      active: false,
      notActiveBecause: "setupNotCompleted",
    });
  });

  it("keeps the first-value events visible while the workspace is not active", () => {
    const result = workspaceActivation({
      row: row({ funnelSetupCompletedAt: day(0.5), firstModelChangeAt: day(0.6), firstRecordCreatedAt: day(1) }),
      createdAt: CREATED,
      now: day(2),
    });

    expect(result).toMatchObject({
      active: false,
      activeSince: null,
      notActiveBecause: "noAgentOrChannelConnected",
      firstValue: {
        setupCompletedAt: day(0.5),
        firstModelChangeAt: day(0.6),
        firstRecordCreatedAt: day(1),
        agentFirstCallAt: null,
      },
    });
  });
});
