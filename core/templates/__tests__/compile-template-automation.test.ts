import { describe, expect, it } from "vitest";

import { compileTemplate } from "@/core/templates/compile-template";
import { compileTemplateAutomation } from "@/core/templates/compile-template-automation";
import { TEMPLATE_SLUGS } from "@/core/templates/template-registry";

import { cloneSpec, cloneText } from "./template-fixtures";

function proposals(slug: Parameters<typeof cloneSpec>[0]) {
  const spec = cloneSpec(slug);
  const { extras } = compileTemplate(spec, cloneText(slug));
  return { rules: extras.rules, proposals: compileTemplateAutomation(spec, extras.rules) };
}

describe("compileTemplateAutomation", () => {
  it.each(TEMPLATE_SLUGS)("answers every rule of %s with a mapped rule or a reason", (slug) => {
    const { rules, proposals: mapped } = proposals(slug);
    expect(mapped.map((proposal) => proposal.key)).toEqual(rules.map((rule) => rule.key));
    for (const proposal of mapped) {
      if (proposal.supported) {
        expect(proposal.effects.length).toBeGreaterThan(0);
        expect(proposal.name.length).toBeGreaterThan(0);
      } else {
        expect(proposal.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("maps a stage change to a task on the tasks list linked to the changed list", () => {
    const { proposals: mapped } = proposals("client-support-desk");
    const survey = mapped.find((proposal) => proposal.key === "sendSurvey");
    expect(survey).toEqual({
      key: "sendSurvey",
      name: expect.any(String),
      supported: true,
      trigger: { kind: "fieldChanged", field: "tickets.status", to: "solved" },
      conditions: [],
      effects: [
        {
          kind: "createRecord",
          list: "actions",
          taskKind: "sendSurvey",
          title: expect.any(String),
          dueInDays: 1,
          assignToRuleOwner: false,
          assignedToRecordOwner: true,
          linkTo: "tickets",
        },
      ],
    });
  });

  it("maps a date offset before the date to days and a direction", () => {
    const { proposals: mapped } = proposals("booking-page");
    const reminder = mapped.find((proposal) => proposal.key === "firstReminder");
    expect(reminder?.supported && reminder.trigger).toEqual({
      kind: "dateReached",
      field: "appointments.startAt",
      days: 3,
      direction: "before",
    });
    expect(reminder?.supported && reminder.conditions).toEqual([
      { field: "appointments.status", operator: "in", values: ["confirmed"] },
    ]);
  });

  it("maps a notification to the lead or to the record owner", () => {
    const { proposals: mapped } = proposals("client-support-desk");
    const missed = mapped.find((proposal) => proposal.key === "firstResponseMissed");
    expect(missed?.supported && missed.effects).toEqual([
      { kind: "notify", recipients: { ruleOwner: true, assignees: false }, title: expect.any(String) },
    ]);
  });

  it("explains what the rules engine cannot do", () => {
    const reasons = Object.fromEntries(
      proposals("client-support-desk")
        .proposals.filter((proposal) => !proposal.supported)
        .map((proposal) => [proposal.key, proposal.supported ? "" : proposal.reason]),
    );
    expect(reasons.nudgeCustomer).toContain("stayed unchanged");
    expect(reasons.dataRequestClock).toContain("relative to today");
    expect(reasons.ticketFromWebhook).toContain("creates these records itself");
    expect(proposals("booking-page").proposals.find((proposal) => proposal.key === "confirmEvent")).toMatchObject({
      supported: false,
      reason: expect.stringContaining("calendar capability"),
    });
    expect(proposals("founder-sales-pipeline").proposals.find((proposal) => proposal.key === "recapReply")).toMatchObject(
      { supported: false, reason: expect.stringContaining("agent routine") },
    );
  });
});
