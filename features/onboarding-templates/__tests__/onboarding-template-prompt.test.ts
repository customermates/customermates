import { describe, expect, it } from "vitest";

import { loadTemplateBundle } from "@/core/templates/template-bundle-loader";
import { TEMPLATE_SLUGS } from "@/core/templates/template-slugs";
import { templatePromptText } from "@/core/templates/template-prompt-text";
import { getTemplate, getTemplateText } from "@/core/templates/__tests__/template-fixtures";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { renderOnboardingTemplatePrompt } from "../onboarding-template-prompt";

const MCP_URL = "https://app.example.test/api/v1/mcp/w/6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f";
const BASE_URL = "https://app.example.test";

function render(
  slug: (typeof TEMPLATE_SLUGS)[number],
  locale: string,
  options: { deployment?: "cloud" | "self-hosted"; connected?: boolean } = {},
) {
  return renderOnboardingTemplatePrompt({
    spec: getTemplate(slug),
    text: getTemplateText(slug, locale),
    deployment: options.deployment ?? "cloud",
    baseUrl: BASE_URL,
    mcpUrl: MCP_URL,
    connected: options.connected ?? true,
  });
}

describe("the template prompt shown in onboarding", () => {
  it.each(TEMPLATE_SLUGS)("replaces how to get a workspace with this workspace for %s", async (slug) => {
    const bundle = await loadTemplateBundle(slug);
    expect(bundle).not.toBeNull();
    for (const deployment of ["cloud", "self-hosted"] as const) {
      for (const connected of [true, false]) {
        const prompt = render(slug, "en", { deployment, connected });

        expect(prompt).toContain("## 1. Your workspace");
        expect(prompt).toContain(MCP_URL);
        expect(prompt).not.toContain("Get a workspace");
        expect(prompt).not.toContain("?template=");
        expect(prompt).not.toContain("<your instance address>");
      }
    }
  });

  it("keeps the rules that make the prompt safe: read first, propose, no samples, send nothing", () => {
    const prompt = render("sales-pipeline", "en");

    expect(prompt).toContain("Call get_workspace_context");
    expect(prompt).toContain("wait for my approval before you change anything");
    expect(prompt).toContain("Create no sample, demo or placeholder records.");
    expect(prompt).toContain("Send nothing");
  });

  it("starts with the template name and its intro and keeps the order of the other sections", () => {
    const text = getTemplateText("sales-pipeline", "en");
    const prompt = render("sales-pipeline", "en");

    expect(prompt.startsWith(`# ${text.name}\n${text.prompt.intro}\n\n## 1. Your workspace\n`)).toBe(true);
    const headings = prompt.split("\n").filter((line) => /^## \d+\./.test(line));
    expect(headings[0]).toBe("## 1. Your workspace");
    expect(headings[1]).toBe("## 2. Before you write anything");
    expect(headings.at(-1)).toMatch(/^## 9\. Questions for me$/);
  });

  it.each(APP_LOCALES)(
    "tells a connected %s user their workspace exists and that the assistant is connected",
    (locale) => {
      const copy = templatePromptText(locale);
      const prompt = render("sales-pipeline", locale, { connected: true });

      expect(prompt).toContain(MCP_URL);
      expect(prompt).toContain(copy.workspace.connectedAt.replace("{mcpUrl}", MCP_URL));
      expect(prompt).not.toContain(copy.workspace.existsAt.replace("{mcpUrl}", MCP_URL));
      expect(prompt).not.toContain("## 1. Get a workspace");
      expect(prompt).not.toContain("?template=");
      expect(prompt).not.toContain("<your instance address>");
      expect(prompt.split("\n").filter((line) => /^## 1\./.test(line))).toHaveLength(1);
    },
  );

  it.each(APP_LOCALES)(
    "does not tell a %s user who chose to connect later that the assistant is connected",
    (locale) => {
      const copy = templatePromptText(locale);
      const prompt = render("sales-pipeline", locale, { connected: false });

      expect(prompt).toContain(copy.workspace.existsAt.replace("{mcpUrl}", MCP_URL));
      expect(prompt).not.toContain(copy.workspace.connectedAt.replace("{mcpUrl}", MCP_URL));
      expect(prompt).not.toContain(copy.workspace.connected);
      expect(prompt).not.toContain("## 1. Get a workspace");
      expect(prompt).not.toContain("?template=");
      expect(prompt.split("\n").filter((line) => /^## 1\./.test(line))).toHaveLength(1);
    },
  );

  it("writes the prompt in the locale's wording for the names and questions", () => {
    const prompt = render("sales-pipeline", "de");

    expect(prompt).toContain(getTemplateText("sales-pipeline", "de").name);
    expect(prompt).toContain(getTemplateText("sales-pipeline", "de").prompt.questions[0]);
  });
});
