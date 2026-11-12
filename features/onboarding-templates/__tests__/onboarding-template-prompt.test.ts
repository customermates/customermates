import { describe, expect, it } from "vitest";

import { loadTemplateBundle } from "@/core/templates/template-bundle-loader";
import { TEMPLATE_SLUGS } from "@/core/templates/template-slugs";
import { getTemplate, getTemplateText } from "@/core/templates/template-registry";

import { renderOnboardingTemplatePrompt } from "../onboarding-template-prompt";

const MCP_URL = "https://app.example.test/api/v1/mcp/w/6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f";
const BASE_URL = "https://app.example.test";

describe("the template prompt shown in onboarding", () => {
  it.each(TEMPLATE_SLUGS)("replaces how to get a workspace with this workspace for %s", async (slug) => {
    const bundle = await loadTemplateBundle(slug);
    expect(bundle).not.toBeNull();
    for (const deployment of ["cloud", "self-hosted"] as const) {
      const prompt = renderOnboardingTemplatePrompt({
        spec: getTemplate(slug),
        text: getTemplateText(slug, "en"),
        deployment,
        baseUrl: BASE_URL,
        mcpUrl: MCP_URL,
      });

      expect(prompt).toContain("## 1. Your workspace");
      expect(prompt).toContain(MCP_URL);
      expect(prompt).not.toContain("Get a workspace");
      expect(prompt).not.toContain("?template=");
      expect(prompt).not.toContain("<your instance address>");
    }
  });

  it("keeps the rules that make the prompt safe: read first, propose, no samples, send nothing", () => {
    const prompt = renderOnboardingTemplatePrompt({
      spec: getTemplate("sales-pipeline"),
      text: getTemplateText("sales-pipeline", "en"),
      deployment: "cloud",
      baseUrl: BASE_URL,
      mcpUrl: MCP_URL,
    });

    expect(prompt).toContain("Call get_workspace_context");
    expect(prompt).toContain("wait for my approval before you change anything");
    expect(prompt).toContain("Create no sample, demo or placeholder records.");
    expect(prompt).toContain("Send nothing");
  });

  it("starts with the template name and its intro and keeps the order of the other sections", () => {
    const text = getTemplateText("sales-pipeline", "en");
    const prompt = renderOnboardingTemplatePrompt({
      spec: getTemplate("sales-pipeline"),
      text,
      deployment: "cloud",
      baseUrl: BASE_URL,
      mcpUrl: MCP_URL,
    });

    expect(prompt.startsWith(`# ${text.name}\n${text.prompt.intro}\n\n## 1. Your workspace\n`)).toBe(true);
    const headings = prompt.split("\n").filter((line) => /^## \d+\./.test(line));
    expect(headings[0]).toBe("## 1. Your workspace");
    expect(headings[1]).toBe("## 2. Before you write anything");
    expect(headings.at(-1)).toMatch(/^## 9\. Questions for me$/);
  });

  it("writes the prompt in the locale's wording for the names and questions", () => {
    const prompt = renderOnboardingTemplatePrompt({
      spec: getTemplate("sales-pipeline"),
      text: getTemplateText("sales-pipeline", "de"),
      deployment: "cloud",
      baseUrl: BASE_URL,
      mcpUrl: MCP_URL,
    });

    expect(prompt).toContain(getTemplateText("sales-pipeline", "de").name);
    expect(prompt).toContain(getTemplateText("sales-pipeline", "de").prompt.questions[0]);
  });
});
