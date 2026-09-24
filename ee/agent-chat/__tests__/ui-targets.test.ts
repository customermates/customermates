import { describe, expect, it } from "vitest";
import { EntityType, Resource } from "@/generated/prisma";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, walkFiles } from "@/tests/conventions/walk";

import { CONTROL_PAGES, FORM_PAGES } from "../ui-anchors";
import {
  AGENT_UI_TARGETS,
  NavigationUiTargetIdSchema,
  UiTargetIdSchema,
  agentRouteVisible,
  agentUiPageLabelKey,
  findAgentNavigationTarget,
  findAgentUiTarget,
} from "../ui-targets";
import { WORKSPACE_SECTIONS } from "@/app/components/navigation/workspace-sections";

function componentSource(): string {
  return [
    ...walkFiles(join(REPO_ROOT, "app"), (path) => path.endsWith(".tsx")),
    ...walkFiles(join(REPO_ROOT, "components"), (path) => path.endsWith(".tsx")),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

const TERMINOLOGY_ID_TEMPLATE = "id={`terminology-${entityType}`}";

function rendersLiteralId(source: string, id: string) {
  return [`id="${id}"`, `inputId="${id}"`, `anchorId: "${id}"`].some((form) => source.includes(form));
}

function rendersTerminologyId(source: string, id: string) {
  const entityTypes: string[] = Object.values(EntityType);
  return (
    id.startsWith("terminology-") &&
    entityTypes.includes(id.slice("terminology-".length)) &&
    source.includes(TERMINOLOGY_ID_TEMPLATE)
  );
}

const controlTargetIds = CONTROL_PAGES.flatMap((page) =>
  page.controls.map((control) => `${page.scope}-${control.control}`),
);
const formTargetIds = FORM_PAGES.flatMap((page) => [`${page.scope}-save`, `${page.scope}-reset`]);

describe("agent interface targets", () => {
  it("registers every target id once", () => {
    const ids = AGENT_UI_TARGETS.map((target) => target.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it("offers the save and reset control of every form scope", () => {
    for (const id of formTargetIds) expect(findAgentUiTarget(id), id).not.toBeNull();
  });

  it("offers every declared page and dialog control", () => {
    for (const id of controlTargetIds) expect(findAgentUiTarget(id), id).not.toBeNull();
  });

  it("renders every form scope's save and reset ids through anchorScope", () => {
    const source = componentSource();
    for (const page of FORM_PAGES)
      expect(source, `anchorScope="${page.scope}" missing`).toContain(`anchorScope="${page.scope}"`);
  });

  it("renders every declared control id as a literal id in a component", () => {
    const source = componentSource();
    const missing = controlTargetIds.filter((id) => !rendersLiteralId(source, id) && !rendersTerminologyId(source, id));
    expect(missing, "control targets that no component renders").toEqual([]);
  });

  it("names a registered target on the same page or a named row or card as every prerequisite", () => {
    for (const target of AGENT_UI_TARGETS.filter((candidate) => candidate.prerequisite)) {
      const prerequisite = findAgentUiTarget(target.prerequisite ?? "");
      if (prerequisite && target.id.startsWith("nav-"))
        expect(prerequisite.id, `${target.id} sidebar group`).toBe(`nav-${target.route.split("/")[1]}`);
      else if (prerequisite) expect(prerequisite.route, `${target.id} prerequisite route`).toBe(target.route);
      else expect(target.prerequisite, `${target.id} prerequisite`).toMatch(/^an? [A-Za-z ]+ (?:row|card)$/);
    }
  });

  it("points every workspace sidebar entry at the group the user expands to reveal it", () => {
    for (const section of ["profile", "company"] as const) {
      expect(findAgentUiTarget(`nav-${section}`)?.prerequisite, section).toBeUndefined();
      for (const subroute of WORKSPACE_SECTIONS[section]) {
        expect(findAgentUiTarget(`nav-${section}-${subroute.slug}`)?.prerequisite, subroute.slug).toBe(
          `nav-${section}`,
        );
      }
    }
    expect(findAgentUiTarget("nav-contacts")?.prerequisite).toBeUndefined();
  });

  it("opens a page only when the sidebar would show it for the role and installation", () => {
    const reads =
      (...resources: Resource[]) =>
      (resource: Resource) =>
        resources.includes(resource);
    const everything = () => true;

    expect(agentRouteVisible("/company/webhooks", "cloud", reads(Resource.users))).toBe(false);
    expect(agentRouteVisible("/company/members", "cloud", reads(Resource.users))).toBe(true);
    expect(agentRouteVisible("/profile/api-keys", "cloud", reads(Resource.users))).toBe(false);
    expect(agentRouteVisible("/profile/settings", "cloud", reads())).toBe(true);
    expect(agentRouteVisible("/dashboard", "cloud", reads())).toBe(true);
    expect(agentRouteVisible("/deals/00000000-0000-4000-8000-000000000001", "cloud", reads(Resource.contacts))).toBe(
      false,
    );
    expect(agentRouteVisible("/contacts", "cloud", reads(Resource.contacts))).toBe(true);
    expect(agentRouteVisible("/inbox", "cloud", everything)).toBe(true);
    for (const path of ["/inbox", "/routines", "/profile/connected-accounts", "/company/subscription"])
      expect(agentRouteVisible(path, "self-hosted", everything), path).toBe(false);
    expect(agentRouteVisible("*", "cloud", reads())).toBe(true);
  });

  it("names every routable target's page with the label key the sidebar shows", () => {
    expect(agentUiPageLabelKey("/company/members")).toBe("NavigationBar.members");
    expect(agentUiPageLabelKey("/profile/api-keys")).toBe("ApiKeysCard.title");
    expect(agentUiPageLabelKey("/inbox")).toBe("NavigationBar.inbox");
    expect(agentUiPageLabelKey("/tasks")).toBe("EntityTerminology.presets.task.task.plural");
    expect(agentUiPageLabelKey("*")).toBeNull();
    for (const target of AGENT_UI_TARGETS.filter((candidate) => candidate.route.startsWith("/")))
      expect(agentUiPageLabelKey(target.route), target.id).not.toBeNull();
  });

  it("points dialog save and reset at what opens the dialog", () => {
    for (const page of FORM_PAGES) {
      const save = findAgentUiTarget(`${page.scope}-save`);
      const reset = findAgentUiTarget(`${page.scope}-reset`);
      expect(save?.route, page.scope).toBe(page.route);
      expect(reset?.route, page.scope).toBe(page.route);
      expect(save?.prerequisite, page.scope).toBe(page.opener);
      expect(reset?.prerequisite, page.scope).toBe(page.resetOpener ?? page.opener);
    }
    expect(findAgentUiTarget("role-modal-save")?.prerequisite).toBe("company-roles-add");
    expect(findAgentUiTarget("webhook-modal-reset")?.prerequisite).toBe("company-webhooks-add");
    for (const id of ["member-modal-save", "member-modal-reset"])
      expect(findAgentUiTarget(id)?.prerequisite, id).toBe("a member row");
    expect(findAgentUiTarget("widget-modal-save")?.prerequisite).toBe("widget-modal-kind");
    expect(findAgentUiTarget("widget-modal-kind")?.prerequisite).toBe("dashboard-add-widget");
    expect(findAgentUiTarget("widget-modal-reset")?.prerequisite).toBe("a widget card");
  });

  it("names the row or card that opens dialogs no target opens", () => {
    const expected: Record<string, string> = {
      "webhook-modal-delete": "a webhook row",
      "role-modal-delete": "a role row",
      "api-key-delete": "an API key card",
      "webhook-delivery-modal-resend": "a delivery row",
      "connected-account-tab-details": "a channel card",
      "connected-account-tab-email": "a channel card",
      "connected-account-tab-folders": "a channel card",
      "connected-account-visibility": "a channel card",
      "connected-account-resync": "a channel card",
      "connected-account-reactivate": "a channel card",
      "connected-account-disconnect": "a channel card",
    };
    for (const [id, opener] of Object.entries(expected)) expect(findAgentUiTarget(id)?.prerequisite, id).toBe(opener);
    expect(findAgentUiTarget("invite-modal-tab-email")?.prerequisite).toBe("company-members-add");
    expect(findAgentUiTarget("invite-modal-send")?.prerequisite).toBe("invite-modal-tab-email");
  });

  it("registers one data model select per entity type", () => {
    for (const entityType of Object.values(EntityType)) {
      const target = findAgentUiTarget(`terminology-${entityType}`);
      expect(target?.route, entityType).toBe("/company/settings");
      expect(target?.description, entityType).toContain("roles with company Manage");
    }
  });

  it("points dialog field targets at the control that opens their dialog or tab", () => {
    const prerequisiteOf = (id: string) => findAgentUiTarget(id)?.prerequisite;
    for (const id of ["invite-modal-tab-link", "invite-modal-link", "invite-modal-copy-link"])
      expect(prerequisiteOf(id), id).toBe("company-members-add");
    expect(prerequisiteOf("invite-modal-emails")).toBe("invite-modal-tab-email");
    for (const control of ["url", "description", "events", "secret", "headers", "body-template", "enabled"])
      expect(prerequisiteOf(`webhook-modal-${control}`), control).toBe("company-webhooks-add");
    expect(prerequisiteOf("api-key-option-standard")).toBe("profile-api-keys-generate");
    for (const id of ["api-key-name", "api-key-expires", "api-key-save"])
      expect(prerequisiteOf(id), id).toBe("api-key-option-standard");
    for (const id of ["connected-account-signature", "connected-account-email-save"])
      expect(prerequisiteOf(id), id).toBe("connected-account-tab-email");
    for (const control of ["email", "first-name", "last-name", "country", "role", "avatar-url", "status"])
      expect(prerequisiteOf(`member-modal-${control}`), control).toBe("a member row");
  });

  it("describes settings controls with the words users ask about", () => {
    const describes = (id: string, word: string) =>
      expect(findAgentUiTarget(id)?.description.toLowerCase(), id).toContain(word);
    describes("company-settings-currency", "currency");
    describes("company-settings-stage-weights", "probability");
    describes("company-subscription-manage", "lemon squeezy");
    describes("company-subscription-manage", "invoices");
    describes("profile-settings-display-language", "language");
    describes("invite-modal-send", "invitations");
    describes("webhook-delivery-modal-resend", "resend");
  });

  it("describes when a form's save button exists and who sees conditional controls", () => {
    expect(findAgentUiTarget("profile-settings-save")?.description).toContain("shown once something changed");
    expect(findAgentUiTarget("company-settings-save")?.description).toContain("enabled once something changed");
    expect(findAgentUiTarget("member-modal-save")?.description).toContain("roles with Manage");
    expect(findAgentUiTarget("role-modal-save")?.description).toContain("system role");
    expect(findAgentUiTarget("company-subscription-manage")?.description).toContain("Lemon Squeezy subscription");
    expect(findAgentUiTarget("company-subscription-manage")?.description).toContain("not on Enterprise");
    expect(findAgentUiTarget("company-subscription-refresh")?.description).toContain("not during the trial");
    expect(findAgentUiTarget("company-subscription-plan-picker")?.description).toContain(
      "no Lemon Squeezy subscription",
    );
    expect(findAgentUiTarget("company-subscription-plan-picker")?.description).toContain("not on Enterprise");
    expect(findAgentUiTarget("webhook-delivery-modal-resend")?.description).toContain("only on Delivered or Failed");
    expect(findAgentUiTarget("webhook-delivery-modal-resend")?.description).toContain("not Pending or Sending");
    for (const id of [
      "connected-account-resync",
      "connected-account-reactivate",
      "connected-account-disconnect",
      "connected-account-tab-email",
      "connected-account-visibility",
      "connected-account-signature",
    ])
      expect(findAgentUiTarget(id)?.description, id).toContain("you connected");
    expect(findAgentUiTarget("profile-settings-verify-email")?.description).toContain("unverified");
    expect(findAgentUiTarget("profile-api-keys-generate")?.description).toContain("API Manage");
    expect(findAgentUiTarget("connected-account-visibility")?.description).toContain("Business plan");
    expect(findAgentUiTarget("connected-account-tab-folders")?.description).toContain("accounts with folders");
    expect(findAgentUiTarget("role-modal-delete")?.description).toContain("not for the system role");
    expect(findAgentUiTarget("company-settings-total-pipeline")?.description).toContain("deal stage field");
  });

  it("lets navigate resolve only targets with an app route", () => {
    for (const target of AGENT_UI_TARGETS) {
      const routable = target.route.startsWith("/");
      expect(findAgentNavigationTarget(target.id) !== null, target.id).toBe(routable);
      expect(NavigationUiTargetIdSchema.safeParse(target.id).success, target.id).toBe(routable);
      expect(UiTargetIdSchema.safeParse(target.id).success, target.id).toBe(true);
    }
    for (const id of [...formTargetIds, ...controlTargetIds])
      expect(findAgentNavigationTarget(id)?.route, id).toMatch(/^\//);
    expect(findAgentNavigationTarget("nav-search")).toBeNull();
    expect(UiTargetIdSchema.safeParse("currency").success).toBe(false);
    expect(UiTargetIdSchema.safeParse("company-settings-currency-x").success).toBe(false);
  });
});
