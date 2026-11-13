import { describe, expect, it } from "vitest";

import { renderTemplatePrompt, templateSignupUrl } from "@/core/templates/template-prompt";
import { templatePromptText } from "@/core/templates/template-prompt-text";
import { TEMPLATE_SLUGS } from "@/core/templates/template-registry";

import type { Capability } from "@/core/capabilities/capabilities";

import { cloneSpec, cloneText, getTemplate } from "./template-fixtures";

const SIGNUP = "https://customermates.com/signup";
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

function prompt(
  slug: (typeof TEMPLATE_SLUGS)[number],
  options: Partial<Parameters<typeof renderTemplatePrompt>[2]> = {},
  locale = "en",
) {
  return renderTemplatePrompt(cloneSpec(slug), cloneText(slug, locale), {
    deployment: "cloud",
    signupUrl: SIGNUP,
    ...options,
  });
}

describe("renderTemplatePrompt", () => {
  it("starts with the template and how to get a cloud workspace", () => {
    const text = prompt("client-tracker");
    expect(text.startsWith("# Client tracker\n")).toBe(true);
    expect(text).toContain("https://customermates.com/signup?template=client-tracker");
    expect(text.indexOf("## 1. Get a workspace")).toBeLessThan(text.indexOf("## 2. Before you write anything"));
  });

  it("tells a self-hoster to connect their own instance and does not mention the signup", () => {
    const text = prompt("client-tracker", { deployment: "self-hosted" });
    expect(text).toContain("<your instance address>/api/v1/mcp");
    expect(text).not.toContain("signup");
  });

  it("skips the signup for an assistant that is already connected to the workspace", () => {
    const text = prompt("client-tracker", { connected: true });
    expect(text).toContain("## 1. This workspace");
    expect(text).toContain("already connected");
    expect(text).not.toContain("signup");
    expect(text).not.toContain("Get a workspace");
    expect(text).toContain("## 2. Before you write anything");
  });

  it("reads the workspace first, proposes before writing, creates no samples and sends nothing", () => {
    const text = prompt("sales-pipeline");
    expect(text).toContain("Call get_workspace_context");
    expect(text).toContain("wait for my approval before you change anything");
    expect(text).toContain("Create no sample, demo or placeholder records.");
    expect(text).toContain("Send nothing: no emails, messages, invitations or posts.");
  });

  it("names every list, stage, widget and question of the template", () => {
    const text = prompt("sales-pipeline");
    for (const word of [
      "Opportunities",
      "Proposal sent",
      "Weighted value",
      "Open opportunities by stage",
      "Sales stages and exit criteria",
    ])
      expect(text).toContain(word);
    expect(text).toContain("1. What do you sell, and how many people sell it?");
  });

  it("uses the native names of the locale", () => {
    const text = prompt("real-estate-pipeline", {}, "de");
    expect(text).toContain("Maklerauftrag unterschrieben");
    expect(text).toContain("Fristen und Termine");
  });

  it("names the contact details of the contacts, which an inquiry form needs for the sender's email", () => {
    const text = prompt("client-tracker");
    const line = text.split("\n").find((entry) => entry.startsWith("- Contacts ("));
    expect(line).toContain("Contact details (contact channels: email, phone and social profiles)");
    expect(line?.indexOf("Contact details")).toBeLessThan(line?.indexOf("Job title") ?? -1);
    expect(prompt("client-tracker", {}, "de")).toContain("Kontaktdaten (Kontaktkanäle: E-Mail, Telefon");
  });

  it.each(TEMPLATE_SLUGS)(
    "lists the fields the product adds to the people, deals and offerings lists of %s in every locale",
    (slug) => {
      const spec = getTemplate(slug);
      const filledByForms = new Set(
        spec.followUpRules.flatMap((rule) =>
          (rule.trigger.kind === "form_submitted" || rule.trigger.kind === "webhook_received") &&
          rule.action.kind === "create_records"
            ? rule.action.lists
            : [],
        ),
      );
      for (const locale of Object.keys(spec.status)) {
        const text = cloneText(slug, locale);
        const copy = templatePromptText(locale);
        const lines = prompt(slug, {}, locale).split("\n");
        const anchors = {
          people: copy.anchorFields.channels,
          deals: copy.anchorFields.value,
          offerings: copy.anchorFields.price,
        };
        for (const list of spec.lists) {
          if (!list.role || !(list.role in anchors)) continue;
          const label = text.lists[list.key];
          const prefix = `- ${label.pluralLabel}${label.description ? ` (${label.description})` : ""}: `;
          const line = lines.find((entry) => entry.startsWith(prefix));
          const expected = anchors[list.role as keyof typeof anchors];
          expect(line, `${slug} ${locale} ${list.key}`).toContain(`${expected} (`);
          if (list.role === "people" && filledByForms.has(list.key))
            expect(line, `${slug} ${locale} ${list.key} receives the sender of a form`).toContain(
              `${copy.anchorFields.channels} (${copy.fieldTypes.channels})`,
            );
        }
      }
    },
  );

  it("marks the default view and tells the agent to set it up on the built-in view", () => {
    const text = prompt("client-tracker");
    expect(text).toContain("- All clients (table, default view)");
    expect(text).toContain("- Clients by status (board, grouped by Status)");
    expect(text).toContain("set it up there instead of creating a second view");
    expect(prompt("client-tracker", {}, "de")).toContain("(Tabelle, Standardansicht)");
  });

  it("marks rules by whether their capability has shipped", () => {
    const none = prompt("client-tracker", { shipped: new Set<Capability>() });
    expect(none).toContain("[not available yet, do not set up]");
    expect(none).toContain("[an assistant routine that runs on a schedule]");
    expect(none).not.toContain("[an automation rule]");
    const shipped = new Set<Capability>(["forms", "rules", "notifications"]);
    const all = prompt("client-tracker", { shipped });
    expect(all).toContain("[an automation rule]");
    expect(all).not.toContain("[not available yet, do not set up]");
  });

  it("does not offer a rule as a rule when the rules engine cannot run it", () => {
    const shipped = new Set<Capability>(["forms", "rules", "notifications", "calendarWrite", "incomingWebhooks"]);
    const text = prompt("real-estate-pipeline", { shipped });
    expect(text).toMatch(/Send the owner update: .*\[an assistant routine that runs on a schedule\]/);
    expect(text).toMatch(/Add the key date to the agent's calendar: .*\[not available yet, do not set up\]/);
    expect(text).toMatch(/Contact the new lead today: .*\[an automation rule\]/);
    expect(text).toMatch(/Create the key dates from the contract: .*\[an assistant routine that runs on a schedule\]/);
    const inquiry = prompt("client-tracker", { shipped });
    expect(inquiry).toMatch(/Create the client and the contact from an inquiry: .*\[an automation rule\]/);
  });

  it.each(TEMPLATE_SLUGS)("contains no dash characters for %s", (slug) => {
    for (const locale of Object.keys(getTemplate(slug).status))
      expect(DASHES.test(prompt(slug, {}, locale))).toBe(false);
  });

  it("builds the signup address with the template and keeps other query values", () => {
    expect(templateSignupUrl("https://example.test/signup?ref=a", "client-tracker")).toBe(
      "https://example.test/signup?ref=a&template=client-tracker",
    );
    expect(() => templateSignupUrl("/signup", "client-tracker")).toThrow();
  });
});
