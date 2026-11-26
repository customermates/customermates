import { describe, expect, it } from "vitest";

import { templateDeployment } from "@/core/templates/template-deployment";
import { listOfferedTemplates } from "@/core/templates/template-registry";

import { agentStartGuide, agentStartUrl } from "../agent-start-guide";

const BASE = "https://customermates.com/";

describe("agent start guide", () => {
  it("serves the guide at /start.md without a doubled slash", () => {
    expect(agentStartUrl(BASE)).toBe("https://customermates.com/start.md");
  });

  it("goes from connecting and signing up to choosing the workspace, a template, then the inbox", () => {
    const guide = agentStartGuide(BASE, "en", []);
    const order = [
      "## 1. Connect and sign up",
      "## 2. Choose the workspace",
      "## 3. Pick a template",
      "## 4. Connect the inbox",
    ];
    const positions = order.map((heading) => guide.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(guide).toContain("`https://customermates.com/api/v1/mcp`");
    expect(guide).not.toContain("/api/v1/mcp/w/");
    expect(guide).toContain("`setup-from-template` with its slug and the `workspace` argument");
    expect(guide).toContain("AI CRM for small teams");
  });

  it("lists workspaces before anything is created and never sets one up twice", () => {
    const guide = agentStartGuide(BASE, "en", []);
    expect(guide.indexOf("Call `list_workspaces` first")).toBeLessThan(guide.indexOf("call `create_workspace`"));
    expect(guide).toContain("never set it up a second time");
    expect(guide).toContain("Never create a second workspace when an existing one fits");
    expect(guide).toContain("the team size");
  });

  it("lists every offered template with its slug, name, summary and page", () => {
    const templates = listOfferedTemplates({ locale: "en", deployment: templateDeployment() });
    const guide = agentStartGuide(BASE, "en", templates);
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      expect(guide).toContain(
        `- \`${template.slug}\`: ${template.name}. ${template.summary} https://customermates.com/en/templates/${template.slug}`,
      );
    }
  });

  it("points to the template gallery when no template is offered", () => {
    expect(agentStartGuide(BASE, "de", [])).toContain("Templates: https://customermates.com/de/templates");
  });

  it("sends plan questions to the pricing page and keeps upgrades honest and rare", () => {
    const guide = agentStartGuide(BASE, "en", []);
    expect(guide).toContain("https://customermates.com/en/pricing");
    expect(guide).toContain("say which plan includes it, give them `choosePlanUrl` and carry on");
    expect(guide).toContain("`trialDaysLeft`");
    expect(guide).toContain("`keepsItRunning`");
    expect(guide).toContain("mention it once, in one sentence");
    expect(guide).toContain("Never invent prices, discounts or features, never repeat an offer your user declined");
  });
});
