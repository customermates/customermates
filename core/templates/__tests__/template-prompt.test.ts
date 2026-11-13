import { describe, expect, it } from "vitest";

import { CAPABILITIES } from "@/core/capabilities/capabilities";
import { CLOUD_TRIAL, PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { ruleIsRoutine } from "@/core/templates/compile-template-automation";
import { renderTemplatePrompt, templateSignupUrl } from "@/core/templates/template-prompt";
import { fillPrompt, templatePromptText } from "@/core/templates/template-prompt-text";
import { templateCountry, templateRuleText } from "@/core/templates/template-rule-variants";
import { TEMPLATE_SLUGS } from "@/core/templates/template-registry";

import type { Capability } from "@/core/capabilities/capabilities";

import { cloneSpec, cloneText, getTemplate } from "./template-fixtures";

const ALL_SHIPPED = new Set<Capability>(CAPABILITIES);
const TRIAL_ROUTINES = PLAN_CATALOG[CLOUD_TRIAL.plan].entitlements.includedRoutinesPerUser;
if (typeof TRIAL_ROUTINES !== "number") throw new Error("The cloud trial plan has an unlimited routine allowance");

const OVER_THE_TRIAL = TEMPLATE_SLUGS.filter(
  (slug) => getTemplate(slug).followUpRules.filter(ruleIsRoutine).length > TRIAL_ROUTINES,
);

const FIRST_ROUTINES: Record<string, string[]> = {
  "client-intake": ["reply_to_enquiry", "chase_form", "chase_signature", "stalled_intake", "decline_letter"],
  "client-tracker": [
    "daily_next_step_sweep",
    "chase_waiting_client",
    "stalled_client_sweep",
    "weekly_client_review",
    "closed_client_dates",
  ],
  "founder-sales-pipeline": [
    "recap_reply",
    "discovery_proposal",
    "proposal_follow_up",
    "parked_revisit_date",
    "won_handover",
  ],
  "real-estate-pipeline": [
    "listing_key_dates",
    "buyer_key_dates",
    "weekly_owner_update",
    "listing_price_review",
    "buyer_re_engage",
  ],
  "sales-pipeline": [
    "qualify_new_opportunity",
    "follow_up_proposal",
    "stale_deal_sweep",
    "send_proposal",
    "book_discovery_call",
  ],
};

function routineLines(text: string): string[] {
  const section = text.split(/^## 8\. .*$/m)[1]?.split(/^## 9\. /m)[0] ?? "";
  return section.split("\n").filter((line) => /^\d+\. /.test(line));
}

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

  it("knows which templates propose more routines than the Pro trial allows, so each of them is ranked on purpose", () => {
    expect(OVER_THE_TRIAL).toEqual(Object.keys(FIRST_ROUTINES));
  });

  it.each(OVER_THE_TRIAL)("ranks every routine of %s once and keeps the rest of the rules unranked", (slug) => {
    const rules = getTemplate(slug).followUpRules;
    const routines = rules.filter(ruleIsRoutine);
    const ranks = routines.map((rule) => rule.priority);
    expect(ranks.every((rank) => rank !== undefined)).toBe(true);
    expect(new Set(ranks).size).toBe(routines.length);
    expect(rules.filter((rule) => !ruleIsRoutine(rule) && rule.priority !== undefined)).toEqual([]);
    expect(
      routines
        .toSorted((first, second) => (first.priority ?? 0) - (second.priority ?? 0))
        .slice(0, TRIAL_ROUTINES)
        .map((rule) => rule.key),
    ).toEqual(FIRST_ROUTINES[slug]);
  });

  it.each(OVER_THE_TRIAL)(
    "numbers the routines of %s most important first and marks those beyond the allowance in every locale",
    (slug) => {
      const spec = getTemplate(slug);
      const routines = spec.followUpRules.filter(ruleIsRoutine);
      for (const locale of Object.keys(spec.status)) {
        const copy = templatePromptText(locale);
        const text = cloneText(slug, locale);
        const lines = routineLines(prompt(slug, { shipped: ALL_SHIPPED, routineAllowance: TRIAL_ROUTINES }, locale));
        expect(lines, `${slug} ${locale}`).toHaveLength(routines.length);
        FIRST_ROUTINES[slug].forEach((key, position) => {
          const rule = spec.followUpRules.find((candidate) => candidate.key === key);
          const title = templateRuleText(text.rules[key], rule ?? routines[0], templateCountry(locale)).title;
          expect(lines[position], `${slug} ${locale} ${key}`).toContain(`${position + 1}. ${title}`);
          expect(lines[position]).not.toContain(copy.routineAllowance.optional);
        });
        for (const line of lines.slice(TRIAL_ROUTINES))
          expect(line, `${slug} ${locale}`).toContain(
            `${copy.availability.routine}, ${copy.routineAllowance.optional}]`,
          );
        expect(prompt(slug, { shipped: ALL_SHIPPED, routineAllowance: TRIAL_ROUTINES }, locale)).toContain(
          fillPrompt(copy.routineAllowance.limited, { count: TRIAL_ROUTINES }),
        );
      }
    },
  );

  it("tells the agent the allowance in the first sentence about routines and keeps rules and routines apart", () => {
    const text = prompt("client-tracker", { shipped: ALL_SHIPPED, routineAllowance: 5 });
    const section = text.split(/^## 8\. .*$/m)[1]?.split(/^## 9\. /m)[0] ?? "";
    expect(section.indexOf("routine allowance of your plan is 5 per user")).toBeLessThan(section.indexOf("\n1. "));
    expect(section).toMatch(/- Tell the owner that an Action is overdue: .*\[an automation rule\]/);
    expect(section).not.toMatch(/^- Check in: no open Action/m);
    expect(section).toMatch(
      /\n1\. Check in: no open Action on this client: .*\[an assistant routine that runs on a schedule\]/,
    );
    expect(section).toMatch(/\n5\. Set the close date and the data review date: .*schedule\]/);
    expect(section).toMatch(/\n6\. Review the data of this closed client: .*, optional\]/);
  });

  it("leaves the list as it was where the plan has no routine limit, none is known or the template fits", () => {
    const plain = prompt("client-tracker", { shipped: ALL_SHIPPED });
    for (const routineAllowance of ["unlimited", null, 7, 20] as const) {
      const text = prompt("client-tracker", { shipped: ALL_SHIPPED, routineAllowance });
      expect(text).toBe(plain);
      expect(routineLines(text)).toEqual([]);
    }
    expect(prompt("booking-page", { shipped: ALL_SHIPPED, routineAllowance: 5 })).toBe(
      prompt("booking-page", { shipped: ALL_SHIPPED }),
    );
  });

  it("lists every routine as optional where the plan includes none", () => {
    const text = prompt("client-tracker", { shipped: ALL_SHIPPED, routineAllowance: 0 });
    expect(text).toContain("Your plan includes no assistant routines");
    expect(routineLines(text)).toHaveLength(7);
    expect(routineLines(text).every((line) => line.includes(", optional]"))).toBe(true);
    const german = prompt("client-tracker", { shipped: ALL_SHIPPED, routineAllowance: 0 }, "de");
    expect(german).toContain(templatePromptText("de").routineAllowance.none);
  });

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
